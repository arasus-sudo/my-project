"""SMS EQ — Two-way SMS campaigns, inbox, STOP/START/HELP handling.

Reuses existing Twilio client (send_sms) and billing infrastructure.
Mocked-first: no Twilio credentials needed for development or demo.
"""

import logging
import os
import re
from datetime import datetime, timedelta, timezone as dt_timezone
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel

from server import db, now_iso, new_id, current_user, _audit, _log_activity, _llm_chat, ANTHROPIC_API_KEY
from billing import charge_credits
from twilio_client import twilio_client

log = logging.getLogger(__name__)

sms_router = APIRouter(prefix="/sms-eq")
sms_public_router = APIRouter()

PAGE_SIZE = 25

# ---- Models ----
class SMSTemplateIn(BaseModel):
    name: str
    body: str
    category: str = "marketing"

class SMSTemplateOut(BaseModel):
    id: str
    name: str
    body: str
    category: str
    created_at: str

class SMSBroadcastIn(BaseModel):
    name: str
    template_id: str
    list_id: Optional[str] = None
    lead_ids: List[str] = []
    send_window_start: str = "09:00"
    send_window_end: str = "17:00"
    timezone: str = "UTC"

class SMSReplyIn(BaseModel):
    body: str

# ---- Helpers ----
def _is_stop_message(body: str) -> bool:
    return body.strip().upper() in ("STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT")

def _is_start_message(body: str) -> bool:
    return body.strip().upper() in ("START", "YES", "UNSTOP")

def _is_help_message(body: str) -> bool:
    return body.strip().upper() in ("HELP", "INFO")

def _sanitize_phone(raw: str) -> str:
    return re.sub(r"[^\d+]", "", raw).strip()

def _now_utc() -> str:
    return datetime.now(dt_timezone.utc).isoformat()

# ---- Authenticated Routes ----

@sms_router.get("/templates")
async def list_templates(user=Depends(current_user)):
    items = await db.sms_templates.find(
        {"workspace_id": user["workspace_id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    return items

@sms_router.post("/templates")
async def create_template(body: SMSTemplateIn, user=Depends(current_user)):
    t = {
        "id": new_id(), "workspace_id": user["workspace_id"],
        "name": body.name, "body": body.body, "category": body.category,
        "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.sms_templates.insert_one(t)
    await _audit(user, "sms.template.create", {"template_id": t["id"], "name": t["name"]})
    return t

@sms_router.put("/templates/{tid}")
async def update_template(tid: str, body: SMSTemplateIn, user=Depends(current_user)):
    t = await db.sms_templates.find_one({"id": tid, "workspace_id": user["workspace_id"]})
    if not t:
        raise HTTPException(404, "Template not found")
    await db.sms_templates.update_one({"id": tid}, {"$set": {
        "name": body.name, "body": body.body, "category": body.category,
        "updated_at": now_iso(),
    }})
    return {"ok": True}

@sms_router.delete("/templates/{tid}")
async def delete_template(tid: str, user=Depends(current_user)):
    await db.sms_templates.delete_one({"id": tid, "workspace_id": user["workspace_id"]})
    return {"ok": True}

@sms_router.get("/conversations")
async def list_conversations(
    status: Optional[str] = None,
    page: int = Query(1, ge=1),
    user=Depends(current_user),
):
    query = {"workspace_id": user["workspace_id"]}
    if status:
        query["status"] = status
    total = await db.sms_conversations.count_documents(query)
    items = await db.sms_conversations.find(query, {"_id": 0}) \
        .sort("updated_at", -1) \
        .skip((page - 1) * PAGE_SIZE) \
        .to_list(PAGE_SIZE)
    return {"items": items, "total": total, "page": page, "page_size": PAGE_SIZE}

@sms_router.get("/conversations/{cid}")
async def get_conversation(cid: str, user=Depends(current_user)):
    conv = await db.sms_conversations.find_one(
        {"id": cid, "workspace_id": user["workspace_id"]}, {"_id": 0}
    )
    if not conv:
        raise HTTPException(404, "Conversation not found")
    return conv

@sms_router.post("/conversations/{cid}/reply")
async def reply_to_conversation(cid: str, body: SMSReplyIn, user=Depends(current_user)):
    conv = await db.sms_conversations.find_one(
        {"id": cid, "workspace_id": user["workspace_id"]}
    )
    if not conv:
        raise HTTPException(404, "Conversation not found")
    
    msg = {
        "id": new_id(), "direction": "agent",
        "body": body.body, "at": now_iso(),
    }
    await db.sms_conversations.update_one(
        {"id": cid},
        {"$push": {"messages": msg}, "$set": {"updated_at": now_iso()}}
    )
    
    # Send via Twilio
    try:
        result = await twilio_client.send_sms(
            to_number=conv.get("phone", ""),
            body=body.body,
        )
    except Exception as e:
        log.warning("SMS send failed: %s", e)
    
    await _log_activity(user["workspace_id"], conv.get("lead_id"), "sms", "sms_replied",
                         f"Sent SMS: “{body.body[:80]}”",
                         {"conversation_id": cid})
    return msg

@sms_router.post("/conversations/{cid}/suggest")
async def suggest_reply(cid: str, user=Depends(current_user)):
    conv = await db.sms_conversations.find_one(
        {"id": cid, "workspace_id": user["workspace_id"]}, {"_id": 0}
    )
    if not conv:
        raise HTTPException(404, "Conversation not found")
    
    if not ANTHROPIC_API_KEY:
        return {"suggestion": "Thank you for your message. How can I help you today?"}
    
    messages = conv.get("messages", [])
    recent = "\n".join(f"{m.get('direction','')}: {m.get('body','')}" for m in messages[-10:])
    
    prompt = f"""Based on this SMS conversation, suggest a short reply (max 160 chars):

Conversation:
{recent}

Reply:"""
    
    try:
        suggestion = await _llm_chat("claude-sonnet", [{"role": "user", "content": prompt}])
        suggestion = suggestion[:160] if suggestion else "Thank you for your message."
    except Exception:
        suggestion = "Thank you for your message."
    
    try:
        await charge_credits(user["workspace_id"], "sms_reply_suggest", units=1)
    except Exception:
        pass
    
    return {"suggestion": suggestion}

@sms_router.get("/broadcasts")
async def list_broadcasts(user=Depends(current_user)):
    items = await db.sms_broadcasts.find(
        {"workspace_id": user["workspace_id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    return items

@sms_router.post("/broadcasts")
async def create_broadcast(body: SMSBroadcastIn, user=Depends(current_user)):
    template = await db.sms_templates.find_one(
        {"id": body.template_id, "workspace_id": user["workspace_id"]}
    )
    if not template:
        raise HTTPException(404, "Template not found")
    
    lead_ids = body.lead_ids
    if body.list_id:
        lst = await db.lead_lists.find_one({"id": body.list_id, "workspace_id": user["workspace_id"]})
        if lst:
            lead_ids = list(set(lead_ids + (lst.get("lead_ids") or [])))
    
    b = {
        "id": new_id(), "workspace_id": user["workspace_id"],
        "name": body.name, "template_id": body.template_id,
        "template_body": template.get("body", ""),
        "lead_ids": lead_ids,
        "send_window_start": body.send_window_start,
        "send_window_end": body.send_window_end,
        "timezone": body.timezone,
        "status": "draft",
        "stats": {"queued": 0, "sent": 0, "failed": 0, "skipped": 0},
        "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.sms_broadcasts.insert_one(b)
    await _audit(user, "sms.broadcast.create", {"broadcast_id": b["id"], "name": b["name"]})
    return b

@sms_router.post("/broadcasts/{bid}/launch")
async def launch_broadcast(bid: str, user=Depends(current_user)):
    b = await db.sms_broadcasts.find_one(
        {"id": bid, "workspace_id": user["workspace_id"]}
    )
    if not b:
        raise HTTPException(404, "Broadcast not found")
    
    await db.sms_broadcasts.update_one({"id": bid}, {"$set": {
        "status": "active", "updated_at": now_iso(),
    }})
    
    # Enqueue sends
    lead_ids = b.get("lead_ids", [])
    suppressed = {s["email"].lower() async for s in db.suppressions.find(
        {"workspace_id": user["workspace_id"]}, {"_id": 0, "email": 1}
    )}
    
    queued = 0
    for lid in lead_ids:
        lead = await db.leads.find_one({"id": lid, "workspace_id": user["workspace_id"]}, {"_id": 0})
        if not lead:
            continue
        phone = lead.get("phone", "")
        if not phone:
            continue
        email = (lead.get("email") or "").lower()
        if email in suppressed:
            continue
        
        await db.sms_send_queue.insert_one({
            "id": new_id(), "workspace_id": user["workspace_id"],
            "broadcast_id": bid, "lead_id": lid, "phone": phone,
            "body": b.get("template_body", ""),
            "status": "pending", "send_at": now_iso(),
            "attempts": 0, "error": None, "created_at": now_iso(),
        })
        queued += 1
    
    await db.sms_broadcasts.update_one(
        {"id": bid},
        {"$set": {"stats.queued": queued, "updated_at": now_iso()}}
    )
    
    await _audit(user, "sms.broadcast.launch", {"broadcast_id": bid, "queued": queued})
    return {"ok": True, "queued": queued}

@sms_router.post("/broadcasts/{bid}/pause")
async def pause_broadcast(bid: str, user=Depends(current_user)):
    await db.sms_broadcasts.update_one(
        {"id": bid, "workspace_id": user["workspace_id"]},
        {"$set": {"status": "paused", "updated_at": now_iso()}}
    )
    return {"ok": True}

@sms_router.get("/contacts")
async def list_contacts(
    page: int = Query(1, ge=1),
    user=Depends(current_user),
):
    query = {"workspace_id": user["workspace_id"]}
    total = await db.sms_contacts.count_documents(query)
    items = await db.sms_contacts.find(query, {"_id": 0}) \
        .sort("opted_in_at" if False else "created_at", -1) \
        .skip((page - 1) * PAGE_SIZE) \
        .to_list(PAGE_SIZE)
    return {"items": items, "total": total, "page": page, "page_size": PAGE_SIZE}

@sms_router.post("/contacts/opt-out")
async def opt_out_contact(body: dict, user=Depends(current_user)):
    phone = _sanitize_phone(body.get("phone", ""))
    if not phone:
        raise HTTPException(400, "Valid phone number required")
    
    await db.sms_contacts.update_one(
        {"workspace_id": user["workspace_id"], "phone": phone},
        {"$set": {"opted_out": True, "opted_out_at": now_iso()}},
        upsert=True,
    )
    # Also add to suppressions
    await db.suppressions.update_one(
        {"workspace_id": user["workspace_id"], "email": body.get("email", phone)},
        {"$set": {"channel": "sms", "reason": "user_opt_out", "at": now_iso()}},
        upsert=True,
    )
    return {"ok": True}

@sms_router.get("/analytics")
async def get_analytics(user=Depends(current_user)):
    wid = user["workspace_id"]
    
    total_broadcasts = await db.sms_broadcasts.count_documents({"workspace_id": wid})
    total_sent = await db.sms_send_queue.count_documents({"workspace_id": wid, "status": "sent"})
    total_failed = await db.sms_send_queue.count_documents({"workspace_id": wid, "status": "failed"})
    total_conversations = await db.sms_conversations.count_documents({"workspace_id": wid})
    
    # Messages per day (last 30 days)
    thirty_days_ago = (datetime.now(dt_timezone.utc) - timedelta(days=30)).isoformat()
    daily_pipeline = [
        {"$match": {"workspace_id": wid, "created_at": {"$gte": thirty_days_ago}}},
        {"$group": {"_id": {"$substr": ["$created_at", 0, 10]}, "count": {"$sum": 1}}},
        {"$sort": {"_id": 1}},
    ]
    daily_data = await db.sms_send_queue.aggregate(daily_pipeline).to_list(31)
    
    return {
        "total_broadcasts": total_broadcasts,
        "total_sent": total_sent,
        "total_failed": total_failed,
        "total_conversations": total_conversations,
        "daily": [{"date": d["_id"], "count": d["count"]} for d in daily_data],
    }

@sms_router.get("/settings")
async def get_settings(user=Depends(current_user)):
    s = await db.sms_settings.find_one({"workspace_id": user["workspace_id"]}, {"_id": 0})
    return s or {"default_sender": "", "auto_reply_enabled": False, "opt_out_message": "Reply STOP to opt out"}

@sms_router.post("/settings")
async def update_settings(body: dict, user=Depends(current_user)):
    await db.sms_settings.update_one(
        {"workspace_id": user["workspace_id"]},
        {"$set": body},
        upsert=True,
    )
    return {"ok": True}

# ---- Public Webhooks (no auth) ----

@sms_public_router.post("/hooks/sms-incoming/{token}")
async def sms_incoming(token: str, request: Request):
    """Twilio SMS inbound webhook. Handles STOP/START/HELP keywords and
    creates/updates conversations."""
    webhook = await db.webhooks.find_one({"token": token, "kind": "sms_inbound"})
    if not webhook:
        raise HTTPException(404, "Webhook not found")
    
    form = await request.form()
    from_number = _sanitize_phone(form.get("From", ""))
    body = form.get("Body", "")
    message_sid = form.get("MessageSid", "")
    wid = webhook["workspace_id"]
    
    # Verify signature
    signature = request.headers.get("X-Twilio-Signature", "")
    if not twilio_client.verify_webhook_signature(str(request.url), dict(form), signature):
        raise HTTPException(403, "Invalid signature")
    
    # Handle compliance keywords
    if _is_stop_message(body):
        await db.suppressions.update_one(
            {"workspace_id": wid, "phone": from_number},
            {"$set": {"channel": "sms", "reason": "user_stop", "at": now_iso()}},
            upsert=True,
        )
        await db.sms_contacts.update_one(
            {"workspace_id": wid, "phone": from_number},
            {"$set": {"opted_out": True, "opted_out_at": now_iso()}},
            upsert=True,
        )
        return {"ok": True, "auto_reply": "You have been unsubscribed. Reply START to resubscribe."}
    
    if _is_start_message(body):
        await db.suppressions.delete_one({"workspace_id": wid, "phone": from_number})
        await db.sms_contacts.update_one(
            {"workspace_id": wid, "phone": from_number},
            {"$set": {"opted_out": False, "opted_in_at": now_iso()}},
            upsert=True,
        )
        return {"ok": True, "auto_reply": "You have been resubscribed. Reply HELP for info."}
    
    if _is_help_message(body):
        return {"ok": True, "auto_reply": "Reply STOP to unsubscribe. Standard message rates apply."}
    
    # Find or create conversation
    lead = await db.leads.find_one({"phone": from_number, "workspace_id": wid}, {"_id": 0})
    conv = await db.sms_conversations.find_one(
        {"workspace_id": wid, "phone": from_number},
        sort=[("updated_at", -1)],
    )
    
    msg = {
        "id": message_sid, "direction": "visitor",
        "body": body, "at": now_iso(),
    }
    
    if conv:
        await db.sms_conversations.update_one(
            {"id": conv["id"]},
            {"$push": {"messages": msg}, "$set": {"updated_at": now_iso()}}
        )
        conv_id = conv["id"]
    else:
        conv_id = new_id()
        await db.sms_conversations.insert_one({
            "id": conv_id, "workspace_id": wid,
            "phone": from_number, "lead_id": lead["id"] if lead else None,
            "status": "open", "messages": [msg],
            "created_at": now_iso(), "updated_at": now_iso(),
        })
        
        # Create lead from SMS if unknown
        if not lead:
            lid = new_id()
            await db.leads.insert_one({
                "id": lid, "workspace_id": wid, "phone": from_number,
                "first_name": "", "last_name": "", "email": f"sms-{lid[:8]}@unknown",
                "company": "", "title": "", "status": "new",
                "tags": ["sms-eq"], "source": "sms",
                "created_at": now_iso(), "updated_at": now_iso(),
                "owner_id": None, "intent": None, "dnc": False,
            })
            await db.sms_conversations.update_one(
                {"id": conv_id}, {"$set": {"lead_id": lid}}
            )
    
    return {"ok": True}

# ---- Scheduler tick ----
async def run_sms_send_tick():
    """Drain the SMS send queue — runs every 2 minutes via APScheduler."""
    now = datetime.now(dt_timezone.utc)
    due = await db.sms_send_queue.find({
        "status": "pending",
        "send_at": {"$lte": now.isoformat()},
    }, {"_id": 0}).sort("send_at", 1).to_list(50)
    
    for row in due:
        claimed = await db.sms_send_queue.find_one_and_update(
            {"id": row["id"], "status": "pending"},
            {"$set": {"status": "sending", "attempts": (row.get("attempts") or 0) + 1}},
        )
        if not claimed:
            continue
        
        try:
            result = await twilio_client.send_sms(
                to_number=row["phone"],
                body=row.get("body", ""),
            )
            await db.sms_send_queue.update_one(
                {"id": row["id"]},
                {"$set": {"status": "sent", "sent_at": now_iso(), "error": None}}
            )
        except Exception as ex:
            attempts = (row.get("attempts") or 0) + 1
            failed = attempts >= 3
            await db.sms_send_queue.update_one(
                {"id": row["id"]},
                {"$set": {
                    "status": "failed" if failed else "pending",
                    "error": str(ex)[:300],
                    "send_at": (now + timedelta(minutes=15)).isoformat(),
                }}
            )
            log.warning("SMS send failed (%s): %s", row["id"], ex)
