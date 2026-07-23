"""WhatsApp EQ — Template approval, session inbox, broadcast sends.

Extends Twilio client for WhatsApp Programmable Messaging.
Mocked-first with instant mock approval lifecycle.
"""

import logging
import re
from datetime import datetime, timedelta, timezone as dt_timezone
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel

from server import db, now_iso, new_id, current_user, _audit, _llm_chat, ANTHROPIC_API_KEY
from billing import charge_credits
from twilio_client import twilio_client

log = logging.getLogger(__name__)

whatsapp_router = APIRouter(prefix="/whatsapp-eq")
whatsapp_public_router = APIRouter()

SESSION_HOURS = 24
PAGE_SIZE = 25

# ---- Models ----
class WATemplateIn(BaseModel):
    name: str
    category: str = "marketing"
    language: str = "en"
    body_text: str
    header_text: Optional[str] = None
    footer_text: Optional[str] = None

class WABroadcastIn(BaseModel):
    name: str
    template_id: str
    list_id: Optional[str] = None
    lead_ids: List[str] = []

class WAReplyIn(BaseModel):
    body: str

# ---- Helpers ----
def _sanitize_phone(raw: str) -> str:
    return re.sub(r"[^\d+]", "", raw).strip()

# ---- Authenticated Routes ----

# ── Templates ──
@whatsapp_router.get("/templates")
async def list_templates(user=Depends(current_user)):
    items = await db.whatsapp_templates.find(
        {"workspace_id": user["workspace_id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    return items

@whatsapp_router.post("/templates")
async def create_template(body: WATemplateIn, user=Depends(current_user)):
    t = {
        "id": new_id(), "workspace_id": user["workspace_id"],
        "name": body.name, "category": body.category,
        "language": body.language, "body_text": body.body_text,
        "header_text": body.header_text, "footer_text": body.footer_text,
        "status": "draft",
        "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.whatsapp_templates.insert_one(t)
    await _audit(user, "whatsapp.template.create", {"template_id": t["id"], "name": t["name"]})
    return t

@whatsapp_router.put("/templates/{tid}")
async def update_template(tid: str, body: WATemplateIn, user=Depends(current_user)):
    t = await db.whatsapp_templates.find_one({"id": tid, "workspace_id": user["workspace_id"]})
    if not t:
        raise HTTPException(404, "Template not found")
    await db.whatsapp_templates.update_one({"id": tid}, {"$set": {
        "name": body.name, "category": body.category,
        "language": body.language, "body_text": body.body_text,
        "header_text": body.header_text, "footer_text": body.footer_text,
        "updated_at": now_iso(),
    }})
    return {"ok": True}

@whatsapp_router.post("/templates/{tid}/submit")
async def submit_template(tid: str, user=Depends(current_user)):
    """Submit template — mock-approves instantly (Meta review queue is v2)."""
    t = await db.whatsapp_templates.find_one({"id": tid, "workspace_id": user["workspace_id"]})
    if not t:
        raise HTTPException(404, "Template not found")
    await db.whatsapp_templates.update_one(
        {"id": tid},
        {"$set": {"status": "approved", "approved_at": now_iso(), "updated_at": now_iso()}}
    )
    await _audit(user, "whatsapp.template.submit", {"template_id": tid})
    return {"ok": True, "status": "approved"}

@whatsapp_router.delete("/templates/{tid}")
async def delete_template(tid: str, user=Depends(current_user)):
    await db.whatsapp_templates.delete_one({"id": tid, "workspace_id": user["workspace_id"]})
    return {"ok": True}

# ── Conversations ──
@whatsapp_router.get("/conversations")
async def list_conversations(
    status: Optional[str] = None,
    page: int = Query(1, ge=1),
    user=Depends(current_user),
):
    query = {"workspace_id": user["workspace_id"]}
    if status:
        query["status"] = status
    total = await db.whatsapp_conversations.count_documents(query)
    items = await db.whatsapp_conversations.find(query, {"_id": 0}) \
        .sort("updated_at", -1) \
        .skip((page - 1) * PAGE_SIZE) \
        .to_list(PAGE_SIZE)
    return {"items": items, "total": total, "page": page, "page_size": PAGE_SIZE}

@whatsapp_router.get("/conversations/{cid}")
async def get_conversation(cid: str, user=Depends(current_user)):
    conv = await db.whatsapp_conversations.find_one(
        {"id": cid, "workspace_id": user["workspace_id"]}, {"_id": 0}
    )
    if not conv:
        raise HTTPException(404, "Conversation not found")
    return conv

@whatsapp_router.post("/conversations/{cid}/reply")
async def reply_to_conversation(cid: str, body: WAReplyIn, user=Depends(current_user)):
    conv = await db.whatsapp_conversations.find_one(
        {"id": cid, "workspace_id": user["workspace_id"]}
    )
    if not conv:
        raise HTTPException(404, "Conversation not found")
    
    # Check session window
    session_expires = conv.get("session_expires_at")
    if session_expires and datetime.now(dt_timezone.utc).isoformat() > session_expires:
        raise HTTPException(400, "Conversation session expired — send a template message to re-open")
    
    msg = {
        "id": new_id(), "direction": "agent",
        "body": body.body, "at": now_iso(),
    }
    await db.whatsapp_conversations.update_one(
        {"id": cid},
        {"$push": {"messages": msg}, "$set": {"updated_at": now_iso()}}
    )
    try:
        await twilio_client.send_whatsapp(
            to_number=conv.get("phone", ""),
            body=body.body,
        )
    except Exception as e:
        log.warning("WhatsApp send failed: %s", e)
    
    return msg

@whatsapp_router.post("/conversations/{cid}/reply-template")
async def reply_with_template(cid: str, body: dict, user=Depends(current_user)):
    """Send a template message to re-open an expired session or start one."""
    conv = await db.whatsapp_conversations.find_one(
        {"id": cid, "workspace_id": user["workspace_id"]}
    )
    if not conv:
        raise HTTPException(404, "Conversation not found")
    
    template = await db.whatsapp_templates.find_one(
        {"id": body.get("template_id"), "workspace_id": user["workspace_id"]}
    )
    if not template:
        raise HTTPException(404, "Template not found")
    if template.get("status") != "approved":
        raise HTTPException(400, "Template must be approved first")
    
    msg = {
        "id": new_id(), "direction": "agent",
        "body": template.get("body_text", ""), "template_id": template["id"],
        "at": now_iso(),
    }
    await db.whatsapp_conversations.update_one(
        {"id": cid},
        {"$push": {"messages": msg},
         "$set": {
             "updated_at": now_iso(),
             "session_expires_at": (datetime.now(dt_timezone.utc) + timedelta(hours=SESSION_HOURS)).isoformat(),
         }}
    )
    
    try:
        twilio_client.send_whatsapp(
            to_number=conv.get("phone", ""),
            body=template["body_text"],
        )
    except Exception as e:
        log.warning("WhatsApp template send failed: %s", e)
    
    return msg

@whatsapp_router.post("/conversations/{cid}/suggest")
async def suggest_reply(cid: str, user=Depends(current_user)):
    conv = await db.whatsapp_conversations.find_one(
        {"id": cid, "workspace_id": user["workspace_id"]}, {"_id": 0}
    )
    if not conv:
        raise HTTPException(404, "Conversation not found")
    
    if not ANTHROPIC_API_KEY:
        return {"suggestion": "Thank you for your message. How can I help you?"}
    
    messages = conv.get("messages", [])
    recent = "\n".join(f"{m.get('direction','')}: {m.get('body','')}" for m in messages[-10:])
    
    prompt = f"""Based on this WhatsApp conversation, suggest a short reply:

Conversation:
{recent}

Reply:"""
    
    try:
        suggestion = await _llm_chat("claude-sonnet", [{"role": "user", "content": prompt}])
    except Exception:
        suggestion = "Thank you for your message."
    
    try:
        await charge_credits(user["workspace_id"], "whatsapp_reply_suggest", units=1)
    except Exception:
        pass
    
    return {"suggestion": suggestion}

# ── Broadcasts ──
@whatsapp_router.get("/broadcasts")
async def list_broadcasts(user=Depends(current_user)):
    items = await db.whatsapp_broadcasts.find(
        {"workspace_id": user["workspace_id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    return items

@whatsapp_router.post("/broadcasts")
async def create_broadcast(body: WABroadcastIn, user=Depends(current_user)):
    template = await db.whatsapp_templates.find_one(
        {"id": body.template_id, "workspace_id": user["workspace_id"]}
    )
    if not template:
        raise HTTPException(404, "Template not found")
    if template.get("status") != "approved":
        raise HTTPException(400, "Template must be approved before broadcast")
    
    lead_ids = body.lead_ids
    if body.list_id:
        lst = await db.lead_lists.find_one({"id": body.list_id, "workspace_id": user["workspace_id"]})
        if lst:
            lead_ids = list(set(lead_ids + (lst.get("lead_ids") or [])))
    
    b = {
        "id": new_id(), "workspace_id": user["workspace_id"],
        "name": body.name, "template_id": body.template_id,
        "template_body": template.get("body_text", ""),
        "lead_ids": lead_ids,
        "status": "draft",
        "stats": {"queued": 0, "sent": 0, "failed": 0, "skipped": 0},
        "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.whatsapp_broadcasts.insert_one(b)
    await _audit(user, "whatsapp.broadcast.create", {"broadcast_id": b["id"]})
    return b

@whatsapp_router.post("/broadcasts/{bid}/launch")
async def launch_broadcast(bid: str, user=Depends(current_user)):
    b = await db.whatsapp_broadcasts.find_one(
        {"id": bid, "workspace_id": user["workspace_id"]}
    )
    if not b:
        raise HTTPException(404, "Broadcast not found")
    
    await db.whatsapp_broadcasts.update_one({"id": bid}, {"$set": {"status": "active"}})
    
    lead_ids = b.get("lead_ids", [])
    queued = 0
    for lid in lead_ids:
        lead = await db.leads.find_one({"id": lid, "workspace_id": user["workspace_id"]}, {"_id": 0})
        if not lead:
            continue
        phone = lead.get("phone", "")
        if not phone:
            continue
        
        # Check opt-in
        contact = await db.whatsapp_contacts.find_one(
            {"workspace_id": user["workspace_id"], "phone": phone}
        )
        if contact and contact.get("opted_out"):
            continue
        
        await db.whatsapp_send_queue.insert_one({
            "id": new_id(), "workspace_id": user["workspace_id"],
            "broadcast_id": bid, "lead_id": lid, "phone": phone,
            "body": b.get("template_body", ""),
            "status": "pending", "send_at": now_iso(),
            "attempts": 0, "error": None, "created_at": now_iso(),
        })
        queued += 1
    
    await db.whatsapp_broadcasts.update_one(
        {"id": bid}, {"$set": {"stats.queued": queued}}
    )
    await _audit(user, "whatsapp.broadcast.launch", {"broadcast_id": bid, "queued": queued})
    return {"ok": True, "queued": queued}

@whatsapp_router.post("/broadcasts/{bid}/pause")
async def pause_broadcast(bid: str, user=Depends(current_user)):
    await db.whatsapp_broadcasts.update_one(
        {"id": bid, "workspace_id": user["workspace_id"]},
        {"$set": {"status": "paused"}}
    )
    return {"ok": True}

# ── Contacts ──
@whatsapp_router.get("/contacts")
async def list_contacts(page: int = Query(1, ge=1), user=Depends(current_user)):
    query = {"workspace_id": user["workspace_id"]}
    total = await db.whatsapp_contacts.count_documents(query)
    items = await db.whatsapp_contacts.find(query, {"_id": 0}) \
        .sort("created_at", -1) \
        .skip((page - 1) * PAGE_SIZE) \
        .to_list(PAGE_SIZE)
    return {"items": items, "total": total, "page": page, "page_size": PAGE_SIZE}

@whatsapp_router.post("/contacts/opt-in")
async def opt_in_contact(body: dict, user=Depends(current_user)):
    phone = _sanitize_phone(body.get("phone", ""))
    if not phone:
        raise HTTPException(400, "Valid phone number required")
    await db.whatsapp_contacts.update_one(
        {"workspace_id": user["workspace_id"], "phone": phone},
        {"$set": {"opted_in": True, "opted_in_at": now_iso(), "opted_out": False}},
        upsert=True,
    )
    return {"ok": True}

@whatsapp_router.post("/contacts/opt-out")
async def opt_out_contact(body: dict, user=Depends(current_user)):
    phone = _sanitize_phone(body.get("phone", ""))
    if not phone:
        raise HTTPException(400, "Valid phone number required")
    await db.whatsapp_contacts.update_one(
        {"workspace_id": user["workspace_id"], "phone": phone},
        {"$set": {"opted_out": True, "opted_out_at": now_iso()}},
        upsert=True,
    )
    return {"ok": True}

# ── Analytics ──
@whatsapp_router.get("/analytics")
async def get_analytics(user=Depends(current_user)):
    wid = user["workspace_id"]
    return {
        "total_templates": await db.whatsapp_templates.count_documents({"workspace_id": wid}),
        "total_broadcasts": await db.whatsapp_broadcasts.count_documents({"workspace_id": wid}),
        "total_sent": await db.whatsapp_send_queue.count_documents({"workspace_id": wid, "status": "sent"}),
        "total_conversations": await db.whatsapp_conversations.count_documents({"workspace_id": wid}),
        "total_contacts": await db.whatsapp_contacts.count_documents({"workspace_id": wid}),
    }

@whatsapp_router.get("/settings")
async def get_settings(user=Depends(current_user)):
    s = await db.whatsapp_settings.find_one({"workspace_id": user["workspace_id"]}, {"_id": 0})
    return s or {"business_name": "", "welcome_message": ""}

@whatsapp_router.post("/settings")
async def update_settings(body: dict, user=Depends(current_user)):
    await db.whatsapp_settings.update_one(
        {"workspace_id": user["workspace_id"]},
        {"$set": body}, upsert=True,
    )
    return {"ok": True}

# ---- Public Webhooks ----
@whatsapp_public_router.post("/hooks/whatsapp-incoming/{token}")
async def whatsapp_incoming(token: str, request: Request):
    webhook = await db.webhooks.find_one({"token": token, "kind": "whatsapp_inbound"})
    if not webhook:
        raise HTTPException(404, "Webhook not found")
    
    form = await request.form()
    from_number = _sanitize_phone(form.get("From", "").replace("whatsapp:", ""))
    body = form.get("Body", "")
    wid = webhook["workspace_id"]
    
    signature = request.headers.get("X-Twilio-Signature", "")
    if not twilio_client.verify_webhook_signature(str(request.url), dict(form), signature):
        raise HTTPException(403, "Invalid signature")
    
    # Find or create conversation
    lead = await db.leads.find_one({"phone": from_number, "workspace_id": wid}, {"_id": 0})
    conv = await db.whatsapp_conversations.find_one(
        {"workspace_id": wid, "phone": from_number},
        sort=[("updated_at", -1)],
    )
    
    msg = {"id": new_id(), "direction": "visitor", "body": body, "at": now_iso()}
    
    if conv:
        await db.whatsapp_conversations.update_one(
            {"id": conv["id"]},
            {"$push": {"messages": msg}, "$set": {"updated_at": now_iso()}}
        )
    else:
        conv_id = new_id()
        await db.whatsapp_conversations.insert_one({
            "id": conv_id, "workspace_id": wid,
            "phone": from_number, "lead_id": lead["id"] if lead else None,
            "status": "open",
            "session_expires_at": (datetime.now(dt_timezone.utc) + timedelta(hours=SESSION_HOURS)).isoformat(),
            "messages": [msg],
            "created_at": now_iso(), "updated_at": now_iso(),
        })
        
        if not lead:
            lid = new_id()
            await db.leads.insert_one({
                "id": lid, "workspace_id": wid, "phone": from_number,
                "first_name": "", "last_name": "", "email": f"wa-{lid[:8]}@unknown",
                "company": "", "title": "", "status": "new",
                "tags": ["whatsapp-eq"], "source": "whatsapp",
                "created_at": now_iso(), "updated_at": now_iso(),
                "owner_id": None, "intent": None, "dnc": False,
            })
    
    return {"ok": True}

@whatsapp_public_router.post("/hooks/whatsapp-status/{token}")
async def whatsapp_status(token: str, request: Request):
    """Delivery/read receipt webhook from Twilio."""
    webhook = await db.webhooks.find_one({"token": token, "kind": "whatsapp_status"})
    if not webhook:
        raise HTTPException(404, "Webhook not found")
    return {"ok": True}

# ---- Scheduler tick ----
async def run_whatsapp_send_tick():
    """Drain the WhatsApp send queue — runs every 2 minutes."""
    now = datetime.now(dt_timezone.utc)
    due = await db.whatsapp_send_queue.find({
        "status": "pending",
        "send_at": {"$lte": now.isoformat()},
    }, {"_id": 0}).sort("send_at", 1).to_list(50)
    
    for row in due:
        claimed = await db.whatsapp_send_queue.find_one_and_update(
            {"id": row["id"], "status": "pending"},
            {"$set": {"status": "sending", "attempts": (row.get("attempts") or 0) + 1}},
        )
        if not claimed:
            continue
        
        try:
            result = await twilio_client.send_whatsapp(
                to_number=row["phone"],
                body=row.get("body", ""),
            )
            await db.whatsapp_send_queue.update_one(
                {"id": row["id"]},
                {"$set": {"status": "sent", "sent_at": now_iso(), "error": None}}
            )
        except Exception as ex:
            attempts = (row.get("attempts") or 0) + 1
            failed = attempts >= 3
            await db.whatsapp_send_queue.update_one(
                {"id": row["id"]},
                {"$set": {
                    "status": "failed" if failed else "pending",
                    "error": str(ex)[:300],
                    "send_at": (now + timedelta(minutes=15)).isoformat(),
                }}
            )
            log.warning("WhatsApp send failed (%s): %s", row["id"], ex)
