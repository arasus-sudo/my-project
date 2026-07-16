"""Thin wrapper around the OpenAI Realtime API for Voice EQ's Twilio + OpenAI
Realtime provider.

Unlike retell_client.py's per-call REST wrappers, a Realtime session is a live
WebSocket connection held open for the duration of one phone call — this
module's job is only to open that connection with the right initial session
config; the connection itself is driven by voice_ws_bridge.py's relay loop.

OPENAI_MOCKED gates this the same way RETELL_MOCKED/TWILIO_MOCKED do, but there
is no mock branch inside connect_session() itself — in mocked mode,
voice_ws_bridge.py never opens the WebSocket route at all (a live bidirectional
audio session can't be meaningfully faked the way a REST response can), so this
module is only ever exercised with a real OPENAI_API_KEY. See voice_ws_bridge.py
module docstring.

NOTE ON API DRIFT — the Realtime API's schema moved during this feature's own
planning research (flat input_audio_format/output_audio_format -> nested
session.audio.input.format/session.audio.output.format; response.audio.delta ->
response.output_audio.delta in the GA API). The shapes below are best-effort as
of that research. Re-verify every field/event name against
https://developers.openai.com/api/docs/guides/realtime before trusting this in
a live call — this is flagged here deliberately, not an oversight.
"""

import os
from typing import Optional

from openai import AsyncOpenAI

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
OPENAI_REALTIME_MODEL = os.environ.get("OPENAI_REALTIME_MODEL", "gpt-realtime")
OPENAI_MOCKED = not bool(OPENAI_API_KEY)

# Confirmed via OpenAI's own community docs to produce intelligible audio over
# an 8kHz g711_ulaw telephony stream (the format Twilio Media Streams uses).
# fable/onyx/nova are deliberately excluded — known not to work at this sample
# rate, and offering them in the frontend voice picker would be a silent trap.
TELEPHONY_SAFE_VOICES = ["alloy", "echo", "shimmer", "ash", "ballad", "coral", "sage", "verse"]
DEFAULT_VOICE = TELEPHONY_SAFE_VOICES[0]

_client: Optional[AsyncOpenAI] = None


def _client_singleton() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(api_key=OPENAI_API_KEY)
    return _client


def connect_session(model: Optional[str] = None):
    """Returns the SDK's async-context-manager connection
    (`async with connect_session() as conn:`), per voice_ws_bridge.py's relay
    loop. Caller sends the initial session.update via session_update_payload()
    below — kept as data here rather than sent from inside this function, so
    the "verify against current docs" caveat and voice validation live in one
    place without this module reaching into the relay loop's control flow."""
    if OPENAI_MOCKED:
        raise RuntimeError(
            "connect_session() called while OPENAI_MOCKED — voice_ws_bridge.py "
            "must never reach this in mock mode, see its module docstring"
        )
    return _client_singleton().beta.realtime.connect(model=model or OPENAI_REALTIME_MODEL)


def session_update_payload(*, instructions: str, voice: str) -> dict:
    """The initial session.update client event. voice falls back to
    DEFAULT_VOICE if it isn't one of the 8kHz-telephony-safe set — belt and
    braces alongside the frontend's own list restriction (VoiceAgentBuilder.jsx),
    since an agent record could in principle still hold a stale/invalid value."""
    safe_voice = voice if voice in TELEPHONY_SAFE_VOICES else DEFAULT_VOICE
    return {
        "type": "session.update",
        "session": {
            "instructions": instructions,
            "voice": safe_voice,
            "modalities": ["audio", "text"],
            "audio": {
                "input": {
                    "format": "g711_ulaw",
                    "turn_detection": {"type": "server_vad"},
                    "transcription": {"model": "whisper-1"},
                },
                "output": {"format": "g711_ulaw"},
            },
        },
    }
