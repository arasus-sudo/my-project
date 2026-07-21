"""Google Cloud STT → Claude → TTS bridge for Voice EQ.

Alternative provider alongside twilio_openai (OpenAI Realtime).  Uses a split
architecture — speech recognition, LLM reasoning, and speech synthesis are
separate hops — which trades the low-latency barge-in of the Realtime API for
access to high-quality TTS voices (PlayHT, Google Cloud).

Flow per utterance:
  Twilio μ-law audio → silence VAD → Google STT → Claude → TTS → μ-law back to Twilio

MOUNTED as a separate APIRouter (voice_google_router) so Twilio routes are
independent of the OpenAI bridge's routes — each call picks the correct one
via its TwiML URL at creation time.
"""

import asyncio
import base64
import json
import logging
import os
import re
import time
from typing import Any, Dict, List, Optional

import aiohttp
from fastapi import APIRouter, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import Response

from server import db, now_iso, new_id, _llm_chat, _extract_json
from voice_eq import _cascade_call_analyzed, _settle_call_billing
from twilio_client import twilio_client

log = logging.getLogger(__name__)

voice_google_router = APIRouter()

# Pre-generated greeting audio cache (call_id → base64 μ-law)
# Populated by _place_call so the greeting is ready when the WS connects.
_pending_greetings: Dict[str, str] = {}

def store_greeting_audio(call_id: str, audio_b64: str) -> None:
    _pending_greetings[call_id] = audio_b64

def pop_greeting_audio(call_id: str) -> Optional[str]:
    return _pending_greetings.pop(call_id, None)

PUBLIC_BASE_URL = os.environ.get("PUBLIC_BASE_URL", "")
GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY", "")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
GOOGLE_MOCKED = not bool(GOOGLE_API_KEY)

_TERMINAL_UNANSWERED = {"busy", "no-answer", "failed", "canceled"}

# ── Cloud REST endpoints ─────────────────────────────────────────────────
_GOOGLE_STT_URL = "https://speech.googleapis.com/v1/speech:recognize"
_GOOGLE_TTS_URL = "https://texttospeech.googleapis.com/v1/text:synthesize"

# ── Available Google TTS voices ──────────────────────────────────────────
# (language_code, voice_name, display_label, gender)
GOOGLE_VOICES = [
    # English US — WaveNet
    ("en-US", "en-US-Wavenet-A", "US Wavenet A (female)", "FEMALE"),
    ("en-US", "en-US-Wavenet-B", "US Wavenet B (male)", "MALE"),
    ("en-US", "en-US-Wavenet-C", "US Wavenet C (female)", "FEMALE"),
    ("en-US", "en-US-Wavenet-D", "US Wavenet D (male)", "MALE"),
    ("en-US", "en-US-Wavenet-E", "US Wavenet E (female)", "FEMALE"),
    ("en-US", "en-US-Wavenet-F", "US Wavenet F (female)", "FEMALE"),
    ("en-US", "en-US-Wavenet-G", "US Wavenet G (female)", "FEMALE"),
    ("en-US", "en-US-Wavenet-H", "US Wavenet H (male)", "MALE"),
    ("en-US", "en-US-Wavenet-I", "US Wavenet I (male)", "MALE"),
    ("en-US", "en-US-Wavenet-J", "US Wavenet J (male)", "MALE"),
    # English US — Studio (highest quality)
    ("en-US", "en-US-Studio-O", "US Studio O (female)", "FEMALE"),
    ("en-US", "en-US-Studio-Q", "US Studio Q (male)", "MALE"),
    # English UK
    ("en-GB", "en-GB-Wavenet-A", "UK Wavenet A (female)", "FEMALE"),
    ("en-GB", "en-GB-Wavenet-B", "UK Wavenet B (male)", "MALE"),
    ("en-GB", "en-GB-Wavenet-C", "UK Wavenet C (female)", "FEMALE"),
    ("en-GB", "en-GB-Wavenet-D", "UK Wavenet D (male)", "MALE"),
    ("en-GB", "en-GB-Studio-B", "UK Studio B (male)", "MALE"),
    # English Australia
    ("en-AU", "en-AU-Wavenet-A", "AU Wavenet A (female)", "FEMALE"),
    ("en-AU", "en-AU-Wavenet-B", "AU Wavenet B (male)", "MALE"),
    ("en-AU", "en-AU-Wavenet-C", "AU Wavenet C (female)", "FEMALE"),
    ("en-AU", "en-AU-Studio-A", "AU Studio A (female)", "FEMALE"),
    # English India
    ("en-IN", "en-IN-Wavenet-A", "IN Wavenet A (female)", "FEMALE"),
    ("en-IN", "en-IN-Wavenet-B", "IN Wavenet B (male)", "MALE"),
    ("en-IN", "en-IN-Wavenet-C", "IN Wavenet C (male)", "MALE"),
    ("en-IN", "en-IN-Studio-A", "IN Studio A (female)", "FEMALE"),
    # Other languages
    ("hi-IN", "hi-IN-Wavenet-A", "Hindi Wavenet A (female)", "FEMALE"),
    ("hi-IN", "hi-IN-Wavenet-B", "Hindi Wavenet B (male)", "MALE"),
    ("es-ES", "es-ES-Wavenet-B", "Spanish Wavenet B (male)", "MALE"),
    ("fr-FR", "fr-FR-Wavenet-C", "French Wavenet C (female)", "FEMALE"),
    ("de-DE", "de-DE-Wavenet-A", "German Wavenet A (female)", "FEMALE"),
    ("ja-JP", "ja-JP-Wavenet-A", "Japanese Wavenet A (female)", "FEMALE"),
    ("pt-BR", "pt-BR-Wavenet-A", "Brazilian Wavenet A (female)", "FEMALE"),
    ("ar-XA", "ar-XA-Wavenet-A", "Arabic Wavenet A (female)", "FEMALE"),
]

# ── Helpers ──────────────────────────────────────────────────────────────

def _stt_lang(google_voice: str) -> str:
    """Derive the STT language code from the TTS voice name."""
    return google_voice.split("-Studio")[0].split("-Wavenet")[0].rsplit("-", 1)[0]


async def _google_stt(base64_mulaw: str, language: str = "en-US") -> Optional[str]:
    """Transcribe μ-law audio via Google Cloud Speech-to-Text REST API."""
    if GOOGLE_MOCKED:
        return None
    async with aiohttp.ClientSession() as session:
        async with session.post(
            f"{_GOOGLE_STT_URL}?key={GOOGLE_API_KEY}",
            json={
                "config": {
                    "encoding": "MULAW",
                    "sampleRateHertz": 8000,
                    "languageCode": language,
                    "enableAutomaticPunctuation": True,
                    "model": "phone_call",
                },
                "audio": {"content": base64_mulaw},
            },
            timeout=aiohttp.ClientTimeout(total=10),
        ) as resp:
            if resp.status != 200:
                err_text = await resp.text()
                log.warning("Google STT error (HTTP %s): %s", resp.status, err_text[:300])
                return None
            data = await resp.json()
            results = data.get("results", [])
            if results:
                return results[0].get("alternatives", [{}])[0].get("transcript", "")
    return None


def _strip_wav_header(b64_audio: str) -> str:
    """Google TTS returns MULAW audio inside a WAV/RIFF container; Twilio
    media streams need raw headerless mu-law bytes. Locate the `data`
    subchunk and drop everything before its payload."""
    raw = base64.b64decode(b64_audio)
    if raw[:4] == b"RIFF":
        idx = raw.find(b"data")
        if idx != -1:
            raw = raw[idx + 8:]  # skip 'data' tag (4B) + chunk size (4B)
    return base64.b64encode(raw).decode()


async def _google_tts(text: str, voice_name: str, speaking_rate: float = 1.0) -> Optional[str]:
    """Synthesize text to μ-law audio via Google Cloud TTS REST API."""
    if GOOGLE_MOCKED:
        return None
    lang_code = voice_name.split("-Studio")[0].split("-Wavenet")[0]
    async with aiohttp.ClientSession() as session:
        async with session.post(
            f"{_GOOGLE_TTS_URL}?key={GOOGLE_API_KEY}",
            json={
                "input": {"text": text},
                "voice": {"languageCode": lang_code, "name": voice_name},
                "audioConfig": {
                    "audioEncoding": "MULAW",
                    # Twilio media streams are 8 kHz — without this the voice's
                    # native rate (24 kHz) comes back and plays as slow garble.
                    "sampleRateHertz": 8000,
                    "speakingRate": speaking_rate,
                    "pitch": 0,
                    "volumeGainDb": 2,
                },
            },
            timeout=aiohttp.ClientTimeout(total=30),
        ) as resp:
            if resp.status != 200:
                err_text = await resp.text()
                log.warning("Google TTS error (HTTP %s): %s", resp.status, err_text[:300])
                return None
            data = await resp.json()
            audio = data.get("audioContent")
            return _strip_wav_header(audio) if audio else None


def _strip_markdown(text: str) -> str:
    """Remove common markdown artifacts before TTS."""
    text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)
    text = re.sub(r'\*(.+?)\*', r'\1', text)
    text = re.sub(r'`(.+?)`', r'\1', text)
    text = re.sub(r'\[(.+?)\]\(.+?\)', r'\1', text)
    text = re.sub(r'#{1,6}\s+', '', text)
    text = re.sub(r'^[-*+]\s+', '', text, flags=re.MULTILINE)
    text = re.sub(r'^\d+\.\s+', '', text, flags=re.MULTILINE)
    text = re.sub(r'\n{2,}', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text


async def _gpt_turn(messages: List[Dict[str, str]], session_id: str) -> Optional[str]:
    """Call OpenAI GPT-4o-mini with full message history."""
    if not OPENAI_API_KEY:
        return None
    async with aiohttp.ClientSession() as session:
        async with session.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENAI_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": "gpt-4o-mini",
                "messages": messages,
                "max_tokens": 300,
                "temperature": 0.7,
            },
            timeout=aiohttp.ClientTimeout(total=15),
        ) as resp:
            if resp.status != 200:
                err = await resp.text()
                log.warning("GPT error for %s (HTTP %s): %s", session_id, resp.status, err[:200])
                return None
            data = await resp.json()
            content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
            return content.strip() if content else None


async def _analyze_transcript(transcript: str) -> Dict[str, Any]:
    """Same analysis function as voice_ws_bridge — sentiment/summary/qualification."""
    system = (
        "Analyze this phone call transcript between an AI sales agent and a prospect. "
        "STRICT JSON only: {\"sentiment\": \"positive\"|\"neutral\"|\"negative\", "
        "\"call_successful\": bool, \"summary\": str (one sentence), "
        "\"qualification\": {\"interest_level\": str, \"notes\": str}}"
    )
    try:
        resp = await _llm_chat(system, transcript[:6000], f"veq-ga-{new_id()[:8]}")
        parsed = _extract_json(resp)
        if parsed:
            return parsed
    except Exception as ex:
        log.warning("transcript analysis fallback: %s", ex)
    return {"sentiment": "neutral", "call_successful": None, "summary": "", "qualification": {}}


async def _lookup_ws_token(token: str) -> Dict[str, Any]:
    hook = await db.webhooks.find_one({"token": token, "kind": "voice_ws"}, {"_id": 0})
    if not hook or not hook.get("active", True):
        raise HTTPException(404, "webhook not found")
    return hook


async def _finalize_call(workspace_id: str, call_id: str, transcript_turns: List[Dict[str, str]],
                          duration_seconds: int, reason: str) -> None:
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


# ── TwiML (call answered) ────────────────────────────────────────────────

@voice_google_router.post("/hooks/voice-google-twiml/{token}/{call_id}")
async def google_twiml(token: str, call_id: str, request: Request):
    hook = await _lookup_ws_token(token)
    form = await request.form()
    signature = request.headers.get("x-twilio-signature", "")
    twiml_url = f"{PUBLIC_BASE_URL}/api/hooks/voice-google-twiml/{token}/{call_id}"
    if not twilio_client.verify_webhook_signature(twiml_url, dict(form), signature):
        raise HTTPException(401, "invalid signature")
    call = await db.calls.find_one({"id": call_id, "workspace_id": hook["workspace_id"]}, {"_id": 0})
    if not call:
        raise HTTPException(404, "call not found")
    stream_url = f"{PUBLIC_BASE_URL.replace('https://', 'wss://', 1)}/api/hooks/voice-google-ws/{token}/{call_id}"
    twiml = f'<?xml version="1.0" encoding="UTF-8"?><Response><Connect><Stream url="{stream_url}" /></Connect></Response>'
    return Response(content=twiml, media_type="application/xml")


# ── Status callback (unanswered / safety net) ────────────────────────────

@voice_google_router.post("/hooks/voice-google-status/{token}/{call_id}")
async def google_status_callback(token: str, call_id: str, request: Request):
    hook = await _lookup_ws_token(token)
    form = await request.form()
    signature = request.headers.get("x-twilio-signature", "")
    status_url = f"{PUBLIC_BASE_URL}/api/hooks/voice-google-status/{token}/{call_id}"
    if not twilio_client.verify_webhook_signature(status_url, dict(form), signature):
        raise HTTPException(401, "invalid signature")
    call = await db.calls.find_one({"id": call_id, "workspace_id": hook["workspace_id"]}, {"_id": 0})
    if not call or call.get("ended_at"):
        return {"ok": True}
    status = (form.get("CallStatus") or "").lower()
    if status in _TERMINAL_UNANSWERED:
        await db.calls.update_one({"id": call_id}, {"$set": {
            "status": status.replace("-", "_"), "ended_at": now_iso(),
            "disconnection_reason": status, "updated_at": now_iso(),
        }})
    return {"ok": True}


# ── Silence / VAD helpers ────────────────────────────────────────────────

_SILENCE_MS = 400  # ms of silence before we consider utterance complete (lower = faster turns)
_MAX_UTTERANCE_MS = 6000  # cap single utterance at 6s


class _AudioBuffer:
    """Collects μ-law audio chunks, detects silence, yields utterances."""

    def __init__(self, silence_ms: int = _SILENCE_MS):
        self._chunks: List[str] = []
        self._last_audio_at: float = 0
        self._started_at: float = 0
        self._silence_ms = silence_ms / 1000

    def add(self, payload: str, now: float) -> None:
        if not self._chunks:
            self._started_at = now
        self._chunks.append(payload)
        self._last_audio_at = now

    @property
    def is_silent(self) -> bool:
        if not self._chunks:
            return True
        return (time.time() - self._last_audio_at) > self._silence_ms

    @property
    def too_long(self) -> bool:
        if not self._chunks:
            return False
        return (time.time() - self._started_at) > (_MAX_UTTERANCE_MS / 1000)

    def flush(self) -> Optional[str]:
        if not self._chunks:
            return None
        # Each Twilio chunk is 160 bytes (20 ms) — not a multiple of 3, so its
        # base64 carries '=' padding. Joining the strings directly would put
        # padding mid-stream (invalid base64); join the decoded bytes instead.
        raw = b"".join(base64.b64decode(c) for c in self._chunks)
        self._chunks.clear()
        return base64.b64encode(raw).decode()

    def clear(self) -> None:
        self._chunks.clear()


# ── The relay itself ─────────────────────────────────────────────────────

@voice_google_router.websocket("/hooks/voice-google-ws/{token}/{call_id}")
async def google_media_stream(ws: WebSocket, token: str, call_id: str):
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

    # Build system prompt the same way as the OpenAI bridge
    kb = cfg.get("knowledge_base", "")
    if kb:
        prompt += f"\n\n# Knowledge base (answer questions using these facts):\n{kb}"
    accent = cfg.get("accent", "neutral")
    if accent == "indian":
        prompt += "\n\nAccent: Speak with a warm Indian English accent."
    elif accent == "british":
        prompt += "\n\nAccent: Speak with a British English accent."
    elif accent == "australian":
        prompt += "\n\nAccent: Speak with an Australian English accent."
    elif accent == "american":
        prompt += "\n\nAccent: Speak with an American English accent."

    style = cfg.get("speaking_style", "professional")
    if style and style != "professional":
        prompt += f"\n\nCommunication style: Adopt a {style} style."

    # Voice / TTS selection
    google_voice = cfg.get("google_voice", "en-US-Wavenet-D")
    speaking_rate = float(cfg.get("speaking_speed", 1.0))
    stt_language = cfg.get("google_stt_language", "en-US")
    greeting_message = cfg.get("greeting_message", "")

    async def _synthesize(text: str) -> Optional[str]:
        text = _strip_markdown(text)
        return await _google_tts(text, google_voice, speaking_rate)

    # ── Lead context ────────────────────────────────────────────────────
    lead_info = call.get("metadata", {}).get("lead_snapshot", {})
    crm_level = cfg.get("crm_context_level", "full_lead")
    system_context = f"Conversation with {lead_info.get('first_name', 'lead')} from {lead_info.get('company', 'their company')}."
    if crm_level != "none" and lead_info.get("title"):
        system_context += f" Title: {lead_info['title']}."
    if crm_level == "full_lead" and lead_info.get("industry"):
        system_context += f" Industry: {lead_info['industry']}."

    max_duration_s = max(60, int(cfg.get("max_duration_minutes", 15)) * 60)

    # ── State ──────────────────────────────────────────────────────────
    stream_sid: Optional[str] = None
    transcript_turns: List[Dict[str, str]] = []
    start_time: Optional[float] = None
    end_reason = "unknown"
    finalized = False
    loop = asyncio.get_event_loop()

    # ── Finalize ───────────────────────────────────────────────────────
    async def finalize():
        nonlocal finalized
        if finalized:
            return
        finalized = True
        duration = int(loop.time() - start_time) if start_time else 0
        await _finalize_call(workspace_id, call_id, transcript_turns, duration, end_reason)

    # ── LLM turn handler ──────────────────────────────────────────────
    async def _llm_turn(user_text: str, *, add_to_transcript: bool = True) -> Optional[str]:
        """Send user text + full conversation history to LLM, return plain-text response."""
        if not user_text or not user_text.strip():
            return None
        if add_to_transcript:
            transcript_turns.append({"role": "caller", "content": user_text})
        # Pin persona + response constraints on every turn
        response_rules = (
            "\n\nResponse rules: Answer in 1-3 short conversational sentences. "
            "Use plain speech — no markdown, no bullet points, no numbered lists, "
            "no asterisks, no citations or references. Speak naturally and "
            "conversationally, like a salesperson on a phone call."
        )
        system_msg = f"{prompt}\n\n{system_context}{response_rules}"
        # Build full conversation history (limit to last 20 turns)
        messages: List[Dict[str, str]] = [{"role": "system", "content": system_msg}]
        for t in transcript_turns[-20:]:
            role = "user" if t["role"] == "caller" else "assistant"
            messages.append({"role": role, "content": t["content"]})
        # If user_text wasn't added to transcript (greeting trigger), append as user message
        if not add_to_transcript:
            messages.append({"role": "user", "content": user_text})
        try:
            resp = await _gpt_turn(messages, f"veq-google-{new_id()[:8]}")
            if not resp:
                return None
            clean = _strip_markdown(resp)
            transcript_turns.append({"role": "agent", "content": clean})
            return clean
        except Exception as ex:
            log.warning("LLM error in Google provider call %s: %s", call_id, ex)
            return None

    # ── Main loop ──────────────────────────────────────────────────────
    try:
        audio_buf = _AudioBuffer()
        speaking = False
        responding = False

        async def twilio_reader():
            nonlocal stream_sid, start_time, end_reason, speaking
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
                    # Send initial greeting — pre-generated or AI-generated
                    pre_audio = pop_greeting_audio(call_id)
                    if pre_audio and stream_sid:
                        log.info("Google provider call %s: using pre-generated greeting audio (%d bytes)", call_id, len(pre_audio))
                        await ws.send_text(json.dumps({
                            "event": "media", "streamSid": stream_sid,
                            "media": {"payload": pre_audio},
                        }))
                    else:
                        if greeting_message:
                            greeting = greeting_message
                            transcript_turns.append({"role": "agent", "content": greeting_message})
                        else:
                            greeting = await _llm_turn(
                                f"The call has started. {system_context} "
                                f"Begin the conversation with a warm greeting and qualify the lead naturally.",
                                add_to_transcript=False
                            )
                        log.info("Google provider call %s: greeting=%s stream_sid=%s", call_id, bool(greeting), bool(stream_sid))
                        if greeting and stream_sid:
                            audio_data = await _synthesize(greeting)
                            log.info("Google provider call %s: audio_data len=%s", call_id, len(audio_data) if audio_data else None)
                            if audio_data:
                                await ws.send_text(json.dumps({
                                    "event": "media", "streamSid": stream_sid,
                                    "media": {"payload": audio_data},
                                }))
                elif ev == "media":
                    audio_buf.add(msg["media"]["payload"], time.time())
                    speaking = True
                elif ev == "stop":
                    end_reason = "caller_hangup"
                    break

        async def utterance_processor():
            nonlocal speaking, responding
            while True:
                await asyncio.sleep(0.1)
                if not speaking:
                    continue
                if audio_buf.is_silent or audio_buf.too_long:
                    audio_data = audio_buf.flush()
                    if not audio_data:
                        continue
                    speaking = False
                    responding = True
                    try:
                        stt_text = await _google_stt(audio_data, stt_language)
                        if not stt_text or not stt_text.strip():
                            log.warning("Google STT returned empty for call %s (buf len=%d)", call_id, len(audio_data))
                            responding = False
                            continue
                        log.info("Google STT transcribed for call %s: %.80s", call_id, stt_text)
                        response_text = await _llm_turn(stt_text)
                        if response_text and stream_sid:
                            tts_audio = await _synthesize(response_text)
                            if tts_audio:
                                await ws.send_text(json.dumps({
                                    "event": "media", "streamSid": stream_sid,
                                    "media": {"payload": tts_audio},
                                }))
                    except Exception as ex:
                        log.warning("utterance_processor error on call %s: %s", call_id, ex)
                    finally:
                        responding = False

        async def duration_guard():
            await asyncio.sleep(max_duration_s)
            nonlocal end_reason
            end_reason = "duration_limit"
            if call.get("twilio_call_sid"):
                await twilio_client.hangup_call(call["twilio_call_sid"])
            await ws.close(code=1000)

        tasks = [
            asyncio.create_task(twilio_reader(), name="twilio_reader"),
            asyncio.create_task(utterance_processor(), name="utterance_processor"),
            asyncio.create_task(duration_guard(), name="duration_guard"),
        ]

        try:
            done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
            for exc_task in done:
                exc = exc_task.exception()
                if exc and end_reason == "unknown":
                    end_reason = "error"
                    log.warning("voice_google task %s errored on call %s: %s",
                                exc_task.get_name(), call_id, exc)
        finally:
            for t in tasks:
                if not t.done():
                    t.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)

    except WebSocketDisconnect:
        end_reason = "client_disconnect" if end_reason == "unknown" else end_reason
    except Exception as ex:
        log.warning("voice_google error on call %s: %s", call_id, ex)
        end_reason = "error" if end_reason == "unknown" else end_reason
    finally:
        await finalize()
