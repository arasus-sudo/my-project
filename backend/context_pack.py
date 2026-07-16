"""Context Pack — the normalised, LLM-facing brief for one deal.

Takes a DealContext (crm_adapters) and distils it into the compact object the
proposal chain reads. Reuses the Pitch EQ research worker for the company and its
`summarize_for_prompt()` as the anti-hallucination boundary.

The doc's rule: "Never invent CRM fields. If a field is missing, mark the section
as 'needs input' and surface it — do NOT fabricate." That is enforced here via the
`missing` list: anything the pack couldn't fill from real data is named, and the
chain is told to write "[needs input: …]" rather than make something up.

Cached 24h in `deal_context` — a deal's history barely moves within a day, and the
pack is the input to six LLM calls.
"""

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

from server import db, now_iso, new_id, _llm_chat, _extract_json, ANTHROPIC_API_KEY
import crm_adapters
import research_worker

CACHE_HOURS = 24


async def _pain_and_objections(ctx: Dict[str, Any]) -> Dict[str, List[str]]:
    """One small LLM pass over the real history to name pain points and
    objections. Grounded strictly in what's provided — an empty history yields
    empty lists, not invented concerns."""
    history_bits: List[str] = []
    for e in ctx.get("emails", [])[:8]:
        history_bits.append(f"[email/{e['direction']}] {e.get('subject', '')}: {e.get('snippet', '')}")
    for c in ctx.get("calls", [])[:5]:
        history_bits.append(f"[call] {c.get('summary', '')}")
    for a in ctx.get("timeline", [])[:10]:
        history_bits.append(f"[{a.get('agent')}] {a.get('summary', '')}")

    history = "\n".join(b for b in history_bits if b.strip())
    if not history or not ANTHROPIC_API_KEY:
        return {"pain_points": [], "objections": []}

    system = (
        "You extract, from real CRM history, the prospect's concrete pain points and any "
        "objections they've raised. Use ONLY what's in the history — if it isn't there, leave the "
        "list empty. Do not infer generic pains that aren't evidenced.\n"
        'STRICT JSON only: {"pain_points": [str], "objections": [str]}'
    )
    try:
        raw = await _llm_chat(system, history[:3000], f"ctxpack-{ctx['deal']['id'][:8]}")
        parsed = _extract_json(raw) or {}
        return {
            "pain_points": [str(p) for p in (parsed.get("pain_points") or [])][:5],
            "objections": [str(o) for o in (parsed.get("objections") or [])][:5],
        }
    except Exception:
        return {"pain_points": [], "objections": []}


def _email_summary(ctx: Dict[str, Any]) -> str:
    emails = ctx.get("emails", [])
    if not emails:
        return ""
    parts = []
    for e in emails[:6]:
        who = "They" if e.get("direction") == "inbound" else "We"
        parts.append(f"{who}: {e.get('subject', '')} — {e.get('snippet', '')}".strip(" —"))
    return " | ".join(parts)[:1200]


def _detect_missing(ctx: Dict[str, Any], research: Dict[str, Any]) -> List[str]:
    """Name the gaps rather than let the chain invent them."""
    missing = []
    client = ctx.get("client", {})
    if not client.get("company"):
        missing.append("client company name")
    if not (client.get("contacts") or []):
        missing.append("a named contact")
    if not ctx.get("emails") and not ctx.get("calls") and not ctx.get("meetings"):
        missing.append("any prior conversation history (email, call, or meeting)")
    if not research.get("has_signal"):
        missing.append("public information about the company")
    deal = ctx.get("deal", {})
    if not deal.get("value"):
        missing.append("deal value / budget")
    return missing


async def build(workspace_id: str, deal_id: str, force: bool = False) -> Dict[str, Any]:
    """Build (or return cached) the Context Pack for a deal."""
    cached = await db.deal_context.find_one(
        {"workspace_id": workspace_id, "deal_id": deal_id}, {"_id": 0})
    if cached and not force:
        try:
            age = datetime.now(timezone.utc) - datetime.fromisoformat(cached["built_at"])
            if age < timedelta(hours=CACHE_HOURS):
                return cached["pack"]
        except Exception:
            pass

    ctx = await crm_adapters.get_deal_context(workspace_id, deal_id)
    if ctx is None:
        raise ValueError("deal not found")

    lead = ctx.get("lead") or {}
    research = await research_worker.get_research(workspace_id, lead) if lead.get("id") else \
        research_worker._empty_pack(lead)

    po = await _pain_and_objections(ctx)
    pack = {
        "deal_facts": ctx["deal"],
        "client_facts": ctx["client"],
        "research": {
            "has_signal": research.get("has_signal", False),
            "summary": research_worker.summarize_for_prompt(research),
            "news": research.get("news", [])[:3],
        },
        "email_summary": _email_summary(ctx),
        "history_counts": {
            "emails": len(ctx.get("emails", [])),
            "calls": len(ctx.get("calls", [])),
            "meetings": len(ctx.get("meetings", [])),
        },
        "pain_points": po["pain_points"],
        "objections": po["objections"],
        "missing": _detect_missing(ctx, research),
        "source": ctx.get("source", "internal"),
    }

    await db.deal_context.update_one(
        {"workspace_id": workspace_id, "deal_id": deal_id},
        {"$set": {
            "id": (cached or {}).get("id") or new_id(),
            "workspace_id": workspace_id, "deal_id": deal_id,
            "pack": pack, "built_at": now_iso(),
        }},
        upsert=True,
    )
    return pack


def summarize_for_prompt(pack: Dict[str, Any]) -> str:
    """The pack as the chain sees it — trimmed, and explicit about what's missing so
    every step degrades honestly rather than inventing."""
    deal = pack.get("deal_facts", {})
    client = pack.get("client_facts", {})
    parts = [
        f"Deal: {deal.get('title', '(untitled)')} — stage {deal.get('stage', '?')}, "
        f"value {deal.get('value', 0)} {deal.get('currency', 'USD')}",
        f"Client: {client.get('company', '(unknown company)')}",
    ]
    contacts = client.get("contacts") or []
    if contacts:
        parts.append("Contact: " + ", ".join(
            f"{c.get('name', '')} ({c.get('title', '')})".strip() for c in contacts[:2]))

    if pack.get("research", {}).get("has_signal"):
        parts.append("Company research:\n" + pack["research"]["summary"])
    if pack.get("email_summary"):
        parts.append("Conversation so far: " + pack["email_summary"])
    if pack.get("pain_points"):
        parts.append("Pain points raised: " + "; ".join(pack["pain_points"]))
    if pack.get("objections"):
        parts.append("Objections raised: " + "; ".join(pack["objections"]))
    if pack.get("missing"):
        parts.append(
            "MISSING (do NOT invent these — write '[needs input: <what>]' where they'd go): "
            + "; ".join(pack["missing"]))
    return "\n".join(parts)
