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
import base64
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


# ── μ-law audio gain ──────────────────────────────────────────────────
# Pre-computed lookup table for fast μ-law -> linear conversion.
# Standard μ-law is 8-bit companded audio; the 256 encoded values map to
# a non-uniform range of 14-bit signed linear values.
_MU_LAW_TO_LINEAR = [0] * 256
for _i in range(256):
    _mulaw = _i ^ 0xFF
    _sign = -1 if _mulaw & 0x80 else 1
    _exp = (_mulaw >> 4) & 0x07
    _mant = _mulaw & 0x0F
    _val = ((_mant << 3) + 0x84) << _exp
    _MU_LAW_TO_LINEAR[_i] = _sign * _val
# Build reverse table by scanning all possible linear values
_LINEAR_TO_MU_LAW: Dict[int, int] = {}
for _i, _lin in enumerate(_MU_LAW_TO_LINEAR):
    _LINEAR_TO_MU_LAW[_lin] = _i
for _v in range(-32124, 32125):
    if _v not in _LINEAR_TO_MU_LAW:
        _LINEAR_TO_MU_LAW[_v] = min(
            range(256), key=lambda x: abs(_MU_LAW_TO_LINEAR[x] - _v)
        )


def _apply_gain(mu_law_data: bytes, gain_db: float) -> bytes:
    """Apply gain (dB) to μ-law audio.  gain_db=0 → no change."""
    if not mu_law_data or abs(gain_db) < 0.5:
        return mu_law_data
    factor = 10.0 ** (gain_db / 20.0)
    out = bytearray(len(mu_law_data))
    for i, b in enumerate(mu_law_data):
        lin = _MU_LAW_TO_LINEAR[b]
        lin = int(lin * factor)
        lin = max(-32124, min(32124, lin))
        out[i] = _LINEAR_TO_MU_LAW[lin]
    return bytes(out)


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
    cfg = agent.get("config") or {}
    prompt = agent.get("persona_prompt", "")

    lang = cfg.get("language", "en-US")
    if lang and lang != "en-US":
        prompt += f"\n\nLanguage: Conduct the conversation in {lang}."

    style = cfg.get("speaking_style", "professional")
    if style and style != "professional":
        prompt += f"\n\nCommunication style: Adopt a {style} communication style."

    resp_style = cfg.get("response_style", "conversational")
    if resp_style and resp_style != "conversational":
        prompt += f"\n\nResponse style: Keep your responses {resp_style}."

    accent = cfg.get("accent", "neutral")
    accent_map = {
        "indian": "Speak with a warm Indian English accent. Use Indian expressions naturally.",
        "british": "Speak with a British English accent. Use British expressions naturally.",
        "australian": "Speak with an Australian English accent. Use Australian expressions naturally.",
        "american": "Speak with an American English accent.",
    }
    if accent in accent_map:
        prompt += f"\n\nAccent: {accent_map[accent]}"

    silence = cfg.get("silence_timeout_seconds", 15)
    if silence and silence != 15:
        prompt += f"\n\nSilence handling: If the lead is silent for more than {silence} seconds, ask if they're still there and wrap up the conversation naturally."

    if cfg.get("human_handoff_enabled"):
        prompt += "\n\nHuman handoff: If the lead explicitly asks to speak to a human representative, acknowledge and say you'll transfer them to a team member."

    qf = cfg.get("qualification_framework", "custom")
    qfields = cfg.get("qualification_fields", [])
    if qf and qf != "custom" and qfields:
        field_descriptions = "\n".join(f"- {f.get('key', 'field')}: {f.get('prompt', '')}" for f in qfields)
        prompt += f"\n\nQualification framework ({qf.upper()}): Extract the following information during the conversation:\n{field_descriptions}"

    kb = cfg.get("knowledge_base", "")
    if kb:
        prompt += f"\n\n# Knowledge base (answer questions using these facts):\n{kb}"

    voice = cfg.get("voice") or DEFAULT_VOICE
    if voice not in ("alloy", "echo", "shimmer", "ash", "ballad", "coral", "sage", "verse"):
        log.warning("voice_ws_bridge unknown voice '%s' for call %s, falling back to '%s'", voice, call_id, DEFAULT_VOICE)
        voice = DEFAULT_VOICE
    temperature = cfg.get("temperature", 0.7)
    model = cfg.get("model") or None
    max_duration_s = max(60, int(cfg.get("max_duration_minutes", 15)) * 60)
    volume_gain_db = float(cfg.get("volume_gain_db", 3.0))

    stream_sid: Optional[str] = None
    transcript_turns: List[Dict[str, str]] = []
    start_time: Optional[float] = None
    end_reason = "unknown"
    finalized = False
    loop = asyncio.get_event_loop()
    audio_in_queue: "asyncio.Queue[Optional[str]]" = asyncio.Queue()
    pre_stream_buffer: List[str] = []  # audio chunks that arrived before stream_sid

    async def finalize():
        nonlocal finalized
        if finalized:
            return
        finalized = True
        duration = int(loop.time() - start_time) if start_time else 0
        await _finalize_twilio_call(workspace_id, call_id, transcript_turns, duration, end_reason)

    try:
        async with connect_session(model=model) as conn:
            await conn.send(session_update_payload(
                instructions=prompt, voice=voice, temperature=temperature,
                interrupt_sensitivity=cfg.get("interrupt_sensitivity", "balanced"),
                language=lang,
            ))

            # Trigger the AI's first response immediately — don't wait for
            # Twilio's media stream to open.  Audio will be buffered in
            # pre_stream_buffer until stream_sid is set, then flushed.
            lead_info = call.get("metadata", {}).get("lead_snapshot", {})
            crm_level = cfg.get("crm_context_level", "full_lead")
            if crm_level == "none":
                greeting_context = "Start the call with the lead."
            elif crm_level == "summary":
                summary_parts = []
                if lead_info.get("first_name"):
                    summary_parts.append(lead_info["first_name"])
                if lead_info.get("company"):
                    summary_parts.append(f"from {lead_info['company']}")
                if lead_info.get("title"):
                    summary_parts.append(f"({lead_info['title']})")
                greeting_context = f"The lead is {' '.join(summary_parts)}."
            else:
                greeting_context = f"The lead is {lead_info.get('first_name', 'there')} from {lead_info.get('company', 'their company')}."
                if lead_info.get("title"):
                    greeting_context += f" Title: {lead_info['title']}."
                if lead_info.get("industry"):
                    greeting_context += f" Industry: {lead_info['industry']}."
            await conn.send({
                "type": "conversation.item.create",
                "item": {
                    "type": "message",
                    "role": "user",
                    "content": [{"type": "input_text", "text": f"Start the call. {greeting_context} Begin your greeting and qualification conversation."}]
                }
            })
            await conn.send({"type": "response.create"})

            async def _flush_buffer():
                nonlocal pre_stream_buffer
                for buf_payload in pre_stream_buffer:
                    await ws.send_text(json.dumps({
                        "event": "media", "streamSid": stream_sid,
                        "media": {"payload": buf_payload},
                    }))
                pre_stream_buffer = []

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
                        await _flush_buffer()
                    elif ev == "media":
                        await audio_in_queue.put(msg["media"]["payload"])
                    elif ev == "stop":
                        end_reason = "caller_hangup"
                        break
                await audio_in_queue.put(None)

            async def forward_to_openai():
                while True:
                    payload = await audio_in_queue.get()
                    if payload is None:
                        return
                    await conn.send({"type": "input_audio_buffer.append", "audio": payload})

            async def openai_reader():
                async for event in conn:
                    etype = event.get("type") if isinstance(event, dict) else getattr(event, "type", None)
                    if etype == "response.output_audio.delta":
                        payload_b64 = event.get("delta", "") if isinstance(event, dict) else getattr(event, "delta", "")
                        # Apply volume gain (decode base64 μ-law -> gain -> re-encode)
                        if volume_gain_db:
                            try:
                                raw = base64.b64decode(payload_b64)
                                gained = _apply_gain(raw, volume_gain_db)
                                payload_b64 = base64.b64encode(gained).decode("ascii")
                            except Exception:
                                pass  # send original if gain processing fails
                        if stream_sid:
                            await ws.send_text(json.dumps({
                                "event": "media", "streamSid": stream_sid,
                                "media": {"payload": payload_b64},
                            }))
                        else:
                            pre_stream_buffer.append(payload_b64)
                    elif etype == "input_audio_buffer.speech_started" and stream_sid:
                        await ws.send_text(json.dumps({"event": "clear", "streamSid": stream_sid}))
                    elif etype == "response.output_audio_transcript.done":
                        transcript = event.get("transcript", "") if isinstance(event, dict) else getattr(event, "transcript", "")
                        transcript_turns.append({"role": "agent", "content": transcript})
                    elif etype == "conversation.item.input_audio_transcription.completed":
                        transcript = event.get("transcript", "") if isinstance(event, dict) else getattr(event, "transcript", "")
                        transcript_turns.append({"role": "caller", "content": transcript})
                    elif etype == "error":
                        # A rejected session.update lands here — without this
                        # log the session silently runs on default PCM16 and
                        # the caller hears static.
                        err = event.get("error", event) if isinstance(event, dict) else event
                        log.error("OpenAI realtime error on call %s: %s", call_id, err)

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
