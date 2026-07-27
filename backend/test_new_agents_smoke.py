"""Smoke tests for the agents built this session (WhatsApp/SMS/HRMS/
Accounting/Site EQ, Veo video) — before this file, none of them had any
automated coverage at all; every check was ad hoc (scratchpad scripts,
manual browser passes) and left nothing behind for CI to catch a future
regression with.

These are deliberately narrow: import-sanity (catches a broken import
immediately, the most common real regression class in this codebase per
this session's own bug log) plus unit tests for the pure, DB-free helper
functions each module happens to have — not full route/integration
coverage, which would need a real or mocked MongoDB this repo's test
suite doesn't set up anywhere else (see test_pitch_eq.py's own pattern:
pure-logic tests + monkeypatched external calls, never a real DB).
"""
from decimal import Decimal

import pytest

import server  # noqa: F401 — resolves the router-mount import cycle, same as test_pitch_eq.py


# ============================ Import sanity ===================================
@pytest.mark.parametrize("module_name", [
    "whatsapp_eq", "sms_eq", "hrms_eq", "accounting_eq", "site_eq", "veo_client",
])
def test_module_imports_cleanly(module_name):
    __import__(module_name)


# ============================ Accounting EQ: double-entry invariant ===========
def test_balanced_entry_passes():
    import accounting_eq
    accounting_eq._check_balanced(Decimal("100.00"), Decimal("100.00"))  # must not raise


def test_unbalanced_entry_rejected():
    import accounting_eq
    from fastapi import HTTPException
    with pytest.raises(HTTPException):
        accounting_eq._check_balanced(Decimal("100.00"), Decimal("99.99"))


def test_line_cannot_be_both_debit_and_credit():
    import accounting_eq
    from fastapi import HTTPException
    with pytest.raises(HTTPException):
        accounting_eq._validate_journal_line(Decimal("50"), Decimal("50"))


def test_line_must_have_an_amount():
    import accounting_eq
    from fastapi import HTTPException
    with pytest.raises(HTTPException):
        accounting_eq._validate_journal_line(Decimal("0"), Decimal("0"))


def test_valid_debit_only_line_passes():
    import accounting_eq
    accounting_eq._validate_journal_line(Decimal("50"), Decimal("0"))  # must not raise


def test_fmt_d_rounds_to_cents():
    import accounting_eq
    assert accounting_eq._fmt_d(1.005) == 1.01  # ROUND_HALF_UP via str() first, not float, so no binary-float surprise
    assert accounting_eq._fmt_d(None) == 0.0
    assert accounting_eq._fmt_d("10") == 10.0


# ============================ SMS EQ: STOP/START/HELP keywords ================
def test_stop_keywords_recognised():
    import sms_eq
    for word in ("STOP", "stop", "  Stop  ", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"):
        assert sms_eq._is_stop_message(word)
    assert not sms_eq._is_stop_message("stop asking")  # must not fuzzy-match a real message


def test_start_keywords_recognised():
    import sms_eq
    for word in ("START", "YES", "UNSTOP"):
        assert sms_eq._is_start_message(word)
    assert not sms_eq._is_start_message("yes please")


def test_help_keywords_recognised():
    import sms_eq
    assert sms_eq._is_help_message("HELP")
    assert sms_eq._is_help_message("info")
    assert not sms_eq._is_help_message("I need help with my order")


def test_sms_sanitize_phone_strips_formatting():
    import sms_eq
    assert sms_eq._sanitize_phone("+1 (415) 555-0100") == "+14155550100"


# ============================ WhatsApp EQ: session window + phone =============
def test_whatsapp_session_not_expired_when_unset():
    import whatsapp_eq
    assert whatsapp_eq._session_expired(None) is False  # no session opened yet != expired


def test_whatsapp_session_expired_in_the_past():
    import whatsapp_eq
    assert whatsapp_eq._session_expired("2020-01-01T00:00:00+00:00") is True


def test_whatsapp_session_not_expired_in_the_future():
    import whatsapp_eq
    assert whatsapp_eq._session_expired("2099-01-01T00:00:00+00:00") is False


def test_whatsapp_sanitize_phone_strips_formatting():
    import whatsapp_eq
    assert whatsapp_eq._sanitize_phone("+1 (415) 555-0100") == "+14155550100"


# ============================ HRMS EQ: leave day counting ======================
def test_leave_days_single_day_counts_as_one():
    import hrms_eq
    assert hrms_eq._leave_days("2026-08-10", "2026-08-10") == 1  # classic off-by-one risk


def test_leave_days_inclusive_range():
    import hrms_eq
    assert hrms_eq._leave_days("2026-08-10", "2026-08-14") == 5


# ============================ Veo client: mocked-mode gating ===================
def test_veo_mocked_flag_reflects_missing_key(monkeypatch):
    import veo_client
    monkeypatch.setattr(veo_client, "GEMINI_API_KEY", "")
    monkeypatch.setattr(veo_client, "VEO_MOCKED", True)
    with pytest.raises(RuntimeError):
        import asyncio
        asyncio.run(veo_client.submit_video_job("a test prompt"))


def test_veo_poll_without_key_returns_not_done_with_error(monkeypatch):
    import asyncio
    import veo_client
    monkeypatch.setattr(veo_client, "GEMINI_API_KEY", "")
    monkeypatch.setattr(veo_client, "VEO_MOCKED", True)
    result = asyncio.run(veo_client.poll_video_job("operations/fake"))
    assert result["done"] is False
    assert result["error"]


# ============================ WhatsApp EQ: automated agent helpers ============
def test_placeholder_email_is_pydantic_valid():
    """The whole point of this helper: unlike the pre-existing `@unknown`
    synthetic-email convention, this one must actually pass EmailStr
    validation (BookingIn.guest_email is Pydantic-validated, lead docs are not)."""
    import whatsapp_eq
    from pydantic import BaseModel, EmailStr

    class _M(BaseModel):
        e: EmailStr

    email = whatsapp_eq._valid_placeholder_email("abcd1234efgh")
    _M(e=email)  # must not raise


def test_is_synthetic_email_recognises_both_placeholder_conventions():
    import whatsapp_eq
    assert whatsapp_eq._is_synthetic_email("wa-abcd1234@unknown")
    assert whatsapp_eq._is_synthetic_email(whatsapp_eq._valid_placeholder_email("abcd1234"))
    assert not whatsapp_eq._is_synthetic_email("real.customer@gmail.com")
    assert not whatsapp_eq._is_synthetic_email("")


def test_whatsapp_chunk_splits_on_size_and_keeps_all_words():
    import whatsapp_eq
    text = " ".join(f"word{i}" for i in range(500))
    chunks = whatsapp_eq._chunk(text, size=100)
    assert len(chunks) > 1
    # No word lost across the split — reconstructing every chunk's words
    # back into a set must match the original set (order doesn't matter here,
    # just that chunking never drops content).
    assert set(" ".join(chunks).split()) == set(text.split())


def test_whatsapp_clean_reply_strips_markdown_and_citations():
    import whatsapp_eq
    raw = "**Sure!** Here's the *answer* [1][2].\n- point one\n- point two"
    cleaned = whatsapp_eq._clean_reply(raw)
    assert "**" not in cleaned and "*" not in cleaned
    assert "[1]" not in cleaned and "[2]" not in cleaned
