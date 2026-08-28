"""Control Tower — agent registry, kill-switch, spend caps, ROI.

The suite's Discover/Govern/Secure/Measure layer (ServiceNow's 5 dimensions
adapted to our scale). Every agent is a registry row with a sponsor, an
enabled flag (kill-switch), and optional spend caps. The Observe layer lives
in observability.py (agent_traces); this module owns Govern + Measure.

Collections:
  agent_registry {id, workspace_id, agent_key, label, category, version,
                  enabled, sponsor_user_id, daily_credit_cap, monthly_credit_cap,
                  created_at, updated_at}
  agent_eval_scores are stored inline on agent_traces.eval_score (see
  observability.run_eval_sampling_tick).
"""

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from server import db, current_user, now_iso, new_id, _audit, require_role

control_router = APIRouter(prefix="/control-tower")
admin_control_router = APIRouter(prefix="/admin/control-tower")

# Canonical catalog — must stay in sync with frontend/src/components/AppLayout.jsx AGENTS.
# Adding an agent here is what makes it governable; it costs nothing until
# someone toggles it. Version is the agent's own release, not the platform's.
AGENT_CATALOG: List[Dict[str, Any]] = [
    {"key": "pitch",      "label": "Pitch EQ",      "category": "sales",      "version": "1.0", "scopes": ["read", "write", "send"]},
    {"key": "crm",        "label": "CRM",           "category": "sales",      "version": "1.0", "scopes": ["read", "write"]},
    {"key": "voice",      "label": "Voice EQ",      "category": "sales",      "version": "1.0", "scopes": ["read", "write", "send"]},
    {"key": "schedule",   "label": "Schedule EQ",   "category": "sales",      "version": "1.0", "scopes": ["read", "write"]},
    {"key": "proposal",   "label": "Proposal EQ",   "category": "sales",      "version": "1.0", "scopes": ["read", "write"]},
    {"key": "sms",        "label": "SMS EQ",        "category": "sales",      "version": "1.0", "scopes": ["read", "write", "send"]},
    {"key": "whatsapp",   "label": "WhatsApp EQ",   "category": "sales",      "version": "1.0", "scopes": ["read", "write", "send"]},
    {"key": "create",     "label": "Create EQ",     "category": "marketing",  "version": "1.0", "scopes": ["read", "write"]},
    {"key": "design",     "label": "Design EQ",     "category": "marketing",  "version": "1.0", "scopes": ["read", "write"]},
    {"key": "social",     "label": "Social EQ",     "category": "marketing",  "version": "1.0", "scopes": ["read", "write", "send"]},
    {"key": "site",       "label": "Site EQ",       "category": "marketing",  "version": "1.0", "scopes": ["read", "write"]},
    {"key": "hrms",       "label": "HRMS EQ",       "category": "operations", "version": "1.0", "scopes": ["read", "write"]},
    {"key": "accounting", "label": "Accounting EQ", "category": "operations", "version": "1.0", "scopes": ["read", "write"]},
    {"key": "projects",   "label": "Projects",      "category": "operations", "version": "1.0", "scopes": ["read", "write"]},
    {"key": "command",    "label": "Command EQ",    "category": "operations", "version": "1.0", "scopes": ["read", "write"]},
    {"key": "knowledge",  "label": "Knowledge",     "category": "operations", "version": "1.0", "scopes": ["read", "write"]},
]


async def ensure_registry(workspace_id: str) -> None:
    """Seed missing catalog entries for this workspace (idempotent)."""
    existing = {r["agent_key"] async for r in db.agent_registry.find({"workspace_id": workspace_id}, {"agent_key": 1, "_id": 0})}
    to_insert = []
    for a in AGENT_CATALOG:
        if a["key"] not in existing:
            to_insert.append({
                "id": new_id(), "workspace_id": workspace_id,
                "agent_key": a["key"], "label": a["label"], "category": a["category"],
                "version": a["version"], "scopes": a["scopes"],
                "enabled": True, "sponsor_user_id": None,
                "daily_credit_cap": None, "monthly_credit_cap": None,
                "created_at": now_iso(), "updated_at": now_iso(),
            })
    if to_insert:
        await db.agent_registry.insert_many(to_insert)


async def is_agent_enabled(workspace_id: str, agent_key: str) -> bool:
    """Kill-switch check — call before dispatching an agent's work."""
    doc = await db.agent_registry.find_one({"workspace_id": workspace_id, "agent_key": agent_key}, {"enabled": 1})
    if doc is None:
        return True  # not yet seeded → enabled by default
    return bool(doc.get("enabled", True))


class ToggleIn(BaseModel):
    enabled: bool

class SponsorIn(BaseModel):
    sponsor_user_id: Optional[str] = None

class CapIn(BaseModel):
    daily_credit_cap: Optional[int] = None
    monthly_credit_cap: Optional[int] = None

class EvalReport(BaseModel):
    eval_score: int
    eval_reason: str = ""


# ----------------------------- Workspace-scoped --------------------------------
@control_router.get("/agents")
async def list_agents(user=Depends(current_user)):
    await ensure_registry(user["workspace_id"])
    rows = await db.agent_registry.find(
        {"workspace_id": user["workspace_id"]}, {"_id": 0}
    ).sort("agent_key", 1).to_list(100)
    # enrich sponsor names
    sponsor_ids = {r["sponsor_user_id"] for r in rows if r.get("sponsor_user_id")}
    names = {}
    if sponsor_ids:
        async for u in db.users.find({"id": {"$in": list(sponsor_ids)}}, {"_id": 0, "id": 1, "name": 1, "email": 1}):
            names[u["id"]] = u.get("name") or u.get("email")
    for r in rows:
        r["sponsor_name"] = names.get(r.get("sponsor_user_id"))
    return rows


@control_router.post("/agents/{agent_key}/toggle")
async def toggle_agent(agent_key: str, body: ToggleIn, user=Depends(require_role("org_admin"))):
    await ensure_registry(user["workspace_id"])
    if agent_key not in {a["key"] for a in AGENT_CATALOG}:
        raise HTTPException(404, "unknown agent")
    await db.agent_registry.update_one(
        {"workspace_id": user["workspace_id"], "agent_key": agent_key},
        {"$set": {"enabled": body.enabled, "updated_at": now_iso()}},
    )
    await _audit(user, "control_tower.toggle", {"agent_key": agent_key, "enabled": body.enabled})
    return {"ok": True, "agent_key": agent_key, "enabled": body.enabled}


@control_router.post("/agents/{agent_key}/sponsor")
async def set_sponsor(agent_key: str, body: SponsorIn, user=Depends(require_role("org_admin"))):
    await ensure_registry(user["workspace_id"])
    if agent_key not in {a["key"] for a in AGENT_CATALOG}:
        raise HTTPException(404, "unknown agent")
    if body.sponsor_user_id:
        u = await db.users.find_one({"id": body.sponsor_user_id, "workspace_id": user["workspace_id"]}, {"_id": 0, "id": 1})
        if not u:
            raise HTTPException(404, "user not found in workspace")
    await db.agent_registry.update_one(
        {"workspace_id": user["workspace_id"], "agent_key": agent_key},
        {"$set": {"sponsor_user_id": body.sponsor_user_id, "updated_at": now_iso()}},
    )
    return {"ok": True}


@control_router.post("/agents/{agent_key}/cap")
async def set_cap(agent_key: str, body: CapIn, user=Depends(require_role("org_admin"))):
    await ensure_registry(user["workspace_id"])
    if agent_key not in {a["key"] for a in AGENT_CATALOG}:
        raise HTTPException(404, "unknown agent")
    await db.agent_registry.update_one(
        {"workspace_id": user["workspace_id"], "agent_key": agent_key},
        {"$set": {"daily_credit_cap": body.daily_credit_cap,
                  "monthly_credit_cap": body.monthly_credit_cap,
                  "updated_at": now_iso()}},
    )
    return {"ok": True}


# ----------------------------- Traces & ROI ------------------------------------
@control_router.get("/traces")
async def list_traces(limit: int = 50, agent: Optional[str] = None, user=Depends(current_user)):
    from observability import get_trace_summary
    # summary for header cards + recent spans for table
    summary = await get_trace_summary(user["workspace_id"], limit=min(limit, 200))
    # optionally filter recent by agent before returning
    if agent:
        summary["recent"] = [r for r in summary["recent"] if r.get("gen_ai_agent_name") == agent]
    return summary


@control_router.get("/traces/{trace_id}")
async def get_trace(trace_id: str, user=Depends(current_user)):
    rows = await db.agent_traces.find(
        {"workspace_id": user["workspace_id"], "trace_id": trace_id}, {"_id": 0}
    ).sort("at", 1).to_list(100)
    if not rows:
        raise HTTPException(404, "trace not found")
    return rows


@control_router.get("/roi")
async def roi_dashboard(user=Depends(current_user)):
    """Minutes-saved estimate per agent × volume, joined from credit_ledger.

    Estimates are intentionally conservative (Assumes<1 min per email draft would
    be dishonest). Priced as wall-clock time a human would have spent:
      email_draft_chain 25 min, proposal_generate 90 min, carousel_generate 60 min,
      voice_call_minute 1 min (the call itself), lead_research 15 min, etc.
    ROI $ = minutes_saved × blended $/min (from workspace plan or default $0.50).
    """
    wid = user["workspace_id"]
    TIME_SAVED_MIN: Dict[str, int] = {
        "email_draft_chain": 25, "proposal_generate": 90, "carousel_generate": 60,
        "design_generate": 45, "ai_image": 10, "lead_research": 15, "lead_enrichment": 5,
        "social_draft": 15, "meeting_prep_brief": 10, "intent_score": 2,
        "voice_call_minute": 1, "project_create": 30, "command_turn": 5,
    }
    # aggregate credit_ledger by action (already workspace-scoped)
    from billing import CREDIT_COSTS
    ledger = await db.credit_ledger.find(
        {"workspace_id": wid, "delta": {"$lt": 0}}, {"_id": 0, "action": 1, "delta": 1}
    ).to_list(10000)
    by_action: Dict[str, Dict[str, Any]] = {}
    total_credits_spent = 0
    total_minutes_saved = 0
    for r in ledger:
        a = r.get("action") or "unknown"
        c = abs(int(r.get("delta", 0)))
        total_credits_spent += c
        entry = by_action.setdefault(a, {"action": a, "calls": 0, "credits_spent": 0, "minutes_saved": 0})
        entry["calls"] += 1
        entry["credits_spent"] += c
        mins = TIME_SAVED_MIN.get(a, 0)
        entry["minutes_saved"] += mins
        total_minutes_saved += mins
    # blended $/min — use plan's implied rate or fallback
    from billing import get_plan
    from server import db as _db
    acct = await _db.credit_accounts.find_one({"workspace_id": wid}, {"_id": 0, "plan_id": 1})
    plan = get_plan((acct or {}).get("plan_id", "trial"))
    # $ per credit implied by plan price / credits; floor at $0.01
    rate_per_credit = (plan.get("price_monthly", 0) / max(1, plan.get("credits", 500))) if plan.get("credits") else 0.01
    rate_per_credit = max(rate_per_credit, 0.01)
    total_saved_usd = round(total_minutes_saved * 0.5, 2)  # $0.50/min blended human cost
    return {
        "total_credits_spent": total_credits_spent,
        "total_minutes_saved": total_minutes_saved,
        "total_saved_usd": total_saved_usd,
        "rate_per_credit_used": round(rate_per_credit, 4),
        "by_action": sorted(by_action.values(), key=lambda x: -x["minutes_saved"]),
    }


# ----------------------------- Suite-admin global view -------------------------
@admin_control_router.get("/agents")
async def admin_list_agents(workspace_id: Optional[str] = None, user=Depends(require_role("org_admin"))):
    # reuse _is_admin gate via require_role("org_admin") + _is_admin bypass already handles suite_admin;
    # for true global view we allow any admin to query any workspace when workspace_id is passed
    from server import _is_admin
    if workspace_id and not _is_admin(user):
        raise HTTPException(403, "suite admin only for cross-workspace view")
    q: Dict[str, Any] = {}
    if workspace_id:
        q["workspace_id"] = workspace_id
        await ensure_registry(workspace_id)
        rows = await db.agent_registry.find(q, {"_id": 0}).sort("agent_key", 1).to_list(100)
        return rows
    # no workspace filter → aggregate counts across workspaces
    pipeline = [
        {"$group": {"_id": "$agent_key", "total": {"$sum": 1}, "enabled": {"$sum": {"$cond": ["$enabled", 1, 0]}}}},
        {"$sort": {"_id": 1}},
    ]
    return await db.agent_registry.aggregate(pipeline).to_list(100)


# ----------------------------- Eval sampling tick ------------------------------
async def run_eval_sampling_tick(limit: int = 20) -> int:
    """Sample recent traces without eval_score and LLM-as-judge them.

    Heuristic fallback when no LLM key is configured: score by output length
    (empty → 0, otherwise 70). Real judge uses a 0-100 rubric: grounded,
    concise, actionable.
    """
    from server import _llm_chat, _extract_json, _llm_configured
    cursor = db.agent_traces.find(
        {"eval_score": None}, {"_id": 0}
    ).sort("at", -1).limit(limit)
    docs = await cursor.to_list(limit)
    if not docs:
        return 0
    scored = 0
    for d in docs:
        if not _llm_configured():
            score = 0 if not d.get("gen_ai_tool_name") else 70
            reason = "heuristic (no LLM key)"
        else:
            try:
                raw = await _llm_chat(
                    "You are an agent-output judge. Score this span 0-100 on grounded+concise+actionable. "
                    "STRICT JSON only: {\"score\": int, \"reason\": str}",
                    f"agent={d.get('gen_ai_agent_name')} tool={d.get('gen_ai_tool_name')} "
                    f"status={d.get('status')} latency={d.get('latency_ms')}ms",
                    f"eval-{d['id']}", max_tokens=200,
                )
                parsed = _extract_json(raw) or {}
                score = max(0, min(100, int(parsed.get("score", 70))))
                reason = str(parsed.get("reason", ""))[:200]
            except Exception:
                score, reason = 70, "judge unavailable"
        await db.agent_traces.update_one(
            {"id": d["id"]}, {"$set": {"eval_score": score, "eval_reason": reason}})
        scored += 1
    return scored
