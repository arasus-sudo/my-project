"""Schedule EQ — Calendly-style scheduling agent.

Fourth agent in the Innoira Agentic Suite: publishes a public booking page per
workspace, computes real availability (Google Calendar freebusy + internal
rules), and writes every booking into the centralized lead activity timeline.
"""

import os
import re
import json
import secrets
import logging
from datetime import datetime, timedelta, timezone, time as dtime
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, EmailStr
from typing import List, Optional, Dict, Any

log = logging.getLogger(__name__)

from server import (
    db, current_user, now_iso, new_id, _audit, _log_activity,
    _llm_chat, _extract_json, ANTHROPIC_API_KEY,
)
from google_calendar_client import google_calendar_client, encrypt_token, decrypt_token, GOOGLE_MOCKED
import email_client
from email_client import EMAIL_MOCKED, send_email
from ics_builder import build_invite

schedule_router = APIRouter(prefix="/schedule-eq")
schedule_public_router = APIRouter()

FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")
WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


def _slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (name or "").lower()).strip("-")
    return s or "event"


# ----------------------------- Models ------------------------------------------
class QualifyingQuestion(BaseModel):
    key: str
    prompt: str
    type: str = "string"


class FormField(BaseModel):
    key: str
    label: str
    type: str = "string"  # string | text | phone | email | dropdown | checkbox
    required: bool = True
    options: List[str] = []  # for dropdown/checkbox


class ReminderConfig(BaseModel):
    enabled: bool = True
    minutes_before: List[int] = [1440]  # default 24h


class BrandingSettings(BaseModel):
    primary_color: str = "#141414"
    logo_url: str = ""
    page_title: str = ""
    custom_message: str = ""
    confirmation_message: str = ""
    button_text: str = "Confirm booking"
    hide_calendar_photo: bool = False
    custom_domain: str = ""
    favicon_url: str = ""


class DurationOption(BaseModel):
    label: str = ""
    minutes: int = 30


class EventTypeIn(BaseModel):
    name: str
    duration_minutes: int = 30
    description: str = ""
    location_type: str = "video"  # video | phone | in_person
    buffer_before_minutes: int = 0
    buffer_after_minutes: int = 10
    daily_limit: int = 0  # 0 = unlimited
    min_notice_hours: int = 2
    date_range_days: int = 21
    qualifying_questions: List[QualifyingQuestion] = []
    low_score_threshold: int = 0  # 0 = disabled; below this routes to low_score_redirect_url
    low_score_redirect_url: Optional[str] = None
    # Calendly-like enhancements
    branding: BrandingSettings = BrandingSettings()
    reminder_config: ReminderConfig = ReminderConfig()
    form_fields: List[FormField] = []
    duration_options: List[DurationOption] = []
    webhook_url: Optional[str] = None
    allow_rescheduling: bool = True
    allow_cancellation: bool = True
    require_confirmation: bool = True
    send_confirmation_email: bool = True
    send_reminder_email: bool = True


class WorkingWindow(BaseModel):
    start: str = "09:00"
    end: str = "17:00"


class AvailabilityIn(BaseModel):
    timezone: str = "UTC"
    working_hours: Dict[str, List[WorkingWindow]] = {}
    blackout_dates: List[str] = []


class BookingIn(BaseModel):
    guest_name: str
    guest_email: EmailStr
    guest_phone: Optional[str] = None
    start_at: str  # ISO, must match a currently-open slot
    qualifying_answers: Dict[str, str] = {}
    form_answers: Dict[str, str] = {}
    selected_duration_minutes: Optional[int] = None
    timezone: str = "UTC"
    utm_source: Optional[str] = None
    utm_medium: Optional[str] = None
    utm_campaign: Optional[str] = None


# ----------------------------- Event types --------------------------------------
@schedule_router.get("/event-types")
async def list_event_types(user=Depends(current_user)):
    return await db.event_types.find(
        {"workspace_id": user["workspace_id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)


@schedule_router.post("/event-types")
async def create_event_type(body: EventTypeIn, user=Depends(current_user)):
    doc = body.model_dump()
    base_slug = _slugify(doc["name"])
    slug = base_slug
    n = 1
    while await db.event_types.find_one({"workspace_id": user["workspace_id"], "slug": slug}):
        n += 1
        slug = f"{base_slug}-{n}"
    doc.update({
        "id": new_id(), "workspace_id": user["workspace_id"], "owner_id": user["id"],
        "slug": slug, "active": True, "created_at": now_iso(),
    })
    await db.event_types.insert_one(doc)
    doc.pop("_id", None)
    await _audit(user, "schedule_eq.event_type.create", {"id": doc["id"], "name": doc["name"]})
    return doc


@schedule_router.put("/event-types/{etid}")
async def update_event_type(etid: str, body: EventTypeIn, user=Depends(current_user)):
    existing = await db.event_types.find_one({"id": etid, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "not found")
    patch = body.model_dump()
    await db.event_types.update_one({"id": etid}, {"$set": patch})
    return await db.event_types.find_one({"id": etid}, {"_id": 0})


@schedule_router.delete("/event-types/{etid}")
async def delete_event_type(etid: str, user=Depends(current_user)):
    await db.event_types.delete_one({"id": etid, "workspace_id": user["workspace_id"]})
    await _audit(user, "schedule_eq.event_type.delete", {"id": etid})
    return {"ok": True}


# ----------------------------- Availability --------------------------------------
@schedule_router.get("/availability")
async def get_availability(user=Depends(current_user)):
    a = await db.availability.find_one({"workspace_id": user["workspace_id"]}, {"_id": 0})
    if not a:
        a = AvailabilityIn(working_hours={
            d: [{"start": "09:00", "end": "17:00"}] for d in WEEKDAY_KEYS[:5]
        }).model_dump()
        a["workspace_id"] = user["workspace_id"]
    return a


@schedule_router.put("/availability")
async def set_availability(body: AvailabilityIn, user=Depends(current_user)):
    doc = body.model_dump()
    doc["workspace_id"] = user["workspace_id"]
    await db.availability.replace_one({"workspace_id": user["workspace_id"]}, doc, upsert=True)
    return doc


# ----------------------------- Slot computation -----------------------------------
async def _compute_open_slots(workspace_id: str, event_type: Dict[str, Any]) -> List[str]:
    availability = await db.availability.find_one({"workspace_id": workspace_id}, {"_id": 0})
    if not availability:
        availability = {"timezone": "UTC", "working_hours": {}, "blackout_dates": []}
    tz = ZoneInfo(availability.get("timezone") or "UTC")
    now_local = datetime.now(tz)
    earliest = now_local + timedelta(hours=event_type.get("min_notice_hours", 2))
    days_ahead = event_type.get("date_range_days", 21)

    duration = timedelta(minutes=event_type["duration_minutes"])
    buffer_before = timedelta(minutes=event_type.get("buffer_before_minutes", 0))
    buffer_after = timedelta(minutes=event_type.get("buffer_after_minutes", 0))

    existing = await db.bookings.find({
        "workspace_id": workspace_id, "event_type_id": event_type["id"], "status": "confirmed",
    }, {"_id": 0}).to_list(1000)
    busy_ranges = [(datetime.fromisoformat(b["start_at"]), datetime.fromisoformat(b["end_at"])) for b in existing]

    integration = await db.calendar_integrations.find_one({"workspace_id": workspace_id}, {"_id": 0})
    if integration:
        window_start = now_local
        window_end = now_local + timedelta(days=days_ahead)
        for b in google_calendar_client.freebusy(integration, window_start.isoformat(), window_end.isoformat()):
            try:
                busy_ranges.append((datetime.fromisoformat(b["start"]), datetime.fromisoformat(b["end"])))
            except Exception:
                continue

    slots: List[str] = []
    day_counts: Dict[str, int] = {}
    for day_offset in range(days_ahead):
        day = (now_local + timedelta(days=day_offset)).date()
        date_str = day.isoformat()
        if date_str in (availability.get("blackout_dates") or []):
            continue
        weekday_key = WEEKDAY_KEYS[day.weekday()]
        windows = (availability.get("working_hours") or {}).get(weekday_key, [])
        for w in windows:
            sh, sm = map(int, w["start"].split(":"))
            eh, em = map(int, w["end"].split(":"))
            cursor = datetime.combine(day, dtime(sh, sm), tzinfo=tz)
            day_end = datetime.combine(day, dtime(eh, em), tzinfo=tz)
            daily_limit = event_type.get("daily_limit") or 0
            while cursor + duration <= day_end:
                slot_start, slot_end = cursor, cursor + duration
                cursor += duration
                if slot_start < earliest:
                    continue
                if daily_limit and day_counts.get(date_str, 0) >= daily_limit:
                    break
                padded = (slot_start - buffer_before, slot_end + buffer_after)
                conflict = any(not (padded[1] <= r[0] or padded[0] >= r[1]) for r in busy_ranges)
                if not conflict:
                    slots.append(slot_start.isoformat())
                    day_counts[date_str] = day_counts.get(date_str, 0) + 1
    return slots


# ----------------------------- Futuristic helpers ---------------------------------
async def _score_qualifying_answers(event_type: Dict[str, Any], answers: Dict[str, str]) -> Optional[int]:
    if not ANTHROPIC_API_KEY or not event_type.get("qualifying_questions") or not answers:
        return None
    # Booking is a public action taken by a guest — if the host is out of credits
    # we skip the AI scoring rather than block the guest from booking.
    from billing import charge_credits
    try:
        await charge_credits(event_type["workspace_id"], "booking_qualify",
                              meta={"event_type_id": event_type["id"]})
    except HTTPException:
        return None
    system = ("Score how qualified this prospect is for a sales meeting, 0-100, based on their "
               "answers to pre-meeting questions. STRICT JSON: {\"score\": int}")
    user_text = json.dumps({"questions": event_type["qualifying_questions"], "answers": answers})
    try:
        resp = await _llm_chat(system, user_text, f"seq-qual-{event_type['id'][:8]}")
        parsed = _extract_json(resp)
        if parsed and "score" in parsed:
            return int(parsed["score"])
    except Exception:
        pass
    return None


async def _no_show_risk_score(workspace_id: str, lead_id: Optional[str], start_at: datetime) -> int:
    score = 20
    notice_hours = (start_at - datetime.now(start_at.tzinfo)).total_seconds() / 3600
    if notice_hours < 2:
        score += 15
    elif notice_hours > 24 * 14:
        score += 10
    if lead_id:
        prior_no_shows = await db.bookings.count_documents(
            {"workspace_id": workspace_id, "lead_id": lead_id, "status": "no_show"})
        score += min(prior_no_shows * 20, 40)
        activity_count = await db.activities.count_documents({"workspace_id": workspace_id, "lead_id": lead_id})
        score -= min(activity_count * 3, 20)
    return max(0, min(100, score))


async def _generate_prep_brief(workspace_id: str, lead_id: Optional[str]) -> str:
    if not lead_id or not ANTHROPIC_API_KEY:
        return ""
    from billing import charge_credits
    try:
        await charge_credits(workspace_id, "meeting_prep_brief", meta={"lead_id": lead_id})
    except HTTPException:
        return ""
    activities = await db.activities.find(
        {"workspace_id": workspace_id, "lead_id": lead_id}, {"_id": 0}
    ).sort("at", -1).to_list(15)
    if not activities:
        return ""
    system = "Summarize this lead's history into a short prep brief (3-4 sentences) for a rep about to meet them."
    user_text = json.dumps([{"type": a["type"], "summary": a["summary"], "at": a["at"]} for a in activities])
    try:
        resp = await _llm_chat(system, user_text, f"seq-brief-{lead_id[:8]}")
        return resp.strip()
    except Exception:
        return ""


# ----------------------------- Notifications ---------------------------------------
async def _host_for(workspace_id: str, event_type: Dict[str, Any]) -> Dict[str, str]:
    """The person the guest is meeting — the event type's owner, falling back to
    the workspace's first user."""
    owner = None
    if event_type.get("owner_id"):
        owner = await db.users.find_one({"id": event_type["owner_id"]}, {"_id": 0, "name": 1, "email": 1})
    if not owner:
        owner = await db.users.find_one({"workspace_id": workspace_id}, {"_id": 0, "name": 1, "email": 1})
    return {"name": (owner or {}).get("name", "your host"), "email": (owner or {}).get("email", "")}


async def _record_email(workspace_id: str, booking_id: str, kind: str, to: str,
                         subject: str, html: str, result: Dict[str, Any]) -> None:
    """Every message is persisted, mocked or not — so the flow is auditable and
    demoable without a mail provider, and the tests can assert on real content."""
    await db.sent_emails.insert_one({
        "id": new_id(), "workspace_id": workspace_id, "booking_id": booking_id,
        "kind": kind, "to": to, "subject": subject, "html": html,
        "provider_id": result.get("id"), "mocked": result.get("mocked", True),
        "error": result.get("error"), "at": now_iso(),
    })


async def _notify(kind: str, workspace_id: str, booking: Dict[str, Any],
                   event_type: Dict[str, Any], old_when: str = "") -> None:
    """Send the guest + host pair for a booking lifecycle event. Never raises: a
    mail failure must not undo a booking that already happened."""
    try:
        host = await _host_for(workspace_id, event_type)
        name = event_type.get("name", "Meeting")
        desc = event_type.get("description", "")

        if kind == "confirmation":
            ics = build_invite(booking, name, desc, host["email"], method="REQUEST")
            pairs = [
                (booking["guest_email"], email_client.confirmation_email(booking, name, host["name"], for_host=False), ics),
                (host["email"], email_client.confirmation_email(booking, name, host["name"], for_host=True), ics),
            ]
        elif kind == "reminder":
            pairs = [(booking["guest_email"], email_client.reminder_email(booking, name, host["name"]), None)]
        elif kind == "reschedule":
            ics = build_invite(booking, name, desc, host["email"], method="REQUEST")
            pairs = [
                (booking["guest_email"], email_client.reschedule_email(booking, name, host["name"], old_when, for_host=False), ics),
                (host["email"], email_client.reschedule_email(booking, name, host["name"], old_when, for_host=True), ics),
            ]
        elif kind == "cancellation":
            ics = build_invite(booking, name, desc, host["email"], method="CANCEL")
            pairs = [
                (booking["guest_email"], email_client.cancellation_email(booking, name, host["name"], for_host=False), ics),
                (host["email"], email_client.cancellation_email(booking, name, host["name"], for_host=True), ics),
            ]
        else:
            return

        for to, (subject, html), ics_body in pairs:
            if not to:
                continue
            result = await send_email(to, subject, html, ics=ics_body, reply_to=host["email"] or None, workspace_id=workspace_id)
            await _record_email(workspace_id, booking["id"], kind, to, subject, html, result)
    except Exception:
        pass


def _fire_webhook(url: str, event: str, payload: Dict[str, Any]) -> None:
    """Fire a webhook asynchronously — never block or raise on failure."""
    import httpx
    import asyncio
    try:
        client = httpx.AsyncClient(timeout=10)
        asyncio.ensure_future(_do_webhook(client, url, event, payload))
    except Exception:
        pass


async def _do_webhook(client, url: str, event: str, payload: Dict[str, Any]) -> None:
    try:
        safe = {k: v for k, v in payload.items() if k not in ("prep_brief",)}
        await client.post(url, json={"event": event, "data": safe})
    except Exception as ex:
        log.warning("webhook %s -> %s failed: %s", event, url, ex)
    finally:
        await client.aclose()


def _fmt_when(booking: Dict[str, Any]) -> str:
    start = datetime.fromisoformat(booking["start_at"])
    return start.strftime("%a %d %b %Y, %H:%M")


# ----------------------------- Guest self-service (public, token-only) --------------
# The manage_token is the guest's only credential — no login. Every route 404s on
# an unknown token, so nothing about a workspace leaks to someone guessing.
#
# ORDER MATTERS: these must stay ABOVE /book/{workspace_id}/{event_type_slug}.
# FastAPI matches in registration order, so if the two-segment slug route is
# registered first it swallows /book/manage/{token} — reading "manage" as a
# workspace id and 404ing every guest link.
class RescheduleIn(BaseModel):
    start_at: str


async def _booking_by_token(token: str) -> tuple:
    b = await db.bookings.find_one({"manage_token": token}, {"_id": 0})
    if not b:
        raise HTTPException(404, "not found")
    et = await db.event_types.find_one({"id": b["event_type_id"]}, {"_id": 0})
    if not et:
        raise HTTPException(404, "not found")
    return b, et


def _public_booking(b: Dict[str, Any]) -> Dict[str, Any]:
    """Never hand the guest the host's internal notes."""
    return {k: v for k, v in b.items() if k not in ("prep_brief", "no_show_risk_score",
                                                     "qualification_score", "lead_id")}


@schedule_public_router.get("/book/manage/{token}")
async def get_managed_booking(token: str):
    b, et = await _booking_by_token(token)
    ws = await db.workspaces.find_one({"id": b["workspace_id"]}, {"_id": 0, "name": 1})
    slots = await _compute_open_slots(b["workspace_id"], et) if b["status"] == "confirmed" else []
    return {
        "booking": _public_booking(b),
        "event_type": {"name": et["name"], "duration_minutes": et["duration_minutes"],
                        "description": et.get("description", ""), "location_type": et.get("location_type")},
        "workspace_name": (ws or {}).get("name"),
        "open_slots": slots,
    }


@schedule_public_router.post("/book/manage/{token}/reschedule")
async def reschedule_booking(token: str, body: RescheduleIn):
    b, et = await _booking_by_token(token)
    if b["status"] != "confirmed":
        raise HTTPException(400, "this meeting is no longer active")
    if not et.get("allow_rescheduling", True):
        raise HTTPException(403, "rescheduling is not allowed for this event type")

    open_slots = await _compute_open_slots(b["workspace_id"], et)
    if body.start_at not in open_slots:
        raise HTTPException(400, "that slot is no longer available — please pick another")

    old_when = _fmt_when(b)
    start_dt = datetime.fromisoformat(body.start_at)
    end_dt = start_dt + timedelta(minutes=et["duration_minutes"])

    # Patch the existing calendar event so the guest's entry moves rather than
    # disappearing and reappearing (which would also drop the Meet link).
    integration = await db.calendar_integrations.find_one({"workspace_id": b["workspace_id"]}, {"_id": 0})
    google_calendar_client.move_event(
        integration, b.get("google_event_id"),
        start_iso=start_dt.isoformat(), end_iso=end_dt.isoformat(),
        tz=b.get("timezone", "UTC"),
    )

    patch = {
        "start_at": start_dt.isoformat(), "end_at": end_dt.isoformat(),
        # Bumping SEQUENCE is what tells a calendar client to move the existing
        # event instead of creating a second one.
        "ics_sequence": int(b.get("ics_sequence", 0)) + 1,
        "reminder_sent_at": None,  # new time earns a fresh reminder
        "rescheduled_at": now_iso(),
    }
    await db.bookings.update_one({"id": b["id"]}, {"$set": patch})
    b.update(patch)

    await _notify("reschedule", b["workspace_id"], b, et, old_when=old_when)
    if b.get("lead_id"):
        await _log_activity(b["workspace_id"], b["lead_id"], "scheduler", "meeting_rescheduled",
                             f"Guest moved “{et['name']}” to {start_dt.strftime('%b %d, %Y %H:%M')}",
                             {"booking_id": b["id"], "from": old_when})
    return {"ok": True, "booking": _public_booking(b)}


@schedule_public_router.post("/book/manage/{token}/cancel")
async def guest_cancel_booking(token: str):
    b, et = await _booking_by_token(token)
    if b["status"] == "cancelled":
        return {"ok": True, "already": True}
    if not et.get("allow_cancellation", True):
        raise HTTPException(403, "cancellation is not allowed for this event type")

    integration = await db.calendar_integrations.find_one({"workspace_id": b["workspace_id"]}, {"_id": 0})
    google_calendar_client.delete_event(integration, b.get("google_event_id"))

    await db.bookings.update_one({"id": b["id"]}, {"$set": {
        "status": "cancelled", "cancelled_at": now_iso(), "cancelled_by": "guest",
        "ics_sequence": int(b.get("ics_sequence", 0)) + 1,
    }})
    b["status"] = "cancelled"
    b["ics_sequence"] = int(b.get("ics_sequence", 0)) + 1

    await _notify("cancellation", b["workspace_id"], b, et)
    if b.get("lead_id"):
        await _log_activity(b["workspace_id"], b["lead_id"], "scheduler", "meeting_cancelled",
                             f"Guest cancelled “{et['name']}”", {"booking_id": b["id"], "by": "guest"})
    return {"ok": True}


# ----------------------------- Public booking routes ------------------------------
@schedule_public_router.get("/book/{workspace_id}/{event_type_slug}")
async def public_event_type(workspace_id: str, event_type_slug: str):
    ws = await db.workspaces.find_one({"id": workspace_id}, {"_id": 0})
    et = await db.event_types.find_one(
        {"workspace_id": workspace_id, "slug": event_type_slug, "active": True}, {"_id": 0})
    if not ws or not et:
        raise HTTPException(404, "not found")
    slots = await _compute_open_slots(workspace_id, et)
    public_et = {k: v for k, v in et.items() if k not in ("webhook_url",)}
    return {"workspace_name": ws.get("name"), "event_type": public_et, "open_slots": slots, "mocked": GOOGLE_MOCKED}


@schedule_public_router.post("/book/{workspace_id}/{event_type_slug}")
async def create_booking(workspace_id: str, event_type_slug: str, body: BookingIn):
    et = await db.event_types.find_one(
        {"workspace_id": workspace_id, "slug": event_type_slug, "active": True}, {"_id": 0})
    if not et:
        raise HTTPException(404, "event type not found")

    # Resolve duration: custom selected or event type default
    duration_minutes = body.selected_duration_minutes or et.get("duration_minutes", 30)
    duration_options = et.get("duration_options", [])
    if duration_options:
        valid_durs = [d["minutes"] for d in duration_options]
        if body.selected_duration_minutes and body.selected_duration_minutes not in valid_durs:
            raise HTTPException(400, "invalid duration selection")
    else:
        if body.selected_duration_minutes and body.selected_duration_minutes != et["duration_minutes"]:
            raise HTTPException(400, "this event type does not support custom durations")

    # Compute slots at the resolved duration to validate
    working_et = {**et, "duration_minutes": duration_minutes}
    open_slots = await _compute_open_slots(workspace_id, working_et)
    if body.start_at not in open_slots:
        raise HTTPException(400, "that slot is no longer available — please pick another")

    score = await _score_qualifying_answers(et, body.qualifying_answers)
    if score is not None and et.get("low_score_threshold") and score < et["low_score_threshold"] and et.get("low_score_redirect_url"):
        return {"ok": False, "redirect_url": et["low_score_redirect_url"], "qualification_score": score}

    email = body.guest_email.lower()
    lead = await db.leads.find_one({"workspace_id": workspace_id, "email": email}, {"_id": 0})
    if not lead:
        name_parts = body.guest_name.strip().split(" ", 1)
        lead = {
            "id": new_id(), "workspace_id": workspace_id,
            "first_name": name_parts[0], "last_name": name_parts[1] if len(name_parts) > 1 else "",
            "email": email, "company": "", "title": "", "linkedin": "",
            "phone": body.guest_phone, "tags": [], "status": "new", "icp_score": 60,
            "verified": True, "phone_verified": False, "dnc": False, "created_at": now_iso(),
        }
        await db.leads.insert_one(lead)
        lead.pop("_id", None)

    start_dt = datetime.fromisoformat(body.start_at)
    end_dt = start_dt + timedelta(minutes=duration_minutes)
    availability = await db.availability.find_one({"workspace_id": workspace_id}, {"_id": 0}) or {"timezone": "UTC"}

    integration = await db.calendar_integrations.find_one({"workspace_id": workspace_id}, {"_id": 0})
    cal_result = google_calendar_client.create_event(
        integration, summary=f"{et['name']} — {body.guest_name}",
        description=et.get("description", ""), start_iso=start_dt.isoformat(), end_iso=end_dt.isoformat(),
        tz=availability.get("timezone", "UTC"), attendee_email=email,
        want_meet_link=(et.get("location_type") == "video"),
    )

    risk_score = await _no_show_risk_score(workspace_id, lead["id"], start_dt)
    prep_brief = await _generate_prep_brief(workspace_id, lead["id"])

    booking = {
        "id": new_id(), "workspace_id": workspace_id, "event_type_id": et["id"], "lead_id": lead["id"],
        "guest_name": body.guest_name, "guest_email": email, "guest_phone": body.guest_phone,
        "start_at": start_dt.isoformat(), "end_at": end_dt.isoformat(), "timezone": body.timezone or availability.get("timezone", "UTC"),
        "status": "confirmed", "google_event_id": cal_result.get("event_id"), "meet_link": cal_result.get("meet_link"),
        "qualifying_answers": body.qualifying_answers, "qualification_score": score,
        "form_answers": body.form_answers,
        "selected_duration_minutes": duration_minutes,
        "no_show_risk_score": risk_score, "prep_brief": prep_brief,
        "utm_source": body.utm_source, "utm_medium": body.utm_medium, "utm_campaign": body.utm_campaign,
        "manage_token": secrets.token_urlsafe(32),
        "ics_sequence": 0, "reminder_sent_at": None,
        "created_at": now_iso(), "cancelled_at": None,
    }
    await db.bookings.insert_one(booking)
    booking.pop("_id", None)

    if et.get("send_confirmation_email", True):
        await _notify("confirmation", workspace_id, booking, et)

    await _log_activity(workspace_id, lead["id"], "scheduler", "meeting_booked",
                         f"Booked “{et['name']}” for {start_dt.strftime('%b %d, %Y %H:%M')}",
                         {"booking_id": booking["id"], "event_type": et["name"]})

    existing_deal = await db.deals.find_one({"lead_id": lead["id"], "workspace_id": workspace_id}, {"_id": 0})
    if existing_deal and existing_deal.get("stage") in ("new", "qualified"):
        await db.deals.update_one({"id": existing_deal["id"]}, {"$set": {"stage": "meeting"}})
    elif not existing_deal:
        await db.deals.insert_one({
            "id": new_id(), "workspace_id": workspace_id, "lead_id": lead["id"],
            "title": f"{lead.get('company') or lead['first_name']} — meeting booked",
            "value": 5000, "stage": "meeting", "created_at": now_iso(),
            "source_booking_id": booking["id"],
        })

    # Webhook trigger
    webhook_url = et.get("webhook_url")
    if webhook_url:
        _fire_webhook(webhook_url, "booking.created", booking)

    return {"ok": True, **booking, "mocked": cal_result.get("mocked", GOOGLE_MOCKED)}


# ----------------------------- Bookings (authenticated) ----------------------------
@schedule_router.get("/bookings")
async def list_bookings(user=Depends(current_user)):
    items = await db.bookings.find({"workspace_id": user["workspace_id"]}, {"_id": 0}).sort("start_at", -1).to_list(500)
    for b in items:
        b["event_type"] = await db.event_types.find_one({"id": b["event_type_id"]}, {"_id": 0, "name": 1})
    return items


@schedule_router.get("/bookings/{bid}")
async def get_booking(bid: str, user=Depends(current_user)):
    b = await db.bookings.find_one({"id": bid, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not b:
        raise HTTPException(404, "not found")
    return b


@schedule_router.post("/bookings/{bid}/cancel")
async def cancel_booking(bid: str, user=Depends(current_user)):
    b = await db.bookings.find_one({"id": bid, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not b:
        raise HTTPException(404, "not found")
    integration = await db.calendar_integrations.find_one({"workspace_id": user["workspace_id"]}, {"_id": 0})
    google_calendar_client.delete_event(integration, b.get("google_event_id"))
    await db.bookings.update_one({"id": bid}, {"$set": {
        "status": "cancelled", "cancelled_at": now_iso(), "cancelled_by": "host",
        "ics_sequence": int(b.get("ics_sequence", 0)) + 1,
    }})
    b["status"] = "cancelled"
    b["ics_sequence"] = int(b.get("ics_sequence", 0)) + 1

    # The guest is owed a cancellation notice regardless of who cancelled.
    et = await db.event_types.find_one({"id": b["event_type_id"]}, {"_id": 0})
    if et:
        await _notify("cancellation", user["workspace_id"], b, et)
    if b.get("lead_id"):
        await _log_activity(user["workspace_id"], b["lead_id"], "scheduler", "meeting_cancelled",
                             "Meeting cancelled", {"booking_id": bid, "by": "host"})
    return {"ok": True}


@schedule_router.get("/bookings/{bid}/emails")
async def booking_emails(bid: str, user=Depends(current_user)):
    """What we actually sent for this booking — visible whether or not a real mail
    provider is connected."""
    return await db.sent_emails.find(
        {"booking_id": bid, "workspace_id": user["workspace_id"]},
        {"_id": 0, "html": 0},
    ).sort("at", -1).to_list(50)


@schedule_router.get("/email-status")
async def email_status(user=Depends(current_user)):
    sent = await db.sent_emails.count_documents({"workspace_id": user["workspace_id"]})
    return {"mocked": EMAIL_MOCKED, "from": email_client.EMAIL_FROM, "sent_count": sent}


# ----------------------------- 24h reminder job -------------------------------------
async def run_reminder_tick() -> int:
    """Email a reminder for every confirmed booking starting in ~24h.

    Idempotent by the `reminder_sent_at` stamp, which is claimed with a conditional
    update *before* the send — so a restart, an overlapping tick, or two workers can
    never double-remind the same guest. Returns how many were sent.
    """
    now = datetime.now(timezone.utc)
    lo, hi = now + timedelta(hours=23), now + timedelta(hours=25)

    # `start_at` is an ISO string carrying the workspace's UTC offset, and such
    # strings do NOT sort correctly against each other across different offsets
    # ("…T10:00+05:30" vs "…T10:00+00:00" compare bytewise, not chronologically).
    # So the window is applied on parsed, offset-aware datetimes, not in the query.
    candidates = await db.bookings.find({
        "status": "confirmed", "reminder_sent_at": None,
    }, {"_id": 0}).to_list(2000)

    due = []
    for b in candidates:
        try:
            start = datetime.fromisoformat(b["start_at"])
        except ValueError:
            continue
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        if lo <= start <= hi:
            due.append(b)

    sent = 0
    for b in due:
        et = await db.event_types.find_one({"id": b["event_type_id"]}, {"_id": 0})
        if not et:
            continue
        # Respect per-event-type reminder settings
        rc = et.get("reminder_config", {})
        if rc.get("enabled", True) is False:
            continue
        if et.get("send_reminder_email", True) is False:
            continue
        # Claim it first: only the caller that flips None -> timestamp may send.
        claimed = await db.bookings.find_one_and_update(
            {"id": b["id"], "reminder_sent_at": None},
            {"$set": {"reminder_sent_at": now_iso()}},
        )
        if not claimed:
            continue
        await _notify("reminder", b["workspace_id"], b, et)
        sent += 1
    return sent


@schedule_router.post("/bookings/{bid}/mark-no-show")
async def mark_no_show(bid: str, user=Depends(current_user)):
    b = await db.bookings.find_one({"id": bid, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not b:
        raise HTTPException(404, "not found")
    await db.bookings.update_one({"id": bid}, {"$set": {"status": "no_show"}})
    if b.get("lead_id"):
        await _log_activity(user["workspace_id"], b["lead_id"], "scheduler", "meeting_no_show",
                             "Guest did not show up", {"booking_id": bid})
    return {"ok": True}


# ----------------------------- Google OAuth -----------------------------------------
@schedule_router.get("/oauth/url")
async def oauth_url(user=Depends(current_user)):
    if GOOGLE_MOCKED:
        return {"url": None, "mocked": True}
    state = secrets.token_urlsafe(24)
    await db.oauth_states.insert_one({
        "state": state, "workspace_id": user["workspace_id"], "user_id": user["id"], "created_at": now_iso(),
    })
    return {"url": google_calendar_client.get_auth_url(state), "mocked": False}


@schedule_public_router.get("/schedule-eq/oauth/callback")
async def oauth_callback(code: str, state: str):
    pending = await db.oauth_states.find_one({"state": state}, {"_id": 0})
    if not pending:
        raise HTTPException(400, "invalid or expired oauth state")
    await db.oauth_states.delete_one({"state": state})
    tokens = google_calendar_client.exchange_code(code)
    await db.calendar_integrations.replace_one(
        {"workspace_id": pending["workspace_id"]},
        {
            "id": new_id(), "workspace_id": pending["workspace_id"], "user_id": pending["user_id"],
            "provider": "google", "access_token_enc": encrypt_token(tokens["access_token"]),
            "refresh_token_enc": encrypt_token(tokens.get("refresh_token")),
            "token_expiry": tokens.get("expiry"), "calendar_id": "primary", "connected_at": now_iso(),
        },
        upsert=True,
    )
    return RedirectResponse(f"{FRONTEND_URL}/app/schedule-eq/settings?connected=1")


@schedule_router.get("/calendar-status")
async def calendar_status(user=Depends(current_user)):
    integration = await db.calendar_integrations.find_one({"workspace_id": user["workspace_id"]}, {"_id": 0})
    if not integration:
        return {"connected": False, "mocked": GOOGLE_MOCKED}
    return {"connected": True, "mocked": GOOGLE_MOCKED, "connected_at": integration.get("connected_at")}


@schedule_router.post("/calendar-disconnect")
async def calendar_disconnect(user=Depends(current_user)):
    await db.calendar_integrations.delete_one({"workspace_id": user["workspace_id"]})
    return {"ok": True}
