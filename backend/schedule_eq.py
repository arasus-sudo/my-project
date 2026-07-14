"""Schedule EQ — Calendly-style scheduling agent.

Fourth agent in the Innoira Agentic Suite: publishes a public booking page per
workspace, computes real availability (Google Calendar freebusy + internal
rules), and writes every booking into the centralized lead activity timeline.
"""

import os
import re
import json
import secrets
from datetime import datetime, timedelta, time as dtime
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, EmailStr
from typing import List, Optional, Dict, Any

from server import (
    db, current_user, now_iso, new_id, _audit, _log_activity,
    _llm_chat, _extract_json, ANTHROPIC_API_KEY,
)
from google_calendar_client import google_calendar_client, encrypt_token, decrypt_token, GOOGLE_MOCKED

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


# ----------------------------- Public booking routes ------------------------------
@schedule_public_router.get("/book/{workspace_id}/{event_type_slug}")
async def public_event_type(workspace_id: str, event_type_slug: str):
    ws = await db.workspaces.find_one({"id": workspace_id}, {"_id": 0})
    et = await db.event_types.find_one(
        {"workspace_id": workspace_id, "slug": event_type_slug, "active": True}, {"_id": 0})
    if not ws or not et:
        raise HTTPException(404, "not found")
    slots = await _compute_open_slots(workspace_id, et)
    return {"workspace_name": ws.get("name"), "event_type": et, "open_slots": slots, "mocked": GOOGLE_MOCKED}


@schedule_public_router.post("/book/{workspace_id}/{event_type_slug}")
async def create_booking(workspace_id: str, event_type_slug: str, body: BookingIn):
    et = await db.event_types.find_one(
        {"workspace_id": workspace_id, "slug": event_type_slug, "active": True}, {"_id": 0})
    if not et:
        raise HTTPException(404, "event type not found")

    open_slots = await _compute_open_slots(workspace_id, et)
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
    end_dt = start_dt + timedelta(minutes=et["duration_minutes"])
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
        "start_at": start_dt.isoformat(), "end_at": end_dt.isoformat(), "timezone": availability.get("timezone", "UTC"),
        "status": "confirmed", "google_event_id": cal_result.get("event_id"), "meet_link": cal_result.get("meet_link"),
        "qualifying_answers": body.qualifying_answers, "qualification_score": score,
        "no_show_risk_score": risk_score, "prep_brief": prep_brief,
        "created_at": now_iso(), "cancelled_at": None,
    }
    await db.bookings.insert_one(booking)
    booking.pop("_id", None)

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
    await db.bookings.update_one({"id": bid}, {"$set": {"status": "cancelled", "cancelled_at": now_iso()}})
    if b.get("lead_id"):
        await _log_activity(user["workspace_id"], b["lead_id"], "scheduler", "meeting_cancelled",
                             "Meeting cancelled", {"booking_id": bid})
    return {"ok": True}


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
