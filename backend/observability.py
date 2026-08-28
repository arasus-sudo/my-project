"""Observability — OTel GenAI-aligned traces for every LLM call.

Single choke point: every LLM call goes through server._llm_chat, which now
emits a trace span here. Spans follow the June 2026 OTel GenAI semantic
conventions (gen_ai.* namespace) so any compliant backend can read them.

Storage is Mongo (agent_traces collection) for v1 — cheap, already multi-tenant,
and queryable from the Control Tower page. No OTLP exporter yet; the schema
is intentionally OTel-shaped so exporting later is a transform, not a rewrite.

Trace hierarchy for a command turn:
  trace_id (one per user request / _llm_chat call)
  └─ span: gen_ai.operation.name = "chat" | "tool"
     attrs: gen_ai.system, gen_ai.request.model, gen_ai.response.model,
            gen_ai.usage.input_tokens/output_tokens, gen_ai.agent.name,
            gen_ai.tool.name, latency_ms, status, error
"""

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from server import db, now_iso, new_id


def _new_trace_id() -> str:
    return uuid.uuid4().hex

def _new_span_id() -> str:
    return uuid.uuid4().hex[:16]

async def record_genai_span(
    workspace_id: Optional[str],
    user_id: Optional[str],
    gen_ai_system: str = "unknown",
    gen_ai_operation: str = "chat",
    gen_ai_request_model: str = "",
    gen_ai_response_model: str = "",
    gen_ai_agent_name: Optional[str] = None,
    gen_ai_tool_name: Optional[str] = None,
    input_tokens: int = 0,
    output_tokens: int = 0,
    latency_ms: int = 0,
    status: str = "ok",
    error: Optional[str] = None,
    trace_id: Optional[str] = None,
    parent_span_id: Optional[str] = None,
    session_id: Optional[str] = None,
) -> str:
    """Best-effort — a metering bug must never break the LLM call it measures."""
    if not workspace_id:
        return trace_id or ""
    try:
        tid = trace_id or _new_trace_id()
        sid = _new_span_id()
        doc: Dict[str, Any] = {
            "id": new_id(),
            "trace_id": tid,
            "span_id": sid,
            "parent_span_id": parent_span_id,
            "workspace_id": workspace_id,
            "user_id": user_id,
            "gen_ai_system": gen_ai_system,
            "gen_ai_operation": gen_ai_operation,
            "gen_ai_request_model": gen_ai_request_model,
            "gen_ai_response_model": gen_ai_response_model,
            "gen_ai_agent_name": gen_ai_agent_name,
            "gen_ai_tool_name": gen_ai_tool_name,
            "gen_ai_usage_input_tokens": int(input_tokens or 0),
            "gen_ai_usage_output_tokens": int(output_tokens or 0),
            "latency_ms": int(latency_ms or 0),
            "status": status,
            "error": (error or "")[:500] if error else None,
            "session_id": session_id,
            "at": now_iso(),
        }
        await db.agent_traces.insert_one(doc)
        return tid
    except Exception:
        return trace_id or ""


async def get_trace_summary(workspace_id: str, limit: int = 100) -> Dict[str, Any]:
    """Aggregated view for the Control Tower — last N spans with rollups."""
    rows = await db.agent_traces.find(
        {"workspace_id": workspace_id}, {"_id": 0}
    ).sort("at", -1).to_list(limit)
    by_agent: Dict[str, Dict[str, Any]] = {}
    by_model: Dict[str, Dict[str, Any]] = {}
    total_in = total_out = 0
    for r in rows:
        total_in += r.get("gen_ai_usage_input_tokens", 0)
        total_out += r.get("gen_ai_usage_output_tokens", 0)
        a = r.get("gen_ai_agent_name") or "unknown"
        ag = by_agent.setdefault(a, {"agent": a, "calls": 0, "errors": 0, "latency_ms": 0})
        ag["calls"] += 1
        if r.get("status") == "error":
            ag["errors"] += 1
        ag["latency_ms"] += r.get("latency_ms", 0)
        m = r.get("gen_ai_request_model") or "unknown"
        mo = by_model.setdefault(m, {"model": m, "calls": 0})
        mo["calls"] += 1
    for ag in by_agent.values():
        ag["avg_latency_ms"] = round(ag["latency_ms"] / max(1, ag["calls"]))
        del ag["latency_ms"]
    return {
        "total_spans": len(rows),
        "total_input_tokens": total_in,
        "total_output_tokens": total_out,
        "by_agent": sorted(by_agent.values(), key=lambda x: -x["calls"]),
        "by_model": sorted(by_model.values(), key=lambda x: -x["calls"]),
        "recent": rows[:20],
    }
