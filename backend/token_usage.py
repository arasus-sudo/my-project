"""Token usage & cost tracking — meters actual LLM token consumption per call so
we can see real $ cost per workspace/agent/model, independent of the flat
credit prices customers are charged in billing.py. Purely additive: this never
gates a request and never changes what a customer pays — see CREDIT_COSTS in
billing.py for that. It exists so the business can see the true cost-to-serve
behind each flat-priced action, and re-tune those prices with real data.

Logging is best-effort — a metering bug must never take down the LLM call
it's measuring.
"""

from typing import Any, Dict, Optional

from server import db, now_iso, new_id

# $ per million tokens. Anthropic rates are current published API pricing.
# Perplexity/OpenAI rates are best-known estimates, NOT verified against a live
# price list the way the Anthropic ones are — confirm against your actual
# provider invoice and correct here if they've drifted.
PRICING_PER_MILLION: Dict[str, Dict[str, float]] = {
    "claude-opus-5": {"input": 5.00, "output": 25.00},
    "claude-sonnet-5": {"input": 3.00, "output": 15.00},
    "claude-sonnet-4-6": {"input": 3.00, "output": 15.00},
    "claude-sonnet-4-5": {"input": 3.00, "output": 15.00},
    "claude-haiku-4-5": {"input": 1.00, "output": 5.00},
    "sonar-pro": {"input": 3.00, "output": 15.00},  # Perplexity — unverified, confirm against invoice
}
# Fallback for any model not in the table above — priced at Sonnet-tier rather
# than silently going uncounted.
DEFAULT_PRICING = {"input": 3.00, "output": 15.00}


def _cost_usd(model: str, input_tokens: int, output_tokens: int) -> float:
    rates = PRICING_PER_MILLION.get(model, DEFAULT_PRICING)
    return (max(0, input_tokens) * rates["input"] + max(0, output_tokens) * rates["output"]) / 1_000_000


async def record_llm_usage(
    workspace_id: Optional[str],
    model: str,
    input_tokens: int,
    output_tokens: int,
    agent: Optional[str] = None,
    action: Optional[str] = None,
) -> None:
    if not workspace_id:
        return
    try:
        await db.token_usage_log.insert_one({
            "id": new_id(), "workspace_id": workspace_id, "model": model,
            "agent": agent, "action": action,
            "input_tokens": int(input_tokens or 0), "output_tokens": int(output_tokens or 0),
            "cost_usd": _cost_usd(model, input_tokens or 0, output_tokens or 0),
            "at": now_iso(),
        })
    except Exception:
        pass


async def get_platform_token_usage_summary(limit: int = 20000) -> Dict[str, Any]:
    """Platform-wide real LLM cost, broken down per workspace — this is the
    business's own COGS visibility (suite-admin only). Never surface this to a
    workspace's own org_admin: it reveals what a customer actually costs us to
    serve, not something we show the customer."""
    rows = await db.token_usage_log.find({}, {"_id": 0}).sort("at", -1).to_list(limit)
    if not rows:
        return {"total_cost_usd": 0.0, "total_calls": 0, "by_workspace": [], "by_model": []}

    ws_ids = {r["workspace_id"] for r in rows}
    workspaces = await db.workspaces.find(
        {"id": {"$in": list(ws_ids)}}, {"_id": 0, "id": 1, "name": 1}
    ).to_list(len(ws_ids))
    ws_names = {w["id"]: w.get("name", w["id"]) for w in workspaces}

    by_workspace: Dict[str, Dict[str, Any]] = {}
    by_model: Dict[str, Dict[str, Any]] = {}
    total_cost = 0.0
    for r in rows:
        total_cost += r["cost_usd"]
        wid = r["workspace_id"]
        w = by_workspace.setdefault(wid, {
            "workspace_id": wid, "workspace_name": ws_names.get(wid, wid),
            "cost_usd": 0.0, "calls": 0,
        })
        w["cost_usd"] += r["cost_usd"]
        w["calls"] += 1

        m = by_model.setdefault(r["model"], {"model": r["model"], "cost_usd": 0.0, "calls": 0})
        m["cost_usd"] += r["cost_usd"]
        m["calls"] += 1

    return {
        "total_cost_usd": round(total_cost, 4),
        "total_calls": len(rows),
        "by_workspace": sorted(
            [{**w, "cost_usd": round(w["cost_usd"], 4)} for w in by_workspace.values()],
            key=lambda x: -x["cost_usd"],
        ),
        "by_model": sorted(
            [{**m, "cost_usd": round(m["cost_usd"], 4)} for m in by_model.values()],
            key=lambda x: -x["cost_usd"],
        ),
    }


async def get_token_usage_summary(workspace_id: str, limit: int = 5000) -> Dict[str, Any]:
    """Actual $ cost of LLM usage — for internal cost visibility (true margin
    per action/agent), separate from the flat credits shown to the customer."""
    rows = await db.token_usage_log.find(
        {"workspace_id": workspace_id}, {"_id": 0}
    ).sort("at", -1).to_list(limit)

    by_model: Dict[str, Dict[str, Any]] = {}
    by_agent: Dict[str, Dict[str, Any]] = {}
    total_cost = 0.0
    total_input = 0
    total_output = 0
    for r in rows:
        total_cost += r["cost_usd"]
        total_input += r["input_tokens"]
        total_output += r["output_tokens"]

        m = by_model.setdefault(r["model"], {
            "model": r["model"], "cost_usd": 0.0, "input_tokens": 0, "output_tokens": 0, "calls": 0,
        })
        m["cost_usd"] += r["cost_usd"]
        m["input_tokens"] += r["input_tokens"]
        m["output_tokens"] += r["output_tokens"]
        m["calls"] += 1

        agent = r.get("agent") or "other"
        a = by_agent.setdefault(agent, {"agent": agent, "cost_usd": 0.0, "calls": 0})
        a["cost_usd"] += r["cost_usd"]
        a["calls"] += 1

    return {
        "total_cost_usd": round(total_cost, 4),
        "total_input_tokens": total_input,
        "total_output_tokens": total_output,
        "total_calls": len(rows),
        "by_model": sorted(
            [{**m, "cost_usd": round(m["cost_usd"], 4)} for m in by_model.values()],
            key=lambda x: -x["cost_usd"],
        ),
        "by_agent": sorted(
            [{**a, "cost_usd": round(a["cost_usd"], 4)} for a in by_agent.values()],
            key=lambda x: -x["cost_usd"],
        ),
    }
