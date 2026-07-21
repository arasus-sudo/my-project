"""Instagram (Meta Graph API) — real Content Publishing flow, mocked-first.

Same shape as hubspot_client.py/linkedin_client.py. Meta's Graph API uses a
two-step "container" flow rather than a single upload call:
  1. POST /{ig-user-id}/media with {image_url, caption} -> creation_id
  2. poll GET /{creation_id}?fields=status_code until FINISHED
  3. POST /{ig-user-id}/media_publish with {creation_id} -> published media id

Critically, `image_url` must be a URL Meta's servers can fetch themselves —
Instagram has no raw-bytes upload endpoint like LinkedIn's. That's why
social_eq.py's bulk-import pipeline serves generated images from its own
`/social-eq/media/{post_id}/{filename}` static route instead of only ever
embedding base64 data URIs.
"""

import os
import asyncio
import logging
from typing import Any, Dict, Optional

import httpx

log = logging.getLogger(__name__)

META_APP_ID = os.environ.get("META_APP_ID", "")
META_APP_SECRET = os.environ.get("META_APP_SECRET", "")
META_REDIRECT_URI = os.environ.get("META_REDIRECT_URI", "")
INSTAGRAM_MOCKED = not (META_APP_ID and META_APP_SECRET)

AUTH = "https://www.facebook.com/v19.0/dialog/oauth"
TOKEN = "https://graph.facebook.com/v19.0/oauth/access_token"
GRAPH = "https://graph.facebook.com/v19.0"
SCOPES = "instagram_basic,instagram_content_publish,instagram_manage_comments,instagram_manage_insights,pages_show_list"


def status() -> Dict[str, Any]:
    return {"mocked": INSTAGRAM_MOCKED}


# ----------------------------- OAuth --------------------------------------------
def auth_url(state: str) -> str:
    if INSTAGRAM_MOCKED:
        return ""
    from urllib.parse import urlencode
    return f"{AUTH}?" + urlencode({
        "client_id": META_APP_ID,
        "redirect_uri": META_REDIRECT_URI,
        "scope": SCOPES,
        "state": state,
        "response_type": "code",
    })


async def exchange_code(code: str) -> Dict[str, Any]:
    """Exchanges the code for a user token, then resolves the Instagram
    Business Account id behind the user's Facebook Page — that's the id every
    publish call addresses (`/{ig-user-id}/media`), not the app or user id."""
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get(TOKEN, params={
            "client_id": META_APP_ID, "client_secret": META_APP_SECRET,
            "redirect_uri": META_REDIRECT_URI, "code": code,
        })
        r.raise_for_status()
        user_token = r.json()["access_token"]

        pages = await c.get(f"{GRAPH}/me/accounts", params={"access_token": user_token})
        pages.raise_for_status()
        page = (pages.json().get("data") or [{}])[0]
        page_id, page_token = page.get("id"), page.get("access_token", user_token)

        ig = await c.get(f"{GRAPH}/{page_id}", params={
            "fields": "instagram_business_account", "access_token": page_token,
        })
        ig.raise_for_status()
        ig_account = (ig.json().get("instagram_business_account") or {}).get("id")

    return {"access_token": page_token, "ig_user_id": ig_account, "page_id": page_id}


# ----------------------------- Publishing ---------------------------------------
async def publish(integration: Dict[str, Any], caption: str, image_url: str) -> Dict[str, Any]:
    """image_url must already be publicly reachable (see module docstring)."""
    from google_calendar_client import decrypt_token
    token = decrypt_token(integration.get("access_token_enc"))
    ig_user_id = integration["ig_user_id"]

    async with httpx.AsyncClient(timeout=30) as c:
        create = await c.post(f"{GRAPH}/{ig_user_id}/media", data={
            "image_url": image_url, "caption": caption, "access_token": token,
        })
        create.raise_for_status()
        creation_id = create.json()["id"]

        # Meta processes the container async; poll status_code before publishing.
        for _ in range(10):
            poll = await c.get(f"{GRAPH}/{creation_id}", params={
                "fields": "status_code", "access_token": token,
            })
            poll.raise_for_status()
            code = poll.json().get("status_code")
            if code == "FINISHED":
                break
            if code == "ERROR":
                raise RuntimeError("Instagram container processing failed")
            await asyncio.sleep(1.5)

        pub = await c.post(f"{GRAPH}/{ig_user_id}/media_publish", data={
            "creation_id": creation_id, "access_token": token,
        })
        pub.raise_for_status()
        media_id = pub.json()["id"]

    return {"platform_post_id": media_id, "url": f"https://www.instagram.com/p/{media_id}/"}


# ----------------------------- Comments + insights -------------------------------
async def list_comments(integration: Dict[str, Any], platform_post_id: str) -> list:
    """GET /{ig-media-id}/comments"""
    from google_calendar_client import decrypt_token
    token = decrypt_token(integration.get("access_token_enc"))
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get(f"{GRAPH}/{platform_post_id}/comments", params={
            "fields": "id,text,username,timestamp", "access_token": token,
        })
        r.raise_for_status()
        data = r.json().get("data", [])
    return [{"id": c["id"], "text": c.get("text", ""), "author": c.get("username", ""),
            "at": c.get("timestamp")} for c in data]


async def create_comment(integration: Dict[str, Any], platform_post_id: str, text: str) -> Dict[str, Any]:
    """POST /{ig-media-id}/comments — used for first-comment scheduling.
    (Replying to a specific existing comment instead uses
    POST /{ig-comment-id}/replies — see reply_to_comment.)"""
    from google_calendar_client import decrypt_token
    token = decrypt_token(integration.get("access_token_enc"))
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.post(f"{GRAPH}/{platform_post_id}/comments", data={
            "message": text, "access_token": token,
        })
        r.raise_for_status()
        comment_id = r.json().get("id", "")
    return {"comment_id": comment_id}


async def reply_to_comment(integration: Dict[str, Any], comment_id: str, text: str) -> Dict[str, Any]:
    """POST /{ig-comment-id}/replies — engagement-inbox replies address the
    comment directly rather than the media object."""
    from google_calendar_client import decrypt_token
    token = decrypt_token(integration.get("access_token_enc"))
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.post(f"{GRAPH}/{comment_id}/replies", data={
            "message": text, "access_token": token,
        })
        r.raise_for_status()
        reply_id = r.json().get("id", "")
    return {"comment_id": reply_id}


async def get_insights(integration: Dict[str, Any], platform_post_id: str) -> Dict[str, int]:
    """GET /{media-id}/insights — needs instagram_manage_insights scope."""
    from google_calendar_client import decrypt_token
    token = decrypt_token(integration.get("access_token_enc"))
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get(f"{GRAPH}/{platform_post_id}/insights", params={
            "metric": "likes,comments,shares,views", "access_token": token,
        })
        r.raise_for_status()
        data = r.json().get("data", [])
    values = {d["name"]: (d.get("values", [{}])[-1].get("value", 0)) for d in data}
    return {"likes": values.get("likes", 0), "comments": values.get("comments", 0),
            "shares": values.get("shares", 0), "views": values.get("views", 0)}
