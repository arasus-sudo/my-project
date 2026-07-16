"""The proposal draft chain: Solution Fit → Scope → Pricing → Risks → Executive Summary.

Runs on top of the Context Pack (already built and cached), so no step re-does
research. Every step goes through `draft_chain._chain_call`, inheriting strict-JSON
validation and 429 backoff — which is exactly what the old single `_research_and_draft`
call lacked (it failed silently to placeholder text).

The Pricing step is the one that matters most for correctness. The LLM never writes
a price. It only *selects* catalog line items and quantities; every number in the
resulting table is computed in Python from the structured pricing catalog. This is
the doc's hard rule: "Pricing tables MUST come from a structured pricing config, not
from LLM free-form output."

Honesty: the Context Pack lists what's missing, and each step is told to write
"[needs input: …]" rather than invent a fact it doesn't have.
"""

import logging
import re
from typing import Any, Dict, List, Optional

from draft_chain import _chain_call, ChainError  # strict-JSON step runner + backoff
from context_pack import summarize_for_prompt

log = logging.getLogger(__name__)


# ----------------------------- Deterministic pricing ----------------------------
def compute_pricing(catalog: List[Dict[str, Any]], selections: List[Dict[str, Any]],
                    discount_pct: float = 0.0, currency: str = "USD") -> Dict[str, Any]:
    """Turn LLM selections into a real priced table. All arithmetic here, never the
    model. An unknown catalog id is dropped rather than guessed."""
    by_id = {c["id"]: c for c in catalog}
    line_items: List[Dict[str, Any]] = []
    for sel in selections:
        item = by_id.get(sel.get("catalog_id"))
        if not item:
            continue
        qty = max(1, int(sel.get("qty", 1) or 1))
        unit_price = float(item.get("unit_price", 0) or 0)
        line_items.append({
            "catalog_id": item["id"],
            "name": item["name"],
            "description": item.get("description", ""),
            "unit": item.get("unit", ""),
            "qty": qty,
            "unit_price": round(unit_price, 2),
            "line_total": round(qty * unit_price, 2),
        })

    subtotal = round(sum(li["line_total"] for li in line_items), 2)
    discount_pct = max(0.0, min(100.0, float(discount_pct or 0)))
    discount = round(subtotal * discount_pct / 100.0, 2)
    total = round(subtotal - discount, 2)
    return {
        "line_items": line_items,
        "subtotal": subtotal,
        "discount_pct": discount_pct,
        "discount": discount,
        "total": total,
        "currency": (line_items and line_items[0].get("currency")) or currency,
    }


def pricing_numbers(pricing: Dict[str, Any]) -> set:
    """The set of money figures that legitimately appear in a priced table — used
    to police that the prose never introduces a number the table doesn't contain."""
    nums = set()
    for li in pricing.get("line_items", []):
        nums.add(round(float(li["unit_price"]), 2))
        nums.add(round(float(li["line_total"]), 2))
        nums.add(float(li["qty"]))
    for k in ("subtotal", "discount", "total"):
        if pricing.get(k) is not None:
            nums.add(round(float(pricing[k]), 2))
    return nums


def scrub_prose_of_stray_prices(text: str, allowed: set) -> str:
    """Belt-and-braces: strip any $-amount from prose that isn't a real table figure.
    The prompt already forbids it; this guarantees it even if the model slips."""
    def repl(m):
        raw = m.group(0)
        val = float(re.sub(r"[^\d.]", "", raw) or 0)
        return raw if round(val, 2) in allowed else "the figure below"
    return re.sub(r"\$\s?[\d,]+(?:\.\d{1,2})?", repl, text or "")


# ----------------------------- Steps ------------------------------------------
async def _solution_fit(pack_summary: str, service: str, offer: str) -> Dict[str, Any]:
    system = (
        "You are Proposal EQ, writing the 'solution fit' of a B2B proposal. Ground every claim in "
        "the provided context. Where a needed fact is marked MISSING, write '[needs input: <what>]' "
        "instead of inventing it.\n"
        'STRICT JSON only: {"paragraphs": [str, str], "key_points": [str, str, str]}\n'
        "paragraphs: exactly 2 paragraphs, each UNDER 45 words, on how we solve their specific "
        "problem. key_points: 3 crisp bullets, each under 12 words. No pricing, no invented client "
        "facts. Keep it tight — brevity is the point."
    )
    user = f"Service type: {service}\nWhat we sell: {offer}\n\nCONTEXT:\n{pack_summary}"
    return await _chain_call(system, user, required=["paragraphs", "key_points"], max_tokens=1100)


async def _scope(pack_summary: str, service: str, solution: Dict[str, Any]) -> Dict[str, Any]:
    system = (
        "You are Proposal EQ, writing the scope of work. Build on the solution already drafted.\n"
        'STRICT JSON only: {"overview": str, "in_scope": [str], "out_of_scope": [str], '
        '"deliverables": [str], "timeline": [{"phase": str, "duration": str, "detail": str}]}\n'
        "in_scope/out_of_scope: 3-5 items each. deliverables: concrete artifacts. "
        "timeline: 2-4 phases. No pricing. Mark unknowns as [needs input: …]."
    )
    user = (f"Service type: {service}\n\nSOLUTION:\n{solution.get('paragraphs')}\n\n"
            f"CONTEXT:\n{pack_summary}")
    return await _chain_call(
        system, user,
        required=["overview", "in_scope", "deliverables", "timeline"], max_tokens=1100)


async def _pricing(pack_summary: str, service: str, catalog: List[Dict[str, Any]],
                   scope: Dict[str, Any]) -> Dict[str, Any]:
    """The LLM selects; Python prices."""
    if not catalog:
        return {"selections": [], "discount_pct": 0, "pricing_notes":
                "[needs input: add items to your pricing catalog to populate this table]"}

    menu = "\n".join(
        f'- id={c["id"]} | {c["name"]} | {c.get("unit_price", 0)} {c.get("currency", "USD")}'
        f'{("/" + c["unit"]) if c.get("unit") else ""} | {c.get("description", "")[:80]}'
        for c in catalog[:40])
    system = (
        "You are Proposal EQ, assembling a pricing table. You may ONLY choose from the catalog "
        "below and set quantities. You must NOT state, invent, or compute any price, subtotal, or "
        "total — those are calculated separately from the catalog. Your prose must contain no "
        "dollar amounts.\n"
        'STRICT JSON only: {"selections": [{"catalog_id": str, "qty": int, "rationale": str}], '
        '"discount_pct": number, "pricing_notes": str}\n'
        "Pick the items that fit the scope. pricing_notes: 1-2 sentences framing the investment "
        "WITHOUT any numbers. discount_pct: 0 unless the context clearly warrants one."
    )
    user = (f"Service type: {service}\n\nCATALOG:\n{menu}\n\n"
            f"SCOPE:\n{scope.get('overview', '')}\nDeliverables: {scope.get('deliverables', [])}\n\n"
            f"CONTEXT:\n{pack_summary}")
    return await _chain_call(
        system, user, required=["selections", "pricing_notes"], max_tokens=800)


async def _risks(pack_summary: str, service: str, scope: Dict[str, Any]) -> Dict[str, Any]:
    system = (
        "You are Proposal EQ, writing risks, assumptions and engagement terms. Base risks on the "
        "actual scope and any objections in the context — do not invent generic ones.\n"
        'STRICT JSON only: {"risks": [str], "assumptions": [str], "terms": [str]}\n'
        "risks: 2-4. assumptions: 2-4. terms: 3-5 short engagement terms (payment schedule, "
        "validity, change control). Mark unknowns as [needs input: …]."
    )
    user = f"Service type: {service}\n\nSCOPE:\n{scope.get('overview', '')}\n\nCONTEXT:\n{pack_summary}"
    return await _chain_call(system, user, required=["risks", "assumptions", "terms"], max_tokens=800)


async def _exec_summary(pack_summary: str, solution: Dict[str, Any], scope: Dict[str, Any],
                        pricing: Dict[str, Any]) -> Dict[str, Any]:
    """Written last so it can summarise the whole proposal."""
    total_line = (f"Total investment: {pricing.get('total')} {pricing.get('currency', 'USD')}"
                  if pricing.get("line_items") else "Pricing: see the investment section")
    system = (
        "You are Proposal EQ, writing the executive summary — the first thing the buyer reads. "
        "Tight, confident, specific to them. You MAY reference the total investment figure given "
        "below verbatim, but introduce no other numbers.\n"
        'STRICT JSON only: {"paragraphs": [str, str], "headline": str}\n'
        "headline: one line. paragraphs: 2 short paragraphs."
    )
    user = (f"{total_line}\n\nSOLUTION:\n{solution.get('paragraphs')}\n\n"
            f"SCOPE OVERVIEW:\n{scope.get('overview', '')}\n\nCONTEXT:\n{pack_summary}")
    return await _chain_call(system, user, required=["paragraphs", "headline"], max_tokens=900)


# ----------------------------- HTML assembly ----------------------------------
def _esc(s: Any) -> str:
    return (str(s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def _paras(items: List[str]) -> str:
    return "".join(f"<p>{_esc(p)}</p>" for p in items if str(p).strip())


def _ul(items: List[str]) -> str:
    lis = "".join(f"<li>{_esc(i)}</li>" for i in items if str(i).strip())
    return f"<ul>{lis}</ul>" if lis else ""


def _slot_html(slot: str, chain: Dict[str, Any]) -> str:
    """Render one template slot to HTML from the chain output."""
    sol = chain.get("solution_fit", {})
    scope = chain.get("scope", {})
    risks = chain.get("risks", {})
    ex = chain.get("executive_summary", {})
    pricing = chain.get("pricing_table", {})

    if slot == "executive_summary":
        head = f"<p><strong>{_esc(ex.get('headline'))}</strong></p>" if ex.get("headline") else ""
        return head + _paras(ex.get("paragraphs", []))
    if slot == "solution_fit":
        return _paras(sol.get("paragraphs", [])) + _ul(sol.get("key_points", []))
    if slot == "scope":
        html = f"<p>{_esc(scope.get('overview'))}</p>" if scope.get("overview") else ""
        if scope.get("in_scope"):
            html += "<p><strong>In scope</strong></p>" + _ul(scope["in_scope"])
        if scope.get("out_of_scope"):
            html += "<p><strong>Out of scope</strong></p>" + _ul(scope["out_of_scope"])
        return html
    if slot == "deliverables":
        return _ul(scope.get("deliverables", []))
    if slot == "timeline":
        rows = ""
        for ph in scope.get("timeline", []):
            rows += (f"<p><strong>{_esc(ph.get('phase'))}</strong> "
                     f"<em>{_esc(ph.get('duration'))}</em><br>{_esc(ph.get('detail'))}</p>")
        return rows
    if slot == "risks":
        html = ""
        if risks.get("risks"):
            html += "<p><strong>Risks</strong></p>" + _ul(risks["risks"])
        if risks.get("assumptions"):
            html += "<p><strong>Assumptions</strong></p>" + _ul(risks["assumptions"])
        return html
    if slot == "terms":
        return _ul(risks.get("terms", []))
    if slot == "pricing_table":
        # The table itself is structured data rendered by the serializers; the HTML
        # slot carries only the (number-free) framing note.
        note = pricing.get("notes", "")
        return f"<p>{_esc(note)}</p>" if note else ""
    return ""


async def run(pack: Dict[str, Any], template: Dict[str, Any], *, service: str,
              offer: str, catalog: List[Dict[str, Any]], on_step=None) -> Dict[str, Any]:
    """Run the full chain and assemble sections per the template's slots.

    Returns {sections:[{key,heading,slot,html}], pricing:{...structured...}, chain, missing}.
    """
    async def step(name: str):
        if on_step:
            await on_step(name)

    summary = summarize_for_prompt(pack)

    await step("solution")
    solution = await _solution_fit(summary, service, offer)

    await step("scope")
    scope = await _scope(summary, service, solution)

    await step("pricing")
    sel = await _pricing(summary, service, catalog, scope)
    pricing = compute_pricing(catalog, sel.get("selections", []),
                              discount_pct=sel.get("discount_pct", 0))
    allowed = pricing_numbers(pricing)
    pricing["notes"] = scrub_prose_of_stray_prices(sel.get("pricing_notes", ""), allowed)

    await step("risks")
    risks = await _risks(summary, service, scope)

    await step("exec")
    ex = await _exec_summary(summary, solution, scope, pricing)

    chain = {
        "solution_fit": solution, "scope": scope, "pricing_table": pricing,
        "risks": risks, "executive_summary": ex,
    }

    sections = []
    for sec in template.get("sections", []):
        sections.append({
            "key": sec["key"], "heading": sec["heading"], "slot": sec["slot"],
            "html": _slot_html(sec["slot"], chain),
        })

    return {"sections": sections, "pricing": pricing, "chain": chain,
            "missing": pack.get("missing", [])}
