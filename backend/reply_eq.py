"""Reply EQ — customer-state sales agent for WhatsApp.

Phase 1 + 5 MVP of the Reply EQ roadmap: a persistent customer profile
(`reply_customers`) holding a Customer State Object (stage, intent, purchase
probability, objection, next action) and an autonomous Follow-up Agent that
re-engages customers on a dynamic cadence through the existing WhatsApp
infrastructure, with explicit guardrails at every step.

Phase 6 (after-sales): a purchase closes the sales cadence and schedules one
nurture check-in (`kind: nurture`) a few days after the purchase — thank +
feedback invite, never a pitch. Repeat customers get no automated touch; a
`needs_template` stop still applies once the 24h session closes.

Wired into the existing inbound flow: `whatsapp_eq.whatsapp_incoming` calls
`record_whatsapp_inbound()` after the automated agent's turn, so *every*
WhatsApp conversation — agent on or off — produces and maintains a customer
state. Everything downstream (stage transitions, probability, cadence) is
deterministic heuristics, same philosophy as the EQ Score engine in server.py:
no LLM in the state machine, one grounded LLM call only inside a follow-up
send, charged before the call like every other agent in this codebase.

Guardrails the tick enforces before touching a phone number:
  - opt-in only via `whatsapp_settings.followup_agent_enabled` (default off)
  - respected opt-outs (whatsapp_contacts.opted_out) and DNC (leads.dnc)
  - closed session (24h) without an approved template configured -> honest
    `needs_template` stop — never an unlicensed outbound message
  - max attempts per cycle, minimum gap between messages, one customer per
    plan (inbound re-plans; stale docs get cancelled)
"""

import logging
import re
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from server import (
    db, now_iso, new_id, current_user, _llm_chat, _extract_json, ANTHROPIC_API_KEY,
    require_role,
)
from billing import charge_credits
from twilio_client import twilio_client
from whatsapp_eq import _sanitize_phone, _session_expired, _clean_reply, _get_brand_voice, SESSION_HOURS

log = logging.getLogger(__name__)

reply_router = APIRouter(prefix="/reply-eq")

# ---- Stage machine ----
ACTIVE_STAGES = [
    "new", "engaged", "qualified", "interested", "considering",
    "checkout", "payment_pending", "purchased", "repeat_customer",
]
TERMINAL_STAGES = ["not_interested", "no_response", "lost"]
ALL_STAGES = ACTIVE_STAGES + TERMINAL_STAGES
STAGE_RANK = {stage: i for i, stage in enumerate(ALL_STAGES)}

# Reply EQ intent names -> state-machine events (fresh from the WhatsApp agent
# classification); a plain inbound with no classification is just "inbound".
_INTENT_EVENTS = {
    "book_meeting": "intent_book_meeting",
    "callback": "intent_callback",
    "share_link": "intent_share_link",
    "faq": "intent_faq",
    "handoff": "intent_handoff",
}

# Intent -> probability adjustment ("high" is a buying signal, not an emotion).
_INTENT_ADJ = {"high": 0.12, "medium": 0.0, "low": -0.08}

# Objections are extracted deterministically from message text (see
# extract_signals) and each carries a probability penalty.
_OBJECTION_ADJ = {
    "price": -0.05, "timing": -0.05, "budget": -0.08,
    "trust": -0.06, "fit": -0.04, "competitor": -0.07,
}
KNOWN_OBJECTIONS = list(_OBJECTION_ADJ)

PROB_BASE = {
    "new": 0.12, "engaged": 0.25, "qualified": 0.40, "interested": 0.52,
    "considering": 0.62, "checkout": 0.78, "payment_pending": 0.85,
    "purchased": 0.97, "repeat_customer": 0.90,
    "not_interested": 0.10, "no_response": 0.18, "lost": 0.08,
}


def apply_event(stage: str, event: str) -> str:
    """Customer State Object transition table, promotion-only across the active
    stages (a late message never demotes you; `cart_abandoned` is the one
    explicit demote). Terminal stages resume on evidence of re-engagement; an
    explicit `not_interested` is respected until a strong intent event."""
    def promote(target: str) -> str:
        if stage in TERMINAL_STAGES:
            return target
        return target if STAGE_RANK[stage] < STAGE_RANK[target] else stage

    if event == "inbound":
        if stage == "not_interested":
            return stage
        return promote("engaged")
    if event in ("intent_book_meeting", "intent_callback"):
        return promote("qualified")
    if event == "intent_share_link":
        return promote("interested")
    if event in ("intent_faq", "intent_handoff"):
        return promote("engaged")
    if event == "checkout_started":
        if stage in TERMINAL_STAGES:
            return "engaged"
        return "checkout" if STAGE_RANK[stage] < STAGE_RANK["checkout"] else stage
    if event == "payment_pending":
        if stage in TERMINAL_STAGES:
            return "engaged"
        return "payment_pending" if STAGE_RANK[stage] < STAGE_RANK["payment_pending"] else stage
    if event == "purchase":
        return "repeat_customer" if stage in ("purchased", "repeat_customer") else "purchased"
    if event == "cart_abandoned":
        if stage in TERMINAL_STAGES:
            return "engaged"
        return "considering" if STAGE_RANK[stage] in (STAGE_RANK["checkout"], STAGE_RANK["payment_pending"]) \
            else promote("considering")
    if event == "still_considering":
        return promote("considering")
    if event == "resume":
        return "engaged"
    return stage


def compute_purchase_probability(
    stage: str,
    intent: str = "medium",
    objection: Optional[str] = None,
    hours_since_last_contact: Optional[float] = None,
) -> float:
    """Deterministic buying-probability heuristic (no LLM — same philosophy as
    the EQ Score engine): stage base, plus intent signal and any stated
    objection, nudged by recency of engagement. Clamped to 3–97%."""
    p = PROB_BASE.get(stage, 0.15) + _INTENT_ADJ.get(intent or "medium", 0.0)
    if objection:
        p += _OBJECTION_ADJ.get(objection, 0.0)
    if hours_since_last_contact is not None:
        if hours_since_last_contact <= 24:
            p += 0.05
        elif hours_since_last_contact >= 168:
            p -= 0.05
    return round(min(0.97, max(0.03, p)), 4)


def cadence_for(prob: float, max_attempts: int = 4) -> List[int]:
    """Dynamic follow-up cadence (hours after last contact). Hot leads get a
    tighter first touch; the standard set matches the roadmap's 24h/3d/7d/14d.
    Never an empty list — a plan always has at least one attempt."""
    if prob >= 0.8:
        offsets = [6, 24, 72, 168]
    elif prob >= 0.6:
        offsets = [12, 48, 120, 240]
    else:
        offsets = [24, 72, 168, 336]
    return offsets[:max(1, max_attempts)]


def enforce_min_gap(offsets: List[int], min_gap_hours: int) -> List[int]:
    """Spacing guardrail: no two messages closer than min_gap_hours apart —
    independent of whatever cadence the probability-driven set picks."""
    out: List[int] = []
    for off in offsets:
        if out:
            off = max(off, out[-1] + max(1, min_gap_hours))
        out.append(off)
    return out


# ---- Signal extraction (deterministic, zero LLM cost) ----
_NAME_RE = re.compile(r"\b(?:i'?m|i am|my name is|this is)\s+([A-Za-z][a-z]{1,20})\b")
_INTEREST_RE = re.compile(r"\b(buy|order|checkout|cart|how much|price|pay\b|sign up|subscribe)\b", re.I)
_OBJECTION_PATTERNS = [
    ("price", re.compile(r"\b(price|cost|expensive|cheap|affordable|budget|discount|offer|deal)\b", re.I)),
    ("timing", re.compile(r"\b(payday|salary|next month|next week|end of month)\b", re.I)),
    ("budget", re.compile(r"\b(no money|can'?t afford|tight budget|low on cash)\b", re.I)),
    ("trust", re.compile(r"\b(scam|trust|legit|guarantee|fake)\b", re.I)),
    ("competitor", re.compile(r"\b(compare|competitor|alternative|other option)\b", re.I)),
    ("fit", re.compile(r"\b(fit\b|size|sizes|variant|color|colour|customi[sz]e)\b", re.I)),
]


def extract_signals(text: str) -> Dict[str, Any]:
    """Cheap deterministic signals from a message: name hint, first matching
    objection, and a buying-interest flag. Used to grow the customer's memory
    without spending an LLM call per message."""
    name_match = _NAME_RE.search(text or "")
    worry = None
    for key, pattern in _OBJECTION_PATTERNS:
        if pattern.search(text or ""):
            worry = key
            break
    return {
        "name": name_match.group(1).capitalize() if name_match else None,
        "objection": worry,
        "interest": bool(_INTEREST_RE.search(text or "")),
    }


# ---- Workspace settings ----
_DEFAULT_SETTINGS: Dict[str, Any] = {
    "followup_agent_enabled": False,
    "max_attempts": 4,
    "min_gap_hours": 6,
    "cadence_hours": None,           # None = dynamic from purchase probability
    "template_id": None,             # approved WA template for closed-session sends (reserved)
    "reengage_after_days": 14,
    "after_sales_hours": 72,         # post-purchase nurture check-in delay
}


async def _get_settings(wid: str) -> Dict[str, Any]:
    row = await db.reply_settings.find_one({"workspace_id": wid}, {"_id": 0})
    return {**_DEFAULT_SETTINGS, **(row or {})}


def _next_action_for(stage: str) -> str:
    if stage in ("purchased", "repeat_customer"):
        return "nurture"
    if stage in ("not_interested", "lost"):
        return "none"
    if stage == "no_response":
        return "re_engage_in_14d"
    return "follow_up"


# ---- Follow-up planning ----
async def _cancel_planned_followups(customer_id: str, reason: str) -> None:
    await db.reply_followups.update_many(
        {"customer_id": customer_id, "status": "planned"},
        {"$set": {"status": "cancelled", "cancelled_reason": reason, "updated_at": now_iso()}},
    )


async def plan_followups(customer: Dict[str, Any], settings: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Cancel the customer's pending plan and lay down the next one from the
    current state — called after every inbound (fresh cycle from last contact)
    and after any state override. Returns the new plan's documents.

    Stage -> plan:
      - purchased      : one nurture check-in (kind "nurture") after
                         `after_sales_hours` — thank + feedback, never a pitch
      - repeat_customer: no automated touch; the repeat buyer re-engages on
                         their own cadence
      - no_response    : a single re-engage nudge `reengage_after_days` out
      - not_interested / lost : no plan at all
      - active stage   : the probability-driven sales cadence
    """
    cid = customer["id"]
    await _cancel_planned_followups(cid, "replanned")

    stage = customer["state"]["stage"]
    now = now_iso()

    if stage in ("not_interested", "lost"):
        await db.reply_customers.update_one(
            {"id": cid},
            {"$set": {"state.next_action": _next_action_for(stage), "state.next_action_at": None}})
        return []

    if stage == "purchased":
        offsets = [int(settings.get("after_sales_hours", 72))]
        kind = "nurture"
        next_action = "nurture"
    elif stage == "repeat_customer":
        await db.reply_customers.update_one(
            {"id": cid},
            {"$set": {"state.next_action": "nurture", "state.next_action_at": None}})
        return []
    elif stage == "no_response":
        offsets = [settings.get("reengage_after_days", 14) * 24]
        kind = "re_engage"
        next_action = "re_engage_in_14d"
    else:
        prob = customer["state"]["purchase_probability"]
        base = settings.get("cadence_hours") or cadence_for(prob, settings.get("max_attempts", 4))
        offsets = enforce_min_gap(list(base), settings.get("min_gap_hours", 6))
        kind = "follow_up"
        next_action = "follow_up"

    last_contact = customer.get("last_contact_at") or now
    docs = []
    for attempt, hours in enumerate(offsets, start=1):
        due = (datetime.fromisoformat(last_contact) + timedelta(hours=hours)).isoformat()
        docs.append({
            "id": new_id(), "workspace_id": customer["workspace_id"],
            "customer_id": cid, "phone": customer["phone"],
            "attempt": attempt, "kind": kind, "status": "planned",
            "due_at": due, "created_at": now, "updated_at": now,
            "channel_note": "whatsapp",
        })
    if docs:
        await db.reply_followups.insert_many(docs)
        updates = {"state.next_action": next_action,
                   "state.next_action_at": docs[0]["due_at"]}
        if kind == "nurture":
            entry = {"at": now, "event": "nurture_scheduled", "note": f"after-sales check-in in {offsets[0]}h"}
            await db.reply_customers.update_one(
                {"id": cid},
                {"$set": updates, "$push": {"history": {"$each": [entry], "$slice": -50}}})
        else:
            await db.reply_customers.update_one({"id": cid}, {"$set": updates})
    return docs


def _push_history(customer: Dict[str, Any], event: str, note: str, by: Optional[str] = None) -> Dict[str, Any]:
    return {
        "at": now_iso(), "event": event, "note": note,
        "stage_from": customer.get("state", {}).get("stage"),
        **({"by": by} if by else {}),
    }


async def record_whatsapp_inbound(wid: str, phone: str, body: str,
                                  intent: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Called from the WhatsApp inbound webhook after the automated agent's
    turn (or instead of it when the agent is off). Every inbound message
    creates/updates the customer profile, advances the state machine, re-scans
    signals into memory, and re-plans the follow-up cycle from this contact.
    Never raises — the webhook wraps this in a try/except backstop."""
    phone = _sanitize_phone(phone)
    if not phone:
        return None

    signals = extract_signals(body or "")
    event = _INTENT_EVENTS.get(intent, "inbound")
    now = now_iso()

    cust = await db.reply_customers.find_one({"workspace_id": wid, "phone": phone}, {"_id": 0})
    if not cust:
        lead = await db.leads.find_one({"phone": phone, "workspace_id": wid}, {"_id": 0})
        cust = {
            "id": new_id(), "workspace_id": wid, "phone": phone,
            "lead_id": lead["id"] if lead else None,
            "name": signals["name"] or "",
            "first_seen_at": now, "last_contact_at": now,
            "state": {
                "stage": "new", "intent": "medium",
                "purchase_probability": PROB_BASE["new"],
                "product_interest": [], "objection": None,
                "next_action": "follow_up", "next_action_at": None,
            },
            "memory": {"facts": [], "objections": [], "preferences": []},
            "stats": {"messages_in": 0, "messages_out": 0, "followups_sent": 0,
                      "no_response_streak": 0, "purchases": 0},
            "history": [],
            "created_at": now, "updated_at": now,
        }
        cust["history"].append(_push_history(cust, "customer_created", "first inbound message"))
        await db.reply_customers.insert_one(cust)

    # First message or not, this inbound advances the state machine.
    stage = apply_event(cust["state"]["stage"], event)
    hours_since = None
    try:
        hours_since = (datetime.now(datetime.now().astimezone().tzinfo)
                       - datetime.fromisoformat(cust["last_contact_at"])).total_seconds() / 3600
    except Exception:
        pass
    intent_val = "high" if intent in ("book_meeting", "share_link") else "medium"
    objection = signals["objection"] or cust["state"].get("objection")
    prob = compute_purchase_probability(stage, intent_val, objection, hours_since)
    updates = {
        "last_contact_at": now, "updated_at": now,
        "stats.messages_in": cust["stats"].get("messages_in", 0) + 1,
        "state.stage": stage,
        "state.intent": intent_val,
        "state.purchase_probability": prob,
        "state.objection": objection,
    }
    if signals["name"] and not cust.get("name"):
        updates["name"] = signals["name"]
    entry = _push_history(cust, event, f"inbound (intent={intent or 'none'})")
    await db.reply_customers.update_one(
        {"id": cust["id"]},
        {"$set": updates, "$push": {"history": {"$each": [entry], "$slice": -50}}})

    cust = await db.reply_customers.find_one({"id": cust["id"]}, {"_id": 0})
    settings = await _get_settings(wid)
    await plan_followups(cust, settings)
    return cust


async def _set_followup_status(fid: str, status: str, reason: str) -> None:
    await db.reply_followups.update_one(
        {"id": fid},
        {"$set": {"status": status, "cancelled_reason": reason, "updated_at": now_iso()}})


async def _generate_followup_message(wid: str, customer: Dict[str, Any],
                                     conv: Dict[str, Any], settings: Dict[str, Any],
                                     kind: str = "follow_up") -> Optional[str]:
    """One grounded LLM call for the follow-up body — brand voice from the same
    whatsapp_settings the live agent uses, context from the customer's memory
    and the last messages. Returns None if the model is unconfigured or the
    reply is empty; credits are charged by the caller *before* this runs.
    The system prompt is kind-aware: a nurture message after purchase checks
    in and invites feedback; a re-engage nudge is pressure-free."""
    if not ANTHROPIC_API_KEY:
        return None
    if kind == "nurture":
        purpose = (
            "The customer has ALREADY PURCHASED. This is a post-purchase check-in: "
            "thank them, ask how they're finding it, and invite feedback or questions. "
            "Do NOT pitch, upsell, or push a new sale in this message."
        )
    elif kind == "re_engage":
        purpose = (
            "This customer went silent long ago and this is a soft, pressure-free "
            "re-engagement after weeks of no contact. A single warm line, no hard ask, "
            "no urgency — make it easy to ignore."
        )
    else:
        purpose = (
            "This is a follow-up on an active sales conversation. Reference the "
            "customer's stated concern or intent if there is one, and end with one "
            "soft question or a single clear next step."
        )
    memory = customer.get("memory", {})
    memory_lines = []
    if memory.get("objections"):
        memory_lines.append("Stated objection: " + ", ".join(memory["objections"]))
    if memory.get("preferences"):
        memory_lines.append("Preferences: " + ", ".join(memory["preferences"]))
    history = conv.get("messages", [])[-6:]
    history_text = "\n".join(f"{m.get('direction', '')}: {m.get('body', '')}" for m in history)
    bv = await _get_brand_voice(wid)
    tone = bv.get("tone") or "warm"
    offer = bv.get("offer") or ""
    banned = ", ".join(bv.get("banned_phrases") or [])
    previous = await db.reply_followups.find(
        {"customer_id": customer["id"], "status": "sent"}, {"_id": 0, "sent_body": 1},
    ).sort("sent_at", -1).limit(3).to_list(3)
    previously_sent = " | ".join(p.get("sent_body") or "" for p in previous)

    system = (
        "You are composing ONE follow-up WhatsApp message for a sales conversation. "
        "Plain text only — no markdown, no bullet lists, no quotes around the message. "
        "One message, at most 240 characters. It must:\n"
        f"- {purpose}\n"
        "- sound like a person texting, warm but not pushy\n"
        "- NOT invent discounts, prices, or urgency that are not in the context\n"
        "- NOT repeat wording already sent to this customer\n"
        "Respond with STRICT JSON only: {\"message\": \"...\"}\n"
        f"Tone: {tone}." + (f" Offer: {offer}." if offer else "") +
        (f" Never use these words/phrases: {banned}." if banned else "") + "\n\n"
        f"Customer memory:\n" + ("\n".join(memory_lines) if memory_lines else "(none)") +
        f"\n\nAlready sent to this customer:\n{previously_sent or '(none)'}" +
        f"\n\nConversation so far:\n{history_text}"
    )
    user_text = f"Compose the follow-up message for the customer on phone {customer['phone']}."
    try:
        raw = await _llm_chat(system, user_text, f"reply-followup-{customer['id'][:8]}",
                              user={"workspace_id": wid}, agent="reply",
                              action="reply_followup_message")
        parsed = _extract_json(raw) or {}
        return _clean_reply(parsed.get("message") or "")
    except Exception as ex:
        log.warning("Reply EQ follow-up generation failed for customer %s: %s", customer["id"], ex)
        return None


async def _mark_no_response(customer: Dict[str, Any], settings: Dict[str, Any]) -> None:
    """The whole cycle went out unanswered — honest terminal state, plus one
    final re-engage nudge weeks out (the roadmap's 'try again after 14 days'),
    which itself requires an open session or a configured template to send."""
    hours_since = None
    try:
        hours_since = (datetime.now(datetime.now().astimezone().tzinfo)
                       - datetime.fromisoformat(customer["last_contact_at"])).total_seconds() / 3600
    except Exception:
        pass
    stage = "no_response"
    prob = compute_purchase_probability(stage, customer["state"].get("intent", "medium"),
                                        customer["state"].get("objection"), hours_since)
    entry = _push_history(customer, "followup_cycle_exhausted",
                          f"no reply after {settings.get('max_attempts', 4)} follow-ups")
    await db.reply_customers.update_one(
        {"id": customer["id"]},
        {"$set": {"state.stage": stage, "state.purchase_probability": prob,
                  "state.next_action": "re_engage_in_14d",
                  "state.next_action_at": None, "updated_at": now_iso()},
         "$push": {"history": {"$each": [entry], "$slice": -50}}})
    cust = await db.reply_customers.find_one({"id": customer["id"]}, {"_id": 0})
    await plan_followups(cust, settings)


async def _process_followup(fu: Dict[str, Any]) -> None:
    """One claimed follow-up through the guardrail chain. Guardrails stop the
    send (cancelled) before any spend; only a fully-passing follow-up pays for
    its LLM message and its outbound WhatsApp message."""
    wid = fu["workspace_id"]
    fid = fu["id"]
    phone = fu["phone"]

    settings = await _get_settings(wid)
    if not settings.get("followup_agent_enabled"):
        await _set_followup_status(fid, "cancelled", "agent_disabled")
        return

    cust = await db.reply_customers.find_one({"id": fu["customer_id"]}, {"_id": 0})
    if not cust:
        await _set_followup_status(fid, "cancelled", "customer_deleted")
        return
    stage = cust["state"]["stage"]
    if stage in ("not_interested",):
        await _set_followup_status(fid, "cancelled", "customer_not_interested")
        return
    # A nurture check-in is exactly what a purchaser is waiting on — it must
    # survive the purchase_completed guardrail that cancels straggler sale docs.
    if stage in ("purchased", "repeat_customer") and fu.get("kind") != "nurture":
        await _set_followup_status(fid, "cancelled", "purchase_completed")
        return

    # Compliance: opt-out and DNC are absolute.
    contact = await db.whatsapp_contacts.find_one({"workspace_id": wid, "phone": phone}, {"_id": 0})
    if contact and contact.get("opted_out"):
        await _set_followup_status(fid, "cancelled", "opted_out")
        return
    lead = await db.leads.find_one({"phone": phone, "workspace_id": wid}, {"_id": 0})
    if lead and lead.get("dnc"):
        await _set_followup_status(fid, "cancelled", "dnc")
        return

    conv = await db.whatsapp_conversations.find_one(
        {"workspace_id": wid, "phone": phone}, {"_id": 0}, sort=[("updated_at", -1)])
    if conv and (conv.get("updated_at") or "") > fu.get("due_at", ""):
        # They messaged us after this was planned — that inbound already
        # re-planned everything; this doc is simply stale.
        await _set_followup_status(fid, "cancelled", "customer_replied")
        return

    if conv and not _session_expired(conv.get("session_expires_at")):
        # Session open: a freeform message is licensed. Charge before the LLM
        # call, same convention as every other agent here.
        await charge_credits(wid, "reply_followup_send", meta={"customer_id": cust["id"], "followup_id": fid})
        kind = fu.get("kind", "follow_up")
        body = await _generate_followup_message(wid, cust, conv, settings, kind)
        if not body:
            await _set_followup_status(fid, "failed", "message_generation")
            return
        msg = {"id": new_id(), "direction": "agent", "body": body, "at": now_iso(),
               "automated": True, "kind": kind}
        try:
            await twilio_client.send_whatsapp(to_number=phone, body=body)
        except Exception as ex:
            log.warning("Reply EQ follow-up send failed for %s: %s", fid, ex)
            await _set_followup_status(fid, "failed", "send_failed")
            return
        await db.whatsapp_conversations.update_one(
            {"id": conv["id"]},
            {"$push": {"messages": msg}, "$set": {"updated_at": now_iso()}})
        await db.reply_followups.update_one(
            {"id": fid},
            {"$set": {"status": "sent", "sent_at": now_iso(), "sent_body": body, "updated_at": now_iso()}})
        # Sales-cycle stats only — a silent nurture check-in must never count
        # against the customer as a "no response" streak.
        if kind in ("follow_up", "re_engage"):
            await db.reply_customers.update_one(
                {"id": cust["id"]},
                {"$inc": {"stats.followups_sent": 1, "stats.messages_out": 1, "stats.no_response_streak": 1}})
            if fu.get("attempt", 1) >= settings.get("max_attempts", 4) and kind == "follow_up":
                await _mark_no_response(cust, settings)
        else:
            await db.reply_customers.update_one(
                {"id": cust["id"]},
                {"$inc": {"stats.messages_out": 1, "stats.after_sales_sends": 1}})
        return

    # Session closed and no approved-template channel exists in this MVP yet —
    # an honest stop beats an unlicensed outbound message.
    await _set_followup_status(fid, "needs_template", "session_closed")


# ---- Scheduler tick ----
async def run_reply_eq_tick() -> None:
    """Drain due Reply EQ follow-ups — runs every 5 minutes. Each doc is
    claimed atomically (status planned -> claimed) so overlapping ticks can't
    double-send; the claim is cheap and the work happens after it."""
    due = await db.reply_followups.find(
        {"status": "planned", "due_at": {"$lte": now_iso()}},
        {"_id": 0},
    ).sort("due_at", 1).limit(50).to_list(50)
    for fu in due:
        claimed = await db.reply_followups.update_one(
            {"id": fu["id"], "status": "planned"},
            {"$set": {"status": "claimed", "claimed_at": now_iso()}})
        if claimed.modified_count == 0:
            continue
        try:
            await _process_followup(fu)
        except Exception as ex:
            log.warning("Reply EQ follow-up %s crashed: %s", fu["id"], ex)
            await _set_followup_status(fu["id"], "failed", "tick_error")


# ---- Models ----
class StateOverrideIn(BaseModel):
    stage: Optional[str] = None
    intent: Optional[str] = None
    objection: Optional[str] = None
    note: Optional[str] = None


class EventIn(BaseModel):
    event: str
    phone: Optional[str] = None
    customer_id: Optional[str] = None
    sku: Optional[str] = None
    amount: Optional[float] = None
    note: Optional[str] = None


class SettingsIn(BaseModel):
    followup_agent_enabled: Optional[bool] = None
    max_attempts: Optional[int] = None
    min_gap_hours: Optional[int] = None
    cadence_hours: Optional[List[int]] = None
    template_id: Optional[str] = None
    reengage_after_days: Optional[int] = None
    after_sales_hours: Optional[int] = None


# ---- Routes ----
@reply_router.get("/overview")
async def overview(user=Depends(current_user)):
    wid = user["workspace_id"]
    stages = {s: 0 for s in ACTIVE_STAGES + TERMINAL_STAGES}
    pipeline = await db.reply_customers.aggregate([
        {"$match": {"workspace_id": wid}},
        {"$group": {"_id": "$state.stage", "n": {"$sum": 1}}},
    ]).to_list(50)
    for row in pipeline:
        stages[row["_id"]] = row["n"]
    due_today = await db.reply_followups.count_documents({
        "workspace_id": wid, "status": "planned",
        "due_at": {"$gte": now_iso(), "$lte": (datetime.now(datetime.now().astimezone().tzinfo) + timedelta(days=1)).isoformat()},
    })
    settings = await _get_settings(wid)
    return {
        "pipeline": stages,
        "due_followups_today": due_today,
        "followup_agent_enabled": settings["followup_agent_enabled"],
        "active_customers": sum(stages[s] for s in ACTIVE_STAGES),
    }


@reply_router.get("/customers")
async def list_customers(stage: Optional[str] = Query(None), intent: Optional[str] = Query(None),
                         q: Optional[str] = Query(None, max_length=80),
                         page: int = Query(1, ge=1), user=Depends(current_user)):
    wid = user["workspace_id"]
    query: Dict[str, Any] = {"workspace_id": wid}
    if stage:
        if stage not in ALL_STAGES:
            raise HTTPException(400, f"Unknown stage '{stage}'")
        query["state.stage"] = stage
    if intent:
        if intent not in _INTENT_ADJ:
            raise HTTPException(400, "intent must be one of low/medium/high")
        query["state.intent"] = intent
    if q:
        import re as _re
        rx = _re.compile(re.escape(q), _re.I)
        query["$or"] = [{"phone": rx}, {"name": rx}]
    total = await db.reply_customers.count_documents(query)
    items = await db.reply_customers.find(query, {"_id": 0, "history": 0}) \
        .sort("last_contact_at", -1) \
        .skip((page - 1) * 25) \
        .to_list(25)
    return {"items": items, "total": total, "page": page, "page_size": 25}


@reply_router.get("/customers/{cid}")
async def get_customer(cid: str, user=Depends(current_user)):
    cust = await db.reply_customers.find_one({"id": cid, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not cust:
        raise HTTPException(404, "Customer not found")
    followups = await db.reply_followups.find(
        {"customer_id": cid}, {"_id": 0}).sort("due_at", 1).to_list(100)
    conv = await db.whatsapp_conversations.find_one(
        {"workspace_id": user["workspace_id"], "phone": cust["phone"]},
        {"_id": 0}, sort=[("updated_at", -1)])
    return {"customer": cust, "followups": followups, "conversation": conv}


@reply_router.post("/customers/{cid}/state")
async def override_state(cid: str, body: StateOverrideIn, user=Depends(current_user)):
    """Manual state override — for the human reviewer, not the agent. Kept as
    data (audited in customer.history), never bypasses the guardrails: a
    terminal stage cancels the follow-up plan."""
    wid = user["workspace_id"]
    cust = await db.reply_customers.find_one({"id": cid, "workspace_id": wid}, {"_id": 0})
    if not cust:
        raise HTTPException(404, "Customer not found")
    if body.stage is not None and body.stage not in ALL_STAGES:
        raise HTTPException(400, f"Unknown stage '{body.stage}'")
    if body.intent is not None and body.intent not in _INTENT_ADJ:
        raise HTTPException(400, "intent must be one of low/medium/high")
    if body.objection is not None and body.objection not in KNOWN_OBJECTIONS:
        raise HTTPException(400, f"Unknown objection '{body.objection}'")

    stage = body.stage or cust["state"]["stage"]
    intent = body.intent or cust["state"].get("intent", "medium")
    objection = body.objection if body.objection is not None else cust["state"].get("objection")
    prob = compute_purchase_probability(stage, intent, objection)
    entry = _push_history(cust, "manual_override",
                          body.note or "state overridden by user", by=user["username"])
    await db.reply_customers.update_one(
        {"id": cid},
        {"$set": {"state.stage": stage, "state.intent": intent, "state.objection": objection,
                  "state.purchase_probability": prob,
                  "state.next_action": _next_action_for(stage),
                  "state.next_action_at": None, "updated_at": now_iso()},
         "$push": {"history": {"$each": [entry], "$slice": -50}}})
    cust = await db.reply_customers.find_one({"id": cid}, {"_id": 0})
    settings = await _get_settings(wid)
    await plan_followups(cust, settings)
    return {"customer": cust}


@reply_router.get("/customers/{cid}/followups")
async def list_followups(cid: str, user=Depends(current_user)):
    cust = await db.reply_customers.find_one({"id": cid, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not cust:
        raise HTTPException(404, "Customer not found")
    items = await db.reply_followups.find({"customer_id": cid}, {"_id": 0}) \
        .sort("due_at", 1).to_list(200)
    return {"items": items}


@reply_router.post("/followups/{fid}/cancel")
async def cancel_followup(fid: str, user=Depends(current_user)):
    fu = await db.reply_followups.find_one({"id": fid}, {"_id": 0})
    if not fu or fu["workspace_id"] != user["workspace_id"]:
        raise HTTPException(404, "Follow-up not found")
    await _set_followup_status(fid, "cancelled", "cancelled_by_user")
    return {"ok": True}


@reply_router.post("/followups/{fid}/pause")
async def pause_followup(fid: str, user=Depends(current_user)):
    fu = await db.reply_followups.find_one({"id": fid}, {"_id": 0})
    if not fu or fu["workspace_id"] != user["workspace_id"]:
        raise HTTPException(404, "Follow-up not found")
    await db.reply_followups.update_one(
        {"id": fid},
        {"$set": {"status": "paused", "updated_at": now_iso()}})
    return {"ok": True}


@reply_router.post("/followups/{fid}/resume")
async def resume_followup(fid: str, user=Depends(current_user)):
    fu = await db.reply_followups.find_one({"id": fid}, {"_id": 0})
    if not fu or fu["workspace_id"] != user["workspace_id"]:
        raise HTTPException(404, "Follow-up not found")
    now = now_iso()
    await db.reply_followups.update_one(
        {"id": fid},
        {"$set": {"status": "planned", "due_at": now, "updated_at": now}})
    return {"ok": True}


@reply_router.post("/events")
async def record_event(body: EventIn, user=Depends(current_user)):
    """Commerce events drive the state machine without a message: checkout
    started, cart abandoned, payment pending, purchase made, or a manual
    'still considering' / 'resume' from the human reviewer."""
    wid = user["workspace_id"]
    allowed = {"checkout_started", "cart_abandoned", "payment_pending",
               "purchase", "still_considering", "resume"}
    if body.event not in allowed:
        raise HTTPException(400, f"event must be one of {sorted(allowed)}")

    query: Dict[str, Any] = {"workspace_id": wid}
    if body.customer_id:
        query["id"] = body.customer_id
    elif body.phone:
        query["phone"] = _sanitize_phone(body.phone)
    else:
        raise HTTPException(400, "phone or customer_id required")
    cust = await db.reply_customers.find_one(query, {"_id": 0})
    if not cust:
        raise HTTPException(404, "Customer not found — record it via the WhatsApp inbound first")

    stage = apply_event(cust["state"]["stage"], body.event)
    prob = compute_purchase_probability(stage, cust["state"].get("intent", "medium"),
                                        cust["state"].get("objection"))
    detail = f"sku={body.sku}" if body.sku else ""
    if body.amount is not None:
        detail = f"{detail} amount={body.amount}".strip()
    entry = _push_history(cust, body.event, f"event{(' ' + detail) if detail else ''}",
                          by=user["username"])
    updates = {
        "state.stage": stage,
        "state.purchase_probability": prob,
        "state.next_action": _next_action_for(stage),
        "state.next_action_at": None,
        "updated_at": now_iso(),
    }
    if body.event == "purchase":
        updates["stats.purchases"] = cust["stats"].get("purchases", 0) + 1
    await db.reply_customers.update_one(
        {"id": cust["id"]},
        {"$set": updates, "$push": {"history": {"$each": [entry], "$slice": -50}}})

    # An abandoned cart is a lost-turn signal: re-plan on a fast cadence so the
    # first recovery touch lands a couple of hours out, not a day.
    if body.event in ("cart_abandoned", "checkout_started", "payment_pending", "purchase"):
        cust = await db.reply_customers.find_one({"id": cust["id"]}, {"_id": 0})
        settings = await _get_settings(wid)
        if body.event == "cart_abandoned":
            settings = {**settings, "cadence_hours": [2, 24, 72]}
        await plan_followups(cust, settings)
    return {"customer": await db.reply_customers.find_one({"id": cust["id"]}, {"_id": 0})}


@reply_router.get("/settings")
async def get_settings(user=Depends(current_user)):
    return {"settings": await _get_settings(user["workspace_id"])}


@reply_router.patch("/settings")
async def update_settings(body: SettingsIn, user=Depends(require_role("org_admin", "campaign_manager"))):
    wid = user["workspace_id"]
    if body.max_attempts is not None and not 1 <= body.max_attempts <= 6:
        raise HTTPException(400, "max_attempts must be between 1 and 6")
    if body.min_gap_hours is not None and not 1 <= body.min_gap_hours <= 72:
        raise HTTPException(400, "min_gap_hours must be between 1 and 72")
    if body.reengage_after_days is not None and not 3 <= body.reengage_after_days <= 60:
        raise HTTPException(400, "reengage_after_days must be between 3 and 60")
    if body.after_sales_hours is not None and not 6 <= body.after_sales_hours <= 24 * 90:
        raise HTTPException(400, "after_sales_hours must be between 6 and 2160")
    if body.cadence_hours is not None:
        for hours in body.cadence_hours:
            if not 1 <= hours <= 24 * 90:
                raise HTTPException(400, "cadence hours must be between 1 and 2160")
    updates = {k: v for k, v in body.dict(exclude_unset=True).items()}
    if not updates:
        raise HTTPException(400, "nothing to update")
    await db.reply_settings.update_one(
        {"workspace_id": wid}, {"$set": updates, "$setOnInsert": {"workspace_id": wid}}, upsert=True)
    return {"settings": await _get_settings(wid)}