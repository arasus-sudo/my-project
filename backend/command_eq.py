"""Command EQ — the conversational orchestrator over every specialist agent.

One place a user (or, via MCP, any external LLM) describes an outcome in
natural language; this module classifies intent, plans tool calls over the
suite's real handlers, executes them scoped and audited, then synthesizes an
answer. Architecture mirrors what Salesforce calls the reasoning loop and
ServiceNow the control plane — built here as a plain spoke module:

    classify → plan (strict JSON) → execute (max 6 steps) → synthesize

Design rules:
- Tools are DATA: TOOLS registry entries carry name/description/params/scope/
  runner. Adding capability = adding a registry row that wraps an existing
  handler (same dispatch style as mcp_server.py) — never new orchestration code.
- Writes are explicit registry entries with scope "write"; each write runner
  audits through the same handler-side _audit/_charge paths the UI uses.
- Every run leaves a trace (command_runs) so the control tower can observe it.
- Mocked-first honesty: with no LLM key configured, /chat says so instead of
  pretending.
"""

import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from server import (
    db, current_user, now_iso, new_id, _audit, _llm_chat, _extract_json,
    require_role,
)

command_router = APIRouter(prefix="/command")

MAX_STEPS = 6
MAX_MESSAGES_KEPT = 40


# ----------------------------- Tool registry -----------------------------------
# Runners receive (args: dict, user: dict) and return JSON-safe results. They
# call the same spoke-module handlers the REST routes use, so role gates that
# live INSIDE handlers still apply; scope="write" rows additionally get
# audited here with a command.* action.

def _build_tools() -> List[Dict[str, Any]]:
    t: List[Dict[str, Any]] = []

    def tool(name: str, description: str, params: Dict[str, str], runner,
             scope: str = "read", required: Optional[List[str]] = None):
        t.append({"name": name, "description": description, "params": params,
                  "runner": runner, "scope": scope, "required": required or []})

    # ---- read ----
    tool("workspace_search", "Search everything at once: leads, campaigns, social posts, bookings, proposals, projects.",
         {"q": "free-text query"}, None)  # placeholder replaced below

    async def _workspace_search(args, user):
        from server import global_search
        return await global_search(q=args.get("q", ""), user=user)
    t[-1]["runner"] = _workspace_search
    t[-1]["required"] = ["q"]

    async def _search_leads(args, user):
        from crm import list_leads
        return await list_leads(
            page=int(args.get("page", 1)), page_size=min(int(args.get("page_size", 10)), 50),
            search=args.get("search"), status=args.get("status"), tags=None,
            owner_id=None, band=None, sort_by=None, user=user)
    tool("search_leads", "Find leads by free-text (name/company/email/title) or pipeline status.",
         {"search": "text", "status": "new|qualified|meeting|proposal|won|lost",
          "page_size": "int"}, _search_leads)

    async def _get_lead(args, user):
        from crm import get_lead, lead_timeline
        lead = await get_lead(lead_id=args["lead_id"], user=user)
        lead["timeline"] = await lead_timeline(lead_id=args["lead_id"], user=user)
        return lead
    tool("get_lead", "Full record for one lead — profile, deal, recent timeline.",
         {"lead_id": "id"}, _get_lead, required=["lead_id"])

    async def _list_campaigns(args, user):
        from server import list_campaigns
        return await list_campaigns(user=user)
    tool("list_campaigns", "All campaigns with send/open/reply stats.", {}, _list_campaigns)

    async def _get_campaign(args, user):
        from server import get_campaign
        return await get_campaign(cid=args["campaign_id"], user=user)
    tool("get_campaign", "One campaign's steps, targeting, stats.", {"campaign_id": "id"},
         _get_campaign, required=["campaign_id"])

    async def _deals(args, user):
        from crm import list_deals
        return await list_deals(user=user)
    tool("deals_overview", "Every pipeline deal with value and stage.", {}, _deals)

    async def _analytics(args, user):
        from server import analytics_dashboard
        return await analytics_dashboard(user=user)
    tool("analytics_dashboard", "Workspace funnel totals: sent/opened/replied/bounced, pipeline value.",
         {}, _analytics)

    async def _activities(args, user):
        from server import list_activities
        return await list_activities(limit=min(int(args.get("limit", 20)), 100),
                                     agent=args.get("agent"), user=user)
    tool("recent_activities", "Latest cross-agent activity feed entries.",
         {"agent": "pitch|voice|scheduler|proposal|social", "limit": "int"}, _activities)

    async def _team(args, user):
        from server import list_team
        return await list_team(user=user)
    tool("team_overview", "Workspace members: names, emails, roles.", {}, _team)

    async def _bookings(args, user):
        from schedule_eq import list_bookings
        return await list_bookings(user=user)
    tool("bookings_upcoming", "Scheduled bookings from Schedule EQ.", {}, _bookings)

    async def _kb(args, user):
        from knowledge import kb_search
        return await kb_search(user["workspace_id"], args.get("query", ""),
                               int(args.get("k", 5)))
    tool("knowledge_search", "Semantic search over the company knowledge base (policies, notes, site content).",
         {"query": "text", "k": "int"}, _kb, required=["query"])

    async def _projects(args, user):
        from projects import list_projects
        return await list_projects(user=user)
    tool("projects_overview", "All projects with open/done/overdue task counts.", {}, _projects)

    async def _billing(args, user):
        from billing import get_subscription
        return await get_subscription(user=user)
    tool("billing_status", "Plan, credit balance, usage this cycle.", {}, _billing)

    # ---- write (audited) ----
    async def _create_lead(args, user):
        from crm import LeadIn, create_lead
        body = LeadIn(first_name=args["first_name"], email=args["email"],
                      last_name=args.get("last_name", ""), company=args.get("company", ""),
                      title=args.get("title", ""))
        lead = await create_lead(body=body, user=user)
        await db.audit_log.insert_one({
            "id": new_id(), "workspace_id": user["workspace_id"], "user_id": user["id"],
            "actor_email": user.get("email"), "action": "command.create_lead",
            "meta": {"lead_id": lead.get("id")}, "at": now_iso(),
        })
        return lead
    tool("create_lead", "Create a new lead. Write action.",
         {"first_name": "str", "email": "str", "last_name": "str", "company": "str", "title": "str"},
         _create_lead, scope="write", required=["first_name", "email"])

    async def _add_note(args, user):
        from crm import LeadNoteIn, add_lead_note
        return await add_lead_note(args["lead_id"], body=LeadNoteIn(text=args["text"]), user=user)
    tool("add_lead_note", "Append a note to a lead's record. Write action.",
         {"lead_id": "id", "text": "str"}, _add_note, scope="write", required=["lead_id", "text"])

    async def _create_project(args, user):
        from projects import ProjectIn, create_project
        return await create_project(body=ProjectIn(name=args["name"],
                                                   description=args.get("description", "")), user=user)
    tool("create_project", "Create a Projects board. Write action (costs project_create credits).",
         {"name": "str", "description": "str"}, _create_project, scope="write", required=["name"])

    async def _create_task(args, user):
        from projects import TaskIn, create_task
        return await create_task(args["project_id"], body=TaskIn(
            title=args["title"], priority=args.get("priority", "medium"),
            due_at=args.get("due_at")), user=user)
    tool("create_project_task", "Add a task to a project board. Write action.",
         {"project_id": "id", "title": "str", "priority": "low|medium|high|urgent", "due_at": "ISO date"},
         _create_task, scope="write", required=["project_id", "title"])

    return t


TOOLS = _build_tools()
TOOLS_BY_NAME = {t["name"]: t for t in TOOLS}


def _tools_block() -> str:
    lines = []
    for t in TOOLS:
        params = ", ".join(f"{k}:{v}" for k, v in t["params"].items()) or "none"
        req = f" REQUIRED:{','.join(t['required'])}" if t["required"] else ""
        lines.append(f"- {t['name']} [{t['scope']}] ({params}){req}\n    {t['description']}")
    return "\n".join(lines)


# ----------------------------- Models ------------------------------------------
class ChatIn(BaseModel):
    message: str
    session_id: Optional[str] = None


# ----------------------------- Sessions ----------------------------------------
async def _get_session(workspace_id: str, sid: str, user_id: str) -> Dict[str, Any]:
    s = await db.command_sessions.find_one(
        {"id": sid, "workspace_id": workspace_id, "user_id": user_id}, {"_id": 0})
    if not s:
        raise HTTPException(404, "session not found")
    return s


def _conversation_text(messages: List[Dict[str, Any]]) -> str:
    out = []
    for m in messages[-10:]:
        who = "USER" if m["role"] == "user" else "ASSISTANT"
        body = m.get("content") or ""
        if m.get("tools_used"):
            body += f" [tools: {', '.join(m['tools_used'])}]"
        out.append(f"{who}: {body}")
    return "\n".join(out)


# ----------------------------- Routes ------------------------------------------
@command_router.post("/chat")
async def chat(body: ChatIn, user=Depends(current_user)):
    """One orchestrated turn. Charges command_turn credits per executed turn."""
    message = (body.message or "").strip()
    if not message:
        raise HTTPException(400, "message is required")

    wid = user["workspace_id"]
    if body.session_id:
        session = await _get_session(wid, body.session_id, user["id"])
    else:
        session = {
            "id": new_id(), "workspace_id": wid, "user_id": user["id"],
            "title": message[:70], "messages": [], "created_at": now_iso(),
            "updated_at": now_iso(),
        }
        await db.command_sessions.insert_one(dict(session))

    messages = session.get("messages", [])
    messages.append({"role": "user", "content": message, "at": now_iso()})
    messages = messages[-MAX_MESSAGES_KEPT:]

    from billing import charge_credits, CREDIT_COSTS
    llm_ready = True
    try:
        import server as _srv
        llm_ready = bool(getattr(_srv, "ANTHROPIC_API_KEY", "") or
                         getattr(_srv, "PERPLEXITY_API_KEY", ""))
    except Exception:
        llm_ready = False
    if not llm_ready:
        answer = ("The LLM backend isn't configured for this deployment yet, so I can't "
                  "plan or reason right now. Everything else in the suite works normally.")
        messages.append({"role": "assistant", "content": answer, "tools_used": [],
                         "mode": "unconfigured", "at": now_iso()})
        await db.command_sessions.update_one(
            {"id": session["id"]}, {"$set": {"messages": messages, "updated_at": now_iso()}})
        return {"session_id": session["id"], "answer": answer, "steps": [], "mode": "unconfigured"}

    await charge_credits(wid, "command_turn")

    # 1) Plan
    system = (
        "You are Command EQ, the orchestrator of the Innoira Agentic Suite. You are given "
        "the workspace's conversation and a catalog of tools. Decide the topic, then either "
        "ask one clarifying question (when a REQUIRED parameter is genuinely missing and "
        "cannot be inferred) or emit a short step plan using ONLY cataloged tools.\n"
        f"TODAY: {datetime.now(timezone.utc).date().isoformat()}\n"
        "TOOLS CATALOG:\n" + _tools_block() +
        '\nSTRICT JSON ONLY, exactly one of:\n'
        '{"topic":"<area>","question":"<one clarifying question>"}\n'
        '{"topic":"<area>","steps":[{"tool":"<name>","args":{...}}, ...]}'
        "\nRules: max 5 steps; args must be concrete values from the conversation "
        "(never placeholders); prefer fewer, read-only steps; never invent tool names."
    )
    try:
        raw = await _llm_chat(system, _conversation_text(messages[:-1]) + f"\nUSER: {message}",
                              f"cmd-{session['id']}", max_tokens=1100)
        plan = _extract_json(raw) or {}
    except Exception as ex:
        raise HTTPException(502, f"planner unavailable: {ex}")

    if plan.get("question"):
        answer = str(plan["question"])[:600]
        messages.append({"role": "assistant", "content": answer, "tools_used": [],
                         "mode": "question", "at": now_iso()})
        await db.command_sessions.update_one(
            {"id": session["id"]}, {"$set": {"messages": messages, "updated_at": now_iso()}})
        await db.command_runs.insert_one({
            "id": new_id(), "workspace_id": wid, "user_id": user["id"],
            "session_id": session["id"], "mode": "question",
            "steps": [], "created_at": now_iso(),
        })
        return {"session_id": session["id"], "answer": answer, "steps": [], "mode": "question"}

    # 2) Execute
    step_results: List[Dict[str, Any]] = []
    for step in (plan.get("steps") or [])[:MAX_STEPS]:
        name = step.get("tool")
        spec = TOOLS_BY_NAME.get(name)
        t0 = datetime.now(timezone.utc)
        if not spec:
            step_results.append({"tool": str(name)[:40], "status": "error",
                                 "excerpt": "unknown tool"})
            continue
        if spec["scope"] == "write" and user.get("role") not in ("org_admin", "campaign_manager"):
            step_results.append({"tool": name, "status": "denied",
                                 "excerpt": "write actions need org_admin/campaign_manager"})
            continue
        args = step.get("args") or {}
        missing = [r for r in spec["required"] if not args.get(r)]
        if missing:
            step_results.append({"tool": name, "status": "skipped",
                                 "excerpt": f"missing required args: {missing}"})
            continue
        try:
            result = await spec["runner"](args, user)
            excerpt = json.dumps(result, default=str)[:1500]
            step_results.append({"tool": name, "status": "ok", "excerpt": excerpt})
        except HTTPException as he:
            step_results.append({"tool": name, "status": "error",
                                 "excerpt": str(he.detail)[:300]})
        except Exception as ex:
            step_results.append({"tool": name, "status": "error", "excerpt": str(ex)[:300]})
        finally:
            step_results[-1]["latency_ms"] = int((datetime.now(timezone.utc) - t0).total_seconds() * 1000)

    # 3) Synthesize
    synth_system = (
        "You complete Command EQ turns. Answer the user's request directly and concisely "
        "using ONLY these tool results (JSON). Cite concrete numbers/names from them; if a "
        "step errored, say so plainly for that part."
    )
    try:
        answer = (await _llm_chat(synth_system,
                                  f"USER REQUEST: {message}\n\nTOOL RESULTS:\n"
                                  + json.dumps(step_results, default=str),
                                  f"cmd-{session['id']}", max_tokens=800)).strip()
    except Exception:
        ok = [s for s in step_results if s["status"] == "ok"]
        answer = (f"Completed {len(ok)}/{len(step_results)} steps. "
                  + "; ".join(f"{s['tool']}: {s['excerpt'][:200]}" for s in ok))[:1500]

    tools_used = [s["tool"] for s in step_results]
    messages.append({"role": "assistant", "content": answer, "tools_used": tools_used,
                     "mode": "executed", "at": now_iso()})
    await db.command_sessions.update_one(
        {"id": session["id"]},
        {"$set": {"messages": messages[-MAX_MESSAGES_KEPT:], "updated_at": now_iso()}})
    await db.command_runs.insert_one({
        "id": new_id(), "workspace_id": wid, "user_id": user["id"],
        "session_id": session["id"], "mode": "executed",
        "topic": str(plan.get("topic", ""))[:40],
        "steps": [{"tool": s["tool"], "status": s["status"],
                   "latency_ms": s.get("latency_ms")} for s in step_results],
        "created_at": now_iso(),
    })
    await _audit(user, "command.run", {"session_id": session["id"],
                                       "tools": tools_used,
                                       "statuses": [s["status"] for s in step_results]})
    return {"session_id": session["id"], "answer": answer,
            "steps": [{"tool": s["tool"], "status": s["status"]} for s in step_results],
            "mode": "executed"}


@command_router.get("/sessions")
async def list_sessions(user=Depends(current_user)):
    return await db.command_sessions.find(
        {"workspace_id": user["workspace_id"], "user_id": user["id"]},
        {"_id": 0, "messages": 0},
    ).sort("updated_at", -1).to_list(50)


@command_router.get("/sessions/{sid}")
async def get_session(sid: str, user=Depends(current_user)):
    return await _get_session(user["workspace_id"], sid, user["id"])


@command_router.delete("/sessions/{sid}")
async def delete_session(sid: str, user=Depends(current_user)):
    r = await db.command_sessions.delete_one(
        {"id": sid, "workspace_id": user["workspace_id"], "user_id": user["id"]})
    if r.deleted_count == 0:
        raise HTTPException(404, "not found")
    await db.command_runs.delete_many({"session_id": sid})
    return {"ok": True}


@command_router.get("/tools")
async def list_tools(_: Any = Depends(require_role("org_admin"))):
    """The live tool catalog — what the orchestrator may do. Control-tower view."""
    return [{"name": t["name"], "description": t["description"],
             "scope": t["scope"], "params": t["params"]} for t in TOOLS]
