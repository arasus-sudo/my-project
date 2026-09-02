import pytest
import server  # noqa: F401  - resolves the router-mount import cycle (see test_pitch_eq.py)
import email_templates
from email_templates import (
    render_email_html, render_email_text, overlap_score, repeat_warnings,
    repeat_warnings as _rw, REPEAT_THRESHOLD, _footer_enabled,
    DEFAULT_COMPLIANCE,
)

CTX = {**email_templates.SAMPLE_LEAD, "unsubscribe_url": "https://x.test/unsub/sample"}


def _blocks(*types):
    data = {
        "greeting": {"value": "Hey {{first_name}},"},
        "opening": {"value": "Quick one for {{company}}."},
        "body": {"value": "A paragraph of body copy."},
        "proof": {"value": "of finance teams still run AP on spreadsheets.", "highlight": "43%"},
        "cta": {"label": "Book a 15-min call", "href": "{{calendly_link}}", "type": "button"},
        "cta-link": {"label": "Reply and I'll send details", "href": "mailto:hi@innoira.dev", "type": "link"},
        "signature": {"signature_id": "default",
                      "_resolved": {"content_html": "<p>Nadia Rose · nadia@innoira.dev</p>"}},
        "divider": {},
    }
    out = []
    for t in types:
        out.append({"type": t, "data": data[t]})
    return out


def test_render_email_html_is_table_based_with_inline_styles():
    html = render_email_html(_blocks("greeting", "body", "cta"), {}, CTX)
    assert "<table role=\"presentation\"" in html
    assert "style=" in html
    assert "<style" not in html
    assert "@media" not in html
    assert "font-family:" in html


def test_render_email_html_personalizes_and_escapes():
    html = render_email_html(_blocks("greeting"), {}, CTX)
    assert "Hey Alex," in html
    assert "{{first_name}}" not in html


def test_unresolved_tokens_stay_visible_instead_of_vanishing():
    html = render_email_html(_blocks("opening"), {}, {"first_name": "Alex"})
    assert "{{company}}" in html  # personalize() keeps unresolved tokens visible in the preview


def test_cta_button_uses_accent_and_cta_link_uses_accent_text():
    html = render_email_html(
        _blocks("cta") + [{"type": "cta", "data": {"type": "link",
                                                   "label": "Reply and I'll send details",
                                                   "href": "mailto:hi@innoira.dev"}}],
        {"accent_color": "#0f766e"}, CTX)
    assert "background-color:#0f766e" in html
    assert "color:#ffffff" in html
    assert "text-decoration:underline" in html
    assert "mailto:hi@innoira.dev" in html


def test_invalid_accent_color_falls_back_to_default():
    html = render_email_html(_blocks("cta"), {"accent_color": "red"}, CTX)
    assert "#2563eb" in html


def test_proof_callout_carries_highlight_and_explicit_background():
    html = render_email_html(_blocks("proof"), {}, CTX)
    assert "43%" in html
    assert "border-left:3px solid" in html
    assert "background-color:#f8fafc" in html


def test_signature_block_embeds_resolved_signature_html():
    sig = {"content_html": "<p>Nadia Rose · nadia@innoira.dev</p>"}
    html = render_email_html(_blocks("signature"), {}, CTX)
    assert "<p>Nadia Rose · nadia@innoira.dev</p>" in html


def test_render_text_is_plain_readable_copy():
    text = render_email_text(_blocks("greeting", "body", "cta"), CTX)
    assert "Hey Alex," in text
    assert "A paragraph of body copy." in text
    assert "Book a 15-min call: https://calendly.com/innoira/30min" in text
    assert "<" not in text


def test_footer_appends_when_compliance_enabled_for_region():
    compliance = {"enabled": True, "regions": ["ca"]}
    cfg = {**DEFAULT_COMPLIANCE, "legal_name": "Innoira Consulting Services", "address": "100 King St W, Toronto ON"}
    html = render_email_html(_blocks("body"), {}, CTX, compliance, cfg)
    assert "Innoira Consulting Services" in html
    assert "Unsubscribe" in html
    assert CTX["unsubscribe_url"] in html


def test_footer_skipped_for_non_footer_regions():
    compliance = {"enabled": True, "regions": ["us"]}
    cfg = {**DEFAULT_COMPLIANCE, "regions": ["ca"], "legal_name": "Innoira Consulting Services"}
    html = render_email_html(_blocks("body"), {}, CTX, compliance, cfg)
    assert "Innoira Consulting Services" not in html
    assert "Unsubscribe" not in html


def test_footer_skipped_when_compliance_disabled():
    html = render_email_html(_blocks("body"), {}, CTX, {"enabled": False, "regions": ["ca"]}, DEFAULT_COMPLIANCE)
    assert "Unsubscribe" not in html


def test_footer_text_render_matches_html():
    compliance = {"enabled": True, "regions": ["ca"]}
    cfg = {**DEFAULT_COMPLIANCE, "legal_name": "Innoira Consulting Services", "address": "100 King St W, Toronto ON"}
    text = render_email_text(_blocks("body"), CTX, compliance, cfg)
    assert "Innoira Consulting Services" in text
    assert "Unsubscribe:" in text
    assert CTX["unsubscribe_url"] in text


def test_overlap_score_identical_is_1_and_disjoint_is_0():
    a = "Hey there. Quick question about your AP process."
    assert overlap_score(a, a) == 1.0
    assert overlap_score(a, "Completely different words here entirely ok") == 0.0


def test_overlap_score_carrot_and_stick_case():
    body = "Hi Alex. We help finance teams automate AP. Want a quick chat?"
    sameish = "Hi Alex. We help finance teams automate AP. Want a quick chat?"
    assert overlap_score(body, sameish) > 0.8


def test_repeat_warnings_flags_only_heavy_repeats():
    prior = [
        {"id": "t1", "name": "Intro", "subject": "AP automation", "body": "We help finance teams automate AP. 43% still use spreadsheets. Want a chat?"},
        {"id": "t2", "name": "Follow-up 1", "subject": "AP automation", "body": "We help finance teams automate AP. 43% still use spreadsheets. Want a chat? Different closer."},
    ]
    warnings = repeat_warnings("followup_2", "AP automation",
                               "We help finance teams automate AP. 43% still use spreadsheets. Want a chat? Different closer.", prior)
    assert len(warnings) >= 1
    assert all(w["score"] > REPEAT_THRESHOLD * 100 for w in warnings)


def test_repeat_warnings_ignores_shared_greeting_only():
    prior = [{"id": "t1", "name": "Intro", "subject": "AP automation", "body": "Hey Alex, a quick idea for Acme."}]
    warnings = repeat_warnings("followup_2", "New angle", "Hey Alex, following up on the numbers I sent. New idea, different content, fresh framing for you.", prior)
    assert warnings == []


def test_step_positions_are_ordered_intro_first():
    assert email_templates.STEP_ORDER["intro"] < email_templates.STEP_ORDER["followup_1"]
    assert email_templates.STEP_ORDER["followup_1"] < email_templates.STEP_ORDER["breakup"]


def test_every_step_position_has_a_campaign_slot():
    for p in email_templates.STEP_POSITIONS:
        slot = email_templates.STEP_CAMPAIGN_MAP[p]
        assert "day" in slot and "condition" in slot


def test_unsubscribe_token_is_stable_and_unguessable():
    a = email_templates._unsub_token("ws1", "a@b.com")
    b = email_templates._unsub_token("ws1", "a@b.com")
    c = email_templates._unsub_token("ws1", "c@b.com")
    assert a == b
    assert a != c
    assert len(a) == 32


def test_personalize_preserves_css_braces():
    """Spintax resolution must only touch real {a|b} alternations, never CSS
    style blocks. Regression: the old brace regex stripped every `{...}` in an
    HTML `<style>` block, corrupting pasted templates on generation."""
    tpl = (
        ".btn { background: #2563eb; }\n"
        "a { text-decoration: none; }\n"
        "@media (max-width: 600px) { .x { color: red } }\n"
        "Hey {{first_name}}"
    )
    out = server.personalize(tpl, {"first_name": "Alex"})
    # merge field is substituted
    assert "Alex" in out and "{{first_name}}" not in out
    # CSS braces survive (the 2 merge-token brace pairs are consumed by
    # substitution, so compare against the 4 surviving CSS rules)
    assert out.count("{") == 4 and out.count("}") == 4
    assert ".btn {" in out and "text-decoration" in out and "@media" in out
    # genuine spintax still resolves
    spun = server.personalize("Pick {a|b|c} word", {})
    assert spun in ("Pick a word", "Pick b word", "Pick c word")
