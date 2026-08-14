"""Pure-function tests for Reply EQ's state machine, probability heuristic,
cadence planner and signal extraction.

The buyer-behaviour logic is deliberately LLM-free and deterministic (same
philosophy as the EQ Score engine in server.py), so it must be fully testable
without a database: every function exercised here is a pure calculation.

`server` must be imported first: it mounts reply_eq's routers at the bottom of
its own module body, so importing reply_eq directly would re-enter a
half-initialised server. Importing server lets that cycle resolve in the right order.
"""

import asyncio
from datetime import datetime, timedelta

import pytest

import server  # noqa: F401
import reply_eq


# ---- State machine ----
def test_new_customer_first_message_becomes_engaged():
    assert reply_eq.apply_event("new", "inbound") == "engaged"


def test_active_stages_are_promotion_only():
    for stage in ("interested", "checkout", "payment_pending"):
        assert reply_eq.apply_event(stage, "intent_faq") == stage, \
            f"faq demoted {stage}"
    assert reply_eq.apply_event("engaged", "intent_book_meeting") == "qualified"


def test_booking_intent_promotes_but_never_demotes():
    assert reply_eq.apply_event("new", "intent_book_meeting") == "qualified"
    assert reply_eq.apply_event("engaged", "intent_callback") == "qualified"
    # A late booking intent doesn't drag a far-along customer backwards.
    assert reply_eq.apply_event("payment_pending", "intent_book_meeting") == "payment_pending"


def test_share_link_is_a_strong_buying_signal():
    assert reply_eq.apply_event("new", "intent_share_link") == "interested"
    assert reply_eq.apply_event("no_response", "intent_share_link") == "interested"
    assert reply_eq.apply_event("not_interested", "intent_share_link") == "interested"


def test_explicit_not_interested_is_respected_until_proven_otherwise():
    assert reply_eq.apply_event("not_interested", "inbound") == "not_interested"
    assert reply_eq.apply_event("not_interested", "intent_book_meeting") == "qualified"


def test_no_response_resumes_on_any_engagement():
    assert reply_eq.apply_event("no_response", "inbound") == "engaged"
    assert reply_eq.apply_event("lost", "inbound") == "engaged"
    assert reply_eq.apply_event("no_response", "intent_faq") == "engaged"


def test_purchase_transitions():
    assert reply_eq.apply_event("checkout", "purchase") == "purchased"
    assert reply_eq.apply_event("engaged", "purchase") == "purchased"
    assert reply_eq.apply_event("purchased", "purchase") == "repeat_customer"
    assert reply_eq.apply_event("no_response", "purchase") == "purchased"


def test_cart_abandoned_demotes_checkout_to_considering():
    assert reply_eq.apply_event("checkout", "cart_abandoned") == "considering"
    assert reply_eq.apply_event("payment_pending", "cart_abandoned") == "considering"
    # …but never drags a customer who never left checkout backwards twice.
    assert reply_eq.apply_event("considering", "cart_abandoned") == "considering"


def test_checkout_and_payment_events_promote():
    assert reply_eq.apply_event("interested", "checkout_started") == "checkout"
    assert reply_eq.apply_event("checkout", "payment_pending") == "payment_pending"
    assert reply_eq.apply_event("interested", "payment_pending") == "payment_pending"


# ---- Probability heuristic ----
def test_probability_follows_stage_order():
    probs = [reply_eq.compute_purchase_probability(s) for s in
             ("new", "engaged", "qualified", "interested", "considering", "checkout")]
    assert probs == sorted(probs)


def test_probability_intent_and_objection_penalties():
    base = reply_eq.compute_purchase_probability("qualified")
    assert reply_eq.compute_purchase_probability("qualified", intent="high") > base
    assert reply_eq.compute_purchase_probability("qualified", intent="low") < base
    assert reply_eq.compute_purchase_probability("qualified", objection="price") < base
    assert reply_eq.compute_purchase_probability("qualified", objection="budget") < \
        reply_eq.compute_purchase_probability("qualified", objection="price")


def test_probability_recency_nudge():
    fresh = reply_eq.compute_purchase_probability("engaged", hours_since_last_contact=6)
    cold = reply_eq.compute_purchase_probability("engaged", hours_since_last_contact=24 * 20)
    assert fresh > cold


def test_probability_is_clamped():
    assert reply_eq.compute_purchase_probability(
        "purchased", intent="high", hours_since_last_contact=0) <= 0.97
    assert reply_eq.compute_purchase_probability(
        "lost", intent="low", objection="budget", hours_since_last_contact=24 * 30) >= 0.03


def test_probability_is_deterministic():
    a = reply_eq.compute_purchase_probability("considering", "high", "price", 12)
    b = reply_eq.compute_purchase_probability("considering", "high", "price", 12)
    assert a == b


# ---- Dynamic cadence ----
def test_cadence_is_tighter_for_hot_leads():
    cold = reply_eq.cadence_for(0.2)
    hot = reply_eq.cadence_for(0.9)
    assert hot[0] < cold[0]
    assert hot == sorted(hot) and cold == sorted(cold)


def test_cadence_standard_set_matches_roadmap():
    assert reply_eq.cadence_for(0.2) == [24, 72, 168, 336]  # 1d / 3d / 7d / 14d


def test_cadence_respects_max_attempts():
    assert len(reply_eq.cadence_for(0.9, max_attempts=2)) == 2
    assert len(reply_eq.cadence_for(0.2, max_attempts=0)) >= 1  # never empty


def test_min_gap_guardrail_enforced():
    offsets = reply_eq.enforce_min_gap([12, 48, 120, 240], min_gap_hours=6)
    for a, b in zip(offsets, offsets[1:]):
        assert b - a >= 6


# ---- Signal extraction ----
def test_name_hint_extracted():
    assert reply_eq.extract_signals("i'm Rahul, is this available?")["name"] == "Rahul"
    assert reply_eq.extract_signals("my name is priya, checking price")["name"] == "Priya"
    assert reply_eq.extract_signals("hi")["name"] is None


def test_objection_detection():
    assert reply_eq.extract_signals("how much does it cost?")["objection"] == "price"
    assert reply_eq.extract_signals("is this a scam?")["objection"] == "trust"
    assert reply_eq.extract_signals("can you customise the color?")["objection"] == "fit"
    assert reply_eq.extract_signals("thanks!")["objection"] is None


def test_interest_signal():
    assert reply_eq.extract_signals("where do I pay?")["interest"] is True
    assert reply_eq.extract_signals("just checking")["interest"] is False


def test_next_action_mapping():
    assert reply_eq._next_action_for("considering") == "follow_up"
    assert reply_eq._next_action_for("no_response") == "re_engage_in_14d"
    assert reply_eq._next_action_for("purchased") == "nurture"
    assert reply_eq._next_action_for("not_interested") == "none"


def test_intent_event_mapping_is_whitelisted():
    for intent in ("faq", "book_meeting", "callback", "share_link", "handoff"):
        assert reply_eq._INTENT_EVENTS[intent].startswith("intent_")


# ---- Follow-up planning (async, against stubbed collections) ----
class _FakeColl:
    def __init__(self):
        self.updates = []
        self.inserted = []

    async def update_many(self, *a, **k):
        self.updates.append(("many", a, k))

    async def update_one(self, *a, **k):
        self.updates.append(("one", a, k))

    async def insert_many(self, docs, **k):
        self.inserted.extend(docs)


class _FakeDB:
    def __init__(self):
        self.reply_followups = _FakeColl()
        self.reply_customers = _FakeColl()


def _customer(stage, prob=0.2, last="2026-01-01T00:00:00+00:00"):
    return {
        "id": "c1", "workspace_id": "ws1", "phone": "+1000",
        "last_contact_at": last,
        "state": {"stage": stage, "purchase_probability": prob, "intent": "medium", "objection": None},
        "stats": {},
    }


def _settings(**overrides):
    return {**reply_eq._DEFAULT_SETTINGS, **overrides}


def test_plan_purchased_schedules_one_nurture_checkin(monkeypatch):
    """Purchase closes the sales cadence and opens a single after-sales touch —
    the after-sales check-in lands after_sales_hours after the last contact."""
    fdb = _FakeDB()
    monkeypatch.setattr(reply_eq, "db", fdb)
    docs = asyncio.run(reply_eq.plan_followups(_customer("purchased"), _settings()))
    assert len(fdb.reply_followups.inserted) == 1
    assert docs[0]["kind"] == "nurture"
    assert docs[0]["due_at"] == "2026-01-04T00:00:00+00:00"  # +72h
    assert docs[0]["status"] == "planned"


def test_plan_repeat_customer_gets_no_automated_touch(monkeypatch):
    fdb = _FakeDB()
    monkeypatch.setattr(reply_eq, "db", fdb)
    docs = asyncio.run(reply_eq.plan_followups(_customer("repeat_customer"), _settings()))
    assert docs == []
    assert fdb.reply_followups.inserted == []


def test_plan_not_interested_and_lost_are_quiet(monkeypatch):
    fdb = _FakeDB()
    monkeypatch.setattr(reply_eq, "db", fdb)
    for stage in ("not_interested", "lost"):
        docs = asyncio.run(reply_eq.plan_followups(_customer(stage), _settings()))
        assert docs == [], f"{stage}: plan should be empty"
    assert fdb.reply_followups.inserted == []


def test_plan_no_response_schedules_single_reengage(monkeypatch):
    fdb = _FakeDB()
    monkeypatch.setattr(reply_eq, "db", fdb)
    docs = asyncio.run(reply_eq.plan_followups(_customer("no_response"), _settings()))
    assert len(fdb.reply_followups.inserted) == 1
    assert docs[0]["kind"] == "re_engage"
    assert docs[0]["due_at"] == "2026-01-15T00:00:00+00:00"  # +14d


def test_plan_active_stage_lays_full_cadence(monkeypatch):
    fdb = _FakeDB()
    monkeypatch.setattr(reply_eq, "db", fdb)
    docs = asyncio.run(reply_eq.plan_followups(_customer("engaged"), _settings()))
    assert len(fdb.reply_followups.inserted) == 4
    assert [d["kind"] for d in docs] == ["follow_up"] * 4
    assert docs[0]["due_at"] == "2026-01-02T00:00:00+00:00"  # +24h
    for a, b in zip(docs, docs[1:]):
        gap = datetime.fromisoformat(b["due_at"]) - datetime.fromisoformat(a["due_at"])
        assert gap >= timedelta(hours=_settings()["min_gap_hours"])


def test_plan_respects_min_gap_override(monkeypatch):
    fdb = _FakeDB()
    monkeypatch.setattr(reply_eq, "db", fdb)
    docs = asyncio.run(reply_eq.plan_followups(_customer("engaged"), _settings(min_gap_hours=100)))
    gaps = [datetime.fromisoformat(b["due_at"]) - datetime.fromisoformat(a["due_at"])
            for a, b in zip(docs, docs[1:])]
    assert all(g >= timedelta(hours=100) for g in gaps)
    assert docs[0]["due_at"] == "2026-01-02T00:00:00+00:00"