"""Voice EQ — AI calling agent (Retell AI integration).

Third agent in the Innoira Agentic Suite: reads leads from the CRM, places
outbound calls via Retell, qualifies prospects conversationally, and writes
outcomes back into the deal pipeline.
"""

import os
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import json
import secrets

from server import db, current_user, now_iso, new_id, _audit, _rate_ok, STAGES, _llm_chat, _extract_json, ANTHROPIC_API_KEY, _log_activity
from retell_client import retell_client, RETELL_MOCKED

voice_router = APIRouter(prefix="/voice-eq")
voice_public_router = APIRouter()

PUBLIC_BASE_URL = os.environ.get("PUBLIC_BASE_URL", "")


# ----------------------------- Models ----------------------------------------
class QualificationField(BaseModel):
    key: str
    prompt: str = ""
    type: str = "string"


class VoiceAgentIn(BaseModel):
    name: str
    purpose: str = "outbound"  # outbound | inbound
    persona_prompt: str
    voice_id: str = "11labs-Adrian"
    language: str = "en-US"
    llm_mode: str = "retell_managed"  # retell_managed | custom_llm
    llm_model: str = "claude-5-sonnet"
    qualification_framework: str = "custom"  # BANT | MEDDIC | custom
    qualification_fields: List[QualificationField] = []
    voicemail_detection: bool = True
    begin_message: str = ""
    # --- Advanced options ---
    knowledge_base: str = ""                # facts/FAQ the agent can answer from
    warm_transfer_number: Optional[str] = None  # E.164; agent can hand off to a human
    max_call_duration_minutes: int = 15
    ambient_sound: str = "none"             # none | coffee-shop | call-center | convention-hall
    voice_speed: float = 1.0                # 0.5–2.0
    voice_temperature: float = 1.0          # expressiveness 0–2
    # Cross-agent handoff — the suite differentiator: what happens automatically
    # when a call qualifies the lead.
    post_call_action: str = "none"          # none | draft_proposal | follow_up_email | send_booking_link


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
    agent_id_b: Optional[str] = None  # optional second agent for A/B testing
    ab_split: int = 0  # % of leads routed to agent_id_b (0 = no A/B test)
    lead_ids: List[str] = []
    send_window_start: str = "09:00"
    send_window_end: str = "17:00"
    timezone: str = "UTC"
    max_concurrent_calls: int = 5
    retry_policy: RetryPolicy = RetryPolicy()
    dynamic_variables_map: Dict[str, str] = {}


# ----------------------------- Webhook registration ----------------------------
async def _get_or_create_voice_hook(workspace_id: str) -> Dict[str, Any]:
    hook = await db.webhooks.find_one({"workspace_id": workspace_id, "kind": "voice"}, {"_id": 0})
    if hook:
        return hook
    hook = {
        "id": new_id(), "workspace_id": workspace_id, "kind": "voice",
        "name": "Voice EQ call events", "source": "retell",
        "token": secrets.token_urlsafe(24), "active": True,
        "created_at": now_iso(), "call_count": 0, "last_called_at": None,
    }
    await db.webhooks.insert_one(hook)
    hook.pop("_id", None)
    return hook


@voice_router.get("/webhook")
async def get_voice_webhook(user=Depends(current_user)):
    hook = await _get_or_create_voice_hook(user["workspace_id"])
    return {"token": hook["token"], "path": f"/api/hooks/voice/{hook['token']}",
            "url": f"{PUBLIC_BASE_URL}/api/hooks/voice/{hook['token']}" if PUBLIC_BASE_URL else None}


# ----------------------------- Voice Agents -----------------------------------
@voice_router.get("/agents")
async def list_voice_agents(user=Depends(current_user)):
    return await db.voice_agents.find(
        {"workspace_id": user["workspace_id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)


@voice_router.post("/agents")
async def create_voice_agent(body: VoiceAgentIn, user=Depends(current_user)):
    doc = body.model_dump()
    doc.update({
        "id": new_id(), "workspace_id": user["workspace_id"], "owner_id": user["id"],
        "retell_agent_id": None, "retell_llm_id": None,
        "status": "draft", "sync_error": None, "version": 1,
        "created_at": now_iso(), "updated_at": now_iso(),
    })
    await db.voice_agents.insert_one(doc)
    doc.pop("_id", None)
    await _audit(user, "voice_eq.agent.create", {"id": doc["id"], "name": doc["name"]})
    return {**doc, "mocked": RETELL_MOCKED}


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
    patch["status"] = "draft"  # persona/voice changed — needs re-sync to Retell
    await db.voice_agents.update_one({"id": aid, "workspace_id": user["workspace_id"]}, {"$set": patch})
    return await get_voice_agent(aid, user)


@voice_router.delete("/agents/{aid}")
async def delete_voice_agent(aid: str, user=Depends(current_user)):
    await db.voice_agents.delete_one({"id": aid, "workspace_id": user["workspace_id"]})
    await _audit(user, "voice_eq.agent.delete", {"id": aid})
    return {"ok": True}


@voice_router.post("/agents/{aid}/sync")
async def sync_voice_agent(aid: str, user=Depends(current_user)):
    a = await db.voice_agents.find_one({"id": aid, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not a:
        raise HTTPException(404, "not found")
    try:
        # Fold the knowledge base into the agent's prompt so it can answer from it.
        prompt = a["persona_prompt"]
        if a.get("knowledge_base"):
            prompt += f"\n\n# Knowledge base (answer questions using these facts):\n{a['knowledge_base']}"
        if a.get("retell_llm_id"):
            llm = await retell_client.update_llm(
                a["retell_llm_id"], general_prompt=prompt, begin_message=a.get("begin_message"),
                warm_transfer_number=a.get("warm_transfer_number"),
            )
        else:
            llm = await retell_client.create_llm(
                general_prompt=prompt, model=a.get("llm_model", "claude-5-sonnet"),
                begin_message=a.get("begin_message"),
                warm_transfer_number=a.get("warm_transfer_number"),
            )
        hook = await _get_or_create_voice_hook(user["workspace_id"])
        webhook_url = f"{PUBLIC_BASE_URL}/api/hooks/voice/{hook['token']}" if PUBLIC_BASE_URL else None
        agent = await retell_client.create_agent(
            llm_id=llm["llm_id"], voice_id=a["voice_id"], agent_name=a["name"],
            language=a.get("language", "en-US"),
            voicemail_detection=a.get("voicemail_detection", True),
            post_call_analysis_fields=a.get("qualification_fields", []),
            webhook_url=webhook_url,
            max_call_duration_ms=int(a.get("max_call_duration_minutes", 15)) * 60000,
            ambient_sound=a.get("ambient_sound"),
            voice_speed=a.get("voice_speed"),
            voice_temperature=a.get("voice_temperature"),
        )
        await db.voice_agents.update_one({"id": aid}, {"$set": {
            "retell_llm_id": llm["llm_id"], "retell_agent_id": agent["agent_id"],
            "status": "synced", "sync_error": None, "updated_at": now_iso(),
        }})
        await _audit(user, "voice_eq.agent.sync", {"id": aid, "mocked": RETELL_MOCKED})
    except Exception as ex:
        await db.voice_agents.update_one({"id": aid}, {"$set": {"status": "sync_error", "sync_error": str(ex)}})
        raise HTTPException(500, f"Retell sync failed: {ex}")
    return await get_voice_agent(aid, user)


# ----------------------------- Calls -------------------------------------------
def _blank_call_doc(*, workspace_id: str, lead: Dict[str, Any], agent_id: str, campaign_id: Optional[str],
                     from_number: str, to_number: str, retell_result: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": new_id(), "workspace_id": workspace_id,
        "lead_id": lead["id"], "agent_id": agent_id, "campaign_id": campaign_id,
        "retell_call_id": retell_result.get("call_id"),
        "direction": "outbound", "from_number": from_number, "to_number": to_number,
        "status": retell_result.get("call_status", "registered"),
        "disconnection_reason": None, "started_at": now_iso(), "ended_at": None, "duration_seconds": None,
        "recording_url": None, "transcript": None, "transcript_object": None,
        "sentiment": None, "call_successful": None, "summary": None, "qualification": None,
        "next_best_action": None, "cost_cents": None,
        "metadata": {"lead_snapshot": {k: lead.get(k) for k in ("first_name", "last_name", "company", "title")}},
        "deal_id": None, "retell_events_seen": [],
        "created_at": now_iso(), "updated_at": now_iso(),
    }


RETELL_FROM_NUMBER = os.environ.get("RETELL_FROM_NUMBER", "")


async def _pick_from_number(workspace_id: str) -> str:
    numbers = await db.voice_numbers.find({"workspace_id": workspace_id}, {"_id": 0}).to_list(50)
    if numbers:
        return numbers[0]["phone_number"]
    return RETELL_FROM_NUMBER or "+10000000000"


@voice_router.get("/numbers")
async def list_voice_numbers(user=Depends(current_user)):
    return await db.voice_numbers.find({"workspace_id": user["workspace_id"]}, {"_id": 0}).to_list(50)


@voice_router.post("/numbers/import")
async def import_voice_number(body: Dict[str, str], user=Depends(current_user)):
    phone_number = (body.get("phone_number") or "").strip()
    if not phone_number:
        raise HTTPException(400, "phone_number required")
    result = await retell_client.import_phone_number(phone_number, nickname=body.get("nickname", ""))
    doc = {
        "id": new_id(), "workspace_id": user["workspace_id"], "phone_number": phone_number,
        "retell_phone_number_id": result.get("phone_number_id"), "nickname": body.get("nickname", ""),
        "capabilities": ["outbound", "inbound"], "imported_at": now_iso(),
    }
    await db.voice_numbers.insert_one(doc)
    doc.pop("_id", None)
    await _audit(user, "voice_eq.number.import", {"phone_number": phone_number})
    return {**doc, "mocked": result.get("mocked", RETELL_MOCKED)}


async def _is_dnc(workspace_id: str, lead: Dict[str, Any]) -> bool:
    if lead.get("dnc"):
        return True
    phone = lead.get("phone")
    if not phone:
        return False
    hit = await db.suppressions.find_one({"workspace_id": workspace_id, "channel": "phone", "phone": phone})
    return bool(hit)


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

    from_number = await _pick_from_number(user["workspace_id"])
    result = await retell_client.create_phone_call(
        from_number=from_number, to_number=phone,
        agent_id=agent.get("retell_agent_id"),
        metadata={"lead_id": lead["id"], "workspace_id": user["workspace_id"]},
        dynamic_variables={"first_name": lead.get("first_name", ""), "company": lead.get("company", "")},
    )
    call_doc = _blank_call_doc(
        workspace_id=user["workspace_id"], lead=lead, agent_id=agent["id"], campaign_id=None,
        from_number=from_number, to_number=phone, retell_result=result,
    )
    await db.calls.insert_one(call_doc)
    call_doc.pop("_id", None)
    await _audit(user, "voice_eq.call.click_to_call", {"call_id": call_doc["id"], "lead_id": lead["id"]})
    await _log_activity(user["workspace_id"], lead["id"], "voice", "call_placed",
                         f"Called {lead.get('first_name', 'lead')} via {agent['name']}", {"call_id": call_doc["id"]})
    return {**call_doc, "mocked": result.get("mocked", RETELL_MOCKED)}


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
        c["lead"] = await db.leads.find_one({"id": c["lead_id"]}, {"_id": 0})
    return items


@voice_router.get("/calls/active")
async def list_active_calls(user=Depends(current_user)):
    items = await db.calls.find(
        {"workspace_id": user["workspace_id"], "status": {"$in": ["registered", "ongoing"]}}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    for c in items:
        c["lead"] = await db.leads.find_one({"id": c["lead_id"]}, {"_id": 0}) if c.get("lead_id") else None
    return items


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
        d = by_day.setdefault(day, {"day": day, "calls": 0, "minutes": 0.0})
        d["calls"] += 1
        d["minutes"] += round((c.get("duration_seconds") or 0) / 60, 1)
    return {
        "total_calls": len(calls),
        "total_minutes": total_minutes,
        "total_cost_cents": total_cost_cents,
        "by_day": sorted(by_day.values(), key=lambda x: x["day"], reverse=True)[:14],
        "mocked": RETELL_MOCKED,
    }


@voice_router.get("/calls/{call_id}")
async def get_call_detail(call_id: str, user=Depends(current_user)):
    c = await db.calls.find_one({"id": call_id, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not c:
        raise HTTPException(404, "not found")
    c["lead"] = await db.leads.find_one({"id": c["lead_id"]}, {"_id": 0}) if c.get("lead_id") else None
    return c


# ----------------------------- Voice Campaigns (dialer) ------------------------
async def _voice_campaign_stats(cid: str, wid: str) -> Dict[str, Any]:
    calls = await db.calls.find({"campaign_id": cid, "workspace_id": wid}, {"_id": 0}).to_list(5000)
    total_seconds = sum(c.get("duration_seconds") or 0 for c in calls)
    return {
        "calls_placed": len(calls),
        "connected": sum(1 for c in calls if c["status"] in ("ended", "ongoing")),
        "voicemail": sum(1 for c in calls if c["status"] == "voicemail"),
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
        "direction": "outbound", "status": "draft", "launched_at": None, "created_at": now_iso(),
    })
    await db.voice_campaigns.insert_one(c)
    c.pop("_id", None)
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
    await db.voice_campaigns.update_one(
        {"id": cid, "workspace_id": user["workspace_id"]}, {"$set": body.model_dump()}
    )
    return await get_voice_campaign(cid, user)


@voice_router.post("/campaigns/{cid}/launch")
async def launch_voice_campaign(cid: str, user=Depends(current_user)):
    c = await db.voice_campaigns.find_one({"id": cid, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not c:
        raise HTTPException(404, "not found")
    agent = await db.voice_agents.find_one({"id": c["agent_id"], "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not agent:
        raise HTTPException(400, "voice agent not found")
    agent_b = None
    if c.get("agent_id_b") and c.get("ab_split", 0) > 0:
        agent_b = await db.voice_agents.find_one({"id": c["agent_id_b"], "workspace_id": user["workspace_id"]}, {"_id": 0})
    await db.voice_campaigns.update_one({"id": cid}, {"$set": {"status": "active", "launched_at": now_iso()}})
    await _audit(user, "voice_eq.campaign.launch", {"campaign_id": cid})

    from_number = await _pick_from_number(user["workspace_id"])
    placed, skipped = 0, 0
    for lid in c.get("lead_ids", []):
        lead = await db.leads.find_one({"id": lid, "workspace_id": user["workspace_id"]}, {"_id": 0})
        if not lead or not lead.get("phone") or await _is_dnc(user["workspace_id"], lead):
            skipped += 1
            continue
        variant = "A"
        active_agent = agent
        if agent_b and (hash(lid) % 100) < c["ab_split"]:
            variant = "B"
            active_agent = agent_b
        result = await retell_client.create_phone_call(
            from_number=from_number, to_number=lead["phone"], agent_id=active_agent.get("retell_agent_id"),
            metadata={"lead_id": lead["id"], "campaign_id": cid, "workspace_id": user["workspace_id"], "agent_variant": variant},
            dynamic_variables={"first_name": lead.get("first_name", ""), "company": lead.get("company", "")},
        )
        call_doc = _blank_call_doc(
            workspace_id=user["workspace_id"], lead=lead, agent_id=active_agent["id"], campaign_id=cid,
            from_number=from_number, to_number=lead["phone"], retell_result=result,
        )
        call_doc["metadata"]["agent_variant"] = variant
        await db.calls.insert_one(call_doc)
        await _log_activity(user["workspace_id"], lead["id"], "voice", "call_placed",
                             f"Called {lead.get('first_name', 'lead')} via campaign “{c['name']}”", {"call_id": call_doc["id"], "campaign_id": cid})
        placed += 1
    return {"ok": True, "status": "active", "calls_placed": placed, "skipped": skipped}


@voice_router.post("/campaigns/{cid}/pause")
async def pause_voice_campaign(cid: str, user=Depends(current_user)):
    await db.voice_campaigns.update_one(
        {"id": cid, "workspace_id": user["workspace_id"]}, {"$set": {"status": "paused"}}
    )
    return {"ok": True}


# ----------------------------- Public webhook (Retell call events) -------------
@voice_public_router.post("/hooks/voice/{token}")
async def voice_webhook(token: str, request: Request):
    """PUBLIC (no JWT). Retell fires call_started/call_ended/call_analyzed here."""
    raw = await request.body()
    signature = request.headers.get("x-retell-signature", "")
    hook = await db.webhooks.find_one({"token": token, "kind": "voice"}, {"_id": 0})
    if not hook or not hook.get("active", True):
        raise HTTPException(404, "webhook not found")
    if not retell_client.verify_webhook_signature(raw, signature):
        raise HTTPException(401, "invalid signature")
    try:
        payload = json.loads(raw)
    except Exception:
        raise HTTPException(400, "invalid payload")

    event = payload.get("event")
    call = payload.get("call") or {}
    retell_call_id = call.get("call_id")
    if not event or not retell_call_id:
        raise HTTPException(400, "missing event or call_id")

    existing = await db.calls.find_one(
        {"retell_call_id": retell_call_id, "workspace_id": hook["workspace_id"]}, {"_id": 0}
    )
    if not existing:
        existing = {
            "id": new_id(), "workspace_id": hook["workspace_id"],
            "lead_id": None, "agent_id": None, "campaign_id": None,
            "retell_call_id": retell_call_id, "direction": call.get("direction", "outbound"),
            "from_number": call.get("from_number"), "to_number": call.get("to_number"),
            "status": "registered", "retell_events_seen": [], "metadata": {}, "deal_id": None,
            "created_at": now_iso(), "updated_at": now_iso(),
        }
        await db.calls.insert_one(existing)

    if event in existing.get("retell_events_seen", []):
        return {"ok": True, "idempotent": True}

    patch: Dict[str, Any] = {"updated_at": now_iso()}
    if event == "call_started":
        patch["status"] = "ongoing"
        patch["started_at"] = existing.get("started_at") or now_iso()
    elif event == "call_ended":
        reason = call.get("disconnection_reason")
        patch["status"] = "voicemail" if reason in ("voicemail_reached", "machine_detected") else call.get("call_status", "ended")
        patch["ended_at"] = now_iso()
        duration_ms = call.get("duration_ms")
        patch["duration_seconds"] = (duration_ms // 1000) if duration_ms else None
        patch["disconnection_reason"] = reason
        patch["recording_url"] = call.get("recording_url")
        patch["transcript"] = call.get("transcript")
        patch["transcript_object"] = call.get("transcript_object")
        patch["cost_cents"] = (call.get("call_cost") or {}).get("combined_cost")
    elif event == "call_analyzed":
        analysis = call.get("call_analysis") or {}
        patch["sentiment"] = analysis.get("user_sentiment")
        patch["summary"] = analysis.get("call_summary")
        patch["call_successful"] = analysis.get("call_successful")
        patch["qualification"] = analysis.get("custom_analysis_data")

    await db.calls.update_one(
        {"id": existing["id"]},
        {"$set": patch, "$addToSet": {"retell_events_seen": event}},
    )
    await db.webhooks.update_one(
        {"id": hook["id"]}, {"$inc": {"call_count": 1}, "$set": {"last_called_at": now_iso()}}
    )

    if event == "call_analyzed" and existing.get("lead_id"):
        await _cascade_call_analyzed(hook["workspace_id"], existing["id"], {**existing, **patch})

    return {"ok": True}


# ----------------------------- CRM cascade --------------------------------------
_SYSTEM_ACTOR = lambda wid: {"workspace_id": wid, "id": "system", "email": "system@voice-eq"}


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


async def _cascade_call_analyzed(workspace_id: str, call_id: str, call_doc: Dict[str, Any]) -> None:
    lead = await db.leads.find_one({"id": call_doc["lead_id"], "workspace_id": workspace_id}, {"_id": 0})
    if not lead:
        return
    actor = _SYSTEM_ACTOR(workspace_id)

    successful = call_doc.get("call_successful")
    sentiment = call_doc.get("sentiment")
    if successful:
        new_status = "qualified"
    elif successful is False and sentiment == "negative":
        new_status = "not_interested"
    else:
        new_status = "contacted"
    await db.leads.update_one({"id": lead["id"]}, {"$set": {"status": new_status}})

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
                "value": 5000, "stage": "qualified", "created_at": now_iso(),
                "source_call_id": call_id,
            })
        await db.calls.update_one({"id": call_id}, {"$set": {"deal_id": deal_id}})
        await db.events.insert_one({
            "id": new_id(), "workspace_id": workspace_id, "campaign_id": call_doc.get("campaign_id"),
            "lead_id": lead["id"], "type": "meeting_booked", "at": now_iso(), "source": "voice_eq",
        })

    next_action = await _generate_next_best_action(lead, call_doc.get("summary", ""), call_doc.get("qualification") or {})
    await db.calls.update_one({"id": call_id}, {"$set": {"next_best_action": next_action}})

    outcome = "qualified" if successful else ("not interested" if new_status == "not_interested" else "inconclusive")
    await _log_activity(workspace_id, lead["id"], "voice", "call_analyzed",
                         f"Call analyzed — {outcome}: {call_doc.get('summary', '')[:100]}",
                         {"call_id": call_id, "sentiment": sentiment, "deal_id": deal_id})

    if successful:
        await db.events.insert_one({
            "id": new_id(), "workspace_id": workspace_id, "campaign_id": call_doc.get("campaign_id"),
            "lead_id": lead["id"], "type": "call_follow_up_recommended", "at": now_iso(),
            "meta": {"call_id": call_id, "next_best_action": next_action},
        })
        # --- Cross-agent handoff (the suite differentiator) ---
        # A qualified call can automatically hand off to another agent, so a
        # "yes" on the phone becomes a drafted proposal / a booking link / a
        # follow-up without anyone lifting a finger. Best-effort — a handoff
        # failure never breaks the webhook.
        agent = await db.voice_agents.find_one({"id": call_doc.get("agent_id"), "workspace_id": workspace_id}, {"_id": 0})
        action = (agent or {}).get("post_call_action", "none")
        try:
            await _run_post_call_action(workspace_id, lead, action, call_id)
        except Exception:
            pass

    await _audit(actor, "voice_eq.call.cascade", {
        "call_id": call_id, "lead_id": lead["id"], "new_status": new_status, "deal_id": deal_id,
    })


async def _run_post_call_action(workspace_id: str, lead: Dict[str, Any], action: str, call_id: str) -> None:
    if action == "draft_proposal":
        # Hand off to Proposal EQ — research + draft a deck for this lead.
        from proposal_eq import _research_and_draft, _build_deck  # lazy to avoid load-order coupling
        deal = await db.deals.find_one({"lead_id": lead["id"], "workspace_id": workspace_id}, {"_id": 0})
        timeline_raw = await db.activities.find(
            {"lead_id": lead["id"], "workspace_id": workspace_id}, {"_id": 0}
        ).sort("at", -1).to_list(20)
        timeline = [{"type": a["type"], "summary": a["summary"]} for a in timeline_raw]
        pricing = await db.pricing_catalog.find({"workspace_id": workspace_id}, {"_id": 0}).to_list(50)
        research, content = await _research_and_draft(lead, deal, "", timeline)
        slides = _build_deck(lead, content, pricing, True)
        pid = new_id()
        await db.proposals.insert_one({
            "id": pid, "workspace_id": workspace_id, "owner_id": "system",
            "lead_id": lead["id"], "deal_id": deal["id"] if deal else None,
            "topic": f"Proposal for {lead.get('company') or lead.get('first_name')}",
            "status": "draft", "slides": slides, "research_notes": research,
            "palette_id": "midnight", "brand": {"logo_url": None, "colors": [], "fonts": []},
            "created_at": now_iso(), "updated_at": now_iso(), "sent_at": None,
        })
        await _log_activity(workspace_id, lead["id"], "voice", "handoff_proposal",
                             "Auto-drafted a proposal after the call (Proposal EQ)", {"proposal_id": pid, "call_id": call_id})
    elif action == "send_booking_link":
        et = await db.event_types.find_one({"workspace_id": workspace_id, "active": True}, {"_id": 0})
        link = f"/book/{workspace_id}/{et['slug']}" if et else None
        await _log_activity(workspace_id, lead["id"], "voice", "handoff_booking",
                             "Queued a booking link to send after the call (Schedule EQ)", {"booking_link": link, "call_id": call_id})
    elif action == "follow_up_email":
        await _log_activity(workspace_id, lead["id"], "voice", "handoff_follow_up",
                             "Queued a personalized follow-up email after the call (Pitch EQ)", {"call_id": call_id})
