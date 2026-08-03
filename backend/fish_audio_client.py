"""Fish Audio TTS client for Voice EQ.

Third TTS engine alongside Google Cloud TTS, used by the SAME cascaded pipeline
(`voice_google_provider.py`): Twilio μ-law → STT → Claude → TTS → Twilio. Only
the synthesis hop differs, so the `twilio_fish` provider reuses that module's
TwiML routes, media-stream relay, and post-call pipeline unchanged.

Two things make Fish worth a separate engine rather than another Google voice:

  * Voice cloning — an agent can speak in a voice the workspace supplied,
    referenced by `reference_id`.
  * Word-level expression — emotion and emphasis are inline markers in the
    text ("This is [emphasis] really important."), not request parameters.
    Because Claude writes the agent's words in this pipeline, Claude can emit
    those markers itself; see FISH_EXPRESSION_PROMPT. Google TTS has no
    equivalent that survives our plain-text (non-SSML) request shape, so the
    markers MUST be stripped for any other engine — strip_expression_markers()
    exists for exactly that, or Google reads "open bracket emphasis" on air.

Audio: Fish emits raw PCM at a requested sample rate, and 8 kHz is supported
natively — the rate Twilio media streams use. That means no resampling; the
only conversion is linear PCM16 → μ-law, which is what Twilio wants on the
wire.
"""

import base64
import logging
import os
import re
from typing import Any, Dict, List, Optional, Sequence, Tuple

import httpx

log = logging.getLogger(__name__)

# audioop is stdlib through 3.12, deprecated since 3.11, and REMOVED in 3.13.
# The deployed runtime is 3.11 (see .github/workflows/azure-deploy.yml), so the
# stdlib import is the live path; the fallback keeps a 3.13 upgrade from turning
# into garbled call audio. Deliberately not hand-rolling a μ-law encoder — a
# subtly wrong one produces audio that sounds broken rather than failing loudly.
try:  # pragma: no cover - import shape depends on interpreter version
    import audioop
except ModuleNotFoundError:  # pragma: no cover
    try:
        import audioop_lts as audioop  # type: ignore[no-redef]
    except ModuleNotFoundError:
        audioop = None  # type: ignore[assignment]

FISH_API_KEY = os.environ.get("FISH_AUDIO_API_KEY", "")
FISH_MOCKED = not bool(FISH_API_KEY)

_FISH_TTS_URL = "https://api.fish.audio/v1/tts"
_FISH_MODEL_URL = "https://api.fish.audio/model"

# s2.1-pro is the current production model and takes the [square bracket]
# open-domain marker syntax. s1 is the legacy model and uses a fixed tag set in
# (parentheses) instead — FISH_EXPRESSION_PROMPT below assumes s2 syntax, so
# changing this default means changing that prompt too.
DEFAULT_FISH_MODEL = "s2.1-pro"
FISH_MODELS = ["s2.1-pro", "s2-pro", "s1"]

# Twilio media streams are 8 kHz μ-law. Fish supports 8 kHz PCM natively, so
# this is a straight PCM16 → μ-law conversion with no resampling.
_TWILIO_SAMPLE_RATE = 8000

# "balanced" trades a little stability for ~300ms time-to-first-audio, which is
# the right side of that trade on a live phone call.
_FISH_LATENCY_MODE = "balanced"

FISH_EXPRESSION_PROMPT = (
    "\n\nVocal expression: your reply is spoken aloud by a voice engine that "
    "understands inline expression markers in square brackets. Use them "
    "sparingly and naturally:\n"
    "  - [emphasis] immediately before a word you want stressed\n"
    "  - a short mood cue at the start of a sentence, e.g. [warm], "
    "[curious], [apologetic], [reassuring]\n"
    "Use at most two markers per reply, and never more than one per sentence. "
    "Never mention or explain the markers — they are stage directions, not "
    "words to say."
)

# Bounded so a stray bracket can't swallow a whole sentence; expression markers
# are short by construction.
_EXPRESSION_MARKER_RE = re.compile(r"\[[^\[\]\n]{1,40}\]")


def strip_expression_markers(text: str) -> str:
    """Remove inline [expression] markers. Required before sending text to any
    engine other than Fish — Google TTS would pronounce them."""
    if not text:
        return text
    cleaned = _EXPRESSION_MARKER_RE.sub(" ", text)
    return re.sub(r"\s+", " ", cleaned).strip()


def pcm16_to_mulaw_b64(pcm_bytes: bytes) -> str:
    """Linear PCM16 → base64 μ-law, the encoding Twilio media frames carry."""
    if audioop is None:  # pragma: no cover - only on 3.13+ without the backport
        raise RuntimeError(
            "audioop is unavailable (removed in Python 3.13). Add 'audioop-lts' "
            "to backend/requirements.txt to keep Fish Audio call output working."
        )
    return base64.b64encode(audioop.lin2ulaw(pcm_bytes, 2)).decode("ascii")


async def fish_tts(
    text: str,
    reference_id: Optional[str] = None,
    speed: float = 1.0,
    model: str = DEFAULT_FISH_MODEL,
    volume_db: float = 0.0,
) -> Optional[str]:
    """Synthesize `text` to base64 μ-law @ 8 kHz, ready for a Twilio media frame.

    Returns None (never raises) on any failure so a call degrades to silence for
    one turn instead of dropping — matching _google_tts's contract, since both
    are called from the same relay.
    """
    if FISH_MOCKED or not text or not text.strip():
        return None
    payload: Dict[str, Any] = {
        "text": text,
        "format": "pcm",
        "sample_rate": _TWILIO_SAMPLE_RATE,
        "latency": _FISH_LATENCY_MODE,
        "normalize": True,
        "prosody": {"speed": max(0.5, min(2.0, speed)), "volume": volume_db},
    }
    if reference_id:
        payload["reference_id"] = reference_id
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=10.0)) as client:
            resp = await client.post(
                _FISH_TTS_URL,
                json=payload,
                headers={
                    "Authorization": f"Bearer {FISH_API_KEY}",
                    # Model selection is a header on this API, not a body field.
                    "model": model,
                    "Content-Type": "application/json",
                },
            )
        if resp.status_code != 200:
            log.warning("Fish TTS error (HTTP %s): %s", resp.status_code, resp.text[:300])
            return None
        if not resp.content:
            log.warning("Fish TTS returned empty audio for %d chars", len(text))
            return None
        return pcm16_to_mulaw_b64(resp.content)
    except Exception as ex:
        log.warning("Fish TTS request failed: %s", ex)
        return None


async def fish_create_voice_model(
    title: str,
    samples: Sequence[Tuple[str, bytes, Optional[str]]],
    description: str = "",
) -> Optional[str]:
    """Clone a voice from 1-20 reference samples; returns the Fish model id to
    store as an agent's `fish_voice_id`.

    `samples` is a sequence of (filename, audio_bytes, transcript). Transcripts
    are optional — Fish falls back to ASR — but supplying an exact one measurably
    improves the clone, so callers should pass it when they have it.

    visibility is pinned to 'private': the API defaults to 'public', which would
    publish a customer's cloned voice into Fish's shared library.
    """
    if FISH_MOCKED or not samples:
        return None
    data: List[Tuple[str, str]] = [
        ("type", "tts"),
        ("title", title),
        ("train_mode", "fast"),
        ("visibility", "private"),
    ]
    if description:
        data.append(("description", description))
    files: List[Tuple[str, Tuple[str, bytes, str]]] = []
    for filename, audio, transcript in samples[:20]:
        files.append(("voices", (filename, audio, "application/octet-stream")))
        if transcript:
            data.append(("texts", transcript))
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=10.0)) as client:
            resp = await client.post(
                _FISH_MODEL_URL,
                data=data,
                files=files,
                headers={"Authorization": f"Bearer {FISH_API_KEY}"},
            )
        if resp.status_code not in (200, 201):
            log.warning("Fish model create error (HTTP %s): %s", resp.status_code, resp.text[:300])
            return None
        return (resp.json() or {}).get("_id")
    except Exception as ex:
        log.warning("Fish model create failed: %s", ex)
        return None
