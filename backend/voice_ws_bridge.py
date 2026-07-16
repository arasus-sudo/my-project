"""Twilio <-> OpenAI Realtime bridge for Voice EQ's twilio_openai provider.

Three public routes (mounted with no prefix, same as voice_eq.py's
voice_public_router, so the real paths are under /api):

  POST      /hooks/voice-twiml/{token}/{call_id}   Twilio fetches this the
                                                     instant the call is
                                                     answered; returns TwiML
                                                     that opens the media
                                                     stream. <Connect><Stream>
                                                     blocks further TwiML
                                                     execution until the
                                                     WebSocket closes — that's
                                                     what actually ends the
                                                     call when the bridge hangs
                                                     up.
  WEBSOCKET /hooks/voice-ws/{token}/{call_id}       The bidirectional media
                                                     stream — the relay loop.
  POST      /hooks/voice-status/{token}/{call_id}   Twilio's call-status
                                                     callback. This is the ONLY
                                                     signal for a call that
                                                     never connects at all
                                                     (busy / no-answer / failed
                                                     / canceled) — those never
                                                     reach the TwiML/WS routes,
                                                     so without this a call
                                                     doc would sit in
                                                     "registered" forever.
                                                     Also a safety-net
                                                     finalizer for "completed"
                                                     (idempotent against the
                                                     WS path already having
                                                     finalized it).

All three are public (no JWT) — Twilio can't carry a Bearer token. Auth is a
per-workspace {token} path segment checked against db.webhooks (kind=
"voice_ws"), the same scheme voice_eq.py's existing Retell webhook uses, plus
Twilio's own X-Twilio-Signature verification on the two REST-fetched routes
(the WebSocket route has no signature scheme of its own to check — the
token-in-path is its only auth, same reasoning as everywhere else here).

MOCKED MODE: when TWILIO_MOCKED or OPENAI_MOCKED, voice_eq.py's
_place_provider_call() never places a real Twilio call and never points one at
these routes — it synthesizes a complete canned call outcome directly, because
a live bidirectional audio session can't be meaningfully faked the way a REST
response can be. The relay loop below is therefore only ever exercised with
real Twilio + OpenAI credentials; see _place_provider_call's mocked branch in
voice_eq.py for the demo-mode path.

API-DRIFT WARNING — same caveat as openai_realtime_client.py: the exact
send/iterate interface of `openai.beta.realtime.connect()` (dict vs. typed
event objects, exact event type strings) and the nested session.audio.* config
shape are this feature's single biggest unverified surface, called out
explicitly in the plan this was built from. This module was written against
the best current understanding of that interface but has not been exercised
against a live call — smoke-test the relay loop specifically before trusting
it end to end.
"""

import asyncio
import json
import logging
import os
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import Response

from server import db, now_iso, new_id, _llm_chat, _extract_json
from voice_eq import _cascade_call_analyzed, _settle_call_billing
from twilio_client import twilio_client
from openai_realtime_client import connect_session, session_update_payload, DEFAULT_VOICE

log = logging.getLogger(__name__)

voice_ws_router = APIRouter()

PUBLIC_BASE_URL = os.environ.get("PUBLIC_BASE_URL", "")

_TERMINAL_UNANSWERED = {"busy", "no-answer", "failed", "canceled"}


def _twiml_fetch_url(token: str, call_id: str) -> str:
    return f"{PUBLIC_BASE_URL}/api/hooks/voice-twiml/{token}/{call_id}"


def _status_callback_url(token: str, call_id: str) -> str:
    return f"{PUBLIC_BASE_URL}/api/hooks/voice-status/{token}/{call_id}"


def _ws_stream_url(token: str, call_id: str) -> str:
    return f"{PUBLIC_BASE_URL.replace('https://', 'wss://', 1)}/api/hooks/voice-ws/{token}/{call_id}"


async def _lookup_ws_token(token: str) -> Dict[str, Any]:
    hook = await db.webhooks.find_one({"token": token, "kind": "voice_ws"}, {"_id": 0})
    if not hook or not hook.get("active", True):
        raise HTTPException(404, "webhook not found")
    return hook


# ----------------------------- TwiML (call answered) ---------------------------
@voice_ws_router.post("/hooks/voice-twiml/{token}/{call_id}")
async def voice_twiml(token: str, call_id: str, request: Request):
    hook = await _lookup_ws_token(token)
    form = await request.form()
    signature = request.headers.get("x-twilio-signature", "")
    if not twilio_client.verify_webhook_signature(_twiml_fetch_url(token, call_id), dict(form), signature):
        raise HTTPException(401, "invalid signature")
    call = await db.calls.find_one({"id": call_id, "workspace_id": hook["workspace_id"]}, {"_id": 0})
    if not call:
        raise HTTPException(404, "call not found")
    stream_url = _ws_stream_url(token, call_id)
    twiml = f'<?xml version="1.0" encoding="UTF-8"?><Response><Connect><Stream url="{stream_url}" /></Connect></Response>'
    return Response(content=twiml, media_type="application/xml")


# ----------------------------- Status callback (unanswered / safety net) -------
@voice_ws_router.post("/hooks/voice-status/{token}/{call_id}")
async def voice_status_callback(token: str, call_id: str, request: Request):
    hook = await _lookup_ws_token(token)
    form = await request.form()
    signature = request.headers.get("x-twilio-signature", "")
    if not twilio_client.verify_webhook_signature(_status_callback_url(token, call_id), dict(form), signature):
        raise HTTPException(401, "invalid signature")
    call = await db.calls.find_one({"id": call_id, "workspace_id": hook["workspace_id"]}, {"_id": 0})
    if not call or call.get("ended_at"):
        return {"ok": True}  # unknown call, or already finalized by the WS relay's own path
    status = (form.get("CallStatus") or "").lower()
    if status in _TERMINAL_UNANSWERED:
        await db.calls.update_one({"id": call_id}, {"$set": {
            "status": status.replace("-", "_"), "ended_at": now_iso(),
            "disconnection_reason": status, "updated_at": now_iso(),
        }})
    return {"ok": True}


# ----------------------------- Local call analysis ------------------------------
# There's no third-party "analyzed" webhook for this provider (unlike Retell's
# call_analyzed event) — sentiment/summary/call_successful/qualification are
# derived here, locally, from the accumulated transcript, the same shape
# Retell's call_analysis produces so _cascade_call_analyzed doesn't need to
# know which provider generated the call.
async def _analyze_transcript(transcript: str) -> Dict[str, Any]:
    system = (
        "Analyze this phone call transcript between an AI sales agent and a prospect. "
        "STRICT JSON only: {\"sentiment\": \"positive\"|\"neutral\"|\"negative\", "
        "\"call_successful\": bool, \"summary\": str (one sentence), "
        "\"qualification\": {\"interest_level\": str, \"notes\": str}}"
    )
    try:
        resp = await _llm_chat(system, transcript[:6000], f"veq-analyze-{new_id()[:8]}")
        parsed = _extract_json(resp)
        if parsed:
            return parsed
    except Exception as ex:
        log.warning("transcript analysis fallback: %s", ex)
    return {"sentiment": "neutral", "call_successful": None, "summary": "", "qualification": {}}


async def _finalize_twilio_call(workspace_id: str, call_id: str, transcript_turns: List[Dict[str, str]],
                                 duration_seconds: int, reason: str) -> None:
    """Runs at most once per call — every caller in the WS handler goes through
    a `finalized` guard first. Settles billing, derives the analysis fields
    locally, then calls _cascade_call_analyzed directly: the same function
    Retell's webhook already drives, completely unmodified."""
    call = await db.calls.find_one({"id": call_id, "workspace_id": workspace_id}, {"_id": 0})
    if not call or call.get("ended_at"):
        return

    transcript = "\n".join(f"{t['role']}: {t['content']}" for t in transcript_turns) or None
    analysis = await _analyze_transcript(transcript) if transcript else {}

    patch: Dict[str, Any] = {
        "status": "ended", "ended_at": now_iso(), "duration_seconds": duration_seconds,
        "disconnection_reason": reason, "transcript": transcript, "transcript_object": transcript_turns or None,
        "sentiment": analysis.get("sentiment"), "call_successful": analysis.get("call_successful"),
        "summary": analysis.get("summary"), "qualification": analysis.get("qualification"),
        "updated_at": now_iso(),
    }
    patch["credits_charged"] = await _settle_call_billing(workspace_id, call_id, duration_seconds)
    await db.calls.update_one({"id": call_id}, {"$set": patch})

    if call.get("lead_id"):
        await _cascade_call_analyzed(workspace_id, call_id, {**call, **patch})


# ----------------------------- The relay itself ---------------------------------
@voice_ws_router.websocket("/hooks/voice-ws/{token}/{call_id}")
async def voice_media_stream(ws: WebSocket, token: str, call_id: str):
    await ws.accept()

    hook = await db.webhooks.find_one({"token": token, "kind": "voice_ws"}, {"_id": 0})
    if not hook or not hook.get("active", True):
        await ws.close(code=4404)
        return
    call = await db.calls.find_one({"id": call_id, "workspace_id": hook["workspace_id"]}, {"_id": 0})
    if not call:
        await ws.close(code=4404)
        return
    agent = None
    if call.get("agent_id"):
        agent = await db.voice_agents.find_one({"id": call["agent_id"], "workspace_id": hook["workspace_id"]}, {"_id": 0})
    if not agent:
        await ws.close(code=4404)
        return

    workspace_id = hook["workspace_id"]
    prompt = agent.get("persona_prompt", "")
    if agent.get("knowledge_base"):
        prompt += f"\n\n# Knowledge base (answer questions using these facts):\n{agent['knowledge_base']}"
    voice = agent.get("voice_id") or DEFAULT_VOICE
    max_duration_s = max(60, int(agent.get("max_call_duration_minutes", 15)) * 60)

    stream_sid: Optional[str] = None
    transcript_turns: List[Dict[str, str]] = []
    start_time: Optional[float] = None
    end_reason = "unknown"
    finalized = False
    loop = asyncio.get_event_loop()
    audio_in_queue: "asyncio.Queue[Optional[str]]" = asyncio.Queue()

    async def finalize():
        nonlocal finalized
        if finalized:
            return
        finalized = True
        duration = int(loop.time() - start_time) if start_time else 0
        await _finalize_twilio_call(workspace_id, call_id, transcript_turns, duration, end_reason)

    try:
        async with connect_session() as conn:
            # session.update shape/field names are the single biggest
            # unverified surface in this feature — see module docstring.
            await conn.send(session_update_payload(instructions=prompt, voice=voice))

            async def twilio_reader():
                nonlocal stream_sid, start_time, end_reason
                async for raw in ws.iter_text():
                    msg = json.loads(raw)
                    ev = msg.get("event")
                    if ev == "start":
                        stream_sid = msg["start"]["streamSid"]
                        start_time = loop.time()
                        await db.calls.update_one({"id": call_id}, {"$set": {
                            "status": "ongoing", "started_at": now_iso(),
                            "twilio_call_sid": msg["start"].get("callSid") or call.get("twilio_call_sid"),
                            "updated_at": now_iso(),
                        }})
                    elif ev == "media":
                        await audio_in_queue.put(msg["media"]["payload"])
                    elif ev == "stop":
                        end_reason = "caller_hangup"
                        break
                await audio_in_queue.put(None)  # sentinel — stop the forwarder cleanly

            async def forward_to_openai():
                while True:
                    payload = await audio_in_queue.get()
                    if payload is None:
                        return
                    await conn.send({"type": "input_audio_buffer.append", "audio": payload})

            async def openai_reader():
                async for event in conn:
                    etype = getattr(event, "type", None)
                    if etype == "response.output_audio.delta" and stream_sid:
                        await ws.send_text(json.dumps({
                            "event": "media", "streamSid": stream_sid,
                            "media": {"payload": getattr(event, "delta", "")},
                        }))
                    elif etype == "input_audio_buffer.speech_started" and stream_sid:
                        # Barge-in: the caller started talking over the
                        # assistant. Flush whatever assistant audio Twilio
                        # still has queued for playback — without this the
                        # assistant keeps talking with no way to stop.
                        await ws.send_text(json.dumps({"event": "clear", "streamSid": stream_sid}))
                    elif etype == "response.output_audio_transcript.done":
                        transcript_turns.append({"role": "agent", "content": getattr(event, "transcript", "")})
                    elif etype == "conversation.item.input_audio_transcription.completed":
                        transcript_turns.append({"role": "caller", "content": getattr(event, "transcript", "")})

            async def duration_guard():
                nonlocal end_reason
                await asyncio.sleep(max_duration_s)
                end_reason = "duration_limit"
                if call.get("twilio_call_sid"):
                    await twilio_client.hangup_call(call["twilio_call_sid"])
                await ws.close(code=1000)

            tasks = [
                asyncio.create_task(twilio_reader(), name="twilio_reader"),
                asyncio.create_task(forward_to_openai(), name="forward_to_openai"),
                asyncio.create_task(openai_reader(), name="openai_reader"),
                asyncio.create_task(duration_guard(), name="duration_guard"),
            ]
            try:
                done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
                for exc_task in done:
                    exc = exc_task.exception()
                    if exc and end_reason == "unknown":
                        end_reason = "error"
                        log.warning("voice_ws_bridge task %s errored on call %s: %s", exc_task.get_name(), call_id, exc)
            finally:
                for t in tasks:
                    if not t.done():
                        t.cancel()
                await asyncio.gather(*tasks, return_exceptions=True)
    except WebSocketDisconnect:
        end_reason = "client_disconnect" if end_reason == "unknown" else end_reason
    except Exception as ex:
        log.warning("voice_ws_bridge error on call %s: %s", call_id, ex)
        end_reason = "error" if end_reason == "unknown" else end_reason
    finally:
        # Guaranteed to run exactly one real finalize regardless of which path
        # got here — the `finalized` flag makes every other call a no-op.
        # Unlike Retell's call_ended (a guaranteed terminal webhook from a
        # third party), this try/finally is the ONLY thing standing between a
        # dropped connection and a call stuck "ongoing" forever, never billed,
        # never cascaded.
        await finalize()
