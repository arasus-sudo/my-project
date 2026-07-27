"""Veo video generation client — Social EQ's deferred v2 content type,
now built on Google Veo (`veo-3.1-fast-generate-preview`).

Follows the `google-genai` SDK pattern `server.py`'s `generate_ai_image()`
already uses for its Gemini "Nano Banana" image branch (`genai.Client` +
`client.aio.models.*` async calls) — NOT `voice_google_provider.py`'s older
raw-REST-via-aiohttp style, which is a different, separate Google
integration in this repo used only for Cloud Speech STT/TTS.

Async job + poll, not a same-request round trip: Veo generation takes
minutes, so `submit_video_job()` returns immediately with an operation name
to persist (the post doc's `video_operation_name`); `run_video_poll_tick()`
in social_eq.py reconstructs a pollable operation reference from that bare
stored name string on a later scheduler tick (confirmed: `google-genai`'s
`operations.get()` only reads `operation.name` off whatever object it's
given, so `types.GenerateVideosOperation(name=stored_name)` is a valid stub
to poll with, even across a process restart) and calls `poll_video_job()`.

No fabricated placeholder video in "mocked" mode: unlike the OAuth/publish
integrations in this app (LinkedIn/Instagram/YouTube/Twilio), which mock a
believable instant response when credentials are absent, every actual
AI-generation call in this codebase (`generate_ai_image` included) already
requires its real API key and raises a clear error without one — there is
no precedent here for synthesizing fake generated media, and doing so for
video specifically would mean hand-rolling an H.264/MP4 encoder with no
video codec library available. VEO_MOCKED therefore follows the same
convention `generate_ai_image` already uses for a missing `GEMINI_API_KEY`:
a clear, actionable error instead of silently faking output.
"""

import asyncio
import logging
import os
from typing import Any, Dict, Optional

from google import genai
from google.genai import types as genai_types

log = logging.getLogger(__name__)

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
VEO_MOCKED = not bool(GEMINI_API_KEY)
VEO_MODEL = "veo-3.1-fast-generate-preview"  # Fast tier only in v1 — cost control, Standard is a future toggle


def _client() -> genai.Client:
    return genai.Client(api_key=GEMINI_API_KEY)


async def submit_video_job(prompt: str, duration_seconds: int = 6, aspect_ratio: str = "9:16") -> str:
    """Kicks off a Veo generation job and returns its operation name to
    persist — the actual video isn't ready for minutes, this call only
    submits the job."""
    if VEO_MOCKED:
        raise RuntimeError("GEMINI_API_KEY not configured — video generation is unavailable")
    client = _client()
    operation = await client.aio.models.generate_videos(
        model=VEO_MODEL,
        prompt=prompt,
        config=genai_types.GenerateVideosConfig(
            aspect_ratio=aspect_ratio,
            resolution="720p",
            duration_seconds=duration_seconds,
        ),
    )
    if not operation.name:
        raise RuntimeError("Veo did not return an operation name")
    return operation.name


async def poll_video_job(operation_name: str) -> Dict[str, Any]:
    """Reconstructs a pollable operation reference from a bare stored name
    string and checks status. Returns
    {"done": bool, "video_bytes": bytes|None, "mime_type": str|None, "error": str|None}."""
    if VEO_MOCKED:
        return {"done": False, "video_bytes": None, "mime_type": None, "error": "GEMINI_API_KEY not configured"}

    client = _client()
    stub = genai_types.GenerateVideosOperation(name=operation_name)
    try:
        operation = await client.aio.operations.get(stub)
    except Exception as ex:
        log.warning("veo poll failed for operation %s: %s", operation_name, ex)
        return {"done": False, "video_bytes": None, "mime_type": None, "error": str(ex)}

    if not operation.done:
        return {"done": False, "video_bytes": None, "mime_type": None, "error": None}

    if operation.error:
        return {"done": True, "video_bytes": None, "mime_type": None, "error": str(operation.error)}

    generated = (operation.response.generated_videos if operation.response else None) or []
    if not generated:
        return {"done": True, "video_bytes": None, "mime_type": None, "error": "Veo returned no video"}

    video = generated[0].video
    try:
        video_bytes = video.video_bytes or await asyncio.to_thread(client.files.download, file=video)
    except Exception as ex:
        log.warning("veo video download failed for operation %s: %s", operation_name, ex)
        return {"done": True, "video_bytes": None, "mime_type": None, "error": f"download failed: {ex}"}

    return {"done": True, "video_bytes": video_bytes, "mime_type": video.mime_type or "video/mp4", "error": None}
