"""Pitch EQ - AI Cold Email SaaS Backend.

Single-file FastAPI backend implementing multi-tenant workspaces, JWT auth,
campaigns, sequencer, leads, mailboxes, unified inbox, CRM pipeline, and a
heuristic EQ Score engine (real LLM to be plugged in later).
"""

from fastapi import FastAPI, APIRouter, Depends, HTTPException, Request, File, UploadFile, status
from fastapi.responses import JSONResponse
from fastapi.responses import Response, RedirectResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
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
import asyncio
import secrets as _secrets
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

# Deployment environment. "dev" (default) keeps local-friendly fallbacks;
# anything else (staging/production) makes insecure defaults fatal at boot
# rather than silently shipping them.
APP_ENV = os.environ.get("ENV", "dev").lower()
if APP_ENV != "dev" and JWT_SECRET == "pitcheq-dev-secret-change-me":
    raise RuntimeError(
        "FATAL: JWT_SECRET is still the built-in dev default but ENV=%s. "
        "Set a strong JWT_SECRET before deploying." % APP_ENV
    )

FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")
# Where the recipient's mail client reaches the open pixel / click redirect. Must
# be publicly reachable for tracking to work at all — on localhost it won't be.
PUBLIC_BASE_URL = os.environ.get("PUBLIC_BASE_URL", "")

# Error tracking — mocked-first like every other integration: off when
# SENTRY_DSN is unset (local dev), active the moment a real DSN is added.
SENTRY_DSN = os.environ.get("SENTRY_DSN", "")
if SENTRY_DSN:
    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration
    from sentry_sdk.integrations.pymongo import PyMongoIntegration
    sentry_sdk.init(
        dsn=SENTRY_DSN,
        environment=APP_ENV,
        integrations=[FastApiIntegration(), PyMongoIntegration()],
        traces_sample_rate=0.1,
    )

app = FastAPI(title="Pitch EQ API")
api = APIRouter(prefix="/api")
bearer = HTTPBearer(auto_error=False)

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    logger.error("Unhandled exception: %s", exc, exc_info=True)
    return JSONResponse(status_code=500, content={"detail": f"Internal server error: {exc}"})

limiter = Limiter(key_func=get_remote_address, default_limits=[])
app.state.limiter = limiter
app.add_exception_handler(429, _rate_limit_exceeded_handler)


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


async def current_user_optional(cred: HTTPAuthorizationCredentials = Depends(bearer)):
    """Like current_user but returns None instead of raising 401."""
    if not cred:
        return None
    try:
        payload = jwt.decode(cred.credentials, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.PyJWTError:
        return None
    user = await db.users.find_one({"id": payload["uid"]}, {"_id": 0})
    if not user:
        return None
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


# LeadIn/LeadUpdate/LeadBulk moved to crm.py.


class SequenceStep(BaseModel):
    channel: str = "email"
    day: int = 0
    # Email fields
    subject: str = ""
    body: str = ""
    body_html: str = ""
    ab_variant_subject: Optional[str] = ""
    ab_variant_body: Optional[str] = ""
    # Voice fields
    script: str = ""
    agent_id: Optional[str] = None
    call_timeout_seconds: int = 60
    # LinkedIn fields
    linkedin_message: str = ""
    linkedin_comment_text: str = ""
    linkedin_post_url: str = ""
    linkedin_connection_note: str = ""


class CampaignIn(BaseModel):
    name: str
    goal: str = "Book meetings"
    campaign_type: str = "ai"  # "ai" = personalized openers, "template" = basic merge fields only
    from_mailbox_id: Optional[str] = None
    steps: List[SequenceStep]
    lead_ids: List[str] = []
    send_window_start: str = "09:00"
    send_window_end: str = "17:00"
    timezone: str = "UTC"
    signature_id: Optional[str] = None
    batch_size: int = 10
    phased_generation: bool = False


class SignatureIn(BaseModel):
    name: str
    content_html: str = ""
    content_text: str = ""
    is_default: bool = False


class MailboxIn(BaseModel):
    email: EmailStr
    provider: str = "gmail"  # gmail / m365 / smtp
    display_name: str = ""
    daily_cap: int = 50


class ReplyIn(BaseModel):
    body: str


# DealIn moved to crm.py.


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
@limiter.limit("10/minute")
async def signup(request: Request, body: SignupIn):
    if len(body.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    if await db.users.find_one({"email": body.email.lower()}):
        raise HTTPException(400, "Email already registered")
    workspace_id = new_id()
    user_id = new_id()
    await db.workspaces.insert_one({
        "id": workspace_id,
        "name": body.workspace_name,
        "owner_id": user_id,
        "created_at": now_iso(),
        "brand_voice": {"tone": "warm", "banned_phrases": [], "sample": "", "offer": "", "icp_description": ""},
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
@limiter.limit("20/minute")
async def login(request: Request, body: LoginIn):
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
            "brand_voice": {"tone": "warm", "banned_phrases": [], "sample": "", "offer": "", "icp_description": ""},
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


# ----------------------------- Leads, Lead Lists, Suppressions ---------------
# Moved to crm.py (mounted below) — CRM is a spoke module like every other agent.


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
    if c.get("lead_ids"):
        await db.leads.update_many(
            {"id": {"$in": c["lead_ids"]}},
            {"$addToSet": {"campaign_ids": c["id"]}},
        )
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
    old = await db.campaigns.find_one({"id": cid, "workspace_id": user["workspace_id"]}, {"_id": 0, "lead_ids": 1})
    new_ids = body.lead_ids
    old_ids = (old or {}).get("lead_ids", [])
    await db.campaigns.update_one(
        {"id": cid, "workspace_id": user["workspace_id"]},
        {"$set": body.model_dump()},
    )
    added = [lid for lid in new_ids if lid not in old_ids]
    removed = [lid for lid in old_ids if lid not in new_ids]
    if added:
        await db.leads.update_many(
            {"id": {"$in": added}},
            {"$addToSet": {"campaign_ids": cid}},
        )
    if removed:
        await db.leads.update_many(
            {"id": {"$in": removed}},
            {"$pull": {"campaign_ids": cid}},
        )
    return await get_campaign(cid, user)


@api.delete("/campaigns/{cid}")
async def delete_campaign(cid: str, user=Depends(current_user)):
    result = await db.campaigns.delete_one({"id": cid, "workspace_id": user["workspace_id"]})
    if result.deleted_count == 0:
        raise HTTPException(404, "Campaign not found")
    # Also clean up related data
    await db.send_queue.delete_many({"campaign_id": cid})
    await db.events.delete_many({"campaign_id": cid})
    await db.conversations.delete_many({"campaign_id": cid})
    return {"ok": True}


@api.post("/campaigns/{cid}/launch")
async def launch_campaign(cid: str, skip_pending: bool = False, user=Depends(current_user)):
    """Enqueue a campaign for real sending.

    By default every lead must be approved before launch. Pass `skip_pending=true`
    to send only to leads whose personalised email has been approved — the rest
    are skipped rather than blocked.
    """
    from sender import enqueue_campaign

    c = await db.campaigns.find_one({"id": cid, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not c:
        raise HTTPException(404, "not found")

    lead_ids = c.get("lead_ids") or []
    if lead_ids:
        pmap = {p["lead_id"]: p for p in c.get("personalized_emails", [])}
        missing = [lid for lid in lead_ids if lid not in pmap]
        drafts = [lid for lid in lead_ids if pmap.get(lid, {}).get("status") == "draft"]
        if missing or drafts:
            if skip_pending:
                approved_ids = [lid for lid in lead_ids if pmap.get(lid, {}).get("status") == "approved"]
                if not approved_ids:
                    raise HTTPException(400, "No approved emails to send — approve at least one lead first.")
                c["lead_ids"] = approved_ids
            else:
                reviewed = len(lead_ids) - len(missing) - len(drafts)
                raise HTTPException(
                    400,
                    f"Review incomplete — {reviewed} of {len(lead_ids)} leads reviewed "
                    f"({len(missing)} not yet generated, {len(drafts)} awaiting approve/reject). "
                    "Every lead must be approved or rejected before launch.",
                )

    from traceback import format_exc as _tb
    try:
        result = await enqueue_campaign(user["workspace_id"], c)
    except ValueError as ex:
        raise HTTPException(400, str(ex))
    except Exception as ex:
        logger.error("enqueue_campaign crashed\n%s", _tb())
        raise HTTPException(500, f"Campaign engine error: {ex}")

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


# ----------------------------- Campaign Personalization ----------------------------
@api.post("/campaigns/{cid}/leads/{lead_id}/generate-email")
async def generate_campaign_lead_email(cid: str, lead_id: str, user=Depends(current_user)):
    """Research a lead via Perplexity, then draft a personalized cold email using
    the campaign's service context and step template."""
    wid = user["workspace_id"]
    campaign = await db.campaigns.find_one({"id": cid, "workspace_id": wid}, {"_id": 0})
    if not campaign:
        raise HTTPException(404, "Campaign not found")
    lead = await db.leads.find_one({"id": lead_id, "workspace_id": wid}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "Lead not found")
    campaign_steps = campaign.get("steps", [])
    step_template = campaign_steps[0] if campaign_steps else {}

    is_template = campaign.get("campaign_type") == "template"
    if is_template:
        # Template campaign — no AI research or opener, just store the template body as-is
        personalized = {
            "lead_id": lead_id,
            "subject": step_template.get("subject", ""),
            "body": step_template.get("body", "") or "",
            "body_html": step_template.get("body_html", "") or "",
            "personalized_opener": "",
            "status": "draft",
            "generated_at": now_iso(),
        }
        await db.campaigns.update_one(
            {"id": cid},
            {"$push": {"personalized_emails": personalized}}
        )
        await _audit(user, "campaign.lead.email_generated", {"campaign_id": cid, "lead_id": lead_id})
        return personalized

    if not await _rate_ok(user):
        raise HTTPException(429, "Daily AI quota exceeded")
    service_info = {}
    service_id = campaign.get("ai_meta", {}).get("service_id") or campaign.get("service_id")
    if service_id:
        svc = await db.service_library.find_one({"id": service_id, "workspace_id": wid}, {"_id": 0})
        if svc:
            service_info = {k: v for k, v in svc.items() if k not in ("id", "workspace_id", "created_at", "updated_at", "status", "_id")}
    domain = ""
    if lead.get("email") and "@" in lead["email"]:
        domain = lead["email"].split("@", 1)[1]
    lead_context = {k: lead.get(k) for k in ("first_name", "last_name", "title", "company", "email", "linkedin_url")}
    from research_worker import get_research, summarize_for_prompt
    research_pack = await get_research(wid, lead)
    research_summary = summarize_for_prompt(research_pack)
    research = {"summary": research_summary, "has_signal": research_pack.get("has_signal", False)}
    ai_meta = campaign.get("ai_meta", {})

    opener_system = (
        "You are Pitch EQ's personalization agent. Generate ONLY a personalized ice-breaker opener for a cold email.\n"
        "Rules:\n"
        "1. Use real specific details from the lead research — never invent\n"
        "2. Write 1-2 sentences max — a genuine ice breaker tied to something real\n"
        "3. Make it conversational and natural — not salesy\n"
        "4. Do NOT include greeting, pitch, or CTA\n"
        "5. Return STRICT JSON only: {\"opener\": \"...\"}"
    )
    opener_prompt = (
        f"LEAD PROFILE:\n{json.dumps(lead_context, indent=2)}\n\n"
        f"LEAD RESEARCH:\n{research_summary}\n\n"
        f"CAMPAIGN SERVICE: {ai_meta.get('service_name', campaign.get('goal', ''))}\n"
        f"CAMPAIGN GOAL: {campaign.get('goal', '')}\n"
        f"CAMPAIGN TONE: {campaign.get('tone', 'professional')}\n\n"
        f"Generate a personalized ice-breaker opener for this specific lead. "
        f"This will be inserted into the {{personalized_opener}} placeholder in the email template."
    )
    try:
        raw2 = await _llm_chat(opener_system, opener_prompt, f"lead-opnr-{lead_id[:8]}", user=user, max_tokens=512)
        opener_data = _extract_json(raw2) or {}
        personalized_opener = opener_data.get("opener", "")
    except Exception as ex:
        raise HTTPException(502, f"Opener generation failed: {ex}")

    opener_clean = (personalized_opener or "").strip()
    template_body = step_template.get("body", "")
    template_html = step_template.get("body_html", "")
    merged_body = template_body.replace("{{personalized_opener}}", opener_clean)
    merged_html = template_html.replace("{{personalized_opener}}", opener_clean) if template_html else ""
    merged_body = re.sub(r"\n{3,}", "\n\n", merged_body)

    personalized = {
        "lead_id": lead_id,
        "subject": step_template.get("subject", ""),
        "body": merged_body,
        "body_html": merged_html,
        "personalized_opener": personalized_opener,
        "research": research,
        "status": "draft",
        "generated_at": now_iso(),
    }
    await db.campaigns.update_one(
        {"id": cid},
        {"$push": {"personalized_emails": personalized}}
    )
    await db.generated_emails.insert_one({
        "id": new_id(), "workspace_id": wid,
        "campaign_id": cid, "lead_id": lead_id, "step": 0,
        "subject": step_template.get("subject", ""),
        "body_html": merged_html, "body_text": merged_body,
        "personalized_opener": personalized_opener,
        "status": "draft", "source": "campaign_generation",
        "generated_at": now_iso(), "sent_at": None,
        "campaign_name": campaign.get("name", ""),
        "lead_email": lead.get("email", ""),
        "lead_name": f"{lead.get('first_name', '')} {lead.get('last_name', '')}".strip(),
    })
    await _audit(user, "campaign.lead.email_generated", {"campaign_id": cid, "lead_id": lead_id})
    return personalized


@api.get("/campaigns/{cid}/leads")
async def get_campaign_leads(cid: str, user=Depends(current_user)):
    """Return leads for a campaign with their personalized email status. Leads
    that have never been through AI generation (or a manual opener edit) still
    get a merge-field-resolved preview of the raw template, so the review
    screen has something to show — and to edit — before any generation runs."""
    wid = user["workspace_id"]
    campaign = await db.campaigns.find_one({"id": cid, "workspace_id": wid}, {"_id": 0, "personalized_emails": 1, "lead_ids": 1, "steps": 1})
    if not campaign:
        raise HTTPException(404, "not found")
    lead_ids = campaign.get("lead_ids", [])
    personalized = campaign.get("personalized_emails", [])
    personalization_map = {p["lead_id"]: p for p in personalized}
    step_template = (campaign.get("steps") or [{}])[0]
    leads = await db.leads.find(
        {"id": {"$in": lead_ids}, "workspace_id": wid},
        {"_id": 0}
    ).to_list(500)

    def _resolve(s: str, lead: Dict[str, Any]) -> str:
        if not s:
            return s
        for k in ("first_name", "last_name", "company", "title"):
            v = lead.get(k, "")
            if v:
                s = s.replace("{{" + k + "}}", v)
        return s

    result = []
    for lead in leads:
        p = personalization_map.get(lead["id"])
        if p:
            subject = _resolve(p.get("subject", ""), lead)
            body = _resolve(p.get("body", ""), lead)
            body_html = _resolve(p.get("body_html", ""), lead)
            opener = p.get("personalized_opener", "")
        else:
            subject = _resolve(step_template.get("subject", ""), lead)
            body = _resolve((step_template.get("body", "") or "").replace("{{personalized_opener}}", ""), lead)
            body_html = _resolve((step_template.get("body_html", "") or "").replace("{{personalized_opener}}", ""), lead)
            opener = ""
        result.append({
            "id": lead["id"],
            "first_name": lead.get("first_name", ""),
            "last_name": lead.get("last_name", ""),
            "email": lead.get("email", ""),
            "company": lead.get("company", ""),
            "title": lead.get("title", ""),
            "personalized": p is not None,
            "email_status": p.get("status", "none") if p else "none",
            "email_subject": subject,
            "email_body": body,
            "email_body_html": body_html,
            "personalized_opener": opener,
            "generated_at": p.get("generated_at", "") if p else "",
        })
    return {"leads": result, "personalized_count": len(personalized), "total_count": len(lead_ids)}


@api.post("/campaigns/{cid}/leads/generate-all")
async def generate_all_lead_emails(cid: str, user=Depends(current_user)):
    """Generate personalized emails for all leads in a campaign."""
    wid = user["workspace_id"]
    campaign = await db.campaigns.find_one({"id": cid, "workspace_id": wid}, {"_id": 0})
    if not campaign:
        raise HTTPException(404, "not found")
    service_info = {}
    service_id = campaign.get("ai_meta", {}).get("service_id") or campaign.get("service_id")
    if service_id:
        svc = await db.service_library.find_one({"id": service_id, "workspace_id": wid}, {"_id": 0})
        if svc:
            service_info = {k: v for k, v in svc.items() if k not in ("id", "workspace_id", "created_at", "updated_at", "status", "_id")}
    lead_ids = campaign.get("lead_ids", [])
    personalized = campaign.get("personalized_emails", [])
    already_done = {p["lead_id"] for p in personalized}
    to_generate = [lid for lid in lead_ids if lid not in already_done]
    if not to_generate:
        return {"generated": 0, "message": "All leads already have personalized emails"}
    results, errors = [], []
    campaign_steps = campaign.get("steps", [])
    step_template = campaign_steps[0] if campaign_steps else {}
    template_body = step_template.get("body", "")
    template_html = step_template.get("body_html", "")
    template_subject = step_template.get("subject", "")
    ai_meta = campaign.get("ai_meta", {})
    campaign_name = ai_meta.get("service_name", campaign.get("goal", ""))
    campaign_goal = campaign.get("goal", "")
    campaign_tone = campaign.get("tone", "professional")

    from research_worker import get_research, summarize_for_prompt
    sem = asyncio.Semaphore(4)

    async def _generate_one(lid: str):
        async with sem:
            lead = await db.leads.find_one({"id": lid, "workspace_id": wid}, {"_id": 0})
            if not lead:
                return
            lead_context = {k: lead.get(k) for k in ("first_name", "last_name", "title", "company", "email", "linkedin_url")}
            research_pack = await get_research(wid, lead)
            research_summary = summarize_for_prompt(research_pack)

            opener_raw = await _llm_chat(
                "You are Pitch EQ's personalization agent. Generate ONLY a personalized ice-breaker opener. Rules: 1) Use real details from research — never invent. 2) 1-2 sentences max. 3) Conversational, not salesy. 4) No greeting, pitch, or CTA. Return STRICT JSON: {\"opener\": \"...\"}",
                f"LEAD PROFILE:\n{json.dumps(lead_context, indent=2)}\n\nLEAD RESEARCH:\n{research_summary}\n\nCAMPAIGN SERVICE: {campaign_name}\nCAMPAIGN GOAL: {campaign_goal}\nCAMPAIGN TONE: {campaign_tone}\n\nGenerate a personalized ice-breaker opener for this specific lead.",
                f"genall-opnr-{lid[:8]}", user=user, max_tokens=512
            )
            opener_data = _extract_json(opener_raw) or {}
            personalized_opener = opener_data.get("opener", "")

            # Merge opener into template
            merged_body = template_body.replace("{{personalized_opener}}", personalized_opener)
            merged_html = template_html.replace("{{personalized_opener}}", personalized_opener) if template_html else ""

            await db.campaigns.update_one(
                {"id": cid},
                {"$push": {"personalized_emails": {
                    "lead_id": lid, "subject": template_subject,
                    "body": merged_body, "body_html": merged_html,
                    "personalized_opener": personalized_opener,
                    "research": {"summary": research_summary, "has_signal": research_pack.get("has_signal", False)},
                    "status": "draft", "generated_at": now_iso(),
                }}}
            )
            await db.generated_emails.insert_one({
                "id": new_id(), "workspace_id": wid,
                "campaign_id": cid, "lead_id": lid, "step": 0,
                "subject": template_subject,
                "body_html": merged_html, "body_text": merged_body,
                "personalized_opener": personalized_opener,
                "status": "draft", "source": "campaign_generation",
                "generated_at": now_iso(), "sent_at": None,
                "campaign_name": campaign.get("name", ""),
                "lead_email": lead.get("email", ""),
                "lead_name": f"{lead.get('first_name', '')} {lead.get('last_name', '')}".strip(),
            })
            results.append(lid)

    outcomes = await asyncio.gather(*(_generate_one(lid) for lid in to_generate), return_exceptions=True)
    for lid, outcome in zip(to_generate, outcomes):
        if isinstance(outcome, Exception):
            errors.append({"lead_id": lid, "error": str(outcome)})
    await _audit(user, "campaign.leads.email_generated_all", {"campaign_id": cid, "count": len(results)})
    return {"generated": len(results), "errors": errors}


@api.delete("/campaigns/{cid}/leads/{lead_id}/email")
async def delete_campaign_lead_email(cid: str, lead_id: str, user=Depends(current_user)):
    """Delete a personalized email for a lead."""
    wid = user["workspace_id"]
    campaign = await db.campaigns.find_one({"id": cid, "workspace_id": wid}, {"_id": 0})
    if not campaign:
        raise HTTPException(404, "not found")
    await db.campaigns.update_one(
        {"id": cid},
        {"$pull": {"personalized_emails": {"lead_id": lead_id}}}
    )
    return {"ok": True}


@api.post("/campaigns/{cid}/leads/batch")
async def add_leads_to_campaign(cid: str, body: Dict[str, Any], user=Depends(current_user)):
    """Add selected lead IDs to a campaign."""
    wid = user["workspace_id"]
    lead_ids = body.get("lead_ids", [])
    if not lead_ids:
        raise HTTPException(400, "No lead IDs provided")
    campaign = await db.campaigns.find_one({"id": cid, "workspace_id": wid}, {"_id": 0})
    if not campaign:
        raise HTTPException(404, "not found")
    existing = set(campaign.get("lead_ids", []))
    new_ids = [lid for lid in lead_ids if lid not in existing]
    if not new_ids:
        return {"added": 0, "message": "All selected leads already in campaign"}
    await db.campaigns.update_one(
        {"id": cid},
        {"$push": {"lead_ids": {"$each": new_ids}}}
    )
    # Tag each lead with the campaign reference
    await db.leads.update_many(
        {"id": {"$in": new_ids}},
        {"$addToSet": {"campaign_ids": cid}}
    )
    # Assign batch numbers for phased generation
    if campaign.get("phased_generation"):
        batch_size = campaign.get("batch_size", 10)
        total = len(campaign.get("lead_ids", [])) + len(new_ids)
        # Compute starting batch for these new leads
        existing_personalized = campaign.get("personalized_emails", [])
        existing_batches = {p["lead_id"]: p.get("batch", 1) for p in existing_personalized}
        start_idx = len(existing_personalized)
        batch_updates = {}
        for i, lid in enumerate(new_ids):
            bn = ((start_idx + i) // batch_size) + 1
            batch_updates[lid] = bn
        # Write batch numbers into a sub-object on the campaign
        for lid, bn in batch_updates.items():
            await db.campaigns.update_one(
                {"id": cid},
                {"$set": {f"lead_batches.{lid}": bn}},
                upsert=True
            )
        return {"added": len(new_ids), "lead_ids": new_ids, "batches": batch_updates}
    return {"added": len(new_ids), "lead_ids": new_ids}


@api.post("/campaigns/{cid}/run-engine")
async def run_campaign_engine(cid: str, user=Depends(current_user)):
    """Start background generation of personalized emails for all leads."""
    if not await _rate_ok(user):
        raise HTTPException(429, "Daily AI quota exceeded")
    wid = user["workspace_id"]
    campaign = await db.campaigns.find_one({"id": cid, "workspace_id": wid}, {"_id": 0})
    if not campaign:
        raise HTTPException(404, "Campaign not found")
    lead_ids = campaign.get("lead_ids", [])
    if not lead_ids:
        raise HTTPException(400, "No leads assigned to campaign. Add leads first.")

    # For phased generation, only include leads in the current batch
    if campaign.get("phased_generation"):
        current_batch = campaign.get("current_batch", 1)
        lead_batches = campaign.get("lead_batches", {})
        batch_lead_ids = [lid for lid in lead_ids if lead_batches.get(lid, 1) == current_batch]
        if not batch_lead_ids:
            raise HTTPException(400, f"Batch {current_batch} has no leads assigned. Advance the batch or disable phased generation.")
        lead_ids = batch_lead_ids

    personalized = campaign.get("personalized_emails", [])
    to_generate = [lid for lid in lead_ids if lid not in {p["lead_id"] for p in personalized}]
    if not to_generate:
        return {"generated": 0, "job_id": "", "message": "All leads already have personalized emails"}

    gen_id = new_id()
    await db.campaigns.update_one({"id": cid}, {"$set": {f"generation_{gen_id}": {"status": "running", "total": len(to_generate), "done": 0, "errors": []}}})
    asyncio.create_task(_run_generation_background(cid, wid, to_generate, campaign, user, gen_id))
    return {"job_id": gen_id, "generating": len(to_generate), "message": f"Generating emails for {len(to_generate)} leads in background"}

async def _run_generation_background(cid: str, wid: str, to_generate: list, campaign: dict, user: dict, gen_id: str):
    """Background task: generate personalized emails, update campaign doc with progress."""
    from research_worker import get_research, summarize_for_prompt
    campaign_steps = campaign.get("steps", [])
    step_template = campaign_steps[0] if campaign_steps else {}
    ai_meta = campaign.get("ai_meta", {})
    campaign_name = ai_meta.get("service_name", campaign.get("goal", ""))
    campaign_goal = campaign.get("goal", "")
    campaign_tone = campaign.get("tone", "professional")
    sem = asyncio.Semaphore(4)
    done_count = 0

    async def _gen_one(lid: str):
        nonlocal done_count
        async with sem:
            try:
                lead = await db.leads.find_one({"id": lid, "workspace_id": wid}, {"_id": 0})
                if not lead:
                    return
                is_template = campaign.get("campaign_type") == "template"
                lead_context = {k: lead.get(k) for k in ("first_name", "last_name", "title", "company", "email", "linkedin_url")}
                if is_template:
                    # Template campaign — no personalized opener, basic merge fields only
                    body = step_template.get("body", "") or ""
                    body_html = step_template.get("body_html", "") or ""
                    await db.campaigns.update_one(
                        {"id": cid},
                        {"$push": {"personalized_emails": {
                            "lead_id": lid, "subject": step_template.get("subject", ""),
                            "body": body, "body_html": body_html,
                            "personalized_opener": "",
                            "status": "draft", "generated_at": now_iso(),
                        }}}
                    )
                else:
                    research_pack = await get_research(wid, lead)
                    research_summary = summarize_for_prompt(research_pack)
                    opener_raw = await _llm_chat(
                        "You are Pitch EQ's personalization agent. Generate ONLY a personalized ice-breaker opener. Rules: 1) Use real details from research — never invent. 2) 1-2 sentences max. 3) Conversational, not salesy. 4) No greeting, pitch, or CTA. Return STRICT JSON: {\"opener\": \"...\"}",
                        f"LEAD PROFILE:\n{json.dumps(lead_context, indent=2)}\n\nLEAD RESEARCH:\n{research_summary}\n\nCAMPAIGN SERVICE: {campaign_name}\nCAMPAIGN GOAL: {campaign_goal}\nCAMPAIGN TONE: {campaign_tone}\n\nGenerate a personalized ice-breaker opener for this specific lead.",
                        f"gen-{lid[:8]}", user=user, max_tokens=512
                    )
                    opener_data = _extract_json(opener_raw) or {}
                    personalized_opener = (opener_data.get("opener", "") or "").strip()
                    merged_body = (step_template.get("body", "") or "").replace("{{personalized_opener}}", personalized_opener)
                    merged_body = re.sub(r"\n{3,}", "\n\n", merged_body)
                    merged_html = (step_template.get("body_html", "") or "").replace("{{personalized_opener}}", personalized_opener) if step_template.get("body_html") else ""
                    await db.campaigns.update_one(
                        {"id": cid},
                        {"$push": {"personalized_emails": {
                            "lead_id": lid, "subject": step_template.get("subject", ""),
                            "body": merged_body, "body_html": merged_html,
                            "personalized_opener": personalized_opener,
                            "research": {"summary": research_summary, "has_signal": research_pack.get("has_signal", False)},
                            "status": "draft", "generated_at": now_iso(),
                        }}}
                    )
            except Exception as ex:
                await db.campaigns.update_one({"id": cid}, {"$push": {f"generation_{gen_id}.errors": {"lead_id": lid, "error": str(ex)}}})
            finally:
                done_count += 1
                await db.campaigns.update_one({"id": cid}, {"$set": {f"generation_{gen_id}.done": done_count}})

    await asyncio.gather(*(_gen_one(lid) for lid in to_generate), return_exceptions=True)
    await db.campaigns.update_one({"id": cid}, {"$set": {f"generation_{gen_id}.status": "complete"}})

@api.get("/campaigns/{cid}/generation-status")
async def campaign_generation_status(cid: str, user=Depends(current_user)):
    """Check the status of a background generation job."""
    campaign = await db.campaigns.find_one({"id": cid, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not campaign:
        raise HTTPException(404, "not found")
    jobs = {k: v for k, v in campaign.items() if k.startswith("generation_")}
    return {"jobs": jobs}


@api.post("/campaigns/{cid}/advance-batch")
async def advance_campaign_batch(cid: str, user=Depends(current_user)):
    """Advance to the next batch in phased generation and generate emails for it."""
    wid = user["workspace_id"]
    campaign = await db.campaigns.find_one({"id": cid, "workspace_id": wid}, {"_id": 0})
    if not campaign:
        raise HTTPException(404, "Campaign not found")
    if not campaign.get("phased_generation"):
        raise HTTPException(400, "Phased generation is not enabled for this campaign")
    current = campaign.get("current_batch", 1)
    next_batch = current + 1
    lead_batches = campaign.get("lead_batches", {})
    lead_ids = campaign.get("lead_ids", [])
    batch_lead_ids = [lid for lid in lead_ids if lead_batches.get(lid, 1) == next_batch]
    if not batch_lead_ids:
        total_batches = 0
        if lead_ids and campaign.get("batch_size", 10) > 0:
            total_batches = (len(lead_ids) + campaign.get("batch_size", 10) - 1) // campaign.get("batch_size", 10)
        if next_batch > total_batches:
            return {"advanced": False, "message": "All batches have been generated — campaign is complete"}
        return {"advanced": False, "message": f"Batch {next_batch} has no leads assigned yet"}
    await db.campaigns.update_one({"id": cid}, {"$set": {"current_batch": next_batch}})
    # Trigger generation for the new batch
    if not await _rate_ok(user):
        raise HTTPException(429, "Daily AI quota exceeded")
    personalized = campaign.get("personalized_emails", [])
    to_generate = [lid for lid in batch_lead_ids if lid not in {p["lead_id"] for p in personalized}]
    if to_generate:
        gen_id = new_id()
        await db.campaigns.update_one({"id": cid}, {"$set": {f"generation_{gen_id}": {"status": "running", "total": len(to_generate), "done": 0, "errors": []}}})
        asyncio.create_task(_run_generation_background(cid, wid, to_generate, campaign, user, gen_id))
        return {"advanced": True, "batch": next_batch, "generating": len(to_generate), "job_id": gen_id}
    return {"advanced": True, "batch": next_batch, "generating": 0, "message": "All leads in this batch already have emails"}


@api.get("/campaigns/{cid}/batch-status")
async def campaign_batch_status(cid: str, user=Depends(current_user)):
    """Get batch generation progress."""
    campaign = await db.campaigns.find_one({"id": cid, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not campaign:
        raise HTTPException(404, "not found")
    batch_size = campaign.get("batch_size", 10)
    phased = campaign.get("phased_generation", False)
    current_batch = campaign.get("current_batch", 1)
    lead_ids = campaign.get("lead_ids", [])
    lead_batches = campaign.get("lead_batches", {})
    personalized = campaign.get("personalized_emails", [])
    personalized_by_lead = {p["lead_id"]: p for p in personalized}

    batches = {}
    for lid in lead_ids:
        bn = lead_batches.get(lid, 1)
        if bn not in batches:
            batches[bn] = {"total": 0, "generated": 0, "approved": 0, "rejected": 0, "draft": 0}
        batches[bn]["total"] += 1
        p = personalized_by_lead.get(lid)
        if p:
            batches[bn]["generated"] += 1
            status = p.get("status", "")
            if status == "approved":
                batches[bn]["approved"] += 1
            elif status == "rejected":
                batches[bn]["rejected"] += 1
            elif status == "draft":
                batches[bn]["draft"] += 1

    total_batches = max(batches.keys()) if batches else 1
    all_approved = all(b["approved"] == b["total"] for b in batches.values()) if batches else False

    return {
        "phased": phased,
        "current_batch": current_batch,
        "total_batches": total_batches,
        "batch_size": batch_size,
        "total_leads": len(lead_ids),
        "batches": batches,
        "all_batches_complete": all_approved and current_batch >= total_batches,
    }


@api.post("/campaigns/{cid}/leads/{lead_id}/regenerate-opener")
async def regenerate_lead_opener(cid: str, lead_id: str, user=Depends(current_user)):
    """Regenerate just the personalized opener for a specific lead."""
    if not await _rate_ok(user):
        raise HTTPException(429, "Daily AI quota exceeded")
    wid = user["workspace_id"]
    campaign = await db.campaigns.find_one({"id": cid, "workspace_id": wid}, {"_id": 0})
    if not campaign:
        raise HTTPException(404, "Campaign not found")
    lead = await db.leads.find_one({"id": lead_id, "workspace_id": wid}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "Lead not found")
    
    # Get existing personalized email to find the research
    personalized = None
    for p in campaign.get("personalized_emails", []):
        if p["lead_id"] == lead_id:
            personalized = p
            break
    
    # Remove old personalized email
    await db.campaigns.update_one(
        {"id": cid},
        {"$pull": {"personalized_emails": {"lead_id": lead_id}}}
    )
    
    # Re-generate using the single-lead endpoint logic
    return await generate_campaign_lead_email(cid, lead_id, user)


@api.post("/campaigns/{cid}/leads/{lead_id}/approve")
async def approve_campaign_lead_email(cid: str, lead_id: str, user=Depends(current_user)):
    """Approve a personalized email for sending."""
    wid = user["workspace_id"]
    campaign = await db.campaigns.find_one({"id": cid, "workspace_id": wid}, {"_id": 0})
    if not campaign:
        raise HTTPException(404, "not found")
    result = await db.campaigns.update_one(
        {"id": cid, "personalized_emails.lead_id": lead_id},
        {"$set": {"personalized_emails.$.status": "approved"}}
    )
    if result.modified_count == 0:
        raise HTTPException(404, "Personalized email not found")
    await _audit(user, "campaign.lead.email_approved", {"campaign_id": cid, "lead_id": lead_id})
    return {"status": "approved"}


@api.post("/campaigns/{cid}/leads/{lead_id}/reject")
async def reject_campaign_lead_email(cid: str, lead_id: str, user=Depends(current_user)):
    """Reject a personalized email."""
    wid = user["workspace_id"]
    campaign = await db.campaigns.find_one({"id": cid, "workspace_id": wid}, {"_id": 0})
    if not campaign:
        raise HTTPException(404, "not found")
    result = await db.campaigns.update_one(
        {"id": cid, "personalized_emails.lead_id": lead_id},
        {"$set": {"personalized_emails.$.status": "rejected"}}
    )
    if result.modified_count == 0:
        raise HTTPException(404, "Personalized email not found")
    await _audit(user, "campaign.lead.email_rejected", {"campaign_id": cid, "lead_id": lead_id})
    return {"status": "rejected"}


@api.post("/campaigns/{cid}/leads/approve-all")
async def approve_all_campaign_emails(cid: str, user=Depends(current_user)):
    """Approve all draft personalized emails in one call."""
    wid = user["workspace_id"]
    campaign = await db.campaigns.find_one({"id": cid, "workspace_id": wid}, {"_id": 0})
    if not campaign:
        raise HTTPException(404, "not found")
    result = await db.campaigns.update_one(
        {"id": cid},
        {"$set": {"personalized_emails.$[elem].status": "approved"}},
        array_filters=[{"elem.status": {"$in": ["draft", None]}}],
    )
    count = result.modified_count
    await _audit(user, "campaign.leads.email_approved_all", {"campaign_id": cid, "count": count})
    return {"approved": count}


@api.post("/campaigns/{cid}/leads/{lead_id}/update-opener")
async def update_lead_opener(cid: str, lead_id: str, body: Dict[str, Any], user=Depends(current_user)):
    """Manually set/update a lead's opener — works even if the lead has never
    been through AI generation. First edit on an ungenerated lead creates a
    draft personalized_emails entry instead of requiring generation first."""
    wid = user["workspace_id"]
    campaign = await db.campaigns.find_one({"id": cid, "workspace_id": wid}, {"_id": 0})
    if not campaign:
        raise HTTPException(404, "Campaign not found")
    if lead_id not in (campaign.get("lead_ids") or []):
        raise HTTPException(404, "Lead not assigned to this campaign")
    new_opener = body.get("opener", "")
    if not new_opener:
        raise HTTPException(400, "opener is required")
    step_template = (campaign.get("steps") or [{}])[0]
    template_subject = step_template.get("subject", "")
    template_body = step_template.get("body", "")
    template_html = step_template.get("body_html", "")
    merged_body = template_body.replace("{{personalized_opener}}", new_opener)
    merged_html = template_html.replace("{{personalized_opener}}", new_opener) if template_html else ""
    result = await db.campaigns.update_one(
        {"id": cid, "personalized_emails.lead_id": lead_id},
        {"$set": {
            "personalized_emails.$.personalized_opener": new_opener,
            "personalized_emails.$.body": merged_body,
            "personalized_emails.$.body_html": merged_html,
            "personalized_emails.$.status": "draft",
        }}
    )
    if result.modified_count == 0:
        # No existing entry for this lead — never AI-generated. Create a
        # manual draft entry instead of requiring generation first.
        entry = {
            "lead_id": lead_id, "subject": template_subject,
            "body": merged_body, "body_html": merged_html,
            "personalized_opener": new_opener, "status": "draft",
            "generated_at": now_iso(), "manual": True,
        }
        result2 = await db.campaigns.update_one(
            {"id": cid, "workspace_id": wid},
            {"$push": {"personalized_emails": entry}},
        )
        if result2.modified_count == 0:
            raise HTTPException(404, "Campaign not found")
    await _audit(user, "campaign.lead.opener_updated", {"campaign_id": cid, "lead_id": lead_id})
    return {"status": "draft", "personalized_opener": new_opener, "body": merged_body}


class BulkStatusIn(BaseModel):
    lead_ids: List[str]
    status: str  # "approved" | "rejected"


@api.post("/campaigns/{cid}/leads/bulk-status")
async def bulk_set_lead_status(cid: str, body: BulkStatusIn, user=Depends(current_user)):
    """Approve/reject a chosen subset of leads in one call — the multi-select
    counterpart to approve-all, for when only some of a batch is ready."""
    if body.status not in ("approved", "rejected"):
        raise HTTPException(400, "status must be 'approved' or 'rejected'")
    if not body.lead_ids:
        raise HTTPException(400, "No leads selected")
    wid = user["workspace_id"]
    campaign = await db.campaigns.find_one({"id": cid, "workspace_id": wid}, {"_id": 0, "personalized_emails": 1})
    if not campaign:
        raise HTTPException(404, "not found")
    id_set = set(body.lead_ids)
    matched = sum(1 for p in campaign.get("personalized_emails", []) if p["lead_id"] in id_set)
    if matched == 0:
        return {"updated": 0}
    await db.campaigns.update_one(
        {"id": cid},
        {"$set": {"personalized_emails.$[elem].status": body.status}},
        array_filters=[{"elem.lead_id": {"$in": body.lead_ids}}],
    )
    await _audit(user, "campaign.leads.bulk_status", {"campaign_id": cid, "count": matched, "status": body.status})
    return {"updated": matched, "status": body.status}


@api.post("/campaigns/{cid}/leads/{lead_id}/send-test")
async def send_test_campaign_email(cid: str, lead_id: str, user=Depends(current_user)):
    """Send the currently resolved preview for one lead to the logged-in
    user's own inbox — through the same transactional send path as booking
    confirmations (real Resend/mailbox if configured, safely mocked and
    recorded otherwise). Free — this is a read-and-verify action, not an
    AI generation."""
    wid = user["workspace_id"]
    campaign = await db.campaigns.find_one({"id": cid, "workspace_id": wid}, {"_id": 0})
    if not campaign:
        raise HTTPException(404, "Campaign not found")
    lead = await db.leads.find_one({"id": lead_id, "workspace_id": wid}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "Lead not found")

    def _resolve(s: str) -> str:
        if not s:
            return s
        for k in ("first_name", "last_name", "company", "title"):
            v = lead.get(k, "")
            if v:
                s = s.replace("{{" + k + "}}", v)
        return s

    personalized = campaign.get("personalized_emails", [])
    entry = next((p for p in personalized if p["lead_id"] == lead_id), None)
    step_template = (campaign.get("steps") or [{}])[0]
    if entry:
        subject = _resolve(entry.get("subject", ""))
        body_html = _resolve(entry.get("body_html", "")) or _resolve(entry.get("body", "")).replace("\n", "<br>")
    else:
        subject = _resolve(step_template.get("subject", ""))
        raw_body = (step_template.get("body", "") or "").replace("{{personalized_opener}}", "")
        body_html = _resolve(step_template.get("body_html", "") or raw_body.replace("\n", "<br>"))

    import email_client
    banner = (
        f"<p style='color:#8E8E93;font-size:12px;margin:0 0 16px'>"
        f"Test send — previewing the email {lead.get('first_name', '')} {lead.get('last_name', '')} "
        f"would receive.</p>"
    )
    result = await email_client.send_email(
        to=user["email"], subject=f"[TEST] {subject}", html=banner + body_html, workspace_id=wid,
    )
    await _audit(user, "campaign.lead.test_sent", {"campaign_id": cid, "lead_id": lead_id, "mocked": result.get("mocked")})
    return {"sent_to": user["email"], "mocked": result.get("mocked", True)}


@api.post("/campaigns/{cid}/leads/regenerate-all")
async def regenerate_all_lead_emails(cid: str, user=Depends(current_user)):
    """Re-run AI personalization for every assigned lead, including ones
    already personalized — for when the template changed and existing
    drafts are stale. generate-all deliberately skips already-done leads;
    this is the explicit "start over" action."""
    wid = user["workspace_id"]
    campaign = await db.campaigns.find_one({"id": cid, "workspace_id": wid}, {"_id": 0})
    if not campaign:
        raise HTTPException(404, "not found")
    service_info = {}
    service_id = campaign.get("ai_meta", {}).get("service_id") or campaign.get("service_id")
    if service_id:
        svc = await db.service_library.find_one({"id": service_id, "workspace_id": wid}, {"_id": 0})
        if svc:
            service_info = {k: v for k, v in svc.items() if k not in ("id", "workspace_id", "created_at", "updated_at", "status", "_id")}
    lead_ids = campaign.get("lead_ids", [])
    if not lead_ids:
        return {"generated": 0, "message": "No leads assigned"}
    campaign_steps = campaign.get("steps", [])
    step_template = campaign_steps[0] if campaign_steps else {}
    template_body = step_template.get("body", "")
    template_html = step_template.get("body_html", "")
    template_subject = step_template.get("subject", "")
    ai_meta = campaign.get("ai_meta", {})
    campaign_name = ai_meta.get("service_name", campaign.get("goal", ""))
    campaign_goal = campaign.get("goal", "")
    campaign_tone = campaign.get("tone", "professional")

    from research_worker import get_research, summarize_for_prompt
    sem = asyncio.Semaphore(4)
    errors = []

    async def _regenerate_one(lid: str):
        async with sem:
            try:
                lead = await db.leads.find_one({"id": lid, "workspace_id": wid}, {"_id": 0})
                if not lead:
                    return
                lead_context = {k: lead.get(k) for k in ("first_name", "last_name", "title", "company", "email", "linkedin_url")}
                research_pack = await get_research(wid, lead)
                research_summary = summarize_for_prompt(research_pack)
                opener_raw = await _llm_chat(
                    "You are Pitch EQ's personalization agent. Generate ONLY a personalized ice-breaker opener. Rules: 1) Use real details from research — never invent. 2) 1-2 sentences max. 3) Conversational, not salesy. 4) No greeting, pitch, or CTA. Return STRICT JSON: {\"opener\": \"...\"}",
                    f"LEAD PROFILE:\n{json.dumps(lead_context, indent=2)}\n\nLEAD RESEARCH:\n{research_summary}\n\nCAMPAIGN SERVICE: {campaign_name}\nCAMPAIGN GOAL: {campaign_goal}\nCAMPAIGN TONE: {campaign_tone}\n\nGenerate a personalized ice-breaker opener for this specific lead.",
                    f"regenall-opnr-{lid[:8]}", user=user, max_tokens=512
                )
                opener_data = _extract_json(opener_raw) or {}
                personalized_opener = opener_data.get("opener", "")
                merged_body = template_body.replace("{{personalized_opener}}", personalized_opener)
                merged_html = template_html.replace("{{personalized_opener}}", personalized_opener) if template_html else ""

                entry = {
                    "lead_id": lid, "subject": template_subject,
                    "body": merged_body, "body_html": merged_html,
                    "personalized_opener": personalized_opener,
                    "research": {"summary": research_summary, "has_signal": research_pack.get("has_signal", False)},
                    "status": "draft", "generated_at": now_iso(),
                }
                # Overwrite in place if this lead already has an entry, otherwise append.
                result = await db.campaigns.update_one(
                    {"id": cid, "personalized_emails.lead_id": lid},
                    {"$set": {
                        "personalized_emails.$.subject": entry["subject"],
                        "personalized_emails.$.body": entry["body"],
                        "personalized_emails.$.body_html": entry["body_html"],
                        "personalized_emails.$.personalized_opener": entry["personalized_opener"],
                        "personalized_emails.$.research": entry["research"],
                        "personalized_emails.$.status": "draft",
                        "personalized_emails.$.generated_at": entry["generated_at"],
                    }},
                )
                if result.modified_count == 0:
                    await db.campaigns.update_one({"id": cid}, {"$push": {"personalized_emails": entry}})
            except Exception as ex:
                errors.append({"lead_id": lid, "error": str(ex)})

    await asyncio.gather(*[_regenerate_one(lid) for lid in lead_ids])
    await _audit(user, "campaign.leads.regenerated_all", {"campaign_id": cid, "count": len(lead_ids) - len(errors)})
    return {"generated": len(lead_ids) - len(errors), "errors": errors}


@api.post("/upload-image")
async def upload_image(file: UploadFile = File(...), user=Depends(current_user)):
    ALLOWED = {"image/png", "image/jpeg", "image/gif", "image/webp"}
    if file.content_type not in ALLOWED:
        raise HTTPException(400, "Only PNG, JPEG, GIF, WebP allowed")
    data = await file.read()
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(400, "Image too large (max 5 MB)")
    image_id = new_id()
    access_token = _secrets.token_urlsafe(24)
    await db.uploaded_images.insert_one({
        "id": image_id,
        "workspace_id": user["workspace_id"],
        "created_by": user["id"],
        "data": data,
        "mime_type": file.content_type,
        "access_token": access_token,
        "created_at": now_iso(),
    })
    base = (PUBLIC_BASE_URL or FRONTEND_URL).rstrip("/")
    return {
        "image_id": image_id,
        "image_url": f"{base}/api/image/{image_id}?t={access_token}",
    }


@api.get("/image/{image_id}")
async def serve_image(image_id: str, t: str = None,
                      user: Optional[Dict] = Depends(current_user_optional)):
    doc = await db.uploaded_images.find_one({"id": image_id})
    if not doc:
        raise HTTPException(404, "image not found")
    authed = (user and user.get("workspace_id") == doc.get("workspace_id"))
    token_match = t and t == doc.get("access_token")
    if not authed and not token_match:
        raise HTTPException(403, "forbidden")
    return Response(content=doc["data"], media_type=doc.get("mime_type", "image/png"),
                    headers={"Cache-Control": "public, max-age=31536000, immutable"})


# ----------------------------- Signature Management ----------------------------
@api.post("/signatures")
async def create_signature(body: SignatureIn, user=Depends(current_user)):
    sig = body.model_dump()
    sig.update({
        "id": new_id(),
        "workspace_id": user["workspace_id"],
        "created_at": now_iso(),
    })
    await db.signatures.insert_one(sig)
    sig.pop("_id", None)
    return sig


@api.get("/signatures")
async def list_signatures(user=Depends(current_user)):
    sigs = await db.signatures.find(
        {"workspace_id": user["workspace_id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return sigs


@api.delete("/signatures/{sid}")
async def delete_signature(sid: str, user=Depends(current_user)):
    result = await db.signatures.delete_one({"id": sid, "workspace_id": user["workspace_id"]})
    if result.deleted_count == 0:
        raise HTTPException(404, "Signature not found")
    return {"ok": True}


# ---- Open / click tracking (PUBLIC — called by the recipient's mail client) ----
_PIXEL = base64.b64decode(
    b"R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
)


@api.get("/t/o/{queue_id}")
@limiter.limit("60/minute")
async def track_open(request: Request, queue_id: str):
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
@limiter.limit("60/minute")
async def track_click(request: Request, queue_id: str, u: str = ""):
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


# ----------------------------- CRM (deals) ------------------------------------
# Moved to crm.py (mounted below), STAGES re-exported from there for voice_eq.py.


# ----------------------------- AI --------------------------------------------
# ----------------------------- AI --------------------------------------------
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = "claude-sonnet-4-6"
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
PERPLEXITY_API_KEY = os.environ.get("PERPLEXITY_API_KEY", "")
if PERPLEXITY_API_KEY:
    ANTHROPIC_API_KEY = PERPLEXITY_API_KEY
PERPLEXITY_MODEL = "sonar-pro"


def _fix_json(candidate: str) -> Optional[Dict[str, Any]]:
    """Parse LLM JSON with state-machine repair for common LLM errors:
    - single-quoted strings
    - missing opening quotes on string values
    - stray quotes after numbers
    - trailing/double commas
    """
    if not candidate:
        return None
    try:
        return json.loads(candidate)
    except Exception:
        pass
    fixed = _walk_and_fix(candidate)
    fixed = re.sub(r'(?<=[0-9])"(?=\s*[,}\]\n])', '', fixed)
    fixed = re.sub(r',\s*([}\]])', r'\1', fixed)
    fixed = re.sub(r',{2,}', ',', fixed)
    try:
        return json.loads(fixed)
    except json.JSONDecodeError:
        pass
    # Final fallback — try the brace block alone
    m = re.search(r"\{[\s\S]*\}", candidate)
    if m:
        block = _walk_and_fix(m.group(0))
        block = re.sub(r'(?<=[0-9])"(?=\s*[,}\]\n])', '', block)
        block = re.sub(r',\s*([}\]])', r'\1', block)
        block = re.sub(r',{2,}', ',', block)
        try:
            return json.loads(block)
        except Exception:
            pass
    return None


def _walk_and_fix(text: str) -> str:
    """State-machine that walks char-by-char tracking string boundaries."""
    out = []
    i, n = 0, len(text)
    in_string = in_single = escape = False
    need_string_value = False
    while i < n:
        ch = text[i]
        if escape:
            out.append(ch); escape = False; i += 1; continue
        if ch == '\\' and in_string:
            escape = True; out.append(ch); i += 1; continue
        if in_string:
            if in_single:
                if ch == "'":
                    out.append('"'); in_string = in_single = False
                else:
                    out.append(ch)
            else:
                if ch == '"':
                    out.append('"'); in_string = False
                else:
                    out.append(ch)
            i += 1; continue
        if ch == '"':
            in_string = True; out.append('"'); need_string_value = False
        elif ch == "'":
            prev = text[max(0,i-20):i].rstrip()
            if prev and prev[-1] in ':,([]{':
                in_string = True; in_single = True; out.append('"')
            else:
                out.append("'")
            need_string_value = False
        elif ch == ':':
            out.append(':'); need_string_value = True
        elif need_string_value:
            if ch in ' \t\n\r':
                out.append(ch)
            elif ch in '{}[]"\'0123456789-tfn':
                out.append(ch); need_string_value = False
            else:
                out.append('"' + ch); in_string = True; need_string_value = False
        else:
            out.append(ch)
        i += 1
    return ''.join(out)


def _extract_json(text: str) -> Optional[Dict[str, Any]]:
    """Pull the first JSON object out of an LLM response."""
    if not text:
        return None
    m = re.search(r"\{[\s\S]*\}", text)
    if not m:
        return None
    return _fix_json(m.group(0))


async def _llm_chat(system: str, user_text: str, session_id: str, user: Optional[Dict[str, Any]] = None, max_tokens: int = 2048) -> str:
    if not PERPLEXITY_API_KEY:
        raise RuntimeError("PERPLEXITY_API_KEY not configured")
    if user and not await _rate_ok(user):
        raise RuntimeError("daily LLM quota exceeded")
    import openai
    client = openai.AsyncOpenAI(api_key=PERPLEXITY_API_KEY, base_url="https://api.perplexity.ai")
    last_err = None
    for attempt in range(3):
        try:
            resp = await client.chat.completions.create(
                model=PERPLEXITY_MODEL,
                max_tokens=max_tokens,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user_text},
                ],
            )
            return resp.choices[0].message.content or ""
        except openai.RateLimitError as ex:
            last_err = ex
            await asyncio.sleep(2 ** attempt)
        except Exception as ex:
            raise RuntimeError(f"LLM call failed: {ex}") from ex
    raise RuntimeError(f"LLM call failed after retries: {last_err}")


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
        ws = await db.workspaces.find_one({"id": user["workspace_id"]}, {"_id": 0, "brand_voice": 1})
        bv = (ws or {}).get("brand_voice") or {}
        # Describe the SENDER's own business, not this SaaS tool — pulled from the
        # workspace's brand voice (set at onboarding or in Settings), never
        # hardcoded to "Pitch EQ" like this prompt used to be.
        sender_offer = bv.get("offer", "").strip() or (
            "No specific offer is configured for this workspace yet — write generically "
            "about helping the lead's team without inventing specific product claims."
        )
        icp_line = f"\nTarget customer profile: {bv.get('icp_description')}" if bv.get("icp_description") else ""
        system = (
            "You are an outbound copywriter for B2B cold email, writing on behalf of the "
            "sender's own business (described below) — not on behalf of any email tool. "
            "Write ONE email tailored to the lead. Be warm, specific, and human. "
            "Under 120 words. One clear low-friction ask. No spammy words, no ALL-CAPS, no exclamation marks. "
            "Return STRICT JSON only: {\"subject\": str, \"body\": str}."
        )
        instructions = (body.template or "").strip() or "Book a 15-minute intro call."
        user_text = (
            f"Lead: {json.dumps({k: lead.get(k) for k in ('first_name','last_name','title','company','linkedin')}, ensure_ascii=False)}\n"
            f"Tone: {body.tone}\n"
            f"Sender's offer: {sender_offer}{icp_line}\n"
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


# Demo-data self-service seeding (POST /demo/seed) was removed — the demo
# account (demo@innoira.com) is now hand-curated with realistic data across
# every agent instead of a generic one-click Pitch-EQ-only sample.


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
    business_summary: str = ""
    services: List[str] = []
    answers: Dict[str, str] = {}


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

    patch = {"onboarded": True}
    # Persist what onboarding learned about the customer's own business onto the
    # workspace, so every other agent (personalize, proposals, EQ score hints) can
    # draw on it instead of falling back to language that describes this SaaS
    # itself. Only set fields the user actually filled in — don't clobber a value
    # someone later edited by hand in Settings with a blank re-run.
    if body.business_summary.strip():
        patch["brand_voice.offer"] = body.business_summary.strip()
    if body.answers:
        icp = " ".join(v.strip() for v in body.answers.values() if v and v.strip())
        if icp:
            patch["brand_voice.icp_description"] = icp
    await db.workspaces.update_one({"id": user["workspace_id"]}, {"$set": patch})
    return {"ok": True, "campaign_ids": saved}


# ----------------------------- Brand voice (company profile) -----------------
class BrandVoiceIn(BaseModel):
    tone: str = "warm"
    offer: str = ""
    icp_description: str = ""
    banned_phrases: List[str] = []
    sample: str = ""


@api.get("/workspace/brand-voice")
async def get_brand_voice(user=Depends(current_user)):
    ws = await db.workspaces.find_one({"id": user["workspace_id"]}, {"_id": 0, "brand_voice": 1})
    bv = (ws or {}).get("brand_voice") or {}
    return {
        "tone": bv.get("tone", "warm"), "offer": bv.get("offer", ""),
        "icp_description": bv.get("icp_description", ""),
        "banned_phrases": bv.get("banned_phrases", []), "sample": bv.get("sample", ""),
    }


@api.put("/workspace/brand-voice")
async def update_brand_voice(body: BrandVoiceIn, user=Depends(current_user)):
    """The single real source of truth every agent's LLM prompt should draw the
    customer's own offer/ICP/tone from — replaces the old dead schema that had
    no editable UI and was never read back anywhere except a fallback that
    could never fire."""
    await db.workspaces.update_one(
        {"id": user["workspace_id"]},
        {"$set": {"brand_voice": body.model_dump()}},
    )
    await _audit(user, "brand_voice.update", {})
    return body.model_dump()


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
    seniority: List[str] = []
    keywords: List[str] = []
    domain: Optional[str] = None
    limit: int = 25
    include_mobile: bool = False


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
    return ""


@api.post("/prospect/search")
async def prospect_search(body: ProspectSearchIn, user=Depends(current_user)):
    from billing import check_credits, charge_credits
    await check_credits(user["workspace_id"], "lead_enrichment")
    # Merge ICP + free-form filters
    filters = body.model_dump()
    if body.icp_id:
        icp = await db.icps.find_one({"id": body.icp_id, "workspace_id": user["workspace_id"]}, {"_id": 0})
        if icp:
            for k in ("titles", "industries", "locations", "company_sizes", "seniority", "keywords"):
                filters[k] = list({*(filters.get(k) or []), *(icp.get(k) or [])})

    domain = _resolve_domain_from_keywords(filters["keywords"], body.domain)
    try:
        prospects = await lead_sources.person_search(
            domain=domain,
            titles=filters.get("titles"),
            locations=filters.get("locations"),
            industries=filters.get("industries"),
            company_sizes=filters.get("company_sizes"),
            seniority=filters.get("seniority"),
            include_mobile=body.include_mobile,
            limit=body.limit,
        )
    except lead_sources.ProviderError as ex:
        msg = str(ex)
        # Map Prospeo error codes to user-friendly messages
        if "NO_RESULTS" in msg:
            raise HTTPException(404, "No results found for the given filters. Try broadening your search.")
        if "INVALID_FILTERS" in msg:
            raise HTTPException(422, "One or more filter values are invalid. Check titles, locations, and seniority values.")
        if "INSUFFICIENT_CREDITS" in msg:
            from billing import get_balance
            bal = await get_balance(user["workspace_id"])
            raise HTTPException(402, {
                "error": "insufficient_credits", "action": "lead_enrichment",
                "needed": 5, "balance": bal,
            })
        if "INVALID_API_KEY" in msg:
            raise HTTPException(502, "Lead provider API key is invalid. Contact support.")
        if "PLAN_REQUIRED" in msg or "company_industry" in msg:
            raise HTTPException(422, "Some filters require a higher Prospeo plan. Try using fewer or simpler filters.")
        raise HTTPException(502, f"Search failed: {str(ex)[:200]}")

    # Verify in-flight with Icypeas (preferred for email verification).
    # Batch-verify concurrently — sequential verification of 25 prospects would
    # take minutes even with the per-call concurrency semaphore.
    emails = [(i, p.get("email")) for i, p in enumerate(prospects) if p.get("email")]
    if emails:
        indices = [e[0] for e in emails]
        addrs = [e[1] for e in emails]
        results = await lead_sources.verify_many(addrs)
        for idx, v in zip(indices, results):
            prospects[idx]["verification"] = v
            prospects[idx]["verified"] = v.get("status") == "valid"

    # Enrichment is billed per contact actually returned — the third-party lookup
    # cost is already incurred by this point, so it settles even if it overdraws.
    if prospects:
        await charge_credits(user["workspace_id"], "lead_enrichment", units=len(prospects),
                              meta={"domain": domain, "contacts": len(prospects)},
                              allow_overdraft=True)

    return {
        "filters": filters,
        "prospects": prospects,
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
                    json.dumps({k: p.get(k) for k in ("first_name","last_name","title","company","domain","linkedin_url")}),
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

        doc = {
            "id": new_id(), "workspace_id": wid,
            "first_name": p.get("first_name", ""),
            "last_name": p.get("last_name", ""),
            "email": email,
            "phone": p.get("phone", ""),
            "company": p.get("company", ""),
            "title": p.get("title", ""),
            "headline": p.get("headline", ""),
            "linkedin_url": p.get("linkedin_url", ""),
            "company_website": p.get("company_website", ""),
            "company_industry": p.get("company_industry", ""),
            "company_size": p.get("company_size", ""),
            "company_description": p.get("company_description", ""),
            "company_logo": p.get("company_logo", ""),
            "location": p.get("location", {}),
            "skills": p.get("skills", []),
            "tags": ["imported"],
            "status": "new",
            "verified": (p.get("verification") or {}).get("status") == "valid",
            "verification": p.get("verification"),
            "icebreaker": icebreaker,
            "persona_hypothesis": p.get("persona_hypothesis", ""),
            "source": "imported",
            "created_at": now_iso(),
        }
        await db.leads.insert_one(doc)
        added += 1
    await _audit(user, "prospect.import", {"added": added, "skipped": skipped})
    return {"added": added, "skipped": skipped}


@api.get("/prospect/providers")
async def prospect_providers(user=Depends(current_user)):
    return {"search": "enabled", "verify": "enabled"}


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
    source_url: Optional[str] = None


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
    source_summary = ""
    if body.source_url:
        try:
            from company_intel import _deep_crawl
            pages = await _deep_crawl(body.source_url, max_pages=10)
            if pages:
                snippet = " ".join(p.get("text", "")[:2000] for p in pages if p.get("text"))
                source_summary = f"\n\nSource URL content summary:\n{snippet[:6000]}"
        except Exception as ex:
            logging.warning("source_url crawl error: %s", ex)
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
        user_text = f"Topic: {body.topic}{source_summary}"
        try:
            resp = await _llm_chat(system, user_text, f"creq-gen-{user['id']}", user=user)
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


async def generate_ai_image(user: Dict[str, Any], prompt: str, provider: str = "nano-banana",
                            size: Optional[str] = "1080x1350", aspect: Optional[str] = "portrait") -> Dict[str, Any]:
    """Core image-gen call: charges credits, rate-checks, calls the provider,
    returns raw bytes + mime type. Shared by the /carousel/ai-image route
    (which base64-encodes the result for the canvas) and social_eq.py's
    bulk-import pipeline (which writes the bytes straight to disk for
    Instagram's publicly-fetchable-URL requirement) — one generation path,
    two consumers, instead of duplicating the OpenAI/Gemini calls."""
    prompt = (prompt or "").strip()
    if not prompt:
        raise HTTPException(400, "prompt is required")

    provider = (provider or "nano-banana").lower()
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
            img_bytes = base64.b64decode(resp.data[0].b64_json)
            await _audit(user, "ai_image.generate", {"provider": "gpt-image-1", "prompt": prompt[:120]})
            return {"image_bytes": img_bytes, "mime_type": "image/png", "provider": "gpt-image-1"}
        except HTTPException:
            raise
        except Exception as ex:
            logging.warning("gpt-image-1 gen error: %s", ex)
            raise HTTPException(502, f"gpt-image-1 failed: {ex}")

    # default: Gemini Nano Banana
    try:
        req_w, req_h = 1080, 1350
        if size and "x" in size:
            try:
                w_str, h_str = size.lower().split("x", 1)
                req_w, req_h = int(w_str), int(h_str)
            except ValueError:
                pass
        aspect_ratio = _closest_gemini_aspect(req_w, req_h)
        style_hint = f"Composition: {size} {aspect}, high quality, suitable for a social media carousel."
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
        if not isinstance(img_bytes, (bytes, bytearray)):
            img_bytes = base64.b64decode(img_bytes)
        await _audit(user, "ai_image.generate", {"provider": "nano-banana", "prompt": prompt[:120]})
        return {"image_bytes": bytes(img_bytes), "mime_type": mime_type, "provider": "nano-banana"}
    except HTTPException:
        raise
    except Exception as ex:
        logging.warning("nano-banana gen error: %s", ex)
        raise HTTPException(502, f"nano-banana failed: {ex}")


@api.post("/carousel/ai-image")
async def carousel_ai_image(body: AiImageIn, user=Depends(current_user)):
    """Generate an AI image, save to MongoDB as binary, return both a
    reference URL (for persistent use) and a base64 data URL (for immediate
    preview).  The reference URL includes a short-lived access_token so the
    image renders in plain <img> tags on the canvas without auth headers."""
    result = await generate_ai_image(user, body.prompt, body.provider, body.size, body.aspect)
    image_id = new_id()
    access_token = _secrets.token_urlsafe(24)
    await db.carousel_images.insert_one({
        "id": image_id,
        "workspace_id": user["workspace_id"],
        "created_by": user["id"],
        "data": result["image_bytes"],
        "mime_type": result["mime_type"],
        "provider": result["provider"],
        "prompt": body.prompt,
        "size": body.size,
        "aspect": body.aspect,
        "access_token": access_token,
        "created_at": now_iso(),
    })
    base = (PUBLIC_BASE_URL or FRONTEND_URL).rstrip("/")
    return {
        "image_id": image_id,
        "image_url": f"{base}/api/carousel/image/{image_id}?t={access_token}",
        "image_base64": base64.b64encode(result["image_bytes"]).decode("utf-8"),
        "mime_type": result["mime_type"],
        "provider": result["provider"],
    }


@api.get("/carousel/image/{image_id}")
async def carousel_image_get(image_id: str, t: Optional[str] = None,
                             user: Optional[Dict[str, Any]] = Depends(current_user_optional)):
    """Serve a saved carousel image by ID.
    Access is allowed either via:
    - authenticated user in the same workspace (Authorization header), or
    - a valid ?t=access_token query parameter (for direct <img> rendering)."""
    doc = await db.carousel_images.find_one({"id": image_id})
    if not doc:
        raise HTTPException(404, "image not found")
    authed = (user and user.get("workspace_id") == doc.get("workspace_id"))
    token_match = t and t == doc.get("access_token")
    if not authed and not token_match:
        raise HTTPException(403, "forbidden")
    from fastapi.responses import Response
    return Response(
        content=doc["data"],
        media_type=doc.get("mime_type", "image/png"),
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )


@api.get("/carousel/images")
async def carousel_images_list(user=Depends(current_user)):
    """List all AI-generated images for the user's workspace."""
    cursor = db.carousel_images.find(
        {"workspace_id": user["workspace_id"]},
        {"data": 0, "_id": 0},
    ).sort("created_at", -1).limit(200)
    items = await cursor.to_list(None)
    base = (PUBLIC_BASE_URL or FRONTEND_URL).rstrip("/")
    for item in items:
        item["image_url"] = f"{base}/api/carousel/image/{item['id']}?t={item.get('access_token', '')}"
    return items


@api.delete("/carousel/image/{image_id}")
async def carousel_image_delete(image_id: str, user=Depends(current_user)):
    """Delete a generated image."""
    doc = await db.carousel_images.find_one({"id": image_id, "workspace_id": user["workspace_id"]})
    if not doc:
        raise HTTPException(404, "image not found")
    await db.carousel_images.delete_one({"id": image_id})
    return {"ok": True}


# ----------------------------- Webhooks: Airtable / Notion → Carousel -------


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
@limiter.limit("20/minute")
async def webhook_carousel(request: Request, token: str, payload: Dict[str, Any]):
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



# ----------------------------- Quarantine helpers -----------------------------
# The dead, unused, unbilled `/leads/{id}/research` route that used to live here
# was removed — LeadDetail.jsx actually calls Pitch EQ's `/pitch-eq/leads/{id}/
# research` + `/enrich` (pitch_eq.py), a completely separate, real implementation.
# `GET /quarantine` moved to crm.py; these two helpers stay here since sender.py
# imports them directly from server.
def _verify_email_syntax(email: str) -> bool:
    return bool(re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", email or ""))


async def _quarantine_lead(wid: str, lead: Dict[str, Any], reason: str):
    await db.quarantine.insert_one({
        "id": new_id(), "workspace_id": wid, "lead_id": lead.get("id"),
        "email": lead.get("email"), "reason": reason, "at": now_iso(),
    })


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


@api.get("/search")
async def global_search(q: str = "", user=Depends(current_user)):
    """Cross-agent search for the suite's Cmd+K palette — leads, campaigns,
    social posts, bookings, proposals, and Create EQ projects, fanned out to
    each agent's own collection rather than a new search index."""
    q = (q or "").strip()
    if len(q) < 2:
        return []
    wid = user["workspace_id"]
    rx = {"$regex": re.escape(q), "$options": "i"}
    results: List[Dict[str, Any]] = []

    for l in await db.leads.find(
        {"workspace_id": wid, "$or": [{"first_name": rx}, {"last_name": rx}, {"email": rx}, {"company": rx}]},
        {"_id": 0, "id": 1, "first_name": 1, "last_name": 1, "company": 1, "email": 1},
    ).to_list(8):
        title = f"{l.get('first_name','')} {l.get('last_name','')}".strip() or l.get("email", "Lead")
        results.append({"type": "lead", "id": l["id"], "title": title,
                         "subtitle": l.get("company") or l.get("email") or "Lead",
                         "url": f"/app/crm/leads/{l['id']}"})

    for c in await db.campaigns.find(
        {"workspace_id": wid, "name": rx}, {"_id": 0, "id": 1, "name": 1},
    ).to_list(8):
        results.append({"type": "campaign", "id": c["id"], "title": c["name"], "subtitle": "Campaign",
                         "url": f"/app/campaigns/{c['id']}"})

    for p in await db.social_posts.find(
        {"workspace_id": wid, "$or": [{"headline": rx}, {"topic": rx}]},
        {"_id": 0, "id": 1, "headline": 1, "topic": 1, "platform": 1},
    ).to_list(8):
        results.append({"type": "post", "id": p["id"], "title": p.get("headline") or p.get("topic") or "Post",
                         "subtitle": f"Social · {p.get('platform','')}".rstrip(" ·"),
                         "url": "/app/social-eq/queue"})

    for b in await db.bookings.find(
        {"workspace_id": wid, "$or": [{"guest_name": rx}, {"guest_email": rx}]},
        {"_id": 0, "id": 1, "guest_name": 1, "guest_email": 1},
    ).to_list(8):
        results.append({"type": "booking", "id": b["id"], "title": b.get("guest_name") or b.get("guest_email") or "Booking",
                         "subtitle": "Booking", "url": "/app/schedule-eq/bookings"})

    for p in await db.proposals.find(
        {"workspace_id": wid, "title": rx}, {"_id": 0, "id": 1, "title": 1},
    ).to_list(8):
        results.append({"type": "proposal", "id": p["id"], "title": p["title"], "subtitle": "Proposal",
                         "url": f"/app/proposal-eq/{p['id']}"})

    for c in await db.carousels.find(
        {"workspace_id": wid, "name": rx}, {"_id": 0, "id": 1, "name": 1},
    ).to_list(8):
        results.append({"type": "project", "id": c["id"], "title": c["name"], "subtitle": "Create EQ project",
                         "url": f"/app/create-eq/{c['id']}"})

    return results[:40]


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
# crm's STAGES must be imported before voice_eq (which does `from server import
# ..., STAGES, ...` at its own module scope) — otherwise voice_eq's import of a
# still-partially-initialized `server` module would fail to find STAGES.
from crm import crm_router, STAGES
from voice_eq import voice_router, voice_public_router
from voice_ws_bridge import voice_ws_router
from voice_google_provider import voice_google_router
from schedule_eq import schedule_router, schedule_public_router
from proposal_eq import proposal_router
from social_eq import social_router, social_public_router
from site_eq import site_router, site_public_router
from billing import billing_router, billing_public_router
from pitch_eq import pitch_router, pitch_public_router
from company_intel import router as company_intel_router
from service_library import router as service_library_router
from campaign_engine import router as campaign_engine_router
from sms_eq import sms_router, sms_public_router
from whatsapp_eq import whatsapp_router, whatsapp_public_router
from hrms_eq import hrms_router
from accounting_eq import accounting_router
api.include_router(pitch_router)
api.include_router(crm_router)
api.include_router(pitch_public_router)
api.include_router(voice_router)
api.include_router(voice_public_router)
api.include_router(voice_ws_router)
api.include_router(voice_google_router)
api.include_router(schedule_router)
api.include_router(schedule_public_router)
api.include_router(proposal_router)
api.include_router(social_router)
api.include_router(social_public_router)
api.include_router(site_router)
api.include_router(site_public_router)
api.include_router(billing_router)
api.include_router(billing_public_router)
api.include_router(company_intel_router)
api.include_router(service_library_router)
api.include_router(campaign_engine_router)
api.include_router(sms_router)
api.include_router(sms_public_router)
api.include_router(whatsapp_router)
api.include_router(whatsapp_public_router)
api.include_router(hrms_router)
api.include_router(accounting_router)

# ── Lead Intelligence Provider Manager ──────────────────────────────
from lead_intelligence import ProviderManager, ProspeoAdapter, IcypeasAdapter
from lead_intelligence.schema import UnifiedSearchFilters, RevealRequest
lead_manager = ProviderManager(db=db)
lead_manager.register(ProspeoAdapter(db=db))
lead_manager.register(IcypeasAdapter(db=db))


@api.post("/lead-intelligence/search")
async def li_search(body: dict, user=Depends(current_user)):
    filters = UnifiedSearchFilters(**body)
    from billing import check_credits
    await check_credits(user["workspace_id"], "lead_enrichment")
    result = await lead_manager.search(
        filters, workspace_id=user["workspace_id"], user_id=user.get("id", ""),
    )
    if result and result.leads:
        from lead_intelligence.schema import LeadRecord
        lead_records = []
        for l in result.leads:
            if isinstance(l, dict):
                lead_records.append(LeadRecord(**l))
            else:
                lead_records.append(l)
        await lead_manager.import_leads(
            lead_records, workspace_id=user["workspace_id"],
            user_id=user.get("id", ""),
            merge_strategy="skip",
            request_id=result.search_id or "",
        )
    return result.model_dump(mode="json")


@api.post("/lead-intelligence/reveal/estimate")
async def li_reveal_estimate(body: dict, user=Depends(current_user)):
    req = RevealRequest(**body)
    est = await lead_manager.estimate_reveal_cost(req, workspace_id=user["workspace_id"])
    return est.model_dump()


@api.post("/lead-intelligence/reveal")
async def li_reveal(body: dict, user=Depends(current_user)):
    req = RevealRequest(**body)
    from billing import check_credits, charge_credits
    est = await lead_manager.estimate_reveal_cost(req, workspace_id=user["workspace_id"])
    if est.total_credits > 0:
        await check_credits(user["workspace_id"], "lead_reveal", units=est.total_credits)
    results = await lead_manager.reveal_leads(
        req, workspace_id=user["workspace_id"], user_id=user.get("id", ""),
    )
    if est.total_credits > 0:
        await charge_credits(user["workspace_id"], "lead_reveal", units=est.total_credits, allow_overdraft=False)
    return [r.model_dump() for r in results]


def _normalize_lead(d):
    """Convert flat lead dict to nested LeadRecord-compatible dict."""
    person_fields = ["first_name","last_name","full_name","title","headline","seniority","department","management_level"]
    company_fields = ["name","domain","website","industry","founded_year"]
    contact_fields = ["email","phone","linkedin_url","email_status","phone_status"]
    loc_fields = ["country","state","city","zip","region","timezone"]

    def _pick(src, keys, target=None):
        t = {} if target is None else target
        for k in keys:
            if k in src and src[k] not in (None, "", []):
                t[k] = src[k]
        return t

    person = _pick(d, person_fields)
    company = _pick(d, company_fields)
    contact = _pick(d, contact_fields)

    for flat, nested in [("company_name","name"),("company_domain","domain"),
                          ("company_industry","industry")]:
        if flat in d and d[flat] not in (None, "", []):
            company[nested] = d[flat]

    # company_size -> employee_count: only if parseable as int
    if "company_size" in d and d["company_size"] not in (None, "", []):
        try:
            company["employee_count"] = int(d["company_size"])
        except (ValueError, TypeError):
            # Try extracting first number from ranges like "50-200"
            import re as _re
            m = _re.search(r"\d+", str(d["company_size"]))
            if m:
                company["employee_count"] = int(m.group())

    location = _pick(d, loc_fields)
    if d.get("city"):
        location["city"] = d["city"]

    if d.get("technologies"):
        techs = d["technologies"]
        company["technologies"] = techs if isinstance(techs, list) else [techs]

    if d.get("skills"):
        sk = d["skills"]
        person["skills"] = sk if isinstance(sk, list) else [sk]

    if d.get("years_experience"):
        person["years_experience"] = d["years_experience"]

    if d.get("company"):
        if not company.get("name"):
            company["name"] = d["company"]

    out = {}
    skip = set(person_fields + company_fields + contact_fields + loc_fields +
               ["company","company_name","company_domain","company_industry","company_size",
                "technologies","skills","years_experience"])
    for k, v in d.items():
        if k in skip:
            continue
        # Drop None values that Pydantic strict types reject
        if v is None:
            continue
        out[k] = v
    out["person"] = person
    out["company"] = company
    out["contact"] = contact
    if location:
        out["person"]["location"] = location
    return out


@api.post("/lead-intelligence/import")
async def li_import(body: dict, user=Depends(current_user)):
    leads_data = body.get("leads", [])
    merge_strategy = body.get("merge_strategy", "skip")
    from lead_intelligence.schema import LeadRecord
    leads = [LeadRecord(**(_normalize_lead(l) if "person" not in l else l)) for l in leads_data]
    result = await lead_manager.import_leads(
        leads, workspace_id=user["workspace_id"], user_id=user.get("id", ""),
        merge_strategy=merge_strategy,
    )
    return result


@api.post("/lead-intelligence/enrich/{lead_id}")
async def li_enrich(lead_id: str, user=Depends(current_user)):
    from billing import check_credits, charge_credits
    await check_credits(user["workspace_id"], "lead_enrichment")
    result = await lead_manager.enrich_lead(
        lead_id, workspace_id=user["workspace_id"], user_id=user.get("id", ""),
    )
    if result:
        await charge_credits(user["workspace_id"], "lead_enrichment", units=1, allow_overdraft=True)
    return result.model_dump(mode="json") if result else {"error": "Lead not found"}


@api.post("/lead-intelligence/verify-emails")
async def li_verify_emails(body: dict, user=Depends(current_user)):
    emails = body.get("emails", [])
    results = await lead_manager.verify_emails(emails, workspace_id=user["workspace_id"])
    return results


@api.post("/lead-intelligence/natural-search")
async def li_natural_search(body: dict, user=Depends(current_user)):
    query = body.get("query", "")
    if not query:
        raise HTTPException(422, "query is required")
    from billing import check_credits
    await check_credits(user["workspace_id"], "lead_enrichment")
    result = await lead_manager.natural_search(
        query, workspace_id=user["workspace_id"], user_id=user.get("id", ""),
    )
    if result and result.leads:
        from lead_intelligence.schema import LeadRecord
        lead_records = []
        for l in result.leads:
            if isinstance(l, dict):
                lead_records.append(LeadRecord(**l))
            else:
                lead_records.append(l)
        await lead_manager.import_leads(
            lead_records, workspace_id=user["workspace_id"],
            user_id=user.get("id", ""),
            merge_strategy="skip",
            request_id=result.search_id or "",
        )
    return result.model_dump(mode="json")


@api.get("/lead-intelligence/providers")
async def li_providers(user=Depends(current_user)):
    statuses = await lead_manager.get_provider_statuses()
    caps = await lead_manager.get_provider_capabilities()
    return {
        "providers": [
            {"name": name, "status": status.model_dump(),
             "capabilities": caps.get(name).model_dump() if caps.get(name) else {}}
            for name, status in statuses.items()
        ]
    }


@api.get("/lead-intelligence/providers/{provider}/stats")
async def li_provider_stats(provider: str, _: Any = Depends(require_admin)):
    stats = await lead_manager._audit.provider_stats(provider)
    return stats


@api.get("/lead-intelligence/credits")
async def li_credits(user=Depends(current_user)):
    from billing import get_balance
    bal = await get_balance(user["workspace_id"])
    rows = await db.credit_ledger.find(
        {"workspace_id": user["workspace_id"], "delta": {"$lt": 0}},
    ).to_list(2000)
    by_action = {}
    for r in rows:
        a = r.get("action", "other")
        b = by_action.setdefault(a, {"credits": 0, "count": 0})
        b["credits"] += abs(r["delta"])
        b["count"] += 1
    return {"balance": bal, "usage": by_action}


@api.get("/lead-intelligence/filters")
async def li_filters(user=Depends(current_user)):
    all_filters = []
    for name, adapter in lead_manager._adapters.items():
        for f in adapter.available_filters():
            f_copy = dict(f)
            f_copy["provider"] = name
            all_filters.append(f_copy)
    return {"filters": all_filters}


@api.get("/lead-intelligence/audit-log")
async def li_audit_log(user=Depends(require_admin), action: str = "",
                        limit: int = 100, offset: int = 0):
    entries = await lead_manager._audit.query(
        workspace_id=user["workspace_id"],
        limit=min(limit, 500),
        offset=offset,
        action=action or None,
    )
    return {"entries": entries}


# ── Saved Searches ──────────────────────────────────────────────────────

@api.post("/lead-intelligence/searches")
async def li_save_search(body: dict, user=Depends(current_user)):
    name = body.get("name", "").strip()
    filters = body.get("filters", {})
    if not name:
        raise HTTPException(422, "name is required")
    search_id = new_id()
    doc = {
        "id": search_id, "workspace_id": user["workspace_id"],
        "created_by": user.get("id", ""), "created_at": now_iso(),
        "name": name, "filters": filters,
    }
    await db.lead_searches.insert_one({**doc, "_id": search_id})
    return doc


@api.get("/lead-intelligence/searches")
async def li_list_searches(user=Depends(current_user)):
    cursor = db.lead_searches.find(
        {"workspace_id": user["workspace_id"]},
        {"_id": 0},
    ).sort("created_at", -1).limit(100)
    return {"searches": await cursor.to_list(length=100)}


@api.get("/lead-intelligence/searches/{search_id}")
async def li_get_search(search_id: str, user=Depends(current_user)):
    doc = await db.lead_searches.find_one(
        {"id": search_id, "workspace_id": user["workspace_id"]},
        {"_id": 0},
    )
    if not doc:
        raise HTTPException(404, "Search not found")
    return doc


@api.delete("/lead-intelligence/searches/{search_id}")
async def li_delete_search(search_id: str, user=Depends(current_user)):
    r = await db.lead_searches.delete_one(
        {"id": search_id, "workspace_id": user["workspace_id"]},
    )
    if not r.deleted_count:
        raise HTTPException(404, "Search not found")
    return {"deleted": True}


# ── Lead Lists ──────────────────────────────────────────────────────

@api.post("/lead-intelligence/lists")
async def li_create_list(body: dict, user=Depends(current_user)):
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(422, "name is required")
    lid = uuid.uuid4().hex[:12]
    doc = {
        "id": lid,
        "workspace_id": user["workspace_id"],
        "name": name,
        "description": (body.get("description") or "").strip(),
        "lead_ids": [],
        "lead_count": 0,
        "created_by": user.get("id", ""),
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
    }
    await db.lead_lists.insert_one(doc)
    doc["_id"] = str(doc["_id"])
    return doc


@api.get("/lead-intelligence/lists")
async def li_list_lists(user=Depends(current_user)):
    cursor = db.lead_lists.find(
        {"workspace_id": user["workspace_id"]},
    ).sort("updated_at", -1)
    lists = await cursor.to_list(None)
    # Convert ObjectId to string
    for lst in lists:
        lst["_id"] = str(lst["_id"])
    return {"lists": lists}


@api.get("/lead-intelligence/lists/{list_id}")
async def li_get_list(list_id: str, page: int = 1, page_size: int = 25, user=Depends(current_user)):
    lst = await db.lead_lists.find_one(
        {"id": list_id, "workspace_id": user["workspace_id"]},
        {"_id": 0},
    )
    if not lst:
        raise HTTPException(404, "List not found")
    # Fetch the actual leads
    lead_ids = lst.get("lead_ids", [])
    total = len(lead_ids)
    # Paginate
    start = (page - 1) * page_size
    paginated_ids = lead_ids[start:start + page_size]
    leads_cursor = db.leads.find(
        {"id": {"$in": paginated_ids}, "workspace_id": user["workspace_id"]},
        {"_id": 0},
    )
    leads = await leads_cursor.to_list(None)
    # Re-sort to match paginated_ids order
    lead_map = {l["id"]: l for l in leads}
    ordered = [lead_map[lid] for lid in paginated_ids if lid in lead_map]
    return {"list": lst, "leads": ordered, "total": total, "page": page, "page_size": page_size}


@api.put("/lead-intelligence/lists/{list_id}")
async def li_update_list(list_id: str, body: dict, user=Depends(current_user)):
    update = {}
    if "name" in body and body["name"].strip():
        update["name"] = body["name"].strip()
    if "description" in body:
        update["description"] = body["description"].strip()
    update["updated_at"] = datetime.utcnow().isoformat()
    r = await db.lead_lists.update_one(
        {"id": list_id, "workspace_id": user["workspace_id"]},
        {"$set": update},
    )
    if not r.matched_count:
        raise HTTPException(404, "List not found")
    return {"updated": True}


@api.delete("/lead-intelligence/lists/{list_id}")
async def li_delete_list(list_id: str, user=Depends(current_user)):
    r = await db.lead_lists.delete_one(
        {"id": list_id, "workspace_id": user["workspace_id"]},
    )
    if not r.deleted_count:
        raise HTTPException(404, "List not found")
    return {"deleted": True}


@api.post("/lead-intelligence/lists/{list_id}/leads")
async def li_add_leads(list_id: str, body: dict, user=Depends(current_user)):
    lead_ids = body.get("lead_ids", [])
    if not lead_ids:
        raise HTTPException(422, "lead_ids is required")
    r = await db.lead_lists.update_one(
        {"id": list_id, "workspace_id": user["workspace_id"]},
        {"$addToSet": {"lead_ids": {"$each": lead_ids}},
         "$set": {"updated_at": datetime.utcnow().isoformat()},
         "$inc": {"lead_count": len(lead_ids)}},
    )
    if not r.matched_count:
        raise HTTPException(404, "List not found")
    # Recalculate actual lead_count
    lst = await db.lead_lists.find_one(
        {"id": list_id, "workspace_id": user["workspace_id"]},
        {"lead_ids": 1},
    )
    actual_count = len(lst.get("lead_ids", []))
    await db.lead_lists.update_one(
        {"id": list_id},
        {"$set": {"lead_count": actual_count}},
    )
    return {"added": len(lead_ids), "lead_count": actual_count}


@api.delete("/lead-intelligence/lists/{list_id}/leads")
async def li_remove_leads(list_id: str, body: dict, user=Depends(current_user)):
    lead_ids = body.get("lead_ids", [])
    if not lead_ids:
        raise HTTPException(422, "lead_ids is required")
    r = await db.lead_lists.update_one(
        {"id": list_id, "workspace_id": user["workspace_id"]},
        {"$pullAll": {"lead_ids": lead_ids},
         "$set": {"updated_at": datetime.utcnow().isoformat()}},
    )
    if not r.matched_count:
        raise HTTPException(404, "List not found")
    lst = await db.lead_lists.find_one(
        {"id": list_id},
        {"lead_ids": 1},
    )
    actual_count = len(lst.get("lead_ids", []))
    await db.lead_lists.update_one(
        {"id": list_id},
        {"$set": {"lead_count": actual_count}},
    )
    return {"removed": len(lead_ids), "lead_count": actual_count}


# ── Bulk Operations ─────────────────────────────────────────────────

@api.post("/lead-intelligence/bulk/tags")
async def li_bulk_tags(body: dict, user=Depends(current_user)):
    lead_ids = body.get("lead_ids", [])
    action = body.get("action", "add")  # "add" or "remove"
    tags = body.get("tags", [])
    if not lead_ids or not tags:
        raise HTTPException(422, "lead_ids and tags are required")
    q = {"id": {"$in": lead_ids}, "workspace_id": user["workspace_id"]}
    if action == "add":
        r = await db.leads.update_many(q, {"$addToSet": {"tags": {"$each": tags}}, "$set": {"updated_at": now_iso()}})
    elif action == "remove":
        r = await db.leads.update_many(q, {"$pullAll": {"tags": tags}, "$set": {"updated_at": now_iso()}})
    else:
        raise HTTPException(422, "action must be 'add' or 'remove'")
    return {"matched": r.matched_count, "modified": r.modified_count}


@api.post("/lead-intelligence/bulk/status")
async def li_bulk_status(body: dict, user=Depends(current_user)):
    lead_ids = body.get("lead_ids", [])
    status = body.get("status", "")
    if not lead_ids or not status:
        raise HTTPException(422, "lead_ids and status are required")
    q = {"id": {"$in": lead_ids}, "workspace_id": user["workspace_id"]}
    r = await db.leads.update_many(q, {"$set": {"crm_status": status, "status": status, "updated_at": now_iso()}})
    return {"matched": r.matched_count, "modified": r.modified_count}


@api.post("/lead-intelligence/bulk/assign-campaign")
async def li_bulk_assign_campaign(body: dict, user=Depends(current_user)):
    lead_ids = body.get("lead_ids", [])
    campaign_id = body.get("campaign_id", "")
    if not lead_ids or not campaign_id:
        raise HTTPException(422, "lead_ids and campaign_id are required")
    # Verify campaign exists
    camp = await db.campaigns.find_one({"id": campaign_id, "workspace_id": user["workspace_id"]}, {"_id": 0, "id": 1})
    if not camp:
        raise HTTPException(404, "Campaign not found")
    # Add leads to campaign
    await db.campaigns.update_one(
        {"id": campaign_id},
        {"$addToSet": {"lead_ids": {"$each": lead_ids}}}
    )
    # Tag leads with campaign reference
    r = await db.leads.update_many(
        {"id": {"$in": lead_ids}, "workspace_id": user["workspace_id"]},
        {"$addToSet": {"campaign_ids": campaign_id}, "$set": {"updated_at": now_iso()}},
    )
    return {"matched": r.matched_count, "campaign_id": campaign_id}


@api.get("/lead-intelligence/bulk/campaigns")
async def li_bulk_campaigns(user=Depends(current_user)):
    cursor = db.campaigns.find(
        {"workspace_id": user["workspace_id"]},
        {"_id": 0, "id": 1, "name": 1, "status": 1},
    ).sort("created_at", -1).limit(50)
    camps = await cursor.to_list(None)
    return {"campaigns": camps}


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
                    "proposals", "pricing_catalog", "social_posts", "social_integrations",
                    "company_intel", "service_library", "campaign_engine"):
            await db[col].create_index([("workspace_id", 1), ("id", 1)])
        await db.company_intel.create_index([("workspace_id", 1), ("domain", 1)])
        await db.proposals.create_index([("workspace_id", 1), ("lead_id", 1)])
        await db.social_integrations.create_index([("workspace_id", 1), ("provider", 1)], unique=True)
        await db.social_posts.create_index([("workspace_id", 1), ("platform", 1), ("status", 1)])
        await db.sites.create_index([("workspace_id", 1), ("id", 1)])
        await db.site_kb_chunks.create_index([("site_id", 1)])
        # Site EQ's v1 retrieval — a Mongo text index, not vector search (see
        # site_eq.py docstring for why). One text index per collection max,
        # so this is the only $text-searchable field on site_kb_chunks.
        await db.site_kb_chunks.create_index([("content", "text")])
        await db.site_conversations.create_index([("workspace_id", 1), ("status", 1), ("updated_at", -1)])
        await db.site_conversations.create_index([("site_id", 1)])
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
        # Was unique=False (app-side dedupe check only, race-prone). Every insert
        # path (create_lead, bulk_leads, lead-list bulk-import in crm.py) now
        # also catches DuplicateKeyError, so this can be a real constraint.
        # Scoped to non-deleted leads (partialFilterExpression) so soft-deleting
        # a lead (recycle bin) doesn't permanently block re-creating a new lead
        # with the same email. Drop + recreate defensively — Mongo errors on a
        # same-name index whose options differ from an already-existing one,
        # and this collection may still carry the pre-partial-filter version.
        try:
            await db.leads.drop_index("workspace_id_1_email_1")
        except Exception:
            pass
        await db.leads.create_index(
            [("workspace_id", 1), ("email", 1)], unique=True,
            partialFilterExpression={"deleted_at": None},
        )
        await db.lead_notes.create_index([("workspace_id", 1), ("lead_id", 1), ("created_at", -1)])
        await db.lead_tasks.create_index([("workspace_id", 1), ("status", 1), ("due_at", 1)])
        await db.lead_tasks.create_index([("workspace_id", 1), ("lead_id", 1)])
        await db.events.create_index([("workspace_id", 1), ("type", 1)])
        await db.events.create_index([("workspace_id", 1), ("at", -1)])
        await db.suppressions.create_index([("workspace_id", 1), ("email", 1)], unique=True)
        await db.calls.create_index([("workspace_id", 1), ("created_at", -1)])
        await db.calls.create_index([("workspace_id", 1), ("lead_id", 1)])
        await db.calls.create_index([("workspace_id", 1), ("campaign_id", 1)])
        await db.calls.create_index("twilio_call_sid")
        await db.activities.create_index([("workspace_id", 1), ("lead_id", 1), ("at", -1)])
        await db.lead_lists.create_index([("workspace_id", 1), ("id", 1)])
        await db.lead_lists.create_index([("workspace_id", 1), ("updated_at", -1)])
        await db.dedup_candidates.create_index([("workspace_id", 1), ("status", 1)])
        await db.dedup_candidates.create_index([("workspace_id", 1), ("lead_id_a", 1), ("lead_id_b", 1)])
        await db.custom_field_defs.create_index([("workspace_id", 1), ("entity", 1), ("order", 1)])
        # -- SMS EQ indexes --
        await db.sms_templates.create_index([("workspace_id", 1), ("id", 1)])
        await db.sms_contacts.create_index([("workspace_id", 1), ("id", 1)])
        await db.sms_contacts.create_index([("workspace_id", 1), ("phone", 1)], unique=True)
        await db.sms_conversations.create_index([("workspace_id", 1), ("contact_id", 1)])
        await db.sms_conversations.create_index([("workspace_id", 1), ("updated_at", -1)])
        await db.sms_broadcasts.create_index([("workspace_id", 1), ("id", 1)])
        await db.sms_broadcasts.create_index([("workspace_id", 1), ("status", 1)])
        # -- WhatsApp EQ indexes --
        await db.whatsapp_templates.create_index([("workspace_id", 1), ("id", 1)])
        await db.whatsapp_templates.create_index([("workspace_id", 1), ("status", 1)])
        await db.whatsapp_contacts.create_index([("workspace_id", 1), ("id", 1)])
        await db.whatsapp_contacts.create_index([("workspace_id", 1), ("phone", 1)], unique=True)
        await db.whatsapp_conversations.create_index([("workspace_id", 1), ("contact_id", 1)])
        await db.whatsapp_conversations.create_index([("workspace_id", 1), ("session_status", 1), ("updated_at", -1)])
        await db.whatsapp_broadcasts.create_index([("workspace_id", 1), ("id", 1)])
        await db.whatsapp_broadcasts.create_index([("workspace_id", 1), ("status", 1)])
        # -- HRMS EQ indexes --
        await db.employees.create_index([("workspace_id", 1), ("id", 1)])
        await db.employees.create_index([("workspace_id", 1), ("email", 1)], unique=True)
        await db.employees.create_index([("workspace_id", 1), ("department_id", 1)])
        await db.employees.create_index([("workspace_id", 1), ("status", 1)])
        await db.departments.create_index([("workspace_id", 1), ("id", 1)])
        await db.job_requisitions.create_index([("workspace_id", 1), ("id", 1)])
        await db.job_requisitions.create_index([("workspace_id", 1), ("status", 1)])
        await db.candidates.create_index([("workspace_id", 1), ("id", 1)])
        await db.candidates.create_index([("workspace_id", 1), ("email", 1)], unique=True)
        await db.candidates.create_index([("workspace_id", 1), ("requisition_id", 1)])
        await db.onboarding_tasks.create_index([("workspace_id", 1), ("employee_id", 1)])
        await db.leave_requests.create_index([("workspace_id", 1), ("id", 1)])
        await db.leave_requests.create_index([("workspace_id", 1), ("employee_id", 1)])
        await db.leave_requests.create_index([("workspace_id", 1), ("status", 1)])
        await db.leave_balances.create_index([("workspace_id", 1), ("employee_id", 1), ("leave_type", 1)])
        await db.performance_reviews.create_index([("workspace_id", 1), ("employee_id", 1)])
        # -- Accounting EQ indexes --
        await db.coa_accounts.create_index([("workspace_id", 1), ("id", 1)])
        await db.coa_accounts.create_index([("workspace_id", 1), ("account_type", 1)])
        await db.coa_accounts.create_index([("workspace_id", 1), ("category", 1)])
        await db.journal_entries.create_index([("workspace_id", 1), ("id", 1)])
        await db.journal_entries.create_index([("workspace_id", 1), ("date", -1)])
        await db.journal_entries.create_index([("workspace_id", 1), ("lines.account_id", 1)])
        await db.accounting_customers.create_index([("workspace_id", 1), ("id", 1)])
        await db.accounting_invoices.create_index([("workspace_id", 1), ("id", 1)])
        await db.accounting_invoices.create_index([("workspace_id", 1), ("status", 1)])
        await db.accounting_invoices.create_index([("workspace_id", 1), ("customer_id", 1)])
        await db.accounting_bills.create_index([("workspace_id", 1), ("id", 1)])
        await db.accounting_bills.create_index([("workspace_id", 1), ("status", 1)])
        await db.interview_bookings.create_index([("workspace_id", 1), ("id", 1)])
        await db.interview_bookings.create_index([("workspace_id", 1), ("candidate_id", 1)])
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
        from social_eq import run_social_publish_tick, run_social_engagement_tick, run_rss_poll_tick
        from site_eq import run_site_recrawl_tick
        from sms_eq import run_sms_send_tick
        from whatsapp_eq import run_whatsapp_send_tick
        from crm import run_recycle_bin_purge_tick, run_dedup_scan_tick

        scheduler = AsyncIOScheduler(timezone="UTC")
        # Every 15 min: any confirmed booking ~24h out gets one reminder. The job
        # claims each booking before sending, so overlapping ticks can't double-send.
        scheduler.add_job(run_reminder_tick, "interval", minutes=15,
                          id="booking_reminders", max_instances=1, coalesce=True)
        # Drain the outbound queue. Every 2 min, capped per tick — a trickle looks
        # human; a burst looks like spam and gets the mailbox flagged.
        scheduler.add_job(run_send_tick, "interval", minutes=2, args=[PUBLIC_BASE_URL],
                          id="outbound_sends", max_instances=1, coalesce=True)
        # Poll sent threads for real replies (this is what feeds the unified inbox).
        scheduler.add_job(run_reply_tick, "interval", minutes=10,
                          id="reply_polling", max_instances=1, coalesce=True)
        # Auto-publish approved social posts once their scheduled time arrives
        # (or shortly after approval if none was set) — the "automatic" half of
        # the bulk-import -> email-approval -> auto-publish pipeline.
        scheduler.add_job(run_social_publish_tick, "interval", minutes=2,
                          id="social_publish", max_instances=1, coalesce=True)
        # Pulls real comments + refreshes real engagement from connected
        # (non-mocked) platforms only — never touches simulated posts.
        scheduler.add_job(run_social_engagement_tick, "interval", minutes=10,
                          id="social_engagement", max_instances=1, coalesce=True)
        # Polls subscribed RSS feeds for new entries and drafts posts from
        # them through the same pipeline bulk-import uses.
        scheduler.add_job(run_rss_poll_tick, "interval", minutes=30,
                          id="social_rss_poll", max_instances=1, coalesce=True)
        # Keeps each site's knowledge base from going stale without the user
        # having to remember to hit "re-crawl" — daily check, only re-crawls
        # sites whose last crawl is 7+ days old.
        scheduler.add_job(run_site_recrawl_tick, "interval", hours=24,
                          id="site_recrawl", max_instances=1, coalesce=True)
        # SMS broadcast send tick — drains queued SMS broadcasts at a human
        # trickle (2/min, capped).
        scheduler.add_job(run_sms_send_tick, "interval", minutes=2,
                          id="sms_send", max_instances=1, coalesce=True)
        # WhatsApp broadcast send tick — same trickle for WhatsApp template
        # sends.
        scheduler.add_job(run_whatsapp_send_tick, "interval", minutes=2,
                          id="whatsapp_send", max_instances=1, coalesce=True)
        # Recycle bin: hard-deletes anything soft-deleted (leads/companies/
        # lists) more than 30 days ago. Daily is plenty — this is cleanup,
        # not a user-facing latency path.
        scheduler.add_job(run_recycle_bin_purge_tick, "interval", hours=24,
                          id="recycle_bin_purge", max_instances=1, coalesce=True)
        # Finds candidate duplicate leads (same phone / same company+lastname /
        # near-identical email) and records them for human review — never
        # auto-merges. Hourly is plenty; this is a review queue, not a live path.
        scheduler.add_job(run_dedup_scan_tick, "interval", hours=1,
                          id="crm_dedup_scan", max_instances=1, coalesce=True)
        scheduler.start()
        logger.info("scheduler started (reminders 15m, sends 2m, reply polling 10m, "
                   "social publish 2m, social engagement 10m, RSS poll 30m, site recrawl 24h, "
                   "sms send 2m, whatsapp send 2m, recycle bin purge 24h, dedup scan 1h)")
    except Exception as ex:
        logger.warning("scheduler failed to start: %s", ex)


# ── Lead Intelligence Provider Manager ──────────────────────────────
cors_origins = os.environ.get("CORS_ORIGINS", "*").split(",")
if APP_ENV != "dev" and cors_origins == ["*"]:
    raise RuntimeError("FATAL: CORS_ORIGINS is '*' but ENV=%s. Set explicit origins in production." % APP_ENV)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=cors_origins != ["*"],
    allow_origins=cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("pitcheq")


@app.on_event("shutdown")
async def shutdown_db():
    client.close()
