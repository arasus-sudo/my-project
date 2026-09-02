"""Tests for the opt-out / unsubscribe module.

Covers the sync helpers (token stability, email-safe footer idempotency) that
don't need a live MongoDB. The async DB-backed flows (issue_unsubscribe,
resolve_unsubscribe, the landing routes) are exercised against the real
collection when a Mongo instance is available — see the live smoke note in
the module docstring for optout.py.
"""

import ast
import server  # noqa: F401  - resolves the router-mount import cycle (see test_pitch_eq.py)
import optout
from optout import (
    _unsub_token,
    append_unsubscribe_footer,
    append_unsubscribe_footer_text,
)


def test_token_is_stable_and_unguessable():
    a = _unsub_token("ws1", "a@b.com")
    b = _unsub_token("ws1", "a@b.com")
    c = _unsub_token("ws1", "c@b.com")
    assert a == b
    assert a != c
    assert len(a) == 32
    assert all(ch in "0123456789abcdef" for ch in a)


def test_token_matches_email_templates_algo():
    """The optout token must be identical to email_templates' so links minted
    by either path stay valid."""
    import email_templates
    assert _unsub_token("ws1", "a@b.com") == email_templates._unsub_token("ws1", "a@b.com")


def test_footer_appends_a_link():
    html = "<p>Hi</p></body></html>"
    out = append_unsubscribe_footer(html, "https://x.test/api/unsubscribe/abc")
    assert "Unsubscribe" in out
    assert "https://x.test/api/unsubscribe/abc" in out
    assert "border-top:1px solid #e2e8f0" in out


def test_footer_is_idempotent():
    url = "https://x.test/api/unsubscribe/abc"
    out1 = append_unsubscribe_footer("<p>Hi</p></body></html>", url)
    out2 = append_unsubscribe_footer(out1, url)
    assert out1 == out2
    assert out1.count("Unsubscribe") == 1


def test_footer_skips_when_unsubscribe_link_already_present():
    html = '<p>Hi</p><a href="https://leadlist.example/list-unsubscribe">Unsubscribe</a></body></html>'
    out = append_unsubscribe_footer(html, "https://x.test/api/unsubscribe/abc")
    assert out == html


def test_footer_handles_no_closing_body():
    out = append_unsubscribe_footer("<p>Hi</p>", "https://x.test/api/unsubscribe/abc")
    assert "Unsubscribe" in out


def test_footer_text_is_idempotent():
    url = "https://x.test/api/unsubscribe/abc"
    out1 = append_unsubscribe_footer_text("Hello world", url)
    out2 = append_unsubscribe_footer_text(out1, url)
    assert out1 == out2
    assert url in out1
    assert out1.count("Unsubscribe") == 1


def test_footer_text_appends_newline_block():
    out = append_unsubscribe_footer_text("Hello world", "https://x.test/api/unsubscribe/abc")
    assert out.startswith("Hello world\n\n--\n")


def test_footer_text_empty_url_is_noop():
    assert append_unsubscribe_footer_text("Hello", "") == "Hello"


def test_module_compiles():
    ast.parse(open(optout.__file__, encoding="utf-8", errors="replace").read())
