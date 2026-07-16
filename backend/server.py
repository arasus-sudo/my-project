"""Pitch EQ - AI Cold Email SaaS Backend.

Single-file FastAPI backend implementing multi-tenant workspaces, JWT auth,
campaigns, sequencer, leads, mailboxes, unified inbox, CRM pipeline, and a
heuristic EQ Score engine (real LLM to be plugged in later).
"""

from fastapi import FastAPI, APIRouter, Depends, HTTPException, status
from fastapi.responses import Response, RedirectResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import re
import json
import base64
import logging
import uuid
import bcrypt
import jwt
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
import anthropic
import openai
from google import genai
from google.genai import types as genai_types

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

JWT_SECRET = os.environ.get("JWT_SECRET", "pitcheq-dev-secret-change-me")
JWT_ALG = "HS256"
JWT_TTL_HOURS = 24 * 7

FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")
# Where the recipient's mail client reaches the open pixel / click redirect. Must
# be publicly reachable for tracking to work at all — on localhost it won't be.
PUBLIC_BASE_URL = os.environ.get("PUBLIC_BASE_URL", "")

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
    phone: Optional[str] = None
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
    # Open the workspace's credit account (Trial plan + starter credits).
    from billing import ensure_account
    await ensure_account(workspace_id)
    token = make_token(user_id, workspace_id)
    return {"token": token, "user": {"id": user_id, "email": body.email.lower(), "name": body.name},
            "workspace": {"id": workspace_id, "name": body.workspace_name}}


@api.post("/auth/login")
async def login(body: LoginIn):
    user = await db.users.find_one({"email": body.email.lower()}, {"_id": 0})
    if not user or not verify_pw(body.password, user["password_hash"]):
        raise HTTPException(401, "Invalid credentials")
    if user.get("blocked"):
        raise HTTPException(403, "Account has been suspended. Contact your admin.")
    ws = await db.workspaces.find_one({"id": user["workspace_id"]}, {"_id": 0})
    if ws and ws.get("blocked"):
        raise HTTPException(403, "Workspace has been suspended. Contact your admin.")
    token = make_token(user["id"], user["workspace_id"])
    ws = await db.workspaces.find_one({"id": user["workspace_id"]}, {"_id": 0})
    return {"token": token, "user": {"id": user["id"], "email": user["email"], "name": user["name"], "is_admin": _is_admin(user)},
            "workspace": {"id": ws["id"], "name": ws["name"]}}


class GoogleAuthIn(BaseModel):
    credential: str  # the ID-token JWT Google Identity Services hands the browser


@api.post("/auth/google")
async def google_auth(body: GoogleAuthIn):
    """Sign in / sign up with Google. The browser gets an ID token from Google
    Identity Services (client ID only — no secret involved in this flow) and
    posts it here; we verify the JWT's signature and audience against our
    GOOGLE_CLIENT_ID, then log in the matching account or create a fresh
    workspace for a first-time user. Password login keeps working side by side
    for accounts that have one."""
    google_client_id = os.environ.get("GOOGLE_CLIENT_ID", "")
    if not google_client_id:
        raise HTTPException(503, "Google sign-in is not configured")
    try:
        from google.oauth2 import id_token as google_id_token
        from google.auth.transport import requests as google_requests
        info = google_id_token.verify_oauth2_token(
            body.credential, google_requests.Request(), google_client_id
        )
    except Exception:
        raise HTTPException(401, "Invalid Google credential")

    email = (info.get("email") or "").lower()
    if not email or not info.get("email_verified", False):
        raise HTTPException(401, "Google account has no verified email")
    name = info.get("name") or email.split("@")[0]

    user = await db.users.find_one({"email": email}, {"_id": 0})
    created = False
    if user:
        if user.get("blocked"):
            raise HTTPException(403, "Account has been suspended. Contact your admin.")
        ws = await db.workspaces.find_one({"id": user["workspace_id"]}, {"_id": 0})
        if ws and ws.get("blocked"):
            raise HTTPException(403, "Workspace has been suspended. Contact your admin.")
        patch = {"google_sub": info.get("sub")}
        if not user.get("avatar_url") and info.get("picture"):
            patch["avatar_url"] = info["picture"]
        await db.users.update_one({"id": user["id"]}, {"$set": patch})
    else:
        created = True
        workspace_id = new_id()
        user_id = new_id()
        workspace_name = f"{name.split(' ')[0]}'s Workspace"
        await db.workspaces.insert_one({
            "id": workspace_id, "name": workspace_name, "owner_id": user_id,
            "created_at": now_iso(),
            "brand_voice": {"tone": "warm", "banned_phrases": [], "sample": ""},
            "plan": "trial",
        })
        await db.users.insert_one({
            "id": user_id, "email": email, "name": name,
            # No password chosen — store an unusable random hash so the
            # password-login path can never match until they set one.
            "password_hash": hash_pw(secrets.token_urlsafe(32)),
            "google_sub": info.get("sub"), "avatar_url": info.get("picture"),
            "workspace_id": workspace_id, "role": "org_admin", "created_at": now_iso(),
        })
        from billing import ensure_account
        await ensure_account(workspace_id)
        user = await db.users.find_one({"email": email}, {"_id": 0})

    ws = await db.workspaces.find_one({"id": user["workspace_id"]}, {"_id": 0})
    token = make_token(user["id"], user["workspace_id"])
    return {"token": token, "created": created,
            "user": {"id": user["id"], "email": user["email"], "name": user["name"], "is_admin": _is_admin(user)},
            "workspace": {"id": ws["id"], "name": ws["name"]}}


@api.get("/auth/me")
async def me(user=Depends(current_user)):
    ws = await db.workspaces.find_one({"id": user["workspace_id"]}, {"_id": 0})
    return {"user": {"id": user["id"], "email": user["email"], "name": user["name"], "role": user["role"],
                     "is_admin": _is_admin(user),
                     "avatar_url": user.get("avatar_url") or None,
                     "headline": user.get("headline") or None},
            "workspace": ws}


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str


@api.post("/auth/change-password")
async def change_password(body: ChangePasswordIn, user=Depends(current_user)):
    if len(body.new_password) < 8:
        raise HTTPException(400, "New password must be at least 8 characters")
    fresh = await db.users.find_one({"id": user["id"]})
    if not fresh or not verify_pw(body.current_password, fresh.get("password_hash", "")):
        raise HTTPException(401, "Current password is incorrect")
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"password_hash": hash_pw(body.new_password), "password_changed_at": now_iso()}},
    )
    await _audit(user, "auth.password_changed", {})
    return {"ok": True}


class ProfileUpdateIn(BaseModel):
    name: Optional[str] = None
    headline: Optional[str] = None
    avatar_url: Optional[str] = None  # data URL or hosted URL


@api.put("/auth/profile")
async def update_profile(body: ProfileUpdateIn, user=Depends(current_user)):
    updates: Dict[str, Any] = {}
    if body.name is not None:
        updates["name"] = body.name.strip()[:80]
    if body.headline is not None:
        updates["headline"] = body.headline.strip()[:120]
    if body.avatar_url is not None:
        # Basic size guard: reject data URLs bigger than ~4MB to avoid bloating Mongo.
        if len(body.avatar_url) > 6_000_000:
            raise HTTPException(413, "Avatar too large (max ~4 MB)")
        updates["avatar_url"] = body.avatar_url
    if updates:
        await db.users.update_one({"id": user["id"]}, {"$set": updates})
    await _audit(user, "auth.profile_updated", {"fields": list(updates.keys())})
    fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
    return {"user": fresh}


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
    lead["phone_verified"] = False
    lead["dnc"] = False
    lead["created_at"] = now_iso()
    # dedup by email in workspace
    if await db.leads.find_one({"workspace_id": user["workspace_id"], "email": lead["email"]}):
        raise HTTPException(400, "Lead with this email already exists")
    await db.leads.insert_one(lead)
    lead.pop("_id", None)
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
            "phone_verified": False,
            "dnc": False,
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
    """Register a mailbox. It starts DISCONNECTED — it can't send until OAuth
    completes.

    The old version stamped `status: "connected"` immediately with no handshake at
    all, and invented a bounce rate and a spam rate to display. A mailbox that
    claims to be connected but cannot send is the single most misleading thing
    this product could show.
    """
    import mailbox_client

    m = body.model_dump()
    m.update({
        "id": new_id(),
        "workspace_id": user["workspace_id"],
        "created_at": now_iso(),
        "status": "disconnected",
        "warmup_enabled": True,
        "warmup_day": 1,
        "warmup_target": 30,
        # Unknown until we actually resolve it — not True by default.
        "dns": {"spf": False, "dkim": False, "dmarc": False, "checked": False},
        "sent_today": 0,
        "sent_date": None,
        "access_token_enc": None,
        "refresh_token_enc": None,
    })
    await db.mailboxes.insert_one(m)
    m.pop("_id", None)
    return {**m, "providers": mailbox_client.provider_status()}


@api.get("/mailboxes/{mid}/oauth-url")
async def mailbox_oauth_url(mid: str, user=Depends(current_user)):
    import mailbox_client
    m = await db.mailboxes.find_one({"id": mid, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not m:
        raise HTTPException(404, "not found")

    import secrets as _secrets
    state = _secrets.token_urlsafe(24)
    await db.oauth_states.insert_one({
        "state": state, "kind": "mailbox", "mailbox_id": mid,
        "workspace_id": user["workspace_id"], "user_id": user["id"], "at": now_iso(),
    })

    url = (mailbox_client.gmail_auth_url(state) if m.get("provider") == "gmail"
           else mailbox_client.ms_auth_url(state))
    if not url:
        # Test mode: no OAuth app configured. Connect it so the flow is demoable,
        # but record honestly that nothing will actually leave the box.
        await db.mailboxes.update_one({"id": mid}, {"$set": {"status": "connected", "mocked": True}})
        return {"url": None, "mocked": True, "connected": True}
    return {"url": url, "mocked": False}


@api.post("/mailboxes/{mid}/dns-check")
async def dns_check(mid: str, user=Depends(current_user)):
    """Actually resolve SPF/DKIM/DMARC. The old route set all three to True
    unconditionally, telling users their deliverability was fine when it wasn't."""
    import mailbox_client

    m = await db.mailboxes.find_one({"id": mid, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not m:
        raise HTTPException(404, "not found")
    domain = (m.get("email") or "").split("@")[-1]
    dns = await mailbox_client.check_dns(domain)
    await db.mailboxes.update_one({"id": mid}, {"$set": {"dns": dns}})
    return {**m, "dns": dns}


@api.post("/mailboxes/{mid}/warmup")
async def toggle_warmup(mid: str, user=Depends(current_user)):
    m = await db.mailboxes.find_one({"id": mid, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not m:
        raise HTTPException(404, "not found")
    enabled = not m.get("warmup_enabled", False)
    await db.mailboxes.update_one({"id": mid}, {"$set": {"warmup_enabled": enabled}})
    return {"warmup_enabled": enabled}


@api.delete("/mailboxes/{mid}")
async def delete_mailbox(mid: str, user=Depends(current_user)):
    m = await db.mailboxes.find_one({"id": mid, "workspace_id": user["workspace_id"]})
    if not m:
        raise HTTPException(404, "not found")
    await db.mailboxes.delete_one({"id": mid, "workspace_id": user["workspace_id"]})
    return {"ok": True}


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
    c.pop("_id", None)
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
    """Enqueue a campaign for real sending.

    This used to fabricate its own metrics: it invented sent/opened/clicked/replied
    events from `seed = (i*31 + step_idx*7) % 100` and never sent an email. It now
    schedules real sends, and refuses to launch at all if there's no mailbox to
    send from — a launch that silently sends nothing is worse than an error.
    """
    from sender import enqueue_campaign

    c = await db.campaigns.find_one({"id": cid, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not c:
        raise HTTPException(404, "not found")

    try:
        result = await enqueue_campaign(user["workspace_id"], c)
    except ValueError as ex:
        raise HTTPException(400, str(ex))

    await db.campaigns.update_one({"id": cid}, {"$set": {"status": "active", "launched_at": now_iso()}})
    await _audit(user, "campaign.launch", {"campaign_id": cid, **result})
    return {"ok": True, "status": "active", **result}


@api.get("/campaigns/{cid}/queue")
async def campaign_queue(cid: str, user=Depends(current_user)):
    """What is actually scheduled to go out, and what already has."""
    rows = await db.send_queue.find(
        {"campaign_id": cid, "workspace_id": user["workspace_id"]}, {"_id": 0}
    ).sort("send_at", 1).to_list(500)
    counts: Dict[str, int] = {}
    for r in rows:
        counts[r["status"]] = counts.get(r["status"], 0) + 1
    return {"counts": counts, "rows": rows[:100]}


# ---- Open / click tracking (PUBLIC — called by the recipient's mail client) ----
_PIXEL = base64.b64decode(
    b"R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
)


@api.get("/t/o/{queue_id}")
async def track_open(queue_id: str):
    """1x1 beacon. An 'opened' event now means the recipient's client actually
    loaded this image — it is no longer a coin flip on a hash of the row index."""
    row = await db.send_queue.find_one({"id": queue_id}, {"_id": 0})
    if row:
        already = await db.events.count_documents({
            "workspace_id": row["workspace_id"], "lead_id": row["lead_id"],
            "campaign_id": row["campaign_id"], "step": row["step"], "type": "opened",
        })
        if not already:   # count a unique open, not every image reload
            await db.events.insert_one({
                "id": new_id(), "workspace_id": row["workspace_id"],
                "campaign_id": row["campaign_id"], "lead_id": row["lead_id"],
                "step": row["step"], "type": "opened", "at": now_iso(),
            })
    return Response(content=_PIXEL, media_type="image/gif",
                    headers={"Cache-Control": "no-store, no-cache, must-revalidate"})


@api.get("/t/c/{queue_id}")
async def track_click(queue_id: str, u: str = ""):
    row = await db.send_queue.find_one({"id": queue_id}, {"_id": 0})
    if row and u:
        await db.events.insert_one({
            "id": new_id(), "workspace_id": row["workspace_id"],
            "campaign_id": row["campaign_id"], "lead_id": row["lead_id"],
            "step": row["step"], "type": "clicked", "at": now_iso(), "url": u[:400],
        })
    # Only ever bounce to an absolute http(s) URL — an open redirect that accepts
    # anything is a phishing vector.
    target = u if u.startswith("http://") or u.startswith("https://") else FRONTEND_URL
    return RedirectResponse(target, status_code=302)


@api.post("/campaigns/{cid}/pause")
async def pause_campaign(cid: str, user=Depends(current_user)):
    await db.campaigns.update_one(
        {"id": cid, "workspace_id": user["workspace_id"]},
        {"$set": {"status": "paused"}},
    )
    return {"ok": True}


def _classify_reply(body: str) -> str:
    """Classify a REAL inbound reply (polled from the mailbox thread by
    sender.run_reply_tick). The five-string bank of invented replies that used to
    feed this is gone — the inbox now only ever shows mail a human actually sent."""
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
    convo = await db.conversations.find_one({"id": cid, "workspace_id": user["workspace_id"]}, {"_id": 0})
    await db.conversations.update_one(
        {"id": cid, "workspace_id": user["workspace_id"]},
        {"$push": {"messages": {"from": "me", "body": body.body, "at": now_iso()}},
         "$set": {"updated_at": now_iso(), "status": "responded"}},
    )
    if convo:
        await _log_activity(user["workspace_id"], convo["lead_id"], "pitch", "email_replied",
                             f"You replied: “{body.body[:80]}”", {"conversation_id": cid})
    return {"ok": True}


# ----------------------------- CRM -------------------------------------------
STAGES = ["new", "qualified", "meeting", "proposal", "won", "lost"]


@api.get("/deals")
async def list_deals(user=Depends(current_user)):
    deals = await db.deals.find({"workspace_id": user["workspace_id"]}, {"_id": 0}).to_list(1000)
    for d in deals:
        d["lead"] = await db.leads.find_one({"id": d["lead_id"]}, {"_id": 0})
    return deals


@api.get("/deals/{did}")
async def get_deal(did: str, user=Depends(current_user)):
    d = await db.deals.find_one({"id": did, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not d:
        raise HTTPException(404, "not found")
    d["lead"] = await db.leads.find_one({"id": d["lead_id"]}, {"_id": 0})
    return d


@api.post("/deals")
async def create_deal(body: DealIn, user=Depends(current_user)):
    d = body.model_dump()
    d.update({"id": new_id(), "workspace_id": user["workspace_id"], "created_at": now_iso()})
    if d["stage"] not in STAGES:
        d["stage"] = "new"
    await db.deals.insert_one(d)
    d.pop("_id", None)
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
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = "claude-sonnet-5"
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")


def _extract_json(text: str) -> Optional[Dict[str, Any]]:
    """Pull the first JSON object out of an LLM response (handles ```json fences)."""
    if not text:
        return None
    m = re.search(r"\{[\s\S]*\}", text)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except Exception:
        return None


async def _llm_chat(system: str, user_text: str, session_id: str, user: Optional[Dict[str, Any]] = None) -> str:
    if not ANTHROPIC_API_KEY:
        raise RuntimeError("ANTHROPIC_API_KEY not configured")
    if user and not await _rate_ok(user):
        raise RuntimeError("daily LLM quota exceeded")
    resp = await anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY).messages.create(
        model=ANTHROPIC_MODEL,
        max_tokens=2048,
        system=system,
        messages=[{"role": "user", "content": user_text}],
    )
    return "".join(block.text for block in resp.content if block.type == "text")


@api.post("/ai/score")
async def ai_score(body: AIScoreIn, user=Depends(current_user)):
    heuristic = compute_eq(body.subject, body.body)
    if not ANTHROPIC_API_KEY:
        return heuristic  # heuristic-only scoring is free — no model call, no charge
    from billing import charge_credits
    await charge_credits(user["workspace_id"], "email_ai", meta={"kind": "eq_score"})
    system = (
        "You are the EQ Score engine for a cold-email tool. "
        "Given a cold email (subject + body), rate it on 5 axes 0-100: "
        "relevance, empathy, clarity, cta (call-to-action strength), spam_safety. "
        "Compute overall = round(relevance*.30 + empathy*.20 + clarity*.20 + cta*.15 + spam_safety*.15). "
        "Return STRICT JSON only, no prose: "
        '{"overall":int,"relevance":int,"empathy":int,"clarity":int,"cta":int,"spam_safety":int,"hints":[str,...]} '
        "Hints must be at most 3 short, concrete, plain-English rewrite suggestions."
    )
    user_text = f"Subject: {body.subject}\n\nBody:\n{body.body}"
    try:
        resp = await _llm_chat(system, user_text, f"score-{user['id']}", user=user)
        parsed = _extract_json(resp)
        if parsed and "overall" in parsed:
            return parsed
    except Exception as ex:
        logging.warning("ai_score LLM fallback: %s", ex)
    return heuristic


@api.post("/ai/personalize")
async def ai_personalize(body: AIPersonalizeIn, user=Depends(current_user)):
    lead = body.lead
    if body.lead_id and not lead:
        lead = await db.leads.find_one({"id": body.lead_id, "workspace_id": user["workspace_id"]}, {"_id": 0})
    lead = lead or {}

    if ANTHROPIC_API_KEY:
        from billing import charge_credits
        await charge_credits(user["workspace_id"], "email_ai", meta={"kind": "personalize"})
        system = (
            "You are Pitch EQ — an outbound copywriter for B2B cold email. "
            "Write ONE email tailored to the lead. Be warm, specific, and human. "
            "Under 120 words. One clear low-friction ask. No spammy words, no ALL-CAPS, no exclamation marks. "
            "Return STRICT JSON only: {\"subject\": str, \"body\": str}."
        )
        instructions = (body.template or "").strip() or "Book a 15-minute intro call."
        user_text = (
            f"Lead: {json.dumps({k: lead.get(k) for k in ('first_name','last_name','title','company','linkedin')}, ensure_ascii=False)}\n"
            f"Tone: {body.tone}\n"
            f"Sender product: Pitch EQ (AI outbound agent with an EQ Score that rates emails for tone, empathy, clarity and spam risk before sending).\n"
            f"Goal / template hint from user:\n{instructions}"
        )
        try:
            resp = await _llm_chat(system, user_text, f"personalize-{user['id']}", user=user)
            parsed = _extract_json(resp)
            if parsed and parsed.get("subject") and parsed.get("body"):
                eq = compute_eq(parsed["subject"], parsed["body"], lead)
                return {"subject": parsed["subject"], "body": parsed["body"], "eq": eq}
        except Exception as ex:
            logging.warning("ai_personalize LLM fallback: %s", ex)

    # Heuristic fallback
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


# ----------------------------- Onboarding ------------------------------------
import urllib.request


class OnbAnalyzeIn(BaseModel):
    url: str


class OnbGenerateIn(BaseModel):
    business_summary: str
    services: List[str] = []
    answers: Dict[str, str] = {}


class OnbAcceptIn(BaseModel):
    campaigns: List[Dict[str, Any]]


def _crawl_text(url: str) -> str:
    """Homepage-only crawl (kept for backwards compat)."""
    return _fetch_url(url)


def _fetch_url(url: str) -> str:
    if not url.startswith("http"):
        url = "https://" + url
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 PitchEQ"})
        with urllib.request.urlopen(req, timeout=6) as r:
            raw = r.read(200_000).decode("utf-8", errors="ignore")
    except Exception:
        return ""
    raw = re.sub(r"<(script|style)[\s\S]*?</\1>", " ", raw, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", raw)
    return re.sub(r"\s+", " ", text)[:8000].strip()


def _crawl_site(root: str, max_pages: int = 4) -> Dict[str, str]:
    """Fetch homepage plus up to N candidate sub-pages relevant to services/pricing/about."""
    if not root.startswith("http"):
        root = "https://" + root
    from urllib.parse import urljoin, urlparse
    parsed = urlparse(root)
    base = f"{parsed.scheme}://{parsed.netloc}"

    home_html = ""
    try:
        req = urllib.request.Request(root, headers={"User-Agent": "Mozilla/5.0 PitchEQ"})
        with urllib.request.urlopen(req, timeout=6) as r:
            home_html = r.read(200_000).decode("utf-8", errors="ignore")
    except Exception:
        return {}

    pages = {root: _html_to_text(home_html)}
    hrefs = re.findall(r'href=["\']([^"\']+)["\']', home_html, flags=re.I)
    keywords = ("service", "product", "solution", "pricing", "feature", "platform", "about", "what-we-do")
    seen = {root}
    for h in hrefs:
        if len(pages) >= max_pages:
            break
        low = h.lower()
        if not any(k in low for k in keywords):
            continue
        full = urljoin(base + "/", h.split("#")[0])
        if urlparse(full).netloc != parsed.netloc or full in seen:
            continue
        seen.add(full)
        txt = _fetch_url(full)
        if txt:
            pages[full] = txt
    return pages


def _html_to_text(raw: str) -> str:
    # The `|$` matters: we read at most 200KB of a page, which routinely cuts a
    # <style> or <script> block in half. Without it the opening tag is stripped as
    # a tag but its contents survive, and a wall of minified CSS gets handed to the
    # LLM as if it were the company's description.
    raw = re.sub(r"<(script|style)\b[^>]*>[\s\S]*?(?:</\1\s*>|$)", " ", raw, flags=re.I)
    raw = re.sub(r"<!--[\s\S]*?(?:-->|$)", " ", raw)
    text = re.sub(r"<[^>]+>", " ", raw)
    text = re.sub(r"&[a-z]+;|&#\d+;", " ", text, flags=re.I)
    return re.sub(r"\s+", " ", text)[:8000].strip()


DEFAULT_QUESTIONS = [
    "Who is your ideal customer (industry, role, company size)?",
    "What problem do you solve for them?",
    "What outbound goal matters most — demos, signups, replies?",
    "Which product or service should we lead with?",
]


@api.post("/onboarding/analyze")
async def onb_analyze(body: OnbAnalyzeIn, user=Depends(current_user)):
    pages = _crawl_site(body.url, max_pages=4)
    combined = "\n\n".join(f"URL: {u}\n{t[:3500]}" for u, t in pages.items())[:14000]
    if not combined:
        return {"summary": "", "services": [], "questions": DEFAULT_QUESTIONS, "raw": "", "crawled": []}
    if ANTHROPIC_API_KEY:
        system = (
            "You are a B2B outbound strategist analysing a company website. "
            "Read the crawled pages and return STRICT JSON only: "
            '{"summary": "2-3 sentences: what the company does + ideal customer + value prop + tone", '
            '"services": ["up to 3 distinct products/services or use-cases they sell — short names"], '
            '"questions": ["3 short clarifying questions to sharpen outbound"]}'
        )
        try:
            resp = await _llm_chat(system, combined, f"onb-a-{user['id']}", user=user)
            parsed = _extract_json(resp)
            if parsed and parsed.get("summary"):
                parsed.setdefault("services", [])
                parsed.setdefault("questions", DEFAULT_QUESTIONS)
                return {**parsed, "raw": combined[:1500], "crawled": list(pages.keys())}
        except Exception as ex:
            logging.warning("onb_analyze fallback: %s", ex)
    return {
        "summary": combined[:400], "services": [], "questions": DEFAULT_QUESTIONS,
        "raw": combined[:1500], "crawled": list(pages.keys()),
    }


@api.post("/onboarding/generate")
async def onb_generate(body: OnbGenerateIn, user=Depends(current_user)):
    services = [s for s in (body.services or []) if s][:3] or ["Core offering"]
    if ANTHROPIC_API_KEY:
        system = (
            f"You are Pitch EQ's campaign designer. Return EXACTLY {len(services)} campaigns "
            f"— one per service in the input list, in the same order. Each campaign has 3 steps (day 0, 3, 7). "
            "Warm, specific, under 120 words per body. Use merge fields {{first_name}}, {{company}}, {{title}}. "
            "STRICT JSON only: {\"campaigns\":[{\"service\":str,\"name\":str,\"goal\":str,\"steps\":[{\"day\":int,\"subject\":str,\"body\":str}]}]} "
            "The 'service' field of each campaign must exactly match the input service name."
        )
        user_text = (
            f"Business summary: {body.business_summary}\n"
            f"Services (one campaign per service, keep order): {json.dumps(services)}\n"
            f"User answers: {json.dumps(body.answers)}"
        )
        try:
            resp = await _llm_chat(system, user_text, f"onb-g-{user['id']}", user=user)
            parsed = _extract_json(resp)
            if parsed and parsed.get("campaigns"):
                # backfill service field if LLM dropped it
                for i, c in enumerate(parsed["campaigns"]):
                    if not c.get("service") and i < len(services):
                        c["service"] = services[i]
                return parsed
        except Exception as ex:
            logging.warning("onb_generate fallback: %s", ex)
    biz = body.business_summary or "improve outbound reply rates"
    focus = (list(body.answers.values())[0] if body.answers else "outbound reply rates")
    return {"campaigns": [
        {"service": svc, "name": f"{svc} outreach", "goal": "Book meetings", "steps": [
            {"day": 0, "subject": f"Quick idea for {{{{company}}}} on {svc}",
             "body": f"Hi {{{{first_name}}}},\n\nSaw {{{{company}}}} and wanted to reach out about {svc}. We help teams like yours with {biz}. Worth 15 minutes next week?"},
            {"day": 3, "subject": "Re: quick idea",
             "body": f"Hi {{{{first_name}}}}, circling back on {svc}. Happy to send a one-pager if easier than a call."},
            {"day": 7, "subject": "Last note, {{first_name}}",
             "body": f"Closing the loop on {svc}. Feel free to reopen if {focus} becomes a priority."},
        ]} for svc in services
    ]}


@api.post("/onboarding/accept")
async def onb_accept(body: OnbAcceptIn, user=Depends(current_user)):
    saved = []
    for c in body.campaigns:
        cid = new_id()
        await db.campaigns.insert_one({
            "id": cid, "workspace_id": user["workspace_id"], "name": c.get("name", "Untitled"),
            "goal": c.get("goal", "Book meetings"), "steps": c.get("steps", []),
            "lead_ids": [], "status": "draft", "owner_id": user["id"], "created_at": now_iso(),
            "send_window_start": "09:00", "send_window_end": "17:00", "timezone": "UTC",
        })
        saved.append(cid)
    await db.workspaces.update_one({"id": user["workspace_id"]}, {"$set": {"onboarded": True}})
    return {"ok": True, "campaign_ids": saved}


# ----------------------------- Prospeo + Icypeas + ICP ----------------------
import httpx
import lead_sources


class IcpIn(BaseModel):
    name: str
    titles: List[str] = []
    industries: List[str] = []
    company_sizes: List[str] = []   # e.g. ["11-50", "51-200"]
    locations: List[str] = []
    keywords: List[str] = []
    seniority: List[str] = []       # e.g. ["Director", "VP", "Head"]


class ProspectSearchIn(BaseModel):
    icp_id: Optional[str] = None
    # Manual overrides / free-form filters
    titles: List[str] = []
    industries: List[str] = []
    locations: List[str] = []
    company_sizes: List[str] = []
    keywords: List[str] = []
    domain: Optional[str] = None
    limit: int = 20


class ProspectImportIn(BaseModel):
    prospects: List[Dict[str, Any]]
    generate_icebreaker: bool = True


# ---- ICP CRUD -----
@api.get("/icps")
async def list_icps(user=Depends(current_user)):
    return await db.icps.find(
        {"workspace_id": user["workspace_id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)


@api.post("/icps")
async def create_icp(body: IcpIn, user=Depends(current_user)):
    doc = body.model_dump()
    doc.update({
        "id": new_id(), "workspace_id": user["workspace_id"],
        "owner_id": user["id"], "created_at": now_iso(),
    })
    await db.icps.insert_one(doc)
    doc.pop("_id", None)
    await _audit(user, "icp.create", {"icp_id": doc["id"], "name": doc["name"]})
    return doc


@api.delete("/icps/{icp_id}")
async def delete_icp(icp_id: str, user=Depends(current_user)):
    await db.icps.delete_one({"id": icp_id, "workspace_id": user["workspace_id"]})
    await _audit(user, "icp.delete", {"icp_id": icp_id})
    return {"ok": True}


# ---- Prospeo + Icypeas wrappers -----
# The real domain_search/email_finder/verify_email/provider_status live in
# lead_sources.py — retry+backoff, the current (non-deprecated) Prospeo
# search-person/bulk-enrich-person flow, correct Icypeas auth, and a mocked
# flag that only trips when there's truly no key (never silently faking
# people on a real provider failure). This route used to have its own inline
# copy of that same logic against Prospeo's now-deprecated endpoints and
# Icypeas' wrong auth header — it silently fell back to fictional prospects
# on any error, which is exactly the failure mode lead_sources.py exists to
# prevent. Wired to the shared client instead of fixing it twice.


# ---- Prospect Search + Import -----
def _resolve_domain_from_keywords(keywords: List[str], override: Optional[str]) -> str:
    if override:
        return override.replace("http://", "").replace("https://", "").rstrip("/")
    for k in keywords or []:
        if "." in k:
            return k.strip().lower()
    return "example.com"


@api.post("/prospect/search")
async def prospect_search(body: ProspectSearchIn, user=Depends(current_user)):
    from billing import check_credits, charge_credits
    await check_credits(user["workspace_id"], "lead_enrichment")
    # Merge ICP + free-form filters
    filters = body.model_dump()
    if body.icp_id:
        icp = await db.icps.find_one({"id": body.icp_id, "workspace_id": user["workspace_id"]}, {"_id": 0})
        if icp:
            for k in ("titles", "industries", "locations", "company_sizes", "keywords"):
                filters[k] = list({*(filters.get(k) or []), *(icp.get(k) or [])})

    domain = _resolve_domain_from_keywords(filters["keywords"], body.domain)
    try:
        prospects = await lead_sources.domain_search(domain, limit=body.limit)
    except lead_sources.ProviderError as ex:
        raise HTTPException(502, f"Prospeo search failed: {ex}")

    # normalize_prospect() returns linkedin_url; the rest of this route (and
    # prospect_import below) has always used the shorter "linkedin" key.
    for p in prospects:
        p["linkedin"] = p.pop("linkedin_url", "")

    # Apply title/seniority filter locally when Prospeo returns broader lists
    wanted_titles = [t.lower() for t in filters.get("titles", [])]
    if wanted_titles:
        prospects = [p for p in prospects if not p.get("title") or any(t in p.get("title", "").lower() for t in wanted_titles)]

    # Verify in-flight. A single provider hiccup here shouldn't discard an
    # otherwise-real, already-found list of prospects — mark that one contact
    # "risky" (unverified) rather than failing the whole search.
    for p in prospects:
        try:
            v = await lead_sources.verify_email(p.get("email", ""))
        except lead_sources.ProviderError as ex:
            v = {"status": "risky", "score": 0.5, "provider": "icypeas", "error": str(ex)}
        p["verification"] = v
        p["verified"] = v.get("status") == "valid"

    # Enrichment is billed per contact actually returned — the third-party lookup
    # cost is already incurred by this point, so it settles even if it overdraws.
    if prospects:
        await charge_credits(user["workspace_id"], "lead_enrichment", units=len(prospects),
                              meta={"domain": domain, "contacts": len(prospects)},
                              allow_overdraft=True)

    return {
        "filters": filters,
        "domain": domain,
        "prospects": prospects,
        "providers": lead_sources.provider_status(),
    }


@api.post("/prospect/import")
async def prospect_import(body: ProspectImportIn, user=Depends(current_user)):
    wid = user["workspace_id"]
    added = 0
    skipped = 0
    for p in body.prospects:
        email = (p.get("email") or "").lower()
        if not email or not _verify_email_syntax(email):
            skipped += 1
            continue
        if await db.leads.find_one({"workspace_id": wid, "email": email}):
            skipped += 1
            continue
        icebreaker = ""
        if body.generate_icebreaker and ANTHROPIC_API_KEY:
            try:
                system = (
                    "You are Pitch EQ's icebreaker writer. Write ONE 2-sentence cold-email opener for the given prospect. "
                    "Warm, specific, human, under 45 words. No hashtags, no exclamation marks. STRICT JSON only: "
                    '{"icebreaker": str, "reasoning": str (one line — why this opener will resonate)}'
                )
                resp = await _llm_chat(
                    system,
                    json.dumps({k: p.get(k) for k in ("first_name","last_name","title","company","domain","linkedin")}),
                    f"icebr-{user['id']}", user=user,
                )
                parsed = _extract_json(resp)
                if parsed:
                    icebreaker = parsed.get("icebreaker", "")
                    p["persona_hypothesis"] = parsed.get("reasoning", "")
            except Exception as ex:
                logging.warning("icebreaker gen fallback: %s", ex)
        if not icebreaker:
            icebreaker = f"Hi {p.get('first_name','')}, noticed {p.get('company','')} — curious how you're thinking about {p.get('title','your role')} priorities this quarter."

        await db.leads.insert_one({
            "id": new_id(), "workspace_id": wid,
            "first_name": p.get("first_name", ""),
            "last_name": p.get("last_name", ""),
            "email": email,
            "company": p.get("company", ""),
            "title": p.get("title", ""),
            "linkedin": p.get("linkedin", ""),
            "tags": ["prospeo"],
            "status": "new",
            "verified": (p.get("verification") or {}).get("status") == "valid",
            "verification": p.get("verification"),
            "icp_score": 70,
            "icebreaker": icebreaker,
            "persona_hypothesis": p.get("persona_hypothesis", ""),
            "source": "prospeo",
            "created_at": now_iso(),
        })
        added += 1
    await _audit(user, "prospect.import", {"added": added, "skipped": skipped})
    return {"added": added, "skipped": skipped}


@api.get("/prospect/providers")
async def prospect_providers(user=Depends(current_user)):
    return lead_sources.provider_status()


# ----------------------------- Create EQ: Google Fonts ------------------------
@api.get("/fonts")
async def search_fonts(q: str = "", category: str = "", limit: int = 60,
                       user=Depends(current_user)):
    """Real Google Fonts, searched server-side — see fonts_catalog.py for why
    this needs no API key."""
    import fonts_catalog
    return await fonts_catalog.search(q=q, category=category, limit=limit)


@api.get("/fonts/categories")
async def font_categories(user=Depends(current_user)):
    import fonts_catalog
    return fonts_catalog.categories()


# ----------------------------- Brand Kits ------------------------------------
class BrandKitIn(BaseModel):
    name: str
    logo_url: str = ""
    colors: List[str] = []           # hex list — up to ~8 brand colors
    fonts: List[str] = []             # font family names
    palette_id: Optional[str] = None  # if set, becomes the default palette when applied


@api.get("/brandkits")
async def list_brandkits(user=Depends(current_user)):
    return await db.brandkits.find(
        {"workspace_id": user["workspace_id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)


@api.post("/brandkits")
async def create_brandkit(body: BrandKitIn, user=Depends(current_user)):
    d = body.model_dump()
    d.update({
        "id": new_id(), "workspace_id": user["workspace_id"],
        "owner_id": user["id"], "created_at": now_iso(),
    })
    await db.brandkits.insert_one(d)
    d.pop("_id", None)
    await _audit(user, "brandkit.create", {"id": d["id"], "name": d["name"]})
    return d


@api.put("/brandkits/{bid}")
async def update_brandkit(bid: str, body: BrandKitIn, user=Depends(current_user)):
    await db.brandkits.update_one(
        {"id": bid, "workspace_id": user["workspace_id"]},
        {"$set": body.model_dump()},
    )
    return await db.brandkits.find_one({"id": bid}, {"_id": 0})


@api.delete("/brandkits/{bid}")
async def delete_brandkit(bid: str, user=Depends(current_user)):
    await db.brandkits.delete_one({"id": bid, "workspace_id": user["workspace_id"]})
    return {"ok": True}


# ----------------------------- Create EQ (Carousel Agent) --------------------
PLATFORM_DIMS = {
    "linkedin": {"w": 1080, "h": 1350, "label": "LinkedIn Deck"},
    "square": {"w": 1080, "h": 1080, "label": "Square Social"},
    "twitter": {"w": 1080, "h": 1350, "label": "Twitter Cheat Sheet"},
}


class BrandKit(BaseModel):
    bg: str = "#0F1010"
    accent: str = "#E85D3A"
    text: str = "#FFFFFF"
    font: str = "Inter"
    logo_text: str = ""


class CarouselGenIn(BaseModel):
    topic: str
    platform: str = "linkedin"
    slide_count: int = 6
    brand: Optional[BrandKit] = None
    tone: str = "confident, punchy"


class CarouselEditIn(BaseModel):
    project_id: str
    slide_index: int
    instruction: str


class BrandFromUrlIn(BaseModel):
    url: str


def _default_slides(topic: str, n: int) -> List[Dict[str, Any]]:
    slides = [{"kind": "hook", "title": topic, "subtitle": "A short, sharp take", "body": ""}]
    for i in range(n - 2):
        slides.append({"kind": "body", "title": f"Point {i + 1}", "subtitle": "", "body": "Add insight here."})
    slides.append({"kind": "cta", "title": "Your turn", "subtitle": "", "body": "Follow for more.", "cta": "Follow"})
    return slides


@api.post("/carousel/generate")
async def carousel_generate(body: CarouselGenIn, user=Depends(current_user)):
    if body.platform not in PLATFORM_DIMS:
        raise HTTPException(400, "invalid platform")
    slides: List[Dict[str, Any]] = []
    if ANTHROPIC_API_KEY:
        from billing import charge_credits
        await charge_credits(user["workspace_id"], "carousel_generate",
                              meta={"platform": body.platform, "slides": body.slide_count})
        system = (
            f"You are Create EQ, a carousel narrative designer. From a single topic, produce a "
            f"multi-slide carousel with narrative arc Hook → Body → CTA. Return EXACTLY {body.slide_count} slides. "
            "Each body slide has a punchy title (<=8 words), optional subtitle (<=12 words), and a body "
            "paragraph (<=45 words, plain, no emojis, no hashtags). Slide 1 = hook (kind:'hook'), last = cta "
            "(kind:'cta') with a short 'cta' call-to-action string. Tone: "
            f"{body.tone}. STRICT JSON only: "
            '{"slides":[{"kind":"hook|body|cta","title":str,"subtitle":str,"body":str,"cta":str}]}'
        )
        try:
            resp = await _llm_chat(system, f"Topic: {body.topic}", f"creq-gen-{user['id']}", user=user)
            parsed = _extract_json(resp)
            if parsed and parsed.get("slides"):
                slides = parsed["slides"][: body.slide_count]
        except Exception as ex:
            logging.warning("carousel gen fallback: %s", ex)
    if not slides:
        slides = _default_slides(body.topic, body.slide_count)

    brand = (body.brand or BrandKit()).model_dump()
    proj_id = new_id()
    doc = {
        "id": proj_id, "workspace_id": user["workspace_id"], "owner_id": user["id"],
        "topic": body.topic, "platform": body.platform, "brand": brand,
        "slides": slides, "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.carousels.insert_one(doc)
    await _audit(user, "carousel.create", {"project_id": proj_id, "topic": body.topic})
    doc.pop("_id", None)
    return doc


@api.get("/carousel")
async def carousel_list(user=Depends(current_user)):
    return await db.carousels.find(
        {"workspace_id": user["workspace_id"]}, {"_id": 0}
    ).sort("updated_at", -1).to_list(500)


@api.get("/carousel/platforms")
async def carousel_platforms():
    return PLATFORM_DIMS


@api.get("/carousel/{pid}")
async def carousel_get(pid: str, user=Depends(current_user)):
    doc = await db.carousels.find_one({"id": pid, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "not found")
    return doc


@api.put("/carousel/{pid}")
async def carousel_update(pid: str, body: Dict[str, Any], user=Depends(current_user)):
    allowed = {k: v for k, v in body.items() if k in {
        "slides", "brand", "platform", "topic", "palette_id", "panorama",
        "show_slide_numbers", "show_progress_dots", "show_swipe_hint", "show_branding",
    }}
    allowed["updated_at"] = now_iso()
    await db.carousels.update_one(
        {"id": pid, "workspace_id": user["workspace_id"]}, {"$set": allowed}
    )
    return await carousel_get(pid, user)


@api.delete("/carousel/{pid}")
async def carousel_delete(pid: str, user=Depends(current_user)):
    await db.carousels.delete_one({"id": pid, "workspace_id": user["workspace_id"]})
    return {"ok": True}


@api.post("/carousel/edit")
async def carousel_edit(body: CarouselEditIn, user=Depends(current_user)):
    doc = await db.carousels.find_one(
        {"id": body.project_id, "workspace_id": user["workspace_id"]}, {"_id": 0}
    )
    if not doc:
        raise HTTPException(404, "not found")
    slides = doc.get("slides", [])
    if body.slide_index < 0 or body.slide_index >= len(slides):
        raise HTTPException(400, "invalid slide index")
    current = slides[body.slide_index]
    if ANTHROPIC_API_KEY:
        system = (
            "You are Create EQ's touch-edit interface. Rewrite the ONE slide provided per the user's "
            "instruction, preserving its kind. Keep title <=8 words, body <=45 words. STRICT JSON only: "
            '{"title":str,"subtitle":str,"body":str,"cta":str}'
        )
        prompt = f"Slide: {json.dumps(current)}\nInstruction: {body.instruction}"
        try:
            resp = await _llm_chat(system, prompt, f"creq-edit-{user['id']}", user=user)
            parsed = _extract_json(resp)
            if parsed:
                for k in ("title", "subtitle", "body", "cta"):
                    if k in parsed and parsed[k] is not None:
                        current[k] = parsed[k]
        except Exception as ex:
            logging.warning("carousel edit fallback: %s", ex)
    else:
        current["title"] = f"{current.get('title', '')} ✱"  # heuristic fallback marker
    slides[body.slide_index] = current
    await db.carousels.update_one(
        {"id": body.project_id}, {"$set": {"slides": slides, "updated_at": now_iso()}}
    )
    return {"slide": current, "index": body.slide_index}


@api.post("/carousel/brand-from-url")
async def brand_from_url(body: BrandFromUrlIn, user=Depends(current_user)):
    text = _fetch_url(body.url)[:4000]
    if ANTHROPIC_API_KEY and text:
        system = (
            "Extract a brand kit from a company's website snippet. Guess primary background hex, "
            "accent hex, text hex, and a font family (choose from Inter, Manrope, Poppins, IBM Plex Sans, "
            "Space Grotesk). Return STRICT JSON: {\"bg\":str,\"accent\":str,\"text\":str,\"font\":str,\"logo_text\":str}"
        )
        try:
            resp = await _llm_chat(system, text, f"creq-brand-{user['id']}", user=user)
            parsed = _extract_json(resp)
            if parsed:
                return parsed
        except Exception as ex:
            logging.warning("brand-from-url fallback: %s", ex)
    return {"bg": "#0F1010", "accent": "#E85D3A", "text": "#FFFFFF", "font": "Inter", "logo_text": ""}


# ----------------------------- Create EQ: AI Image Generation ----------------
class AiImageIn(BaseModel):
    prompt: str
    provider: str = "nano-banana"  # "nano-banana" (Gemini) | "gpt-image-1" (OpenAI)
    size: Optional[str] = "1080x1350"
    aspect: Optional[str] = "portrait"  # informational hint for the model


# Gemini image generation only accepts these discrete aspect ratios (no arbitrary
# width:height) — pick whichever is closest to what was actually requested so a
# "wide panorama" request returns a genuinely wide image instead of a square one.
_GEMINI_ASPECT_RATIOS = {
    "1:1": 1 / 1, "2:3": 2 / 3, "3:2": 3 / 2, "3:4": 3 / 4, "4:3": 4 / 3,
    "9:16": 9 / 16, "16:9": 16 / 9, "21:9": 21 / 9,
}


def _closest_gemini_aspect(width: int, height: int) -> str:
    target = width / height if height else 1.0
    return min(_GEMINI_ASPECT_RATIOS.items(), key=lambda kv: abs(kv[1] - target))[0]


@api.post("/carousel/ai-image")
async def carousel_ai_image(body: AiImageIn, user=Depends(current_user)):
    """Generate an AI image and return it as base64. The frontend embeds this as a
    `data:image/png;base64,...` URL directly on the canvas — no external storage needed."""
    prompt = (body.prompt or "").strip()
    if not prompt:
        raise HTTPException(400, "prompt is required")

    provider = (body.provider or "nano-banana").lower()

    if provider == "gpt-image-1":
        if not OPENAI_API_KEY:
            raise HTTPException(500, "OPENAI_API_KEY not configured")
    elif not GEMINI_API_KEY:
        raise HTTPException(500, "GEMINI_API_KEY not configured")

    from billing import charge_credits
    await charge_credits(user["workspace_id"], "ai_image", meta={"provider": provider})

    if not await _rate_ok(user):
        raise HTTPException(429, "daily LLM quota exceeded")

    if provider == "gpt-image-1":
        try:
            client = openai.AsyncOpenAI(api_key=OPENAI_API_KEY)
            resp = await client.images.generate(model="gpt-image-1", prompt=prompt, n=1)
            if not resp.data:
                raise HTTPException(502, "gpt-image-1 returned no image")
            b64 = resp.data[0].b64_json
            await _audit(user, "ai_image.generate", {"provider": "gpt-image-1", "prompt": prompt[:120]})
            return {"image_base64": b64, "mime_type": "image/png", "provider": "gpt-image-1"}
        except HTTPException:
            raise
        except Exception as ex:
            logging.warning("gpt-image-1 gen error: %s", ex)
            raise HTTPException(502, f"gpt-image-1 failed: {ex}")

    # default: Gemini Nano Banana
    try:
        req_w, req_h = 1080, 1350
        if body.size and "x" in body.size:
            try:
                w_str, h_str = body.size.lower().split("x", 1)
                req_w, req_h = int(w_str), int(h_str)
            except ValueError:
                pass
        aspect_ratio = _closest_gemini_aspect(req_w, req_h)
        style_hint = f"Composition: {body.size} {body.aspect}, high quality, suitable for a social media carousel."
        client = genai.Client(api_key=GEMINI_API_KEY)
        resp = await client.aio.models.generate_content(
            model="gemini-3.1-flash-image-preview",
            contents=[f"{prompt}\n\n{style_hint}"],
            config=genai_types.GenerateContentConfig(
                response_modalities=["Image", "Text"],
                image_config=genai_types.ImageConfig(aspect_ratio=aspect_ratio),
            ),
        )
        parts = resp.candidates[0].content.parts if resp.candidates else []
        image_part = next((p for p in parts if getattr(p, "inline_data", None)), None)
        if not image_part:
            raise HTTPException(502, "nano-banana returned no image")
        img_bytes = image_part.inline_data.data
        mime_type = image_part.inline_data.mime_type or "image/png"
        b64 = base64.b64encode(img_bytes).decode("utf-8") if isinstance(img_bytes, (bytes, bytearray)) else img_bytes
        await _audit(user, "ai_image.generate", {"provider": "nano-banana", "prompt": prompt[:120]})
        return {
            "image_base64": b64,
            "mime_type": mime_type,
            "provider": "nano-banana",
        }
    except HTTPException:
        raise
    except Exception as ex:
        logging.warning("nano-banana gen error: %s", ex)
        raise HTTPException(502, f"nano-banana failed: {ex}")


# ----------------------------- Webhooks: Airtable / Notion → Carousel -------
import secrets


class WebhookIn(BaseModel):
    name: str
    source: str = "generic"  # airtable | notion | generic
    field_map: Dict[str, str] = {}  # e.g. {"topic": "fields.Topic", "platform": "fields.Platform"}
    default_platform: str = "linkedin"
    default_slide_count: int = 6


@api.get("/webhooks")
async def list_webhooks(user=Depends(current_user)):
    hooks = await db.webhooks.find(
        {"workspace_id": user["workspace_id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    return hooks


@api.post("/webhooks")
async def create_webhook(body: WebhookIn, user=Depends(current_user)):
    doc = body.model_dump()
    doc.update({
        "id": new_id(),
        "workspace_id": user["workspace_id"],
        "owner_id": user["id"],
        "token": secrets.token_urlsafe(24),
        "active": True,
        "created_at": now_iso(),
        "call_count": 0,
        "last_called_at": None,
    })
    await db.webhooks.insert_one(doc)
    doc.pop("_id", None)
    await _audit(user, "webhook.create", {"id": doc["id"], "name": doc["name"], "source": doc["source"]})
    return doc


@api.delete("/webhooks/{wid}")
async def delete_webhook(wid: str, user=Depends(current_user)):
    await db.webhooks.delete_one({"id": wid, "workspace_id": user["workspace_id"]})
    await db.webhook_events.delete_many({"webhook_id": wid, "workspace_id": user["workspace_id"]})
    await _audit(user, "webhook.delete", {"id": wid})
    return {"ok": True}


@api.get("/webhooks/{wid}/events")
async def webhook_events(wid: str, user=Depends(current_user)):
    hook = await db.webhooks.find_one({"id": wid, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not hook:
        raise HTTPException(404, "not found")
    return await db.webhook_events.find(
        {"webhook_id": wid}, {"_id": 0}
    ).sort("at", -1).to_list(50)


def _extract_field(payload: Any, path: str) -> Any:
    """Walk a nested payload using a dot-path — supports Airtable ('fields.Topic')
    and Notion ('properties.title.title.0.plain_text') style keys."""
    if not path:
        return None
    cur = payload
    for part in path.split("."):
        if isinstance(cur, list):
            try:
                cur = cur[int(part)]
            except (ValueError, IndexError):
                return None
        elif isinstance(cur, dict):
            cur = cur.get(part)
        else:
            return None
        if cur is None:
            return None
    return cur


@api.post("/hooks/carousel/{token}")
async def webhook_carousel(token: str, payload: Dict[str, Any]):
    """PUBLIC (no JWT). Airtable / Notion / any webhook fires here → carousel generated."""
    hook = await db.webhooks.find_one({"token": token}, {"_id": 0})
    if not hook or not hook.get("active", True):
        raise HTTPException(404, "webhook not found")

    fm = hook.get("field_map") or {}
    topic = _extract_field(payload, fm.get("topic", "")) or payload.get("topic") or payload.get("Topic") or ""
    platform = _extract_field(payload, fm.get("platform", "")) or hook.get("default_platform") or "linkedin"
    if platform not in PLATFORM_DIMS:
        platform = "linkedin"
    slide_count_raw = _extract_field(payload, fm.get("slide_count", "")) or hook.get("default_slide_count") or 6
    try:
        slide_count = int(slide_count_raw)
    except (TypeError, ValueError):
        slide_count = 6
    slide_count = max(2, min(12, slide_count))

    event_id = new_id()
    if not topic or not isinstance(topic, str) or not topic.strip():
        await db.webhook_events.insert_one({
            "id": event_id, "webhook_id": hook["id"], "workspace_id": hook["workspace_id"],
            "at": now_iso(), "status": "error", "reason": "missing_topic",
            "payload_preview": json.dumps(payload, default=str)[:400],
        })
        raise HTTPException(400, "topic missing after field-mapping — check your webhook config")
    topic = topic.strip()

    slides: List[Dict[str, Any]] = []
    if ANTHROPIC_API_KEY:
        system = (
            f"You are Create EQ. Produce EXACTLY {slide_count} slides for a "
            f"{platform} carousel from a topic. Narrative arc: Hook → Body → CTA. "
            "Titles <=8 words, bodies <=45 words, plain text, no emojis. "
            "STRICT JSON: "
            '{"slides":[{"kind":"hook|body|cta","title":str,"subtitle":str,"body":str,"cta":str}]}'
        )
        try:
            resp = await _llm_chat(system, f"Topic: {topic}", f"wh-{hook['id']}-{event_id[:6]}")
            parsed = _extract_json(resp)
            if parsed and parsed.get("slides"):
                slides = parsed["slides"][:slide_count]
        except Exception as ex:
            logging.warning("webhook LLM error: %s", ex)
    if not slides:
        slides = _default_slides(topic, slide_count)

    proj_id = new_id()
    await db.carousels.insert_one({
        "id": proj_id, "workspace_id": hook["workspace_id"], "owner_id": hook.get("owner_id"),
        "topic": topic, "platform": platform, "brand": {},
        "slides": slides, "created_at": now_iso(), "updated_at": now_iso(),
        "source": f"webhook:{hook.get('source', 'generic')}", "source_webhook_id": hook["id"],
    })

    await db.webhooks.update_one(
        {"id": hook["id"]},
        {"$inc": {"call_count": 1}, "$set": {"last_called_at": now_iso()}},
    )
    await db.webhook_events.insert_one({
        "id": event_id, "webhook_id": hook["id"], "workspace_id": hook["workspace_id"],
        "at": now_iso(), "status": "ok", "project_id": proj_id, "topic": topic[:200],
        "payload_preview": json.dumps(payload, default=str)[:400],
    })
    return {"ok": True, "project_id": proj_id, "topic": topic, "slides": len(slides)}


# ----------------------------- HubSpot (real OAuth, mocked-first) -------------
# The old routes were pure theatre: "sync" stamped `hs-<id>` on our own records and
# never contacted HubSpot. These do the real OAuth dance and read real
# contacts/deals/engagements when credentials are configured; with none, they run
# in an honest test mode (labelled `mocked: True`) that still returns sample data
# so the flow — including the Context-Pack engagement merge — is demoable.
class HubspotConnectIn(BaseModel):
    portal_id: Optional[str] = None


@api.get("/hubspot/status")
async def hubspot_status(user=Depends(current_user)):
    import hubspot_client
    doc = await db.hubspot_integrations.find_one({"workspace_id": user["workspace_id"]}, {"_id": 0})
    if not doc:
        return {"connected": False, "mocked": hubspot_client.HUBSPOT_MOCKED}
    doc["mocked"] = hubspot_client.HUBSPOT_MOCKED
    return doc


@api.post("/hubspot/connect")
async def hubspot_connect(body: HubspotConnectIn, user=Depends(current_user)):
    """Start OAuth. In test mode (no app configured) there's nothing to authorise,
    so connect immediately but flag it honestly."""
    import hubspot_client
    if hubspot_client.HUBSPOT_MOCKED:
        doc = {
            "id": new_id(), "workspace_id": user["workspace_id"], "connected": True,
            "portal_id": body.portal_id or "test-mode", "mocked": True,
            "connected_at": now_iso(), "last_sync_at": None, "pushed_count": 0, "pulled_count": 0,
        }
        await db.hubspot_integrations.replace_one(
            {"workspace_id": user["workspace_id"]}, doc, upsert=True)
        await _audit(user, "hubspot.connect", {"mocked": True})
        return {**doc, "url": None}

    state = secrets.token_urlsafe(24)
    await db.oauth_states.insert_one({
        "state": state, "kind": "hubspot",
        "workspace_id": user["workspace_id"], "user_id": user["id"], "at": now_iso()})
    return {"url": hubspot_client.auth_url(state), "mocked": False}


@api.post("/hubspot/disconnect")
async def hubspot_disconnect(user=Depends(current_user)):
    await db.hubspot_integrations.delete_one({"workspace_id": user["workspace_id"]})
    await _audit(user, "hubspot.disconnect", {})
    return {"ok": True}


@api.post("/hubspot/pull")
async def hubspot_pull(user=Depends(current_user)):
    """Import real HubSpot contacts (and their deals) as leads. Dedupe on email,
    and stamp `hubspot_id` so proposals can later pull that contact's engagements."""
    import hubspot_client
    conn = await db.hubspot_integrations.find_one({"workspace_id": user["workspace_id"]}, {"_id": 0})
    if not conn or not conn.get("connected"):
        raise HTTPException(400, "HubSpot not connected")

    contacts = await hubspot_client.pull_contacts(conn)
    pulled = 0
    for c in contacts:
        email = (c.get("email") or "").lower()
        if not email or await db.leads.find_one({"workspace_id": user["workspace_id"], "email": email}):
            continue
        await db.leads.insert_one({
            "id": new_id(), "workspace_id": user["workspace_id"],
            "first_name": c.get("first_name", ""), "last_name": c.get("last_name", ""),
            "email": email, "company": c.get("company", ""), "title": c.get("title", ""),
            "status": "new", "source": "hubspot", "hubspot_id": c.get("hubspot_id"),
            "hubspot_synced_at": now_iso(), "verified": True, "intent": None,
            "enrichment_status": "pending", "created_at": now_iso(),
        })
        pulled += 1
    await db.hubspot_integrations.update_one(
        {"workspace_id": user["workspace_id"]},
        {"$set": {"last_sync_at": now_iso()}, "$inc": {"pulled_count": pulled}})
    await _audit(user, "hubspot.pull", {"pulled": pulled, "mocked": hubspot_client.HUBSPOT_MOCKED})
    return {"pulled": pulled, "mocked": hubspot_client.HUBSPOT_MOCKED}


@api.get("/hubspot/oauth/callback")
async def hubspot_oauth_callback(code: str, state: str):
    """PUBLIC. HubSpot redirects the browser here after the user grants access."""
    import hubspot_client
    from google_calendar_client import encrypt_token

    pending = await db.oauth_states.find_one({"state": state, "kind": "hubspot"}, {"_id": 0})
    if not pending:
        raise HTTPException(400, "invalid or expired oauth state")
    await db.oauth_states.delete_one({"state": state})

    try:
        tokens = await hubspot_client.exchange_code(code)
    except Exception as ex:
        logger.warning("hubspot oauth exchange failed: %s", ex)
        return RedirectResponse(f"{FRONTEND_URL}/app/hubspot?error=oauth_failed")

    await db.hubspot_integrations.replace_one(
        {"workspace_id": pending["workspace_id"]},
        {"id": new_id(), "workspace_id": pending["workspace_id"], "connected": True,
         "mocked": False, "portal_id": str(tokens.get("hub_id") or ""),
         "access_token_enc": encrypt_token(tokens.get("access_token")),
         "refresh_token_enc": encrypt_token(tokens.get("refresh_token")),
         "connected_at": now_iso(), "last_sync_at": None, "pushed_count": 0, "pulled_count": 0},
        upsert=True)
    return RedirectResponse(f"{FRONTEND_URL}/app/hubspot?connected=1")



# ----------------------------- Pitch EQ: Research pass + Verify gate --------
@api.post("/leads/{lead_id}/research")
async def lead_research(lead_id: str, user=Depends(current_user)):
    lead = await db.leads.find_one(
        {"id": lead_id, "workspace_id": user["workspace_id"]}, {"_id": 0}
    )
    if not lead:
        raise HTTPException(404, "not found")
    domain = ""
    if lead.get("email") and "@" in lead["email"]:
        domain = lead["email"].split("@", 1)[1]
    site_text = _fetch_url(f"https://{domain}") if domain else ""
    triggers: List[str] = []
    persona = ""
    if ANTHROPIC_API_KEY and site_text:
        system = (
            "You are Pitch EQ's research agent. Given a lead and a snippet of their company website, "
            "return STRICT JSON only: "
            '{"triggers": ["2-4 short outbound-worthy triggers (funding, hiring, tech shift, PR, product)"], '
            '"persona_hypothesis": "one-sentence guess about what this person cares about right now"}'
        )
        prompt = f"Lead: {json.dumps({k: lead.get(k) for k in ('first_name','last_name','title','company')})}\nWebsite: {site_text[:4000]}"
        try:
            resp = await _llm_chat(system, prompt, f"research-{user['id']}", user=user)
            parsed = _extract_json(resp)
            if parsed:
                triggers = parsed.get("triggers", [])[:5]
                persona = parsed.get("persona_hypothesis", "")
        except Exception as ex:
            logging.warning("research fallback: %s", ex)
    research = {
        "triggers": triggers or [
            f"Company '{lead.get('company','')}' active domain: {domain}",
            "Right-fit persona based on title/seniority",
        ],
        "persona_hypothesis": persona or f"{lead.get('title','Leader')} likely cares about growth and cost-efficiency.",
        "researched_at": now_iso(),
    }
    await db.leads.update_one({"id": lead_id}, {"$set": {"research": research}})
    await _audit(user, "lead.research", {"lead_id": lead_id, "domain": domain})
    return research


def _verify_email_syntax(email: str) -> bool:
    return bool(re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", email or ""))


async def _quarantine_lead(wid: str, lead: Dict[str, Any], reason: str):
    await db.quarantine.insert_one({
        "id": new_id(), "workspace_id": wid, "lead_id": lead.get("id"),
        "email": lead.get("email"), "reason": reason, "at": now_iso(),
    })


@api.get("/quarantine")
async def list_quarantine(user=Depends(current_user)):
    return await db.quarantine.find(
        {"workspace_id": user["workspace_id"]}, {"_id": 0}
    ).sort("at", -1).to_list(500)


# ----------------------------- Templates -------------------------------------
class TemplateIn(BaseModel):
    name: str
    subject: str
    body: str
    tags: List[str] = []


@api.get("/templates")
async def list_templates(user=Depends(current_user)):
    return await db.templates.find({"workspace_id": user["workspace_id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)


@api.post("/templates")
async def create_template(body: TemplateIn, user=Depends(current_user)):
    t = body.model_dump()
    eq = compute_eq(t["subject"], t["body"])
    t.update({
        "id": new_id(), "workspace_id": user["workspace_id"], "owner_id": user["id"],
        "created_at": now_iso(), "eq_score": eq["overall"],
    })
    await db.templates.insert_one(t)
    t.pop("_id", None)
    await _audit(user, "template.create", {"template_id": t["id"], "name": t["name"]})
    return t


@api.delete("/templates/{tid}")
async def delete_template(tid: str, user=Depends(current_user)):
    await db.templates.delete_one({"id": tid, "workspace_id": user["workspace_id"]})
    await _audit(user, "template.delete", {"template_id": tid})
    return {"ok": True}


# ----------------------------- Team & Invites --------------------------------
ROLES = {"org_admin", "campaign_manager", "sdr", "viewer"}


class TeamInviteIn(BaseModel):
    name: str
    email: EmailStr
    role: str = "campaign_manager"
    password: str


@api.get("/team")
async def list_team(user=Depends(current_user)):
    members = await db.users.find(
        {"workspace_id": user["workspace_id"]},
        {"_id": 0, "password_hash": 0},
    ).to_list(500)
    return members


@api.post("/team/invite")
async def invite_member(body: TeamInviteIn, user=Depends(current_user)):
    if user.get("role") not in {"org_admin"} and not _is_admin(user):
        raise HTTPException(403, "Only Org Admin can invite")
    if body.role not in ROLES:
        raise HTTPException(400, "invalid role")
    if await db.users.find_one({"email": body.email.lower()}):
        raise HTTPException(400, "Email already registered")
    uid = new_id()
    await db.users.insert_one({
        "id": uid, "email": body.email.lower(), "name": body.name,
        "password_hash": hash_pw(body.password),
        "workspace_id": user["workspace_id"], "role": body.role,
        "invited_by": user["id"], "created_at": now_iso(),
    })
    await _audit(user, "team.invite", {"user_id": uid, "email": body.email.lower(), "role": body.role})
    return {"ok": True, "user_id": uid}


@api.delete("/team/{uid}")
async def remove_member(uid: str, user=Depends(current_user)):
    if uid == user["id"]:
        raise HTTPException(400, "Cannot remove yourself")
    victim = await db.users.find_one({"id": uid, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not victim:
        raise HTTPException(404, "not found")
    if user.get("role") != "org_admin" and not _is_admin(user):
        raise HTTPException(403, "Only Org Admin can remove")
    await db.users.delete_one({"id": uid})
    await _audit(user, "team.remove", {"user_id": uid, "email": victim.get("email")})
    return {"ok": True}


# ----------------------------- Analytics deep-dive ---------------------------
@api.get("/analytics/campaigns")
async def analytics_campaigns(user=Depends(current_user)):
    wid = user["workspace_id"]
    out = []
    campaigns = await db.campaigns.find({"workspace_id": wid}, {"_id": 0}).to_list(500)
    for c in campaigns:
        steps = c.get("steps", [])
        events = await db.events.find({"workspace_id": wid, "campaign_id": c["id"]}, {"_id": 0}).to_list(20000)
        by_step = []
        for i in range(len(steps)):
            e = [x for x in events if x.get("step") == i]
            sent = sum(1 for x in e if x["type"] == "sent")
            by_step.append({
                "step": i, "subject": steps[i].get("subject", ""),
                "sent": sent,
                "opened": sum(1 for x in e if x["type"] == "opened"),
                "clicked": sum(1 for x in e if x["type"] == "clicked"),
                "replied": sum(1 for x in e if x["type"] == "replied"),
                "open_rate": round(sum(1 for x in e if x["type"] == "opened") / sent * 100, 1) if sent else 0,
                "reply_rate": round(sum(1 for x in e if x["type"] == "replied") / sent * 100, 1) if sent else 0,
            })
        out.append({"id": c["id"], "name": c["name"], "status": c["status"], "by_step": by_step})
    return out


@api.get("/analytics/mailboxes")
async def analytics_mailboxes(user=Depends(current_user)):
    return await db.mailboxes.find({"workspace_id": user["workspace_id"]}, {"_id": 0}).to_list(500)


# ----------------------------- Audit log -------------------------------------
async def _audit(user: Dict[str, Any], action: str, meta: Dict[str, Any] = None):
    try:
        await db.audit_log.insert_one({
            "id": new_id(),
            "workspace_id": user.get("workspace_id"),
            "user_id": user.get("id"),
            "actor_email": user.get("email"),
            "action": action,
            "meta": meta or {},
            "at": now_iso(),
        })
    except Exception:
        pass


# ----------------------------- Centralized activity timeline -----------------
async def _log_activity(workspace_id: str, lead_id: str, agent: str, type_: str,
                         summary: str, meta: Dict[str, Any] = None):
    """Append-only, per-lead activity feed shared across every agent (Pitch/Voice/
    Schedule/Proposal/Social). Never raises — a logging failure must not break the
    caller's primary action."""
    try:
        await db.activities.insert_one({
            "id": new_id(),
            "workspace_id": workspace_id,
            "lead_id": lead_id,
            "agent": agent,
            "type": type_,
            "summary": summary,
            "meta": meta or {},
            "at": now_iso(),
        })
    except Exception:
        pass


@api.get("/leads/{lead_id}")
async def get_lead(lead_id: str, user=Depends(current_user)):
    lead = await db.leads.find_one({"id": lead_id, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "not found")
    lead["deal"] = await db.deals.find_one({"lead_id": lead_id, "workspace_id": user["workspace_id"]}, {"_id": 0})
    return lead


@api.get("/leads/{lead_id}/timeline")
async def lead_timeline(lead_id: str, user=Depends(current_user)):
    return await db.activities.find(
        {"lead_id": lead_id, "workspace_id": user["workspace_id"]}, {"_id": 0}
    ).sort("at", -1).to_list(500)


# ----------------------------- Suite command center --------------------------
@api.get("/activities")
async def list_activities(limit: int = 60, agent: Optional[str] = None, user=Depends(current_user)):
    """Workspace-wide, cross-agent activity feed for the command center."""
    q = {"workspace_id": user["workspace_id"]}
    if agent:
        q["agent"] = agent
    items = await db.activities.find(q, {"_id": 0}).sort("at", -1).to_list(min(limit, 200))
    lead_ids = list({a["lead_id"] for a in items if a.get("lead_id")})
    leads = {}
    if lead_ids:
        async for l in db.leads.find(
            {"id": {"$in": lead_ids}}, {"_id": 0, "id": 1, "first_name": 1, "last_name": 1, "company": 1}
        ):
            leads[l["id"]] = l
    for a in items:
        a["lead"] = leads.get(a.get("lead_id"))
    return items


@api.get("/activities/summary")
async def activities_summary(user=Depends(current_user)):
    """Per-agent activity totals + today's count, for command-center stat tiles."""
    wid = user["workspace_id"]
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    by_agent = {}
    for a in ("pitch", "voice", "scheduler", "proposal", "social"):
        by_agent[a] = await db.activities.count_documents({"workspace_id": wid, "agent": a})
    today_count = await db.activities.count_documents({"workspace_id": wid, "at": {"$gte": today}})
    total = await db.activities.count_documents({"workspace_id": wid})
    return {"by_agent": by_agent, "today": today_count, "total": total}


@api.get("/audit-log")
async def audit_log(limit: int = 200, user=Depends(current_user)):
    q = {"workspace_id": user["workspace_id"]}
    items = await db.audit_log.find(q, {"_id": 0}).sort("at", -1).to_list(min(limit, 1000))
    return items


# ----------------------------- Rate limit (per workspace) -------------------
DAILY_LLM_LIMIT = int(os.environ.get("DAILY_LLM_LIMIT", "200"))


async def _rate_ok(user: Dict[str, Any]) -> bool:
    """Return True if workspace under daily LLM quota; increments usage."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    doc = await db.rate_limits.find_one_and_update(
        {"workspace_id": user["workspace_id"], "day": today},
        {"$inc": {"count": 1}},
        upsert=True,
        return_document=True,
    )
    return (doc or {}).get("count", 1) <= DAILY_LLM_LIMIT


@api.get("/quota")
async def quota(user=Depends(current_user)):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    doc = await db.rate_limits.find_one({"workspace_id": user["workspace_id"], "day": today}, {"_id": 0})
    used = (doc or {}).get("count", 0)
    return {"used": used, "limit": DAILY_LLM_LIMIT, "remaining": max(0, DAILY_LLM_LIMIT - used)}


# ----------------------------- Impersonation (defined below Admin) ----------


# ----------------------------- Admin (Suite Admin) ---------------------------
ADMIN_EMAILS = {e.strip().lower() for e in os.environ.get("ADMIN_EMAILS", "demo@innoira.ai").split(",") if e.strip()}


def _is_admin(user: Dict[str, Any]) -> bool:
    return (user.get("email") or "").lower() in ADMIN_EMAILS or user.get("role") == "suite_admin"


async def require_admin(user=Depends(current_user)):
    if not _is_admin(user):
        raise HTTPException(403, "Admin only")
    return user


@api.get("/admin/summary")
async def admin_summary(_: Any = Depends(require_admin)):
    return {
        "workspaces": await db.workspaces.count_documents({}),
        "users": await db.users.count_documents({}),
        "campaigns": await db.campaigns.count_documents({}),
        "active_campaigns": await db.campaigns.count_documents({"status": "active"}),
        "leads": await db.leads.count_documents({}),
        "mailboxes": await db.mailboxes.count_documents({}),
        "sent_events": await db.events.count_documents({"type": "sent"}),
        "replied_events": await db.events.count_documents({"type": "replied"}),
        "blocked_users": await db.users.count_documents({"blocked": True}),
        "blocked_workspaces": await db.workspaces.count_documents({"blocked": True}),
    }


@api.get("/admin/workspaces")
async def admin_workspaces(_: Any = Depends(require_admin)):
    out = []
    async for ws in db.workspaces.find({}, {"_id": 0}):
        wid = ws["id"]
        ws["stats"] = {
            "users": await db.users.count_documents({"workspace_id": wid}),
            "campaigns": await db.campaigns.count_documents({"workspace_id": wid}),
            "leads": await db.leads.count_documents({"workspace_id": wid}),
            "sent": await db.events.count_documents({"workspace_id": wid, "type": "sent"}),
            "replied": await db.events.count_documents({"workspace_id": wid, "type": "replied"}),
        }
        out.append(ws)
    return out


@api.get("/admin/users")
async def admin_users(_: Any = Depends(require_admin)):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(5000)
    ws_map = {w["id"]: w["name"] async for w in db.workspaces.find({}, {"_id": 0, "id": 1, "name": 1})}
    for u in users:
        u["workspace_name"] = ws_map.get(u.get("workspace_id"))
        u["is_admin"] = (u.get("email") or "").lower() in ADMIN_EMAILS
    return users


@api.post("/admin/users/{uid}/toggle")
async def admin_toggle_user(uid: str, _: Any = Depends(require_admin)):
    u = await db.users.find_one({"id": uid}, {"_id": 0})
    if not u:
        raise HTTPException(404, "not found")
    blocked = not u.get("blocked", False)
    await db.users.update_one({"id": uid}, {"$set": {"blocked": blocked}})
    return {"ok": True, "blocked": blocked}


@api.delete("/admin/users/{uid}")
async def admin_delete_user(uid: str, admin=Depends(require_admin)):
    if uid == admin["id"]:
        raise HTTPException(400, "Cannot delete yourself")
    await db.users.delete_one({"id": uid})
    return {"ok": True}


@api.post("/admin/workspaces/{wid}/toggle")
async def admin_toggle_workspace(wid: str, _: Any = Depends(require_admin)):
    ws = await db.workspaces.find_one({"id": wid}, {"_id": 0})
    if not ws:
        raise HTTPException(404, "not found")
    blocked = not ws.get("blocked", False)
    await db.workspaces.update_one({"id": wid}, {"$set": {"blocked": blocked}})
    return {"ok": True, "blocked": blocked}


@api.get("/admin/whoami")
async def admin_whoami(user=Depends(current_user)):
    return {"is_admin": _is_admin(user)}


@api.post("/admin/impersonate/{uid}")
async def impersonate(uid: str, admin=Depends(require_admin)):
    target = await db.users.find_one({"id": uid}, {"_id": 0})
    if not target:
        raise HTTPException(404, "not found")
    token = make_token(target["id"], target["workspace_id"])
    await _audit(admin, "admin.impersonate", {"target_user_id": uid, "target_email": target.get("email")})
    return {"token": token,
            "user": {"id": target["id"], "email": target["email"], "name": target["name"], "is_admin": _is_admin(target)},
            "workspace": await db.workspaces.find_one({"id": target["workspace_id"]}, {"_id": 0})}


# ----------------------------- Mount -----------------------------------------
from voice_eq import voice_router, voice_public_router
from voice_ws_bridge import voice_ws_router
from schedule_eq import schedule_router, schedule_public_router
from proposal_eq import proposal_router
from social_eq import social_router
from billing import billing_router, billing_public_router
from pitch_eq import pitch_router, pitch_public_router
api.include_router(pitch_router)
api.include_router(pitch_public_router)
api.include_router(voice_router)
api.include_router(voice_public_router)
api.include_router(voice_ws_router)
api.include_router(schedule_router)
api.include_router(schedule_public_router)
api.include_router(proposal_router)
api.include_router(social_router)
api.include_router(billing_router)
api.include_router(billing_public_router)
app.include_router(api)


@app.on_event("startup")
async def _create_indexes():
    """Ensure indexes for multi-tenant queries and lookups. Idempotent."""
    try:
        await db.users.create_index("email", unique=True)
        await db.users.create_index("id", unique=True)
        await db.workspaces.create_index("id", unique=True)
        for col in ("leads", "campaigns", "mailboxes", "conversations", "deals", "events", "suppressions",
                    "voice_agents", "voice_campaigns", "calls", "voice_numbers",
                    "event_types", "bookings", "calendar_integrations",
                    "proposals", "pricing_catalog", "social_posts", "social_integrations"):
            await db[col].create_index([("workspace_id", 1), ("id", 1)])
        await db.proposals.create_index([("workspace_id", 1), ("lead_id", 1)])
        await db.social_integrations.create_index([("workspace_id", 1), ("provider", 1)], unique=True)
        await db.social_posts.create_index([("workspace_id", 1), ("platform", 1), ("status", 1)])
        await db.credit_accounts.create_index("workspace_id", unique=True)
        await db.credit_ledger.create_index([("workspace_id", 1), ("at", -1)])
        await db.subscriptions.create_index("workspace_id", unique=True)
        await db.bookings.create_index("manage_token", unique=True, sparse=True)
        await db.sent_emails.create_index([("workspace_id", 1), ("booking_id", 1), ("at", -1)])
        await db.lead_research.create_index([("workspace_id", 1), ("lead_id", 1)], unique=True)
        await db.email_drafts.create_index([("workspace_id", 1), ("lead_id", 1), ("created_at", -1)])
        await db.leads.create_index([("workspace_id", 1), ("linkedin_url", 1)], sparse=True)
        await db.send_queue.create_index([("status", 1), ("send_at", 1)])
        await db.send_queue.create_index([("workspace_id", 1), ("campaign_id", 1)])
        await db.oauth_states.create_index("state", unique=True)
        await db.deal_context.create_index([("workspace_id", 1), ("deal_id", 1)], unique=True)
        await db.proposal_templates.create_index([("workspace_id", 1), ("service", 1)])
        await db.event_types.create_index([("workspace_id", 1), ("slug", 1)], unique=True)
        await db.bookings.create_index([("workspace_id", 1), ("event_type_id", 1), ("status", 1)])
        await db.bookings.create_index([("workspace_id", 1), ("lead_id", 1)])
        await db.oauth_states.create_index("state", unique=True)
        await db.leads.create_index([("workspace_id", 1), ("email", 1)], unique=False)
        await db.events.create_index([("workspace_id", 1), ("type", 1)])
        await db.events.create_index([("workspace_id", 1), ("at", -1)])
        await db.suppressions.create_index([("workspace_id", 1), ("email", 1)], unique=True)
        await db.calls.create_index([("workspace_id", 1), ("created_at", -1)])
        await db.calls.create_index([("workspace_id", 1), ("lead_id", 1)])
        await db.calls.create_index([("workspace_id", 1), ("campaign_id", 1)])
        await db.calls.create_index("retell_call_id")
        await db.activities.create_index([("workspace_id", 1), ("lead_id", 1), ("at", -1)])
        logger.info("indexes ensured")
    except Exception as ex:
        logger.warning("index setup: %s", ex)


# Background jobs. In-process (APScheduler) rather than a separate queue — the only
# recurring work today is the booking reminder, which doesn't justify running Redis.
scheduler = None


@app.on_event("startup")
async def _start_scheduler():
    global scheduler
    try:
        from apscheduler.schedulers.asyncio import AsyncIOScheduler
        from schedule_eq import run_reminder_tick
        from sender import run_send_tick, run_reply_tick

        scheduler = AsyncIOScheduler(timezone="UTC")
        # Every 15 min: any confirmed booking ~24h out gets one reminder. The job
        # claims each booking before sending, so overlapping ticks can't double-send.
        scheduler.add_job(run_reminder_tick, "interval", minutes=15,
                          id="booking_reminders", max_instances=1, coalesce=True)
        # Drain the outbound queue. Every 2 min, capped per tick — a trickle looks
        # human; a burst looks like spam and gets the mailbox flagged.
        scheduler.add_job(lambda: run_send_tick(PUBLIC_BASE_URL), "interval", minutes=2,
                          id="outbound_sends", max_instances=1, coalesce=True)
        # Poll sent threads for real replies (this is what feeds the unified inbox).
        scheduler.add_job(run_reply_tick, "interval", minutes=10,
                          id="reply_polling", max_instances=1, coalesce=True)
        scheduler.start()
        logger.info("scheduler started (reminders 15m, sends 2m, reply polling 10m)")
    except Exception as ex:
        logger.warning("scheduler failed to start: %s", ex)


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
