"""Pitch EQ — provider clients, intent engine, and the draft chain's honesty rules.

Fixture-based, per the upgrade doc: recorded provider payloads, so the clients are
exercised without burning API quota.
"""

import asyncio
import re

import pytest

import server  # noqa: F401  — resolves the router-mount import cycle
import lead_sources
from lead_sources import ProviderError
import intent_engine
import draft_chain
import research_worker


# ============================ Provider clients ================================
# Shapes verified live against api.prospeo.io on 2026-07-15 (the old single-call
# domain-search/email-finder pair is deprecated — Prospeo now requires a
# search-person -> bulk-enrich-person round trip, and `person.email` is an
# object like {"status": "VERIFIED", "revealed": True, "email": "..."}, not a
# bare string).
SEARCH_PERSON_FIXTURE = {
    "error": False,
    "results": [
        {"person": {"person_id": "p1", "first_name": "Dana", "last_name": "Rowe",
                     "current_job_title": "VP Sales", "linkedin_url": "https://linkedin.com/in/dana"},
         "company": {"name": "Acme"}},
        {"person": {"person_id": "p2", "full_name": "Sam Patel", "current_job_title": "CTO",
                     "linkedin_url": ""}, "company": {"name": "Acme"}},
        {"person": {"person_id": "p3", "first_name": "NoEmail", "last_name": "Person"},
         "company": {"name": "Acme"}},
    ],
}
BULK_ENRICH_FIXTURE = {
    "error": False, "total_cost": 2, "not_matched": [], "invalid_datapoints": [],
    "matched": [
        {"identifier": "p1", "person": {"person_id": "p1", "first_name": "Dana", "last_name": "Rowe",
                                          "current_job_title": "VP Sales",
                                          "linkedin_url": "https://linkedin.com/in/dana",
                                          "email": {"status": "VERIFIED", "revealed": True, "email": "dana@acme.com"}},
         "company": {"name": "Acme"}},
        {"identifier": "p2", "person": {"person_id": "p2", "full_name": "Sam Patel",
                                          "current_job_title": "CTO",
                                          "email": {"status": "VERIFIED", "revealed": True, "email": "sam@acme.com"}},
         "company": {"name": "Acme"}},
        # p3 not matched at all — Prospeo doesn't charge for/return a record with no email.
    ],
}


def test_normalise_maps_provider_shape():
    matched = BULK_ENRICH_FIXTURE["matched"]
    out = [lead_sources.normalize_prospect(m["person"], "acme.com", m["company"]) for m in matched]
    assert out[0]["title"] == "VP Sales"
    assert out[0]["linkedin_url"] == "https://linkedin.com/in/dana"
    # A single `full_name` field must split into first/last.
    assert (out[1]["first_name"], out[1]["last_name"]) == ("Sam", "Patel")
    assert out[0]["email"] == "dana@acme.com"
    assert isinstance(out[0]["confidence"], float)


def test_domain_search_drops_records_with_no_email(monkeypatch):
    monkeypatch.setattr(lead_sources, "PROSPEO_MOCKED", False)
    monkeypatch.setattr(lead_sources, "PROSPEO_API_KEY", "k")

    calls = []

    async def fake_request(provider, method, url, **k):
        calls.append(url)
        return BULK_ENRICH_FIXTURE if "bulk-enrich-person" in url else SEARCH_PERSON_FIXTURE
    monkeypatch.setattr(lead_sources, "_request", fake_request)

    out = asyncio.run(lead_sources.domain_search("acme.com", 10))
    assert len(out) == 2, "the unmatched/no-email record should be dropped"
    assert all(p["email"] for p in out)
    assert len(calls) == 2, "search-person then bulk-enrich-person"


def test_failing_provider_RAISES_instead_of_returning_mock_data(monkeypatch):
    """The bug this replaces: the old client caught every exception and returned
    ten fictional people while still reporting providers.prospeo == 'live'. A
    revoked key looked like a successful search, and you'd email people who don't
    exist."""
    monkeypatch.setattr(lead_sources, "PROSPEO_MOCKED", False)
    monkeypatch.setattr(lead_sources, "PROSPEO_API_KEY", "bad-key")

    async def boom(*a, **k):
        raise ProviderError("prospeo", "HTTP 401: invalid key", 401)
    monkeypatch.setattr(lead_sources, "_request", boom)

    with pytest.raises(ProviderError):
        asyncio.run(lead_sources.domain_search("acme.com", 5))


def test_test_mode_still_returns_mock_people(monkeypatch):
    """Mock data is fine when there is deliberately no key — that's the advertised
    test mode. It is only forbidden as a disguise for a real failure."""
    monkeypatch.setattr(lead_sources, "PROSPEO_MOCKED", True)
    out = asyncio.run(lead_sources.domain_search("acme.com", 3))
    assert len(out) == 3
    assert all(p["mocked"] for p in out)


def test_mock_linkedin_urls_are_unique_per_domain(monkeypatch):
    """Dedupe is on email OR linkedin_url. If the mock gave every company the same
    LinkedIn slug, importing two companies would silently drop the second."""
    monkeypatch.setattr(lead_sources, "PROSPEO_MOCKED", True)
    a = asyncio.run(lead_sources.domain_search("acme.com", 3))
    b = asyncio.run(lead_sources.domain_search("globex.com", 3))
    assert not ({p["linkedin_url"] for p in a} & {p["linkedin_url"] for p in b})


def test_clean_domain_strips_scheme_and_path():
    assert lead_sources.clean_domain("https://www.acme.com/pricing") == "acme.com"
    assert lead_sources.clean_domain("ACME.com") == "acme.com"


def test_domain_search_requires_a_domain():
    """The old code silently fell back to 'example.com' and returned fictional
    people at a domain the user never asked about."""
    with pytest.raises(ValueError):
        asyncio.run(lead_sources.domain_search("", 5))


# ============================ Research pack ==================================
def test_personal_inbox_is_not_treated_as_a_company_domain():
    assert research_worker._domain_for({"email": "dana@gmail.com"}) == ""
    assert research_worker._domain_for({"email": "dana@acme.com"}) == "acme.com"


def test_leaked_css_is_dropped_not_summarised():
    """A truncated <style> block used to reach the LLM as the company's
    description, producing confidently wrong emails."""
    css = ".bpRfIm{font-size:var(--title-8-size);line-height:1;font-weight:600;}" * 6
    assert research_worker._clean_site_text(css) == ""

    prose = ("Acme builds payment infrastructure for online businesses. "
             "Millions of companies use Acme to accept payments and manage revenue.")
    assert research_worker._clean_site_text(prose).startswith("Acme builds")


def test_news_query_includes_the_domain(monkeypatch):
    """Searching by company name alone is actively harmful for generic names:
    'Linear' returns Linear Health Sciences and the linear alcohol market, and the
    intent engine then scores a medical-device deal as a software buying signal."""
    seen = {}

    class _Resp:
        content = b""
        def raise_for_status(self): pass

    class _Client:
        def __init__(self, *a, **k): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def get(self, url, **k):
            seen["url"] = url
            return _Resp()

    monkeypatch.setattr(research_worker.httpx, "AsyncClient", _Client)
    asyncio.run(research_worker._fetch_news("Linear", "linear.app"))
    assert "linear.app" in seen["url"]
    assert "%22Linear%22" in seen["url"], "company name should be a quoted phrase"


def test_summarize_refuses_to_offer_a_hook_when_there_is_no_signal():
    empty = research_worker._empty_pack({"company": "Acme"})
    text = research_worker.summarize_for_prompt(empty)
    assert "NO PUBLIC SIGNALS" in text
    assert "Do not invent" in text


# ============================ Intent engine ==================================
def _pack(**over):
    base = {
        "company": "Acme", "has_signal": True, "site_summary": "Acme does things.",
        "news": [], "signals": {"funding": [], "hiring": [], "product": []},
        "github": {}, "linkedin": {},
    }
    base.update(over)
    return base


def test_hot_lead_scores_far_above_a_cold_one():
    hot = _pack(
        signals={"funding": ["Acme raises $40M Series B"], "hiring": ["Acme hires VP Sales"], "product": []},
        github={"languages": ["Go", "TypeScript"]},
        news=[{"title": "Acme raises $40M Series B", "url": "", "published": "2026-07-01"}],
    )
    cold = _pack(has_signal=False)

    hot_score, hot_reasons = intent_engine._rule_score(
        hot, {"title": "VP Sales"}, [], {"titles": ["VP Sales"]})
    cold_score, cold_reasons = intent_engine._rule_score(
        cold, {"title": "VP Sales"}, [], {})

    assert hot_score > 70, hot_score
    assert cold_score < 25, cold_score
    assert hot_score - cold_score > 40
    assert hot_reasons and cold_reasons, "every score must carry reasons"


def test_every_score_carries_reasons():
    for pack in (_pack(), _pack(has_signal=False),
                 _pack(signals={"funding": ["x"], "hiring": [], "product": []})):
        _, reasons = intent_engine._rule_score(pack, {"title": "CTO"}, [], {})
        assert reasons, "a score with no explanation is what we replaced"


def test_no_signal_says_so_rather_than_asserting_the_lead_is_cold():
    _, reasons = intent_engine._rule_score(_pack(has_signal=False), {}, [], {})
    assert any("no public signals" in r.lower() for r in reasons)


def test_engagement_beats_firmographics():
    """A lead who replied outranks one who merely works at a funded company."""
    quiet = _pack(signals={"funding": ["Acme raises $40M"], "hiring": [], "product": []})
    engaged = _pack()
    q, _ = intent_engine._rule_score(quiet, {}, [], {})
    e, _ = intent_engine._rule_score(engaged, {}, [{"type": "replied"}, {"type": "meeting_booked"}], {})
    assert e > q


def test_bands_map_to_scores():
    assert intent_engine._band(90) == "hot"
    assert intent_engine._band(60) == "warm"
    assert intent_engine._band(30) == "cool"
    assert intent_engine._band(5) == "cold"


def test_llm_adjustment_is_clamped(monkeypatch):
    """The rules own the evidence; the model may nudge, never overturn."""
    async def wild(system, user_text, sid):
        return '{"adjustment": 99, "reason": "vibes"}'
    monkeypatch.setattr(intent_engine, "_llm_chat", wild)
    monkeypatch.setattr(intent_engine, "ANTHROPIC_API_KEY", "k")
    adj, _ = asyncio.run(intent_engine._llm_adjustment(_pack(), {"id": "abcdefgh"}, 50))
    assert adj == 15

    async def wild_low(system, user_text, sid):
        return '{"adjustment": -99, "reason": "vibes"}'
    monkeypatch.setattr(intent_engine, "_llm_chat", wild_low)
    adj, _ = asyncio.run(intent_engine._llm_adjustment(_pack(), {"id": "abcdefgh"}, 50))
    assert adj == -15


# ============================ Draft chain ====================================
def test_html_has_real_paragraphs_and_bullets():
    """The doc's complaint was 'one flat paragraph'."""
    html = draft_chain.to_html({
        "paragraphs": ["First thought.", "Second thought."],
        "bullets": ["Point A", "Point B"],
        "cta": "Worth 15 minutes?",
    }, signature="Arasu Selvam\nInnoira")

    # Paragraphs carry inline styles now (real typography, not bare tags), so
    # count opening tags rather than the literal string "<p>".
    assert html.count("<p ") >= 3
    assert "<ul" in html and html.count("<li ") == 2
    # A multi-line signature must not collapse onto one line.
    assert "<br>" in html


def test_html_has_inline_typography_not_bare_tags():
    """The bug this replaced: bare <p>/<ul> tags with no styling rendered with
    whatever margins the recipient's mail client felt like applying — the thing
    that made every draft look unfinished and 'very basic'."""
    html = draft_chain.to_html({"paragraphs": ["Hello there."], "cta": "Chat?"},
                               signature="Arasu Selvam\nInnoira")
    assert "<p>" not in html  # no unstyled paragraph tags survive
    assert "font-family" in html and "line-height" in html
    assert "border-top" in html  # signature is visually separated, not just appended text


def test_html_is_escaped():
    html = draft_chain.to_html({"paragraphs": ["<script>alert(1)</script>"], "cta": ""})
    assert "<script>" not in html
    assert "&lt;script&gt;" in html


def test_text_alternative_is_generated():
    """An HTML-only body is one of the strongest spam signals there is."""
    text = draft_chain.to_text({
        "paragraphs": ["Hello there."], "bullets": ["A"], "cta": "Chat?",
    }, signature="Arasu")
    assert "Hello there." in text
    assert "- A" in text
    assert "<" not in text


def test_chain_call_gives_up_loudly_on_malformed_json(monkeypatch):
    """A step that returns junk must raise, not silently ship a broken draft."""
    class _Msgs:
        async def create(self, **k):
            class B:
                type = "text"
                text = "sorry, I can't do that"
            class R:
                content = [B()]
            return R()

    class _Client:
        def __init__(self, **k): self.messages = _Msgs()

    monkeypatch.setattr(draft_chain.anthropic, "AsyncAnthropic", _Client)
    monkeypatch.setattr(draft_chain, "ANTHROPIC_API_KEY", "k")
    monkeypatch.setattr(draft_chain, "MAX_ATTEMPTS", 1)

    with pytest.raises(draft_chain.ChainError):
        asyncio.run(draft_chain._chain_call("sys", "user", required=["subject"]))


def test_chain_call_rejects_json_missing_required_keys(monkeypatch):
    class _Msgs:
        async def create(self, **k):
            class B:
                type = "text"
                text = '{"subject": "hi"}'      # missing "cta"
            class R:
                content = [B()]
            return R()

    class _Client:
        def __init__(self, **k): self.messages = _Msgs()

    monkeypatch.setattr(draft_chain.anthropic, "AsyncAnthropic", _Client)
    monkeypatch.setattr(draft_chain, "ANTHROPIC_API_KEY", "k")
    monkeypatch.setattr(draft_chain, "MAX_ATTEMPTS", 1)

    with pytest.raises(draft_chain.ChainError):
        asyncio.run(draft_chain._chain_call("sys", "user", required=["subject", "cta"]))
