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
    "gpt-4o-mini": {"input": 0.15, "output": 0.60},  # OpenAI — unverified, confirm against invoice
}
# Fallback for any model not in the table above — priced at Sonnet-tier rather
# than silently going uncounted.
DEFAULT_PRICING = {"input": 3.00, "output": 15.00}

# Flat $ per image — image generation doesn't bill per input/output text token
# the way chat completions do, so it's tracked as a per-call cost instead.
# Estimates, not verified against a live provider price list — confirm against
# your actual OpenAI/Gemini invoice and correct here if they've drifted.
IMAGE_PRICING_PER_CALL: Dict[str, float] = {
    "gpt-image-1": 0.04,
    "nano-banana": 0.02,  # Gemini 3.1 Flash Image Preview
}
DEFAULT_IMAGE_PRICING = 0.03


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
    user_id: Optional[str] = None,
) -> None:
    if not workspace_id:
        return
    try:
        await db.token_usage_log.insert_one({
            "id": new_id(), "workspace_id": workspace_id, "user_id": user_id, "model": model,
            "agent": agent, "action": action,
            "input_tokens": int(input_tokens or 0), "output_tokens": int(output_tokens or 0),
            "cost_usd": _cost_usd(model, input_tokens or 0, output_tokens or 0),
            "at": now_iso(),
        })
    except Exception:
        pass


async def record_image_usage(
    workspace_id: Optional[str],
    provider: str,
    agent: Optional[str] = None,
    action: Optional[str] = None,
    user_id: Optional[str] = None,
) -> None:
    if not workspace_id:
        return
    try:
        await db.token_usage_log.insert_one({
            "id": new_id(), "workspace_id": workspace_id, "user_id": user_id, "model": provider,
            "agent": agent, "action": action,
            "input_tokens": 0, "output_tokens": 0,
            "cost_usd": IMAGE_PRICING_PER_CALL.get(provider, DEFAULT_IMAGE_PRICING),
            "at": now_iso(),
        })
    except Exception:
        pass


async def get_platform_token_usage_summary(limit: int = 20000) -> Dict[str, Any]:
    """Platform-wide real LLM cost, broken down per workspace/model/user — this
    is the business's own COGS visibility (suite-admin only). Never surface
    this to a workspace's own org_admin: it reveals what a customer actually
    costs us to serve, not something we show the customer."""
    rows = await db.token_usage_log.find({}, {"_id": 0}).sort("at", -1).to_list(limit)
    if not rows:
        return {"total_cost_usd": 0.0, "total_calls": 0, "by_workspace": [], "by_model": [], "by_user": []}

    ws_ids = {r["workspace_id"] for r in rows}
    workspaces = await db.workspaces.find(
        {"id": {"$in": list(ws_ids)}}, {"_id": 0, "id": 1, "name": 1}
    ).to_list(len(ws_ids))
    ws_names = {w["id"]: w.get("name", w["id"]) for w in workspaces}

    user_ids = {r["user_id"] for r in rows if r.get("user_id")}
    users = await db.users.find(
        {"id": {"$in": list(user_ids)}}, {"_id": 0, "id": 1, "name": 1, "email": 1}
    ).to_list(len(user_ids))
    user_info = {u["id"]: u for u in users}

    by_workspace: Dict[str, Dict[str, Any]] = {}
    by_model: Dict[str, Dict[str, Any]] = {}
    by_user: Dict[str, Dict[str, Any]] = {}
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

        uid = r.get("user_id")
        if uid:
            info = user_info.get(uid, {})
            u = by_user.setdefault(uid, {
                "user_id": uid, "name": info.get("name", uid), "email": info.get("email", ""),
                "workspace_id": wid, "workspace_name": ws_names.get(wid, wid),
                "cost_usd": 0.0, "calls": 0,
            })
            u["cost_usd"] += r["cost_usd"]
            u["calls"] += 1

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
        "by_user": sorted(
            [{**u, "cost_usd": round(u["cost_usd"], 4)} for u in by_user.values()],
            key=lambda x: -x["cost_usd"],
        ),
    }
