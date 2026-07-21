"""Voice EQ — AI calling agent (Twilio + OpenAI Realtime).

Enterprise SDR agent: places outbound calls via Twilio, handles inbound calls,
conducts conversational qualification via OpenAI Realtime, and writes outcomes
back into the CRM pipeline. Provider-agnostic interface at the module boundary
so future providers (Vapi, Bland, ElevenLabs, SIP) can be swapped in without
touching the campaign engine or post-call pipeline.
"""

import os
import json
import secrets
import asyncio
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

from server import db, current_user, now_iso, new_id, _audit, _rate_ok, STAGES, _llm_chat, _extract_json, ANTHROPIC_API_KEY, _log_activity
from twilio_client import twilio_client, TWILIO_MOCKED, TWILIO_FROM_NUMBER
from openai_realtime_client import OPENAI_MOCKED, TELEPHONY_SAFE_VOICES, DEFAULT_VOICE

log = logging.getLogger(__name__)

GOOGLE_MOCKED = not bool(os.environ.get("GOOGLE_API_KEY", ""))

voice_router = APIRouter(prefix="/voice-eq")
voice_public_router = APIRouter()

PUBLIC_BASE_URL = os.environ.get("PUBLIC_BASE_URL", "") or "https://lividly-lividly-bash.ngrok-free.dev"

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

TELEPHONY_VOICES = TELEPHONY_SAFE_VOICES
OPENAI_MODELS = ["gpt-realtime-2.1", "gpt-realtime-2.1-mini", "gpt-realtime-2", "gpt-realtime-1.5", "gpt-realtime", "gpt-realtime-mini"]
SPEAKING_STYLES = ["professional", "consultative", "friendly", "luxury", "healthcare", "legal", "finance", "corporate", "energetic", "technical"]
RESPONSE_STYLES = ["concise", "detailed", "natural", "conversational", "persuasive", "educational"]
INTERRUPT_MODES = ["never", "balanced", "aggressive"]
LANGUAGES = ["en-US", "en-GB", "en-AU", "en-IN", "ar-SA", "hi-IN", "es-ES", "fr-FR", "de-DE", "pt-BR", "ja-JP", "ko-KR", "zh-CN"]


class QualificationField(BaseModel):
    key: str
    prompt: str = ""
    type: str = "string"


class AgentConfig(BaseModel):
    """All configurable parameters for a voice agent."""
    voice: str = DEFAULT_VOICE
    language: str = "en-US"
    speaking_speed: float = Field(1.0, ge=0.5, le=2.0)
    temperature: float = Field(0.7, ge=0.0, le=1.0)
    interrupt_sensitivity: str = "balanced"
    model: str = "gpt-realtime-2.1"
    speaking_style: str = "professional"
    response_style: str = "conversational"
    max_duration_minutes: int = Field(10, ge=1, le=60)
    silence_timeout_seconds: int = Field(15, ge=5, le=60)
    voicemail_detection: bool = True
    amd_enabled: bool = True
    background_noise_suppression: bool = True
    call_recording: bool = True
    human_handoff_enabled: bool = False
    handoff_number: str = ""
    accent: str = "neutral"
    qualification_framework: str = "custom"
    qualification_fields: List[QualificationField] = []
    knowledge_base: str = ""
    crm_context_level: str = "full_lead"
    post_call_pipeline: bool = True
    post_call_action: str = "none"

    # Google provider fields
    google_voice: str = "en-US-Studio-Q"
    google_stt_language: str = "en-US"

    # Custom greeting message (played immediately on call connect)
    greeting_message: str = ""

    # Volume gain in dB applied to AI speech before sending to Twilio.
    # Positive values (e.g. +3) boost volume; negative values reduce it.
    # Applied only to the twilio_openai provider (OpenAI Realtime audio path).
    volume_gain_db: float = Field(3.0, ge=-6.0, le=12.0)


class VoiceAgentIn(BaseModel):
    name: str
    persona_prompt: str
    inbound_enabled: bool = False
    outbound_enabled: bool = True
    provider: str = "twilio_openai"
    config: AgentConfig = AgentConfig()


class ClickToCallIn(BaseModel):
    lead_id: str
    agent_id: str


class RetryPolicy(BaseModel):
    max_attempts: int = 1
    retry_after_minutes: int = 60
    retry_on: List[str] = ["no_answer", "voicemail", "busy"]


class VoiceCampaignIn(BaseModel):
    name: str
    goal: str = "Qualify leads"
    agent_id: str
    lead_ids: List[str] = []
    send_window_start: str = "09:00"
    send_window_end: str = "17:00"
    timezone: str = "UTC"
    max_concurrent_calls: int = Field(5, ge=1, le=50)
    retry_policy: RetryPolicy = RetryPolicy()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _lookup_ws_token(token: str) -> Dict[str, Any]:
    hook = await db.webhooks.find_one({"token": token, "kind": "voice_ws"}, {"_id": 0})
    if not hook or not hook.get("active", True):
        raise HTTPException(404, "webhook not found")
    return hook


async def _get_or_create_ws_token(workspace_id: str) -> Dict[str, Any]:
    hook = await db.webhooks.find_one({"workspace_id": workspace_id, "kind": "voice_ws"}, {"_id": 0})
    if hook:
        return hook
    hook = {
        "id": new_id(), "workspace_id": workspace_id, "kind": "voice_ws",
        "name": "Voice EQ Twilio media stream",
        "token": secrets.token_urlsafe(24), "active": True,
        "created_at": now_iso(), "call_count": 0, "last_called_at": None,
    }
    await db.webhooks.insert_one(hook)
    hook.pop("_id", None)
    return hook


async def _get_or_create_inbound_hook(workspace_id: str) -> Dict[str, Any]:
    hook = await db.webhooks.find_one({"workspace_id": workspace_id, "kind": "voice_inbound"}, {"_id": 0})
    if hook:
        return hook
    hook = {
        "id": new_id(), "workspace_id": workspace_id, "kind": "voice_inbound",
        "name": "Voice EQ inbound calls",
        "token": secrets.token_urlsafe(24), "active": True,
        "created_at": now_iso(), "call_count": 0, "last_called_at": None,
    }
    await db.webhooks.insert_one(hook)
    hook.pop("_id", None)
    return hook


async def _pick_from_number(workspace_id: str) -> str:
    numbers = await db.voice_numbers.find(
        {"workspace_id": workspace_id}, {"_id": 0}
    ).to_list(50)
    if numbers:
        return numbers[0]["phone_number"]
    return TWILIO_FROM_NUMBER or "+10000000000"


def _blank_call_doc(*, workspace_id: str, lead: Dict[str, Any], agent_id: str,
                    campaign_id: Optional[str], from_number: str, to_number: str,
                    call_id: Optional[str] = None, direction: str = "outbound",
                    twilio_call_sid: Optional[str] = None,
                    provider: str = "twilio_openai") -> Dict[str, Any]:
    doc = {
        "id": call_id or new_id(), "workspace_id": workspace_id,
        "lead_id": lead["id"], "agent_id": agent_id, "campaign_id": campaign_id,
        "provider": provider,
        "twilio_call_sid": twilio_call_sid,
        "direction": direction,
        "from_number": from_number, "to_number": to_number,
        "status": "registered",
        "disconnection_reason": None, "started_at": now_iso(), "ended_at": None,
        "duration_seconds": None, "recording_url": None,
        "transcript": None, "transcript_object": None,
        "sentiment": None, "call_successful": None, "summary": None,
        "qualification": None, "next_best_action": None,
        "bant_score": None, "pain_points": [], "objections": [],
        "competitors_mentioned": [], "intent_extracted": None,
        "follow_up_action": None, "follow_up_scheduled": None,
        "crm_updated": False, "cost_cents": 0,
        "metadata": {"lead_snapshot": {k: lead.get(k) for k in ("first_name", "last_name", "company", "title", "industry", "website")}},
        "deal_id": None,
        "created_at": now_iso(), "updated_at": now_iso(),
    }
    return doc


async def _is_dnc(workspace_id: str, lead: Dict[str, Any]) -> bool:
    if lead.get("dnc"):
        return True
    phone = lead.get("phone")
    if not phone:
        return False
    hit = await db.suppressions.find_one({"workspace_id": workspace_id, "channel": "phone", "phone": phone})
    return bool(hit)


async def _settle_call_billing(workspace_id: str, call_id: str, duration_seconds: Optional[int]) -> int:
    from billing import charge_credits, minutes_for_call, CREDIT_COSTS
    mins = minutes_for_call(duration_seconds)
    await charge_credits(
        workspace_id, "voice_call_minute", units=mins,
        meta={"call_id": call_id, "duration_seconds": duration_seconds},
        allow_overdraft=True,
    )
    return mins * CREDIT_COSTS["voice_call_minute"]


def _build_system_prompt(agent: Dict[str, Any], lead: Optional[Dict[str, Any]] = None) -> str:
    """Dynamically assemble the system prompt from agent config + CRM context."""
    config = agent.get("config", {})
    prompt = agent.get("persona_prompt", "")
    kb = config.get("knowledge_base", "")
    style = config.get("speaking_style", "professional")
    rstyle = config.get("response_style", "conversational")

    if kb:
        prompt += f"\n\n# Knowledge base (answer questions using these facts):\n{kb}"

    prompt += f"\n\n# Speaking style: {style}"
    prompt += f"\n# Response style: {rstyle}"
    prompt += f"\n# Language: {config.get('language', 'en-US')}"

    if lead and config.get("crm_context_level") != "none":
        prompt += f"\n\n# Lead context (do NOT ask for this info — you already have it):"
        prompt += f"\n- Name: {lead.get('first_name', '')} {lead.get('last_name', '')}"
        prompt += f"\n- Company: {lead.get('company', 'Unknown')}"
        prompt += f"\n- Title: {lead.get('title', 'Unknown')}"
        if lead.get("industry"):
            prompt += f"\n- Industry: {lead['industry']}"
        if lead.get("website"):
            prompt += f"\n- Website: {lead['website']}"

    if config.get("qualification_framework") == "BANT":
        prompt += (
            "\n\n# Qualification framework: BANT"
            "\nDuring the conversation, discreetly gather:"
            "\n- Budget: Do they have budget allocated?"
            "\n- Authority: Are they the decision maker?"
            "\n- Need: What specific problem are they solving?"
            "\n- Timeline: When do they need a solution?"
        )

    return prompt


_MOCK_TRANSCRIPT_TURNS = [
    ("agent", "Hi, this is calling on behalf of the team — got a quick minute?"),
    ("caller", "Sure, what's this about?"),
    ("agent", "We help teams automate outbound calling end to end. Curious how you're handling that today."),
    ("caller", "That's actually something we've been looking at. Can you send more info?"),
    ("agent", "Absolutely, I'll have that sent over. Thanks for your time!"),
]


def _mock_call_outcome(lead: Dict[str, Any]) -> Dict[str, Any]:
    transcript = "\n".join(f"{r}: {t}" for r, t in _MOCK_TRANSCRIPT_TURNS)
    return {
        "status": "ended", "duration_seconds": 47,
        "transcript": transcript,
        "transcript_object": [{"role": r, "content": t} for r, t in _MOCK_TRANSCRIPT_TURNS],
        "sentiment": "positive", "call_successful": True,
        "summary": f"Reached {lead.get('first_name') or 'the lead'}, introduced the offering — asked for more info, good engagement.",
        "qualification": {"interest_level": "warm", "requested_follow_up": "send more info"},
    }


# ---------------------------------------------------------------------------
# Place call
# ---------------------------------------------------------------------------

async def _place_call(*, workspace_id: str, agent: Dict[str, Any], lead: Dict[str, Any],
                      campaign_id: Optional[str] = None) -> Dict[str, Any]:
    """Place an outbound call through Twilio + OpenAI Realtime."""
    to_number = lead["phone"]
    from_number = await _pick_from_number(workspace_id)

    provider = agent.get("provider", "twilio_openai")
    if TWILIO_MOCKED or OPENAI_MOCKED or (provider == "google_provider" and GOOGLE_MOCKED):
        call_doc = _blank_call_doc(
            workspace_id=workspace_id, lead=lead, agent_id=agent["id"],
            campaign_id=campaign_id, from_number=from_number, to_number=to_number,
            provider=provider,
        )
        outcome = _mock_call_outcome(lead)
        call_doc.update(outcome)
        call_doc["ended_at"] = now_iso()
        await db.calls.insert_one(call_doc)
        call_doc.pop("_id", None)
        await _settle_call_billing(workspace_id, call_doc["id"], outcome["duration_seconds"])
        await _cascade_call_analyzed(workspace_id, call_doc["id"], call_doc)
        return {**call_doc, "mocked": True}

    ws_hook = await _get_or_create_ws_token(workspace_id)
    call_id = new_id()
    call_doc = _blank_call_doc(
        workspace_id=workspace_id, lead=lead, agent_id=agent["id"],
        campaign_id=campaign_id, from_number=from_number, to_number=to_number,
        call_id=call_id, provider=provider,
    )
    await db.calls.insert_one(call_doc)
    call_doc.pop("_id", None)

    if provider == "google_provider":
        twiml_url = f"{PUBLIC_BASE_URL}/api/hooks/voice-google-twiml/{ws_hook['token']}/{call_id}"
        status_callback_url = f"{PUBLIC_BASE_URL}/api/hooks/voice-google-status/{ws_hook['token']}/{call_id}"
    else:
        twiml_url = f"{PUBLIC_BASE_URL}/api/hooks/voice-twiml/{ws_hook['token']}/{call_id}"
        status_callback_url = f"{PUBLIC_BASE_URL}/api/hooks/voice-status/{ws_hook['token']}/{call_id}"
    result = await twilio_client.create_phone_call(
        from_number=from_number, to_number=to_number, twiml_url=twiml_url,
        status_callback_url=status_callback_url,
        voicemail_detection=agent.get("config", {}).get("voicemail_detection", True),
    )
    patch = {
        "twilio_call_sid": result.get("call_id"),
        "status": result.get("call_status", call_doc["status"]),
        "updated_at": now_iso(),
    }
    await db.calls.update_one({"id": call_id}, {"$set": patch})

    # Pre-generate greeting audio for Google provider (reduces first-audio latency)
    if provider == "google_provider" and not result.get("mocked"):
        asyncio.ensure_future(_pre_greeting_for_call(workspace_id, call_id, agent, lead))

    return {**call_doc, **patch, "mocked": result.get("mocked", TWILIO_MOCKED)}


async def _pre_greeting_for_call(workspace_id: str, call_id: str, agent: Dict[str, Any], lead: Dict[str, Any]) -> None:
    """Pre-generate the greeting audio for a Google provider call so it's ready
    when the WebSocket connects — eliminates the 3-8s first-audio latency."""
    try:
        cfg = agent.get("config", {})
        greeting_text = cfg.get("greeting_message", "")
        if not greeting_text:
            # Generate greeting from Claude
            prompt = agent.get("persona_prompt", "")
            kb = cfg.get("knowledge_base", "")
            if kb:
                prompt += f"\n\n# Knowledge base:\n{kb}"
            system_context = f"Conversation with {lead.get('first_name', 'lead')} from {lead.get('company', 'their company')}."
            greeting_text = await _llm_chat(
                prompt + f"\n\n{system_context}",
                "[System: Begin the conversation with a warm greeting and qualify the lead naturally. Keep it to 2-3 sentences.]",
                f"veq-pre-{new_id()[:8]}"
            )
        if not greeting_text:
            return
        from voice_google_provider import _google_tts, store_greeting_audio
        voice = cfg.get("google_voice", "en-US-Wavenet-D")
        rate = float(cfg.get("speaking_speed", 1.0))
        audio = await _google_tts(greeting_text, voice, rate)
        if audio:
            store_greeting_audio(call_id, audio)
            log.info("Pre-generated greeting audio for call %s (%d chars → %d bytes)", call_id, len(greeting_text), len(audio))
    except Exception as ex:
        log.warning("Pre-greeting failed for call %s: %s", call_id, ex)


# ---------------------------------------------------------------------------
# CRM Cascade
# ---------------------------------------------------------------------------

async def _generate_next_best_action(lead: Dict[str, Any], summary: str, qualification: Dict[str, Any]) -> str:
    if ANTHROPIC_API_KEY and summary:
        system = (
            "Given a sales call summary and extracted qualification data, suggest ONE concrete next action "
            "for the sales rep, under 20 words. STRICT JSON: {\"next_action\": str}"
        )
        user_text = f"Lead: {lead.get('first_name')} at {lead.get('company')}\nSummary: {summary}\nQualification: {json.dumps(qualification or {})}"
        try:
            resp = await _llm_chat(system, user_text, f"veq-nba-{lead.get('id', '')[:8]}")
            parsed = _extract_json(resp)
            if parsed and parsed.get("next_action"):
                return parsed["next_action"]
        except Exception:
            pass
    return "Follow up with a personalized email referencing the call." if summary else "Review the call and decide on a follow-up."


async def _analyze_transcript(transcript: str) -> Dict[str, Any]:
    system = (
        "Analyze this phone call transcript between an AI sales agent and a prospect. "
        "STRICT JSON only: {\"sentiment\": \"positive\"|\"neutral\"|\"negative\", "
        "\"call_successful\": bool, \"summary\": str (one sentence), "
        "\"qualification\": {\"interest_level\": str, \"notes\": str}, "
        "\"bant_score\": {\"budget\": int 0-100, \"authority\": int 0-100, "
        "\"need\": int 0-100, \"timeline\": int 0-100}, "
        "\"pain_points\": [str], \"objections\": [str], "
        "\"competitors_mentioned\": [str], \"intent\": str}"
    )
    try:
        resp = await _llm_chat(system, transcript[:6000], f"veq-analyze-{new_id()[:8]}")
        parsed = _extract_json(resp)
        if parsed:
            return parsed
    except Exception as ex:
        pass
    return {"sentiment": "neutral", "call_successful": None, "summary": "", "qualification": {},
            "bant_score": None, "pain_points": [], "objections": [], "competitors_mentioned": [], "intent": None}


async def _cascade_call_analyzed(workspace_id: str, call_id: str, call_doc: Dict[str, Any]) -> None:
    lead = await db.leads.find_one({"id": call_doc["lead_id"], "workspace_id": workspace_id}, {"_id": 0})
    if not lead:
        return

    successful = call_doc.get("call_successful")
    sentiment = call_doc.get("sentiment")
    if successful:
        new_status = "qualified"
    elif successful is False and sentiment == "negative":
        new_status = "not_interested"
    else:
        new_status = "contacted"

    await db.leads.update_one(
        {"id": lead["id"]},
        {"$set": {"status": new_status, "last_contacted_at": now_iso()}}
    )

    deal_id = call_doc.get("deal_id")
    if successful and not deal_id:
        existing_deal = await db.deals.find_one({"lead_id": lead["id"], "workspace_id": workspace_id}, {"_id": 0})
        if existing_deal:
            deal_id = existing_deal["id"]
            if existing_deal.get("stage") == "new":
                await db.deals.update_one({"id": deal_id}, {"$set": {"stage": "qualified"}})
        else:
            deal_id = new_id()
            await db.deals.insert_one({
                "id": deal_id, "workspace_id": workspace_id, "lead_id": lead["id"],
                "title": f"{lead.get('company') or lead['first_name']} — qualified by Voice EQ",
                "value": 5000, "stage": "qualified", "currency": "USD",
                "source_call_id": call_id, "created_at": now_iso(),
            })
        await db.calls.update_one({"id": call_id}, {"$set": {"deal_id": deal_id}})
        await db.events.insert_one({
            "id": new_id(), "workspace_id": workspace_id, "campaign_id": call_doc.get("campaign_id"),
            "lead_id": lead["id"], "type": "meeting_booked", "at": now_iso(), "source": "voice_eq",
        })

    from billing import charge_credits
    try:
        await charge_credits(workspace_id, "next_best_action", meta={"call_id": call_id}, allow_overdraft=True)
        next_action = await _generate_next_best_action(lead, call_doc.get("summary", ""), call_doc.get("qualification") or {})
    except HTTPException:
        next_action = ""
    await db.calls.update_one({"id": call_id}, {"$set": {"next_best_action": next_action}})

    outcome = "qualified" if successful else ("not interested" if new_status == "not_interested" else "inconclusive")
    await _log_activity(workspace_id, lead["id"], "voice", "call_analyzed",
                         f"Call analyzed — {outcome}: {(call_doc.get('summary') or '')[:100]}",
                         {"call_id": call_id, "sentiment": sentiment, "deal_id": deal_id})

    if successful:
        await db.events.insert_one({
            "id": new_id(), "workspace_id": workspace_id, "campaign_id": call_doc.get("campaign_id"),
            "lead_id": lead["id"], "type": "call_follow_up_recommended", "at": now_iso(),
            "meta": {"call_id": call_id, "next_best_action": next_action},
        })

    await _audit({"workspace_id": workspace_id, "id": "system", "email": "system@voice-eq"},
                 "voice_eq.call.cascade", {
                     "call_id": call_id, "lead_id": lead["id"],
                     "new_status": new_status, "deal_id": deal_id,
                 })


# ---------------------------------------------------------------------------
# Voice Agents
# ---------------------------------------------------------------------------

@voice_router.get("/agents")
async def list_voice_agents(user=Depends(current_user)):
    return await db.voice_agents.find(
        {"workspace_id": user["workspace_id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)


@voice_router.post("/agents")
async def create_voice_agent(body: VoiceAgentIn, user=Depends(current_user)):
    print("=== VOICE_AGENT CREATE CALLED (NEW CODE) ===", flush=True)
    doc = body.model_dump()
    print(f"=== DOC TYPE: {type(doc)}, KEYS: {list(doc.keys())}", flush=True)
    doc.update({
        "id": new_id(), "workspace_id": user["workspace_id"], "owner_id": user["id"],
        "status": "ready", "version": 1,
        "created_at": now_iso(), "updated_at": now_iso(),
    })
    await db.voice_agents.insert_one(doc)
    doc.pop("_id", None)
    await _audit(user, "voice_eq.agent.create", {"id": doc["id"], "name": doc["name"]})
    return {**doc, "twilio_mocked": TWILIO_MOCKED, "openai_mocked": OPENAI_MOCKED}


@voice_router.get("/agents/{aid}")
async def get_voice_agent(aid: str, user=Depends(current_user)):
    a = await db.voice_agents.find_one({"id": aid, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not a:
        raise HTTPException(404, "not found")
    return a


@voice_router.put("/agents/{aid}")
async def update_voice_agent(aid: str, body: VoiceAgentIn, user=Depends(current_user)):
    existing = await db.voice_agents.find_one({"id": aid, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "not found")
    patch = body.model_dump()
    patch["updated_at"] = now_iso()
    patch["version"] = existing.get("version", 1) + 1
    await db.voice_agents.update_one({"id": aid, "workspace_id": user["workspace_id"]}, {"$set": patch})
    return await get_voice_agent(aid, user)


@voice_router.delete("/agents/{aid}")
async def delete_voice_agent(aid: str, user=Depends(current_user)):
    await db.voice_agents.delete_one({"id": aid, "workspace_id": user["workspace_id"]})
    await _audit(user, "voice_eq.agent.delete", {"id": aid})
    return {"ok": True}


@voice_router.get("/agents/{aid}/inbound-url")
async def get_inbound_webhook_url(aid: str, user=Depends(current_user)):
    a = await db.voice_agents.find_one({"id": aid, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not a:
        raise HTTPException(404, "not found")
    hook = await _get_or_create_inbound_hook(user["workspace_id"])
    url = f"{PUBLIC_BASE_URL}/api/hooks/voice-incoming/{hook['token']}" if PUBLIC_BASE_URL else None
    return {"url": url, "token": hook["token"], "agent_id": aid}


@voice_router.get("/voices")
async def list_available_voices():
    return {
        "voices": TELEPHONY_VOICES,
        "descriptions": {
            "alloy": "Neutral, versatile — good all-purpose voice",
            "echo": "Warm, empathetic — suited for support conversations",
            "shimmer": "Bright, articulate — professional and clear",
            "ash": "Deep, authoritative — commands attention",
            "ballad": "Smooth, melodic — easy to listen to",
            "coral": "Friendly, approachable — puts prospects at ease",
            "sage": "Calm, measured — ideal for consultative selling",
            "verse": "Energetic, dynamic — good for high-energy pitches",
        },
        "telephony_optimized": True,
    }


@voice_router.get("/models")
async def list_available_models():
    return {
        "models": [
            {"id": "gpt-realtime-2.1", "name": "GPT Realtime 2.1", "description": "Latest — best quality, recommended", "multilingual": True, "max_duration": 60},
            {"id": "gpt-realtime-2.1-mini", "name": "GPT Realtime 2.1 Mini", "description": "Faster, cheaper — good for simple qualification", "multilingual": True, "max_duration": 60},
            {"id": "gpt-realtime-2", "name": "GPT Realtime 2", "description": "Previous generation — stable", "multilingual": True, "max_duration": 60},
        ]
    }


@voice_router.get("/speaking-styles")
async def list_speaking_styles():
    return {"styles": SPEAKING_STYLES}


@voice_router.get("/response-styles")
async def list_response_styles():
    return {"styles": RESPONSE_STYLES}


@voice_router.get("/languages")
async def list_languages():
    return {"languages": LANGUAGES}


# ---------------------------------------------------------------------------
# Calls
# ---------------------------------------------------------------------------

@voice_router.post("/calls/click-to-call")
async def click_to_call(body: ClickToCallIn, user=Depends(current_user)):
    lead = await db.leads.find_one({"id": body.lead_id, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "lead not found")
    phone = lead.get("phone")
    if not phone:
        raise HTTPException(400, "lead has no phone number")
    if await _is_dnc(user["workspace_id"], lead):
        raise HTTPException(400, "lead is on the do-not-call list")
    agent = await db.voice_agents.find_one({"id": body.agent_id, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not agent:
        raise HTTPException(404, "agent not found")
    if not await _rate_ok(user):
        raise HTTPException(429, "daily quota exceeded")
    from billing import check_credits
    await check_credits(user["workspace_id"], "voice_call_minute")

    call_doc = await _place_call(workspace_id=user["workspace_id"], agent=agent, lead=lead)
    await _audit(user, "voice_eq.call.click_to_call", {"call_id": call_doc["id"], "lead_id": lead["id"]})
    await _log_activity(user["workspace_id"], lead["id"], "voice", "call_placed",
                         f"Called {lead.get('first_name', 'lead')} via {agent['name']}", {"call_id": call_doc["id"]})
    return call_doc


@voice_router.post("/calls/{call_id}/end")
async def end_call(call_id: str, user=Depends(current_user)):
    call = await db.calls.find_one({"id": call_id, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not call:
        raise HTTPException(404, "not found")
    if call.get("twilio_call_sid") and not str(call["twilio_call_sid"]).startswith("mock-"):
        await twilio_client.hangup_call(call["twilio_call_sid"])
    await db.calls.update_one({"id": call_id}, {"$set": {"status": "ended", "ended_at": now_iso(), "updated_at": now_iso()}})
    return {"ok": True}


@voice_router.post("/calls/{call_id}/transfer")
async def transfer_call(call_id: str, body: Dict[str, str], user=Depends(current_user)):
    target = body.get("target") or body.get("phone_number")
    if not target:
        raise HTTPException(400, "target phone number required")
    call = await db.calls.find_one({"id": call_id, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not call:
        raise HTTPException(404, "not found")
    if call.get("twilio_call_sid") and not str(call["twilio_call_sid"]).startswith("mock-"):
        from twilio.rest import Client
        from twilio_client import TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
        if TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN:
            import asyncio
            client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
            await asyncio.to_thread(
                client.calls(call["twilio_call_sid"]).update,
                twiml=f'<Response><Dial>{target}</Dial></Response>',
            )
    await db.calls.update_one({"id": call_id}, {"$set": {
        "status": "transferred", "transfer_target": target, "updated_at": now_iso(),
    }})
    await _log_activity(user["workspace_id"], call["lead_id"], "voice", "call_transferred",
                         f"Call transferred to {target}", {"call_id": call_id})
    return {"ok": True}


@voice_router.get("/calls")
async def list_calls(campaign_id: Optional[str] = None, lead_id: Optional[str] = None,
                     status: Optional[str] = None, user=Depends(current_user)):
    q: Dict[str, Any] = {"workspace_id": user["workspace_id"]}
    if campaign_id:
        q["campaign_id"] = campaign_id
    if lead_id:
        q["lead_id"] = lead_id
    if status:
        q["status"] = status
    items = await db.calls.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)
    for c in items:
        c["lead"] = await db.leads.find_one({"id": c["lead_id"]}, {"_id": 0, "first_name": 1, "last_name": 1, "company": 1, "email": 1})
    return items


@voice_router.get("/calls/active")
async def list_active_calls(user=Depends(current_user)):
    items = await db.calls.find(
        {"workspace_id": user["workspace_id"], "status": {"$in": ["registered", "ongoing"]}}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    for c in items:
        c["lead"] = await db.leads.find_one({"id": c["lead_id"]}, {"_id": 0, "first_name": 1, "last_name": 1, "company": 1}) if c.get("lead_id") else None
    return items


@voice_router.get("/calls/{call_id}")
async def get_call_detail(call_id: str, user=Depends(current_user)):
    c = await db.calls.find_one({"id": call_id, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not c:
        raise HTTPException(404, "not found")
    c["lead"] = await db.leads.find_one({"id": c["lead_id"]}, {"_id": 0}) if c.get("lead_id") else None
    return c


# ---------------------------------------------------------------------------
# Numbers / DNC
# ---------------------------------------------------------------------------

@voice_router.get("/numbers")
async def list_voice_numbers(user=Depends(current_user)):
    return await db.voice_numbers.find({"workspace_id": user["workspace_id"]}, {"_id": 0}).to_list(50)


@voice_router.post("/numbers/import")
async def import_voice_number(body: Dict[str, str], user=Depends(current_user)):
    phone_number = (body.get("phone_number") or "").strip()
    if not phone_number:
        raise HTTPException(400, "phone_number required")
    doc = {
        "id": new_id(), "workspace_id": user["workspace_id"], "phone_number": phone_number,
        "provider": "twilio_openai",
        "nickname": body.get("nickname", ""), "capabilities": ["outbound", "inbound"],
        "imported_at": now_iso(),
    }
    await db.voice_numbers.insert_one(doc)
    doc.pop("_id", None)
    await _audit(user, "voice_eq.number.import", {"phone_number": phone_number})
    return {**doc, "mocked": TWILIO_MOCKED}


@voice_router.delete("/numbers/{nid}")
async def delete_voice_number(nid: str, user=Depends(current_user)):
    await db.voice_numbers.delete_one({"id": nid, "workspace_id": user["workspace_id"]})
    return {"ok": True}


@voice_router.post("/dnc")
async def add_phone_to_dnc(body: Dict[str, str], user=Depends(current_user)):
    phone = (body.get("phone") or "").strip()
    if not phone:
        raise HTTPException(400, "phone required")
    await db.suppressions.update_one(
        {"workspace_id": user["workspace_id"], "channel": "phone", "phone": phone},
        {"$set": {"workspace_id": user["workspace_id"], "channel": "phone", "phone": phone, "created_at": now_iso()}},
        upsert=True,
    )
    await _audit(user, "voice_eq.dnc.add", {"phone": phone})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Voice Campaigns
# ---------------------------------------------------------------------------

async def _voice_campaign_stats(cid: str, wid: str) -> Dict[str, Any]:
    calls = await db.calls.find({"campaign_id": cid, "workspace_id": wid}, {"_id": 0}).to_list(5000)
    total_seconds = sum(c.get("duration_seconds") or 0 for c in calls)
    return {
        "calls_placed": len(calls),
        "connected": sum(1 for c in calls if c["status"] in ("ended", "ongoing")),
        "voicemail": sum(1 for c in calls if c.get("disconnection_reason") == "voicemail"),
        "qualified": sum(1 for c in calls if c.get("call_successful")),
        "meetings_booked": sum(1 for c in calls if c.get("deal_id")),
        "avg_duration": round(total_seconds / len(calls), 1) if calls else 0,
        "total_minutes": round(total_seconds / 60, 1),
    }


@voice_router.get("/campaigns")
async def list_voice_campaigns(user=Depends(current_user)):
    items = await db.voice_campaigns.find(
        {"workspace_id": user["workspace_id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    for c in items:
        c["stats"] = await _voice_campaign_stats(c["id"], user["workspace_id"])
    return items


@voice_router.post("/campaigns")
async def create_voice_campaign(body: VoiceCampaignIn, user=Depends(current_user)):
    c = body.model_dump()
    c.update({
        "id": new_id(), "workspace_id": user["workspace_id"], "owner_id": user["id"],
        "provider": "twilio_openai",
        "direction": "outbound", "status": "draft", "launched_at": None, "created_at": now_iso(),
    })
    await db.voice_campaigns.insert_one(c)
    c.pop("_id", None)
    if c.get("lead_ids"):
        await db.leads.update_many(
            {"id": {"$in": c["lead_ids"]}},
            {"$addToSet": {"campaign_ids": c["id"]}},
        )
    return c


@voice_router.get("/campaigns/{cid}")
async def get_voice_campaign(cid: str, user=Depends(current_user)):
    c = await db.voice_campaigns.find_one({"id": cid, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not c:
        raise HTTPException(404, "not found")
    c["stats"] = await _voice_campaign_stats(cid, user["workspace_id"])
    return c


@voice_router.put("/campaigns/{cid}")
async def update_voice_campaign(cid: str, body: VoiceCampaignIn, user=Depends(current_user)):
    old = await db.voice_campaigns.find_one({"id": cid, "workspace_id": user["workspace_id"]}, {"_id": 0, "lead_ids": 1})
    new_ids = body.lead_ids
    old_ids = (old or {}).get("lead_ids", [])
    await db.voice_campaigns.update_one(
        {"id": cid, "workspace_id": user["workspace_id"]}, {"$set": body.model_dump()}
    )
    added = [lid for lid in new_ids if lid not in old_ids]
    removed = [lid for lid in old_ids if lid not in new_ids]
    if added:
        await db.leads.update_many({"id": {"$in": added}}, {"$addToSet": {"campaign_ids": cid}})
    if removed:
        await db.leads.update_many({"id": {"$in": removed}}, {"$pull": {"campaign_ids": cid}})
    return await get_voice_campaign(cid, user)


@voice_router.delete("/campaigns/{cid}")
async def delete_voice_campaign(cid: str, user=Depends(current_user)):
    c = await db.voice_campaigns.find_one({"id": cid, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not c:
        raise HTTPException(404, "not found")
    await db.voice_campaigns.delete_one({"id": cid, "workspace_id": user["workspace_id"]})
    await _audit(user, "voice_eq.campaign.delete", {"campaign_id": cid})
    return {"ok": True}


@voice_router.post("/campaigns/{cid}/launch")
async def launch_voice_campaign(cid: str, user=Depends(current_user)):
    c = await db.voice_campaigns.find_one({"id": cid, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not c:
        raise HTTPException(404, "not found")
    agent = await db.voice_agents.find_one({"id": c["agent_id"], "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not agent:
        raise HTTPException(400, "voice agent not found")

    from billing import check_credits, get_balance, CREDIT_COSTS
    await check_credits(user["workspace_id"], "voice_call_minute")

    await db.voice_campaigns.update_one({"id": cid}, {"$set": {"status": "active", "launched_at": now_iso()}})
    await _audit(user, "voice_eq.campaign.launch", {"campaign_id": cid})

    cap = max(1, int(c.get("max_concurrent_calls") or 5))
    ongoing = await db.calls.count_documents({
        "workspace_id": user["workspace_id"], "provider": "twilio_openai",
        "status": {"$in": ["registered", "ongoing"]},
    })
    concurrency_cap = max(0, cap - ongoing)

    placed, skipped, skipped_capacity, halted_no_credits = 0, 0, 0, False
    for lid in c.get("lead_ids", []):
        if await get_balance(user["workspace_id"]) < CREDIT_COSTS["voice_call_minute"] * (placed + 1):
            halted_no_credits = True
            break
        if placed >= concurrency_cap:
            skipped_capacity += 1
            continue
        lead = await db.leads.find_one({"id": lid, "workspace_id": user["workspace_id"]}, {"_id": 0})
        if not lead or not lead.get("phone") or await _is_dnc(user["workspace_id"], lead):
            skipped += 1
            continue
        call_doc = await _place_call(
            workspace_id=user["workspace_id"], agent=agent, lead=lead, campaign_id=cid,
        )
        await _log_activity(user["workspace_id"], lead["id"], "voice", "call_placed",
                             f"Called {lead.get('first_name', 'lead')} via campaign {c['name']}",
                             {"call_id": call_doc["id"], "campaign_id": cid})
        placed += 1
    return {"ok": True, "status": "active", "calls_placed": placed, "skipped": skipped,
            "skipped_capacity": skipped_capacity, "halted_no_credits": halted_no_credits}


@voice_router.post("/campaigns/{cid}/pause")
async def pause_voice_campaign(cid: str, user=Depends(current_user)):
    await db.voice_campaigns.update_one(
        {"id": cid, "workspace_id": user["workspace_id"]}, {"$set": {"status": "paused"}}
    )
    return {"ok": True}


# ---------------------------------------------------------------------------
# Analytics
# ---------------------------------------------------------------------------

@voice_router.get("/analytics/usage")
async def voice_usage_analytics(user=Depends(current_user)):
    calls = await db.calls.find({"workspace_id": user["workspace_id"]}, {"_id": 0}).to_list(5000)
    total_minutes = round(sum(c.get("duration_seconds") or 0 for c in calls) / 60, 1)
    total_cost_cents = sum(c.get("cost_cents") or 0 for c in calls)
    by_day: Dict[str, Dict[str, Any]] = {}
    for c in calls:
        day = (c.get("created_at") or "")[:10]
        if not day:
            continue
        d = by_day.setdefault(day, {"day": day, "calls": 0, "minutes": 0.0, "connected": 0, "qualified": 0})
        d["calls"] += 1
        d["minutes"] += round((c.get("duration_seconds") or 0) / 60, 1)
        if c.get("status") == "ended":
            d["connected"] += 1
        if c.get("call_successful"):
            d["qualified"] += 1
    return {
        "total_calls": len(calls),
        "total_minutes": total_minutes,
        "total_cost_cents": total_cost_cents,
        "by_day": sorted(by_day.values(), key=lambda x: x["day"], reverse=True)[:30],
        "provider": "twilio_openai",
        "twilio_mocked": TWILIO_MOCKED,
        "openai_mocked": OPENAI_MOCKED,
    }


# ---------------------------------------------------------------------------
# Inbound call handling
# ---------------------------------------------------------------------------

@voice_public_router.post("/hooks/voice-incoming/{token}")
async def voice_incoming_webhook(token: str, request: Request):
    """PUBLIC. Twilio calls this when an inbound call arrives.
    Routes to the appropriate agent based on the called number."""
    hook = await db.webhooks.find_one({"token": token, "kind": "voice_inbound"}, {"_id": 0})
    if not hook or not hook.get("active", True):
        raise HTTPException(404, "webhook not found")
    form = await request.form()
    from_number = form.get("From", "")
    to_number = form.get("To", "")

    agent = await db.voice_agents.find_one({
        "workspace_id": hook["workspace_id"],
        "inbound_enabled": True,
    }, {"_id": 0}).sort("created_at", -1).to_list(1)

    if not agent:
        twiml = '<?xml version="1.0" encoding="UTF-8"?><Response><Say>Sorry, no agent is available to take your call.</Say></Response>'
        from fastapi.responses import Response
        return Response(content=twiml, media_type="application/xml")

    agent = agent[0]
    ws_hook = await _get_or_create_ws_token(hook["workspace_id"])
    call_id = new_id()

    lead = await db.leads.find_one({"phone": from_number, "workspace_id": hook["workspace_id"]}, {"_id": 0})
    if not lead:
        lid = new_id()
        lead = {"id": lid, "workspace_id": hook["workspace_id"],
                "first_name": "Unknown", "last_name": "", "email": "",
                "phone": from_number, "company": "", "title": "",
                "status": "new", "lead_source": "inbound_call",
                "created_at": now_iso()}
        await db.leads.insert_one(lead)
        lead.pop("_id", None)

    call_doc = _blank_call_doc(
        workspace_id=hook["workspace_id"], lead=lead, agent_id=agent["id"],
        campaign_id=None, from_number=to_number, to_number=from_number,
        call_id=call_id, direction="inbound",
    )
    await db.calls.insert_one(call_doc)
    call_doc.pop("_id", None)

    stream_url = f"{PUBLIC_BASE_URL.replace('https://', 'wss://', 1)}/api/hooks/voice-ws/{ws_hook['token']}/{call_id}"
    twiml = (
        f'<?xml version="1.0" encoding="UTF-8"?>'
        f'<Response><Connect><Stream url="{stream_url}" /></Connect></Response>'
    )
    from fastapi.responses import Response
    return Response(content=twiml, media_type="application/xml")
