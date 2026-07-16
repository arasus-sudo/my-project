"""Intent scoring — how ready is this lead to hear from us, 0-100.

Replaces `icp_score`, which was fake in every write path: hardcoded 70 on import,
`60 + len(company) % 40` elsewhere. A number derived from the length of a company
name is worse than no number, because reps trust it.

Design: a **rules + LLM hybrid**, in that order.

- Rules own the hard, checkable signals (funding, hiring, tech-stack match, news
  recency, and the lead's own engagement history). These are deterministic and
  auditable — the same inputs always produce the same score.
- One small LLM call then weighs the soft fit, bounded to ±15 so it can nudge the
  ranking but never overturn the evidence. If the model is unavailable the score
  still stands on the rules alone.

Every score carries `reasons` — a rep must be able to see *why* a lead is hot.
An unexplained number is exactly what we're replacing.
"""

import json
import logging
from typing import Any, Dict, List, Tuple

from server import db, _llm_chat, _extract_json, ANTHROPIC_API_KEY

log = logging.getLogger(__name__)

# Positive engagement is the strongest signal there is: they already replied.
ENGAGEMENT_POINTS = {"replied": 25, "clicked": 12, "opened": 5, "meeting_booked": 30}

BANDS = ((75, "hot"), (50, "warm"), (25, "cool"), (0, "cold"))


def _band(score: int) -> str:
    for floor, name in BANDS:
        if score >= floor:
            return name
    return "cold"


def _rule_score(pack: Dict[str, Any], lead: Dict[str, Any],
                 events: List[Dict[str, Any]], icp: Dict[str, Any]) -> Tuple[int, List[str]]:
    """Deterministic. Starts at a neutral floor and moves only on evidence."""
    score = 20
    reasons: List[str] = []

    if not pack.get("has_signal"):
        # No evidence is not the same as bad evidence — say so rather than
        # inventing a low score with a confident-sounding reason.
        return 15, ["No public signals found — nothing to base intent on yet."]

    sig = pack.get("signals") or {}

    if sig.get("funding"):
        score += 25
        reasons.append(f"Recent funding/M&A news: {sig['funding'][0][:90]}")
    if sig.get("hiring"):
        score += 15
        reasons.append(f"Hiring or leadership change: {sig['hiring'][0][:90]}")
    if sig.get("product"):
        score += 10
        reasons.append(f"Product or partnership news: {sig['product'][0][:90]}")

    # News at all, even untagged, means the company is doing something visible.
    news = pack.get("news") or []
    if news and not any(sig.values()):
        score += 5
        reasons.append("In the news recently, though no buying trigger detected.")

    gh = pack.get("github") or {}
    if gh.get("languages"):
        score += 5
        reasons.append(f"Active public engineering ({', '.join(gh['languages'][:3])}).")

    # ICP title match — the one firmographic check we can actually make.
    titles = [t.lower() for t in (icp.get("titles") or [])]
    lead_title = (lead.get("title") or "").lower()
    if titles and lead_title and any(t in lead_title for t in titles):
        score += 10
        reasons.append(f"Title matches your ICP ({lead.get('title')}).")

    # Their own behaviour beats anything we inferred about their company.
    seen = set()
    for e in events:
        t = e.get("type")
        if t in ENGAGEMENT_POINTS and t not in seen:
            seen.add(t)
            score += ENGAGEMENT_POINTS[t]
            reasons.append(f"Already engaged: {t.replace('_', ' ')}.")

    if (lead.get("verification") or {}).get("status") == "risky":
        score -= 10
        reasons.append("Email verification came back risky — deliverability risk.")

    if not reasons:
        # We researched them and found nothing notable. That is itself the finding,
        # and it must be stated: a score with no explanation is precisely what this
        # engine replaced.
        reasons.append("Researched, but nothing notable — no funding, hiring, or product news, "
                       "and no prior engagement.")

    return max(0, min(100, score)), reasons


async def _llm_adjustment(pack: Dict[str, Any], lead: Dict[str, Any],
                           rule_score: int) -> Tuple[int, str]:
    """Soft fit, bounded to ±15. The rules keep the final say."""
    if not ANTHROPIC_API_KEY or not pack.get("has_signal"):
        return 0, ""
    from research_worker import summarize_for_prompt

    system = (
        "You judge B2B outbound timing. Given a rules-based intent score and public research, "
        "decide whether the score should nudge up or down for reasons the rules can't see "
        "(seniority fit, obvious mismatch, stale or irrelevant news). "
        "You may adjust by at most -15 to +15. Be conservative: return 0 if unsure. "
        'STRICT JSON only: {"adjustment": int, "reason": str}'
    )
    user_text = (
        f"Rules score: {rule_score}\n"
        f"Lead: {lead.get('title', '')} at {lead.get('company', '')}\n\n"
        f"{summarize_for_prompt(pack)}"
    )
    try:
        raw = await _llm_chat(system, user_text, f"intent-{lead['id'][:8]}")
        parsed = _extract_json(raw) or {}
        adj = int(parsed.get("adjustment", 0))
        return max(-15, min(15, adj)), (parsed.get("reason") or "").strip()
    except Exception as ex:
        log.info("intent llm adjustment skipped: %s", ex)
        return 0, ""


async def score_lead(workspace_id: str, lead: Dict[str, Any],
                      pack: Dict[str, Any]) -> Dict[str, Any]:
    """Returns {score, band, reasons[], rule_score, llm_adjustment}."""
    events = await db.events.find(
        {"workspace_id": workspace_id, "lead_id": lead["id"]}, {"_id": 0, "type": 1}
    ).to_list(100)

    icp = await db.icps.find_one({"workspace_id": workspace_id}, {"_id": 0}) or {}

    rule_score, reasons = _rule_score(pack, lead, events, icp)
    adj, adj_reason = await _llm_adjustment(pack, lead, rule_score)

    final = max(0, min(100, rule_score + adj))
    if adj and adj_reason:
        reasons.append(f"{'+' if adj > 0 else ''}{adj} — {adj_reason}")

    return {
        "score": final,
        "band": _band(final),
        "reasons": reasons,
        "rule_score": rule_score,
        "llm_adjustment": adj,
    }
