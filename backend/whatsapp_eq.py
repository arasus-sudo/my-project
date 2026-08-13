"""WhatsApp EQ — Template approval, session inbox, broadcast sends, and an
automated response agent.

Extends Twilio client for WhatsApp Programmable Messaging. Mocked-first with
instant mock approval lifecycle.

The automated agent (workspace opt-in, `whatsapp_settings.automated_agent_enabled`)
answers inbound messages from a per-workspace knowledge base (crawled from a
URL or uploaded as a document), and can book a meeting through Schedule EQ's
real booking engine, capture a callback request as a CRM task, or share a
configured purchase link — instead of just chatting. Crawl/chunk technique is
reimplemented from `site_eq.py` (same convention that file itself uses relative
to `company_intel.py`: copy the pattern, don't cross-import a differently-coupled
module) rather than sharing Site EQ's `db.sites` model, which carries
website-widget-specific fields (domain, brand colors) that don't fit "one
knowledge base for one WhatsApp number." Like every other LLM integration in
this codebase, the agent's intent-decision is one `_llm_chat` call returning
strict JSON, branched on in plain Python — there is no tool-calling anywhere
in this app to build on instead.
"""

import io
import logging
import re
import secrets
from datetime import datetime, timedelta, timezone as dt_timezone
from typing import Any, Dict, List, Optional
from urllib.parse import urljoin, urlparse

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, File
from pydantic import BaseModel

from server import (
    db, now_iso, new_id, current_user, _audit, _log_activity,
    _llm_chat, _extract_json, ANTHROPIC_API_KEY, require_role, PUBLIC_BASE_URL,
)
from billing import charge_credits
from twilio_client import twilio_client

log = logging.getLogger(__name__)

whatsapp_router = APIRouter(prefix="/whatsapp-eq")
whatsapp_public_router = APIRouter()

SESSION_HOURS = 24
PAGE_SIZE = 25

# ---- Automated agent: KB crawl/retrieval tuning (mirrors site_eq.py's values) ----
MAX_CRAWL_PAGES = 30
CHUNK_SIZE = 800
TOP_K_CHUNKS = 5
HUMAN_REQUEST_RE = re.compile(r"\b(human|agent|person|representative|talk to (a )?(person|human)|speak to someone)\b", re.I)

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

class WAKBCrawlIn(BaseModel):
    url: str

# ---- Helpers ----
def _sanitize_phone(raw: str) -> str:
    return re.sub(r"[^\d+]", "", raw).strip()


def _session_expired(session_expires_at: Optional[str]) -> bool:
    """WhatsApp only allows freeform replies inside a rolling 24h session
    window — enforced here, not just documented. Pure and DB-free so it's
    directly unit-testable. No expiry set at all means no session has been
    opened yet, which is not the same as expired."""
    if not session_expires_at:
        return False
    return datetime.now(dt_timezone.utc).isoformat() > session_expires_at


def _valid_placeholder_email(lead_id: str) -> str:
    """Schedule EQ's `BookingIn.guest_email` is a Pydantic-validated `EmailStr`,
    unlike a lead document (a raw dict, never validated). This app's existing
    synthetic-email convention for auto-created WhatsApp/SMS leads
    (`f"wa-{lid[:8]}@unknown"`) fails `EmailStr` validation — `.unknown`/`.invalid`
    are RFC-2606 reserved-looking TLDs `email_validator` rejects. Use a
    real-structured placeholder domain instead, only when feeding a lead's
    email into a Pydantic EmailStr field — the existing `@unknown` convention
    used elsewhere for lead creation is untouched."""
    return f"wa-{lead_id[:8]}@wa-lead.example.com"


def _is_synthetic_email(email: str) -> bool:
    return (email or "").endswith("@unknown") or (email or "").endswith("@wa-lead.example.com")


# ---- Automated agent: knowledge base crawl/chunk (reimplemented from site_eq.py's
# technique, not cross-imported — see module docstring) ----
async def _fetch(url: str, timeout: int = 8) -> Optional[str]:
    if not url.startswith("http"):
        url = "https://" + url
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            r = await client.get(url, headers={"User-Agent": "Mozilla/5.0 InnoiraSuite/WhatsAppEQ"})
            r.raise_for_status()
            raw = r.text
    except Exception as ex:
        log.debug("whatsapp_eq fetch failed %s: %s", url, ex)
        return None
    raw = re.sub(r"<(script|style)\b[^>]*>[\s\S]*?(?:</\1\s*>|$)", " ", raw, flags=re.I)
    raw = re.sub(r"<!--[\s\S]*?(?:-->|$)", " ", raw)
    return raw


def _title(html: str) -> str:
    m = re.search(r"<title[^>]*>(.*?)</title>", html, re.I | re.S)
    return m.group(1).strip() if m else ""


def _clean_text(html: str, max_chars: int = 8000) -> str:
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"&[a-z]+;|&#\d+;", " ", text, flags=re.I)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:max_chars]


def _links(html: str, base_url: str) -> List[str]:
    parsed = urlparse(base_url)
    domain = parsed.netloc
    hrefs = re.findall(r'href=["\']([^"\']+)["\']', html, flags=re.I)
    out = set()
    for h in hrefs:
        full = urljoin(f"{parsed.scheme}://{domain}/", h.split("#")[0])
        p = urlparse(full)
        if p.netloc == domain and p.scheme in ("http", "https"):
            clean = f"{p.scheme}://{p.netloc}{p.path.rstrip('/')}" if p.path else f"{p.scheme}://{p.netloc}"
            if clean and not any(s in clean for s in (".pdf", ".zip", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".mp4", ".mp3")):
                out.add(clean)
    return list(out)


async def _crawl(root_url: str, max_pages: int = MAX_CRAWL_PAGES) -> List[Dict[str, str]]:
    root_url = root_url if root_url.startswith("http") else f"https://{root_url}"
    seen = {root_url}
    queue = [root_url]
    pages: List[Dict[str, str]] = []
    while queue and len(pages) < max_pages:
        url = queue.pop(0)
        html = await _fetch(url)
        if not html:
            continue
        pages.append({"url": url, "title": _title(html), "content": _clean_text(html)})
        for link in _links(html, url):
            if link not in seen and len(seen) < max_pages * 3:
                seen.add(link)
                queue.append(link)
    return pages


def _chunk(text: str, size: int = CHUNK_SIZE) -> List[str]:
    words = text.split()
    chunks, current = [], []
    length = 0
    for w in words:
        current.append(w)
        length += len(w) + 1
        if length >= size:
            chunks.append(" ".join(current))
            current, length = [], 0
    if current:
        chunks.append(" ".join(current))
    return chunks


def _extract_pdf_text(raw: bytes) -> str:
    from pypdf import PdfReader
    reader = PdfReader(io.BytesIO(raw))
    return "\n\n".join((page.extract_text() or "") for page in reader.pages)


_MD_BOLD_ITALIC_RE = re.compile(r"\*\*(.*?)\*\*|__(.*?)__|\*(.*?)\*")
_CITATION_RE = re.compile(r"\[\d+\](\[\d+\])*")


def _clean_reply(text: str) -> str:
    """`_llm_chat` runs on Perplexity under the hood, which defaults to
    markdown + numbered citation brackets — wrong for a plain-text WhatsApp
    bubble. Same cleanup as site_eq.py's `_clean_reply`."""
    text = _CITATION_RE.sub("", text)
    text = _MD_BOLD_ITALIC_RE.sub(lambda m: next(g for g in m.groups() if g is not None), text)
    text = re.sub(r"^\s*[-•]\s+", "", text, flags=re.M)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return text


async def _get_or_create_whatsapp_inbound_hook(workspace_id: str) -> Dict[str, Any]:
    """Mirrors voice_eq.py's _get_or_create_inbound_hook exactly — without
    this, there is no `db.webhooks` document with kind="whatsapp_inbound" for
    the inbound webhook lookup to ever find, and no URL to paste into
    Twilio's WhatsApp Sender config. Confirmed via grep: nothing in this
    codebase ever created one before this."""
    hook = await db.webhooks.find_one({"workspace_id": workspace_id, "kind": "whatsapp_inbound"}, {"_id": 0})
    if hook:
        return hook
    hook = {
        "id": new_id(), "workspace_id": workspace_id, "kind": "whatsapp_inbound",
        "name": "WhatsApp EQ inbound messages",
        "token": secrets.token_urlsafe(24), "active": True,
        "created_at": now_iso(), "message_count": 0, "last_message_at": None,
    }
    await db.webhooks.insert_one(hook)
    hook.pop("_id", None)
    return hook


async def _get_brand_voice(workspace_id: str) -> Dict[str, Any]:
    ws = await db.workspaces.find_one({"id": workspace_id}, {"_id": 0, "brand_voice": 1})
    return (ws or {}).get("brand_voice") or {}

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
    t.pop("_id", None)
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
async def delete_template(tid: str, user=Depends(require_role("org_admin", "campaign_manager"))):
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
    if _session_expired(conv.get("session_expires_at")):
        raise HTTPException(400, "Conversation session expired — send a template message to re-open")
    
    msg = {
        "id": new_id(), "direction": "agent",
        "body": body.body, "at": now_iso(),
    }
    await db.whatsapp_conversations.update_one(
        {"id": cid},
        # bot_paused=True: a human just took this conversation over — the
        # automated agent must never talk over them again until "Resume bot".
        {"$push": {"messages": msg}, "$set": {"updated_at": now_iso(), "bot_paused": True}}
    )
    try:
        await twilio_client.send_whatsapp(
            to_number=conv.get("phone", ""),
            body=body.body,
        )
    except Exception as e:
        log.warning("WhatsApp send failed: %s", e)

    return msg

@whatsapp_router.post("/conversations/{cid}/resume-bot")
async def resume_bot(cid: str, user=Depends(current_user)):
    conv = await db.whatsapp_conversations.find_one({"id": cid, "workspace_id": user["workspace_id"]}, {"_id": 0, "id": 1})
    if not conv:
        raise HTTPException(404, "Conversation not found")
    await db.whatsapp_conversations.update_one({"id": cid}, {"$set": {"bot_paused": False}})
    return {"ok": True}

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
             "bot_paused": True,
         }}
    )

    try:
        await twilio_client.send_whatsapp(
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

    system = ("You write short WhatsApp replies for a business's support/sales inbox. "
              "Given the conversation so far, suggest a natural, helpful reply to the "
              "customer's most recent message. Reply with the message text only, no "
              "preamble, no quotes.")

    try:
        suggestion = await _llm_chat(system, recent, f"wa-suggest-{cid[:8]}", user=user, agent="whatsapp", action="whatsapp_reply_suggest")
        suggestion = (suggestion or "").strip() or "Thank you for your message."
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
    b.pop("_id", None)
    await _audit(user, "whatsapp.broadcast.create", {"broadcast_id": b["id"]})
    return b

@whatsapp_router.post("/broadcasts/{bid}/launch")
async def launch_broadcast(bid: str, user=Depends(require_role("org_admin", "campaign_manager"))):
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

_DEFAULT_SETTINGS = {
    "business_name": "", "welcome_message": "",
    # Automated agent
    "automated_agent_enabled": False,
    "booking_event_type_slug": None,
    "purchase_link": "",
}

@whatsapp_router.get("/settings")
async def get_settings(user=Depends(current_user)):
    s = await db.whatsapp_settings.find_one({"workspace_id": user["workspace_id"]}, {"_id": 0})
    return {**_DEFAULT_SETTINGS, **(s or {})}

@whatsapp_router.post("/settings")
async def update_settings(body: dict, user=Depends(current_user)):
    await db.whatsapp_settings.update_one(
        {"workspace_id": user["workspace_id"]},
        {"$set": body}, upsert=True,
    )
    return {"ok": True}

@whatsapp_router.get("/settings/webhook-url")
async def get_webhook_url(user=Depends(current_user)):
    """The URL to paste into Twilio's WhatsApp Sender webhook config — without
    this, nothing inbound has ever been reachable (see module docstring)."""
    hook = await _get_or_create_whatsapp_inbound_hook(user["workspace_id"])
    return {"url": f"{PUBLIC_BASE_URL}/api/hooks/whatsapp-incoming/{hook['token']}"}


# ── Knowledge base (automated agent) ──
@whatsapp_router.get("/kb/sources")
async def list_kb_sources(user=Depends(current_user)):
    return await db.whatsapp_kb_sources.find(
        {"workspace_id": user["workspace_id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)


@whatsapp_router.post("/kb/sources/crawl")
async def crawl_kb_source(body: WAKBCrawlIn, user=Depends(current_user)):
    wid = user["workspace_id"]
    await charge_credits(wid, "whatsapp_kb_crawl", meta={"url": body.url})

    source = {
        "id": new_id(), "workspace_id": wid, "kind": "url",
        "source_url": body.url, "filename": None,
        "status": "pending", "pages_crawled": 0, "chunks_count": 0, "error": None,
        "created_at": now_iso(), "updated_at": now_iso(), "last_synced_at": None,
    }
    await db.whatsapp_kb_sources.insert_one(source)
    sid = source["id"]

    pages = await _crawl(body.url)
    chunk_docs = []
    for page in pages:
        for i, chunk in enumerate(_chunk(page["content"])):
            if not chunk.strip():
                continue
            chunk_docs.append({
                "id": new_id(), "workspace_id": wid, "source_id": sid,
                "page_url": page["url"], "page_title": page["title"],
                "chunk_index": i, "content": chunk, "created_at": now_iso(),
            })
    if chunk_docs:
        await db.whatsapp_kb_chunks.insert_many(chunk_docs)

    status = "ready" if pages else "error"
    await db.whatsapp_kb_sources.update_one({"id": sid}, {"$set": {
        "status": status, "pages_crawled": len(pages), "chunks_count": len(chunk_docs),
        "error": None if pages else "Crawl returned no pages — check the URL is reachable.",
        "updated_at": now_iso(), "last_synced_at": now_iso(),
    }})
    await _audit(user, "whatsapp.kb.crawl", {"source_id": sid, "pages": len(pages), "chunks": len(chunk_docs)})
    return await db.whatsapp_kb_sources.find_one({"id": sid}, {"_id": 0})


@whatsapp_router.post("/kb/sources/upload")
async def upload_kb_source(file: UploadFile = File(...), user=Depends(current_user)):
    wid = user["workspace_id"]
    raw = await file.read()
    filename = file.filename or "upload"

    try:
        if filename.lower().endswith(".pdf"):
            text = _extract_pdf_text(raw)
        else:
            text = raw.decode("utf-8", errors="ignore")
    except Exception as ex:
        raise HTTPException(400, f"Could not read file: {ex}")

    source = {
        "id": new_id(), "workspace_id": wid, "kind": "upload",
        "source_url": None, "filename": filename,
        "status": "pending", "pages_crawled": 0, "chunks_count": 0, "error": None,
        "created_at": now_iso(), "updated_at": now_iso(), "last_synced_at": None,
    }
    await db.whatsapp_kb_sources.insert_one(source)
    sid = source["id"]

    chunks = [c for c in _chunk(text) if c.strip()]
    chunk_docs = [{
        "id": new_id(), "workspace_id": wid, "source_id": sid,
        "page_url": None, "page_title": filename,
        "chunk_index": i, "content": c, "created_at": now_iso(),
    } for i, c in enumerate(chunks)]
    if chunk_docs:
        await db.whatsapp_kb_chunks.insert_many(chunk_docs)

    status = "ready" if chunk_docs else "error"
    await db.whatsapp_kb_sources.update_one({"id": sid}, {"$set": {
        "status": status, "chunks_count": len(chunk_docs),
        "error": None if chunk_docs else "No extractable text found in this file.",
        "updated_at": now_iso(), "last_synced_at": now_iso(),
    }})
    await _audit(user, "whatsapp.kb.upload", {"source_id": sid, "filename": filename, "chunks": len(chunk_docs)})
    return await db.whatsapp_kb_sources.find_one({"id": sid}, {"_id": 0})


@whatsapp_router.delete("/kb/sources/{sid}")
async def delete_kb_source(sid: str, user=Depends(current_user)):
    await db.whatsapp_kb_sources.delete_one({"id": sid, "workspace_id": user["workspace_id"]})
    await db.whatsapp_kb_chunks.delete_many({"source_id": sid})
    return {"ok": True}

# ---- Public Webhooks ----
# ---- Automated agent: the reply pipeline itself ----
async def _send_and_log(cid: str, phone: str, body: str) -> None:
    msg = {"id": new_id(), "direction": "agent", "body": body, "at": now_iso(), "automated": True}
    await db.whatsapp_conversations.update_one(
        {"id": cid}, {"$push": {"messages": msg}, "$set": {"updated_at": now_iso()}})
    try:
        await twilio_client.send_whatsapp(to_number=phone, body=body)
    except Exception as ex:
        log.warning("WhatsApp automated send failed: %s", ex)


async def _offer_slots(cid: str, phone: str, wid: str, et: Dict[str, Any], event_type_slug: str) -> None:
    from schedule_eq import _compute_open_slots
    slots = (await _compute_open_slots(wid, et))[:3]
    if not slots:
        await _send_and_log(cid, phone, "I don't see any open times in the next few weeks — I've flagged this for our team to help you find a slot.")
        await db.whatsapp_conversations.update_one({"id": cid}, {"$set": {"status": "needs_human", "updated_at": now_iso()}})
        return
    labels = [datetime.fromisoformat(s).strftime("%A, %b %d at %H:%M") for s in slots]
    reply = "Here are our next available times:\n" + "\n".join(f"{i + 1}. {l}" for i, l in enumerate(labels)) + \
            "\nReply with the number that works for you."
    await _send_and_log(cid, phone, reply)
    await db.whatsapp_conversations.update_one({"id": cid}, {"$set": {
        "pending_action": {"kind": "await_slot_pick", "event_type_slug": event_type_slug,
                           "slots": slots, "slot_labels": labels, "offered_at": now_iso()},
        "updated_at": now_iso(),
    }})


async def _handle_booking_intent(conv: Dict[str, Any], wid: str, phone: str,
                                 settings: Dict[str, Any], pending: Dict[str, Any], slot_index: Any) -> None:
    cid = conv["id"]
    event_type_slug = settings.get("booking_event_type_slug")
    if not event_type_slug:
        await _send_and_log(cid, phone, "I'd love to help you book a time, but our booking calendar isn't configured yet — I've flagged this for our team.")
        await db.whatsapp_conversations.update_one({"id": cid}, {"$set": {"status": "needs_human", "updated_at": now_iso()}})
        return

    et = await db.event_types.find_one({"workspace_id": wid, "slug": event_type_slug, "active": True}, {"_id": 0})
    if not et:
        await _send_and_log(cid, phone, "I'd love to help you book a time, but our booking calendar isn't set up right now — I've flagged this for our team.")
        await db.whatsapp_conversations.update_one({"id": cid}, {"$set": {"status": "needs_human", "updated_at": now_iso()}})
        return

    offered_slots = (pending.get("slots") or []) if pending.get("kind") == "await_slot_pick" else []
    if isinstance(slot_index, int) and 0 <= slot_index < len(offered_slots):
        from schedule_eq import create_booking, BookingIn, _compute_open_slots
        chosen = offered_slots[slot_index]
        fresh_slots = await _compute_open_slots(wid, et)
        if chosen not in fresh_slots:
            # Taken in the meantime — re-offer fresh options rather than 400ing.
            await _offer_slots(cid, phone, wid, et, event_type_slug)
            return

        lead = await db.leads.find_one({"id": conv.get("lead_id"), "workspace_id": wid}, {"_id": 0}) if conv.get("lead_id") else None
        real_email = lead.get("email") if lead else None
        guest_email = real_email if real_email and not _is_synthetic_email(real_email) \
            else _valid_placeholder_email(conv.get("lead_id") or cid)
        guest_name = f"{(lead or {}).get('first_name', '')} {(lead or {}).get('last_name', '')}".strip() or "WhatsApp customer"

        try:
            booking = await create_booking(wid, event_type_slug, BookingIn(
                guest_name=guest_name, guest_email=guest_email, guest_phone=phone, start_at=chosen,
            ))
        except HTTPException:
            await _offer_slots(cid, phone, wid, et, event_type_slug)
            return

        start_dt = datetime.fromisoformat(booking["start_at"])
        confirm = f"You're booked for {start_dt.strftime('%A, %b %d at %H:%M')} ({booking.get('timezone', 'UTC')}). Looking forward to it!"
        await _send_and_log(cid, phone, confirm)
        await db.whatsapp_conversations.update_one({"id": cid}, {"$set": {"pending_action": None, "updated_at": now_iso()}})
        return

    # No matching pre-existing selection — offer fresh slots.
    await _offer_slots(cid, phone, wid, et, event_type_slug)


async def _handle_callback_intent(conv: Dict[str, Any], wid: str, phone: str, llm_reply: str) -> None:
    cid = conv["id"]
    lead_id = conv.get("lead_id")
    reply = llm_reply or "Got it — someone from our team will call you back soon."
    if lead_id:
        try:
            from crm import create_lead_task, LeadTaskIn
            owner = await db.users.find_one({"workspace_id": wid, "role": "org_admin"}, {"_id": 0}) \
                or await db.users.find_one({"workspace_id": wid}, {"_id": 0})
            await create_lead_task(
                lead_id,
                LeadTaskIn(title="Callback requested via WhatsApp", due_at=None,
                          assignee_id=owner["id"] if owner else None),
                user={"workspace_id": wid},
            )
            await _log_activity(wid, lead_id, "whatsapp", "callback_requested",
                                "Customer requested a callback via WhatsApp", {"phone": phone})
        except Exception as ex:
            log.warning("whatsapp callback task creation failed for lead %s: %s", lead_id, ex)
    await _send_and_log(cid, phone, reply)


async def _handle_automated_reply(conv: Dict[str, Any], wid: str, phone: str, body: str, settings: Dict[str, Any]) -> Optional[str]:
    """The automated agent's turn: KB retrieval + one grounded, intent-classifying
    LLM call, branched on `intent` in plain Python — the only LLM-integration
    pattern anywhere in this codebase (no tool-calling exists here to build on
    instead). Mirrors site_eq.py's `_answer()` ordering: credits are charged
    *before* the LLM call, inside the same try, so an insufficient-credit
    failure short-circuits before spending real API cost on a reply that was
    going to be refused anyway. Never raises — any failure degrades to one
    generic reply + human handoff. Returns the classified intent ("faq",
    "book_meeting", "callback", "share_link", "handoff") so the webhook can
    feed Reply EQ's customer state; None if the agent never ran."""
    cid = conv["id"]

    # Explicit "talk to a human" request — hand off immediately, no LLM call,
    # same convention as site_eq.py's HUMAN_REQUEST_RE short-circuit.
    if HUMAN_REQUEST_RE.search(body):
        await _send_and_log(cid, phone, "Of course — I've flagged this for our team and someone will follow up with you shortly.")
        await db.whatsapp_conversations.update_one({"id": cid}, {"$set": {"status": "needs_human", "updated_at": now_iso()}})
        return "handoff"

    try:
        if not ANTHROPIC_API_KEY:
            await _send_and_log(cid, phone, "I don't have that on file yet — I've let our team know so a person can follow up.")
            await db.whatsapp_conversations.update_one({"id": cid}, {"$set": {"status": "needs_human", "updated_at": now_iso()}})
            return "handoff"

        # No KB match is only a dead end for FAQ intent — book_meeting/callback/
        # share_link don't depend on crawled content at all, so a "how do I pay"
        # message shouldn't hand off just because the text index found nothing.
        # The LLM still sees an honest "no matching content" context and is told
        # (below) never to invent facts for a faq answer specifically.
        chunks = await db.whatsapp_kb_chunks.find(
            {"workspace_id": wid, "$text": {"$search": body}}, {"_id": 0, "content": 1, "page_url": 1},
        ).limit(TOP_K_CHUNKS).to_list(TOP_K_CHUNKS)

        bv = await _get_brand_voice(wid)
        context = "\n\n".join(f"[{c.get('page_url') or 'document'}]\n{c['content']}" for c in chunks) \
            if chunks else "(no matching knowledge base content for this message)"
        history = conv.get("messages", [])[-6:]
        history_text = "\n".join(f"{m.get('direction', '')}: {m.get('body', '')}" for m in history)

        pending = conv.get("pending_action") or {}
        slot_context = ""
        if pending.get("kind") == "await_slot_pick":
            labels = pending.get("slot_labels") or []
            options = "\n".join(f"{i}: {lab}" for i, lab in enumerate(labels))
            slot_context = (
                f"\n\nThe customer was just offered these meeting times, shown to them numbered "
                f"1-{len(labels)}, but you must answer with the 0-based index:\n{options}\n"
                "If their reply picks one (by number, ordinal like 'the first one', or a matching "
                "time), set selected_slot_index to its 0-based position. Otherwise null."
            )

        tone = bv.get("tone") or "warm"
        offer = bv.get("offer") or ""
        banned = ", ".join(bv.get("banned_phrases") or [])
        system = (
            "You are the automated WhatsApp assistant for this business, replying in a plain-text "
            "chat bubble (not a document). Answer using ONLY the CONTEXT below — never invent facts, "
            "prices, or policies that aren't in it. Write like a person texting: plain sentences only, "
            "no markdown (**bold**, *italic*, bullet points), no citation markers like [1] or [10][16] "
            "— this is a chat bubble with no footnotes.\n"
            f"Tone: {tone}." + (f" Offer: {offer}." if offer else "") +
            (f" Never use these words/phrases: {banned}." if banned else "") + "\n\n"
            "Classify the customer's message into exactly one intent and respond with STRICT JSON "
            "only, no other text:\n"
            '{"intent": "faq"|"book_meeting"|"callback"|"share_link"|"handoff", '
            '"reply": "your plain-text reply text", "selected_slot_index": <int or null>}\n'
            "- faq: answer from CONTEXT.\n"
            "- book_meeting: they want to schedule a call/meeting/demo.\n"
            "- callback: they want someone to call them back (not schedule a specific meeting).\n"
            "- share_link: they're asking how/where to buy, pay, or sign up.\n"
            "- handoff: you're not confident CONTEXT covers this, or they seem frustrated/upset.\n"
            f"{slot_context}\n\nCONTEXT:\n{context}"
        )
        user_text = f"Conversation so far:\n{history_text}\n\nCustomer's new message: {body}"

        await charge_credits(wid, "whatsapp_ai_reply", meta={"conversation_id": cid})
        raw = await _llm_chat(system, user_text, f"wa-agent-{cid[:8]}", user={"workspace_id": wid}, agent="whatsapp", action="whatsapp_automated_reply")
        parsed = _extract_json(raw) or {}
        intent = parsed.get("intent") or "faq"
        reply = _clean_reply(parsed.get("reply") or "") or "Thanks for your message — let me get back to you on that."
        slot_index = parsed.get("selected_slot_index")

        if intent == "book_meeting":
            await _handle_booking_intent(conv, wid, phone, settings, pending, slot_index)
        elif intent == "callback":
            await _handle_callback_intent(conv, wid, phone, reply)
        elif intent == "share_link":
            link = (settings.get("purchase_link") or "").strip()
            if link and link not in reply:
                reply = f"{reply}\n{link}" if reply else link
            await _send_and_log(cid, phone, reply)
        elif intent == "handoff":
            await _send_and_log(cid, phone, reply)
            await db.whatsapp_conversations.update_one({"id": cid}, {"$set": {"status": "needs_human", "updated_at": now_iso()}})
        else:
            await _send_and_log(cid, phone, reply)
            await db.whatsapp_conversations.update_one({"id": cid}, {"$set": {"pending_action": None}})
        return intent
    except Exception as ex:
        log.warning("whatsapp automated reply failed for conversation %s: %s", cid, ex)
        try:
            await _send_and_log(cid, phone, "Sorry, I'm having trouble answering right now — I've flagged this for our team.")
        except Exception:
            pass
        await db.whatsapp_conversations.update_one({"id": cid}, {"$set": {"status": "needs_human", "updated_at": now_iso()}})
        return "handoff"


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

    await db.webhooks.update_one({"id": webhook["id"]}, {"$set": {"last_message_at": now_iso()}, "$inc": {"message_count": 1}})

    # Find or create conversation
    lead = await db.leads.find_one({"phone": from_number, "workspace_id": wid}, {"_id": 0})
    conv = await db.whatsapp_conversations.find_one(
        {"workspace_id": wid, "phone": from_number},
        sort=[("updated_at", -1)],
    )

    msg = {"id": new_id(), "direction": "visitor", "body": body, "at": now_iso()}
    # Every inbound message opens/refreshes the 24h session window, not just
    # the first one — previously only set once at conversation creation and
    # never refreshed on later messages, a real gap on an already-open thread.
    new_session_expiry = (datetime.now(dt_timezone.utc) + timedelta(hours=SESSION_HOURS)).isoformat()

    if conv:
        conv_id = conv["id"]
        await db.whatsapp_conversations.update_one(
            {"id": conv_id},
            {"$push": {"messages": msg}, "$set": {"updated_at": now_iso(), "session_expires_at": new_session_expiry}}
        )
    else:
        conv_id = new_id()
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
            lead = await db.leads.find_one({"id": lid}, {"_id": 0})
        await db.whatsapp_conversations.insert_one({
            "id": conv_id, "workspace_id": wid,
            "phone": from_number, "lead_id": lead["id"] if lead else None,
            "status": "open", "bot_paused": False, "pending_action": None,
            "session_expires_at": new_session_expiry,
            "messages": [msg],
            "created_at": now_iso(), "updated_at": now_iso(),
        })

    settings = await db.whatsapp_settings.find_one({"workspace_id": wid}, {"_id": 0})
    settings = {**_DEFAULT_SETTINGS, **(settings or {})}

    conv_now = await db.whatsapp_conversations.find_one({"id": conv_id}, {"_id": 0})
    intent = None
    if settings.get("automated_agent_enabled") and not conv_now.get("bot_paused"):
        try:
            intent = await _handle_automated_reply(conv_now, wid, from_number, body, settings)
        except Exception as ex:
            # _handle_automated_reply already degrades gracefully internally;
            # this is a final backstop so a webhook call to Twilio never 500s
            # (which would just trigger a pointless retry of the same message).
            log.warning("whatsapp automated reply crashed for conversation %s: %s", conv_id, ex)

    # Feed Reply EQ's customer state — every inbound message, agent on or off,
    # so a conversation never goes un-tracked. Reply EQ must never break the
    # Twilio webhook path, hence the backstop.
    try:
        from reply_eq import record_whatsapp_inbound
        await record_whatsapp_inbound(wid, from_number, body, intent=intent)
    except Exception as ex:
        log.warning("reply_eq inbound record failed for conversation %s: %s", conv_id, ex)

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
            try:
                await charge_credits(row["workspace_id"], "whatsapp_broadcast_send",
                                      meta={"broadcast_id": row.get("broadcast_id")})
            except Exception:
                pass  # a metering failure must never undo a send that already went out
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
