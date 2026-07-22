"""Transactional email — the suite's shared send path.

Deliberately not Schedule-EQ-specific: this is the first real email sender in
the product (Pitch EQ's campaign sends are still simulated in server.py), so it
lives here for every agent to reuse.

Mocked-first: with no RESEND_API_KEY, falls back to the workspace's connected
mailbox. If no mailbox is connected either, the message is fully rendered and
recorded to the `sent_emails` collection but never leaves the building.
"""

import os
import re
import base64
import logging
from typing import Any, Dict, List, Optional

log = logging.getLogger(__name__)

RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
EMAIL_MOCKED = not bool(RESEND_API_KEY)
EMAIL_FROM = os.environ.get("EMAIL_FROM", "Innoira Suite <onboarding@resend.dev>")
EMAIL_REPLY_TO = os.environ.get("EMAIL_REPLY_TO", "")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")


async def send_email(
    to: str,
    subject: str,
    html: str,
    ics: Optional[str] = None,
    reply_to: Optional[str] = None,
    from_addr: Optional[str] = None,
    workspace_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Send one email. Returns {"id", "mocked"}. Never raises — a failed send must
    not roll back a booking that already happened."""
    sender = from_addr or EMAIL_FROM
    reply = reply_to or EMAIL_REPLY_TO or None

    payload: Dict[str, Any] = {"from": sender, "to": [to], "subject": subject, "html": html}
    if reply:
        payload["reply_to"] = reply
    if ics:
        # Calendar clients recognise a text/calendar attachment as an invite.
        payload["attachments"] = [{
            "filename": "invite.ics",
            "content": base64.b64encode(ics.encode("utf-8")).decode("ascii"),
            "content_type": "text/calendar; method=REQUEST",
        }]

    # Fallback: when Resend is not configured, try the workspace's connected mailbox
    if EMAIL_MOCKED and workspace_id:
        try:
            from server import db
            import mailbox_client
            mailboxes = await db.mailboxes.find(
                {"workspace_id": workspace_id, "status": "connected"},
                {"_id": 0},
            ).to_list(20)
            if mailboxes:
                text = re.sub(r"<[^>]+>", "", html).strip()
                result = await mailbox_client.send(
                    mailboxes[0],
                    to_addr=to, subject=subject, html=html, text=text,
                    reply_to=reply,
                )
                # Even if the mailbox send is mocked, record it as mocked=False
                # since a real mailbox was actually configured
                return {
                    "id": result.get("provider_message_id"),
                    "mocked": result.get("mocked", True),
                }
        except Exception as ex:
            log.warning("mailbox fallback send failed to=%s subject=%s err=%s", to, subject, ex)

    if EMAIL_MOCKED:
        log.info("[email:mocked] to=%s subject=%s ics=%s", to, subject, bool(ics))
        return {"id": f"mock-email-{abs(hash((to, subject))) % 10**10}", "mocked": True}

    try:
        import resend
        resend.api_key = RESEND_API_KEY
        # The SDK call is blocking; keep it off the event loop.
        import asyncio
        result = await asyncio.to_thread(resend.Emails.send, payload)
        return {"id": (result or {}).get("id"), "mocked": False}
    except Exception as ex:
        log.warning("email send failed to=%s subject=%s err=%s", to, subject, ex)
        return {"id": None, "mocked": False, "error": str(ex)}


# ----------------------------- Templates -------------------------------------
# Plain f-string HTML — no templating dependency. Inline styles only, because
# every mail client strips <style> blocks. N·LATTICE palette: near-black ink on
# warm white, monochrome, no gradients.

_INK = "#141414"
_MUTED = "#6b6b6b"
_LINE = "#e5e3df"
_BONE = "#faf9f7"


def _shell(title: str, intro: str, rows: List[tuple], cta: Optional[tuple],
            footer_note: str = "") -> str:
    row_html = "".join(
        f'<tr>'
        f'<td style="padding:6px 0;color:{_MUTED};font-size:13px;width:110px;vertical-align:top;">{k}</td>'
        f'<td style="padding:6px 0;color:{_INK};font-size:13px;font-weight:500;">{v}</td>'
        f'</tr>'
        for k, v in rows if v
    )
    cta_html = ""
    if cta:
        label, href = cta
        cta_html = (
            f'<a href="{href}" style="display:inline-block;margin-top:22px;padding:11px 20px;'
            f'background:{_INK};color:#ffffff;text-decoration:none;border-radius:999px;'
            f'font-size:13px;font-weight:600;">{label}</a>'
        )
    note = (
        f'<p style="margin:24px 0 0;color:{_MUTED};font-size:12px;line-height:1.6;">{footer_note}</p>'
        if footer_note else ""
    )
    return f"""\
<div style="margin:0;padding:32px 16px;background:{_BONE};font-family:Inter,-apple-system,Segoe UI,Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid {_LINE};border-radius:16px;padding:32px;">
    <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:{_MUTED};font-weight:600;">Innoira Agentic Suite</div>
    <h1 style="margin:12px 0 0;font-size:22px;line-height:1.3;color:{_INK};font-weight:700;">{title}</h1>
    <p style="margin:10px 0 20px;color:{_MUTED};font-size:14px;line-height:1.6;">{intro}</p>
    <table style="width:100%;border-collapse:collapse;border-top:1px solid {_LINE};padding-top:8px;">{row_html}</table>
    {cta_html}
    {note}
  </div>
  <p style="max-width:520px;margin:16px auto 0;color:{_MUTED};font-size:11px;text-align:center;">
    Scheduled by Innoira Agentic Suite
  </p>
</div>"""


def _when(booking: Dict[str, Any]) -> str:
    from datetime import datetime
    from zoneinfo import ZoneInfo
    # `start_at`/`end_at` are stored in the HOST's offset (slots are generated
    # from the host's availability), while `booking["timezone"]` is the GUEST's
    # captured zone — these can differ, so the wall-clock time must be
    # converted, not just relabeled, or the email would show the host's time
    # under the guest's zone name.
    tz_name = booking.get("timezone") or "UTC"
    try:
        tz = ZoneInfo(tz_name)
    except Exception:
        tz = ZoneInfo("UTC")
        tz_name = "UTC"
    start = datetime.fromisoformat(booking["start_at"]).astimezone(tz)
    end = datetime.fromisoformat(booking["end_at"]).astimezone(tz)
    return f"{start.strftime('%A, %d %B %Y')}<br>{start.strftime('%H:%M')}–{end.strftime('%H:%M')} ({tz_name})"


def _manage_url(booking: Dict[str, Any]) -> str:
    return f"{FRONTEND_URL}/book/manage/{booking['manage_token']}"


def _location(booking: Dict[str, Any]) -> str:
    link = booking.get("meet_link")
    if link:
        return f'<a href="{link}" style="color:{_INK};">{link}</a>'
    return "Details to follow"


def confirmation_email(booking: Dict[str, Any], event_name: str, host_name: str,
                        for_host: bool = False) -> tuple:
    who = booking["guest_name"] if for_host else host_name
    title = "New meeting booked" if for_host else "Your meeting is confirmed"
    intro = (
        f"{booking['guest_name']} booked <strong>{event_name}</strong> with you."
        if for_host else
        f"You're booked in with {host_name}. We've attached a calendar invite."
    )
    rows = [
        ("Event", event_name),
        ("With", who),
        ("When", _when(booking)),
        ("Where", _location(booking)),
    ]
    if for_host:
        rows.append(("Guest email", booking["guest_email"]))
    cta = ("Join the meeting", booking["meet_link"]) if booking.get("meet_link") else None
    note = "" if for_host else (
        f'Need a different time? <a href="{_manage_url(booking)}" style="color:{_INK};">'
        f'Reschedule or cancel</a>.'
    )
    return title, _shell(title, intro, rows, cta, note)


def _stage_label(minutes_before: int) -> str:
    if minutes_before >= 1440 and minutes_before % 1440 == 0:
        days = minutes_before // 1440
        return "tomorrow" if days == 1 else f"in {days} days"
    if minutes_before >= 60 and minutes_before % 60 == 0:
        hours = minutes_before // 60
        return "in an hour" if hours == 1 else f"in {hours} hours"
    return f"in {minutes_before} minutes"


def reminder_email(booking: Dict[str, Any], event_name: str, host_name: str,
                    minutes_before: int = 1440, for_host: bool = False) -> tuple:
    when_label = _stage_label(minutes_before)
    title = f"Your meeting is {when_label}" if not for_host else f"{booking['guest_name']}'s meeting is {when_label}"
    intro = (
        f"A reminder that <strong>{event_name}</strong> with {host_name} is coming up {when_label}."
        if not for_host else
        f"A reminder that <strong>{event_name}</strong> with {booking['guest_name']} is coming up {when_label}."
    )
    rows = [("Event", event_name), ("With", host_name if not for_host else booking["guest_name"]),
            ("When", _when(booking)), ("Where", _location(booking))]
    cta = ("Join the meeting", booking["meet_link"]) if booking.get("meet_link") else None
    note = "" if for_host else (
        f'Can no longer make it? <a href="{_manage_url(booking)}" style="color:{_INK};">'
        f'Reschedule or cancel</a>.'
    )
    return title, _shell(title, intro, rows, cta, note)


def reschedule_email(booking: Dict[str, Any], event_name: str, host_name: str,
                      old_when: str, for_host: bool = False) -> tuple:
    title = "Meeting rescheduled"
    intro = (
        f"{booking['guest_name']} moved <strong>{event_name}</strong> to a new time."
        if for_host else
        f"Your <strong>{event_name}</strong> with {host_name} has been moved. The calendar invite is updated."
    )
    rows = [
        ("Event", event_name),
        ("Was", old_when),
        ("Now", _when(booking)),
        ("Where", _location(booking)),
    ]
    cta = ("Join the meeting", booking["meet_link"]) if booking.get("meet_link") else None
    note = "" if for_host else (
        f'<a href="{_manage_url(booking)}" style="color:{_INK};">Reschedule or cancel</a> again if you need to.'
    )
    return title, _shell(title, intro, rows, cta, note)


def cancellation_email(booking: Dict[str, Any], event_name: str, host_name: str,
                        for_host: bool = False) -> tuple:
    title = "Meeting cancelled"
    intro = (
        f"{booking['guest_name']} cancelled <strong>{event_name}</strong>. The slot is open again."
        if for_host else
        f"Your <strong>{event_name}</strong> with {host_name} has been cancelled. Nothing further is needed."
    )
    rows = [("Event", event_name), ("Was", _when(booking))]
    return title, _shell(title, intro, rows, None, "")
