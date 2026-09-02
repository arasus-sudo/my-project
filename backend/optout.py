"""Opt-out management — one-click unsubscribe with proper opt-out list.

This module handles the opt-out list (suppression list) that prevents
emails from being sent to addresses that have opted out. It provides:

- One-click unsubscribe via secure token (issued per-recipient at send time)
- Opt-out list storage with workspace isolation
- Check before sending any email
- Redesigned 'We'll miss you' landing with optional feedback + resubscribe
- Admin UI to view/manage opt-outs
- Manual re-opt-in capability for admins
"""

import hashlib
import hmac
import html as _html
import logging
import os
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from server import (
    db, current_user, now_iso, new_id, _audit, require_role,
    ADMIN_EMAILS, _is_admin,
)

optout_router = APIRouter(prefix="/optout")
optout_public_router = APIRouter()  # No auth required for unsubscribe landing

log = logging.getLogger(__name__)

# ----------------------------- Models -----------------------------------------

class OptOutIn(BaseModel):
    email: str
    reason: str = "unsubscribed"
    source: str = "manual"  # manual | unsubscribe_link | bounce | spam_complaint

class OptOutUpdate(BaseModel):
    email: Optional[str] = None
    reason: Optional[str] = None
    active: Optional[bool] = None


# ----------------------------- Core Functions ----------------------------------

async def add_to_optout(
    workspace_id: str,
    email: str,
    reason: str = "unsubscribed",
    source: str = "manual",
    user_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Add an email to the opt-out list. Idempotent — safe to call multiple times."""
    email = email.lower().strip()
    if not email or "@" not in email:
        raise HTTPException(400, "invalid email")

    now = datetime.now(timezone.utc).isoformat()
    existing = await db.optout.find_one({"workspace_id": workspace_id, "email": email})
    if existing:
        # Update if needed
        updates = {"active": True, "updated_at": now_iso()}
        if reason:
            updates["reason"] = reason
        await db.optout.update_one(
            {"workspace_id": workspace_id, "email": email},
            {"$set": updates}
        )
        return {"email": email, "already_opted_out": True}

    doc = {
        "id": new_id(),
        "workspace_id": workspace_id,
        "email": email,
        "reason": reason,
        "source": source,
        "opted_out_at": now_iso(),
        "active": True,
        "created_by": None,
    }
    await db.optout.insert_one(doc)
    return {"email": email, "already_opted_out": False, "optout_id": new_id()}


async def is_opted_out(workspace_id: str, email: str) -> bool:
    """Check if an email is in the opt-out list. Fast path for send-time checks."""
    email = email.lower().strip()
    if not email or "@" not in email:
        return False
    doc = await db.optout.find_one(
        {"workspace_id": workspace_id, "email": email, "active": True},
        {"_id": 0}
    )
    return doc is not None


async def remove_from_optout(workspace_id: str, email: str, user_id: Optional[str] = None) -> bool:
    """Manually remove an email from the opt-out list (re-opt-in)."""
    email = email.lower().strip()
    result = await db.optout.update_one(
        {"workspace_id": workspace_id, "email": email},
        {"$set": {"active": False, "removed_at": now_iso(), "removed_by": user_id}}
    )
    return result.modified_count > 0


async def get_optout_list(workspace_id: str, active_only: bool = True, limit: int = 100) -> List[Dict[str, Any]]:
    """Get the opt-out list for a workspace."""
    query = {"workspace_id": workspace_id}
    if active_only:
        query["active"] = True
    return await db.optout.find({"workspace_id": workspace_id, "active": True}, {"_id": 0}).sort("opted_out_at", -1).to_list(limit)


# ----------------------------- Routes -----------------------------------------

optout_admin_router = APIRouter(prefix="/optout", tags=["optout"])


@optout_admin_router.get("/list")
async def list_optouts(active_only: bool = True, limit: int = 100, user=Depends(current_user)):
    """List all opted-out emails for the workspace."""
    await require_role("org_admin", "campaign_manager")(user=current_user)
    items = await get_optout_list(user["workspace_id"], active_only=True, limit=limit)
    return {"items": items}


@optout_admin_router.post("/add")
async def add_optout(body: OptOutIn, user=Depends(current_user)):
    """Manually add an email to the opt-out list."""
    await require_role("org_admin", "campaign_manager")(user=user)
    result = await add_to_optout(
        user["workspace_id"],
        body.email,
        body.reason,
        body.source,
        user["id"]
    )
    return result


@optout_admin_router.post("/remove")
async def remove_optout(email: str, user=Depends(current_user)):
    """Remove an email from the opt-out list (re-opt-in)."""
    await require_role("org_admin", "campaign_manager")(user=user)
    email = email.lower().strip()
    success = await remove_from_optout(user["workspace_id"], email, user["id"])
    if not success:
        raise HTTPException(404, "email not found in opt-out list")
    return {"ok": True, "email": email}


# ----------------------------- Unsubscribe tokens -------------------------------
# The token is the same 32-hex HMAC over `workspace_id|email` that
# email_templates.py uses, so links minted by either path stay valid. The token
# is NOT reversible, so the token->email/workspace mapping is stored at send
# time (issue_unsubscribe) and looked up when the link is clicked.

_FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"


def _unsub_secret() -> str:
    return os.environ.get("UNSUBSCRIBE_SECRET", "innoira-unsub-dev-key")


def _unsub_token(workspace_id: str, email: str) -> str:
    return hmac.new(
        _unsub_secret().encode(),
        f"{workspace_id}|{email}".lower().encode(),
        hashlib.sha256,
    ).hexdigest()[:32]


async def issue_unsubscribe(
    workspace_id: str,
    email: str,
    base_url: str = "",
    lead_id: Optional[str] = None,
    campaign_id: Optional[str] = None,
) -> str:
    """Store the token->email/workspace mapping at send time and return the
    full, absolute unsubscribe URL to embed in the email footer.

    Idempotent for the same (workspace, email): re-issuing refreshes the record
    and returns the same token. `base_url` defaults to the API host so it still
    works when called from a scheduler with no request context.
    """
    email = (email or "").lower().strip()
    token = _unsub_token(workspace_id, email)
    base = (base_url or "").rstrip("/")
    await db.unsubscribes.update_one(
        {"token": token},
        {"$set": {
            "token": token,
            "workspace_id": workspace_id,
            "email": email,
            "lead_id": lead_id,
            "campaign_id": campaign_id,
            "issued_at": now_iso(),
            "updated_at": now_iso(),
        }},
        upsert=True,
    )
    return f"{base}/api/unsubscribe/{token}"


async def resolve_unsubscribe(token: str) -> Optional[Dict[str, Any]]:
    """Look up the workspace/email a token was issued for. Returns None for an
    unknown/never-issued token."""
    if not token:
        return None
    return await db.unsubscribes.find_one({"token": token}, {"_id": 0})


# ----------------------------- Email-safe footer --------------------------------
# Appended to the very end of the HTML body (after the tracking pixel is NOT
# relevant here — callers append the footer as part of the html they send).
# Table-based, inline styles only, explicit text colours so it survives
# Gmail/Outlook + dark mode.

def append_unsubscribe_footer(html: str, url: str) -> str:
    """Append a one-click unsubscribe footer to campaign HTML. Idempotent — if
    an unsubscribe link is already present the html is returned unchanged so we
    never stack footers."""
    if not url or not html:
        return html
    # If an unsubscribe link already exists anywhere, don't append a second one.
    if re.search(r'href\s*=\s*["\'][^"\']*[Uu]nsubscribe["\']', html) or (
            url and f'href="{url}"' in html):
        return html
    footer = (
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
        'style="margin-top:16px;">'
        '<tr><td style="padding:12px 0;border-top:1px solid #e2e8f0;'
        f'font-size:12px;line-height:1.6;color:#64748b;">'
        'You\'re receiving this because you previously connected with us. '
        f'<a href="{url}" style="color:#64748b;text-decoration:underline;">'
        'Unsubscribe</a> from future marketing emails.'
        '</td></tr></table>'
    )
    if "</body>" in html:
        return html.replace("</body>", f"{footer}</body>")
    return html + footer


def append_unsubscribe_footer_text(text: str, url: str) -> str:
    """Append a plain-text unsubscribe line. Idempotent."""
    if not url:
        return text
    line = f"\n\n--\nYou're receiving this because you previously connected with us. Unsubscribe from future marketing emails: {url}"
    text = (text or "").rstrip()
    if text.endswith("Unsubscribe"):
        return text
    if "Unsubscribe:" in text or (url and url in text):
        return text
    return text + line


# ----------------------------- Public Unsubscribe ------------------------------


def _unsub_page(email: str, token: str, reason_saved: bool = False) -> str:
    """The redesignated 'we'll miss you' landing — friendly, honest, and the
    opt-out is honoured immediately. A survey never stands in front of the
    action; optional feedback comes after. The 'Keep me subscribed' rescue link
    re-opts the address in without needing the CRM."""
    resub_href = f"/api/resubscribe/{token}"
    pill = (
        '<p style="margin:28px 0 0;font-size:12px;color:#94a3b8;">'
        'Mind if we ask why? (optional)</p>'
        '<div style="margin:10px 0 0;">'
        + "".join(
            f'<a href="/api/unsubscribe/{token}?r={r}" style="display:inline-block;'
            f'margin:0 6px 6px 0;padding:6px 12px;border:1px solid #e2e8f0;'
            f'border-radius:999px;font-size:12px;color:#334155;'
            f'text-decoration:none;">{label}</a>'
            for r, label in [
                ("too_many", "Too many emails"),
                ("not_relevant", "Not relevant"),
                ("found_elsewhere", "Found a solution"),
                ("just_cleanup", "Just cleaning up my inbox"),
            ]
        )
        + "</div>"
    )
    if reason_saved:
        pill = '<p style="margin:24px 0 0;font-size:13px;color:#64748b;font-style:italic;">Thanks for the feedback.</p>'
    local_part = _html.escape((email or '').split('@')[0])
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Unsubscribed</title></head>
<body style="margin:0;background:#f8fafc;font-family:{_FONT};">
<div style="max-width:460px;margin:72px auto;padding:40px 36px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;text-align:center;">
<div style="width:56px;height:56px;margin:0 auto 18px;border-radius:50%;background:#fee2e2;display:flex;align-items:center;justify-content:center;">
<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="15" x2="15" y2="9"/></svg>
</div>
<h1 style="margin:0 0 10px;font-size:22px;font-weight:600;color:#0f1729;">We'll miss you, {local_part}.</h1>
<p style="margin:0 0 6px;font-size:15px;line-height:1.7;color:#64748b;">You've been unsubscribed and won't hear from us on these updates again. No hard feelings — if you ever change your mind, you know where to find us.</p>
<p style="margin:24px 0 0;">
<a href="{resub_href}" style="display:inline-block;padding:10px 20px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;color:#0f1729;text-decoration:none;">Actually, keep me subscribed</a>
</p>
{pill if not reason_saved else ''}
<p style="margin:32px 0 0;font-size:11px;color:#94a3b8;">© INNOIRA Consulting Services 2026 · CONFIDENTIAL</p>
</div></body></html>"""


def _resub_page(email: str) -> str:
    local_part = _html.escape((email or '').split('@')[0])
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Resubscribed</title></head>
<body style="margin:0;background:#f8fafc;font-family:{_FONT};">
<div style="max-width:460px;margin:72px auto;padding:40px 36px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;text-align:center;">
<div style="width:56px;height:56px;margin:0 auto 18px;border-radius:50%;background:#dcfce7;display:flex;align-items:center;justify-content:center;">
<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
</div>
<h1 style="margin:0 0 10px;font-size:22px;font-weight:600;color:#0f1729;">Happy to have you back.</h1>
<p style="margin:0;font-size:15px;line-height:1.7;color:#64748b;">Welcome back, {local_part}. You're subscribed again and will get our updates as before.</p>
</div></body></html>"""


def _maybe_reason(token: str, reason: str) -> str:
    if reason in ("too_many", "not_relevant", "found_elsewhere", "just_cleanup"):
        return reason
    return ""


optout_public_router = APIRouter()


@optout_public_router.get("/unsubscribe/{token}", response_class=HTMLResponse)
async def unsubscribe_landing(token: str, r: str = ""):
    """PUBLIC. One-click unsubscribe landing.

    The token proves which workspace/address issued it. Clicking the link
    immediately adds the address to the workspace's opt-out list (honour the
    opt-out first, collect optional feedback after, never a survey first). An
    unknown token still renders the confirmation page without an opt-out, so a
    stale/duplicated link can never error.
    """
    found = await resolve_unsubscribe(token)
    workspace_id = (found or {}).get("workspace_id")
    email = (found or {}).get("email")
    reason = _maybe_reason(token, r)
    if workspace_id and email:
        await add_to_optout(
            workspace_id, email,
            "unsubscribed_via_link", "unsubscribe_link",
            user_id="unsubscribe_self_service",
        )
        if reason:
            # Record the optional feedback reason on the token record.
            await db.unsubscribes.update_one(
                {"token": token}, {"$set": {"feedback": reason, "opted_out_at": now_iso()}}
            )
    return _unsub_page(email or "friend", token, reason_saved=bool(reason))


@optout_public_router.get("/resubscribe/{token}", response_class=HTMLResponse)
async def resubscribe_landing(token: str):
    """PUBLIC. Re-opt an address back in (the 'keep me subscribed' rescue)."""
    found = await resolve_unsubscribe(token)
    workspace_id = (found or {}).get("workspace_id")
    email = (found or {}).get("email")
    if workspace_id and email:
        await remove_from_optout(workspace_id, email, user_id="unsubscribe_self_service")
        await db.unsubscribes.update_one(
            {"token": token}, {"$set": {"resubscribed_at": now_iso()}}
        )
    return _resub_page(email or "friend")


# ----------------------------- Admin API for Opt-out Management -----------------------------

optout_admin_router = APIRouter(prefix="/admin/optout", tags=["optout-admin"])


@optout_admin_router.get("/list")
async def admin_list_optouts(
    active_only: bool = True,
    limit: int = 100,
    user=Depends(current_user)
):
    """List all opted-out emails for the workspace."""
    await require_role("org_admin", "campaign_manager")(user=user)
    items = await get_optout_list(user["workspace_id"], active_only=True, limit=limit)
    return {"items": items}


@optout_admin_router.post("/add")
async def admin_add_optout(body: OptOutIn, user=Depends(current_user)):
    """Manually add an email to the opt-out list."""
    await require_role("org_admin", "campaign_manager")(user=user)
    result = await add_to_optout(
        user["workspace_id"],
        body.email,
        body.reason,
        body.source,
        user["id"]
    )
    return result


@optout_admin_router.post("/remove")
async def admin_remove_optout(email: str, user=Depends(current_user)):
    """Remove an email from the opt-out list (re-opt-in)."""
    await require_role("org_admin", "campaign_manager")(user=user)
    email = email.lower().strip()
    success = await remove_from_optout(user["workspace_id"], email, user["id"])
    if not success:
        raise HTTPException(404, "email not found in opt-out list")
    return {"ok": True, "email": email}


# ----------------------------- Helper for send-time check ----------------------------------

async def check_optout_before_send(workspace_id: str, email: str) -> bool:
    """Check if an email is opted out before sending. Returns True if should skip."""
    return await is_opted_out(workspace_id, email)