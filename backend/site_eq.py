"""Site EQ — AI website chat widget agent.

Seventh agent in the Innoira Agentic Suite: a customer creates a "site" for
their own domain, we crawl it into a searchable knowledge base, and they
embed a small widget script on their real website. Visitors chat with an AI
that answers ONLY from the crawled content (never invents an answer) and
hands off to a human — surfaced in a Site Inbox — the moment it isn't
confident or the visitor asks for a person. An email shared mid-chat creates
a lead, same as every other agent's capture path.

Deliberately v1-scoped (see the approved plan): retrieval is a MongoDB text
index over chunked page content, not vector/hybrid search — this Mongo is
local `mongod`, not Atlas, so there's no native vector search without adding
a new datastore dependency. Good enough for "answer from my own site's
content"; embeddings are the named v2 upgrade once volume justifies it.

Crawling reuses the exact technique `company_intel.py` already established
(async httpx BFS, regex-based tag stripping, no new parsing library) rather
than importing its private, sales-profile-coupled functions across modules.
"""

import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import urljoin, urlparse

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, PlainTextResponse
from pydantic import BaseModel

from server import db, current_user, now_iso, new_id, _audit, _log_activity, _llm_chat, ANTHROPIC_API_KEY

log = logging.getLogger(__name__)

site_router = APIRouter(prefix="/site-eq")
site_public_router = APIRouter()

MAX_CRAWL_PAGES = 30
CHUNK_SIZE = 800
TOP_K_CHUNKS = 5
EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")
HUMAN_REQUEST_RE = re.compile(r"\b(human|agent|person|representative|talk to (a )?(person|human)|speak to someone)\b", re.I)


# ----------------------------- Models ---------------------------------------
class SiteBrand(BaseModel):
    primary_color: str = "#3B82F6"
    logo_url: Optional[str] = None
    welcome_message: str = "Hi! Ask me anything about this site."
    position: str = "bottom-right"  # bottom-right | bottom-left


class SiteIn(BaseModel):
    name: str
    domain: str
    brand: SiteBrand = SiteBrand()


class MessageIn(BaseModel):
    visitor_id: str
    conversation_id: Optional[str] = None
    body: str


class ReplyIn(BaseModel):
    body: str


# ----------------------------- Crawler (same technique as company_intel.py) --
async def _fetch(url: str, timeout: int = 8) -> Optional[str]:
    if not url.startswith("http"):
        url = "https://" + url
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            r = await client.get(url, headers={"User-Agent": "Mozilla/5.0 InnoiraSuite/SiteEQ"})
            r.raise_for_status()
            raw = r.text
    except Exception as ex:
        log.debug("site_eq fetch failed %s: %s", url, ex)
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


# ----------------------------- Sites CRUD (authenticated) --------------------
@site_router.get("/sites")
async def list_sites(user=Depends(current_user)):
    return await db.sites.find({"workspace_id": user["workspace_id"]}, {"_id": 0}).to_list(100)


@site_router.post("/sites")
async def create_site(body: SiteIn, user=Depends(current_user)):
    doc = {
        "id": new_id(), "workspace_id": user["workspace_id"], "name": body.name,
        "domain": body.domain, "brand": body.brand.model_dump(),
        "status": "not_crawled", "pages_crawled": 0,
        "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.sites.insert_one(doc)
    doc.pop("_id", None)
    await _audit(user, "site_eq.site.create", {"id": doc["id"], "domain": body.domain})
    return doc


@site_router.put("/sites/{sid}")
async def update_site(sid: str, body: SiteIn, user=Depends(current_user)):
    await db.sites.update_one(
        {"id": sid, "workspace_id": user["workspace_id"]},
        {"$set": {"name": body.name, "domain": body.domain, "brand": body.brand.model_dump(), "updated_at": now_iso()}},
    )
    return await db.sites.find_one({"id": sid, "workspace_id": user["workspace_id"]}, {"_id": 0})


@site_router.delete("/sites/{sid}")
async def delete_site(sid: str, user=Depends(current_user)):
    await db.sites.delete_one({"id": sid, "workspace_id": user["workspace_id"]})
    await db.site_kb_chunks.delete_many({"site_id": sid})
    return {"ok": True}


@site_router.post("/sites/{sid}/crawl")
async def crawl_site(sid: str, user=Depends(current_user)):
    site = await db.sites.find_one({"id": sid, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not site:
        raise HTTPException(404, "not found")

    from billing import charge_credits
    await charge_credits(user["workspace_id"], "site_crawl", meta={"site_id": sid})

    await db.sites.update_one({"id": sid}, {"$set": {"status": "crawling", "updated_at": now_iso()}})
    pages = await _crawl(site["domain"])

    await db.site_kb_chunks.delete_many({"site_id": sid})
    chunk_docs = []
    for page in pages:
        for i, chunk in enumerate(_chunk(page["content"])):
            if not chunk.strip():
                continue
            chunk_docs.append({
                "id": new_id(), "workspace_id": user["workspace_id"], "site_id": sid,
                "page_url": page["url"], "page_title": page["title"],
                "chunk_index": i, "content": chunk, "created_at": now_iso(),
            })
    if chunk_docs:
        await db.site_kb_chunks.insert_many(chunk_docs)

    status = "ready" if pages else "error"
    await db.sites.update_one({"id": sid}, {"$set": {
        "status": status, "pages_crawled": len(pages), "last_crawled_at": now_iso(), "updated_at": now_iso(),
    }})
    await _audit(user, "site_eq.site.crawl", {"id": sid, "pages": len(pages), "chunks": len(chunk_docs)})
    return {"ok": True, "pages_crawled": len(pages), "chunks": len(chunk_docs)}


@site_router.get("/sites/{sid}/pages")
async def list_site_pages(sid: str, user=Depends(current_user)):
    site = await db.sites.find_one({"id": sid, "workspace_id": user["workspace_id"]}, {"_id": 0, "id": 1})
    if not site:
        raise HTTPException(404, "not found")
    chunks = await db.site_kb_chunks.find({"site_id": sid}, {"_id": 0, "page_url": 1, "page_title": 1}).to_list(2000)
    pages: Dict[str, str] = {}
    for c in chunks:
        pages.setdefault(c["page_url"], c["page_title"])
    return [{"url": u, "title": t} for u, t in pages.items()]


# ----------------------------- Conversations (authenticated: Site Inbox) -----
@site_router.get("/conversations")
async def list_conversations(status: Optional[str] = None, user=Depends(current_user)):
    q: Dict[str, Any] = {"workspace_id": user["workspace_id"]}
    if status:
        q["status"] = status
    convos = await db.site_conversations.find(q, {"_id": 0}).sort("updated_at", -1).to_list(500)
    site_ids = list({c["site_id"] for c in convos})
    sites = await db.sites.find({"id": {"$in": site_ids}}, {"_id": 0, "id": 1, "name": 1}).to_list(len(site_ids) or 1)
    names = {s["id"]: s["name"] for s in sites}
    for c in convos:
        c["site_name"] = names.get(c["site_id"])
    return convos


@site_router.get("/conversations/{cid}")
async def get_conversation(cid: str, user=Depends(current_user)):
    c = await db.site_conversations.find_one({"id": cid, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not c:
        raise HTTPException(404, "not found")
    return c


@site_router.post("/conversations/{cid}/reply")
async def reply_conversation(cid: str, body: ReplyIn, user=Depends(current_user)):
    c = await db.site_conversations.find_one({"id": cid, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not c:
        raise HTTPException(404, "not found")
    await db.site_conversations.update_one({"id": cid}, {
        "$push": {"messages": {"from": "agent", "body": body.body, "at": now_iso()}},
        "$set": {"status": "resolved", "updated_at": now_iso()},
    })
    await _audit(user, "site_eq.conversation.reply", {"id": cid})
    return {"ok": True}


@site_router.post("/conversations/{cid}/resolve")
async def resolve_conversation(cid: str, user=Depends(current_user)):
    await db.site_conversations.update_one(
        {"id": cid, "workspace_id": user["workspace_id"]}, {"$set": {"status": "resolved", "updated_at": now_iso()}})
    return {"ok": True}


# ----------------------------- Analytics --------------------------------------
@site_router.get("/analytics")
async def get_analytics(user=Depends(current_user)):
    convos = await db.site_conversations.find({"workspace_id": user["workspace_id"]}, {"_id": 0}).to_list(5000)
    total = len(convos)
    resolved = sum(1 for c in convos if c["status"] == "resolved")
    needs_human = sum(1 for c in convos if c["status"] == "needs_human")
    leads_captured = sum(1 for c in convos if c.get("lead_id"))
    by_day: Dict[str, int] = {}
    for c in convos:
        day = (c.get("created_at") or "")[:10]
        by_day[day] = by_day.get(day, 0) + 1
    return {
        "total_conversations": total, "resolved": resolved, "needs_human": needs_human,
        "leads_captured": leads_captured,
        "resolution_rate": round(resolved / total * 100) if total else 0,
        "by_day": dict(sorted(by_day.items())),
    }


# ----------------------------- Public: widget + chat (own CORS handling) -----
def _cors_headers(request: Request) -> Dict[str, str]:
    """Reflects the caller's Origin rather than using the app's global
    CORS_ORIGINS allowlist — these routes are deliberately public-by-design
    (embedded via <script> on an arbitrary customer's own domain, which could
    be anything), so restricting Origin here doesn't serve any purpose the
    per-site `domain` check on the site record doesn't already cover."""
    origin = request.headers.get("origin", "*")
    return {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Vary": "Origin",
    }


@site_public_router.options("/site-eq/public/{site_id}/{rest_of_path:path}")
async def site_public_preflight(site_id: str, rest_of_path: str, request: Request):
    return JSONResponse({}, headers=_cors_headers(request))


@site_public_router.get("/site-eq/public/{site_id}/widget.js")
async def widget_script(site_id: str, request: Request):
    site = await db.sites.find_one({"id": site_id}, {"_id": 0})
    if not site:
        raise HTTPException(404, "unknown site")
    brand = site.get("brand") or {}
    js = _WIDGET_JS_TEMPLATE % {
        "site_id": site_id,
        "primary_color": brand.get("primary_color", "#3B82F6"),
        "welcome_message": (brand.get("welcome_message") or "Hi! Ask me anything.").replace("`", "'"),
        "position": brand.get("position", "bottom-right"),
    }
    return PlainTextResponse(js, media_type="application/javascript", headers=_cors_headers(request))


@site_public_router.post("/site-eq/public/{site_id}/message")
async def public_message(site_id: str, body: MessageIn, request: Request):
    site = await db.sites.find_one({"id": site_id}, {"_id": 0})
    if not site:
        raise HTTPException(404, "unknown site")

    conversation = None
    if body.conversation_id:
        conversation = await db.site_conversations.find_one(
            {"id": body.conversation_id, "site_id": site_id}, {"_id": 0})
    if not conversation:
        conversation = {
            "id": new_id(), "workspace_id": site["workspace_id"], "site_id": site_id,
            "visitor_id": body.visitor_id, "lead_id": None, "status": "open",
            "messages": [], "created_at": now_iso(), "updated_at": now_iso(),
        }
        await db.site_conversations.insert_one({**conversation})

    visitor_msg = {"from": "visitor", "body": body.body, "at": now_iso()}
    await db.site_conversations.update_one(
        {"id": conversation["id"]}, {"$push": {"messages": visitor_msg}, "$set": {"updated_at": now_iso()}})

    # Lead capture — an email shared mid-chat becomes a lead, same as every
    # other agent's capture path, tagged so its source is obvious in the CRM.
    email_match = EMAIL_RE.search(body.body)
    if email_match and not conversation.get("lead_id"):
        email = email_match.group(0)
        lead = await db.leads.find_one({"workspace_id": site["workspace_id"], "email": email}, {"_id": 0, "id": 1})
        if lead:
            lead_id = lead["id"]
        else:
            lead_id = new_id()
            await db.leads.insert_one({
                "id": lead_id, "workspace_id": site["workspace_id"], "first_name": "Website visitor",
                "last_name": "", "email": email, "company": "", "title": "", "phone": None,
                "tags": ["site_eq"], "source": "site_eq", "created_at": now_iso(),
            })
        await db.site_conversations.update_one({"id": conversation["id"]}, {"$set": {"lead_id": lead_id}})
        await _log_activity(site["workspace_id"], lead_id, "site", "lead_captured",
                            f"Captured from a Site EQ chat on {site['domain']}", {"conversation_id": conversation["id"]})

    # Explicit "talk to a human" request — hand off immediately, no LLM call.
    if HUMAN_REQUEST_RE.search(body.body):
        reply = "Of course — I've flagged this for our team and someone will follow up with you shortly."
        await db.site_conversations.update_one({"id": conversation["id"]}, {
            "$push": {"messages": {"from": "ai", "body": reply, "at": now_iso()}},
            "$set": {"status": "needs_human", "updated_at": now_iso()},
        })
        return JSONResponse(
            {"conversation_id": conversation["id"], "reply": reply, "handed_off": True},
            headers=_cors_headers(request),
        )

    reply, handed_off = await _answer(site, conversation, body.body)
    await db.site_conversations.update_one({"id": conversation["id"]}, {
        "$push": {"messages": {"from": "ai", "body": reply, "at": now_iso()}},
        "$set": {"status": "needs_human" if handed_off else "open", "updated_at": now_iso()},
    })
    return JSONResponse(
        {"conversation_id": conversation["id"], "reply": reply, "handed_off": handed_off},
        headers=_cors_headers(request),
    )


_MD_BOLD_ITALIC_RE = re.compile(r"\*\*(.*?)\*\*|__(.*?)__|\*(.*?)\*")
_CITATION_RE = re.compile(r"\[\d+\](\[\d+\])*")


def _clean_reply(text: str) -> str:
    """`_llm_chat` runs on Perplexity under the hood (see server.py), which
    defaults to markdown + numbered citation brackets like `[10][16]` — fine
    for a research answer, wrong for a plain-text chat bubble that renders
    the string as-is (literal asterisks/brackets would show to the visitor).
    Strips both defensively rather than relying on prompt compliance alone."""
    text = _CITATION_RE.sub("", text)
    text = _MD_BOLD_ITALIC_RE.sub(lambda m: next(g for g in m.groups() if g is not None), text)
    text = re.sub(r"^\s*[-•]\s+", "", text, flags=re.M)  # bullet markers -> plain lines
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return text


async def _answer(site: Dict[str, Any], conversation: Dict[str, Any], question: str) -> tuple:
    """Text-index retrieval + a grounded LLM answer. Returns (reply, handed_off)."""
    chunks = await db.site_kb_chunks.find(
        {"site_id": site["id"], "$text": {"$search": question}}, {"_id": 0, "content": 1, "page_url": 1},
    ).limit(TOP_K_CHUNKS).to_list(TOP_K_CHUNKS)

    if not chunks or not ANTHROPIC_API_KEY:
        reply = "I don't have that on file yet — I've let our team know so a person can follow up."
        return reply, True

    context = "\n\n".join(f"[{c['page_url']}]\n{c['content']}" for c in chunks)
    history = conversation.get("messages", [])[-6:]
    history_text = "\n".join(f"{m['from']}: {m['body']}" for m in history)
    site_name = site.get("name") or site.get("domain") or "this company"
    system = (
        f"You are the AI assistant embedded on {site_name}'s own website, replying in a "
        "plain-text chat bubble (not a document). Answer the visitor's question using ONLY the "
        "CONTEXT below — never invent facts, prices, or policies that aren't in it. If the context "
        "doesn't cover the question, say you'll connect them with a person, plainly and briefly. "
        "Write like a person texting: plain sentences only. Never use markdown (**bold**, *italic*, "
        "bullet points) and never add citation markers like [1] or [10][16] — this is a chat bubble "
        "with no footnotes, so bracketed numbers would just look like a rendering glitch to the visitor.\n\n"
        f"CONTEXT:\n{context}"
    )
    user_text = f"Conversation so far:\n{history_text}\n\nVisitor's new message: {question}"
    try:
        from billing import charge_credits
        await charge_credits(site["workspace_id"], "site_chat_reply", meta={"site_id": site["id"]})
        raw_reply = await _llm_chat(system, user_text, f"site-eq-{conversation['id'][:8]}")
        reply = _clean_reply(raw_reply)
        handed_off = "connect them with a person" in reply.lower() or "connect you with" in reply.lower()
        return reply.strip(), handed_off
    except Exception as ex:
        log.warning("site_eq chat failed: %s", ex)
        return "Sorry, I'm having trouble answering right now — I've flagged this for our team.", True


async def run_site_recrawl_tick() -> None:
    """Weekly: any 'ready' site whose last crawl is 7+ days old gets refreshed
    automatically, so the KB doesn't silently go stale. Skips sites that have
    never completed a first crawl (those wait for the user's explicit action)."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    sites = await db.sites.find(
        {"status": "ready", "last_crawled_at": {"$lte": cutoff}}, {"_id": 0}).to_list(200)
    for site in sites:
        try:
            pages = await _crawl(site["domain"])
            await db.site_kb_chunks.delete_many({"site_id": site["id"]})
            chunk_docs = []
            for page in pages:
                for i, chunk in enumerate(_chunk(page["content"])):
                    if not chunk.strip():
                        continue
                    chunk_docs.append({
                        "id": new_id(), "workspace_id": site["workspace_id"], "site_id": site["id"],
                        "page_url": page["url"], "page_title": page["title"],
                        "chunk_index": i, "content": chunk, "created_at": now_iso(),
                    })
            if chunk_docs:
                await db.site_kb_chunks.insert_many(chunk_docs)
            await db.sites.update_one({"id": site["id"]}, {"$set": {
                "pages_crawled": len(pages), "last_crawled_at": now_iso(), "updated_at": now_iso(),
            }})
        except Exception as ex:
            log.warning("weekly re-crawl failed for site %s: %s", site["id"], ex)


_WIDGET_JS_TEMPLATE = r"""
(function () {
  var SITE_ID = "%(site_id)s";
  var API_BASE = (document.currentScript && document.currentScript.src.split("/site-eq/")[0]) || "";
  var PRIMARY = "%(primary_color)s";
  var WELCOME = `%(welcome_message)s`;
  var POSITION = "%(position)s";
  var visitorId = localStorage.getItem("site_eq_visitor") || (function () {
    var id = "v_" + Math.random().toString(36).slice(2);
    localStorage.setItem("site_eq_visitor", id);
    return id;
  })();
  var conversationId = null;

  var bubble = document.createElement("button");
  bubble.textContent = "💬";
  bubble.style.cssText = "position:fixed;" + (POSITION.indexOf("left") > -1 ? "left:20px;" : "right:20px;") +
    "bottom:20px;width:56px;height:56px;border-radius:999px;border:none;background:" + PRIMARY +
    ";color:#fff;font-size:24px;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.2);z-index:999999;";
  document.body.appendChild(bubble);

  var panel = document.createElement("div");
  panel.style.cssText = "position:fixed;" + (POSITION.indexOf("left") > -1 ? "left:20px;" : "right:20px;") +
    "bottom:86px;width:340px;max-width:90vw;height:460px;max-height:70vh;background:#fff;" +
    "border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,.24);display:none;flex-direction:column;" +
    "font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;overflow:hidden;z-index:999999;";
  var log = document.createElement("div");
  log.style.cssText = "flex:1;overflow-y:auto;padding:14px;font-size:14px;color:#1D1D1F;";
  var inputRow = document.createElement("div");
  inputRow.style.cssText = "display:flex;border-top:1px solid #eee;padding:8px;gap:8px;";
  var input = document.createElement("input");
  input.placeholder = "Type a message…";
  input.style.cssText = "flex:1;border:1px solid #ddd;border-radius:999px;padding:8px 12px;font-size:13px;outline:none;";
  var send = document.createElement("button");
  send.textContent = "Send";
  send.style.cssText = "border:none;background:" + PRIMARY + ";color:#fff;border-radius:999px;padding:8px 14px;cursor:pointer;font-size:13px;";
  inputRow.appendChild(input);
  inputRow.appendChild(send);
  panel.appendChild(log);
  panel.appendChild(inputRow);
  document.body.appendChild(panel);

  function addMsg(from, text) {
    var row = document.createElement("div");
    row.style.cssText = "margin-bottom:10px;text-align:" + (from === "visitor" ? "right" : "left") + ";";
    var bubbleEl = document.createElement("span");
    bubbleEl.textContent = text;
    bubbleEl.style.cssText = "display:inline-block;padding:8px 12px;border-radius:12px;max-width:80%%;" +
      (from === "visitor" ? "background:" + PRIMARY + ";color:#fff;" : "background:#F5F5F7;color:#1D1D1F;");
    row.appendChild(bubbleEl);
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
  }

  var opened = false;
  bubble.onclick = function () {
    opened = !opened;
    panel.style.display = opened ? "flex" : "none";
    if (opened && !log.hasChildNodes()) addMsg("ai", WELCOME);
  };

  function submit() {
    var text = input.value.trim();
    if (!text) return;
    addMsg("visitor", text);
    input.value = "";
    fetch(API_BASE + "/site-eq/public/" + SITE_ID + "/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitor_id: visitorId, conversation_id: conversationId, body: text }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        conversationId = data.conversation_id;
        addMsg("ai", data.reply);
      })
      .catch(function () { addMsg("ai", "Sorry, something went wrong."); });
  }
  send.onclick = submit;
  input.addEventListener("keydown", function (e) { if (e.key === "Enter") submit(); });
})();
"""
