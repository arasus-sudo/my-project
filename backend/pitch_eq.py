"""Pitch EQ — the researched-outreach routes.

The legacy Pitch EQ endpoints (campaigns, templates, /ai/score, /ai/personalize)
still live in server.py. This module holds the new engine: research, intent, and
the four-step draft chain, plus the lead sourcing that now runs through typed
provider clients.
"""

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from server import (
    db, current_user, now_iso, new_id, _audit, _log_activity, _verify_email_syntax,
    FRONTEND_URL,
)
import lead_sources
from lead_sources import ProviderError
import research_worker
import intent_engine
import draft_chain
from draft_chain import ChainError
from billing import charge_credits, check_credits

log = logging.getLogger(__name__)
pitch_router = APIRouter(prefix="/pitch-eq")
pitch_public_router = APIRouter()   # OAuth callback — the provider hits it, not our UI


@pitch_public_router.get("/mailbox/oauth/callback")
async def mailbox_oauth_callback(code: str, state: str):
    """PUBLIC. Gmail/Microsoft redirect here after the user grants send access."""
    import mailbox_client
    from google_calendar_client import encrypt_token

    pending = await db.oauth_states.find_one({"state": state, "kind": "mailbox"}, {"_id": 0})
    if not pending:
        raise HTTPException(400, "invalid or expired oauth state")
    await db.oauth_states.delete_one({"state": state})

    mbx = await db.mailboxes.find_one({"id": pending["mailbox_id"]}, {"_id": 0})
    if not mbx:
        raise HTTPException(404, "mailbox not found")

    try:
        if mbx.get("provider") == "gmail":
            tokens = mailbox_client.gmail_exchange(code)
        else:
            tokens = await mailbox_client.ms_exchange(code)
    except Exception as ex:
        log.warning("mailbox oauth exchange failed: %s", ex)
        return RedirectResponse(f"{FRONTEND_URL}/app/mailboxes?error=oauth_failed")

    await db.mailboxes.update_one({"id": mbx["id"]}, {"$set": {
        "status": "connected",
        "mocked": False,
        "access_token_enc": encrypt_token(tokens.get("access_token")),
        "refresh_token_enc": encrypt_token(tokens.get("refresh_token")),
        "token_expiry": tokens.get("expiry"),
        "connected_at": now_iso(),
    }})
    return RedirectResponse(f"{FRONTEND_URL}/app/mailboxes?connected=1")


# ----------------------------- Models ------------------------------------------
class SourceIn(BaseModel):
    domain: str
    limit: int = 10
    icp_id: Optional[str] = None


class ImportIn(BaseModel):
    prospects: List[Dict[str, Any]]


class DraftIn(BaseModel):
    lead_id: str
    offer: str = ""
    goal: str = "Book a 15-minute intro call."
    tone: str = ""  # empty = use the workspace's Brand Voice tone setting
    signature: str = ""


# ----------------------------- Sourcing -----------------------------------------
@pitch_router.get("/providers")
async def providers(user=Depends(current_user)):
    return lead_sources.provider_status()


@pitch_router.post("/source")
async def source_leads(body: SourceIn, user=Depends(current_user)):
    """Find people at a company domain and verify their emails.

    Unlike the old /prospect/search this does NOT fall back to fictional people
    when a real provider errors — a failed lookup is reported as a failure.
    """
    wid = user["workspace_id"]
    await check_credits(wid, "lead_enrichment")

    try:
        prospects = await lead_sources.domain_search(body.domain, body.limit)
    except ProviderError as ex:
        # Surfaced, not swallowed. Emailing people who don't exist is the failure
        # mode this replaces.
        raise HTTPException(502, f"Lead provider failed: {ex}")
    except ValueError as ex:
        raise HTTPException(400, str(ex))

    if prospects:
        verifications = await lead_sources.verify_many([p["email"] for p in prospects])
        for p, v in zip(prospects, verifications):
            p["verification"] = v
            p["verified"] = v["status"] == "valid"
        await charge_credits(wid, "lead_enrichment", units=len(prospects),
                              meta={"domain": body.domain, "found": len(prospects)},
                              allow_overdraft=True)

    return {
        "domain": lead_sources.clean_domain(body.domain),
        "prospects": prospects,
        "providers": lead_sources.provider_status(),
    }


@pitch_router.post("/import")
async def import_leads(body: ImportIn, user=Depends(current_user)):
    """Dedupe on email OR linkedin_url — the doc's rule. The old importer only
    checked email, so the same person sourced twice under two addresses landed
    twice."""
    wid = user["workspace_id"]
    added, skipped = 0, 0

    for p in body.prospects:
        email = (p.get("email") or "").lower().strip()
        linkedin = (p.get("linkedin_url") or "").lower().strip()
        if not email or not _verify_email_syntax(email):
            skipped += 1
            continue

        dupe_or = [{"email": email}]
        if linkedin:
            dupe_or.append({"linkedin_url": linkedin})
        if await db.leads.find_one({"workspace_id": wid, "$or": dupe_or}):
            skipped += 1
            continue

        await db.leads.insert_one({
            "id": new_id(), "workspace_id": wid,
            "first_name": p.get("first_name", ""), "last_name": p.get("last_name", ""),
            "email": email, "company": p.get("company", ""), "title": p.get("title", ""),
            "linkedin_url": linkedin, "phone": p.get("phone"),
            "tags": [p.get("source", "sourced")], "status": "new",
            "source": p.get("source", "prospeo"),
            "confidence": float(p.get("confidence", 0.7)),
            # Research and intent are separate, billable steps — not silently run
            # on import. The lead starts honestly unenriched.
            "enrichment_status": "pending",
            "intent": None,
            "verified": bool(p.get("verified")),
            "verification": p.get("verification") or {},
            "phone_verified": False, "dnc": False,
            "created_at": now_iso(),
        })
        added += 1

    await _audit(user, "pitch_eq.leads.import", {"added": added, "skipped": skipped})
    return {"added": added, "skipped": skipped}


# ----------------------------- Research + intent --------------------------------
async def _enrich(wid: str, lead: Dict[str, Any], force: bool = False) -> Dict[str, Any]:
    """Research then score. Shared by the single and bulk routes, and by the draft
    chain (which needs the pack anyway)."""
    pack = await research_worker.get_research(wid, lead, force=force)
    intent = await intent_engine.score_lead(wid, lead, pack)
    await db.leads.update_one({"id": lead["id"]}, {"$set": {
        "intent": intent,
        "icp_score": intent["score"],   # keep the legacy field in sync, now real
        "enrichment_status": "enriched" if pack.get("has_signal") else "no_signal",
        "enriched_at": now_iso(),
    }})
    return {"pack": pack, "intent": intent}


@pitch_router.post("/leads/{lead_id}/enrich")
async def enrich_lead(lead_id: str, force: bool = False, user=Depends(current_user)):
    wid = user["workspace_id"]
    lead = await db.leads.find_one({"id": lead_id, "workspace_id": wid}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "lead not found")

    await charge_credits(wid, "lead_research", meta={"lead_id": lead_id})
    await charge_credits(wid, "intent_score", meta={"lead_id": lead_id})
    result = await _enrich(wid, lead, force=force)

    await _log_activity(wid, lead_id, "pitch", "lead_researched",
                         f"Researched {lead.get('company') or lead.get('email')} — "
                         f"intent {result['intent']['score']} ({result['intent']['band']})",
                         {"intent": result["intent"]["score"]})
    return result


@pitch_router.get("/leads/{lead_id}/research")
async def get_lead_research(lead_id: str, user=Depends(current_user)):
    """Read what we already know. Free — never charge to read your own data."""
    wid = user["workspace_id"]
    doc = await db.lead_research.find_one({"workspace_id": wid, "lead_id": lead_id}, {"_id": 0})
    lead = await db.leads.find_one({"id": lead_id, "workspace_id": wid}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "lead not found")
    return {
        "pack": (doc or {}).get("pack"),
        "researched_at": (doc or {}).get("researched_at"),
        "intent": lead.get("intent"),
        "enrichment_status": lead.get("enrichment_status", "pending"),
    }


# ----------------------------- Draft chain --------------------------------------
@pitch_router.post("/draft")
async def draft_email(body: DraftIn, user=Depends(current_user)):
    """Research → Angle → Draft → Humanise. Returns structured HTML + text."""
    wid = user["workspace_id"]
    lead = await db.leads.find_one({"id": body.lead_id, "workspace_id": wid}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "lead not found")

    await charge_credits(wid, "email_draft_chain", meta={"lead_id": body.lead_id})

    # Reuse the cached pack when it's fresh — research is the slow part, and it's
    # already paid for by /enrich.
    pack = await research_worker.get_research(wid, lead)

    ws = await db.workspaces.find_one({"id": wid}, {"_id": 0})
    bv = (ws or {}).get("brand_voice") or {}

    offer = body.offer.strip() or bv.get("offer", "").strip() or \
        "No specific offer is configured for this workspace yet — write generically, without inventing product claims."
    # An explicit per-draft tone always wins; otherwise fall back to the
    # workspace's real Brand Voice setting instead of a hardcoded "warm" that
    # ignored whatever the user configured in Settings.
    tone = (body.tone or "").strip() or bv.get("tone", "warm")

    try:
        result = await draft_chain.run_chain(
            lead, pack, offer=offer, goal=body.goal, tone=tone,
            signature=body.signature,
        )
    except ChainError as ex:
        raise HTTPException(502, f"Draft chain failed: {ex}")

    await db.email_drafts.insert_one({
        "id": new_id(), "workspace_id": wid, "lead_id": body.lead_id,
        "owner_id": user["id"], **result, "created_at": now_iso(),
    })
    await _log_activity(wid, body.lead_id, "pitch", "email_drafted",
                         f"Wrote a researched email: {result['subject']}",
                         {"confidence": result["confidence"], "has_angle": result["has_angle"]})
    return result
