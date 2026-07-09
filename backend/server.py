"""Pitch EQ - AI Cold Email SaaS Backend.

Single-file FastAPI backend implementing multi-tenant workspaces, JWT auth,
campaigns, sequencer, leads, mailboxes, unified inbox, CRM pipeline, and a
heuristic EQ Score engine (real LLM to be plugged in later).
"""

from fastapi import FastAPI, APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import re
import logging
import uuid
import bcrypt
import jwt
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

JWT_SECRET = os.environ.get("JWT_SECRET", "pitcheq-dev-secret-change-me")
JWT_ALG = "HS256"
JWT_TTL_HOURS = 24 * 7

app = FastAPI(title="Pitch EQ API")
api = APIRouter(prefix="/api")
bearer = HTTPBearer(auto_error=False)


# ----------------------------- Helpers ---------------------------------------
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_pw(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False


def make_token(user_id: str, workspace_id: str) -> str:
    payload = {
        "uid": user_id,
        "wid": workspace_id,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_TTL_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


async def current_user(cred: HTTPAuthorizationCredentials = Depends(bearer)):
    if not cred:
        raise HTTPException(401, "Missing token")
    try:
        payload = jwt.decode(cred.credentials, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid token")
    user = await db.users.find_one({"id": payload["uid"]}, {"_id": 0})
    if not user:
        raise HTTPException(401, "User not found")
    user["workspace_id"] = payload["wid"]
    return user


# ----------------------------- Models ----------------------------------------
class SignupIn(BaseModel):
    name: str
    email: EmailStr
    password: str
    workspace_name: str


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class LeadIn(BaseModel):
    first_name: str
    last_name: Optional[str] = ""
    email: EmailStr
    company: Optional[str] = ""
    title: Optional[str] = ""
    linkedin: Optional[str] = ""
    tags: List[str] = []


class LeadBulk(BaseModel):
    leads: List[LeadIn]


class SequenceStep(BaseModel):
    day: int = 0
    subject: str
    body: str
    ab_variant_subject: Optional[str] = ""
    ab_variant_body: Optional[str] = ""


class CampaignIn(BaseModel):
    name: str
    goal: str = "Book meetings"
    from_mailbox_id: Optional[str] = None
    steps: List[SequenceStep]
    lead_ids: List[str] = []
    send_window_start: str = "09:00"
    send_window_end: str = "17:00"
    timezone: str = "UTC"


class MailboxIn(BaseModel):
    email: EmailStr
    provider: str = "gmail"  # gmail / m365 / smtp
    display_name: str = ""
    daily_cap: int = 50


class ReplyIn(BaseModel):
    body: str


class DealIn(BaseModel):
    lead_id: str
    title: str
    value: float = 0
    stage: str = "new"


class AIPersonalizeIn(BaseModel):
    lead_id: Optional[str] = None
    lead: Optional[Dict[str, Any]] = None
    template: str
    tone: str = "warm"


class AIScoreIn(BaseModel):
    subject: str
    body: str


# ----------------------------- EQ Score Engine -------------------------------
SPAM_WORDS = {
    "free", "guarantee", "act now", "limited time", "buy now", "click here",
    "urgent", "cash", "risk-free", "no obligation", "winner", "$$$", "!!!",
}
EMPATHY_WORDS = {
    "understand", "notice", "noticed", "curious", "thoughts", "appreciate",
    "value", "context", "challenge", "help", "share", "learn",
}
CTA_MARKERS = {"?", "would you", "open to", "worth a", "book a", "quick chat", "15 minutes", "15-min"}


def compute_eq(subject: str, body: str, lead: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    text = f"{subject}\n{body}".lower()
    words = re.findall(r"[a-z]+", text)
    wc = max(1, len(words))

    # Relevance: personalization tokens or replaced first/company names
    tokens = len(re.findall(r"\{\{[^}]+\}\}", body))
    lead_mentions = 0
    if lead:
        for k in ("first_name", "company", "title"):
            v = str(lead.get(k) or "").strip().lower()
            if v and v in text:
                lead_mentions += 1
    relevance = min(100, 40 + tokens * 8 + lead_mentions * 18)

    # Empathy / tone
    empathy_hits = sum(1 for w in EMPATHY_WORDS if w in text)
    tone_empathy = min(100, 30 + empathy_hits * 12)

    # Clarity: shorter, structured body scores higher
    length_penalty = max(0, wc - 120) * 0.4
    clarity = int(max(20, min(100, 100 - length_penalty)))

    # CTA
    cta_hits = sum(1 for m in CTA_MARKERS if m in text)
    cta = min(100, 30 + cta_hits * 20)

    # Spam risk (inverse -> higher is better)
    spam_hits = sum(1 for w in SPAM_WORDS if w in text)
    exclam = body.count("!")
    caps_words = sum(1 for w in re.findall(r"[A-Z]{3,}", body))
    spam_risk_penalty = spam_hits * 12 + exclam * 4 + caps_words * 6
    spam_safety = max(0, 100 - spam_risk_penalty)

    overall = int(round(
        relevance * 0.30 + tone_empathy * 0.20 + clarity * 0.20 + cta * 0.15 + spam_safety * 0.15
    ))
    hints = []
    if relevance < 60:
        hints.append("Add more lead-specific context (name, company, role, or a recent trigger).")
    if tone_empathy < 60:
        hints.append("Warm up the tone: acknowledge their world before pitching.")
    if clarity < 60:
        hints.append("Shorten the email — aim for under 120 words.")
    if cta < 60:
        hints.append("Sharpen the CTA — one clear question or 15-min ask.")
    if spam_safety < 70:
        hints.append("Reduce spammy words, exclamations, and ALL-CAPS phrases.")
    return {
        "overall": overall,
        "relevance": relevance,
        "empathy": tone_empathy,
        "clarity": clarity,
        "cta": cta,
        "spam_safety": spam_safety,
        "hints": hints,
    }


def personalize(template: str, lead: Dict[str, Any]) -> str:
    def repl(m):
        key = m.group(1).strip()
        return str(lead.get(key) or f"{{{{{key}}}}}")

    return re.sub(r"\{\{([^}]+)\}\}", repl, template)


# ----------------------------- Auth Routes -----------------------------------
@api.post("/auth/signup")
async def signup(body: SignupIn):
    if await db.users.find_one({"email": body.email.lower()}):
        raise HTTPException(400, "Email already registered")
    workspace_id = new_id()
    user_id = new_id()
    await db.workspaces.insert_one({
        "id": workspace_id,
        "name": body.workspace_name,
        "owner_id": user_id,
        "created_at": now_iso(),
        "brand_voice": {"tone": "warm", "banned_phrases": [], "sample": ""},
        "plan": "trial",
    })
    await db.users.insert_one({
        "id": user_id,
        "email": body.email.lower(),
        "name": body.name,
        "password_hash": hash_pw(body.password),
        "workspace_id": workspace_id,
        "role": "org_admin",
        "created_at": now_iso(),
    })
    token = make_token(user_id, workspace_id)
    return {"token": token, "user": {"id": user_id, "email": body.email.lower(), "name": body.name},
            "workspace": {"id": workspace_id, "name": body.workspace_name}}


@api.post("/auth/login")
async def login(body: LoginIn):
    user = await db.users.find_one({"email": body.email.lower()}, {"_id": 0})
    if not user or not verify_pw(body.password, user["password_hash"]):
        raise HTTPException(401, "Invalid credentials")
    token = make_token(user["id"], user["workspace_id"])
    ws = await db.workspaces.find_one({"id": user["workspace_id"]}, {"_id": 0})
    return {"token": token, "user": {"id": user["id"], "email": user["email"], "name": user["name"]},
            "workspace": {"id": ws["id"], "name": ws["name"]}}


@api.get("/auth/me")
async def me(user=Depends(current_user)):
    ws = await db.workspaces.find_one({"id": user["workspace_id"]}, {"_id": 0})
    return {"user": {"id": user["id"], "email": user["email"], "name": user["name"], "role": user["role"]},
            "workspace": ws}


# ----------------------------- Leads -----------------------------------------
@api.get("/leads")
async def list_leads(user=Depends(current_user)):
    items = await db.leads.find({"workspace_id": user["workspace_id"]}, {"_id": 0}).to_list(2000)
    return items


@api.post("/leads")
async def create_lead(body: LeadIn, user=Depends(current_user)):
    lead = body.model_dump()
    lead["id"] = new_id()
    lead["workspace_id"] = user["workspace_id"]
    lead["email"] = lead["email"].lower()
    lead["status"] = "new"
    lead["icp_score"] = 60 + (len(lead.get("company", "")) % 40)
    lead["verified"] = "@" in lead["email"] and "." in lead["email"].split("@")[-1]
    lead["created_at"] = now_iso()
    # dedup by email in workspace
    if await db.leads.find_one({"workspace_id": user["workspace_id"], "email": lead["email"]}):
        raise HTTPException(400, "Lead with this email already exists")
    await db.leads.insert_one(lead)
    return lead


@api.post("/leads/bulk")
async def bulk_leads(body: LeadBulk, user=Depends(current_user)):
    added, skipped = 0, 0
    for item in body.leads:
        d = item.model_dump()
        d["email"] = d["email"].lower()
        if await db.leads.find_one({"workspace_id": user["workspace_id"], "email": d["email"]}):
            skipped += 1
            continue
        d.update({
            "id": new_id(),
            "workspace_id": user["workspace_id"],
            "status": "new",
            "icp_score": 55 + (len(d.get("company", "")) % 45),
            "verified": True,
            "created_at": now_iso(),
        })
        await db.leads.insert_one(d)
        added += 1
    return {"added": added, "skipped": skipped}


@api.delete("/leads/{lead_id}")
async def delete_lead(lead_id: str, user=Depends(current_user)):
    await db.leads.delete_one({"id": lead_id, "workspace_id": user["workspace_id"]})
    return {"ok": True}


@api.post("/suppressions")
async def suppress(body: Dict[str, str], user=Depends(current_user)):
    email = body.get("email", "").lower()
    if not email:
        raise HTTPException(400, "email required")
    await db.suppressions.update_one(
        {"workspace_id": user["workspace_id"], "email": email},
        {"$set": {"workspace_id": user["workspace_id"], "email": email, "created_at": now_iso()}},
        upsert=True,
    )
    return {"ok": True}


@api.get("/suppressions")
async def list_suppressions(user=Depends(current_user)):
    return await db.suppressions.find({"workspace_id": user["workspace_id"]}, {"_id": 0}).to_list(1000)


# ----------------------------- Mailboxes -------------------------------------
@api.get("/mailboxes")
async def list_mailboxes(user=Depends(current_user)):
    return await db.mailboxes.find({"workspace_id": user["workspace_id"]}, {"_id": 0}).to_list(500)


@api.post("/mailboxes")
async def create_mailbox(body: MailboxIn, user=Depends(current_user)):
    m = body.model_dump()
    m.update({
        "id": new_id(),
        "workspace_id": user["workspace_id"],
        "created_at": now_iso(),
        "status": "connected",
        "warmup_enabled": True,
        "warmup_day": 1,
        "warmup_target": 30,
        "dns": {"spf": True, "dkim": True, "dmarc": False, "tracking_domain": False},
        "sent_today": 0,
        "bounce_rate": 0.8,
        "spam_rate": 0.05,
    })
    await db.mailboxes.insert_one(m)
    return m


@api.post("/mailboxes/{mid}/dns-check")
async def dns_check(mid: str, user=Depends(current_user)):
    m = await db.mailboxes.find_one({"id": mid, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not m:
        raise HTTPException(404, "not found")
    dns = {"spf": True, "dkim": True, "dmarc": True, "tracking_domain": True}
    await db.mailboxes.update_one({"id": mid}, {"$set": {"dns": dns}})
    m["dns"] = dns
    return m


@api.post("/mailboxes/{mid}/warmup")
async def toggle_warmup(mid: str, user=Depends(current_user)):
    m = await db.mailboxes.find_one({"id": mid, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not m:
        raise HTTPException(404, "not found")
    enabled = not m.get("warmup_enabled", False)
    await db.mailboxes.update_one({"id": mid}, {"$set": {"warmup_enabled": enabled}})
    return {"warmup_enabled": enabled}


# ----------------------------- Campaigns -------------------------------------
@api.get("/campaigns")
async def list_campaigns(user=Depends(current_user)):
    items = await db.campaigns.find({"workspace_id": user["workspace_id"]}, {"_id": 0}).to_list(500)
    for c in items:
        c["stats"] = await _campaign_stats(c["id"], user["workspace_id"])
    return items


async def _campaign_stats(cid: str, wid: str) -> Dict[str, Any]:
    events = await db.events.find({"campaign_id": cid, "workspace_id": wid}, {"_id": 0}).to_list(5000)
    return {
        "sent": sum(1 for e in events if e["type"] == "sent"),
        "opened": sum(1 for e in events if e["type"] == "opened"),
        "clicked": sum(1 for e in events if e["type"] == "clicked"),
        "replied": sum(1 for e in events if e["type"] == "replied"),
        "meetings": sum(1 for e in events if e["type"] == "meeting_booked"),
    }


@api.post("/campaigns")
async def create_campaign(body: CampaignIn, user=Depends(current_user)):
    c = body.model_dump()
    c.update({
        "id": new_id(),
        "workspace_id": user["workspace_id"],
        "status": "draft",
        "created_at": now_iso(),
        "owner_id": user["id"],
    })
    await db.campaigns.insert_one(c)
    return c


@api.get("/campaigns/{cid}")
async def get_campaign(cid: str, user=Depends(current_user)):
    c = await db.campaigns.find_one({"id": cid, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not c:
        raise HTTPException(404, "not found")
    c["stats"] = await _campaign_stats(cid, user["workspace_id"])
    return c


@api.put("/campaigns/{cid}")
async def update_campaign(cid: str, body: CampaignIn, user=Depends(current_user)):
    await db.campaigns.update_one(
        {"id": cid, "workspace_id": user["workspace_id"]},
        {"$set": body.model_dump()},
    )
    return await get_campaign(cid, user)


@api.post("/campaigns/{cid}/launch")
async def launch_campaign(cid: str, user=Depends(current_user)):
    c = await db.campaigns.find_one({"id": cid, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not c:
        raise HTTPException(404, "not found")
    await db.campaigns.update_one({"id": cid}, {"$set": {"status": "active", "launched_at": now_iso()}})

    # Simulate sending events for each lead and step
    lead_ids = c.get("lead_ids") or []
    if not lead_ids:
        # fall back to all leads
        leads = await db.leads.find({"workspace_id": user["workspace_id"]}, {"_id": 0}).to_list(200)
        lead_ids = [x["id"] for x in leads]

    steps = c.get("steps", [])
    for i, lid in enumerate(lead_ids):
        lead = await db.leads.find_one({"id": lid, "workspace_id": user["workspace_id"]}, {"_id": 0})
        if not lead:
            continue
        for step_idx, step in enumerate(steps):
            # deterministic simulation
            seed = (i * 31 + step_idx * 7) % 100
            await db.events.insert_one({
                "id": new_id(), "workspace_id": user["workspace_id"], "campaign_id": cid,
                "lead_id": lid, "step": step_idx, "type": "sent", "at": now_iso(),
            })
            if seed < 55:
                await db.events.insert_one({
                    "id": new_id(), "workspace_id": user["workspace_id"], "campaign_id": cid,
                    "lead_id": lid, "step": step_idx, "type": "opened", "at": now_iso(),
                })
            if seed < 18:
                await db.events.insert_one({
                    "id": new_id(), "workspace_id": user["workspace_id"], "campaign_id": cid,
                    "lead_id": lid, "step": step_idx, "type": "clicked", "at": now_iso(),
                })
            if seed < 12 and step_idx == len(steps) - 1:
                # Reply → hard stop, create conversation
                reply_body = _sample_reply(seed, lead)
                classification = _classify_reply(reply_body)
                convo_id = new_id()
                await db.events.insert_one({
                    "id": new_id(), "workspace_id": user["workspace_id"], "campaign_id": cid,
                    "lead_id": lid, "step": step_idx, "type": "replied", "at": now_iso(),
                })
                await db.conversations.insert_one({
                    "id": convo_id, "workspace_id": user["workspace_id"], "campaign_id": cid,
                    "lead_id": lid, "classification": classification, "status": "open",
                    "snippet": reply_body[:120], "updated_at": now_iso(),
                    "messages": [
                        {"from": "them", "body": reply_body, "at": now_iso()},
                    ],
                })
                if classification == "interested":
                    # auto-create deal
                    await db.deals.insert_one({
                        "id": new_id(), "workspace_id": user["workspace_id"], "lead_id": lid,
                        "title": f"{lead.get('company') or lead['first_name']} — inbound reply",
                        "value": 5000, "stage": "qualified", "created_at": now_iso(),
                        "source_campaign_id": cid,
                    })
                    await db.events.insert_one({
                        "id": new_id(), "workspace_id": user["workspace_id"], "campaign_id": cid,
                        "lead_id": lid, "type": "meeting_booked", "at": now_iso(),
                    })
                break
    return {"ok": True, "status": "active"}


@api.post("/campaigns/{cid}/pause")
async def pause_campaign(cid: str, user=Depends(current_user)):
    await db.campaigns.update_one(
        {"id": cid, "workspace_id": user["workspace_id"]},
        {"$set": {"status": "paused"}},
    )
    return {"ok": True}


def _sample_reply(seed: int, lead: Dict[str, Any]) -> str:
    bank = [
        "Thanks for reaching out. Timing is actually pretty good — could you send some times next week for a 15 min call?",
        "Not the right person here, but you should talk to our head of ops.",
        "Out of office until Monday, will circle back then.",
        "Please remove me from your list.",
        "We already use a tool for this, but curious how you're different — send a one-pager?",
    ]
    return bank[seed % len(bank)]


def _classify_reply(body: str) -> str:
    b = body.lower()
    if any(x in b for x in ["remove", "unsubscribe", "stop"]):
        return "unsubscribe"
    if any(x in b for x in ["out of office", "ooo", "vacation"]):
        return "ooo"
    if any(x in b for x in ["not the right", "wrong person", "referral", "talk to"]):
        return "referral"
    if any(x in b for x in ["not interested", "no thanks", "already use"]):
        return "not_interested"
    if any(x in b for x in ["curious", "call", "meeting", "one-pager", "learn more", "interested", "times"]):
        return "interested"
    return "other"


# ----------------------------- Inbox -----------------------------------------
@api.get("/inbox")
async def inbox(user=Depends(current_user)):
    convos = await db.conversations.find({"workspace_id": user["workspace_id"]}, {"_id": 0}).sort("updated_at", -1).to_list(500)
    # attach lead info
    for c in convos:
        lead = await db.leads.find_one({"id": c["lead_id"]}, {"_id": 0})
        c["lead"] = lead
    return convos


@api.get("/inbox/{cid}")
async def inbox_detail(cid: str, user=Depends(current_user)):
    c = await db.conversations.find_one({"id": cid, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not c:
        raise HTTPException(404, "not found")
    c["lead"] = await db.leads.find_one({"id": c["lead_id"]}, {"_id": 0})
    return c


@api.post("/inbox/{cid}/reply")
async def reply(cid: str, body: ReplyIn, user=Depends(current_user)):
    await db.conversations.update_one(
        {"id": cid, "workspace_id": user["workspace_id"]},
        {"$push": {"messages": {"from": "me", "body": body.body, "at": now_iso()}},
         "$set": {"updated_at": now_iso(), "status": "responded"}},
    )
    return {"ok": True}


# ----------------------------- CRM -------------------------------------------
STAGES = ["new", "qualified", "meeting", "proposal", "won", "lost"]


@api.get("/deals")
async def list_deals(user=Depends(current_user)):
    deals = await db.deals.find({"workspace_id": user["workspace_id"]}, {"_id": 0}).to_list(1000)
    for d in deals:
        d["lead"] = await db.leads.find_one({"id": d["lead_id"]}, {"_id": 0})
    return deals


@api.post("/deals")
async def create_deal(body: DealIn, user=Depends(current_user)):
    d = body.model_dump()
    d.update({"id": new_id(), "workspace_id": user["workspace_id"], "created_at": now_iso()})
    if d["stage"] not in STAGES:
        d["stage"] = "new"
    await db.deals.insert_one(d)
    return d


@api.put("/deals/{did}")
async def update_deal(did: str, body: Dict[str, Any], user=Depends(current_user)):
    allowed = {k: v for k, v in body.items() if k in {"stage", "value", "title", "notes"}}
    if "stage" in allowed and allowed["stage"] not in STAGES:
        raise HTTPException(400, "invalid stage")
    await db.deals.update_one(
        {"id": did, "workspace_id": user["workspace_id"]},
        {"$set": allowed},
    )
    return {"ok": True}


# ----------------------------- AI --------------------------------------------
@api.post("/ai/score")
async def ai_score(body: AIScoreIn, user=Depends(current_user)):
    return compute_eq(body.subject, body.body)


@api.post("/ai/personalize")
async def ai_personalize(body: AIPersonalizeIn, user=Depends(current_user)):
    lead = body.lead
    if body.lead_id and not lead:
        lead = await db.leads.find_one({"id": body.lead_id, "workspace_id": user["workspace_id"]}, {"_id": 0})
    lead = lead or {}
    subject_tpl = "Quick idea for {{company}}"
    body_tpl = (
        body.template
        or "Hi {{first_name}},\n\nI noticed {{company}} has been scaling — teams your size often "
        "struggle with reply rates on cold outreach. We help by writing emails that feel human, "
        "with an EQ Score to catch anything spammy or robotic before you hit send.\n\n"
        "Worth a 15-minute look next week?\n\n— Sent from Pitch EQ"
    )
    subject = personalize(subject_tpl, lead)
    body_out = personalize(body_tpl, lead)
    eq = compute_eq(subject, body_out, lead)
    return {"subject": subject, "body": body_out, "eq": eq}


# ----------------------------- Dashboard -------------------------------------
@api.get("/dashboard")
async def dashboard(user=Depends(current_user)):
    wid = user["workspace_id"]
    events = await db.events.find({"workspace_id": wid}, {"_id": 0}).to_list(20000)
    campaigns_count = await db.campaigns.count_documents({"workspace_id": wid})
    leads_count = await db.leads.count_documents({"workspace_id": wid})
    active_campaigns = await db.campaigns.count_documents({"workspace_id": wid, "status": "active"})
    mailboxes = await db.mailboxes.count_documents({"workspace_id": wid})
    def c(t): return sum(1 for e in events if e["type"] == t)
    sent, opened, clicked, replied, mtg = c("sent"), c("opened"), c("clicked"), c("replied"), c("meeting_booked")

    # per-day trend (last 7 days)
    days = {}
    for e in events:
        d = e["at"][:10]
        days.setdefault(d, {"sent": 0, "opened": 0, "replied": 0})
        if e["type"] in days[d]:
            days[d][e["type"]] += 1
    trend = [{"date": k, **v} for k, v in sorted(days.items())][-7:]

    return {
        "kpis": {
            "sent": sent, "opened": opened, "clicked": clicked, "replied": replied,
            "meetings": mtg,
            "open_rate": round((opened / sent * 100) if sent else 0, 1),
            "reply_rate": round((replied / sent * 100) if sent else 0, 1),
            "meeting_rate": round((mtg / sent * 100) if sent else 0, 1),
        },
        "counts": {
            "campaigns": campaigns_count, "active_campaigns": active_campaigns,
            "leads": leads_count, "mailboxes": mailboxes,
        },
        "trend": trend,
    }


# ----------------------------- Demo Seed -------------------------------------
DEMO_LEADS = [
    ("Alex", "Rivera", "alex@northloop.io", "Northloop", "VP Sales"),
    ("Priya", "Shah", "priya@aeromark.co", "Aeromark", "Head of Growth"),
    ("Marcus", "Chen", "marcus@obsidianlabs.ai", "Obsidian Labs", "Founder"),
    ("Sofia", "Nunez", "sofia@quorumhq.com", "Quorum HQ", "Director of RevOps"),
    ("Daniel", "Okafor", "daniel@stackward.dev", "Stackward", "CTO"),
    ("Emma", "Whitfield", "emma@paperlantern.com", "Paperlantern", "Marketing Lead"),
    ("Ravi", "Menon", "ravi@vaultwave.io", "Vaultwave", "COO"),
    ("Jules", "Beaumont", "jules@finchgrid.co", "Finchgrid", "Head of Sales"),
]


@api.post("/demo/seed")
async def seed(user=Depends(current_user)):
    wid = user["workspace_id"]
    # only seed once
    if await db.leads.count_documents({"workspace_id": wid}) > 0:
        return {"ok": True, "already": True}
    lead_ids = []
    for fn, ln, em, co, ti in DEMO_LEADS:
        lid = new_id()
        lead_ids.append(lid)
        await db.leads.insert_one({
            "id": lid, "workspace_id": wid, "first_name": fn, "last_name": ln, "email": em,
            "company": co, "title": ti, "status": "new",
            "icp_score": 60 + (len(co) * 3) % 40, "verified": True, "created_at": now_iso(),
        })
    # a mailbox
    mid = new_id()
    await db.mailboxes.insert_one({
        "id": mid, "workspace_id": wid, "email": user["email"], "provider": "gmail",
        "display_name": user["name"], "daily_cap": 50, "status": "connected",
        "warmup_enabled": True, "warmup_day": 12, "warmup_target": 30,
        "dns": {"spf": True, "dkim": True, "dmarc": True, "tracking_domain": False},
        "sent_today": 24, "bounce_rate": 0.6, "spam_rate": 0.03, "created_at": now_iso(),
    })
    # a campaign
    cid = new_id()
    await db.campaigns.insert_one({
        "id": cid, "workspace_id": wid, "name": "Q1 SaaS Founders Outreach",
        "goal": "Book demos", "from_mailbox_id": mid, "lead_ids": lead_ids, "status": "draft",
        "send_window_start": "09:00", "send_window_end": "17:00", "timezone": "UTC",
        "owner_id": user["id"], "created_at": now_iso(),
        "steps": [
            {"day": 0, "subject": "Quick idea for {{company}}",
             "body": "Hi {{first_name}},\n\nNoticed {{company}} has been scaling fast. Teams your size often lose momentum in outbound because emails start feeling AI-written.\n\nPitch EQ scores every draft for tone, empathy, clarity and spam risk before it goes out.\n\nWorth 15 minutes next week?\n\n— From the Pitch EQ team",
             "ab_variant_subject": "", "ab_variant_body": ""},
            {"day": 3, "subject": "Re: Quick idea for {{company}}",
             "body": "Hi {{first_name}},\n\nCircling back — curious whether reply rates are a priority for the {{company}} team this quarter.\n\nHappy to send a one-pager instead of a call if easier.",
             "ab_variant_subject": "", "ab_variant_body": ""},
        ],
    })
    return {"ok": True, "campaign_id": cid, "seeded_leads": len(lead_ids)}


# ----------------------------- Mount -----------------------------------------
app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("pitcheq")


@app.on_event("shutdown")
async def shutdown_db():
    client.close()
