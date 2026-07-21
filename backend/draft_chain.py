"""The draft chain: Research → Angle → Draft → Humanise.

Four discrete LLM calls, each returning strict JSON validated against a schema.
Splitting them is the point: one prompt asked to research, pick an angle, write,
and then rewrite in a human voice does all four badly.

Two constraints shape the implementation:

1. **Rate limits.** Proposal EQ tripped the org's 10k-input-tokens/min ceiling
   doing just two back-to-back heavy calls. So every step here gets a *compact*
   payload — the trimmed ResearchPack, never raw pages — and `_chain_call()`
   retries 429s with exponential backoff instead of failing the whole draft.

2. **No invented triggers.** If research found nothing, the Angle step is told so
   explicitly and must return `has_angle: False`. The chain then writes an honest,
   generic-but-clean email and marks it low confidence. It never fabricates a
   funding round to justify the outreach — that is the single fastest way to burn
   a prospect, and the upgrade doc calls it out by name.
"""

import asyncio
import json
import logging
import re
from typing import Any, Dict, List, Optional, Tuple

from server import _llm_chat, _extract_json, compute_eq
from research_worker import summarize_for_prompt

log = logging.getLogger(__name__)

MAX_ATTEMPTS = 3


class ChainError(RuntimeError):
    """A step failed after retries, or returned JSON that doesn't match its schema.
    Raised rather than silently degraded — a malformed draft that looks fine is
    worse than an error."""


async def _chain_call(system: str, user_text: str, required: List[str],
                       max_tokens: int = 900) -> Dict[str, Any]:
    """One step. Retries on rate limit and on malformed JSON, then fails loudly."""
    delay = 4.0
    last = ""

    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            text = await _llm_chat(system, user_text, f"chain-{attempt}", max_tokens=max_tokens)
            parsed = _extract_json(text)
            if parsed is None:
                last = "response was not JSON"
            else:
                missing = [k for k in required if k not in parsed]
                if missing:
                    last = f"missing keys {missing}"
                else:
                    return parsed
            # Malformed output is usually transient — one more go, then give up.
            if attempt < MAX_ATTEMPTS:
                await asyncio.sleep(1)
                continue
        except Exception as ex:
            last = str(ex)
            if attempt < MAX_ATTEMPTS:
                await asyncio.sleep(delay)
                delay *= 2
                continue

    raise ChainError(f"step failed after {MAX_ATTEMPTS} attempts: {last}")


# ----------------------------- Step 2: Angle -----------------------------------
async def pick_angle(lead: Dict[str, Any], pack: Dict[str, Any],
                      offer: str) -> Dict[str, Any]:
    system = (
        "You pick the single strongest angle for a B2B cold email, based ONLY on the research "
        "provided.\n"
        "CRITICAL: if the research shows no public signals, you MUST return has_angle=false and "
        "leave trigger empty. Do NOT invent a funding round, a hire, a launch, or any other event. "
        "Inventing a trigger is worse than sending a generic email.\n"
        'STRICT JSON only: {"has_angle": bool, "trigger": str, "angle": str, '
        '"pain_hypothesis": str, "confidence": "high"|"medium"|"low"}\n'
        "trigger = the specific thing that happened (verbatim from research, or empty).\n"
        "angle = the one-sentence reason this email is worth their time.\n"
        "pain_hypothesis = the problem they most likely have, given what they do."
    )
    user_text = (
        f"Prospect: {lead.get('first_name', '')} {lead.get('last_name', '')}, "
        f"{lead.get('title', '')} at {lead.get('company', '')}\n"
        f"What we sell: {offer}\n\n"
        f"RESEARCH:\n{summarize_for_prompt(pack)}"
    )
    return await _chain_call(
        system, user_text,
        required=["has_angle", "angle", "pain_hypothesis", "confidence"],
        max_tokens=600,
    )


# ----------------------------- Step 3: Draft -----------------------------------
async def write_draft(lead: Dict[str, Any], angle: Dict[str, Any], offer: str,
                       goal: str) -> Dict[str, Any]:
    system = (
        "You write B2B cold emails that get replies. Structure, not a wall of text.\n"
        "Rules: under 130 words. Short paragraphs (1-2 sentences each). One clear, low-friction "
        "ask at the end. No exclamation marks, no ALL-CAPS, no 'I hope this finds you well', no "
        "'quick question', no fake familiarity. Never claim a fact that isn't in the angle.\n"
        'STRICT JSON only: {"subject": str, "paragraphs": [str, ...], "bullets": [str, ...], '
        '"cta": str}\n'
        "subject: under 50 chars, lowercase-ish, specific, no clickbait.\n"
        "paragraphs: 2-3 of them. bullets: 0-3, only if they genuinely help; often empty is right.\n"
        "cta: the single closing ask, as its own sentence."
    )
    trigger_line = (
        f"Trigger (real, cite it naturally): {angle.get('trigger')}"
        if angle.get("has_angle") and angle.get("trigger")
        else "NO TRIGGER FOUND. Write a clean, direct, useful email with no invented context. "
             "Lead with the pain hypothesis instead."
    )
    user_text = (
        f"Prospect: {lead.get('first_name', '')}, {lead.get('title', '')} at {lead.get('company', '')}\n"
        f"What we sell: {offer}\n"
        f"Goal of this email: {goal}\n"
        f"{trigger_line}\n"
        f"Angle: {angle.get('angle')}\n"
        f"Their likely pain: {angle.get('pain_hypothesis')}"
    )
    return await _chain_call(
        system, user_text,
        required=["subject", "paragraphs", "cta"],
        max_tokens=900,
    )


# ----------------------------- Step 4: Humanise --------------------------------
async def humanise(draft: Dict[str, Any], lead: Dict[str, Any],
                    tone: str) -> Dict[str, Any]:
    system = (
        "You rewrite cold emails so they read like one person typing to another, not like "
        "marketing. Keep every fact and the same structure — you are changing voice, not content. "
        "Cut hedging, cut adverbs, cut anything an AI would write. Contractions are good. "
        "Vary sentence length. If a sentence could appear in any email to any company, rewrite it "
        "or delete it.\n"
        'STRICT JSON only: {"subject": str, "paragraphs": [str, ...], "bullets": [str, ...], '
        '"cta": str, "changes": [str, ...]}\n'
        "changes = a short list of what you altered and why."
    )
    user_text = (
        f"Tone: {tone}\n"
        f"Writing to: {lead.get('first_name', '')} ({lead.get('title', '')})\n\n"
        f"DRAFT:\n{json.dumps({k: draft.get(k) for k in ('subject', 'paragraphs', 'bullets', 'cta')}, ensure_ascii=False)}"
    )
    return await _chain_call(
        system, user_text,
        required=["subject", "paragraphs", "cta"],
        max_tokens=900,
    )


# ----------------------------- Assembly ----------------------------------------
def _esc(s: str) -> str:
    return (str(s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


# Cold-email typography, not marketing-template chrome. A branded header/logo/
# button-style CTA reads as a mass blast and measurably hurts reply rates and
# deliverability (it also trips more spam filters than a plain-looking message).
# The fix for "looks very basic" is proper inline-styled typography — a real
# font stack, controlled line-height and paragraph spacing — not a template.
# Inline styles are required: mail clients ignore <style> blocks and external
# CSS, and default browser/client margins on bare <p>/<ul> vary wildly.
_FONT_STACK = "-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,Helvetica,sans-serif"
_TEXT_COLOR = "#1a1a1a"
_MUTED_COLOR = "#666666"

_P_STYLE = f"margin:0 0 14px 0;font-family:{_FONT_STACK};font-size:15px;line-height:1.6;color:{_TEXT_COLOR};"
_LI_STYLE = f"margin:0 0 6px 0;font-family:{_FONT_STACK};font-size:15px;line-height:1.55;color:{_TEXT_COLOR};"
_UL_STYLE = "margin:0 0 14px 0;padding-left:22px;"
_SIG_STYLE = (f"margin:22px 0 0 0;padding-top:14px;border-top:1px solid #e5e5e5;"
              f"font-family:{_FONT_STACK};font-size:13px;line-height:1.5;color:{_MUTED_COLOR};")


def to_html(final: Dict[str, Any], signature: str = "") -> str:
    """Real HTML with real paragraphs and real typography — the plain <p> tags
    this replaced rendered with whatever margins the recipient's mail client
    felt like applying, which is what made every draft look unfinished."""
    parts: List[str] = [f'<div style="font-family:{_FONT_STACK};">']
    for p in final.get("paragraphs") or []:
        if p and str(p).strip():
            parts.append(f'<p style="{_P_STYLE}">{_esc(p)}</p>')

    bullets = [b for b in (final.get("bullets") or []) if b and str(b).strip()]
    if bullets:
        items = "".join(f'<li style="{_LI_STYLE}">{_esc(b)}</li>' for b in bullets)
        parts.append(f'<ul style="{_UL_STYLE}">{items}</ul>')

    if final.get("cta"):
        parts.append(f'<p style="{_P_STYLE}">{_esc(final["cta"])}</p>')
    if signature:
        # A signature is multi-line by nature; HTML collapses newlines, so they
        # have to become <br> or the whole block renders as one run-on line.
        sig = "<br>".join(_esc(line) for line in str(signature).splitlines() if line.strip())
        parts.append(f'<p style="{_SIG_STYLE}">{sig}</p>')
    parts.append("</div>")
    return "\n".join(parts)


def to_text(final: Dict[str, Any], signature: str = "") -> str:
    """Plain-text alternative. Every real mail client wants a multipart body, and
    a text part markedly improves deliverability on cold outbound."""
    lines: List[str] = []
    for p in final.get("paragraphs") or []:
        if p and str(p).strip():
            lines.append(str(p).strip())
            lines.append("")
    for b in (final.get("bullets") or []):
        if b and str(b).strip():
            lines.append(f"- {str(b).strip()}")
    if final.get("bullets"):
        lines.append("")
    if final.get("cta"):
        lines.append(str(final["cta"]).strip())
    if signature:
        lines += ["", signature]
    return "\n".join(lines).strip()


async def run_chain(lead: Dict[str, Any], pack: Dict[str, Any], *, offer: str,
                     goal: str = "Book a 15-minute intro call.", tone: str = "warm",
                     signature: str = "",
                     on_step=None) -> Dict[str, Any]:
    """The full chain. `on_step(name, status)` lets the UI show progress live.

    Step 1 (Research) already ran — `pack` is its output — so the chain resumes at
    Angle. Research is cached for 7 days and shared with the intent engine, which
    is why it isn't re-run per draft.
    """
    async def step(name: str):
        if on_step:
            await on_step(name)

    await step("angle")
    angle = await pick_angle(lead, pack, offer)

    await step("draft")
    draft = await write_draft(lead, angle, offer, goal)

    await step("humanise")
    final = await humanise(draft, lead, tone)

    body_html = to_html(final, signature)
    body_text = to_text(final, signature)
    subject = str(final.get("subject") or draft.get("subject") or "").strip()

    # Three distinct outcomes, and the caller must be able to tell them apart:
    #
    #   no research at all        -> has_signal False
    #   research, but no trigger  -> has_signal True,  has_angle False
    #   a real, citable trigger   -> has_signal True,  has_angle True
    #
    # Collapsing the middle case into the first would have the UI claim we found
    # nothing about a company we in fact researched — a false statement about our
    # own evidence, which is the thing this whole chain exists to avoid.
    has_signal = bool(pack.get("has_signal"))
    has_angle = bool(angle.get("has_angle"))

    if not has_signal:
        confidence = "low"
        note = "No public signals were found, so this email makes no claims about their company."
    elif not has_angle:
        confidence = "low"
        note = ("We found public information about them, but nothing that justifies a specific "
                "trigger — so the email leads with the pain hypothesis instead of a fake hook.")
    else:
        confidence = angle.get("confidence", "medium")
        note = ""

    return {
        "subject": subject,
        "body_html": body_html,
        "body_text": body_text,
        "signature": signature,
        "angle": angle,
        "changes": final.get("changes") or [],
        "confidence": confidence,
        "note": note,
        "has_signal": has_signal,
        "has_angle": has_angle,
        "eq": compute_eq(subject, body_text, lead),
    }
