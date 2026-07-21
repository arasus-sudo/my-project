"""YouTube — real OAuth (reuses the Google Cloud project already used for
Calendar), but publishing is honestly capped by a real platform limitation.

IMPORTANT PLATFORM CAVEAT (verified, not a gap in this implementation):
YouTube Data API v3 has **no endpoint that creates a Community-tab post**
(text/image/poll). Google has never shipped one — the API only covers videos,
playlists, captions, channels, etc. Every "post to YouTube" automation tool on
the market either (a) actually uploads a video, or (b) doesn't really automate
Community posts at all. Since the bulk-import pipeline generates a static
image/caption per row, not a video, there is nothing this client can call to
truly auto-publish that content to YouTube today.

So `publish()` always returns a clearly-labelled simulated result — this is
not gated behind YOUTUBE_MOCKED the way LinkedIn/Instagram are, because no
amount of real credentials changes the outcome for this content type. If
Google ever ships a Community Posts API, this is the one function to update;
until then social_eq.py surfaces `real_publish_supported: False` for YouTube
so the UI can say so plainly instead of implying a fake success is real.

OAuth itself IS real (useful today for channel stats / future video-upload
work), gated on the same GOOGLE_CLIENT_ID/SECRET already used by
google_calendar_client.py, with its own redirect URI.
"""

import os
import logging
from typing import Any, Dict

log = logging.getLogger(__name__)

GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
YOUTUBE_REDIRECT_URI = os.environ.get("YOUTUBE_REDIRECT_URI", "")
YOUTUBE_MOCKED = not (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)

SCOPES = ["https://www.googleapis.com/auth/youtube.readonly"]

REAL_PUBLISH_SUPPORTED = False  # see module docstring — not a config toggle


def status() -> Dict[str, Any]:
    return {"mocked": YOUTUBE_MOCKED, "real_publish_supported": REAL_PUBLISH_SUPPORTED}


def auth_url(state: str) -> str:
    if YOUTUBE_MOCKED:
        return ""
    from urllib.parse import urlencode
    return "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode({
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": YOUTUBE_REDIRECT_URI,
        "response_type": "code",
        "access_type": "offline",
        "prompt": "consent",
        "scope": " ".join(SCOPES),
        "state": state,
    })


async def exchange_code(code: str) -> Dict[str, Any]:
    import httpx
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post("https://oauth2.googleapis.com/token", data={
            "grant_type": "authorization_code", "code": code,
            "redirect_uri": YOUTUBE_REDIRECT_URI,
            "client_id": GOOGLE_CLIENT_ID, "client_secret": GOOGLE_CLIENT_SECRET,
        })
        r.raise_for_status()
        d = r.json()
    return {"access_token": d["access_token"], "refresh_token": d.get("refresh_token")}


async def publish(integration: Dict[str, Any], text: str, image_url: str = "") -> Dict[str, Any]:
    """No real endpoint exists for this (see module docstring) — always
    simulated, clearly labelled as such regardless of connection state."""
    import hashlib
    seed = hashlib.sha1(f"{integration.get('id','')}{text}".encode()).hexdigest()[:8]
    return {
        "platform_post_id": f"simulated-yt-{seed}",
        "url": "",
        "simulated": True,
        "reason": "YouTube Data API has no public endpoint for Community-tab posts; "
                  "this cannot be truly auto-published today.",
    }
