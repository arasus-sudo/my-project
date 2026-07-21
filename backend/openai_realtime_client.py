"""Thin wrapper around the OpenAI Realtime API for Voice EQ's Twilio + OpenAI
Realtime provider.

A Realtime session is a live WebSocket connection held open for the duration of
one phone call — this module's job is only to open that connection with the
right initial session config; the connection itself is driven by
voice_ws_bridge.py's relay loop.

OPENAI_MOCKED gates this the same way TWILIO_MOCKED does, but there is no mock
branch inside connect_session() itself — in mocked mode,
voice_ws_bridge.py never opens the WebSocket route at all (a live bidirectional
audio session can't be meaningfully faked the way a REST response can), so this
module is only ever exercised with a real OPENAI_API_KEY. See voice_ws_bridge.py
module docstring.

Uses raw websockets (not the openai SDK) to avoid the OpenAI-Beta: realtime=v1
header that the SDK enforces — that header causes beta_api_shape_disabled on
GA-track Realtime models like gpt-realtime-2.1.
"""

import json
import os
from typing import Any, AsyncIterator, Optional

import websockets

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
OPENAI_REALTIME_MODEL = os.environ.get("OPENAI_REALTIME_MODEL", "gpt-realtime-2.1")
OPENAI_MOCKED = not bool(OPENAI_API_KEY)

TELEPHONY_SAFE_VOICES = ["alloy", "echo", "shimmer", "ash", "ballad", "coral", "sage", "verse"]
DEFAULT_VOICE = TELEPHONY_SAFE_VOICES[0]


class _RealtimeSession:
    """Wraps a raw WebSocket so callers can send() dicts and iterate events
    the same way they would with the openai SDK's connection object."""

    def __init__(self, ws: websockets.WebSocketClientProtocol) -> None:
        self._ws = ws

    async def send(self, data: dict) -> None:
        await self._ws.send(json.dumps(data))

    async def recv(self) -> dict:
        raw = await self._ws.recv()
        return json.loads(raw)

    def __aiter__(self) -> AsyncIterator[dict]:
        return self._aiter()

    async def _aiter(self) -> AsyncIterator[dict]:
        async for raw in self._ws:
            yield json.loads(raw)

    async def close(self) -> None:
        await self._ws.close()


class _ConnectionManager:
    """Async context manager returned by connect_session()."""

    def __init__(self, model: str) -> None:
        self._model = model
        self._session: Optional[_RealtimeSession] = None

    async def __aenter__(self) -> _RealtimeSession:
        url = f"wss://api.openai.com/v1/realtime?model={self._model}"
        ws = await websockets.connect(url, additional_headers={
            "Authorization": f"Bearer {OPENAI_API_KEY}",
        })
        self._session = _RealtimeSession(ws)
        # Consume the initial session.created event so the caller's first
        # recv / async-for doesn't unexpectedly see it.
        await self._session.recv()
        return self._session

    async def __aexit__(self, *args: Any) -> None:
        if self._session:
            await self._session.close()


def connect_session(model: Optional[str] = None) -> _ConnectionManager:
    """Returns an async context manager that yields a _RealtimeSession.

    Usage::

        async with connect_session(model="gpt-realtime-2.1") as session:
            await session.send({"type": "session.update", ...})
            async for event in session:
                ...

    The initial ``session.created`` event from the server is consumed
    internally so that callers only see subsequent events.
    """
    if OPENAI_MOCKED:
        raise RuntimeError(
            "connect_session() called while OPENAI_MOCKED — voice_ws_bridge.py "
            "must never reach this in mock mode, see its module docstring"
        )
    return _ConnectionManager(model or OPENAI_REALTIME_MODEL)


def session_update_payload(*, instructions: str, voice: str,
                           temperature: float = 0.7,
                           interrupt_sensitivity: str = "balanced",
                           language: str = "en-US") -> dict:
    """Build the initial session.update client event.

    Twilio Media Streams use 8 kHz μ-law (g711 ulaw), mapped to
    ``audio/pcmu`` in the Realtime API.  ``voice`` is set via
    ``session.audio.output.voice`` (the only place gpt-realtime-2.1
    accepts it).  ``temperature`` is silently dropped — the model does
    not expose it at the session level.  ``interrupt_sensitivity`` maps
    to ``turn_detection`` thresholds.
    """
    safe_voice = voice if voice in TELEPHONY_SAFE_VOICES else DEFAULT_VOICE

    vad_map = {
        "never": {"threshold": 0.8, "silence_duration_ms": 1200, "prefix_padding_ms": 600},
        "balanced": {"threshold": 0.5, "silence_duration_ms": 500, "prefix_padding_ms": 300},
        "aggressive": {"threshold": 0.3, "silence_duration_ms": 200, "prefix_padding_ms": 100},
    }
    vad_params = vad_map.get(interrupt_sensitivity, vad_map["balanced"])

    # GA API shape: turn_detection and transcription live under audio.input,
    # NOT at the session top level (that was the beta shape). The GA server
    # rejects the whole session.update on any unknown parameter — which
    # silently leaves the session on its default 24 kHz PCM16 output, and
    # Twilio plays that as mu-law static.
    input_cfg: dict = {
        "format": {"type": "audio/pcmu"},
        "transcription": {"model": "whisper-1"},
    }
    if interrupt_sensitivity != "never":
        input_cfg["turn_detection"] = {"type": "server_vad", **vad_params}
    else:
        input_cfg["turn_detection"] = None

    payload: dict = {
        "type": "session.update",
        "session": {
            "type": "realtime",
            "instructions": instructions,
            "audio": {
                "input": input_cfg,
                "output": {
                    "format": {"type": "audio/pcmu"},
                    "voice": safe_voice,
                },
            },
        },
    }
    return payload
