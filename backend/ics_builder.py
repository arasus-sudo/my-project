"""RFC 5545 calendar invites (icalendar).

Attached to booking emails so the meeting lands in the guest's calendar from the
mail client, without them needing an account here. Reschedules reuse the same
UID with a bumped SEQUENCE, which is what tells a calendar client to *move* the
existing event rather than create a second one.
"""

from datetime import datetime
from typing import Any, Dict, Optional

from icalendar import Calendar, Event, vText


def build_invite(booking: Dict[str, Any], event_name: str, description: str = "",
                  organizer_email: Optional[str] = None, method: str = "REQUEST") -> str:
    """Return the .ics body for a booking. `method='CANCEL'` produces a cancellation."""
    cal = Calendar()
    cal.add("prodid", "-//Innoira Agentic Suite//Schedule EQ//EN")
    cal.add("version", "2.0")
    cal.add("method", method)

    ev = Event()
    # Stable UID across the booking's whole life — reschedules and cancellations
    # must reference the same event, not spawn new ones.
    ev.add("uid", f"{booking['id']}@innoira")
    ev.add("sequence", int(booking.get("ics_sequence", 0)))
    ev.add("summary", event_name)
    if description:
        ev.add("description", description)
    ev.add("dtstart", datetime.fromisoformat(booking["start_at"]))
    ev.add("dtend", datetime.fromisoformat(booking["end_at"]))
    ev.add("dtstamp", datetime.now(datetime.fromisoformat(booking["start_at"]).tzinfo))
    ev.add("status", "CANCELLED" if method == "CANCEL" else "CONFIRMED")

    if booking.get("meet_link"):
        ev.add("location", vText(booking["meet_link"]))
        ev.add("url", booking["meet_link"])

    if organizer_email:
        ev.add("organizer", f"MAILTO:{organizer_email}")
    ev.add("attendee", f"MAILTO:{booking['guest_email']}")

    cal.add_component(ev)
    return cal.to_ical().decode("utf-8")
