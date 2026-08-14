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
from urllib.parse import quote
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

JWT_SECRET = os.environ.get("JWT_SECRET")
if not JWT_SECRET:
    raise RuntimeError(
        "FATAL: JWT_SECRET environment variable is not set. "
        "Generate one with: openssl rand -hex 32"
    )
JWT_ALG = "HS256"
JWT_TTL_HOURS = 24 * 7

FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")
# Where the recipient's mail client reaches the open pixel / click redirect. Must
# be publicly reachable for tracking to work at all — on localhost it won't be.
PUBLIC_BASE_URL = os.environ.get("PUBLIC_BASE_URL", "")

import blob_storage  # media lives in Azure Blob, not in Mongo documents

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
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})

limiter = Limiter(key_func=get_remote_address, default_limits=[])
app.state.limiter = limiter
app.add_exception_handler(429, _rate_limit_exceeded_handler)


def _workspace_or_ip_key(request: Request) -> str:
    """Rate-limit key for authenticated AI-generation routes: per workspace
    when a valid token is present (so one heavy user can't eat a whole
    shared-IP office's quota, and a workspace can't dodge the limit by
    rotating IPs), falling back to IP for anything without one. Credits
    already meter cost per call — this is a coarser backstop against a
    buggy/looping frontend or a compromised token hammering the endpoint,
    not the primary cost control."""
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        try:
            payload = jwt.decode(auth[7:], JWT_SECRET, algorithms=[JWT_ALG])
            if payload.get("wid"):
                return f"ws:{payload['wid']}"
        except jwt.PyJWTError:
            pass
    return get_remote_address(request)


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


def make_token(user_id: str, workspace_id: str, ttl_hours: Optional[float] = None) -> str:
    payload = {
        "uid": user_id,
        "wid": workspace_id,
        "exp": datetime.now(timezone.utc) + timedelta(hours=ttl_hours or JWT_TTL_HOURS),
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
    step_id: str = ""  # unique within campaign (auto-generated if empty)
    channel: str = "email"
    day: int = 0
    # DAG / branching fields
    condition: str = "always"  # always | if_no_reply | if_replied | if_opened_no_reply | if_clicked | if_not_opened | if_bounced
    parent_step_id: Optional[str] = None  # None = entry/first step
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
    folder_id: Optional[str] = None
    tags: List[str] = []


class SignatureIn(BaseModel):
    name: str
    content_html: str = ""
    content_text: str = ""
    is_default: bool = False
    # Structured source-of-truth for the visual builder. content_html/content_text
    # above stay the rendered output every existing send path (sender.py,
    # draft_chain.py, campaign_engine.py) already consumes unmodified — these two
    # fields are additive, only read by the builder itself when re-opening a
    # signature for editing.
    blocks_json: List[Dict[str, Any]] = []
    style_json: Dict[str, Any] = {}
    # Approval workflow — defaults to "approved" so every existing signature and
    # every workspace that hasn't opted into requiring approval behaves exactly
    # as before. Only meaningful once a workspace turns on "require approval"
    # (see /signatures/approval-settings); it never hard-gates signature use.
    status: str = "approved"
    click_tracking: bool = False


class MailboxIn(BaseModel):
    email: EmailStr
    provider: str = "gmail"  # gmail / m365 / zoho
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


# ----------------------------- Health Route -----------------------------------
@api.get("/health")
async def health():
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}


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
    await db.users.update_one({"id": user["id"]}, {"$set": {
        "last_login_at": now_iso(),
        "last_login_ip": request.client.host if request.client else None,
    }})
    ws = await db.workspaces.find_one({"id": user["workspace_id"]}, {"_id": 0})
    return {"token": token, "user": {"id": user["id"], "email": user["email"], "name": user["name"], "is_admin": _is_admin(user)},
            "workspace": {"id": ws["id"], "name": ws["name"]}}


class GoogleAuthIn(BaseModel):
    credential: str  # the ID-token JWT Google Identity Services hands the browser


@api.post("/auth/google")
async def google_auth(request: Request, body: GoogleAuthIn):
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
            "password_hash": hash_pw(_secrets.token_urlsafe(32)),
            "google_sub": info.get("sub"), "avatar_url": info.get("picture"),
            "workspace_id": workspace_id, "role": "org_admin", "created_at": now_iso(),
        })
        from billing import ensure_account
        await ensure_account(workspace_id)
        user = await db.users.find_one({"email": email}, {"_id": 0})

    ws = await db.workspaces.find_one({"id": user["workspace_id"]}, {"_id": 0})
    token = make_token(user["id"], user["workspace_id"])
    await db.users.update_one({"id": user["id"]}, {"$set": {
        "last_login_at": now_iso(),
        "last_login_ip": request.client.host if request.client else None,
    }})
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
        "warmup_target": m.get("daily_cap", 50),
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

    provider = m.get("provider", "gmail")
    if provider == "gmail":
        url = mailbox_client.gmail_auth_url(state)
    elif provider == "zoho":
        url = mailbox_client.zoho_auth_url(state)
    else:
        url = mailbox_client.ms_auth_url(state)
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


@api.get("/mailboxes/{mid}/warmup")
async def get_warmup_status(mid: str, user=Depends(current_user)):
    m = await db.mailboxes.find_one({"id": mid, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not m:
        raise HTTPException(404, "not found")
    current_day = m.get("warmup_day", 1)
    max_daily = _warmup_daily_cap(current_day)
    today = datetime.utcnow().isoformat()[:10]
    usage = await db.mailbox_usage.find_one(
        {"workspace_id": user["workspace_id"], "date": today})
    sent_today = (usage.get("by_mailbox") or {}).get(mid, 0) if usage else 0
    schedule = [_warmup_daily_cap(d) for d in range(1, 31)]
    return {
        "enabled": m.get("warmup_enabled", True),
        "current_day": current_day,
        "max_daily": max_daily,
        "sent_today": sent_today,
        "daily_cap": m.get("daily_cap", 50),
        "schedule": schedule,
    }


def _warmup_daily_cap(day: int) -> int:
    """Gradual ramp: week 1=5/day, week2=10, wk3=20, wk4=30, then target."""
    if day <= 7: return 5
    if day <= 14: return 10
    if day <= 21: return 20
    if day <= 28: return 30
    return 50


@api.post("/mailboxes/{mid}/warmup/start")
async def start_warmup(mid: str, user=Depends(current_user)):
    m = await db.mailboxes.find_one({"id": mid, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not m:
        raise HTTPException(404, "not found")
    cap = _warmup_daily_cap(1)
    await db.mailboxes.update_one({"id": mid}, {"$set": {
        "warmup_enabled": True, "warmup_day": 1, "daily_cap": cap,
        "warmup_started_at": now_iso(),
    }})
    return {"warmup_enabled": True, "warmup_day": 1, "daily_cap": cap}


@api.post("/mailboxes/{mid}/warmup")
async def toggle_warmup(mid: str, user=Depends(current_user)):
    m = await db.mailboxes.find_one({"id": mid, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not m:
        raise HTTPException(404, "not found")
    enabled = not m.get("warmup_enabled", False)
    update = {"warmup_enabled": enabled}
    if enabled:
        day = m.get("warmup_day", 1)
        update["daily_cap"] = _warmup_daily_cap(day)
    else:
        # Pausing warmup must actually unblock sending — `_pick_mailbox` gates
        # on daily_cap alone, so leaving the ramped-down cap in place would keep
        # failing every send with "no eligible mailbox" right after the user
        # paused warmup. Restore the full cap.
        update["daily_cap"] = m.get("warmup_target", 50)
    await db.mailboxes.update_one({"id": mid}, {"$set": update})
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
        c["lead_count"] = len(c.get("lead_ids") or [])
        c["step_count"] = len(c.get("steps") or [])
        steps = c.get("steps") or []
        c["duration_days"] = max((s.get("day", 0) for s in steps), default=0)
    return items


async def _campaign_stats(cid: str, wid: str) -> Dict[str, Any]:
    events = await db.events.find({"campaign_id": cid, "workspace_id": wid}, {"_id": 0}).to_list(5000)
    sent = sum(1 for e in events if e["type"] == "sent")
    opened = sum(1 for e in events if e["type"] == "opened")
    qpending = await db.send_queue.count_documents({"campaign_id": cid, "workspace_id": wid, "status": "pending"})
    qsending = await db.send_queue.count_documents({"campaign_id": cid, "workspace_id": wid, "status": "sending"})
    qfailed = await db.send_queue.count_documents({"campaign_id": cid, "workspace_id": wid, "status": "failed"})
    replied = sum(1 for e in events if e["type"] == "replied")
    clicked = sum(1 for e in events if e["type"] == "clicked")
    meetings = sum(1 for e in events if e["type"] == "meeting_booked")
    bounced = sum(1 for e in events if e["type"] == "bounced")
    return {
        "sent": sent,
        "opened": opened,
        "clicked": clicked,
        "replied": replied,
        "meetings": meetings,
        "bounced": bounced,
        "open_rate": round(opened / sent * 100, 1) if sent else 0,
        "reply_rate": round(replied / sent * 100, 1) if sent else 0,
        "click_rate": round(clicked / sent * 100, 1) if sent else 0,
        "bounce_rate": round(bounced / sent * 100, 1) if sent else 0,
        "meeting_rate": round(meetings / sent * 100, 1) if sent else 0,
        "queue_pending": qpending,
        "queue_sending": qsending,
        "queue_failed": qfailed,
    }


def _normalize_steps(steps: List[dict]) -> List[dict]:
    """Auto-generate step_id and assign default parent_step_id/conditions."""
    out = []
    for i, s in enumerate(steps):
        s = dict(s)
        if not s.get("step_id"):
            s["step_id"] = new_id()
        if i == 0 and not s.get("parent_step_id"):
            s["parent_step_id"] = None
        if not s.get("condition"):
            s["condition"] = "always"
        if i > 0 and s.get("condition") == "always":
            s["condition"] = "if_no_reply"  # sensible default for follow-ups
        out.append(s)
    return out


@api.post("/campaigns")
async def create_campaign(body: CampaignIn, user=Depends(current_user)):
    c = body.model_dump()
    c["steps"] = _normalize_steps(c.get("steps") or [])
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
    data = body.model_dump()
    data["steps"] = _normalize_steps(data.get("steps") or [])
    await db.campaigns.update_one(
        {"id": cid, "workspace_id": user["workspace_id"]},
        {"$set": data},
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


# ---- CRM Sync: auto-create deals from campaign events -----
async def _sync_campaign_to_crm(wid: str, cid: str, lid: str, event_type: str):
    """Auto-create or update a CRM deal when a campaign event fires."""
    if event_type not in ("replied", "meeting_booked"):
        return
    existing = await db.deals.find_one({
        "workspace_id": wid, "campaign_id": cid, "lead_id": lid})
    if existing:
        if event_type == "meeting_booked" and existing.get("stage") == "new":
            await db.deals.update_one({"id": existing["id"]}, {"$set": {"stage": "qualified"}})
        return
    campaign = await db.campaigns.find_one({"id": cid, "workspace_id": wid}, {"_id": 0})
    lead = await db.leads.find_one({"id": lid, "workspace_id": wid}, {"_id": 0})
    if not campaign or not lead:
        return
    title = f"{campaign.get('name', 'Campaign')} - {lead.get('first_name', '')} {lead.get('last_name', '')}".strip()
    stage = "qualified" if event_type == "meeting_booked" else "new"
    deal = {
        "id": new_id(), "workspace_id": wid, "campaign_id": cid, "lead_id": lid,
        "title": title, "value": 0, "stage": stage, "notes": f"Auto-created from campaign {event_type} event",
        "created_at": now_iso(), "source": "campaign",
    }
    await db.deals.insert_one(deal)


# ---- Autonomous campaign agent -----
@api.post("/system/auto-optimize-all")
async def auto_optimize_all(user=Depends(current_user)):
    """Run auto-optimize across ALL workspaces (admin)."""
    if user.get("role") not in ("admin", "superadmin"):
        raise HTTPException(403, "Admin only")
    workspaces = await db.workspaces.find({}, {"_id": 0, "id": 1}).to_list(500)
    results = []
    for ws in workspaces:
        campaigns = await db.campaigns.find({
            "workspace_id": ws["id"], "status": "active",
        }, {"_id": 0}).to_list(100)
        for c in campaigns:
            events = await db.events.find({
                "campaign_id": c["id"], "workspace_id": ws["id"]},
                {"_id": 0, "type": 1}).to_list(5000)
            sent = sum(1 for e in events if e["type"] == "sent")
            if sent < 10:
                continue
            bounced = sum(1 for e in events if e["type"] == "bounced")
            replied = sum(1 for e in events if e["type"] == "replied")
            if bounced / sent > 0.05 and c.get("status") == "active":
                await db.campaigns.update_one({"id": c["id"]}, {"$set": {"status": "paused"}})
                results.append(f"Paused {c.get('name','?')} (ws:{ws['id'][:8]}): bounce {bounced}/{sent}")
            if replied / sent > 0.05 and sent > 30:
                cur = c.get("batch_size", 10)
                new_b = min(cur + 5, 50)
                if new_b > cur:
                    await db.campaigns.update_one({"id": c["id"]}, {"$set": {"batch_size": new_b}})
                    results.append(f"Ramped {c.get('name','?')} batch {cur}→{new_b}")
    await _audit(user, "system.auto_optimize_all",
                 {"workspaces_checked": len(workspaces), "actions": len(results)})
    return {"workspaces_checked": len(workspaces), "actions_taken": len(results), "detail": results}


@api.post("/campaigns/auto-optimize")
async def auto_optimize_campaigns(user=Depends(current_user)):
    """Background agent: monitors active campaigns and auto-adjusts based on performance."""
    campaigns = await db.campaigns.find({
        "workspace_id": user["workspace_id"],
        "status": {"$in": ["active", "paused"]},
    }, {"_id": 0}).to_list(200)

    actions = []
    for c in campaigns:
        events = await db.events.find({
            "campaign_id": c["id"], "workspace_id": user["workspace_id"]},
            {"_id": 0, "type": 1, "at": 1}).to_list(5000)
        sent = sum(1 for e in events if e["type"] == "sent")
        if sent < 10:
            continue

        bounced = sum(1 for e in events if e["type"] == "bounced")
        replied = sum(1 for e in events if e["type"] == "replied")
        opened = sum(1 for e in events if e["type"] == "opened")
        bounce_rate = bounced / sent if sent else 0
        reply_rate = replied / sent if sent else 0
        open_rate = opened / sent if sent else 0

        cid = c["id"]
        cname = c.get("name", "Unnamed")
        action = {"campaign_id": cid, "campaign_name": cname, "actions": []}

        # Rule 1: High bounce rate > 5% → pause + alert
        if bounce_rate > 0.05 and c.get("status") == "active":
            await db.campaigns.update_one({"id": cid}, {"$set": {"status": "paused"}})
            action["actions"].append(f"Paused: bounce rate {bounce_rate:.1%} exceeds 5% threshold")
            await _audit(user, "auto_optimize.pause_high_bounce",
                         {"campaign_id": cid, "bounce_rate": bounce_rate})

        # Rule 2: Low open rate < 15% with > 50 sent → suggest subject refresh
        if open_rate < 0.15 and sent > 50:
            action["actions"].append(f"Alert: open rate {open_rate:.1%} below 15% threshold — consider subject line refresh")

        # Rule 3: Good reply rate > 5% → ramp up batch size
        if reply_rate > 0.05 and sent > 30 and c.get("status") == "active":
            current = c.get("batch_size", 10)
            new_batch = min(current + 5, 50)
            if new_batch > current:
                await db.campaigns.update_one({"id": cid}, {"$set": {"batch_size": new_batch}})
                action["actions"].append(f"Increased batch size from {current} to {new_batch} (strong reply rate {reply_rate:.1%})")

        # Rule 4: No engagement > 100 sent → suggest pausing
        if replied == 0 and sent > 100 and c.get("status") == "active":
            action["actions"].append(f"Warning: 0 replies from {sent} sends — consider pausing campaign")

        if action["actions"]:
            actions.append(action)

    return {
        "campaigns_checked": len(campaigns),
        "campaigns_modified": len(actions),
        "actions": actions,
    }


@api.get("/campaigns/auto-optimize/status")
async def auto_optimize_status(user=Depends(current_user)):
    """Return health summary for all active campaigns."""
    campaigns = await db.campaigns.find({
        "workspace_id": user["workspace_id"],
        "status": "active",
    }, {"_id": 0}).to_list(200)
    statuses = []
    for c in campaigns:
        events = await db.events.find({
            "campaign_id": c["id"], "workspace_id": user["workspace_id"]},
            {"_id": 0, "type": 1}).to_list(5000)
        sent = sum(1 for e in events if e["type"] == "sent")
        statuses.append({
            "id": c["id"],
            "name": c.get("name", ""),
            "sent": sent,
            "open_rate": round(sum(1 for e in events if e["type"] == "opened") / sent * 100, 1) if sent else 0,
            "reply_rate": round(sum(1 for e in events if e["type"] == "replied") / sent * 100, 1) if sent else 0,
            "bounce_rate": round(sum(1 for e in events if e["type"] == "bounced") / sent * 100, 1) if sent else 0,
            "batch_size": c.get("batch_size", 10),
            "health": "good" if sent < 10 or (
                sum(1 for e in events if e["type"] == "opened") / sent > 0.15 and
                sum(1 for e in events if e["type"] == "bounced") / sent < 0.05
            ) else "needs_attention",
        })
    return {"campaigns": statuses, "total": len(statuses)}


# ---- Contact state machine -----
CONTACT_STATES = ["queued", "sent", "opened", "clicked", "replied", "bounced", "meeting_booked", "exited", "completed"]


@api.get("/campaigns/{cid}/contact-states")
async def campaign_contact_states(cid: str, user=Depends(current_user)):
    """Return per-contact state machine for a campaign."""
    c = await db.campaigns.find_one({"id": cid, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not c:
        raise HTTPException(404, "not found")
    lead_ids = c.get("lead_ids") or []
    if not lead_ids:
        return {"campaign_id": cid, "contacts": [], "summary": {}}

    leads = {l["id"]: l async for l in db.leads.find(
        {"id": {"$in": lead_ids}}, {"_id": 0, "id": 1, "first_name": 1, "last_name": 1, "email": 1, "company": 1})}
    events = {e["lead_id"]: e async for e in db.events.find(
        {"campaign_id": cid, "workspace_id": user["workspace_id"]}, {"_id": 0, "lead_id": 1, "type": 1})}
    queue = {q["lead_id"]: q async for q in db.send_queue.find(
        {"campaign_id": cid, "workspace_id": user["workspace_id"]}, {"_id": 0, "lead_id": 1, "step": 1, "status": 1})}

    contacts = []
    for lid in lead_ids:
        lead = leads.get(lid, {})
        ev = events.get(lid, {})
        q = queue.get(lid, {})

        if ev.get("type") == "bounced": state = "bounced"
        elif ev.get("type") == "replied": state = "replied"
        elif ev.get("type") == "meeting_booked": state = "meeting_booked"
        elif ev.get("type") == "clicked": state = "clicked"
        elif ev.get("type") == "opened": state = "opened"
        elif ev.get("type") == "sent": state = "sent"
        elif q.get("status") == "pending": state = "queued"
        elif q.get("status") == "cancelled": state = "exited"
        else: state = "queued"

        contacts.append({
            "lead_id": lid,
            "first_name": lead.get("first_name", ""),
            "last_name": lead.get("last_name", ""),
            "email": lead.get("email", ""),
            "company": lead.get("company", ""),
            "current_step": q.get("step", 0) if q else 0,
            "state": state,
            "queue_status": q.get("status", "none") if q else "none",
            "last_event": ev.get("type", "none") if ev else "none",
        })

    summary = {}
    for s in CONTACT_STATES:
        count = sum(1 for c in contacts if c["state"] == s)
        if count:
            summary[s] = count

    return {
        "campaign_id": cid,
        "total_contacts": len(contacts),
        "contacts": contacts,
        "summary": summary,
        "steps": len(c.get("steps", [])),
    }


# ---- AI Campaign Optimizer -----
@api.post("/campaigns/{cid}/optimize")
async def campaign_optimize(cid: str, user=Depends(current_user)):
    """Analyze campaign performance and return LLM-powered optimization suggestions."""
    c = await db.campaigns.find_one({"id": cid, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not c:
        raise HTTPException(404, "not found")
    steps = c.get("steps") or []
    events = await db.events.find(
        {"campaign_id": cid, "workspace_id": user["workspace_id"]}, {"_id": 0}).to_list(5000)
    sent_count = sum(1 for e in events if e["type"] == "sent")
    if sent_count < 5:
        raise HTTPException(400, "Need at least 5 sent emails to generate meaningful optimizations.")

    # Build per-step stats
    step_stats = []
    for i, s in enumerate(steps):
        se = [e for e in events if e.get("step") == i]
        sent = sum(1 for e in se if e["type"] == "sent")
        step_stats.append({
            "step": i, "subject": s.get("subject", ""), "channel": s.get("channel", "email"),
            "condition": s.get("condition", "always"), "sent": sent,
            "opened": sum(1 for e in se if e["type"] == "opened"),
            "replied": sum(1 for e in se if e["type"] == "replied"),
            "bounced": sum(1 for e in se if e["type"] == "bounced"),
        })

    # A/B test results
    ab = await campaign_ab_test_results(cid, user)

    # Send-time distribution
    queue_items = await db.send_queue.find(
        {"campaign_id": cid, "workspace_id": user["workspace_id"], "status": "sent"},
        {"_id": 0, "send_at": 1}).to_list(500)
    hours = []
    for q in queue_items:
        try:
            h = int(q["send_at"].split("T")[1].split(":")[0])
            hours.append(h)
        except (ValueError, IndexError, KeyError):
            pass
    hour_dist = {}
    for h in hours:
        hour_dist[f"{h:02d}:00"] = hour_dist.get(f"{h:02d}:00", 0) + 1

    prompt = f"""You are a campaign optimization analyst. Analyze this campaign performance data and provide actionable recommendations.

Campaign: {c.get('name', 'Unnamed')}
Status: {c.get('status', 'unknown')}
Total sent: {sent_count}
Overall open rate: {sum(1 for e in events if e['type']=='opened')}/{sent_count} = {round(sum(1 for e in events if e['type']=='opened')/sent_count*100,1) if sent_count else 0}%
Overall reply rate: {sum(1 for e in events if e['type']=='replied')}/{sent_count} = {round(sum(1 for e in events if e['type']=='replied')/sent_count*100,1) if sent_count else 0}%
Bounce rate: {sum(1 for e in events if e['type']=='bounced')}/{sent_count} = {round(sum(1 for e in events if e['type']=='bounced')/sent_count*100,1) if sent_count else 0}%

Per-step stats:
{json.dumps(step_stats, indent=2)}

A/B test results:
{json.dumps(ab, indent=2)}

Send-time distribution (hour -> count):
{json.dumps(hour_dist, indent=2)}

Return valid JSON with these exact keys:
- subject_line_recommendations: array of strings (top 3 subject line patterns that work)
- best_send_times: array of strings (best hours to send)
- content_suggestions: array of strings (how to improve email content)
- step_sequence_advice: array of strings (optimize step order/conditions)
- overall_score: integer 0-100
- key_insight: string (single most important finding)"""

    from ai_utils import llm_chat
    try:
        result_text = await llm_chat(
            system="You are a campaign optimization analyst. Return ONLY valid JSON. No markdown, no backticks.",
            user_text=prompt,
            session_id=f"optimize-{cid}",
            user=user,
            max_tokens=4096,
        )
        result_text = result_text.strip().removeprefix("```json").removesuffix("```").strip()
        result = json.loads(result_text)
    except Exception as ex:
        raise HTTPException(502, f"Optimization analysis failed: {ex}")

    await _audit(user, "campaign.optimize", {"campaign_id": cid})
    return {
        "campaign_id": cid,
        "campaign_name": c.get("name", ""),
        "total_sent": sent_count,
        **result,
    }


@api.post("/campaigns/{cid}/preflight")
async def campaign_preflight(cid: str, user=Depends(current_user)):
    """Run a 7-point pre-flight checklist and return pass/fail per item."""
    c = await db.campaigns.find_one({"id": cid, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not c:
        raise HTTPException(404, "not found")
    checks = []

    # 1. Steps defined
    steps = c.get("steps") or []
    checks.append({
        "id": "steps", "label": "Sequence steps defined",
        "passed": len(steps) > 0,
        "detail": f"{len(steps)} step(s)" if steps else "No steps configured",
    })

    # 2. Leads assigned
    lead_ids = c.get("lead_ids") or []
    checks.append({
        "id": "leads", "label": "Leads assigned",
        "passed": len(lead_ids) > 0,
        "detail": f"{len(lead_ids)} lead(s)" if lead_ids else "No leads assigned",
    })

    # 3. Personalization reviewed
    pmap = {p["lead_id"]: p for p in c.get("personalized_emails", [])}
    approved = sum(1 for lid in lead_ids if pmap.get(lid, {}).get("status") == "approved")
    ungen = sum(1 for lid in lead_ids if lid not in pmap)
    checks.append({
        "id": "personalization", "label": "Emails reviewed and approved",
        "passed": approved == len(lead_ids) if lead_ids else True,
        "detail": f"{approved}/{len(lead_ids)} approved" if lead_ids else "No leads to review",
        "warn": ungen > 0,
    })

    # 4. Mailbox connected
    has_email = any(s.get("channel", "email") == "email" for s in steps)
    mailboxes = []
    if has_email:
        mailboxes = await db.mailboxes.find(
            {"workspace_id": user["workspace_id"], "status": "connected"}, {"_id": 0}).to_list(20)
    checks.append({
        "id": "mailbox", "label": "Sending mailbox connected",
        "passed": not has_email or len(mailboxes) > 0,
        "detail": f"{len(mailboxes)} connected" if mailboxes else "No connected mailbox" if has_email else "No email steps",
    })

    # 5. DNS records valid
    dns_ok = True
    dns_detail = []
    for mb in mailboxes:
        dns = mb.get("dns") or {}
        spf = dns.get("spf", False)
        dkim = dns.get("dkim", False)
        dmarc = dns.get("dmarc", False)
        ok = spf and dkim and dmarc
        if not ok:
            dns_ok = False
            missing = [lbl for lbl, v in [("SPF", spf), ("DKIM", dkim), ("DMARC", dmarc)] if not v]
            dns_detail.append(f"{mb.get('email','?')}: missing {', '.join(missing)}")
    checks.append({
        "id": "dns", "label": "SPF / DKIM / DMARC configured",
        "passed": not has_email or dns_ok,
        "detail": "; ".join(dns_detail) if dns_detail else "All records valid" if has_email else "No email steps",
    })

    # 6. Variables resolve (no unresolved {{placeholders}})
    unresolved = set()
    for s in steps:
        for field in ["subject", "body", "body_html", "body_text"]:
            val = s.get(field, "")
            if isinstance(val, str):
                found = re.findall(r"\{\{\s*(\w+)\s*\}\}", val)
                for f in found:
                    if f not in ("first_name", "last_name", "email", "company", "title",
                                  "phone", "linkedin_url", "website", "personalized_opener"):
                        unresolved.add(f)
    checks.append({
        "id": "variables", "label": "Template variables resolve",
        "passed": len(unresolved) == 0,
        "detail": f"Unknown variables: {', '.join(sorted(unresolved))}" if unresolved else "All variables valid",
    })

    # 7. Content safety — spam trigger words
    spam_words = ["free", "act now", "limited time", "congratulations", "click here",
                   "buy now", "call now", "don't miss", "exclusive offer", "guaranteed"]
    body_text = " ".join(s.get("body", "") + " " + s.get("body_text", "") + " " + s.get("body_html", "")
                         for s in steps).lower()
    found_spam = [w for w in spam_words if w in body_text]
    checks.append({
        "id": "spam", "label": "Content passes spam check",
        "passed": len(found_spam) == 0,
        "detail": f"Spam words detected: {', '.join(found_spam)}" if found_spam else "No spam triggers",
        "warn": len(found_spam) > 0,
    })

    all_passed = all(c["passed"] for c in checks)
    return {"checks": checks, "all_passed": all_passed, "campaign_id": cid}


@api.post("/campaigns/{cid}/launch")
async def launch_campaign(cid: str, skip_pending: bool = False, user=Depends(current_user)):
    """Enqueue a campaign for real sending.

    By default every lead must be approved before launch. Pass `skip_pending=true`
    to send only to leads whose personalised email has been approved — the rest
    are skipped rather than blocked.
    """
    # require_role is defined later in this file (it needs _is_admin, defined
    # further down still) so it can't be used as this route's own Depends(...)
    # default without a NameError at module-load time — called inline instead,
    # which only runs at request time, long after the whole module has loaded.
    await require_role("org_admin", "campaign_manager")(user=user)
    from sender import enqueue_campaign

    c = await db.campaigns.find_one({"id": cid, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not c:
        raise HTTPException(404, "not found")

    # Relaunching an active campaign re-runs enqueue_campaign and queues every
    # lead a second time — the same person receives the sequence twice. The UI
    # hides Launch once status is active, but a stale tab or a direct API call
    # would otherwise still get through.
    if c.get("status") == "active":
        raise HTTPException(409, "This campaign is already running — pause it before relaunching.")

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

    # Flip to "active" BEFORE enqueueing, not after. run_send_tick cancels any
    # due queue item whose campaign isn't active, and it runs every 2 minutes —
    # so with the old ordering a tick landing between the inserts and this
    # update would cancel the whole batch it had just found. Restore the prior
    # status on any failure path so a rejected launch doesn't strand the
    # campaign as active with nothing queued.
    prev_status = c.get("status", "draft")
    await db.campaigns.update_one({"id": cid}, {"$set": {"status": "active", "launched_at": now_iso()}})

    async def _revert():
        await db.campaigns.update_one({"id": cid}, {"$set": {"status": prev_status}, "$unset": {"launched_at": ""}})

    try:
        result = await enqueue_campaign(user["workspace_id"], c)
    except ValueError as ex:
        await _revert()
        raise HTTPException(400, str(ex))
    except Exception:
        await _revert()
        logger.error("enqueue_campaign crashed\n%s", _tb())
        raise HTTPException(500, "Campaign engine error")

    # A campaign whose every lead was rejected (or quarantined, or otherwise
    # has nothing left to send) queues zero items without enqueue_campaign
    # raising — previously this still flipped status to "active", leaving a
    # campaign that looks launched but will never send a single email.
    if result.get("queued", 0) == 0:
        await _revert()
        raise HTTPException(
            400,
            "Nothing to send — every lead was skipped (rejected, quarantined, or missing "
            "a personalized email). Approve at least one lead before launching.",
        )

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
# Opt-in markers a user drops into a campaign step, following the same
# {{token}} convention as the merge fields. They escalate how much of the email
# the model writes:
#
#   {{personalized_opener}}  (original) — AI writes only the ice-breaker line;
#                            the rest of the template is sent verbatim, and the
#                            SAME opener is reused on every follow-up step.
#   {{ai_subject}}  in the subject — AI writes a fresh subject for this step.
#   {{ai_email}}    in the body    — AI rewrites the entire body for this step,
#                                    keeping the template's intent, offer and
#                                    CTA but producing new copy every time.
#
# Both new markers resolve per step, so a sequence no longer repeats itself.
AI_EMAIL_TOKEN = "{{ai_email}}"
AI_SUBJECT_TOKEN = "{{ai_subject}}"

# The signature is appended by the sender, so anything the model writes must
# stop at the CTA. campaign_engine.py enforces the same rule when it drafts
# templates; breaking it here produces emails with two sign-offs.
_NO_SIGNOFF_RULE = (
    "NEVER write a sign-off, closing line, or signature — no 'Best regards', no "
    "'[Your Name]', no title or company block. Stop at the call to action. The "
    "system appends the signature separately."
)


async def _sender_context(campaign: Dict[str, Any], user: Dict[str, Any]) -> Dict[str, str]:
    """Resolve WHO is sending the email — the identity the LLM must write as.

    Precedence: campaign's from_mailbox (display_name/email) → campaign owner
    user. The workspace's brand_voice.offer (business summary from onboarding)
    becomes "what we do", so the model talks about the sender's own business
    instead of absorbing the lead's profile as its identity. Every field falls
    back to "" so callers can interpolate unconditionally.
    """
    name = (user.get("name") or "").strip()
    email = (user.get("email") or "").strip()
    mb_id = campaign.get("from_mailbox_id") or campaign.get("from_mailbox")
    if mb_id:
        mb = await db.mailboxes.find_one({"id": mb_id, "workspace_id": user["workspace_id"]}, {"_id": 0, "email": 1, "display_name": 1})
        if mb:
            email = (mb.get("email") or email).strip()
            name = (mb.get("display_name") or name).strip()
    ws = await db.workspaces.find_one({"id": user["workspace_id"]}, {"_id": 0, "name": 1, "brand_voice": 1})
    bv = ((ws or {}).get("brand_voice") or {})
    return {
        "name": name,
        "email": email,
        "company": ((ws or {}).get("name") or "").strip(),
        "what_we_do": (bv.get("offer") or "").strip(),
    }


async def _ai_write_step(*, step: Dict[str, Any], step_idx: int, total_steps: int,
                         lead_context: Dict[str, Any], research_summary: str,
                         campaign: Dict[str, Any], ai_meta: Dict[str, Any],
                         prior_steps: List[Dict[str, str]], want_body: bool,
                         want_subject: bool, user) -> Dict[str, str]:
    """Write a fresh subject and/or body for one step of a sequence.

    The template is passed as *intent* rather than text to fill in: the model
    keeps its offer, angle and CTA but writes new copy grounded in the lead
    research. Earlier steps of the same sequence are included so follow-ups
    build on what was already said instead of restating it.
    """
    sender = await _sender_context(campaign, user)
    sender_block = (
        f"YOU — the sender of this email:\n"
        f"  Name: {sender['name'] or '(sender will sign automatically)'}\n"
        f"  Email: {sender['email'] or '(sender will send automatically)'}\n"
        f"  Company: {sender['company'] or '(your company)'}\n"
        f"  What your company does: {sender['what_we_do'] or 'Our product/service for this campaign is described in the template intent below.'}\n"
        "You write FROM this sender TO the lead. The lead is the RECIPIENT — never "
        "write as the lead, never use their name/title/company as your own identity, "
        "never open with 'My name is...' using their details. Talk about THEIR situation, "
        "not what your own company 'is looking for'.\n"
    )
    asks = []
    if want_subject:
        asks.append('"subject": "<new subject line>"')
    if want_body:
        asks.append('"body": "<the complete email body, plain text with \\n line breaks>"')

    system = (
        "You are Pitch EQ's cold-email writer. You are given a template that "
        "defines the INTENT of one email in a sequence — its offer, angle and "
        "call to action — plus real research on the recipient.\n"
        "Rules:\n"
        "1. Keep the template's intent, offer and CTA. Do NOT keep its wording — "
        "write genuinely new copy for this specific person.\n"
        "2. Ground every specific claim in the research provided. If the research "
        "found nothing, write a strong email that makes NO specific claims about "
        "them — never invent a trigger, metric, or event.\n"
        "3. You may use the merge tokens {{first_name}}, {{last_name}}, {{company}} "
        "and {{title}}; they are substituted when the email is sent.\n"
        "4. Do not emit {{personalized_opener}}, {{ai_email}} or {{ai_subject}} — "
        "you are replacing them.\n"
        f"5. {_NO_SIGNOFF_RULE}\n"
        "6. Return STRICT JSON only: {" + ", ".join(asks) + "}"
    )

    prior_txt = ""
    if prior_steps:
        prior_txt = "\n\nALREADY SENT EARLIER IN THIS SEQUENCE (do not repeat these angles or reuse their phrasing):\n"
        for p in prior_steps:
            prior_txt += f"- Step {p['step'] + 1} subject: {p.get('subject', '')}\n  body: {(p.get('body') or '')[:400]}\n"

    day_note = f" (sent on day {step.get('day')})" if step.get("day") else ""
    prompt = (
        f"{sender_block}\n"
        f"LEAD PROFILE (the recipient):\n{json.dumps(lead_context, indent=2)}\n\n"
        f"RESEARCH ON THE PERSON AND COMPANY:\n{research_summary}\n\n"
        f"CAMPAIGN SERVICE: {ai_meta.get('service_name', campaign.get('goal', ''))}\n"
        f"CAMPAIGN GOAL: {campaign.get('goal', '')}\n"
        f"TONE: {campaign.get('tone', 'professional')}\n\n"
        f"THIS IS EMAIL {step_idx + 1} OF {total_steps} IN THE SEQUENCE{day_note}.\n"
        f"TEMPLATE SUBJECT (intent): {step.get('subject', '')}\n"
        f"TEMPLATE BODY (intent):\n{step.get('body', '') or step.get('body_text', '')}\n"
        f"{prior_txt}\n"
        "Write this email FROM the sender TO the lead. The lead is your prospect, "
        "not you — never write as them."
    )
    raw = await _llm_chat(system, prompt, f"creq-step-{step_idx}-{lead_context.get('email', '')[:12]}",
                          user=user, max_tokens=1200)
    data = _extract_json(raw) or {}
    out: Dict[str, str] = {}
    if want_subject:
        out["subject"] = (data.get("subject") or "").strip()
    if want_body:
        out["body"] = (data.get("body") or "").strip()
    return out


def _step_ai_modes(step: Dict[str, Any]) -> tuple:
    """(wants_ai_body, wants_ai_subject) for a campaign step."""
    body_src = f"{step.get('body', '')}{step.get('body_html', '')}{step.get('body_text', '')}"
    return (AI_EMAIL_TOKEN in body_src, AI_SUBJECT_TOKEN in (step.get("subject") or ""))


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
        "You write ONE ice-breaker sentence that a cold sender opens their email with. "
        "You are the SENDER — never write as the lead, never use the lead's name, title "
        "or company as your own identity. The LEAD (the person receiving the email) is "
        "your prospect.\n"
        "The opener must reference a REAL detail about the LEAD from their profile or "
        "research. It must be 1-2 sentences, under 30 words, conversational, no greeting, "
        "no CTA, no subject line, no email body, no sign-off. Output ONLY the opener text. "
        "No quotes, no JSON, no preamble.\n\n"
        "Example:\nSENDER: Alex from Nova Web Works\nLEAD: Tom R., COO, Ridgeware — company raised $12M Series A last month\n"
        "OUTPUT: Congrats on Ridgeware's Series A — the $12M round must have the operations team moving fast."
    )
    sender = await _sender_context(campaign, user)
    opener_prompt = (
        f"SENDER (you, who writes this email):\n"
        f"  Name: {sender['name'] or '(sender)'}\n"
        f"  Company: {sender['company'] or '(your company)'}\n"
        f"  What your company does: {sender['what_we_do'] or 'Described by the campaign below.'}\n"
        f"You write TO the lead — the lead is your prospect, not you.\n\n"
        f"LEAD PROFILE (the recipient):\n{json.dumps(lead_context, indent=2)}\n\n"
        f"LEAD RESEARCH:\n{research_summary}\n\n"
        f"CAMPAIGN SERVICE: {ai_meta.get('service_name', campaign.get('goal', ''))}\n"
        f"CAMPAIGN GOAL: {campaign.get('goal', '')}\n"
        f"CAMPAIGN TONE: {campaign.get('tone', 'professional')}\n\n"
        f"Generate a personalized ice-breaker opener FROM the sender TO this lead. "
        f"This will be inserted into the {{personalized_opener}} placeholder in the email template."
    )
    try:
        raw2 = await _llm_chat(opener_system, opener_prompt, f"lead-opnr-{lead_id[:8]}", user=user, max_tokens=512)
        personalized_opener = _extract_opener(raw2)
    except Exception as ex:
        raise HTTPException(502, f"Opener generation failed: {ex}")

    opener_clean = (personalized_opener or "").strip()

    # Resolve every step, not just the first. A step carrying {{ai_email}} or
    # {{ai_subject}} gets its own generation pass so no two emails in the
    # sequence are alike; anything else keeps the original opener-merge
    # behaviour. Generated here rather than at send time because sender.py only
    # enqueues personalization once it is "approved" — writing the copy later
    # would mean approving one email and sending another.
    resolved_steps: List[Dict[str, Any]] = []
    prior_for_prompt: List[Dict[str, str]] = []
    total_steps = len(campaign_steps) or 1
    for idx, step in enumerate(campaign_steps):
        if step.get("channel", "email") != "email":
            continue
        want_body, want_subject = _step_ai_modes(step)
        s_subject = step.get("subject", "")
        s_body = step.get("body", "") or step.get("body_text", "")
        s_html = step.get("body_html", "")
        mode = "template"

        if want_body or want_subject:
            try:
                written = await _ai_write_step(
                    step=step, step_idx=idx, total_steps=total_steps,
                    lead_context=lead_context, research_summary=research_summary,
                    campaign=campaign, ai_meta=ai_meta, prior_steps=prior_for_prompt,
                    want_body=want_body, want_subject=want_subject, user=user,
                )
            except Exception as ex:
                # One step failing must not lose the whole sequence — fall back
                # to the template for this step and carry on.
                logging.warning("ai step %s generation failed for lead %s: %s", idx, lead_id, ex)
                written = {}
            if want_subject and written.get("subject"):
                s_subject = written["subject"]
                mode = "ai_subject"
            if want_body and written.get("body"):
                s_body = written["body"]
                # The model returns plain text, but raw \n has no meaning in
                # HTML — sending it as the HTML part would collapse the whole
                # email onto one line. Rebuild it through the same styled
                # paragraph renderer the draft chain uses. Signature is passed
                # empty on purpose: the sender appends it separately.
                from draft_chain import to_html as _draft_to_html
                paragraphs = [p.strip() for p in s_body.split("\n\n") if p.strip()]
                s_html = _draft_to_html({"paragraphs": paragraphs}, "")
                mode = "ai_email" if not want_subject else "ai_email+subject"
            prior_for_prompt.append({"step": idx, "subject": s_subject, "body": s_body})
        else:
            s_body = s_body.replace("{{personalized_opener}}", opener_clean)
            s_html = s_html.replace("{{personalized_opener}}", opener_clean) if s_html else ""
            if opener_clean and "{{personalized_opener}}" in (step.get("body", "") or ""):
                mode = "opener"

        s_body = re.sub(r"\n{3,}", "\n\n", s_body)
        resolved_steps.append({
            "step": idx, "subject": s_subject, "body": s_body,
            "body_html": s_html, "mode": mode,
        })

    first = resolved_steps[0] if resolved_steps else {}
    personalized = {
        "lead_id": lead_id,
        # Step 0 stays at the top level so the existing review UI and the
        # send-queue path keep working unchanged.
        "subject": first.get("subject", step_template.get("subject", "")),
        "body": first.get("body", ""),
        "body_html": first.get("body_html", ""),
        "steps": resolved_steps,
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
async def get_campaign_leads(cid: str, step: int = 0, user=Depends(current_user)):
    """Return leads for a campaign with their personalized email status. Leads
    that have never been through AI generation (or a manual opener edit) still
    get a merge-field-resolved preview of the raw template, so the review
    screen has something to show — and to edit — before any generation runs.

    `step` selects which sequence step to preview. Only step 0 is stored per
    lead in personalized_emails; later steps are rendered the way sender.py
    renders them at send time (that step's template with the lead's opener
    applied), so the preview matches what would actually go out."""
    wid = user["workspace_id"]
    campaign = await db.campaigns.find_one({"id": cid, "workspace_id": wid}, {"_id": 0, "personalized_emails": 1, "lead_ids": 1, "steps": 1})
    if not campaign:
        raise HTTPException(404, "not found")
    lead_ids = campaign.get("lead_ids", [])
    personalized = campaign.get("personalized_emails", [])
    personalization_map = {p["lead_id"]: p for p in personalized}
    steps = campaign.get("steps") or []
    step_idx = step if 0 <= step < len(steps) else 0
    step_template = steps[step_idx] if steps else {}
    from sender import _apply_opener
    leads = await db.leads.find(
        {"id": {"$in": lead_ids}, "workspace_id": wid},
        {"_id": 0}
    ).to_list(500)

    def _resolve(s: str, lead: Dict[str, Any]) -> str:
        if not s:
            return s
        import re
        def rep(m):
            key = m.group(1).strip()
            v = lead.get(key, "")
            return v if v else m.group(0)
        return re.sub(r"\{\{\s*(\w+)\s*\}\}", rep, s)

    result = []
    for lead in leads:
        p = personalization_map.get(lead["id"])
        opener = p.get("personalized_opener", "") if p else ""
        if p and step_idx == 0:
            subject = _resolve(p.get("subject", ""), lead)
            body = _resolve(p.get("body", ""), lead)
            body_html = _resolve(p.get("body_html", ""), lead)
        elif step_idx > 0:
            subject = _resolve(_apply_opener(step_template.get("subject", ""), opener), lead)
            body = _resolve(_apply_opener(step_template.get("body_text") or step_template.get("body", ""), opener), lead)
            body_html = _resolve(_apply_opener(step_template.get("body_html") or step_template.get("body", ""), opener), lead)
        else:
            subject = _resolve(step_template.get("subject", ""), lead)
            body = _resolve((step_template.get("body", "") or "").replace("{{personalized_opener}}", ""), lead)
            body_html = _resolve((step_template.get("body_html", "") or "").replace("{{personalized_opener}}", ""), lead)
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
    return {
        "leads": result, "personalized_count": len(personalized), "total_count": len(lead_ids),
        "step": step_idx, "total_steps": len(steps),
    }


@api.post("/campaigns/{cid}/leads/generate-all")
async def generate_all_lead_emails(cid: str, user=Depends(current_user)):
    """Generate personalized emails for all leads in a campaign."""
    wid = user["workspace_id"]
    campaign = await db.campaigns.find_one({"id": cid, "workspace_id": wid}, {"_id": 0})
    if not campaign:
        raise HTTPException(404, "not found")
    lead_ids = campaign.get("lead_ids", [])
    personalized = campaign.get("personalized_emails", [])
    already_done = {p["lead_id"] for p in personalized}
    to_generate = [lid for lid in lead_ids if lid not in already_done]
    if not to_generate:
        return {"generated": 0, "message": "All leads already have personalized emails"}
    campaign_steps = campaign.get("steps", [])
    step_template = campaign_steps[0] if campaign_steps else {}
    results, errors = [], []

    is_template = campaign.get("campaign_type") == "template"
    if is_template:
        for lid in to_generate:
            try:
                await db.campaigns.update_one(
                    {"id": cid},
                    {"$push": {"personalized_emails": {
                        "lead_id": lid,
                        "subject": step_template.get("subject", ""),
                        "body": step_template.get("body", "") or "",
                        "body_html": step_template.get("body_html", "") or "",
                        "personalized_opener": "",
                        "status": "draft",
                        "generated_at": now_iso(),
                    }}}
                )
                results.append(lid)
            except Exception as ex:
                errors.append({"lead_id": lid, "error": str(ex)})
        await _audit(user, "campaign.leads.email_generated_all", {"campaign_id": cid, "count": len(results)})
        return {"generated": len(results), "errors": errors}

    if not await _rate_ok(user):
        raise HTTPException(429, "Daily AI quota exceeded")
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


@api.delete("/campaigns/{cid}/leads/email")
async def delete_all_campaign_lead_emails(cid: str, user=Depends(current_user)):
    """Delete ALL personalized emails in a campaign (dismiss all)."""
    wid = user["workspace_id"]
    result = await db.campaigns.update_one(
        {"id": cid, "workspace_id": wid},
        {"$set": {"personalized_emails": []}}
    )
    if result.modified_count == 0:
        raise HTTPException(404, "Campaign not found or no emails to delete")
    return {"ok": True, "deleted": True}


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
    wid = user["workspace_id"]
    campaign = await db.campaigns.find_one({"id": cid, "workspace_id": wid}, {"_id": 0})
    if not campaign:
        raise HTTPException(404, "Campaign not found")
    lead_ids = campaign.get("lead_ids", [])
    if not lead_ids:
        raise HTTPException(400, "No leads assigned to campaign. Add leads first.")

    is_template = campaign.get("campaign_type") == "template"
    if not is_template:
        if not await _rate_ok(user):
            raise HTTPException(429, "Daily AI quota exceeded")

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

    # Template campaigns have no AI work — generate synchronously so
    # personalized_emails exist immediately and the user can approve right away.
    if is_template:
        campaign_steps = campaign.get("steps", [])
        step_template = campaign_steps[0] if campaign_steps else {}
        for lid in to_generate:
            await db.campaigns.update_one(
                {"id": cid},
                {"$push": {"personalized_emails": {
                    "lead_id": lid,
                    "subject": step_template.get("subject", ""),
                    "body": step_template.get("body", "") or "",
                    "body_html": step_template.get("body_html", "") or "",
                    "personalized_opener": "",
                    "status": "draft",
                    "generated_at": now_iso(),
                }}}
            )
        return {"generated": len(to_generate), "job_id": "", "message": f"Emails ready for {len(to_generate)} leads"}

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
                    snd = await _sender_context(campaign, user)
                    research_pack = await get_research(wid, lead)
                    research_summary = summarize_for_prompt(research_pack)
                    opener_raw = await _llm_chat(
                        "You write ONE ice-breaker sentence that a cold sender opens their email with. You are the SENDER — never write as the lead or use their name/title/company as your identity; the LEAD is your prospect. Reference a REAL detail about the LEAD. 1-2 sentences, under 30 words, conversational, no greeting, no CTA, no subject line, no email body, no sign-off. Output ONLY the opener text. No quotes, no JSON, no preamble.\n\nExample:\nSENDER: Alex from Nova Web Works\nLEAD: Tom R., COO, Ridgeware — raised $12M Series A last month\nOUTPUT: Congrats on Ridgeware's Series A — the $12M round must have the operations team moving fast.",
                        f"SENDER (you): {snd['name'] or '(sender)'} at {snd['company'] or 'your company'} — {snd['what_we_do'] or 'Described by the campaign below.'}\nYou write TO the lead — the lead is your prospect, not you.\n\nLEAD PROFILE (recipient):\n{json.dumps(lead_context, indent=2)}\n\nLEAD RESEARCH:\n{research_summary}\n\nCAMPAIGN SERVICE: {campaign_name}\nCAMPAIGN GOAL: {campaign_goal}\nCAMPAIGN TONE: {campaign_tone}\n\nWrite the ice-breaker sentence FROM the sender TO this lead:",
                        f"gen-{lid[:8]}", user=user, max_tokens=120
                    )
                    personalized_opener = _extract_opener(opener_raw)
                    merged_body = (step_template.get("body", "") or "").replace("{{personalized_opener}}", personalized_opener)
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
        # Template campaigns may not have a personalized_emails entry yet —
        # auto-create one so the user can approve without a separate generation step.
        is_template = campaign.get("campaign_type") == "template"
        if is_template:
            step_template = (campaign.get("steps") or [{}])[0]
            await db.campaigns.update_one(
                {"id": cid},
                {"$push": {"personalized_emails": {
                    "lead_id": lead_id,
                    "subject": step_template.get("subject", ""),
                    "body": step_template.get("body", "") or "",
                    "body_html": step_template.get("body_html", "") or "",
                    "personalized_opener": "",
                    "status": "approved",
                    "generated_at": now_iso(),
                }}}
            )
        else:
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
    # For template campaigns, auto-generate entries for any leads that don't have one yet.
    is_template = campaign.get("campaign_type") == "template"
    if is_template:
        step_template = (campaign.get("steps") or [{}])[0]
        existing = {p["lead_id"] for p in campaign.get("personalized_emails", [])}
        for lid in campaign.get("lead_ids", []):
            if lid not in existing:
                await db.campaigns.update_one(
                    {"id": cid},
                    {"$push": {"personalized_emails": {
                        "lead_id": lid,
                        "subject": step_template.get("subject", ""),
                        "body": step_template.get("body", "") or "",
                        "body_html": step_template.get("body_html", "") or "",
                        "personalized_opener": "",
                        "status": "draft",
                        "generated_at": now_iso(),
                    }}}
                )
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

    # Mirrors enqueue_campaign's signature append (sender.py) — the test-send
    # preview must match what a real send actually includes.
    sig_id = campaign.get("signature_id")
    if sig_id:
        sig = await db.signatures.find_one({"id": sig_id, "workspace_id": wid}, {"_id": 0})
        if sig and sig.get("content_html") and body_html:
            body_html = body_html + "<br><br>" + sig["content_html"]

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
                snd = await _sender_context(campaign, user)
                research_pack = await get_research(wid, lead)
                research_summary = summarize_for_prompt(research_pack)
                opener_raw = await _llm_chat(
                    "You write ONE ice-breaker sentence that a cold sender opens their email with. You are the SENDER — never write as the lead or use their name/title/company as your identity; the LEAD is your prospect. Reference a REAL detail about the LEAD. 1-2 sentences, under 30 words, conversational, no greeting, no CTA, no subject line, no email body, no sign-off. Output ONLY the opener text. No quotes, no JSON, no preamble.\n\nExample:\nSENDER: Alex from Nova Web Works\nLEAD: Tom R., COO, Ridgeware — raised $12M Series A last month\nOUTPUT: Congrats on Ridgeware's Series A — the $12M round must have the operations team moving fast.",
                    f"SENDER (you): {snd['name'] or '(sender)'} at {snd['company'] or 'your company'} — {snd['what_we_do'] or 'Described by the campaign below.'}\nYou write TO the lead — the lead is your prospect, not you.\n\nLEAD PROFILE (recipient):\n{json.dumps(lead_context, indent=2)}\n\nLEAD RESEARCH:\n{research_summary}\n\nCAMPAIGN SERVICE: {campaign_name}\nCAMPAIGN GOAL: {campaign_goal}\nCAMPAIGN TONE: {campaign_tone}\n\nWrite the ice-breaker sentence FROM the sender TO this lead:",
                    f"regenall-opnr-{lid[:8]}", user=user, max_tokens=120
                )
                personalized_opener = _extract_opener(opener_raw)
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
SIGNATURE_VERSION_MIN_GAP_SECONDS = 300  # don't snapshot more than once per 5 min of active autosaving
SIGNATURE_VERSION_CAP = 20


@api.post("/signatures")
async def create_signature(body: SignatureIn, user=Depends(current_user)):
    sig = body.model_dump()
    ws = await db.workspaces.find_one({"id": user["workspace_id"]}, {"_id": 0, "signature_approval_required": 1})
    if (ws or {}).get("signature_approval_required"):
        sig["status"] = "pending_approval"
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


@api.get("/signatures/my-preference")
async def get_my_signature_preference(user=Depends(current_user)):
    """Signatures are a shared workspace pool (campaigns pick one by id, not
    per-user ownership) — this is the one per-user hook: a role/department
    signature policy (see /signature-policies/{id}/apply) can set this, and
    the campaign builder prefers it over the workspace-wide default when
    prefilling a new campaign's signature."""
    pref = await db.user_signature_prefs.find_one(
        {"workspace_id": user["workspace_id"], "user_id": user["id"]}, {"_id": 0, "signature_id": 1}
    )
    return {"signature_id": (pref or {}).get("signature_id")}


@api.delete("/signatures/{sid}")
async def delete_signature(sid: str, user=Depends(current_user)):
    result = await db.signatures.delete_one({"id": sid, "workspace_id": user["workspace_id"]})
    if result.deleted_count == 0:
        raise HTTPException(404, "Signature not found")
    await db.signature_versions.delete_many({"signature_id": sid})
    return {"ok": True}


@api.put("/signatures/{sid}")
async def update_signature(sid: str, body: SignatureIn, user=Depends(current_user)):
    current = await db.signatures.find_one({"id": sid, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not current:
        raise HTTPException(404, "Signature not found")

    # Version history: snapshot the PRE-update state, throttled so a burst of
    # autosaves (every ~1.2s while actively typing) doesn't flood the history
    # with keystroke-level checkpoints — only one snapshot per active editing
    # window at most.
    last_version = await db.signature_versions.find_one(
        {"signature_id": sid}, {"_id": 0, "at": 1}, sort=[("at", -1)]
    )
    last_at = last_version["at"] if last_version else current.get("created_at")
    stale_enough = True
    if last_at:
        try:
            age = (datetime.now(timezone.utc) - datetime.fromisoformat(last_at)).total_seconds()
            stale_enough = age >= SIGNATURE_VERSION_MIN_GAP_SECONDS
        except Exception:
            stale_enough = True
    if stale_enough:
        await db.signature_versions.insert_one({
            "id": new_id(), "signature_id": sid, "workspace_id": user["workspace_id"],
            "name": current.get("name"), "content_html": current.get("content_html"),
            "content_text": current.get("content_text"),
            "blocks_json": current.get("blocks_json", []), "style_json": current.get("style_json", {}),
            "at": now_iso(),
        })
        old_versions = await db.signature_versions.find(
            {"signature_id": sid}, {"_id": 0, "id": 1}
        ).sort("at", -1).skip(SIGNATURE_VERSION_CAP).to_list(1000)
        if old_versions:
            await db.signature_versions.delete_many({"id": {"$in": [v["id"] for v in old_versions]}})

    sig = body.model_dump()
    # Approval status only changes via the dedicated submit/approve/reject
    # routes below — never as a side effect of a routine (autosave-driven) edit.
    sig.pop("status", None)
    sig["updated_at"] = now_iso()
    await db.signatures.update_one(
        {"id": sid, "workspace_id": user["workspace_id"]},
        {"$set": sig}
    )
    updated = await db.signatures.find_one({"id": sid, "workspace_id": user["workspace_id"]}, {"_id": 0})
    return updated


@api.get("/signatures/{sid}/versions")
async def list_signature_versions(sid: str, user=Depends(current_user)):
    sig = await db.signatures.find_one({"id": sid, "workspace_id": user["workspace_id"]}, {"_id": 0, "id": 1})
    if not sig:
        raise HTTPException(404, "Signature not found")
    return await db.signature_versions.find(
        {"signature_id": sid}, {"_id": 0, "content_html": 0, "content_text": 0}
    ).sort("at", -1).to_list(SIGNATURE_VERSION_CAP)


@api.post("/signatures/{sid}/versions/{vid}/restore")
async def restore_signature_version(sid: str, vid: str, user=Depends(current_user)):
    version = await db.signature_versions.find_one(
        {"id": vid, "signature_id": sid, "workspace_id": user["workspace_id"]}, {"_id": 0}
    )
    if not version:
        raise HTTPException(404, "Version not found")
    return {"blocks_json": version.get("blocks_json", []), "style_json": version.get("style_json", {}),
            "name": version.get("name")}


class ApprovalSettingsIn(BaseModel):
    require_approval: bool


# NOTE: this path has 2 segments after /signatures/ deliberately — a single
# segment (e.g. /signatures/approval-settings) would collide with the
# PUT /signatures/{sid} route above, since {sid} is a wildcard that matches
# any string and that route is registered first.
@api.get("/signatures/settings/approval-required")
async def get_approval_settings(user=Depends(current_user)):
    ws = await db.workspaces.find_one({"id": user["workspace_id"]}, {"_id": 0, "signature_approval_required": 1})
    return {"require_approval": bool((ws or {}).get("signature_approval_required"))}


@api.post("/signatures/{sid}/submit-for-approval")
async def submit_signature_for_approval(sid: str, user=Depends(current_user)):
    result = await db.signatures.update_one(
        {"id": sid, "workspace_id": user["workspace_id"]}, {"$set": {"status": "pending_approval"}}
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Signature not found")
    await _audit(user, "signature.submit_for_approval", {"signature_id": sid})
    return {"ok": True, "status": "pending_approval"}


# NOTE: set_approval_settings / list_pending_signatures / approve_signature /
# reject_signature are defined further down, right after require_role() —
# they depend on it and require_role is defined later in this file.


class AiAssistIn(BaseModel):
    action: str  # improve_tagline | tone_professional | tone_executive | generate_disclaimer | accessibility
    text: str = ""
    context: Dict[str, Any] = {}


@api.post("/signatures/ai-assist")
async def signature_ai_assist(body: AiAssistIn, user=Depends(current_user)):
    prompts = {
        "improve_tagline": (
            "You write short, punchy professional email-signature taglines (one line, under 60 characters). "
            "Given the person's current tagline (or role/company if none), return ONLY the improved tagline text — "
            "no quotes, no explanation."
        ),
        "tone_professional": (
            "Rewrite the given text in a clear, professional tone suitable for a business email signature. "
            "Keep it brief. Return ONLY the rewritten text, no quotes, no explanation."
        ),
        "tone_executive": (
            "Rewrite the given text in a confident, executive tone suitable for a senior leader's email signature. "
            "Keep it brief. Return ONLY the rewritten text, no quotes, no explanation."
        ),
        "generate_disclaimer": (
            "Write a short (2-3 sentence), plain-English confidentiality disclaimer suitable for a company email "
            "signature, given the company name provided. Return ONLY the disclaimer text as a single paragraph, "
            "no quotes, no markdown, no explanation."
        ),
        "accessibility": (
            "You review email signature color/typography choices for accessibility. Given the primary text color, "
            "background (assume white), and font size in px, give at most 2 short, concrete suggestions to improve "
            "readability if needed, or say \"Looks good — no changes needed.\" if it's already accessible. "
            "Return ONLY the suggestion text, no markdown, no explanation."
        ),
    }
    system = prompts.get(body.action)
    if not system:
        raise HTTPException(400, "Unknown AI assist action")
    if not _llm_configured():
        raise HTTPException(503, "AI assistant is not configured")
    from billing import charge_credits
    await charge_credits(user["workspace_id"], "signature_ai_assist", meta={"kind": body.action})
    user_text = body.text.strip() or json.dumps(body.context)
    try:
        result = await _llm_chat(system, user_text, f"sig-ai-{user['id']}", user=user, max_tokens=200,
                                  agent="pitch", action="signature_ai_assist")
    except Exception as ex:
        raise HTTPException(502, f"AI assist failed: {ex}")
    return {"result": result.strip().strip('"')}


def inject_tracking(html: str, workspace_id: str, queue_id: str, base_url: str) -> str:
    """Inject open-tracking pixel and wrap links for click tracking."""
    pixel_url = f"{base_url}/t/o/{queue_id}"
    pixel = f'<img src="{pixel_url}" width="1" height="1" style="display:none" alt="" />'

    def _wrap(m):
        u = m.group(1)
        if u.startswith("#") or u.startswith("mailto:"):
            return m.group(0)
        return f'href="{base_url}/t/c/{queue_id}?u={quote(u, safe="")}"'

    html = re.sub(r'href="([^"]+)"', _wrap, html)

    if "</body>" in html:
        html = html.replace("</body>", f"{pixel}</body>")
    else:
        html += pixel
    return html


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


@api.get("/t/sig/{signature_id}")
@limiter.limit("60/minute")
async def track_signature_click(request: Request, signature_id: str, u: str = ""):
    """PUBLIC — the recipient's mail client follows this, not the signature's
    owner. Only ever bounces to an absolute http(s) URL, same guard as
    track_click above — mailto:/tel: links are never wrapped through here in
    the first place (see renderHtml.js), so there's nothing non-http to worry
    about, but the guard stays as defense in depth."""
    sig = await db.signatures.find_one({"id": signature_id}, {"_id": 0, "workspace_id": 1})
    if sig and u:
        await db.signature_clicks.insert_one({
            "id": new_id(), "signature_id": signature_id, "workspace_id": sig["workspace_id"],
            "url": u[:400], "at": now_iso(),
        })
    target = u if u.startswith("http://") or u.startswith("https://") else FRONTEND_URL
    return RedirectResponse(target, status_code=302)


@api.get("/signatures/{sid}/click-analytics")
async def signature_click_analytics(sid: str, user=Depends(current_user)):
    sig = await db.signatures.find_one({"id": sid, "workspace_id": user["workspace_id"]}, {"_id": 0, "id": 1})
    if not sig:
        raise HTTPException(404, "Signature not found")
    rows = await db.signature_clicks.find({"signature_id": sid}, {"_id": 0}).to_list(5000)
    by_url: Dict[str, int] = {}
    for r in rows:
        by_url[r["url"]] = by_url.get(r["url"], 0) + 1
    return {
        "total_clicks": len(rows),
        "by_url": sorted(
            [{"url": u, "clicks": c} for u, c in by_url.items()], key=lambda x: -x["clicks"]
        ),
    }


class CheckLinksIn(BaseModel):
    urls: List[str] = []


@api.post("/signatures/check-links")
async def check_signature_links(body: CheckLinksIn, user=Depends(current_user)):
    """HEAD-check each link server-side — a browser-side fetch would hit CORS
    on arbitrary third-party domains, so this has to run here."""
    import httpx
    results = []
    async with httpx.AsyncClient(follow_redirects=True, timeout=5.0) as client:
        for url in body.urls[:20]:
            if not (url.startswith("http://") or url.startswith("https://")):
                results.append({"url": url, "status": "skipped"})
                continue
            try:
                resp = await client.head(url)
                if resp.status_code >= 400:
                    resp = await client.get(url)  # some servers reject HEAD but allow GET
                results.append({"url": url, "status": "ok" if resp.status_code < 400 else "broken",
                                 "code": resp.status_code})
            except httpx.TimeoutException:
                results.append({"url": url, "status": "timeout"})
            except Exception:
                results.append({"url": url, "status": "broken"})
    return {"results": results}


@api.post("/campaigns/{cid}/pause")
async def pause_campaign(cid: str, user=Depends(current_user)):
    await db.campaigns.update_one(
        {"id": cid, "workspace_id": user["workspace_id"]},
        {"$set": {"status": "paused"}},
    )
    return {"ok": True}


@api.post("/campaigns/{cid}/complete")
async def complete_campaign(cid: str, user=Depends(current_user)):
    await db.campaigns.update_one(
        {"id": cid, "workspace_id": user["workspace_id"]},
        {"$set": {"status": "completed", "completed_at": now_iso()}},
    )
    return {"ok": True}


@api.post("/campaigns/{cid}/archive")
async def archive_campaign(cid: str, user=Depends(current_user)):
    allowed = ["completed", "draft", "paused"]
    c = await db.campaigns.find_one({"id": cid, "workspace_id": user["workspace_id"]}, {"_id": 0, "status": 1})
    if not c:
        raise HTTPException(404, "not found")
    if c.get("status") not in allowed:
        raise HTTPException(400, f"Cannot archive a {c['status']} campaign. Pause or complete it first.")
    await db.campaigns.update_one(
        {"id": cid, "workspace_id": user["workspace_id"]},
        {"$set": {"status": "archived", "archived_at": now_iso()}},
    )
    return {"ok": True}


@api.post("/campaigns/{cid}/quarantine")
async def quarantine_campaign(cid: str, user=Depends(current_user)):
    c = await db.campaigns.find_one({"id": cid, "workspace_id": user["workspace_id"]}, {"_id": 0, "status": 1})
    if not c:
        raise HTTPException(404, "not found")
    await db.campaigns.update_one(
        {"id": cid, "workspace_id": user["workspace_id"]},
        {"$set": {"status": "quarantined", "quarantined_at": now_iso()}},
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
PHI4_API_KEY = os.environ.get("PHI4_API_KEY", "")
PHI4_BASE_URL = os.environ.get("PHI4_BASE_URL", "https://agenticsuite-resource.services.ai.azure.com/openai/v1")
PHI4_MODEL = os.environ.get("PHI4_MODEL", "phi-4-mini-instruct")
ANTHROPIC_API_KEY_RAW = os.environ.get("ANTHROPIC_API_KEY", "")
PERPLEXITY_API_KEY = os.environ.get("PERPLEXITY_API_KEY", "")
# Legacy alias — existing modules gate on `if ANTHROPIC_API_KEY` to mean "some
# LLM provider is configured". Keep that semantic WITHOUT clobbering the real
# Anthropic key (that used to make it impossible to use both providers).
ANTHROPIC_API_KEY = ANTHROPIC_API_KEY_RAW or PERPLEXITY_API_KEY or PHI4_API_KEY
ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-6")

# Create EQ is short-form text generation — slide copy, a one-slide rewrite, a
# small brand-kit JSON — so it is pinned to the cheapest model instead of
# following _resolve_provider's auto order, which routes to whichever key
# happens to be set (Perplexity, in production). Haiku 4.5 is $1/$5 per 1M
# tokens against $3/$15 for Sonnet 4.6.
#
# Two constraints on this pin, both load-bearing:
#   * Haiku 4.5 rejects the `effort` parameter. _llm_chat_anthropic sends only
#     model/max_tokens/system/messages today, so this is safe — adding effort to
#     that shared path later would break Create EQ specifically.
#   * Haiku 4.5's prompt-cache minimum is 4096 tokens, well above the other
#     models', so these prompts will not cache. That is fine at this size, but
#     don't assume caching applies if the system prompts grow.
CREQ_LLM_PROVIDER = os.environ.get("CREATEEQ_LLM_PROVIDER", "anthropic")
CREQ_LLM_MODEL = os.environ.get("CREATEEQ_LLM_MODEL", "claude-haiku-4-5")


def _creq_llm_kwargs() -> Dict[str, Any]:
    """Provider/model override for Create EQ's calls into _llm_chat.

    Degrades to the default auto-routing when the pinned provider has no key
    configured — pinning unconditionally would take a deployment that has only
    a Perplexity or OpenAI key and turn every Create EQ generation into an auth
    error, which is a worse outcome than running on a pricier model.
    """
    if CREQ_LLM_PROVIDER == "anthropic" and not ANTHROPIC_API_KEY_RAW:
        return {}
    return {"provider": CREQ_LLM_PROVIDER, "model": CREQ_LLM_MODEL}
PERPLEXITY_MODEL = os.environ.get("PERPLEXITY_MODEL", "sonar-pro")
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
LLM_PROVIDER = os.environ.get("LLM_PROVIDER", "auto").strip().lower()
LLM_BASE_URL = os.environ.get("LLM_BASE_URL", "https://api.perplexity.ai")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")


def _llm_configured() -> bool:
    """True when any LLM provider key is configured."""
    return bool(PHI4_API_KEY or ANTHROPIC_API_KEY_RAW or PERPLEXITY_API_KEY or OPENAI_API_KEY or GEMINI_API_KEY)


def _resolve_provider(requested: Optional[str]) -> str:
    """phi-4 | perplexity | anthropic | openai — explicit provider param >
    LLM_PROVIDER env > auto. Auto prefers Phi-4 when its key is set (current
    production default), then Perplexity, then Anthropic, then OpenAI.
    Perplexity is OpenAI-API-compatible and spoken through the openai SDK
    (base_url → api.perplexity.ai); Phi-4 is the Azure serverless endpoint."""
    if requested:
        p = requested.strip().lower()
        if p in ("phi-4", "perplexity", "anthropic", "openai"):
            return p
        raise RuntimeError(f"unknown LLM provider: {requested}")
    env = LLM_PROVIDER
    if env in ("phi-4", "perplexity", "anthropic", "openai"):
        return env
    if PHI4_API_KEY:
        return "phi-4"
    if PERPLEXITY_API_KEY:
        return "perplexity"
    if ANTHROPIC_API_KEY_RAW:
        return "anthropic"
    if OPENAI_API_KEY:
        return "openai"
    raise RuntimeError("no LLM API key configured (set PHI4_API_KEY, PERPLEXITY_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY)")


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


def _extract_opener(raw: str) -> str:
    """Best-effort extraction of a generated ice-breaker opener.

    Prefers strict JSON ({"opener": "..."}), then falls back to plain prose
    — Phi-4-mini frequently ignores the STRICT-JSON instruction and answers
    with a sentence, a quoted line, or even a whole email draft. Returns the
    opener text or "".
    """
    if not raw:
        return ""
    raw = raw.strip()
    parsed = _extract_json(raw) or {}
    opener = parsed.get("opener") if isinstance(parsed, dict) else None
    if opener:
        return str(opener).strip()
    m = re.search(r'"opener"\s*:\s*"([^"]*)"', raw)
    if m:
        return m.group(1).strip()
    text = raw
    # Drop a chatty preamble ("Sure, here's an opener: ...").
    m = re.match(r'^(?:sure|certainly|here\'s|here is|of course)[^"\n]*?[:.]\s*"?(.*?)(?:"\s*)?$', text, re.S | re.I)
    if m:
        text = m.group(1).strip()
    # Phi-4 wraps prose answers in smart or ASCII quotes — peel both.
    text = text.strip().strip('\u201c\u201d"').strip()
    # Chop any email-style sign-off the model sneaked in ("Best regards,
    # [Your Name]" / "Thanks, ..."). A sign-off belongs in the template body,
    # never in an opener.
    m = re.search(
        r"(?i)(?:^|[.\n])\s*"
        r"((?:best|kind|warm|warmest|kindest|many|sincere)\s+regards"
        r"|regards|sincerely|yours\s+(?:truly|sincerely|faithfully)"
        r"|cheers|thanks(?:\s+(?:so\s+)?much)?|thank\s+you(?:\s+(?:so\s+)?much)?"
        r"|respectfully)\s*[,:]?\s*(?:\[?your\s+(?:name|company|signature)\]?)?",
        text,
    )
    if m:
        text = text[: m.start()].rstrip()
    # Drop a dangling "[Your Name]" placeholder with no preceding marker.
    text = re.sub(r"(?i)[\s,]*\[?your\s+(?:name|signature)\]?$", "", text).rstrip()
    # A whole email draft sometimes sneaks out — drop the subject line and
    # greeting lines, then keep only the first real sentence.
    lines = [ln.strip().strip('\u201c\u201d"').strip() for ln in re.split(r"\n{2,}", text)]
    lines = [ln for ln in lines if ln and not re.match(r"^(subject|re):", ln, re.I)]
    lines = [ln for ln in lines if not re.match(r"^(dear|hi|hello|hey|good\s+(morning|afternoon|evening))\b.*[.!?,]?\s*$", ln, re.I)]
    if lines:
        text = lines[0]
    # Trim an inline greeting prefix ("Hi Sarah — ..." / "Dear Sarah, ...").
    text = re.sub(r"^(dear|hi|hello|hey|good\s+(morning|afternoon|evening))\b[^.!?]*?[.,:;]\s+", "", text, flags=re.I).strip()
    text = re.sub(r"^[^\w\d\u2018\u201c'\"]", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:512]


def _extract_json(text: str) -> Optional[Dict[str, Any]]:
    """Pull the first JSON object out of an LLM response."""
    if not text:
        return None
    m = re.search(r"\{[\s\S]*\}", text)
    if not m:
        return None
    return _fix_json(m.group(0))


async def _llm_chat(system: str, user_text: str, session_id: str, user: Optional[Dict[str, Any]] = None, max_tokens: int = 2048,
                     agent: Optional[str] = None, action: Optional[str] = None,
                     provider: Optional[str] = None, model: Optional[str] = None) -> str:
    """Shared LLM chat — routes to phi-4 | perplexity | anthropic (see _resolve_provider).

    Both providers: rate-limited, retried with backoff, metered into
    token_usage_log, and gated on the daily LLM quota when `user` is passed."""
    if not _llm_configured():
        raise RuntimeError("no LLM API key configured (set PHI4_API_KEY, PERPLEXITY_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY)")
    if user and not await _rate_ok(user):
        raise RuntimeError("daily LLM quota exceeded")
    prov = _resolve_provider(provider)
    if prov == "phi-4":
        return await _llm_chat_phi4(system, user_text, user, max_tokens, agent, action, model)
    if prov == "perplexity":
        return await _llm_chat_perplexity(system, user_text, user, max_tokens, agent, action, model)
    if prov == "openai":
        return await _llm_chat_openai(system, user_text, user, max_tokens, agent, action, model)
    return await _llm_chat_anthropic(system, user_text, user, max_tokens, agent, action, model)


async def _llm_chat_phi4(system: str, user_text: str, user: Optional[Dict[str, Any]] = None,
                         max_tokens: int = 2048, agent: Optional[str] = None,
                         action: Optional[str] = None, model: Optional[str] = None) -> str:
    """Phi-4-mini-instruct via the Azure serverless OpenAI-compatible endpoint."""
    import openai
    client = openai.AsyncOpenAI(api_key=PHI4_API_KEY, base_url=PHI4_BASE_URL)
    mdl = model or PHI4_MODEL
    last_err = None
    for attempt in range(3):
        try:
            resp = await client.chat.completions.create(
                model=mdl,
                max_tokens=max_tokens,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user_text},
                ],
            )
            if user and resp.usage:
                from token_usage import record_llm_usage
                await record_llm_usage(
                    user.get("workspace_id"), mdl,
                    resp.usage.prompt_tokens, resp.usage.completion_tokens,
                    agent=agent, action=action, user_id=user.get("id"),
                )
            return resp.choices[0].message.content or ""
        except openai.RateLimitError as ex:
            last_err = ex
            await asyncio.sleep(2 ** attempt)
        except Exception as ex:
            raise RuntimeError(f"LLM call failed: {ex}") from ex
    raise RuntimeError(f"LLM call failed after retries: {last_err}")


async def _llm_chat_perplexity(system: str, user_text: str, user: Optional[Dict[str, Any]] = None,
                               max_tokens: int = 2048, agent: Optional[str] = None,
                               action: Optional[str] = None, model: Optional[str] = None) -> str:
    """Perplexity via its OpenAI-compatible API (openai SDK → api.perplexity.ai)."""
    import openai
    client = openai.AsyncOpenAI(api_key=PERPLEXITY_API_KEY, base_url=LLM_BASE_URL)
    mdl = model or PERPLEXITY_MODEL
    last_err = None
    for attempt in range(3):
        try:
            resp = await client.chat.completions.create(
                model=mdl,
                max_tokens=max_tokens,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user_text},
                ],
            )
            if user and resp.usage:
                from token_usage import record_llm_usage
                await record_llm_usage(
                    user.get("workspace_id"), mdl,
                    resp.usage.prompt_tokens, resp.usage.completion_tokens,
                    agent=agent, action=action, user_id=user.get("id"),
                )
            return resp.choices[0].message.content or ""
        except openai.RateLimitError as ex:
            last_err = ex
            await asyncio.sleep(2 ** attempt)
        except Exception as ex:
            raise RuntimeError(f"LLM call failed: {ex}") from ex
    raise RuntimeError(f"LLM call failed after retries: {last_err}")


async def _llm_chat_openai(system: str, user_text: str, user: Optional[Dict[str, Any]] = None,
                           max_tokens: int = 2048, agent: Optional[str] = None,
                           action: Optional[str] = None, model: Optional[str] = None) -> str:
    """OpenAI via the openai SDK (api.openai.com)."""
    import openai
    client = openai.AsyncOpenAI(api_key=OPENAI_API_KEY)
    mdl = model or OPENAI_MODEL
    last_err = None
    for attempt in range(3):
        try:
            resp = await client.chat.completions.create(
                model=mdl,
                max_tokens=max_tokens,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user_text},
                ],
            )
            if user and resp.usage:
                from token_usage import record_llm_usage
                await record_llm_usage(
                    user.get("workspace_id"), mdl,
                    resp.usage.prompt_tokens, resp.usage.completion_tokens,
                    agent=agent, action=action, user_id=user.get("id"),
                )
            return resp.choices[0].message.content or ""
        except openai.RateLimitError as ex:
            last_err = ex
            await asyncio.sleep(2 ** attempt)
        except Exception as ex:
            raise RuntimeError(f"LLM call failed: {ex}") from ex
    raise RuntimeError(f"LLM call failed after retries: {last_err}")


async def _llm_chat_anthropic(system: str, user_text: str, user: Optional[Dict[str, Any]] = None,
                              max_tokens: int = 2048, agent: Optional[str] = None,
                              action: Optional[str] = None, model: Optional[str] = None) -> str:
    """Anthropic Claude via the native anthropic SDK."""
    import anthropic
    client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY_RAW)
    mdl = model or ANTHROPIC_MODEL
    last_err = None
    for attempt in range(3):
        try:
            resp = await client.messages.create(
                model=mdl,
                max_tokens=max_tokens,
                system=system,
                messages=[{"role": "user", "content": user_text}],
            )
            if user and resp.usage:
                from token_usage import record_llm_usage
                await record_llm_usage(
                    user.get("workspace_id"), mdl,
                    resp.usage.input_tokens, resp.usage.output_tokens,
                    agent=agent, action=action, user_id=user.get("id"),
                )
            return "".join(b.text for b in resp.content if b.type == "text") or ""
        except anthropic.RateLimitError as ex:
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
@api.get("/queue")
async def list_queue(user=Depends(current_user), page: int = 1, per_page: int = 20, search: str = ""):
    wid = user["workspace_id"]
    skip = (page - 1) * per_page
    query: Dict[str, Any] = {"workspace_id": wid}
    if search:
        leads = await db.leads.find({
            "workspace_id": wid,
            "$or": [
                {"first_name": {"$regex": search, "$options": "i"}},
                {"last_name": {"$regex": search, "$options": "i"}},
                {"email": {"$regex": search, "$options": "i"}},
            ],
        }, {"_id": 0, "id": 1}).to_list(500)
        lead_ids = [l["id"] for l in leads]
        campaigns = await db.campaigns.find({
            "workspace_id": wid,
            "name": {"$regex": search, "$options": "i"},
        }, {"_id": 0, "id": 1}).to_list(500)
        campaign_ids = [c["id"] for c in campaigns]
        query["$or"] = [
            {"lead_id": {"$in": lead_ids}},
            {"campaign_id": {"$in": campaign_ids}},
            {"subject": {"$regex": search, "$options": "i"}},
            {"id": {"$regex": search, "$options": "i"}},
        ]
    total = await db.send_queue.count_documents(query)
    rows = await db.send_queue.find(query, {"_id": 0}).sort("send_at", 1).skip(skip).limit(per_page).to_list(per_page)
    for r in rows:
        lead = await db.leads.find_one({"id": r.get("lead_id")}, {"_id": 0, "first_name": 1, "last_name": 1, "email": 1, "company": 1})
        if lead:
            r["lead_name"] = f"{lead.get('first_name', '')} {lead.get('last_name', '')}".strip()
            r["lead_email"] = lead.get("email", "")
            r["lead_company"] = lead.get("company", "")
        campaign = await db.campaigns.find_one({"id": r.get("campaign_id")}, {"_id": 0, "name": 1})
        if campaign:
            r["campaign_name"] = campaign.get("name", "")
    return {"total": total, "page": page, "per_page": per_page, "rows": rows}

@api.get("/queue/all-ids")
async def list_queue_ids(user=Depends(current_user), search: str = ""):
    wid = user["workspace_id"]
    query: Dict[str, Any] = {"workspace_id": wid}
    if search:
        leads = await db.leads.find({
            "workspace_id": wid,
            "$or": [
                {"first_name": {"$regex": search, "$options": "i"}},
                {"last_name": {"$regex": search, "$options": "i"}},
                {"email": {"$regex": search, "$options": "i"}},
            ],
        }, {"_id": 0, "id": 1}).to_list(500)
        lead_ids = [l["id"] for l in leads]
        campaigns = await db.campaigns.find({
            "workspace_id": wid,
            "name": {"$regex": search, "$options": "i"},
        }, {"_id": 0, "id": 1}).to_list(500)
        campaign_ids = [c["id"] for c in campaigns]
        query["$or"] = [
            {"lead_id": {"$in": lead_ids}},
            {"campaign_id": {"$in": campaign_ids}},
            {"subject": {"$regex": search, "$options": "i"}},
            {"id": {"$regex": search, "$options": "i"}},
        ]
    ids = await db.send_queue.find(query, {"_id": 0, "id": 1}).sort("send_at", 1).to_list(5000)
    return {"ids": [r["id"] for r in ids]}

@api.post("/queue/delete")
async def delete_queue_items(body: Dict[str, Any], user=Depends(current_user)):
    ids = body.get("ids", [])
    if not ids:
        raise HTTPException(400, "No ids provided")
    result = await db.send_queue.delete_many({"id": {"$in": ids}, "workspace_id": user["workspace_id"]})
    return {"deleted": result.deleted_count}

def _pct_change(current: float, previous: float) -> Optional[float]:
    """Percent change, or None when it cannot honestly be expressed.

    A change from zero has no percentage (it is an infinite increase), and the
    design system forbids inventing a number to fill the slot — see §24.16 and
    §4.2 in docs/design-system.md. Returning None makes the UI omit the delta
    row rather than print a fabricated one.
    """
    if not previous:
        return None
    return round((current - previous) / previous * 100, 1)


def _pp_change(current: float, previous: float) -> Optional[float]:
    """Percentage-POINT change, for metrics that are themselves percentages.

    An open rate moving 20% -> 25% is +5.0 points, not +25%. Reporting the
    percent change of a percentage is a classic dashboard lie, so rates get
    this and counts get _pct_change.
    """
    if previous is None or current is None:
        return None
    return round(current - previous, 1)


@api.get("/dashboard")
async def dashboard(days: int = 30, user=Depends(current_user)):
    """Workspace KPIs for a rolling window, with the previous equal-length
    window alongside so every metric can carry the comparison §4.2 requires.

    `days` bounds the headline figures. `kpis_all_time` keeps the lifetime
    totals this endpoint used to return on its own, so nothing that depended on
    them loses data — but the headline numbers are now windowed, because a
    lifetime total with a "vs last month" delta beside it describes nothing.
    """
    wid = user["workspace_id"]
    days = max(1, min(int(days or 30), 365))
    now = datetime.now(timezone.utc)
    cur_start = (now - timedelta(days=days)).isoformat()
    prev_start = (now - timedelta(days=days * 2)).isoformat()

    # `at` is an ISO-8601 UTC string, so lexicographic >= is chronological.
    # Querying from prev_start rather than loading the whole collection keeps
    # this bounded as a workspace ages — the old code capped at 20k events and
    # silently truncated beyond that.
    windowed = await db.events.find(
        {"workspace_id": wid, "at": {"$gte": prev_start}}, {"_id": 0}
    ).to_list(50000)
    cur_events = [e for e in windowed if e.get("at", "") >= cur_start]
    prev_events = [e for e in windowed if e.get("at", "") < cur_start]

    events = await db.events.find({"workspace_id": wid}, {"_id": 0}).to_list(20000)
    campaigns_count = await db.campaigns.count_documents({"workspace_id": wid})
    leads_count = await db.leads.count_documents({"workspace_id": wid})
    active_campaigns = await db.campaigns.count_documents({"workspace_id": wid, "status": "active"})
    mailboxes = await db.mailboxes.count_documents({"workspace_id": wid})
    queue_pending = await db.send_queue.count_documents({"workspace_id": wid, "status": "pending"})
    queue_sending = await db.send_queue.count_documents({"workspace_id": wid, "status": "sending"})
    queue_failed = await db.send_queue.count_documents({"workspace_id": wid, "status": "failed"})
    def c(t): return sum(1 for e in events if e["type"] == t)
    sent, opened, clicked, replied, mtg = c("sent"), c("opened"), c("clicked"), c("replied"), c("meeting_booked")

    # per-day trend (last 7 days). Named distinctly from the outer `days`
    # (the window-length int used below for period.label) — this used to
    # shadow it, so the dashboard rendered "vs previous {...trend dict...}
    # days" instead of "vs previous 30 days".
    daily = {}
    for e in events:
        d = e["at"][:10]
        daily.setdefault(d, {"sent": 0, "opened": 0, "replied": 0})
        if e["type"] in daily[d]:
            daily[d][e["type"]] += 1
    trend = [{"date": k, **v} for k, v in sorted(daily.items())][-7:]

    def _kpis(evs):
        n = lambda t: sum(1 for e in evs if e["type"] == t)
        s, o, cl, r, m = n("sent"), n("opened"), n("clicked"), n("replied"), n("meeting_booked")
        return {
            "sent": s, "opened": o, "clicked": cl, "replied": r, "meetings": m,
            "open_rate": round((o / s * 100) if s else 0, 1),
            "reply_rate": round((r / s * 100) if s else 0, 1),
            "meeting_rate": round((m / s * 100) if s else 0, 1),
        }

    cur, prev = _kpis(cur_events), _kpis(prev_events)
    # Counts compare as percent change; rates compare as percentage POINTS.
    deltas = {
        **{k: _pct_change(cur[k], prev[k]) for k in ("sent", "opened", "clicked", "replied", "meetings")},
        **{k: _pp_change(cur[k], prev[k]) for k in ("open_rate", "reply_rate", "meeting_rate")},
    }

    return {
        "kpis": cur,
        "kpis_previous": prev,
        "deltas": deltas,
        # The unit tells the UI which suffix to render, so a percentage-point
        # move is never mislabelled as a percentage.
        "delta_units": {
            "sent": "%", "opened": "%", "clicked": "%", "replied": "%", "meetings": "%",
            "open_rate": "pp", "reply_rate": "pp", "meeting_rate": "pp",
        },
        "period": {"days": days, "label": f"vs previous {days} days"},
        # Lifetime totals, preserved so nothing that relied on the old
        # all-time behaviour silently loses its numbers.
        "kpis_all_time": {
            "sent": sent, "opened": opened, "clicked": clicked, "replied": replied,
            "meetings": mtg,
            "open_rate": round((opened / sent * 100) if sent else 0, 1),
            "reply_rate": round((replied / sent * 100) if sent else 0, 1),
            "meeting_rate": round((mtg / sent * 100) if sent else 0, 1),
        },
        "counts": {
            "campaigns": campaigns_count, "active_campaigns": active_campaigns,
            "leads": leads_count, "mailboxes": mailboxes,
            "queue_pending": queue_pending, "queue_sending": queue_sending, "queue_failed": queue_failed,
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
    from urllib.parse import urlparse
    import socket
    try:
        host = urlparse(url).hostname
        ip = socket.gethostbyname(host)
        priv = ip.startswith(("127.", "10.", "169.254.", "192.168.", "172.16.", "172.17.", "172.18.", "172.19.", "172.20.", "172.21.", "172.22.", "172.23.", "172.24.", "172.25.", "172.26.", "172.27.", "172.28.", "172.29.", "172.30.", "172.31."))
        if priv or ip == "::1" or ip == "0.0.0.0":
            return ""
    except Exception:
        return ""
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
class PostingCadence(BaseModel):
    days_per_week: int = 3
    preferred_platforms: List[str] = []


class BrandVoiceIn(BaseModel):
    tone: str = "warm"
    offer: str = ""
    icp_description: str = ""
    banned_phrases: List[str] = []
    sample: str = ""
    # Social EQ additions — same document, not a parallel "positioning profile".
    content_pillars: List[str] = []
    posting_cadence: PostingCadence = PostingCadence()
    persona_type: Optional[str] = None  # individual|influencer|enterprise|startup|solo_company
    brand_kit_id: Optional[str] = None  # which db.brandkits doc content generation should use


@api.get("/workspace/brand-voice")
async def get_brand_voice(user=Depends(current_user)):
    ws = await db.workspaces.find_one({"id": user["workspace_id"]}, {"_id": 0, "brand_voice": 1})
    bv = (ws or {}).get("brand_voice") or {}
    return {
        "tone": bv.get("tone", "warm"), "offer": bv.get("offer", ""),
        "icp_description": bv.get("icp_description", ""),
        "banned_phrases": bv.get("banned_phrases", []), "sample": bv.get("sample", ""),
        "content_pillars": bv.get("content_pillars", []),
        "posting_cadence": bv.get("posting_cadence") or {"days_per_week": 3, "preferred_platforms": []},
        "persona_type": bv.get("persona_type"),
        "brand_kit_id": bv.get("brand_kit_id"),
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


# ---- AI ICP Generator (from closed-won deals) -----
class IcpGenerationResult(BaseModel):
    titles: List[str] = []
    industries: List[str] = []
    company_sizes: List[str] = []
    locations: List[str] = []
    seniority: List[str] = []
    keywords: List[str] = []
    description: str = ""
    rationale: str = ""


@api.post("/icp/generate-from-deals")
async def icp_generate_from_deals(user=Depends(current_user)):
    """Analyze closed-won deals and their associated leads to build an ICP profile."""
    deals = await db.deals.find({
        "workspace_id": user["workspace_id"],
        "stage": "closed_won",
    }, {"_id": 0}).to_list(50)
    if not deals:
        raise HTTPException(400, "No closed-won deals found — mark at least one deal as Closed Won first.")

    lead_refs = set()
    for d in deals:
        for f in ("lead_id", "contact_id", "email"):
            v = d.get(f)
            if v:
                lead_refs.add(v)
        for c in (d.get("contacts") or []):
            if isinstance(c, dict):
                lead_refs.add(c.get("id") or c.get("email", ""))
            elif isinstance(c, str):
                lead_refs.add(c)

    leads = await db.leads.find({
        "workspace_id": user["workspace_id"],
        "$or": [{"id": {"$in": list(lead_refs)}}, {"email": {"$in": list(lead_refs)}}],
    }, {"_id": 0}).to_list(100)

    sample = []
    for d in deals:
        row = {
            "deal_name": d.get("name", "Unnamed"),
            "deal_value": d.get("value", 0),
            "company": d.get("company", ""),
            "industry": d.get("industry", ""),
        }
        match = next((l for l in leads if l.get("id") == d.get("lead_id") or l.get("email") == d.get("email")), None)
        if match:
            row["lead_title"] = match.get("title", "")
            row["lead_company"] = match.get("company", "")
            row["lead_industry"] = match.get("industry", "")
            row["lead_location"] = match.get("location", "")
            row["lead_revenue"] = match.get("revenue", "")
            row["lead_employees"] = match.get("employees", "")
        sample.append(row)

    prompt = f"""You are an ICP (Ideal Customer Profile) analyst. Analyze these {len(sample)} closed-won deals and their associated leads to generate an ICP.

For each field, provide the most common values observed:
- titles: job titles of buyers (array of strings)
- industries: target industries (array of strings)
- company_sizes: employee count ranges like ["1-10","11-50","51-200","201-500","501-1000","1001+"]
- locations: target locations (array of strings)
- seniority: seniority levels like ["C-Level","VP","Director","Manager","Individual"]
- keywords: firmographic/buying-signal keywords
- description: a concise 2-3 sentence ICP description
- rationale: why this ICP fits based on the data

Return valid JSON with these exact keys.

Deal data:
{json.dumps(sample, indent=2)}"""

    try:
        from ai_utils import llm_chat
        result_text = await llm_chat(
            system="You are an ICP analyst. Return ONLY valid JSON. No markdown, no backticks.",
            user_text=prompt,
            session_id=f"icp-gen-{user['workspace_id']}",
            user=user,
            max_tokens=4096,
        )
        result_text = result_text.strip().removeprefix("```json").removesuffix("```").strip()
        result = json.loads(result_text)
    except Exception as ex:
        raise HTTPException(502, f"LLM generation failed: {ex}")

    icp = IcpGenerationResult(
        titles=result.get("titles", []),
        industries=result.get("industries", []),
        company_sizes=result.get("company_sizes", []),
        locations=result.get("locations", []),
        seniority=result.get("seniority", []),
        keywords=result.get("keywords", []),
        description=result.get("description", ""),
        rationale=result.get("rationale", ""),
    )

    await _audit(user, "icp.generate_from_deals", {"deal_count": len(deals), "lead_count": len(leads)})
    return icp.model_dump()


# ---- Pre-enrichment filter engine + Audience estimation -----
class EnrichmentFilterIn(BaseModel):
    list_id: Optional[str] = None
    industries: List[str] = []
    min_employees: Optional[int] = None
    max_employees: Optional[int] = None
    min_revenue: Optional[float] = None
    locations: List[str] = []
    title_keywords: List[str] = []
    seniority: List[str] = []
    exclude_domains: List[str] = []


@api.post("/enrichment/estimate")
async def enrichment_estimate(filters: EnrichmentFilterIn, user=Depends(current_user)):
    """Estimate audience reach/coverage before executing paid enrichment."""
    from lead_sources import estimate_prospects
    match, total, breakdown = await estimate_prospects(
        workspace_id=user["workspace_id"],
        filters=filters.model_dump(),
    )
    return {
        "total_prospects": total,
        "matched_prospects": match,
        "match_rate_pct": round(match / total * 100, 1) if total else 0,
        "coverage_breakdown": breakdown,
        "filters_applied": filters.model_dump(exclude_none=True),
    }


@api.post("/enrichment/preflight")
async def enrichment_preflight(filters: EnrichmentFilterIn, user=Depends(current_user)):
    """Run pre-enrichment filter gates: dedup, firmographic, buying-signal checks."""
    result = {
        "duplicates_removed": 0,
        "firmographic_passed": 0,
        "firmographic_removed": 0,
        "buying_signal_matched": 0,
        "total_input": 0,
        "total_after_filters": 0,
        "gates": [],
    }

    from lead_sources import run_enrichment_filters
    gates = await run_enrichment_filters(
        workspace_id=user["workspace_id"],
        filters=filters.model_dump(),
    )
    result["gates"] = gates
    for g in gates:
        if g["gate"] == "duplicates":
            result["duplicates_removed"] = g.get("removed", 0)
        elif g["gate"] == "firmographic":
            result["firmographic_passed"] = g.get("passed", 0)
            result["firmographic_removed"] = g.get("removed", 0)
        elif g["gate"] == "buying_signal":
            result["buying_signal_matched"] = g.get("matched", 0)

    result["total_input"] = gates[0].get("input", 0) if gates else 0
    result["total_after_filters"] = gates[-1].get("output", 0) if gates else 0
    return result


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
    logo_size: str = "l"              # s | m | l | xl
    logo_position: str = "bl"         # tl | tr | bl | br


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
    "square": {"w": 1080, "h": 1080, "label": "Instagram Square"},
    "instagram_story": {"w": 1080, "h": 1920, "label": "Instagram Story / Reel"},
    "twitter": {"w": 1080, "h": 1350, "label": "Twitter Cheat Sheet"},
}
CUSTOM_DIM_MIN, CUSTOM_DIM_MAX = 320, 2160


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
    # "standard" = today's single hook/body/cta pass (cheap, fast, unchanged).
    # "premium" = richer per-slide creative brief (narrative/intent/emotion/
    # hierarchy) that the frontend's composition engine uses to pick a
    # content-aware layout instead of one fixed template — see
    # docs/createeq-handbook/ch16-creative-reasoning-engine.md. Costs more
    # credits (billing.CREDIT_COSTS["carousel_generate_premium"]) because it's
    # a materially richer completion, not because it's slower or chained.
    design_mode: str = "standard"
    # platform="custom" pairs with these — any other platform value ignores
    # them and uses PLATFORM_DIMS[platform] instead.
    custom_w: Optional[int] = None
    custom_h: Optional[int] = None


class CarouselEditIn(BaseModel):
    project_id: str
    slide_index: int
    instruction: str


class BrandFromUrlIn(BaseModel):
    url: str


# Expanded intent taxonomy for design_mode="premium" — lets the frontend's
# composition engine pick a content-aware layout instead of the one fixed
# hook/body/cta template every standard-mode slide gets. See
# docs/createeq-handbook/ch16-creative-reasoning-engine.md §16.3.1 for why
# this is one richer structured call rather than a chain of calls: narrative,
# intent classification, visual metaphor, editorial direction, and emotion
# are all things a single well-specified JSON schema can produce in one
# completion — density scoring, composition selection, typography scale, and
# novelty tracking are deliberately NOT asked of the model here; they're pure
# arithmetic/rules-table logic done in the frontend against real generated
# text, which is both cheaper and more reliable than asking an LLM to reason
# about its own output's word count.
CREQ_PREMIUM_KINDS = [
    "warning", "celebration", "proof", "comparison", "timeline", "failure", "success",
    "statistics", "framework", "prediction", "story", "quote", "lesson", "question",
    "cta", "checklist", "myth", "reality",
]
CREQ_PREMIUM_EMOTIONS = [
    "urgency", "hope", "luxury", "curiosity", "fear", "confidence", "authority",
    "wonder", "excitement", "calm",
]
CREQ_PREMIUM_DIRECTIONS = [
    "swiss", "minimal", "magazine", "financial", "startup", "luxury", "documentary",
    "scientific", "poster", "report",
]

# --- Claude Design system (premium mode) ---------------------------------
# The model chooses FROM this system; it never invents colour or position.
# Every hex, type size, margin and anchor lives in
# frontend/src/lib/creqClaudeDesign.js — these ids are the contract between
# the two. Keep them in sync with PALETTE_FAMILIES / ARCHETYPES there.
#
# This replaced an earlier design where the model returned five free-form hex
# values per deck ("deck_theme"). That reliably produced off-system palettes:
# an LLM asked for "a cohesive 5-colour identity" returns plausible-sounding
# but generic colour, and no amount of prompt tightening fixed the underlying
# problem, which is that palette construction is a design-system decision, not
# a per-request creative one.
CREQ_PALETTE_FAMILIES = {
    "claude": "Warm ivory paper, book-cloth clay accent, warm near-black ink. Editorial and human. The default — use unless the topic argues otherwise.",
    "sage": "Cool chalk paper, deep evergreen accent. Quieter and institutional — sustainability, health, research, policy.",
    "oxide": "Bone paper, oxidised steel-blue accent. Technical and precise — engineering, finance, data, infrastructure.",
    "mocha": "Cream paper, espresso ink, caramel accent. Warm, tactile, premium — hospitality, food, beauty, craft.",
    "cobalt": "Porcelain paper, true cobalt accent. Confident and modern — fintech, B2B software, enterprise.",
    "amber": "Charcoal ground, signal-amber accent. High contrast and energetic — developer tools, data, events.",
    "plum": "Blush paper, deep plum accent. Editorial and distinctive — fashion, media, culture, brand work.",
    "teal": "Sand paper, deep teal accent. Calm and considered — healthcare, education, non-profit, wellbeing.",
}
CREQ_ARCHETYPES = {
    "cover": "Opening slide. Big display title anchored low, short eyebrow above, one supporting line.",
    "statement": "One assertion carrying the whole slide. Very short title, optional supporting sentence.",
    "stat": "One number is the point. REQUIRES stat.value (short, e.g. '3.7x', '68%', '12 days') and stat.label.",
    "list": "Three or four parallel points. REQUIRES items[] with label + text.",
    "steps": "An ordered sequence where order matters. REQUIRES items[] with label + text.",
    "two_column": "A heading against explanatory copy. Title short, body carries the detail.",
    "quote": "A quotation. REQUIRES quote.text and quote.attribution.",
    "compare": "Two opposed options, before/after, or myth/reality. REQUIRES exactly 2 items[]; item 2 is the favoured side.",
    "closer": "Final slide. Lands the argument and gives one action. Provide cta.",
}


def _default_slides(topic: str, n: int) -> List[Dict[str, Any]]:
    slides = [{"kind": "hook", "title": topic, "subtitle": "A short, sharp take", "body": ""}]
    for i in range(n - 2):
        slides.append({"kind": "body", "title": f"Point {i + 1}", "subtitle": "", "body": "Add insight here."})
    slides.append({"kind": "cta", "title": "Your turn", "subtitle": "", "body": "Follow for more.", "cta": "Follow"})
    return slides


@api.post("/carousel/generate")
async def carousel_generate(body: CarouselGenIn, user=Depends(current_user)):
    # Not rate-limited via @limiter here: this function is also called
    # directly (not through HTTP) by social_eq.py's carousel content-type
    # branch, which has no Request object to key off. carousel_ai_image
    # below — the pure HTTP entry point for AI image generation — carries
    # the rate limit instead.
    if body.platform == "custom":
        w, h = body.custom_w, body.custom_h
        if not w or not h:
            raise HTTPException(400, "custom_w and custom_h are required when platform is 'custom'")
        if not (CUSTOM_DIM_MIN <= w <= CUSTOM_DIM_MAX) or not (CUSTOM_DIM_MIN <= h <= CUSTOM_DIM_MAX):
            raise HTTPException(400, f"custom dimensions must be between {CUSTOM_DIM_MIN} and {CUSTOM_DIM_MAX}px")
        canvas_dims = {"w": w, "h": h}
    elif body.platform not in PLATFORM_DIMS:
        raise HTTPException(400, "invalid platform")
    else:
        canvas_dims = {"w": PLATFORM_DIMS[body.platform]["w"], "h": PLATFORM_DIMS[body.platform]["h"]}
    slides: List[Dict[str, Any]] = []
    palette_family: Optional[str] = None
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
    premium = body.design_mode == "premium"
    if _llm_configured():
        from billing import charge_credits
        credit_action = "carousel_generate_premium" if premium else "carousel_generate"
        await charge_credits(user["workspace_id"], credit_action,
                              meta={"platform": body.platform, "slides": body.slide_count})
        if premium:
            brand_locked = body.brand is not None
            if brand_locked:
                bk = body.brand
                wordmark = f' The wordmark reads "{bk.logo_text}".' if bk.logo_text else ""
                brand_clause = (
                    f"This deck is brand-locked: the client's colours ({bk.bg} background, {bk.accent} "
                    f"accent, {bk.text} text) are already wired into the design system downstream.{wordmark} "
                    f"Do NOT return palette_family and do not mention or describe colour anywhere in your "
                    f"output — colour is not your decision on this deck."
                )
            else:
                families = "\n".join(f"  - {k}: {v}" for k, v in CREQ_PALETTE_FAMILIES.items())
                brand_clause = (
                    "Choose ONE palette family for the whole deck and return it as top-level "
                    f"'palette_family'. These are the only valid values:\n{families}\n"
                    "Pick on subject matter, not decoration. Do NOT return hex values anywhere — the "
                    "design system owns every colour, surface and contrast decision. Your job is to pick "
                    "the family and then write copy that suits it."
                )
            archetypes = "\n".join(f"  - {k}: {v}" for k, v in CREQ_ARCHETYPES.items())
            system = (
                f"You are Create EQ's Creative Director. You work the way a senior editorial designer works "
                f"on a real deck: understand the argument, decide what each slide has to do, choose the "
                f"structure that does it, THEN write copy into that structure. Never write copy first and "
                f"hope a layout fits it.\n\n"
                f"Return EXACTLY {body.slide_count} slides. Tone: {body.tone}.\n\n"
                f"{brand_clause}\n\n"
                f"LAYOUT IS CHOSEN, NOT DECORATED. For each slide pick an 'archetype' — the only valid "
                f"values are:\n{archetypes}\n\n"
                f"CRITICAL — the archetype determines which fields you must fill. A 'stat' slide with no "
                f"stat.value, a 'list' with no items[], a 'quote' with no quote.text, or a 'compare' with "
                f"fewer than 2 items is a BROKEN slide: it will render empty. If you cannot supply the "
                f"required structured fields for an archetype, choose a different archetype that fits the "
                f"content you actually have. Never fake a stat you do not have.\n\n"
                f"Slide 1 must be archetype 'cover'. The final slide must be archetype 'closer' and carry a "
                f"'cta'. In between, vary the archetype — three 'two_column' slides in a row is a failure. "
                f"Do not use the same archetype twice consecutively.\n\n"
                f"Before writing copy for a slide, decide:\n"
                f"1. narrative: {{message, visual_metaphor}} — the one thing this slide argues, and a "
                f"CONCRETE real-world scene for it ('abandoned mailbox', 'climbing staircase', 'domino "
                f"chain'), never an abstract noun like 'growth' or 'change'.\n"
                f"2. kind: one of {CREQ_PREMIUM_KINDS} — the rhetorical intent behind the archetype.\n"
                f"3. editorial_direction: one of {CREQ_PREMIUM_DIRECTIONS}.\n"
                f"4. emotion_primary: one of {CREQ_PREMIUM_EMOTIONS} — must not contradict the narrative.\n"
                f"5. surface_intent: 'light' or 'dark' — whether this slide should feel like a pause or a "
                f"punch. This is a HINT; the design system decides the final rhythm across the deck.\n\n"
                f"COPY RULES — these exist because the layout has real, fixed space:\n"
                f"  - eyebrow: 1-3 words, a label not a sentence (e.g. 'The problem', 'Q3 result').\n"
                f"  - title: <=8 words. On 'statement' and 'cover' slides, <=6 words hits hardest.\n"
                f"  - subtitle: <=12 words, omit unless it adds something the title does not.\n"
                f"  - body: 20-40 words. Below 15 the slide looks empty; above 45 it overruns and gets cut.\n"
                f"  - items[].label: <=4 words. items[].text: 10-20 words each.\n"
                f"  - stat.value: <=8 characters ('3.7x', '68%', '12 days'). stat.label: <=5 words.\n"
                f"  - Plain prose. No emojis, no hashtags, no markdown, no bold markers, no citation "
                f"brackets. Specifics beat adjectives: a number, a name, or a consequence every time.\n\n"
                f"Check your own output before returning it: every slide's required fields present for its "
                f"archetype, no two adjacent slides sharing an archetype, and the deck reading as one "
                f"argument from cover to closer.\n\n"
            )
            family_schema = "" if brand_locked else '"palette_family":str,'
            system += (
                "STRICT JSON only: {"
                + family_schema +
                '"slides":[{"archetype":str,"kind":str,"surface_intent":str,'
                '"narrative":{"message":str,"visual_metaphor":str},'
                '"editorial_direction":str,"emotion_primary":str,'
                '"eyebrow":str,"title":str,"subtitle":str,"body":str,'
                '"items":[{"label":str,"text":str}],'
                '"stat":{"value":str,"label":str},'
                '"quote":{"text":str,"attribution":str},"cta":str}]}\n'
                "Omit items/stat/quote entirely on slides whose archetype does not use them."
            )
        else:
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
            # Output is one JSON object per slide, so the ceiling scales with the
            # deck rather than sitting at the shared 2048 default. This caps the
            # worst case; it does not by itself reduce a normal response. Premium
            # mode's schema is ~3x richer per slide (plus one deck_theme object
            # when the model is also inventing the palette), so it gets a taller
            # ceiling.
            resp = await _llm_chat(
                system, user_text, f"creq-gen-{user['id']}", user=user,
                max_tokens=min(8192, 500 + body.slide_count * (600 if premium else 200)),
                **_creq_llm_kwargs(),
            )
            parsed = _extract_json(resp)
            if parsed and parsed.get("slides"):
                slides = parsed["slides"][: body.slide_count]
                if premium and not brand_locked:
                    pf = parsed.get("palette_family")
                    # Constrained choice, not free text — an unrecognised value
                    # falls back to the default family rather than propagating
                    # something the frontend design system has no tokens for.
                    if isinstance(pf, str) and pf in CREQ_PALETTE_FAMILIES:
                        palette_family = pf
        except Exception as ex:
            logging.warning("carousel gen fallback: %s", ex)
    if not slides:
        slides = _default_slides(body.topic, body.slide_count)

    # Brand resolution: an explicitly supplied brand kit is a hard constraint.
    # Premium decks without one no longer carry an invented palette here —
    # colour comes from the chosen palette_family, resolved against the design
    # system in frontend/src/lib/creqClaudeDesign.js.
    brand = body.brand.model_dump() if body.brand is not None else BrandKit().model_dump()

    proj_id = new_id()
    doc = {
        "id": proj_id, "workspace_id": user["workspace_id"], "owner_id": user["id"],
        "topic": body.topic, "platform": body.platform, "brand": brand,
        "slides": slides, "design_mode": body.design_mode, "canvas": canvas_dims,
        "created_at": now_iso(), "updated_at": now_iso(),
    }
    # Premium decks record which design-system family they were composed
    # against, so reopening or regenerating a slide later resolves the same
    # surfaces instead of drifting to the default.
    if premium:
        doc["palette_family"] = "brand" if body.brand is not None else (palette_family or "claude")
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


# MUST stay above the /carousel/{pid} route below. Starlette matches routes in
# registration order, so with {pid} first this literal path was captured as
# pid="images" and every gallery load 404'd with "not found".
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
        # Blob-backed rows serve straight from storage; rows written before
        # blob storage existed keep the legacy proxy URL so old galleries
        # don't break. thumb_url is what the grid should render — the full
        # image is only fetched when the user opens it.
        if item.get("blob_path"):
            item["image_url"] = blob_storage.read_url(item["blob_path"])
            item["thumb_url"] = blob_storage.read_url(item.get("thumb_path", "")) or item["image_url"]
        else:
            item["image_url"] = f"{base}/api/carousel/image/{item['id']}?t={item.get('access_token', '')}"
            item["thumb_url"] = item["image_url"]
    return items


@api.get("/carousel/{pid}")
async def carousel_get(pid: str, user=Depends(current_user)):
    doc = await db.carousels.find_one({"id": pid, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "not found")
    return doc


@api.put("/carousel/{pid}")
async def carousel_update(pid: str, body: Dict[str, Any], user=Depends(current_user)):
    allowed = {k: v for k, v in body.items() if k in {
        "slides", "brand", "platform", "topic", "palette_id", "ai_palette", "palette_family", "canvas", "panorama",
        "show_slide_numbers", "show_progress_dots", "show_swipe_hint", "show_branding",
        # Styling for the "Made with…" branding line. Must be listed here or the
        # editor's controls appear to work and then silently reset on reload.
        "branding_size", "branding_color", "branding_opacity",
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
    if _llm_configured():
        system = (
            "You are Create EQ's touch-edit interface. Rewrite the ONE slide provided per the user's "
            "instruction, preserving its kind. Keep title <=8 words, body <=45 words. STRICT JSON only: "
            '{"title":str,"subtitle":str,"body":str,"cta":str}'
        )
        prompt = f"Slide: {json.dumps(current)}\nInstruction: {body.instruction}"
        try:
            # Rewrites exactly one slide — a few hundred tokens of JSON.
            resp = await _llm_chat(
                system, prompt, f"creq-edit-{user['id']}", user=user, max_tokens=600,
                **_creq_llm_kwargs(),
            )
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
    if _llm_configured() and text:
        system = (
            "Extract a brand kit from a company's website snippet. Guess primary background hex, "
            "accent hex, text hex, and a font family (choose from Inter, Manrope, Poppins, IBM Plex Sans, "
            "Space Grotesk). Return STRICT JSON: {\"bg\":str,\"accent\":str,\"text\":str,\"font\":str,\"logo_text\":str}"
        )
        try:
            # Returns a five-field JSON object. The page text is fetched by
            # _fetch_url above, so this needs extraction, not a search-grounded
            # model — nothing is lost by moving it off Perplexity.
            resp = await _llm_chat(
                system, text, f"creq-brand-{user['id']}", user=user, max_tokens=400,
                **_creq_llm_kwargs(),
            )
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


class AssetSearchIn(BaseModel):
    query: str = ""
    slide_content: Optional[Dict[str, Any]] = None  # if set, derives search terms from this instead of query
    target_aspect: Optional[float] = None  # width/height of the slot being filled, for ranking


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
            from token_usage import record_image_usage
            await record_image_usage(user["workspace_id"], "gpt-image-1", agent="create", action="ai_image", user_id=user.get("id"))
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
        from token_usage import record_image_usage
        await record_image_usage(user["workspace_id"], "nano-banana", agent="create", action="ai_image", user_id=user.get("id"))
        return {"image_bytes": bytes(img_bytes), "mime_type": mime_type, "provider": "nano-banana"}
    except HTTPException:
        raise
    except Exception as ex:
        logging.warning("nano-banana gen error: %s", ex)
        raise HTTPException(502, f"nano-banana failed: {ex}")


@api.post("/carousel/ai-image")
@limiter.limit("20/minute", key_func=_workspace_or_ip_key)
async def carousel_ai_image(request: Request, body: AiImageIn, user=Depends(current_user)):
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


@api.post("/carousel/asset-search")
@limiter.limit("30/minute", key_func=_workspace_or_ip_key)
async def carousel_asset_search(request: Request, body: AssetSearchIn, user=Depends(current_user)):
    """Stock-photo search for the CreateEQ asset picker (Unsplash + Pexels).
    Free and unmetered — unlike AI image generation this doesn't call
    billing.charge_credits. Degrades to an empty result set with
    providers_configured=[] until at least one of UNSPLASH_ACCESS_KEY /
    PEXELS_API_KEY is set in the environment, rather than erroring."""
    from asset_engine import search_photos, derive_search_terms, configured_providers
    query = (body.query or "").strip()
    if body.slide_content:
        terms = await derive_search_terms(body.slide_content, user)
        if terms:
            query = ", ".join(terms)
        elif not query:
            # Term derivation failed (LLM quota/network — not the caller's fault,
            # they did supply slide_content) — degrade to an empty result rather
            # than a misleading "you forgot a required field" 400.
            return {"results": [], "providers_configured": configured_providers()}
    if not query:
        raise HTTPException(400, "query or slide_content is required")
    return await search_photos(query, target_aspect=body.target_aspect)


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
    # Blob-backed images redirect to a signed URL instead of being proxied —
    # streaming the bytes through this app is exactly what blob storage exists
    # to avoid, and this route stays only so URLs already saved into decks and
    # sent emails keep resolving.
    if doc.get("blob_path"):
        signed = blob_storage.read_url(doc["blob_path"])
        if signed:
            from fastapi.responses import RedirectResponse
            return RedirectResponse(signed, status_code=307)
    if not doc.get("data"):
        raise HTTPException(404, "image bytes unavailable")
    from fastapi.responses import Response
    return Response(
        content=doc["data"],
        media_type=doc.get("mime_type", "image/png"),
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )


@api.delete("/carousel/image/{image_id}")
async def carousel_image_delete(image_id: str, user=Depends(current_user)):
    """Delete a generated image."""
    doc = await db.carousel_images.find_one({"id": image_id, "workspace_id": user["workspace_id"]})
    if not doc:
        raise HTTPException(404, "image not found")
    await db.carousel_images.delete_one({"id": image_id})
    return {"ok": True}


async def _store_media(doc: Dict[str, Any], data: bytes, content_type: str,
                       filename: str) -> bool:
    """Put `data` in Blob and stamp blob_path/thumb_path onto `doc`.

    Returns False when storage is unconfigured or the upload failed, which
    tells the caller to keep the bytes in Mongo instead. Thumbnail failure is
    not upload failure — SVG, video and decks have no Pillow thumbnail, and the
    original is still perfectly usable.
    """
    if not blob_storage.BLOB_ENABLED:
        return False
    await blob_storage.ensure_container()
    path = blob_storage.blob_path(doc["workspace_id"], doc["id"], filename)
    if not await blob_storage.upload_bytes(path, data, content_type):
        return False
    doc["blob_path"] = path
    doc["size_bytes"] = len(data)
    thumb = blob_storage.make_thumbnail(data)
    if thumb:
        tdata, ttype = thumb
        tpath = blob_storage.blob_path(doc["workspace_id"], doc["id"], "thumb.png")
        if await blob_storage.upload_bytes(tpath, tdata, ttype):
            doc["thumb_path"] = tpath
    return True


class MediaUploadUrlIn(BaseModel):
    filename: str
    content_type: str = "application/octet-stream"
    kind: str = "image"  # image | video | presentation | file


@api.post("/media/upload-url")
async def media_upload_url(body: MediaUploadUrlIn, user=Depends(current_user)):
    """Mint a direct-to-blob upload URL.

    Large media must not be uploaded *through* this app — a single worker
    streaming a video ties up the whole backend. The browser PUTs straight to
    Blob with this URL, then calls /media/commit to register the asset.
    """
    if not blob_storage.BLOB_ENABLED:
        raise HTTPException(503, "Media storage is not configured on this deployment.")
    await blob_storage.ensure_container()
    asset_id = new_id()
    path = blob_storage.blob_path(user["workspace_id"], asset_id, body.filename)
    url = blob_storage.write_sas_url(path)
    if not url:
        raise HTTPException(502, "Could not create an upload URL.")
    return {
        "asset_id": asset_id, "blob_path": path, "upload_url": url,
        "method": "PUT",
        # Azure rejects a block-blob PUT without this header.
        "headers": {"x-ms-blob-type": "BlockBlob", "Content-Type": body.content_type},
    }


class MediaCommitIn(BaseModel):
    asset_id: str
    blob_path: str
    filename: str = ""
    content_type: str = "application/octet-stream"
    kind: str = "image"
    size_bytes: int = 0


@api.post("/media/commit")
async def media_commit(body: MediaCommitIn, user=Depends(current_user)):
    """Register an asset the browser uploaded directly.

    blob_path is re-derived from the caller's own workspace rather than trusted
    from the request — otherwise a client could claim a path under someone
    else's workspace prefix and register another tenant's asset.
    """
    expected_prefix = f"{user['workspace_id']}/{body.asset_id}/"
    if not body.blob_path.startswith(expected_prefix):
        raise HTTPException(400, "blob_path does not belong to this workspace/asset.")
    doc = {
        "id": body.asset_id, "workspace_id": user["workspace_id"],
        "created_by": user["id"], "kind": body.kind,
        "filename": body.filename, "mime_type": body.content_type,
        "blob_path": body.blob_path, "size_bytes": body.size_bytes,
        "created_at": now_iso(), "deleted_at": None,
    }
    await db.media_assets.insert_one(doc)
    doc.pop("_id", None)
    await _audit(user, "media.commit", {"asset_id": body.asset_id, "kind": body.kind})
    return {**doc, **blob_storage.asset_urls(doc)}


@api.get("/media")
async def media_list(kind: str = "", limit: int = 100, user=Depends(current_user)):
    """Gallery listing: metadata plus signed thumbnail URLs, never bytes."""
    q: Dict[str, Any] = {"workspace_id": user["workspace_id"], "deleted_at": None}
    if kind:
        q["kind"] = kind
    items = await db.media_assets.find(q, {"_id": 0}).sort("created_at", -1).to_list(min(limit, 500))
    return [{**it, **blob_storage.asset_urls(it)} for it in items]


@api.delete("/media/{asset_id}")
async def media_delete(asset_id: str, purge: bool = False, user=Depends(current_user)):
    """Soft-delete by default so an accidental delete is recoverable; `purge`
    removes the blob for real."""
    doc = await db.media_assets.find_one(
        {"id": asset_id, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Asset not found")
    if purge:
        await blob_storage.delete_blob(doc.get("blob_path", ""))
        await blob_storage.delete_blob(doc.get("thumb_path", ""))
        await db.media_assets.delete_one({"id": asset_id, "workspace_id": user["workspace_id"]})
    else:
        await db.media_assets.update_one(
            {"id": asset_id, "workspace_id": user["workspace_id"]},
            {"$set": {"deleted_at": now_iso()}})
    await _audit(user, "media.delete", {"asset_id": asset_id, "purge": purge})
    return {"ok": True, "purged": purge}


@api.post("/carousel/image/upload")
async def carousel_image_upload(file: UploadFile = File(...), user=Depends(current_user)):
    """Upload a local image into the workspace image gallery so it lists next to
    AI-generated ones and can be added as an element or background."""
    ALLOWED = {"image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"}
    if file.content_type not in ALLOWED:
        raise HTTPException(400, "Only PNG, JPEG, GIF, WebP, SVG allowed")
    data = await file.read()
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(400, "Image too large (max 5 MB)")
    image_id = new_id()
    access_token = _secrets.token_urlsafe(24)
    doc = {
        "id": image_id,
        "workspace_id": user["workspace_id"],
        "created_by": user["id"],
        "mime_type": file.content_type,
        "provider": "upload",
        "prompt": (file.filename or "Uploaded image")[:120],
        "size": None,
        "aspect": None,
        "access_token": access_token,
        "created_at": now_iso(),
    }
    # Prefer Blob: the bytes then never travel back through this app, which is
    # the whole point (one uvicorn worker serves everything). Falls back to
    # storing bytes in Mongo when storage isn't configured, so an unconfigured
    # deployment keeps working exactly as before.
    stored = await _store_media(doc, data, file.content_type,
                               file.filename or f"{image_id}.bin")
    if not stored:
        doc["data"] = data
    await db.carousel_images.insert_one(doc)
    base = (PUBLIC_BASE_URL or FRONTEND_URL).rstrip("/")
    image_url = (blob_storage.read_url(doc["blob_path"]) if doc.get("blob_path")
                 else f"{base}/api/carousel/image/{image_id}?t={access_token}")
    return {
        "image_id": image_id,
        "image_url": image_url,
        "thumb_url": blob_storage.read_url(doc.get("thumb_path", "")) or image_url,
        "prompt": (file.filename or "Uploaded image")[:120],
    }


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
        "token": _secrets.token_urlsafe(24),
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

    state = _secrets.token_urlsafe(24)
    await db.oauth_states.insert_one({
        "state": state, "kind": "hubspot",
        "workspace_id": user["workspace_id"], "user_id": user["id"], "at": now_iso()})
    return {"url": hubspot_client.auth_url(state), "mocked": False}


@api.post("/hubspot/disconnect")
async def hubspot_disconnect(user=Depends(current_user)):
    await db.hubspot_integrations.delete_one({"workspace_id": user["workspace_id"]})
    await _audit(user, "hubspot.disconnect", {})
    return {"ok": True}


@api.post("/hubspot/sync")
async def hubspot_sync(user=Depends(current_user)):
    """Stamp workspace leads with hubspot_id (mock-backed until a real token exists)."""
    import hubspot_client
    conn = await db.hubspot_integrations.find_one({"workspace_id": user["workspace_id"]}, {"_id": 0})
    if not conn or not conn.get("connected"):
        raise HTTPException(400, "HubSpot not connected")
    leads = await db.leads.find(
        {"workspace_id": user["workspace_id"]}, {"_id": 0}
    ).to_list(1000)
    pushed = 0
    for lead in leads:
        await db.leads.update_one(
            {"id": lead["id"]},
            {"$set": {
                "hubspot_id": lead.get("hubspot_id") or f"hs-{lead['id'][:8]}",
                "hubspot_synced_at": now_iso(),
            }},
        )
        pushed += 1
    await db.hubspot_integrations.update_one(
        {"workspace_id": user["workspace_id"]},
        {"$set": {"last_sync_at": now_iso()}, "$inc": {"pushed_count": pushed}})
    await _audit(user, "hubspot.sync", {"pushed": pushed, "mocked": hubspot_client.HUBSPOT_MOCKED})
    return {"pushed": pushed, "pulled": 0, "mocked": hubspot_client.HUBSPOT_MOCKED}


@api.post("/hubspot/deals/sync")
async def hubspot_deals_sync(user=Depends(current_user)):
    """Stamp workspace deals with hubspot_deal_id (mock-backed until a real token exists)."""
    import hubspot_client
    conn = await db.hubspot_integrations.find_one({"workspace_id": user["workspace_id"]}, {"_id": 0})
    if not conn or not conn.get("connected"):
        raise HTTPException(400, "HubSpot not connected")
    deals = await db.deals.find(
        {"workspace_id": user["workspace_id"]}, {"_id": 0}
    ).to_list(1000)
    synced = 0
    for d in deals:
        await db.deals.update_one(
            {"id": d["id"]},
            {"$set": {
                "hubspot_deal_id": d.get("hubspot_deal_id") or f"hsd-{d['id'][:8]}",
                "hubspot_synced_at": now_iso(),
            }},
        )
        synced += 1
    await db.hubspot_integrations.update_one(
        {"workspace_id": user["workspace_id"]},
        {"$set": {"last_sync_at": now_iso()}})
    await _audit(user, "hubspot.deals_sync", {"synced": synced, "mocked": hubspot_client.HUBSPOT_MOCKED})
    return {"synced": synced, "mocked": hubspot_client.HUBSPOT_MOCKED}


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


# ----------------------------- Campaign Templates -----------------------------
class CampaignTemplateIn(BaseModel):
    name: str
    description: str = ""
    goal: Optional[str] = "Book meetings"
    campaign_type: Optional[str] = "ai"
    from_mailbox_id: Optional[str] = None
    steps: List[SequenceStep] = []
    send_window_start: Optional[str] = "09:00"
    send_window_end: Optional[str] = "17:00"
    timezone: Optional[str] = "UTC"
    signature_id: Optional[str] = None
    batch_size: Optional[int] = 10
    tags: List[str] = []


@api.get("/campaign-templates")
async def list_campaign_templates(user=Depends(current_user)):
    return await db.campaign_templates.find(
        {"workspace_id": user["workspace_id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)


@api.post("/campaign-templates")
async def create_campaign_template(body: CampaignTemplateIn, user=Depends(current_user)):
    t = body.model_dump()
    t.update({
        "id": new_id(),
        "workspace_id": user["workspace_id"],
        "owner_id": user["id"],
        "created_at": now_iso(),
        "updated_at": now_iso(),
        "use_count": 0,
    })
    await db.campaign_templates.insert_one(t)
    t.pop("_id", None)
    return t


@api.post("/campaigns/{cid}/save-template")
async def save_campaign_as_template(cid: str, user=Depends(current_user)):
    c = await db.campaigns.find_one({"id": cid, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not c:
        raise HTTPException(404, "campaign not found")
    t = {
        "id": new_id(),
        "workspace_id": user["workspace_id"],
        "owner_id": user["id"],
        "name": c.get("name", ""),
        "description": c.get("goal", ""),
        "goal": c.get("goal", "Book meetings"),
        "campaign_type": c.get("campaign_type", "ai"),
        "from_mailbox_id": c.get("from_mailbox_id"),
        "steps": c.get("steps", []),
        "send_window_start": c.get("send_window_start", "09:00"),
        "send_window_end": c.get("send_window_end", "17:00"),
        "timezone": c.get("timezone", "UTC"),
        "signature_id": c.get("signature_id"),
        "batch_size": c.get("batch_size", 10),
        "tags": [],
        "created_at": now_iso(),
        "updated_at": now_iso(),
        "use_count": 0,
    }
    await db.campaign_templates.insert_one(t)
    t.pop("_id", None)
    await _audit(user, "campaign.save_template", {"campaign_id": cid, "template_id": t["id"], "name": t["name"]})
    return t


@api.post("/campaigns/from-template/{template_id}")
async def create_campaign_from_template(template_id: str, body: CampaignIn, user=Depends(current_user)):
    tmpl = await db.campaign_templates.find_one({"id": template_id, "workspace_id": user["workspace_id"]})
    if not tmpl:
        raise HTTPException(404, "template not found")
    c = body.model_dump()
    c.update({
        "id": new_id(),
        "workspace_id": user["workspace_id"],
        "status": "draft",
        "created_at": now_iso(),
        "owner_id": user["id"],
        "template_id": template_id,
    })
    await db.campaigns.insert_one(c)
    c.pop("_id", None)
    if c.get("lead_ids"):
        await db.leads.update_many(
            {"id": {"$in": c["lead_ids"]}},
            {"$addToSet": {"campaign_ids": c["id"]}},
        )
    await db.campaign_templates.update_one(
        {"id": template_id},
        {"$inc": {"use_count": 1}},
    )
    return c


@api.delete("/campaign-templates/{tid}")
async def delete_campaign_template(tid: str, user=Depends(current_user)):
    await db.campaign_templates.delete_one({"id": tid, "workspace_id": user["workspace_id"]})
    return {"ok": True}


# ----------------------------- Campaign Folders --------------------------------
class FolderIn(BaseModel):
    name: str
    color: Optional[str] = None


@api.get("/campaign-folders")
async def list_campaign_folders(user=Depends(current_user)):
    return await db.campaign_folders.find(
        {"workspace_id": user["workspace_id"]}, {"_id": 0}
    ).sort("name", 1).to_list(100)


@api.post("/campaign-folders")
async def create_campaign_folder(body: FolderIn, user=Depends(current_user)):
    f = body.model_dump()
    f.update({"id": new_id(), "workspace_id": user["workspace_id"], "created_at": now_iso()})
    await db.campaign_folders.insert_one(f)
    f.pop("_id", None)
    return f


@api.put("/campaign-folders/{fid}")
async def update_campaign_folder(fid: str, body: FolderIn, user=Depends(current_user)):
    await db.campaign_folders.update_one(
        {"id": fid, "workspace_id": user["workspace_id"]},
        {"$set": {"name": body.name, "color": body.color}},
    )
    return await db.campaign_folders.find_one({"id": fid}, {"_id": 0})


@api.delete("/campaign-folders/{fid}")
async def delete_campaign_folder(fid: str, user=Depends(current_user)):
    await db.campaign_folders.delete_one({"id": fid, "workspace_id": user["workspace_id"]})
    await db.campaigns.update_many(
        {"folder_id": fid, "workspace_id": user["workspace_id"]},
        {"$set": {"folder_id": None}},
    )
    return {"ok": True}


# ----------------------------- Team & Invites --------------------------------
ROLES = {"org_admin", "campaign_manager", "sdr", "viewer"}


class TeamInviteIn(BaseModel):
    name: str
    email: EmailStr
    role: str = "campaign_manager"
    password: str
    department: Optional[str] = None


class TeamUpdateIn(BaseModel):
    role: Optional[str] = None
    department: Optional[str] = None


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
        "department": (body.department or "").strip() or None,
        "invited_by": user["id"], "created_at": now_iso(),
    })
    await _audit(user, "team.invite", {"user_id": uid, "email": body.email.lower(), "role": body.role})
    return {"ok": True, "user_id": uid}


@api.put("/team/{uid}")
async def update_member(uid: str, body: TeamUpdateIn, user=Depends(current_user)):
    """Org admin edits an existing member's role/department — invite-time is
    the only other place these are set, so without this a member's department
    (needed for signature policy matching) could never change after signup."""
    if user.get("role") != "org_admin" and not _is_admin(user):
        raise HTTPException(403, "Only Org Admin can edit members")
    victim = await db.users.find_one({"id": uid, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not victim:
        raise HTTPException(404, "not found")
    updates: Dict[str, Any] = {}
    if body.role is not None:
        if body.role not in ROLES:
            raise HTTPException(400, "invalid role")
        updates["role"] = body.role
    if body.department is not None:
        updates["department"] = body.department.strip() or None
    if updates:
        await db.users.update_one({"id": uid}, {"$set": updates})
        await _audit(user, "team.update", {"user_id": uid, **updates})
    return {"ok": True}


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


# ---- Advanced analytics: funnel & attribution -----
@api.get("/campaigns/{cid}/funnel")
async def campaign_funnel(cid: str, user=Depends(current_user)):
    """Funnel visualization — conversion rates at each step."""
    c = await db.campaigns.find_one({"id": cid, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not c:
        raise HTTPException(404, "not found")
    steps = c.get("steps") or []
    events = await db.events.find(
        {"campaign_id": cid, "workspace_id": user["workspace_id"]}, {"_id": 0}).to_list(5000)
    total_leads = len(c.get("lead_ids") or [])

    funnel = []
    for i, s in enumerate(steps):
        se = [e for e in events if e.get("step") == i]
        sent = sum(1 for e in se if e["type"] == "sent")
        opened = sum(1 for e in se if e["type"] == "opened")
        clicked = sum(1 for e in se if e["type"] == "clicked")
        replied = sum(1 for e in se if e["type"] == "replied")
        bounced = sum(1 for e in se if e["type"] == "bounced")
        funnel.append({
            "step": i + 1, "subject": s.get("subject", "")[:40],
            "condition": s.get("condition", "always"),
            "sent": sent, "opened": opened, "clicked": clicked,
            "replied": replied, "bounced": bounced,
            "open_rate_pct": round(opened / sent * 100, 1) if sent else 0,
            "click_rate_pct": round(clicked / sent * 100, 1) if sent else 0,
            "reply_rate_pct": round(replied / sent * 100, 1) if sent else 0,
            "bounce_rate_pct": round(bounced / sent * 100, 1) if sent else 0,
        })

    # Overall funnel
    all_sent = sum(1 for e in events if e["type"] == "sent")
    all_opened = sum(1 for e in events if e["type"] == "opened")
    all_clicked = sum(1 for e in events if e["type"] == "clicked")
    all_replied = sum(1 for e in events if e["type"] == "replied")
    all_bounced = sum(1 for e in events if e["type"] == "bounced")
    all_meetings = sum(1 for e in events if e["type"] == "meeting_booked")

    return {
        "campaign_id": cid, "campaign_name": c.get("name", ""),
        "total_leads": total_leads,
        "overall": {
            "sent": all_sent, "opened": all_opened, "clicked": all_clicked,
            "replied": all_replied, "bounced": all_bounced, "meetings": all_meetings,
            "sent_to_open_pct": round(all_opened / all_sent * 100, 1) if all_sent else 0,
            "open_to_reply_pct": round(all_replied / all_opened * 100, 1) if all_opened else 0,
            "sent_to_meeting_pct": round(all_meetings / all_sent * 100, 1) if all_sent else 0,
        },
        "by_step": funnel,
    }


@api.get("/campaigns/{cid}/attribution")
async def campaign_attribution(cid: str, user=Depends(current_user)):
    """Pipeline attribution — which campaign events led to deals."""
    deals = await db.deals.find({
        "workspace_id": user["workspace_id"],
        "campaign_id": cid,
    }, {"_id": 0}).to_list(100)
    if not deals:
        return {"campaign_id": cid, "deals": [], "total_pipeline_value": 0, "won_value": 0}

    total_value = sum(d.get("value", 0) for d in deals)
    won_value = sum(d.get("value", 0) for d in deals if d.get("stage") == "closed_won")
    return {
        "campaign_id": cid,
        "total_deals": len(deals),
        "total_pipeline_value": total_value,
        "won_value": won_value,
        "deal_stages": {
            stage: sum(1 for d in deals if d.get("stage") == stage)
            for stage in set(d.get("stage", "new") for d in deals)
        },
        "deals": [{"id": d["id"], "title": d.get("title", ""), "value": d.get("value", 0),
                    "stage": d.get("stage", "new"), "created_at": d.get("created_at", "")}
                  for d in sorted(deals, key=lambda x: x.get("created_at", ""), reverse=True)],
    }


@api.get("/campaigns/{cid}/ab-test-results")
async def campaign_ab_test_results(cid: str, user=Depends(current_user)):
    """Return A/B test variant performance for a campaign."""
    events = await db.events.find({"campaign_id": cid, "workspace_id": user["workspace_id"]}, {"_id": 0}).to_list(5000)
    queue = await db.send_queue.find(
        {"campaign_id": cid, "workspace_id": user["workspace_id"], "ab_variant": {"$ne": None}},
        {"_id": 0, "ab_variant": 1, "id": 1},
    ).to_list(2000)
    variant_map = {q["id"]: q.get("ab_variant", "A") for q in queue}
    a_sent = b_sent = a_opened = b_opened = a_replied = b_replied = 0
    for e in events:
        v = variant_map.get(e.get("queue_id", ""))
        if not v:
            continue
        if v == "A":
            a_sent += 1 if e["type"] == "sent" else 0
            a_opened += 1 if e["type"] == "opened" else 0
            a_replied += 1 if e["type"] == "replied" else 0
        else:
            b_sent += 1 if e["type"] == "sent" else 0
            b_opened += 1 if e["type"] == "opened" else 0
            b_replied += 1 if e["type"] == "replied" else 0
    return {
        "variant_a": {"sent": a_sent, "opened": a_opened, "replied": a_replied,
                       "open_rate": round(a_opened / a_sent * 100, 1) if a_sent else 0,
                       "reply_rate": round(a_replied / a_sent * 100, 1) if a_sent else 0},
        "variant_b": {"sent": b_sent, "opened": b_opened, "replied": b_replied,
                       "open_rate": round(b_opened / b_sent * 100, 1) if b_sent else 0,
                       "reply_rate": round(b_replied / b_sent * 100, 1) if b_sent else 0},
    }


@api.get("/analytics/mailboxes")
async def analytics_mailboxes(user=Depends(current_user)):
    return await db.mailboxes.find({"workspace_id": user["workspace_id"]}, {"_id": 0}).to_list(500)


@api.get("/analytics/dashboard")
async def analytics_dashboard(user=Depends(current_user)):
    """Combined dashboard data: campaign funnel + attribution + health."""
    wid = user["workspace_id"]
    campaigns = await db.campaigns.find({"workspace_id": wid}, {"_id": 0}).to_list(500)
    out = []
    for c in campaigns:
        steps = c.get("steps", [])
        events = await db.events.find({"workspace_id": wid, "campaign_id": c["id"]}, {"_id": 0}).to_list(20000)
        by_step = []
        for i in range(len(steps)):
            e = [x for x in events if x.get("step") == i]
            sent = sum(1 for x in e if x["type"] == "sent")
            by_step.append({
                "step": i, "subject": steps[i].get("subject", "")[:40],
                "sent": sent,
                "opened": sum(1 for x in e if x["type"] == "opened"),
                "clicked": sum(1 for x in e if x["type"] == "clicked"),
                "replied": sum(1 for x in e if x["type"] == "replied"),
                "bounced": sum(1 for x in e if x["type"] == "bounced"),
                "open_rate": round(sum(1 for x in e if x["type"] == "opened") / sent * 100, 1) if sent else 0,
                "reply_rate": round(sum(1 for x in e if x["type"] == "replied") / sent * 100, 1) if sent else 0,
            })
        total_sent = sum(1 for e in events if e["type"] == "sent")
        deals = await db.deals.find({"workspace_id": wid, "campaign_id": c["id"]}, {"_id": 0}).to_list(50)
        out.append({
            "id": c["id"], "name": c["name"], "status": c["status"],
            "by_step": by_step,
            "total_sent": total_sent,
            "total_leads": len(c.get("lead_ids") or []),
            "deal_count": len(deals),
            "pipeline_value": sum(d.get("value", 0) for d in deals),
            "won_deals": sum(1 for d in deals if d.get("stage") == "closed_won"),
            "won_value": sum(d.get("value", 0) for d in deals if d.get("stage") == "closed_won"),
            "health": "good" if total_sent < 10 or (
                sum(1 for e in events if e["type"] == "bounced") / total_sent < 0.05 and
                sum(1 for e in events if e["type"] == "opened") / total_sent > 0.15
            ) else "needs_attention",
        })
    # Totals
    all_events = await db.events.find({"workspace_id": wid}, {"_id": 0}).to_list(50000)
    return {
        "campaigns": out,
        "totals": {
            "total_sent": sum(1 for e in all_events if e["type"] == "sent"),
            "total_opened": sum(1 for e in all_events if e["type"] == "opened"),
            "total_replied": sum(1 for e in all_events if e["type"] == "replied"),
            "total_bounced": sum(1 for e in all_events if e["type"] == "bounced"),
            "total_meetings": sum(1 for e in all_events if e["type"] == "meeting_booked"),
            "campaign_count": len(campaigns),
        },
    }


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


def require_role(*allowed: str):
    """Gate a route to workspace roles in `allowed` (suite admins always pass).

    Shared across every agent module — the workspace ROLES set
    (org_admin/campaign_manager/sdr/viewer) is declared here but historically
    wasn't enforced in most modules, so a `viewer` could delete/edit data the
    same as an admin. Use this on destructive or schema/finance-shaping
    routes (deletes, financial writes, compensation edits); reads and normal
    create/edit stay open to every workspace role unless a route says
    otherwise."""
    async def _dep(user=Depends(current_user)):
        if user.get("role") not in allowed and not _is_admin(user):
            raise HTTPException(403, "Not permitted for your role")
        return user
    return _dep


# ---- Signature approval — org_admin-gated routes (need require_role, defined
# just above; ApprovalSettingsIn/get_approval_settings/submit-for-approval are
# up in the main Signature Management section since they don't) -------------
@api.put("/signatures/settings/approval-required")
async def set_approval_settings(body: ApprovalSettingsIn, user=Depends(require_role("org_admin"))):
    await db.workspaces.update_one(
        {"id": user["workspace_id"]}, {"$set": {"signature_approval_required": body.require_approval}}
    )
    await _audit(user, "signature.approval_settings", {"require_approval": body.require_approval})
    return {"ok": True, "require_approval": body.require_approval}


@api.get("/signatures/pending-approval")
async def list_pending_signatures(user=Depends(require_role("org_admin"))):
    return await db.signatures.find(
        {"workspace_id": user["workspace_id"], "status": "pending_approval"}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)


@api.post("/signatures/{sid}/approve")
async def approve_signature(sid: str, user=Depends(require_role("org_admin"))):
    result = await db.signatures.update_one(
        {"id": sid, "workspace_id": user["workspace_id"]}, {"$set": {"status": "approved"}}
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Signature not found")
    await _audit(user, "signature.approve", {"signature_id": sid})
    return {"ok": True, "status": "approved"}


@api.post("/signatures/{sid}/reject")
async def reject_signature(sid: str, user=Depends(require_role("org_admin"))):
    result = await db.signatures.update_one(
        {"id": sid, "workspace_id": user["workspace_id"]}, {"$set": {"status": "draft"}}
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Signature not found")
    await _audit(user, "signature.reject", {"signature_id": sid})
    return {"ok": True, "status": "draft"}


# ---- Org signature policies — org_admin defines a role/department match ->
# an existing (shared) signature; "Apply" is an explicit batch action, not a
# continuous sync, and only writes db.user_signature_prefs — a per-user
# preference the campaign builder prefers over the workspace default when
# prefilling a new campaign. Real directory-driven auto-provisioning would
# need the directory-sync connections below to be live, which they aren't. --
class SignaturePolicyIn(BaseModel):
    name: str
    match_role: Optional[str] = None
    match_department: Optional[str] = None
    signature_id: str


def _policy_match_query(workspace_id: str, policy: Dict[str, Any]) -> Dict[str, Any]:
    q: Dict[str, Any] = {"workspace_id": workspace_id}
    if policy.get("match_role"):
        q["role"] = policy["match_role"]
    if policy.get("match_department"):
        q["department"] = policy["match_department"]
    return q


@api.post("/signature-policies")
async def create_signature_policy(body: SignaturePolicyIn, user=Depends(require_role("org_admin"))):
    if not body.match_role and not (body.match_department or "").strip():
        raise HTTPException(400, "Set at least a role or a department to match on")
    sig = await db.signatures.find_one({"id": body.signature_id, "workspace_id": user["workspace_id"]}, {"_id": 0, "id": 1})
    if not sig:
        raise HTTPException(404, "signature not found")
    policy = {
        "id": new_id(), "workspace_id": user["workspace_id"], "name": body.name.strip(),
        "match_role": body.match_role or None, "match_department": (body.match_department or "").strip() or None,
        "signature_id": body.signature_id, "created_at": now_iso(), "created_by": user["id"],
    }
    await db.signature_policies.insert_one(policy)
    await _audit(user, "signature_policy.create", {"policy_id": policy["id"], "name": policy["name"]})
    policy.pop("_id", None)
    return policy


@api.get("/signature-policies")
async def list_signature_policies(user=Depends(require_role("org_admin"))):
    return await db.signature_policies.find(
        {"workspace_id": user["workspace_id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)


@api.delete("/signature-policies/{pid}")
async def delete_signature_policy(pid: str, user=Depends(require_role("org_admin"))):
    await db.signature_policies.delete_one({"id": pid, "workspace_id": user["workspace_id"]})
    await _audit(user, "signature_policy.delete", {"policy_id": pid})
    return {"ok": True}


@api.get("/signature-policies/{pid}/matching-users")
async def signature_policy_matching_users(pid: str, user=Depends(require_role("org_admin"))):
    policy = await db.signature_policies.find_one({"id": pid, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not policy:
        raise HTTPException(404, "policy not found")
    users = await db.users.find(
        _policy_match_query(user["workspace_id"], policy),
        {"_id": 0, "id": 1, "name": 1, "email": 1, "role": 1, "department": 1},
    ).to_list(500)
    return {"count": len(users), "users": users}


@api.post("/signature-policies/{pid}/apply")
async def apply_signature_policy(pid: str, user=Depends(require_role("org_admin"))):
    policy = await db.signature_policies.find_one({"id": pid, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not policy:
        raise HTTPException(404, "policy not found")
    users = await db.users.find(_policy_match_query(user["workspace_id"], policy), {"_id": 0, "id": 1}).to_list(1000)
    now = now_iso()
    for u in users:
        await db.user_signature_prefs.update_one(
            {"workspace_id": user["workspace_id"], "user_id": u["id"]},
            {"$set": {"signature_id": policy["signature_id"], "set_via_policy_id": pid, "updated_at": now}},
            upsert=True,
        )
    await _audit(user, "signature_policy.apply", {"policy_id": pid, "applied_count": len(users)})
    return {"ok": True, "applied_count": len(users)}


# ---- Directory-sync settings — configuration-storage scaffolding ONLY. There
# is no real tenant to connect to, so these routes never attempt a live
# connection (no OAuth redirect, no SCIM/Graph/Admin SDK calls) — they just
# store the config fields an org admin enters, and always report
# connected=False. A real integration would need this to actually call out.
DIRECTORY_SYNC_PROVIDERS = ["google_workspace", "microsoft_365", "azure_ad", "saml"]


class DirectorySyncConfigIn(BaseModel):
    config: Dict[str, str] = {}


def _mask_directory_sync_config(config: Dict[str, Any]) -> Dict[str, Any]:
    out = {}
    for k, v in (config or {}).items():
        out[k] = ("•" * 8) if v and ("secret" in k.lower() or "certificate" in k.lower()) else v
    return out


@api.get("/directory-sync/status")
async def directory_sync_status(user=Depends(require_role("org_admin"))):
    rows = await db.directory_sync_integrations.find(
        {"workspace_id": user["workspace_id"]}, {"_id": 0}
    ).to_list(20)
    by_provider = {r["provider"]: r for r in rows}
    out = []
    for p in DIRECTORY_SYNC_PROVIDERS:
        row = by_provider.get(p)
        out.append({
            "provider": p,
            "configured": bool(row and row.get("config")),
            "config": _mask_directory_sync_config(row.get("config")) if row else {},
            "updated_at": row.get("updated_at") if row else None,
            "connected": False,
        })
    return out


@api.put("/directory-sync/{provider}")
async def update_directory_sync_config(provider: str, body: DirectorySyncConfigIn, user=Depends(require_role("org_admin"))):
    """Merges into the stored config rather than replacing it — the frontend
    omits secret fields the admin left blank (since GET only ever returns
    them masked), and a full-replace here would silently wipe those out."""
    if provider not in DIRECTORY_SYNC_PROVIDERS:
        raise HTTPException(404, "unknown provider")
    existing = await db.directory_sync_integrations.find_one(
        {"workspace_id": user["workspace_id"], "provider": provider}, {"_id": 0, "config": 1}
    )
    merged = {**(existing or {}).get("config", {}), **{k: v for k, v in body.config.items() if v}}
    await db.directory_sync_integrations.update_one(
        {"workspace_id": user["workspace_id"], "provider": provider},
        {
            "$set": {"config": merged, "updated_at": now_iso()},
            "$setOnInsert": {"id": new_id(), "workspace_id": user["workspace_id"], "provider": provider, "created_at": now_iso()},
        },
        upsert=True,
    )
    await _audit(user, "directory_sync.update_config", {"provider": provider})
    return {"ok": True}


@api.delete("/directory-sync/{provider}")
async def clear_directory_sync_config(provider: str, user=Depends(require_role("org_admin"))):
    await db.directory_sync_integrations.delete_one({"workspace_id": user["workspace_id"], "provider": provider})
    await _audit(user, "directory_sync.clear_config", {"provider": provider})
    return {"ok": True}


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


@api.get("/admin/token-usage")
async def admin_token_usage(_: Any = Depends(require_admin)):
    """Real $ cost of LLM token usage across the whole platform — actual COGS,
    independent of the flat credits a workspace's plan charges it. Suite-admin
    only: this is our own margin visibility, never shown to a customer."""
    from token_usage import get_platform_token_usage_summary
    return await get_platform_token_usage_summary()


@api.get("/admin/tick-health")
async def admin_tick_health(_: Any = Depends(require_admin)):
    """Every scheduler tick's last run/success/error, so a silently-broken
    tick (see _tracked_tick) is visible somewhere instead of only ever
    showing up as a log.warning line nobody's watching."""
    items = await db.tick_health.find({}, {"_id": 0}).sort("tick_id", 1).to_list(100)
    return items


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


@api.get("/admin/audit-log")
async def admin_audit_log(limit: int = 300, workspace_id: Optional[str] = None,
                           user_id: Optional[str] = None, _: Any = Depends(require_admin)):
    """Platform-wide access/action trail — unlike GET /audit-log (workspace-
    scoped, for a workspace's own org_admin), this crosses every workspace so
    a suite admin can see who did what, anywhere on the platform."""
    q: Dict[str, Any] = {}
    if workspace_id:
        q["workspace_id"] = workspace_id
    if user_id:
        q["user_id"] = user_id
    items = await db.audit_log.find(q, {"_id": 0}).sort("at", -1).to_list(min(limit, 1000))
    ws_map = {w["id"]: w["name"] async for w in db.workspaces.find({}, {"_id": 0, "id": 1, "name": 1})}
    for it in items:
        it["workspace_name"] = ws_map.get(it.get("workspace_id"))
    return items


@api.get("/admin/users/{uid}/activity")
async def admin_user_activity(uid: str, _: Any = Depends(require_admin)):
    """Everything a suite admin needs to answer "what has this user actually
    been doing": profile + last login, their audit trail across the platform,
    and the real LLM cost they've driven. Credit spend (billing.py) is only
    tracked per-workspace, not per-user, so it isn't attributable here."""
    user = await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(404, "not found")
    ws = await db.workspaces.find_one({"id": user.get("workspace_id")}, {"_id": 0, "id": 1, "name": 1})
    audit = await db.audit_log.find({"user_id": uid}, {"_id": 0}).sort("at", -1).to_list(200)
    usage = await db.token_usage_log.find({"user_id": uid}, {"_id": 0}).sort("at", -1).to_list(200)
    return {
        "user": {**user, "is_admin": (user.get("email") or "").lower() in ADMIN_EMAILS},
        "workspace": ws,
        "audit_log": audit,
        "llm_usage": usage,
        "llm_cost_usd": round(sum(u["cost_usd"] for u in usage), 4),
    }


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
@limiter.limit("5/minute")
async def impersonate(request: Request, uid: str, admin=Depends(require_admin)):
    target = await db.users.find_one({"id": uid}, {"_id": 0})
    if not target:
        raise HTTPException(404, "not found")
    token = make_token(target["id"], target["workspace_id"], ttl_hours=1)
    await _audit(admin, "admin.impersonate", {
        "target_user_id": uid,
        "target_email": target.get("email"),
        "ip": request.client.host if request.client else None,
        "user_agent": request.headers.get("user-agent"),
    })
    return {"token": token,
            "token_type": "impersonation",
            "expires_in_hours": 1,
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
from reply_eq import reply_router
from hrms_eq import hrms_router
from accounting_eq import accounting_router
from design_eq import design_router
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
api.include_router(design_router)
api.include_router(billing_router)
api.include_router(billing_public_router)
api.include_router(company_intel_router)
api.include_router(service_library_router)
api.include_router(campaign_engine_router)
api.include_router(sms_router)
api.include_router(sms_public_router)
api.include_router(whatsapp_router)
api.include_router(whatsapp_public_router)
api.include_router(reply_router)
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


# ----------------------------- MCP OAuth consent flow ------------------------
# Two authenticated endpoints the frontend consent page
# (frontend/src/pages/OAuthConsent.jsx) drives — these must be registered
# before app.include_router(api) below, same as every other @api route (a
# route added to `api` after that call never actually reaches `app`).
@api.get("/oauth/consent-info")
async def mcp_oauth_consent_info(request_id: str, user=Depends(current_user)):
    from mcp_auth import now as _mcp_now, scopes_allowed_for_role as _scopes_allowed_for_role
    pending = await db.oauth_pending_authorizations.find_one({"request_id": request_id}, {"_id": 0})
    if not pending or pending["expires_at"] < _mcp_now():
        raise HTTPException(404, "This authorization request has expired — go back and try connecting again.")
    allowed = _scopes_allowed_for_role(user.get("role"), _is_admin(user))
    return {
        "client_name": pending["client_name"],
        # What the client's own /authorize call asked for — Claude Desktop and
        # similar MCP clients often only request "read write" by default and
        # have no way to know this server also has a "send" scope. We don't
        # limit the grant to this list; it's shown only as the pre-checked
        # default in the consent UI.
        "requested_scopes": pending["scopes"],
        # Every scope the approving user's own role is allowed to grant,
        # regardless of what the client requested — lets an org_admin/
        # campaign_manager opt into "send" even when the client never asked
        # for it.
        "allowed_scopes": allowed,
        "workspace_name": (await db.workspaces.find_one({"id": user["workspace_id"]}, {"_id": 0, "name": 1}) or {}).get("name"),
    }


class McpConsentApproveIn(BaseModel):
    request_id: str
    approve: bool = True
    scopes: Optional[List[str]] = None


@api.post("/oauth/consent/approve")
async def mcp_oauth_consent_approve(body: McpConsentApproveIn, user=Depends(current_user)):
    import secrets as _secrets
    from mcp.server.auth.provider import construct_redirect_uri as _construct_redirect_uri
    from mcp_auth import now as _mcp_now, scopes_allowed_for_role as _scopes_allowed_for_role, AUTH_CODE_TTL_SECONDS as _CODE_TTL

    pending = await db.oauth_pending_authorizations.find_one({"request_id": body.request_id}, {"_id": 0})
    if not pending or pending["expires_at"] < _mcp_now():
        raise HTTPException(404, "This authorization request has expired — go back and try connecting again.")
    await db.oauth_pending_authorizations.delete_one({"request_id": body.request_id})  # single-use regardless of outcome

    if not body.approve:
        return {"redirect_url": _construct_redirect_uri(pending["redirect_uri"], error="access_denied", state=pending.get("state"))}

    allowed = _scopes_allowed_for_role(user.get("role"), _is_admin(user))
    # The user may choose to grant a different scope set than the client's
    # own /authorize request asked for (e.g. adding "send" when the client
    # only requested "read write") — always clamp to what their role allows,
    # never trust the request body beyond that. Omitting `scopes` keeps the
    # old default of exactly what the client requested, intersected with role.
    requested_by_user = body.scopes if body.scopes is not None else pending["scopes"]
    granted_scopes = [s for s in requested_by_user if s in allowed]

    code = _secrets.token_urlsafe(32)
    t = _mcp_now()
    await db.oauth_auth_codes.insert_one({
        "code": code, "client_id": pending["client_id"], "scopes": granted_scopes,
        "expires_at": t + _CODE_TTL, "code_challenge": pending["code_challenge"],
        "redirect_uri": pending["redirect_uri"],
        "redirect_uri_provided_explicitly": pending["redirect_uri_provided_explicitly"],
        "resource": pending.get("resource"), "subject": user["id"],
    })
    final_redirect_url = _construct_redirect_uri(pending["redirect_uri"], code=code, state=pending.get("state"))
    # The "authorized but failed to connect" reports this used to chase are
    # explained: the redirect and the /token exchange both always worked (the
    # 200 is right there in the app log), and the failure was the MCP transport
    # rejecting the deployed Host header with 421 — see _transport_security()
    # in mcp_server.py. The URL logged here carried a live authorization code,
    # so it goes rather than staying on as a permanent diagnostic.
    logger.info("mcp.oauth.consent_approved client_id=%s scopes=%s", pending["client_id"], granted_scopes)
    await _audit(user, "mcp.oauth.consent_approved", {"client_id": pending["client_id"], "scopes": granted_scopes})
    return {"redirect_url": final_redirect_url}


# ----------------------------- Connected AI clients (Settings panel) --------
@api.get("/oauth/connected-clients")
async def list_mcp_connected_clients(user=Depends(require_role("org_admin"))):
    """Every live MCP grant across the workspace — any teammate who's
    connected an AI client, not just the caller. Admin-only kill-switch
    visibility, independent of the audit log."""
    workspace_users = await db.users.find(
        {"workspace_id": user["workspace_id"]}, {"_id": 0, "id": 1, "name": 1, "email": 1}
    ).to_list(500)
    users_by_id = {u["id"]: u for u in workspace_users}
    grants = await db.oauth_refresh_tokens.find(
        {"subject": {"$in": list(users_by_id)}, "revoked": {"$ne": True}}, {"_id": 0, "token": 0}
    ).sort("created_at", -1).to_list(200)
    clients_by_id = {
        c["client_id"]: c for c in await db.oauth_clients.find(
            {"client_id": {"$in": list({g["client_id"] for g in grants})}}, {"_id": 0}
        ).to_list(200)
    }
    out = []
    for g in grants:
        connected_user = users_by_id.get(g["subject"], {})
        out.append({
            "grant_id": g["grant_id"],
            "client_name": clients_by_id.get(g["client_id"], {}).get("client_name", "Unknown app"),
            "scopes": g["scopes"],
            "connected_by": connected_user.get("name") or connected_user.get("email") or "Unknown",
            "connected_at": datetime.fromtimestamp(g["created_at"], tz=timezone.utc).isoformat(),
        })
    return out


class RevokeMcpClientIn(BaseModel):
    grant_id: str


@api.post("/oauth/connected-clients/revoke")
async def revoke_mcp_connected_client(body: RevokeMcpClientIn, user=Depends(require_role("org_admin"))):
    grant = await db.oauth_refresh_tokens.find_one({"grant_id": body.grant_id})
    if not grant:
        raise HTTPException(404, "not found")
    connected_user = await db.users.find_one({"id": grant["subject"]}, {"_id": 0, "workspace_id": 1})
    if not connected_user or connected_user["workspace_id"] != user["workspace_id"]:
        raise HTTPException(404, "not found")
    await db.oauth_refresh_tokens.update_one({"grant_id": body.grant_id}, {"$set": {"revoked": True}})
    # Refresh tokens stop minting new access tokens immediately (checked
    # above); any access token already issued under this grant would
    # otherwise keep working until its own natural ~1h expiry, so delete
    # those too rather than just waiting that out.
    await db.oauth_access_tokens.delete_many({"client_id": grant["client_id"], "subject": grant["subject"]})
    await _audit(user, "mcp.connected_client.revoke", {"client_id": grant["client_id"], "revoked_subject": grant["subject"]})
    return {"ok": True}


app.include_router(api)

# ----------------------------- MCP OAuth authorization server ---------------
# Mounted at the app root (not under /api) — .well-known discovery paths are
# conventionally served from the issuer's root, and MCP clients resolve them
# relative to the server URL they were given, not this app's /api prefix.
from pydantic import AnyHttpUrl as _AnyHttpUrl
from mcp.server.auth.routes import create_auth_routes as _create_mcp_auth_routes
from mcp.server.auth.settings import ClientRegistrationOptions as _ClientRegOpts, RevocationOptions as _RevocationOpts
from mcp_auth import InnoiraOAuthProvider as _InnoiraOAuthProvider

_mcp_issuer_url = _AnyHttpUrl(PUBLIC_BASE_URL or "http://localhost:8001")
_mcp_oauth_provider = _InnoiraOAuthProvider(db)
app.router.routes.extend(_create_mcp_auth_routes(
    provider=_mcp_oauth_provider,
    issuer_url=_mcp_issuer_url,
    client_registration_options=_ClientRegOpts(enabled=True, valid_scopes=["read", "write", "send"], default_scopes=["read"]),
    revocation_options=_RevocationOpts(enabled=True),
))

# ----------------------------- MCP tool server -------------------------------
# Mounted LAST (after every other route, including the OAuth routes above) so
# its catch-all sub-app only ever sees requests nothing else already matched
# — Starlette tries routes in registration order and stops at the first hit.
# token_verifier (not auth_server_provider) is used inside mcp_server.py
# specifically so this doesn't build a second, duplicate copy of /authorize,
# /register, /token, /revoke — those are the ones registered just above.
from contextlib import AsyncExitStack as _AsyncExitStack
from mcp_server import build_mcp_app as _build_mcp_app

_mcp_resource_url = f"{str(_mcp_issuer_url).rstrip('/')}/mcp"
_mcp_app = _build_mcp_app(db, str(_mcp_issuer_url), _mcp_resource_url)
app.mount("/", _mcp_app.streamable_http_app())

# `app.mount()` does not forward the ASGI `lifespan` protocol to a mounted
# sub-app — FastMCP's StreamableHTTPSessionManager.run() (which the mounted
# app's own `lifespan=` would normally trigger) therefore never starts on its
# own, and every request 500s with "Task group is not initialized." Enter that
# context manager manually here, kept open in this stack for the process
# lifetime, and close it on shutdown.
_mcp_session_manager_stack = _AsyncExitStack()


@app.on_event("startup")
async def _start_mcp_session_manager():
    await _mcp_session_manager_stack.enter_async_context(_mcp_app.session_manager.run())


@app.on_event("shutdown")
async def _stop_mcp_session_manager():
    await _mcp_session_manager_stack.aclose()


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
        await db.social_insights.create_index([("workspace_id", 1), ("generated_at", -1)])
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
        # Real field names are `phone`/`status` — these were indexing `contact_id`/
        # `session_status`, fields that don't exist on any whatsapp_conversations
        # document (stale from an earlier schema iteration, never updated).
        await db.whatsapp_conversations.create_index([("workspace_id", 1), ("phone", 1)])
        await db.whatsapp_conversations.create_index([("workspace_id", 1), ("status", 1), ("updated_at", -1)])
        await db.whatsapp_broadcasts.create_index([("workspace_id", 1), ("id", 1)])
        await db.whatsapp_broadcasts.create_index([("workspace_id", 1), ("status", 1)])
        # Automated agent knowledge base
        await db.whatsapp_kb_sources.create_index([("workspace_id", 1), ("id", 1)])
        await db.whatsapp_kb_chunks.create_index([("workspace_id", 1), ("source_id", 1)])
        await db.whatsapp_kb_chunks.create_index([("content", "text")])
        await db.reply_customers.create_index([("workspace_id", 1), ("phone", 1)], unique=True)
        await db.reply_customers.create_index([("workspace_id", 1), ("state.stage", 1)])
        await db.reply_followups.create_index([("status", 1), ("due_at", 1)])
        await db.reply_followups.create_index([("workspace_id", 1), ("customer_id", 1)])
        await db.reply_settings.create_index("workspace_id", unique=True)
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
        await db.signature_policies.create_index([("workspace_id", 1), ("id", 1)])
        await db.user_signature_prefs.create_index([("workspace_id", 1), ("user_id", 1)], unique=True)
        await db.directory_sync_integrations.create_index([("workspace_id", 1), ("provider", 1)], unique=True)
        await db.oauth_clients.create_index("client_id", unique=True)
        await db.oauth_pending_authorizations.create_index("request_id", unique=True)
        await db.oauth_auth_codes.create_index("code", unique=True)
        await db.oauth_access_tokens.create_index("token", unique=True)
        await db.oauth_refresh_tokens.create_index("token", unique=True)
        await db.oauth_refresh_tokens.create_index("grant_id", unique=True, sparse=True)
        await db.mcp_rate_limits.create_index([("workspace_id", 1), ("minute", 1)], unique=True)
        logger.info("indexes ensured")
    except Exception as ex:
        logger.warning("index setup: %s", ex)


# Background jobs. In-process (APScheduler) rather than a separate queue — the only
# recurring work today is the booking reminder, which doesn't justify running Redis.
scheduler = None


async def _tracked_tick(tick_id: str, fn, *args) -> None:
    """Every scheduled tick runs through this wrapper instead of being
    registered directly, so a tick that starts silently failing shows up
    somewhere a human can see it (GET /admin/tick-health) instead of only
    ever producing a log.warning line nobody's watching. Exceptions are
    swallowed here — same as every tick's own existing behavior of
    degrading gracefully rather than taking the scheduler down — just
    recorded first."""
    now = now_iso()
    try:
        await fn(*args)
        await db.tick_health.update_one(
            {"tick_id": tick_id},
            {"$set": {"tick_id": tick_id, "last_run_at": now, "last_success_at": now, "last_error": None},
             "$inc": {"run_count": 1, "error_count": 0}},
            upsert=True,
        )
    except Exception as ex:
        logger.warning("tick %s failed: %s", tick_id, ex)
        await db.tick_health.update_one(
            {"tick_id": tick_id},
            {"$set": {"tick_id": tick_id, "last_run_at": now, "last_error": str(ex), "last_error_at": now},
             "$inc": {"run_count": 1, "error_count": 1}},
            upsert=True,
        )


@app.on_event("startup")
async def _start_scheduler():
    global scheduler
    try:
        # Fix existing send_queue items with timezone-aware send_at strings
        # (bug: pre-2026-07-28 versions stored local-time ISO strings instead of UTC,
        # causing run_send_tick's string-based $lte comparison to never match).
        # The regex excludes "+00:00" so already-UTC rows (including ones this
        # migration just fixed) never match again -- without that exclusion this
        # "one-time" migration was rescanning and rewriting the entire send_queue
        # collection via one update_one() round-trip per document on every single
        # restart, which is what pushed worker startup past Azure's 10-minute
        # deploy timeout. Batched into one bulk_write so even a real (first-time)
        # migration of thousands of rows stays well under that budget.
        try:
            from datetime import timezone as _tz, datetime as _dt
            from pymongo import UpdateOne as _UpdateOne
            _to_fix = await db.send_queue.find(
                {"send_at": {"$regex": r"[+-](?!00:00$)\d{2}:\d{2}$"}},
                {"_id": 0, "id": 1, "send_at": 1},
            ).to_list(None)
            _ops = []
            for _q in _to_fix:
                try:
                    _old = _dt.fromisoformat(_q["send_at"])
                    _ops.append(_UpdateOne({"id": _q["id"]}, {"$set": {"send_at": _old.astimezone(_tz.utc).isoformat()}}))
                except Exception:
                    pass
            if _ops:
                await db.send_queue.bulk_write(_ops, ordered=False)
                logger.info("migrated %s send_queue item(s) to UTC send_at", len(_ops))
        except Exception as ex:
            logger.warning("send_queue UTC migration skipped: %s", ex)

        # Reset send_queue items that failed due to the missing inject_tracking bug
        try:
            _reset = await db.send_queue.update_many(
                {"status": "failed", "error": {"$regex": "inject_tracking", "$options": "i"}},
                {"$set": {"status": "pending", "error": None, "attempts": 0}},
                maxTimeMS=5000,
            )
            if _reset.modified_count:
                logger.info("reset %s failed send_queue item(s) for inject_tracking retry", _reset.modified_count)
        except Exception:
            pass

        from apscheduler.schedulers.asyncio import AsyncIOScheduler
        from schedule_eq import run_reminder_tick
        from sender import run_send_tick, run_reply_tick
        from social_eq import (
            run_social_publish_tick, run_social_engagement_tick, run_rss_poll_tick,
            run_social_insights_tick, run_daily_social_content_tick, run_video_poll_tick,
        )
        from site_eq import run_site_recrawl_tick
        from sms_eq import run_sms_send_tick
        from whatsapp_eq import run_whatsapp_send_tick
        from reply_eq import run_reply_eq_tick
        from crm import run_recycle_bin_purge_tick, run_dedup_scan_tick
        from banner_tick import run_signature_banner_tick

        scheduler = AsyncIOScheduler(timezone="UTC")
        # Every job below runs through _tracked_tick (records to db.tick_health,
        # surfaced at GET /admin/tick-health) instead of being registered
        # directly — a tick that starts silently failing used to be visible
        # only in server logs; now it's visible to a human.
        # Every 15 min: any confirmed booking ~24h out gets one reminder. The job
        # claims each booking before sending, so overlapping ticks can't double-send.
        scheduler.add_job(_tracked_tick, "interval", minutes=15, args=["booking_reminders", run_reminder_tick],
                          id="booking_reminders", max_instances=1, coalesce=True)
        # Drain the outbound queue. Every 2 min, capped per tick — a trickle looks
        # human; a burst looks like spam and gets the mailbox flagged.
        scheduler.add_job(_tracked_tick, "interval", minutes=2, args=["outbound_sends", run_send_tick, PUBLIC_BASE_URL],
                          id="outbound_sends", max_instances=1, coalesce=True)
        # Poll sent threads for real replies (this is what feeds the unified inbox).
        scheduler.add_job(_tracked_tick, "interval", minutes=10, args=["reply_polling", run_reply_tick],
                          id="reply_polling", max_instances=1, coalesce=True)
        # Auto-publish approved social posts once their scheduled time arrives
        # (or shortly after approval if none was set) — the "automatic" half of
        # the bulk-import -> email-approval -> auto-publish pipeline.
        scheduler.add_job(_tracked_tick, "interval", minutes=2, args=["social_publish", run_social_publish_tick],
                          id="social_publish", max_instances=1, coalesce=True)
        # Pulls real comments + refreshes real engagement from connected
        # (non-mocked) platforms only — never touches simulated posts.
        scheduler.add_job(_tracked_tick, "interval", minutes=10, args=["social_engagement", run_social_engagement_tick],
                          id="social_engagement", max_instances=1, coalesce=True)
        # Polls subscribed RSS feeds for new entries and drafts posts from
        # them through the same pipeline bulk-import uses.
        scheduler.add_job(_tracked_tick, "interval", minutes=30, args=["social_rss_poll", run_rss_poll_tick],
                          id="social_rss_poll", max_instances=1, coalesce=True)
        # Keeps each site's knowledge base from going stale without the user
        # having to remember to hit "re-crawl" — daily check, only re-crawls
        # sites whose last crawl is 7+ days old.
        scheduler.add_job(_tracked_tick, "interval", hours=24, args=["site_recrawl", run_site_recrawl_tick],
                          id="site_recrawl", max_instances=1, coalesce=True)
        # SMS broadcast send tick — drains queued SMS broadcasts at a human
        # trickle (2/min, capped).
        scheduler.add_job(_tracked_tick, "interval", minutes=2, args=["sms_send", run_sms_send_tick],
                          id="sms_send", max_instances=1, coalesce=True)
        # WhatsApp broadcast send tick — same trickle for WhatsApp template
        # sends.
        scheduler.add_job(_tracked_tick, "interval", minutes=2, args=["whatsapp_send", run_whatsapp_send_tick],
                          id="whatsapp_send", max_instances=1, coalesce=True)
        # Reply EQ follow-up drain — due follow-ups are claimed atomically so
        # overlapping ticks can't double-send; guardrails are enforced inside.
        scheduler.add_job(_tracked_tick, "interval", minutes=5, args=["reply_followups", run_reply_eq_tick],
                          id="reply_followups", max_instances=1, coalesce=True)
        # Recycle bin: hard-deletes anything soft-deleted (leads/companies/
        # lists) more than 30 days ago. Daily is plenty — this is cleanup,
        # not a user-facing latency path.
        scheduler.add_job(_tracked_tick, "interval", hours=24, args=["recycle_bin_purge", run_recycle_bin_purge_tick],
                          id="recycle_bin_purge", max_instances=1, coalesce=True)
        # Finds candidate duplicate leads (same phone / same company+lastname /
        # near-identical email) and records them for human review — never
        # auto-merges. Hourly is plenty; this is a review queue, not a live path.
        scheduler.add_job(_tracked_tick, "interval", hours=1, args=["crm_dedup_scan", run_dedup_scan_tick],
                          id="crm_dedup_scan", max_instances=1, coalesce=True)
        # Feedback Master: summarizes each workspace's last 7 days of published-post
        # performance into a short "what worked / try next" note the daily content
        # tick below reads back — daily is enough, this isn't a live path.
        scheduler.add_job(_tracked_tick, "interval", hours=24, args=["social_insights", run_social_insights_tick],
                          id="social_insights", max_instances=1, coalesce=True)
        # The Social Branding Assistant loop's daily generation step: for every
        # workspace that's completed setup, draft + QC today's post(s) and send
        # the same approval digest bulk-import/RSS already use.
        scheduler.add_job(_tracked_tick, "interval", hours=24, args=["social_daily_content", run_daily_social_content_tick],
                          id="social_daily_content", max_instances=1, coalesce=True)
        # Drains Veo video generations still in flight — the same 2-min trickle
        # as the other short-interval ticks; generation itself takes minutes,
        # so this just checks in until each job completes.
        scheduler.add_job(_tracked_tick, "interval", minutes=2, args=["video_poll", run_video_poll_tick],
                          id="video_poll", max_instances=1, coalesce=True)
        # Keeps any signature with a scheduled banner block's stored HTML in
        # sync with "today" even if nobody reopens the editor — see
        # backend/banner_tick.py for why this is a small ported selector
        # rather than a full re-render.
        scheduler.add_job(_tracked_tick, "interval", hours=24, args=["signature_banner_refresh", run_signature_banner_tick],
                          id="signature_banner_refresh", max_instances=1, coalesce=True)
        scheduler.start()
        logger.info("scheduler started (reminders 15m, sends 2m, reply polling 10m, "
                   "social publish 2m, social engagement 10m, RSS poll 30m, site recrawl 24h, "
                   "sms send 2m, whatsapp send 2m, recycle bin purge 24h, dedup scan 1h, "
                   "social insights 24h, social daily content 24h, video poll 2m, "
                   "signature banner refresh 24h)")
    except Exception as ex:
        logger.warning("scheduler failed to start: %s", ex)


# ── Lead Intelligence Provider Manager ──────────────────────────────
# ENV defaults to "dev" (no prior convention for this var existed in the repo) so
# a fresh checkout boots out of the box; real deployments must set ENV=production
# explicitly, at which point CORS_ORIGINS='*' becomes a hard failure again.
ENV = os.environ.get("ENV", "dev")
cors_origins = os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",")
if cors_origins == ["*"]:
    if ENV == "dev":
        logging.warning(
            "CORS_ORIGINS='*' in .env — ignoring it and falling back to http://localhost:3000 "
            "since ENV=dev (default). Set CORS_ORIGINS to explicit origins and ENV=production "
            "for a real deployment; '*' is never allowed there."
        )
        cors_origins = ["http://localhost:3000"]
    else:
        raise RuntimeError("FATAL: CORS_ORIGINS='*' is not allowed outside ENV=dev (would expose credentials to any site). Set explicit origins.")
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("pitcheq")


@app.on_event("shutdown")
async def shutdown_db():
    client.close()
