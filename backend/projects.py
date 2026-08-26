"""Projects — agentic work management for the suite (Notion/ClickUp tier).

A general-purpose workspace for tracking work: kanban/list views, task
priorities, assignees, due dates, subtasks, dependencies, tags, and threaded
comments. Deliberately separate from CRM's lead-scoped tasks (`lead_tasks`)
and from Create/Design EQ's generated artifacts — this is where a team plans
and runs work that spans every agent.

Design rules this module follows:
- Spoke-module pattern like every other domain (router mounted in server.py).
- Multi-tenant by construction: every query carries workspace_id.
- Soft-delete projects (recoverable), hard-delete tasks/comments.
- Per-project task numbers ("WR-12") from a monotonically incremented seq.
- AI actions charge credits through billing.charge_credits; plain CRUD is free
  — reading and organizing your own work is never metered.
"""

import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from server import db, current_user, now_iso, new_id, _audit, require_role
from billing import charge_credits

projects_router = APIRouter(prefix="/projects")

NOT_DELETED = {"deleted_at": None}


def _active(workspace_id: str, **extra) -> Dict[str, Any]:
    return {"workspace_id": workspace_id, **NOT_DELETED, **extra}


# ----------------------------- Vocabulary -------------------------------------
DEFAULT_STATUSES = ["backlog", "todo", "in_progress", "review", "done"]
DONE_STATUS = "done"

PRIORITIES = ["low", "medium", "high", "urgent"]


def _valid_statuses(statuses: Optional[List[str]]) -> List[str]:
    """A workflow is 2-6 lowercase slug stages, unique, containing 'done'."""
    if not statuses:
        return list(DEFAULT_STATUSES)
    cleaned = [s.strip().lower().replace(" ", "_") for s in statuses if s and s.strip()]
    if not 2 <= len(cleaned) <= 6 or len(set(cleaned)) != len(cleaned):
        raise HTTPException(400, "Workflow needs 2-6 unique statuses")
    if DONE_STATUS not in cleaned:
        cleaned.append(DONE_STATUS)
    return cleaned


def _slug_key(name: str) -> str:
    """Short stable task prefix from the project name: 'Website Redesign' ->
    'WR', 'Q1 Growth Push' -> 'QGP'. Falls back to alphanumerics of the name.
    Pure function; collisions between projects are fine — the key only has to
    be readable inside one board."""
    words = [w for w in re.split(r"[^A-Za-z0-9]+", (name or "").strip()) if w]
    if len(words) >= 2:
        key = "".join(w[0] for w in words[:3])
    elif words:
        key = words[0][:3]
    else:
        key = "PRJ"
    return key.upper()


def _clean_tags(tags: Optional[List[str]]) -> List[str]:
    out: List[str] = []
    for t in tags or []:
        t = t.strip()
        if t and t.lower() not in [x.lower() for x in out]:
            out.append(t[:40])
    return out[:10]


def _overdue(task: Dict[str, Any], now_str: str) -> bool:
    """ISO date strings compare correctly as plain strings (UTC, same format)."""
    return bool(task.get("due_at")) and not task.get("completed_at") \
        and task["due_at"] < now_str


def _task_stats(tasks: List[Dict[str, Any]], now_str: str) -> Dict[str, Any]:
    done = sum(1 for t in tasks if t.get("status") == DONE_STATUS)
    by_status: Dict[str, int] = {}
    for t in tasks:
        by_status[t.get("status", "todo")] = by_status.get(t.get("status", "todo"), 0) + 1
    return {
        "total": len(tasks),
        "open": len(tasks) - done,
        "done": done,
        "overdue": sum(1 for t in tasks if _overdue(t, now_str)),
        "by_status": by_status,
    }


# ----------------------------- Models -----------------------------------------
class ProjectIn(BaseModel):
    name: str
    description: str = ""
    statuses: Optional[List[str]] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    statuses: Optional[List[str]] = None


class TaskIn(BaseModel):
    title: str
    description: str = ""
    status: str = "todo"
    priority: str = "medium"
    assignee_id: Optional[str] = None
    due_at: Optional[str] = None
    start_at: Optional[str] = None
    estimated_hours: Optional[float] = None
    parent_task_id: Optional[str] = None
    depends_on: List[str] = []
    tags: List[str] = []


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    assignee_id: Optional[str] = None
    due_at: Optional[str] = None
    start_at: Optional[str] = None
    estimated_hours: Optional[float] = None
    depends_on: Optional[List[str]] = None
    tags: Optional[List[str]] = None
    order: Optional[float] = None   # manual ordering within a column


class CommentIn(BaseModel):
    task_id: str
    body: str


class FromTemplateIn(BaseModel):
    template_key: str
    name: str
    description: str = ""


async def _get_project(workspace_id: str, pid: str) -> Dict[str, Any]:
    p = await db.projects.find_one(_active(workspace_id, id=pid), {"_id": 0})
    if not p:
        raise HTTPException(404, "project not found")
    return p


async def _enrich_assignees(items: List[Dict[str, Any]]) -> None:
    ids = {it["assignee_id"] for it in items if it.get("assignee_id")}
    if not ids:
        return
    users = await db.users.find({"id": {"$in": list(ids)}}, {"_id": 0, "id": 1, "name": 1}).to_list(None)
    names = {u["id"]: u.get("name") for u in users}
    for it in items:
        if it.get("assignee_id"):
            it["assignee_name"] = names.get(it["assignee_id"])


# ----------------------------- Built-in templates ------------------------------
# Small, opinionated starts — the plan's adoption driver. Keys are stable API.
PROJECT_TEMPLATES: List[Dict[str, Any]] = [
    {
        "key": "sprint",
        "name": "Sprint",
        "blurb": "A two-week sprint with the standard ceremony tasks.",
        "tasks": [
            {"title": "Plan sprint — pick and size the work", "priority": "high"},
            {"title": "Daily standup notes", "priority": "medium"},
            {"title": "Mid-sprint scope check", "priority": "medium"},
            {"title": "Demo & review with stakeholders", "priority": "high"},
            {"title": "Retrospective — what to change next sprint", "priority": "medium"},
        ],
    },
    {
        "key": "campaign_launch",
        "name": "Campaign launch",
        "blurb": "Everything around taking an outbound campaign live.",
        "tasks": [
            {"title": "Finalize lead list & suppressions", "priority": "high"},
            {"title": "Approve email copy for every step", "priority": "high"},
            {"title": "Warm up mailboxes / check caps", "priority": "urgent"},
            {"title": "Launch & monitor first-day sends", "priority": "high"},
            {"title": "Review open/reply rates after 72h", "priority": "medium"},
        ],
    },
    {
        "key": "content_calendar",
        "name": "Content calendar",
        "blurb": "A month of social content from idea to published.",
        "tasks": [
            {"title": "Pick the month's themes", "priority": "high"},
            {"title": "Draft posts week 1", "priority": "medium"},
            {"title": "Draft posts week 2", "priority": "medium"},
            {"title": "Design assets (Create/Design EQ)", "priority": "medium"},
            {"title": "Queue for approval & schedule", "priority": "high"},
            {"title": "Review engagement at month end", "priority": "low"},
        ],
    },
]


# ----------------------------- Projects ----------------------------------------
@projects_router.get("")
async def list_projects(user=Depends(current_user)):
    """All projects in the workspace, newest first, each with live task counts."""
    wid = user["workspace_id"]
    projects = await db.projects.find(_active(wid), {"_id": 0}) \
        .sort("created_at", -1).to_list(200)
    now_str = now_iso()
    for p in projects:
        tasks = await db.project_tasks.find(
            {"workspace_id": wid, "project_id": p["id"]},
            {"_id": 0, "status": 1, "due_at": 1, "completed_at": 1},
        ).to_list(5000)
        p["stats"] = _task_stats(tasks, now_str)
    return projects


@projects_router.post("")
async def create_project(body: ProjectIn, user=Depends(current_user)):
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(400, "Project name is required")
    await charge_credits(user["workspace_id"], "project_create")
    doc = {
        "id": new_id(), "workspace_id": user["workspace_id"],
        "name": name[:120], "description": (body.description or "").strip()[:2000],
        "key": _slug_key(name),
        "statuses": _valid_statuses(body.statuses),
        "task_seq": 0,
        "created_by": user["id"], "created_by_name": user.get("name") or user.get("email"),
        "deleted_at": None, "created_at": now_iso(),
    }
    await db.projects.insert_one(doc)
    doc.pop("_id", None)
    await _audit(user, "projects.create", {"project_id": doc["id"], "name": name})
    return doc


@projects_router.get("/templates")
async def list_templates():
    """The built-in starter templates (public shape — no workspace data)."""
    return PROJECT_TEMPLATES


@projects_router.post("/from-template")
async def create_from_template(body: FromTemplateIn, user=Depends(current_user)):
    """Create a project pre-filled with a template's starter tasks."""
    tpl = next((t for t in PROJECT_TEMPLATES if t["key"] == body.template_key), None)
    if not tpl:
        raise HTTPException(404, "unknown template")
    project = await create_project(ProjectIn(name=body.name, description=body.description), user)
    wid = user["workspace_id"]
    docs = []
    for t in tpl["tasks"]:
        await db.projects.update_one({"id": project["id"]}, {"$inc": {"task_seq": 1}})
        proj = await db.projects.find_one({"id": project["id"]}, {"_id": 0, "task_seq": 1})
        docs.append({
            "id": new_id(), "workspace_id": wid, "project_id": project["id"],
            "number": proj["task_seq"], "title": t["title"], "description": "",
            "status": "todo", "priority": t.get("priority", "medium"),
            "assignee_id": None, "due_at": None, "start_at": None,
            "estimated_hours": None, "parent_task_id": None, "depends_on": [],
            "tags": ["template"], "order": float(proj["task_seq"]),
            "created_by": user["id"], "created_at": now_iso(),
            "updated_at": now_iso(), "completed_at": None,
        })
    if docs:
        await db.project_tasks.insert_many([dict(d) for d in docs])
    await _audit(user, "projects.from_template",
                 {"project_id": project["id"], "template": body.template_key, "tasks": len(docs)})
    project["stats"] = _task_stats(docs, now_iso())
    return project


@projects_router.get("/{pid}")
async def get_project(pid: str, user=Depends(current_user)):
    p = await _get_project(user["workspace_id"], pid)
    tasks = await db.project_tasks.find(
        {"workspace_id": user["workspace_id"], "project_id": pid}, {"_id": 0}) \
        .sort("number", 1).to_list(5000)
    p["stats"] = _task_stats(tasks, now_iso())
    return p


@projects_router.put("/{pid}")
async def update_project(pid: str, body: ProjectUpdate, user=Depends(current_user)):
    await _get_project(user["workspace_id"], pid)
    updates: Dict[str, Any] = {}
    if body.name is not None:
        name = body.name.strip()
        if not name:
            raise HTTPException(400, "Project name cannot be empty")
        updates["name"] = name[:120]
    if body.description is not None:
        updates["description"] = body.description.strip()[:2000]
    if body.statuses is not None:
        updates["statuses"] = _valid_statuses(body.statuses)
    if not updates:
        raise HTTPException(400, "No fields to update")
    updates["updated_at"] = now_iso()
    await db.projects.update_one(_active(user["workspace_id"], id=pid), {"$set": updates})
    return await _get_project(user["workspace_id"], pid)


@projects_router.delete("/{pid}")
async def delete_project(pid: str, user=Depends(require_role("org_admin", "campaign_manager"))):
    r = await db.projects.update_one(
        _active(user["workspace_id"], id=pid),
        {"$set": {"deleted_at": now_iso(), "deleted_by": user["id"]}},
    )
    if r.modified_count == 0:
        raise HTTPException(404, "project not found")
    await _audit(user, "projects.delete", {"project_id": pid})
    return {"ok": True}


# ----------------------------- Tasks -------------------------------------------
@projects_router.get("/{pid}/tasks")
async def list_tasks(
    pid: str,
    status: Optional[str] = None,
    assignee_id: Optional[str] = None,
    tag: Optional[str] = None,
    q: Optional[str] = None,
    user=Depends(current_user),
):
    await _get_project(user["workspace_id"], pid)
    query: Dict[str, Any] = {"workspace_id": user["workspace_id"], "project_id": pid}
    if status:
        query["status"] = status
    if assignee_id:
        query["assignee_id"] = assignee_id
    if tag:
        query["tags"] = tag
    if q:
        query["$or"] = [
            {"title": {"$regex": re.escape(q.strip()), "$options": "i"}},
            {"description": {"$regex": re.escape(q.strip()), "$options": "i"}},
        ]
    tasks = await db.project_tasks.find(query, {"_id": 0}) \
        .sort([("order", 1), ("number", 1)]).to_list(5000)
    await _enrich_assignees(tasks)
    # Comment counts per task (one query; boards render the badge per card).
    comment_counts: Dict[str, int] = {}
    task_ids = [t["id"] for t in tasks]
    if task_ids:
        async for row in db.project_comments.find(
            {"workspace_id": user["workspace_id"], "task_id": {"$in": task_ids}},
            {"_id": 0, "task_id": 1},
        ):
            comment_counts[row["task_id"]] = comment_counts.get(row["task_id"], 0) + 1
    for t in tasks:
        t["comment_count"] = comment_counts.get(t["id"], 0)
    return tasks


@projects_router.post("/{pid}/tasks")
async def create_task(pid: str, body: TaskIn, user=Depends(current_user)):
    project = await _get_project(user["workspace_id"], pid)
    title = (body.title or "").strip()
    if not title:
        raise HTTPException(400, "Task title is required")
    if body.status not in project["statuses"]:
        raise HTTPException(400, f"Unknown status '{body.status}' for this project")
    if body.priority not in PRIORITIES:
        raise HTTPException(400, f"Priority must be one of {PRIORITIES}")

    proj_doc = await db.projects.find_one_and_update(
        {"id": pid, "workspace_id": user["workspace_id"]},
        {"$inc": {"task_seq": 1}}, return_document=True,
    )
    now_str = now_iso()
    doc = {
        "id": new_id(), "workspace_id": user["workspace_id"], "project_id": pid,
        "number": proj_doc["task_seq"], "key": project.get("key", "PRJ"),
        "title": title[:300], "description": (body.description or "").strip()[:10000],
        "status": body.status, "priority": body.priority,
        "assignee_id": body.assignee_id, "due_at": body.due_at, "start_at": body.start_at,
        "estimated_hours": body.estimated_hours,
        "parent_task_id": body.parent_task_id, "depends_on": body.depends_on or [],
        "tags": _clean_tags(body.tags),
        "order": float(proj_doc["task_seq"]),
        "created_by": user["id"], "created_at": now_str,
        "updated_at": now_str,
        "completed_at": now_str if body.status == DONE_STATUS else None,
    }
    await db.project_tasks.insert_one(doc)
    doc.pop("_id", None)
    return doc


@projects_router.put("/{pid}/tasks/{tid}")
async def update_task(pid: str, tid: str, body: TaskUpdate, user=Depends(current_user)):
    project = await _get_project(user["workspace_id"], pid)
    existing = await db.project_tasks.find_one(
        {"id": tid, "workspace_id": user["workspace_id"], "project_id": pid}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "task not found")

    updates: Dict[str, Any] = {}
    data = body.model_dump(exclude_none=True)
    if "title" in data:
        title = data["title"].strip()
        if not title:
            raise HTTPException(400, "Task title cannot be empty")
        updates["title"] = title[:300]
    if "description" in data:
        updates["description"] = data["description"].strip()[:10000]
    if "status" in data:
        if data["status"] not in project["statuses"]:
            raise HTTPException(400, f"Unknown status '{data['status']}' for this project")
        updates["status"] = data["status"]
        # completed_at tracks the transition, not the payload's honesty.
        if data["status"] == DONE_STATUS and not existing.get("completed_at"):
            updates["completed_at"] = now_iso()
        elif data["status"] != DONE_STATUS:
            updates["completed_at"] = None
    if "priority" in data:
        if data["priority"] not in PRIORITIES:
            raise HTTPException(400, f"Priority must be one of {PRIORITIES}")
        updates["priority"] = data["priority"]
    for k in ("assignee_id", "due_at", "start_at", "estimated_hours", "order"):
        if k in data:
            updates[k] = data[k]
    if "depends_on" in data:
        updates["depends_on"] = data["depends_on"] or []
    if "tags" in data:
        updates["tags"] = _clean_tags(data["tags"])

    if not updates:
        raise HTTPException(400, "No fields to update")
    updates["updated_at"] = now_iso()
    await db.project_tasks.update_one({"id": tid}, {"$set": updates})

    task = await db.project_tasks.find_one({"id": tid}, {"_id": 0})
    await _enrich_assignees([task])
    # Moving into Done is worth an audit trail entry; column jiggles are not.
    if updates.get("status") == DONE_STATUS and existing.get("status") != DONE_STATUS:
        await _audit(user, "projects.task_done",
                     {"project_id": pid, "task_id": tid, "number": task.get("number")})
    return task


@projects_router.delete("/{pid}/tasks/{tid}")
async def delete_task(pid: str, tid: str, user=Depends(current_user)):
    """Hard-deletes a task and any of its subtasks. Column history lives in the
    audit log; nothing else references task ids outside this project."""
    r = await db.project_tasks.delete_one(
        {"id": tid, "workspace_id": user["workspace_id"], "project_id": pid})
    if r.deleted_count == 0:
        raise HTTPException(404, "task not found")
    await db.project_tasks.delete_many({"parent_task_id": tid})
    await db.project_comments.delete_many({"task_id": tid})
    return {"ok": True}


# ----------------------------- Comments ----------------------------------------
@projects_router.get("/{pid}/comments")
async def list_comments(pid: str, task_id: str, user=Depends(current_user)):
    await _get_project(user["workspace_id"], pid)
    return await db.project_comments.find(
        {"workspace_id": user["workspace_id"], "project_id": pid, "task_id": task_id},
        {"_id": 0},
    ).sort("created_at", 1).to_list(500)


@projects_router.post("/{pid}/comments")
async def add_comment(pid: str, body: CommentIn, user=Depends(current_user)):
    text = (body.body or "").strip()
    if not text:
        raise HTTPException(400, "Comment cannot be empty")
    task = await db.project_tasks.find_one(
        {"id": body.task_id, "workspace_id": user["workspace_id"], "project_id": pid},
        {"_id": 0, "id": 1})
    if not task:
        raise HTTPException(404, "task not found")
    doc = {
        "id": new_id(), "workspace_id": user["workspace_id"], "project_id": pid,
        "task_id": body.task_id, "author_id": user["id"],
        "author_name": user.get("name") or user.get("email"),
        "body": text[:4000], "created_at": now_iso(),
    }
    await db.project_comments.insert_one(doc)
    doc.pop("_id", None)
    await db.project_tasks.update_one(
        {"id": body.task_id}, {"$set": {"updated_at": now_iso()}})
    return doc
