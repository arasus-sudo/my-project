"""Billing — plans, credit metering, and recurring subscriptions.

Credit model (Genspark-style): a plan grants a monthly credit allowance, and
every agent action deducts credits priced off what that action actually costs
us to run. Voice calls dominate the table because telephony + realtime voice is
by far our most expensive unit; text generation is close to free by comparison.

Credits reset each billing cycle — they do not roll over.

Stripe is mocked-first (STRIPE_MOCKED when no key), same convention as the
Retell / Google Calendar integrations, so the whole flow is demoable with zero
credentials. Card details are only ever entered on Stripe's own hosted Checkout
page — they never touch this application.
"""

import os
import json
import math
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from typing import Any, Dict, List, Optional

from server import db, current_user, now_iso, new_id, _audit

billing_router = APIRouter(prefix="/billing")
billing_public_router = APIRouter()

STRIPE_SECRET_KEY = os.environ.get("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
STRIPE_MOCKED = not bool(STRIPE_SECRET_KEY)
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")

TRIAL_CREDITS = 500
TRIAL_DAYS = 14


# ----------------------------- Plans -----------------------------------------
PLANS: List[Dict[str, Any]] = [
    {
        "id": "trial", "name": "Trial", "price_monthly": 0, "price_annual": 0,
        "credits": TRIAL_CREDITS, "seats": 1,
        "blurb": "14 days to try every agent.",
        "stripe_price_id": None,
    },
    {
        "id": "starter", "name": "Starter", "price_monthly": 79, "price_annual": 65,
        "credits": 8000, "seats": 3,
        "blurb": "For a founder or a small team getting outbound running.",
        "stripe_price_id": os.environ.get("STRIPE_PRICE_STARTER"),
    },
    {
        "id": "growth", "name": "Growth", "price_monthly": 249, "price_annual": 199,
        "credits": 30000, "seats": 10,
        "blurb": "The full suite at production volume.", "popular": True,
        "stripe_price_id": os.environ.get("STRIPE_PRICE_GROWTH"),
    },
    {
        "id": "scale", "name": "Scale", "price_monthly": 749, "price_annual": 599,
        "credits": 120000, "seats": 0,  # 0 = unlimited
        "blurb": "High-volume calling and unlimited seats.",
        "stripe_price_id": os.environ.get("STRIPE_PRICE_SCALE"),
    },
]

TOPUP_PACKS = [
    {"id": "pack_5k", "credits": 5000, "price": 59, "stripe_price_id": os.environ.get("STRIPE_PRICE_PACK_5K")},
    {"id": "pack_20k", "credits": 20000, "price": 199, "stripe_price_id": os.environ.get("STRIPE_PRICE_PACK_20K")},
    {"id": "pack_50k", "credits": 50000, "price": 449, "stripe_price_id": os.environ.get("STRIPE_PRICE_PACK_50K")},
]


def get_plan(plan_id: str) -> Dict[str, Any]:
    for p in PLANS:
        if p["id"] == plan_id:
            return p
    return PLANS[0]


# ----------------------------- Credit price list -------------------------------
# One source of truth for what every action costs. `voice_call_minute` is charged
# per-minute against the real call duration; everything else is a flat per-action
# cost. Anything not listed here is free (exports, CRM writes, reading your data).
CREDIT_COSTS: Dict[str, int] = {
    "voice_call_minute": 20,
    "proposal_generate": 60,
    "carousel_generate": 40,
    "ai_image": 25,
    "email_draft_chain": 8,   # four LLM calls: angle -> draft -> humanise
    "lead_research": 8,       # site crawl + news + GitHub fan-out
    "lead_enrichment": 5,
    "social_draft": 5,
    "meeting_prep_brief": 5,
    "next_best_action": 3,
    "booking_qualify": 2,
    "intent_score": 2,
    "social_publish": 2,
    "social_reply_suggest": 1,  # single small LLM call, same tier as email_ai
    "site_crawl": 8,     # matches lead_research's tier — multi-page fetch + one LLM-free pass
    "site_chat_reply": 1,  # single small LLM call, same tier as email_ai
    "email_ai": 1,
    "whatsapp_broadcast_send": 2,  # real outbound conversation, parity with social_publish
    "whatsapp_reply_suggest": 1,   # single small LLM call, same tier as email_ai
    "sms_broadcast_send": 1,       # lower per-unit cost than a WhatsApp conversation
    "sms_reply_suggest": 1,
    "candidate_score": 5,          # AI resume/fit analysis, same tier as lead_enrichment
    "bill_categorize_suggest": 1,  # single small LLM call, same tier as email_ai
    # Sending, tracking and reply-polling are deliberately absent = free. We never
    # charge for delivery, or for reading data you already own.
}

ACTION_LABELS = {
    "voice_call_minute": "Voice call (per minute)",
    "proposal_generate": "Proposal generated",
    "carousel_generate": "Deck generated",
    "ai_image": "AI image",
    "email_draft_chain": "Researched email written",
    "lead_research": "Lead researched",
    "lead_enrichment": "Lead enrichment",
    "social_draft": "Social post drafted",
    "meeting_prep_brief": "Meeting prep brief",
    "next_best_action": "Next-best-action",
    "booking_qualify": "Booking qualification",
    "intent_score": "Intent scored",
    "social_publish": "Social post published",
    "social_reply_suggest": "AI reply suggested",
    "site_crawl": "Website crawled",
    "site_chat_reply": "Site chat reply",
    "email_ai": "AI email / EQ score",
}

ACTION_AGENT = {
    "voice_call_minute": "voice",
    "proposal_generate": "proposal",
    "carousel_generate": "create",
    "ai_image": "create",
    "email_draft_chain": "pitch",
    "lead_research": "pitch",
    "lead_enrichment": "pitch",
    "intent_score": "pitch",
    "social_draft": "social",
    "social_publish": "social",
    "social_reply_suggest": "social",
    "meeting_prep_brief": "schedule",
    "booking_qualify": "schedule",
    "next_best_action": "voice",
    "email_ai": "pitch",
}


# ----------------------------- Core credit engine -------------------------------
async def ensure_account(workspace_id: str) -> Dict[str, Any]:
    """Every workspace gets a Trial account with its starter credits on first touch."""
    acct = await db.credit_accounts.find_one({"workspace_id": workspace_id}, {"_id": 0})
    if acct:
        return acct
    acct = {
        "workspace_id": workspace_id, "plan_id": "trial", "balance": TRIAL_CREDITS,
        "renews_at": (datetime.now(timezone.utc) + timedelta(days=TRIAL_DAYS)).isoformat(),
        "auto_topup": False, "created_at": now_iso(),
    }
    await db.credit_accounts.insert_one(dict(acct))
    await db.credit_ledger.insert_one({
        "id": new_id(), "workspace_id": workspace_id, "delta": TRIAL_CREDITS,
        "balance_after": TRIAL_CREDITS, "reason": "Trial credits", "action": "grant",
        "agent": None, "meta": {}, "at": now_iso(),
    })
    return acct


async def get_balance(workspace_id: str) -> int:
    acct = await ensure_account(workspace_id)
    return int(acct.get("balance", 0))


async def grant_credits(workspace_id: str, amount: int, reason: str) -> int:
    await ensure_account(workspace_id)
    doc = await db.credit_accounts.find_one_and_update(
        {"workspace_id": workspace_id}, {"$inc": {"balance": amount}}, return_document=True,
    )
    balance = int(doc.get("balance", 0))
    await db.credit_ledger.insert_one({
        "id": new_id(), "workspace_id": workspace_id, "delta": amount,
        "balance_after": balance, "reason": reason, "action": "grant",
        "agent": None, "meta": {}, "at": now_iso(),
    })
    return balance


async def set_balance(workspace_id: str, amount: int, reason: str) -> int:
    """Reset (not accumulate) — used on renewal, since credits don't roll over."""
    await ensure_account(workspace_id)
    await db.credit_accounts.update_one({"workspace_id": workspace_id}, {"$set": {"balance": amount}})
    await db.credit_ledger.insert_one({
        "id": new_id(), "workspace_id": workspace_id, "delta": amount,
        "balance_after": amount, "reason": reason, "action": "renewal",
        "agent": None, "meta": {}, "at": now_iso(),
    })
    return amount


async def check_credits(workspace_id: str, action: str, units: int = 1) -> None:
    """Gate without charging — for actions whose true cost is only known later
    (a voice call is billed on its real duration once it ends)."""
    cost = CREDIT_COSTS.get(action, 0) * max(1, units)
    if cost <= 0:
        return
    balance = await get_balance(workspace_id)
    if balance < cost:
        raise HTTPException(402, {
            "error": "insufficient_credits", "action": action,
            "action_label": ACTION_LABELS.get(action, action),
            "needed": cost, "balance": balance,
        })


async def charge_credits(workspace_id: str, action: str, units: int = 1,
                          meta: Optional[Dict[str, Any]] = None,
                          allow_overdraft: bool = False) -> int:
    """Deduct credits for an action. Raises 402 (with a structured body the UI can
    render) when the workspace can't cover it. Returns the new balance.

    `allow_overdraft` is for costs we can only settle after the fact — a voice
    call is billed on its real duration once it ends, and refusing the charge at
    that point wouldn't un-place the call. The overdraft blocks the next action
    instead."""
    cost = CREDIT_COSTS.get(action, 0) * max(1, units)
    if cost <= 0:
        return await get_balance(workspace_id)

    await ensure_account(workspace_id)
    # Atomic conditional decrement — only succeeds if the balance covers it, so
    # two concurrent actions can't race past a balance that only covers one.
    query: Dict[str, Any] = {"workspace_id": workspace_id}
    if not allow_overdraft:
        query["balance"] = {"$gte": cost}
    doc = await db.credit_accounts.find_one_and_update(
        query, {"$inc": {"balance": -cost}}, return_document=True,
    )
    if not doc:
        balance = await get_balance(workspace_id)
        raise HTTPException(402, {
            "error": "insufficient_credits", "action": action,
            "action_label": ACTION_LABELS.get(action, action),
            "needed": cost, "balance": balance,
        })
    balance = int(doc.get("balance", 0))
    await db.credit_ledger.insert_one({
        "id": new_id(), "workspace_id": workspace_id, "delta": -cost,
        "balance_after": balance, "reason": ACTION_LABELS.get(action, action),
        "action": action, "agent": ACTION_AGENT.get(action), "units": units,
        "meta": meta or {}, "at": now_iso(),
    })
    return balance


def minutes_for_call(duration_seconds: Optional[int]) -> int:
    """Calls bill per started minute, minimum one — the industry norm."""
    secs = int(duration_seconds or 0)
    return max(1, math.ceil(secs / 60))


# ----------------------------- Routes -------------------------------------------
@billing_router.get("/plans")
async def list_plans(user=Depends(current_user)):
    return {
        "plans": [{k: v for k, v in p.items() if k != "stripe_price_id"} for p in PLANS],
        "topups": [{k: v for k, v in t.items() if k != "stripe_price_id"} for t in TOPUP_PACKS],
        "credit_costs": [
            {"action": a, "label": ACTION_LABELS.get(a, a), "credits": c, "agent": ACTION_AGENT.get(a)}
            for a, c in sorted(CREDIT_COSTS.items(), key=lambda kv: -kv[1])
        ],
        "mocked": STRIPE_MOCKED,
    }


@billing_router.get("/subscription")
async def get_subscription(user=Depends(current_user)):
    wid = user["workspace_id"]
    acct = await ensure_account(wid)
    plan = get_plan(acct.get("plan_id", "trial"))
    sub = await db.subscriptions.find_one({"workspace_id": wid}, {"_id": 0})
    # Credits consumed in the current cycle = allowance - balance (floor at 0).
    used = max(0, plan["credits"] - int(acct.get("balance", 0)))
    return {
        "plan": {k: v for k, v in plan.items() if k != "stripe_price_id"},
        "balance": int(acct.get("balance", 0)),
        "allowance": plan["credits"],
        "used_this_cycle": used,
        "renews_at": acct.get("renews_at"),
        "auto_topup": acct.get("auto_topup", False),
        "status": (sub or {}).get("status", "trialing"),
        "cancel_at_period_end": (sub or {}).get("cancel_at_period_end", False),
        "mocked": STRIPE_MOCKED,
    }


@billing_router.get("/ledger")
async def get_ledger(limit: int = 100, user=Depends(current_user)):
    rows = await db.credit_ledger.find(
        {"workspace_id": user["workspace_id"]}, {"_id": 0}
    ).sort("at", -1).to_list(min(limit, 500))
    return rows


@billing_router.get("/usage")
async def get_usage(user=Depends(current_user)):
    """Credits burned, grouped by action — so you can see what's actually costing you."""
    rows = await db.credit_ledger.find(
        {"workspace_id": user["workspace_id"], "delta": {"$lt": 0}}, {"_id": 0}
    ).to_list(2000)
    by_action: Dict[str, Dict[str, Any]] = {}
    for r in rows:
        a = r.get("action", "other")
        b = by_action.setdefault(a, {
            "action": a, "label": ACTION_LABELS.get(a, a), "agent": ACTION_AGENT.get(a),
            "credits": 0, "count": 0,
        })
        b["credits"] += abs(r["delta"])
        b["count"] += 1
    return sorted(by_action.values(), key=lambda x: -x["credits"])


class CheckoutIn(BaseModel):
    plan_id: str
    annual: bool = False


@billing_router.post("/checkout")
async def checkout(body: CheckoutIn, user=Depends(current_user)):
    """Creates a Stripe Checkout Session. The customer enters card details on
    Stripe's hosted page — never in this app."""
    plan = get_plan(body.plan_id)
    if plan["id"] == "trial":
        raise HTTPException(400, "Trial is not purchasable")

    if STRIPE_MOCKED:
        # No Stripe key: activate immediately so the whole flow is demoable.
        await _activate_plan(user["workspace_id"], plan["id"], stripe_ids=None)
        await _audit(user, "billing.checkout", {"plan": plan["id"], "mocked": True})
        return {"mocked": True, "url": None, "activated": True, "plan_id": plan["id"]}

    import stripe
    stripe.api_key = STRIPE_SECRET_KEY
    price_id = plan.get("stripe_price_id")
    if not price_id:
        raise HTTPException(500, f"No Stripe price configured for plan '{plan['id']}'")
    session = stripe.checkout.Session.create(
        mode="subscription",
        line_items=[{"price": price_id, "quantity": 1}],
        success_url=f"{FRONTEND_URL}/billing?checkout=success",
        cancel_url=f"{FRONTEND_URL}/billing?checkout=cancelled",
        client_reference_id=user["workspace_id"],
        metadata={"workspace_id": user["workspace_id"], "plan_id": plan["id"], "kind": "subscription"},
    )
    await _audit(user, "billing.checkout", {"plan": plan["id"], "session": session.id})
    return {"mocked": False, "url": session.url}


class TopupIn(BaseModel):
    pack_id: str


@billing_router.post("/topup")
async def topup(body: TopupIn, user=Depends(current_user)):
    pack = next((t for t in TOPUP_PACKS if t["id"] == body.pack_id), None)
    if not pack:
        raise HTTPException(400, "unknown pack")

    if STRIPE_MOCKED:
        balance = await grant_credits(user["workspace_id"], pack["credits"], f"Top-up · {pack['credits']:,} credits")
        await _audit(user, "billing.topup", {"pack": pack["id"], "mocked": True})
        return {"mocked": True, "url": None, "granted": pack["credits"], "balance": balance}

    import stripe
    stripe.api_key = STRIPE_SECRET_KEY
    if not pack.get("stripe_price_id"):
        raise HTTPException(500, f"No Stripe price configured for pack '{pack['id']}'")
    session = stripe.checkout.Session.create(
        mode="payment",
        line_items=[{"price": pack["stripe_price_id"], "quantity": 1}],
        success_url=f"{FRONTEND_URL}/billing?topup=success",
        cancel_url=f"{FRONTEND_URL}/billing?topup=cancelled",
        client_reference_id=user["workspace_id"],
        metadata={"workspace_id": user["workspace_id"], "pack_id": pack["id"], "kind": "topup"},
    )
    return {"mocked": False, "url": session.url}


@billing_router.post("/portal")
async def portal(user=Depends(current_user)):
    """Stripe Customer Portal — manage payment method / cancel."""
    sub = await db.subscriptions.find_one({"workspace_id": user["workspace_id"]}, {"_id": 0})
    if STRIPE_MOCKED or not sub or not sub.get("stripe_customer_id"):
        return {"mocked": True, "url": None}
    import stripe
    stripe.api_key = STRIPE_SECRET_KEY
    session = stripe.billing_portal.Session.create(
        customer=sub["stripe_customer_id"], return_url=f"{FRONTEND_URL}/billing",
    )
    return {"mocked": False, "url": session.url}


@billing_router.post("/auto-topup")
async def set_auto_topup(body: Dict[str, bool], user=Depends(current_user)):
    enabled = bool(body.get("enabled"))
    await ensure_account(user["workspace_id"])
    await db.credit_accounts.update_one(
        {"workspace_id": user["workspace_id"]}, {"$set": {"auto_topup": enabled}})
    return {"ok": True, "auto_topup": enabled}


# ----------------------------- Plan lifecycle ------------------------------------
async def _activate_plan(workspace_id: str, plan_id: str, stripe_ids: Optional[Dict[str, str]] = None) -> None:
    plan = get_plan(plan_id)
    renews = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
    await ensure_account(workspace_id)
    await db.credit_accounts.update_one(
        {"workspace_id": workspace_id},
        {"$set": {"plan_id": plan_id, "renews_at": renews}},
    )
    # A new plan grants its full allowance immediately.
    await set_balance(workspace_id, plan["credits"], f"{plan['name']} plan activated")
    sub = {
        "workspace_id": workspace_id, "plan_id": plan_id, "status": "active",
        "current_period_end": renews, "cancel_at_period_end": False,
        "updated_at": now_iso(),
    }
    if stripe_ids:
        sub.update(stripe_ids)
    await db.subscriptions.replace_one({"workspace_id": workspace_id}, sub, upsert=True)
    await db.workspaces.update_one({"id": workspace_id}, {"$set": {"plan": plan_id}})


async def _downgrade_to_trial(workspace_id: str) -> None:
    await ensure_account(workspace_id)
    await db.credit_accounts.update_one(
        {"workspace_id": workspace_id}, {"$set": {"plan_id": "trial"}})
    await set_balance(workspace_id, TRIAL_CREDITS, "Subscription ended — back to Trial")
    await db.subscriptions.update_one(
        {"workspace_id": workspace_id}, {"$set": {"status": "canceled", "updated_at": now_iso()}})
    await db.workspaces.update_one({"id": workspace_id}, {"$set": {"plan": "trial"}})


# ----------------------------- Stripe webhook -------------------------------------
async def _resolve_workspace(obj: Dict[str, Any], meta: Dict[str, Any]) -> Optional[str]:
    """Checkout events carry our metadata; renewal invoices and cancellations don't,
    so fall back to the Stripe customer/subscription id we stored at activation."""
    wid = meta.get("workspace_id") or obj.get("client_reference_id")
    if wid:
        return wid
    for key, field in (("customer", "stripe_customer_id"), ("subscription", "stripe_subscription_id"), ("id", "stripe_subscription_id")):
        val = obj.get(key)
        if not val or not isinstance(val, str):
            continue
        sub = await db.subscriptions.find_one({field: val}, {"_id": 0, "workspace_id": 1})
        if sub:
            return sub["workspace_id"]
    return None


@billing_public_router.post("/hooks/stripe")
async def stripe_webhook(request: Request):
    """PUBLIC (no JWT). Stripe posts subscription lifecycle events here."""
    raw = await request.body()
    sig = request.headers.get("stripe-signature", "")

    if STRIPE_MOCKED:
        # Test mode: accept an unsigned payload so the lifecycle is verifiable
        # without a Stripe account.
        try:
            event = json.loads(raw)
        except Exception:
            raise HTTPException(400, "invalid payload")
    else:
        import stripe
        stripe.api_key = STRIPE_SECRET_KEY
        try:
            event = stripe.Webhook.construct_event(raw, sig, STRIPE_WEBHOOK_SECRET)
        except Exception as ex:
            raise HTTPException(400, f"signature verification failed: {ex}")

    etype = event.get("type")
    obj = (event.get("data") or {}).get("object") or {}
    meta = obj.get("metadata") or {}
    workspace_id = await _resolve_workspace(obj, meta)

    if etype == "checkout.session.completed" and workspace_id:
        if meta.get("kind") == "topup":
            pack = next((t for t in TOPUP_PACKS if t["id"] == meta.get("pack_id")), None)
            if pack:
                await grant_credits(workspace_id, pack["credits"], f"Top-up · {pack['credits']:,} credits")
        else:
            await _activate_plan(workspace_id, meta.get("plan_id", "growth"), stripe_ids={
                "stripe_customer_id": obj.get("customer"),
                "stripe_subscription_id": obj.get("subscription"),
            })

    elif etype == "invoice.paid" and workspace_id:
        # Renewal: credits RESET to the plan allowance — they don't accumulate.
        acct = await db.credit_accounts.find_one({"workspace_id": workspace_id}, {"_id": 0})
        plan = get_plan((acct or {}).get("plan_id", "trial"))
        await set_balance(workspace_id, plan["credits"], f"{plan['name']} renewed — credits reset")
        await db.credit_accounts.update_one(
            {"workspace_id": workspace_id},
            {"$set": {"renews_at": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()}})

    elif etype in ("customer.subscription.deleted", "customer.subscription.canceled") and workspace_id:
        await _downgrade_to_trial(workspace_id)

    return {"ok": True, "handled": etype}
