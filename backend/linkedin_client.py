"""LinkedIn — real OAuth (OIDC) + Posts API, mocked-first.

Mirrors hubspot_client.py's shape exactly: module-level client id/secret from
env, a static LINKEDIN_MOCKED gate, auth_url()/exchange_code() for the OAuth
dance, and tokens encrypted at rest with the shared Fernet helper. The one
LinkedIn-specific wrinkle: posting requires the member's own URN
(urn:li:person:{sub}), which LinkedIn's OIDC userinfo endpoint hands back
during the same exchange — so `exchange_code` returns it alongside the tokens
and `social_eq.py` stores it on the integration doc.

Publishing follows the current LinkedIn REST API (not the deprecated
ugcPosts): images go through /rest/images (initializeUpload -> PUT raw bytes
-> get back an image URN), then the post itself references that URN via
/rest/posts. Text-only posts skip the image step entirely.
"""

import os
import logging
from typing import Any, Dict, Optional

import httpx

from google_calendar_client import encrypt_token, decrypt_token  # shared Fernet

log = logging.getLogger(__name__)

LINKEDIN_CLIENT_ID = os.environ.get("LINKEDIN_CLIENT_ID", "")
LINKEDIN_CLIENT_SECRET = os.environ.get("LINKEDIN_CLIENT_SECRET", "")
LINKEDIN_REDIRECT_URI = os.environ.get("LINKEDIN_REDIRECT_URI", "")
LINKEDIN_MOCKED = not (LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET)

AUTH = "https://www.linkedin.com/oauth/v2/authorization"
TOKEN = "https://www.linkedin.com/oauth/v2/accessToken"
API_BASE = "https://api.linkedin.com"
API_VERSION = "202606"  # LinkedIn-Version header; Posts API is version-pinned (202505 was sunset → 426)
SCOPES = "openid profile w_member_social"


def status() -> Dict[str, Any]:
    return {"mocked": LINKEDIN_MOCKED}


# ----------------------------- OAuth (OIDC) ------------------------------------
def auth_url(state: str) -> str:
    if LINKEDIN_MOCKED:
        return ""
    from urllib.parse import urlencode
    return f"{AUTH}?" + urlencode({
        "response_type": "code",
        "client_id": LINKEDIN_CLIENT_ID,
        "redirect_uri": LINKEDIN_REDIRECT_URI,
        "scope": SCOPES,
        "state": state,
    })


async def exchange_code(code: str) -> Dict[str, Any]:
    """Exchanges the auth code for tokens, then immediately calls the OIDC
    userinfo endpoint to get the member's `sub` — that's the id half of the
    author URN every post/image call needs, so we resolve it once here rather
    than on every publish."""
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post(TOKEN, data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": LINKEDIN_REDIRECT_URI,
            "client_id": LINKEDIN_CLIENT_ID,
            "client_secret": LINKEDIN_CLIENT_SECRET,
        }, headers={"Content-Type": "application/x-www-form-urlencoded"})
        r.raise_for_status()
        d = r.json()
        access_token = d["access_token"]

        u = await c.get("https://api.linkedin.com/v2/userinfo",
                        headers={"Authorization": f"Bearer {access_token}"})
        u.raise_for_status()
        member = u.json()

    return {
        "access_token": access_token,
        "refresh_token": d.get("refresh_token"),
        "expires_in": d.get("expires_in"),
        "member_id": member.get("sub"),
        "member_name": member.get("name") or member.get("given_name"),
    }


async def _access_token(integration: Dict[str, Any]) -> str:
    """LinkedIn access tokens last ~60 days; this app doesn't force a refresh
    mid-flow — if it's expired the publish call fails with a clear 401 and the
    user reconnects, same as every other short-token integration here."""
    return decrypt_token(integration.get("access_token_enc"))


def _author_urn(integration: Dict[str, Any]) -> str:
    return f"urn:li:person:{integration['member_id']}"


# ----------------------------- Publishing --------------------------------------
async def _upload_image(integration: Dict[str, Any], image_bytes: bytes) -> str:
    """POST /rest/images?action=initializeUpload, PUT the raw bytes to the
    returned uploadUrl, return the image URN to reference in the post body."""
    token = await _access_token(integration)
    headers = {
        "Authorization": f"Bearer {token}",
        "LinkedIn-Version": API_VERSION,
        "X-Restli-Protocol-Version": "2.0.0",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=30) as c:
        init = await c.post(
            f"{API_BASE}/rest/images?action=initializeUpload",
            headers=headers,
            json={"initializeUploadRequest": {"owner": _author_urn(integration)}},
        )
        init.raise_for_status()
        value = init.json()["value"]
        upload_url, image_urn = value["uploadUrl"], value["image"]

        put = await c.put(upload_url, headers={"Authorization": f"Bearer {token}"},
                          content=image_bytes)
        put.raise_for_status()
    return image_urn


async def publish(integration: Dict[str, Any], text: str,
                  image_bytes: Optional[bytes] = None) -> Dict[str, Any]:
    """Publish one post. Raises on failure — social_eq.py's caller decides how
    to surface that (it does not retry or silently swallow a failed publish)."""
    token = await _access_token(integration)
    author = _author_urn(integration)

    body: Dict[str, Any] = {
        "author": author,
        "commentary": text,
        "visibility": "PUBLIC",
        "distribution": {
            "feedDistribution": "MAIN_FEED",
            "targetEntities": [],
            "thirdPartyDistributionChannels": [],
        },
        "lifecycleState": "PUBLISHED",
        "isReshareDisabledByAuthor": False,
    }
    media_omitted = False
    if image_bytes:
        try:
            image_urn = await _upload_image(integration, image_bytes)
            body["content"] = {"media": {"id": image_urn}}
        except Exception as ex:
            # Image upload is the most fragile step (426 from /rest/images on
            # some apps/accounts). Don't strand the post — publish text-only
            # and tell the caller media was omitted.
            log.warning("image upload failed for post (%s); publishing text-only", ex)
            media_omitted = True

    headers = {
        "Authorization": f"Bearer {token}",
        "LinkedIn-Version": API_VERSION,
        "X-Restli-Protocol-Version": "2.0.0",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(f"{API_BASE}/rest/posts", headers=headers, json=body)
        r.raise_for_status()
        # LinkedIn returns the new post's URN in the x-restli-id response header,
        # not the JSON body (POST /rest/posts responds 201 with an empty body).
        post_urn = r.headers.get("x-restli-id", "")

    url = f"https://www.linkedin.com/feed/update/{post_urn}" if post_urn else ""
    return {"platform_post_id": post_urn, "url": url, "media_omitted": media_omitted}


# ----------------------------- Documents (PDF carousels) ----------------------
async def publish_document(integration: Dict[str, Any], text: str, document_bytes: bytes,
                           title: str = "deck.pdf") -> Dict[str, Any]:
    """Publish a PDF as a native LinkedIn document post — the format LinkedIn
    renders as a swipeable carousel in the feed (one page per card).

    Flow (Documents API): POST /rest/documents?action=initializeUpload to get an
    uploadUrl + document URN, PUT the raw bytes, then poll the document until
    `status == AVAILABLE` (LinkedIn rasterizes each page into preview images —
    posting before READY yields a document with no pages), then reference the
    URN in the same /rest/posts share payload as images use.

    Raises on failure; the caller (social_eq.py) decides how to surface it.
    """
    token = await _access_token(integration)
    headers = {
        "Authorization": f"Bearer {token}",
        "LinkedIn-Version": API_VERSION,
        "X-Restli-Protocol-Version": "2.0.0",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=30) as c:
        init = await c.post(
            f"{API_BASE}/rest/documents?action=initializeUpload",
            headers=headers,
            json={"initializeUploadRequest": {"owner": _author_urn(integration)}},
        )
        init.raise_for_status()
        value = init.json()["value"]
        upload_url, document_urn = value["uploadUrl"], value["document"]

        put = await c.put(upload_url, headers={"Authorization": f"Bearer {token}"},
                          content=document_bytes)
        put.raise_for_status()

        # Poll until LinkedIn has finished rasterizing the document's pages.
        # Documents process quickly for small PDFs but can take several seconds;
        # this mirrors the "wait until AVAILABLE" requirement in the API docs.
        import asyncio
        for _ in range(30):
            await asyncio.sleep(1)
            check = await c.get(f"{API_BASE}/rest/documents/{document_urn}", headers=headers)
            check.raise_for_status()
            if (check.json().get("status") or "") == "AVAILABLE":
                break
        else:
            raise RuntimeError("LinkedIn document processing did not reach AVAILABLE in time")

        post_body: Dict[str, Any] = {
            "author": _author_urn(integration),
            "commentary": text,
            "visibility": "PUBLIC",
            "distribution": {
                "feedDistribution": "MAIN_FEED",
                "targetEntities": [],
                "thirdPartyDistributionChannels": [],
            },
            "content": {"media": {"title": title, "id": document_urn}},
            "lifecycleState": "PUBLISHED",
            "isReshareDisabledByAuthor": False,
        }
        r = await c.post(f"{API_BASE}/rest/posts", headers=headers, json=post_body)
        r.raise_for_status()
        post_urn = r.headers.get("x-restli-id", "")

    url = f"https://www.linkedin.com/feed/update/{post_urn}" if post_urn else ""
    return {"platform_post_id": post_urn, "url": url, "media_omitted": False}


# ----------------------------- Comments (socialActions) -------------------------
async def list_comments(integration: Dict[str, Any], platform_post_id: str) -> list:
    """GET /rest/socialActions/{shareUrn}/comments — platform_post_id is the
    full urn returned by publish(), not just its numeric tail."""
    token = await _access_token(integration)
    headers = {"Authorization": f"Bearer {token}", "LinkedIn-Version": API_VERSION,
              "X-Restli-Protocol-Version": "2.0.0"}
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get(f"{API_BASE}/rest/socialActions/{platform_post_id}/comments", headers=headers)
        r.raise_for_status()
        elements = r.json().get("elements", [])
    out = []
    for e in elements:
        text = ((e.get("message") or {}).get("text")) or ""
        out.append({
            "id": e.get("$URN") or e.get("commentUrn") or "",
            "text": text,
            "author": e.get("actor", ""),
            "at": e.get("created", {}).get("time"),
        })
    return out


async def create_comment(integration: Dict[str, Any], platform_post_id: str, text: str,
                         parent_comment_urn: Optional[str] = None) -> Dict[str, Any]:
    """POST /rest/socialActions/{shareUrn}/comments — first-comment scheduling
    calls this with no parent (top-level comment); engagement-inbox replies
    pass `parent_comment_urn` so the reply threads under the specific comment
    instead of posting a new top-level one."""
    token = await _access_token(integration)
    headers = {"Authorization": f"Bearer {token}", "LinkedIn-Version": API_VERSION,
              "X-Restli-Protocol-Version": "2.0.0", "Content-Type": "application/json"}
    body: Dict[str, Any] = {"actor": _author_urn(integration), "message": {"text": text}}
    if parent_comment_urn:
        body["parentComment"] = parent_comment_urn
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.post(f"{API_BASE}/rest/socialActions/{platform_post_id}/comments",
                         headers=headers, json=body)
        r.raise_for_status()
        comment_urn = r.headers.get("x-restli-id", "")
    return {"comment_id": comment_urn}
