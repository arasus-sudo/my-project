"""Timezone / DST tests for Schedule EQ's slot engine.

Time-zone bugs are the #1 risk in a booking product, and they are invisible in a
happy-path smoke test: everything looks right until a US customer books across
the March/November boundary, or an Indian customer's half-hour offset silently
shifts every slot.

These drive the real `_compute_open_slots()` against a stubbed Mongo, so the
assertions cover the actual production code path, not a reimplementation.
"""

import asyncio
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

# `server` must be imported first: it mounts schedule_eq's routers at the bottom of
# its own module body, so importing schedule_eq directly would re-enter a
# half-initialised server. Importing server lets that cycle resolve in the right order.
import server  # noqa: F401
import schedule_eq


class _FakeCursor:
    def __init__(self, items):
        self._items = items

    async def to_list(self, _n):
        return self._items


class _FakeCollection:
    """Bookings/availability stubs — the slot engine only reads."""

    def __init__(self, one=None, many=None):
        self._one = one
        self._many = many or []

    async def find_one(self, *_a, **_k):
        return self._one

    def find(self, *_a, **_k):
        return _FakeCursor(self._many)


class _FakeDB:
    def __init__(self, availability, bookings=None):
        self.availability = _FakeCollection(one=availability)
        self.bookings = _FakeCollection(many=bookings or [])
        self.calendar_integrations = _FakeCollection(one=None)  # no Google in these tests


def _event_type(duration=30, notice=0, days=30):
    return {
        "id": "et-test", "workspace_id": "ws-test", "duration_minutes": duration,
        "buffer_before_minutes": 0, "buffer_after_minutes": 0, "daily_limit": 0,
        "min_notice_hours": notice, "date_range_days": days,
    }


def _availability(tz):
    # 09:00–17:00 every day, so a DST transition day always has a full window.
    return {
        "workspace_id": "ws-test", "timezone": tz,
        "working_hours": {d: [{"start": "09:00", "end": "17:00"}]
                           for d in schedule_eq.WEEKDAY_KEYS},
        "blackout_dates": [],
    }


def _slots_for(tz, monkeypatch, duration=30, days=30):
    monkeypatch.setattr(schedule_eq, "db", _FakeDB(_availability(tz)))
    return asyncio.run(
        schedule_eq._compute_open_slots("ws-test", _event_type(duration=duration, days=days))
    )


ZONES = ["UTC", "America/New_York", "Asia/Kolkata"]


@pytest.mark.parametrize("tz", ZONES)
def test_no_duplicate_slots(tz, monkeypatch):
    """The 'fall back' hour repeats a wall-clock time. If slots are built naively,
    01:30 appears twice — a double-booking waiting to happen."""
    slots = _slots_for(tz, monkeypatch)
    assert len(slots) == len(set(slots)), f"{tz}: duplicate slot timestamps emitted"


@pytest.mark.parametrize("tz", ZONES)
def test_slots_strictly_increase_in_absolute_time(tz, monkeypatch):
    """Every slot must be later than the previous one *in real time*, not just in
    wall-clock string order. Across 'spring forward' a naive engine goes backwards."""
    slots = _slots_for(tz, monkeypatch)
    abs_times = [datetime.fromisoformat(s).timestamp() for s in slots]
    assert abs_times == sorted(abs_times), f"{tz}: slots not monotonically increasing"
    assert len(set(abs_times)) == len(abs_times), f"{tz}: two slots at the same instant"


@pytest.mark.parametrize("tz", ZONES)
def test_all_slots_land_inside_working_hours(tz, monkeypatch):
    """A slot must read 09:00–17:00 to the *host*, on every day, including the two
    days a year the offset changes. This is the assertion that actually catches a
    UTC-arithmetic bug: add 24h to a timestamp across DST and you land at 08:00."""
    zone = ZoneInfo(tz)
    for iso in _slots_for(tz, monkeypatch):
        local = datetime.fromisoformat(iso).astimezone(zone)
        assert 9 <= local.hour < 17, f"{tz}: slot {iso} falls outside 09:00–17:00 local"


@pytest.mark.parametrize("tz", ZONES)
def test_slot_duration_is_exact(tz, monkeypatch):
    """Consecutive slots within a day must be exactly one duration apart in absolute
    time. A half-hour-offset zone (Kolkata, UTC+5:30) breaks engines that assume
    whole-hour offsets."""
    slots = [datetime.fromisoformat(s) for s in _slots_for(tz, monkeypatch, duration=30)]
    for a, b in zip(slots, slots[1:]):
        gap = b - a
        # Either the next slot in the same window, or a jump to the next day.
        assert gap == timedelta(minutes=30) or gap > timedelta(hours=1), \
            f"{tz}: unexpected {gap} gap between {a.isoformat()} and {b.isoformat()}"


def test_kolkata_offset_is_half_hour(monkeypatch):
    """Guards the specific class of bug a whole-hour assumption would introduce."""
    for iso in _slots_for("Asia/Kolkata", monkeypatch)[:20]:
        offset = datetime.fromisoformat(iso).utcoffset()
        assert offset == timedelta(hours=5, minutes=30), f"bad Kolkata offset: {offset}"


@pytest.mark.parametrize("tz", ZONES)
def test_existing_booking_blocks_its_slot(tz, monkeypatch):
    """A confirmed booking must remove exactly that slot and no other."""
    monkeypatch.setattr(schedule_eq, "db", _FakeDB(_availability(tz)))
    free = asyncio.run(schedule_eq._compute_open_slots("ws-test", _event_type()))
    taken = free[5]

    end = (datetime.fromisoformat(taken) + timedelta(minutes=30)).isoformat()
    monkeypatch.setattr(schedule_eq, "db", _FakeDB(
        _availability(tz),
        bookings=[{"start_at": taken, "end_at": end, "status": "confirmed"}],
    ))
    after = asyncio.run(schedule_eq._compute_open_slots("ws-test", _event_type()))

    assert taken not in after, f"{tz}: booked slot still offered"
    assert set(free) - set(after) == {taken}, f"{tz}: booking removed more than its own slot"
