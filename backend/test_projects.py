"""Projects — spacing/vocabulary rules, template shape, and route mounting.

Pure-function tests per the suite convention: no DB required. The import-order
trick (server first) resolves the router-mount import cycle — see test_pitch_eq.py.
"""

import server  # noqa: F401  — resolves the router-mount import cycle
from projects import (
    _slug_key, _valid_statuses, _task_stats, _overdue,
    PROJECT_TEMPLATES, DEFAULT_STATUSES, DONE_STATUS,
)


# ----------------------------- Project key ------------------------------------
def test_slug_key_uses_word_initials():
    assert _slug_key("Website Redesign") == "WR"
    assert _slug_key("Q1 Growth Push") == "QGP"


def test_slug_key_falls_back_gracefully():
    assert _slug_key("Launchpad") == "LAU"
    assert _slug_key("   ") == "PRJ"
    assert _slug_key("") == "PRJ"


# ----------------------------- Workflow validation ----------------------------
def test_valid_statuses_defaults_when_missing():
    assert _valid_statuses(None) == DEFAULT_STATUSES


def test_valid_statuses_normalizes_and_appends_done():
    out = _valid_statuses(["Backlog", "In Progress"])
    assert out[0] == "backlog"
    assert "in_progress" in out
    assert out[-1] == DONE_STATUS


def test_valid_statuses_rejects_bad_shapes():
    import pytest
    from fastapi import HTTPException
    with pytest.raises(HTTPException):
        _valid_statuses(["only_one"])
    with pytest.raises(HTTPException):
        _valid_statuses(["a", "a", "b"])


# ----------------------------- Stats ------------------------------------------
def _t(status="todo", due_at=None, completed_at=None):
    return {"status": status, "due_at": due_at, "completed_at": completed_at}


def test_task_stats_counts_open_done_overdue():
    tasks = [
        _t("todo"),
        _t("in_progress", due_at="2026-01-01T00:00:00+00:00"),   # overdue
        _t("done", completed_at="2026-08-01T00:00:00+00:00"),
        _t("review", due_at="2099-01-01T00:00:00+00:00"),        # future, not overdue
    ]
    stats = _task_stats(tasks, now_str="2026-08-19T12:00:00+00:00")
    assert stats["total"] == 4
    assert stats["open"] == 3
    assert stats["done"] == 1
    assert stats["overdue"] == 1
    assert stats["by_status"] == {"todo": 1, "in_progress": 1, "done": 1, "review": 1}


def test_overdue_requires_open_status_and_past_due():
    now = "2026-08-19T12:00:00+00:00"
    assert _overdue(_t(due_at="2026-01-01T00:00:00+00:00"), now)
    assert not _overdue(_t("done", due_at="2026-01-01T00:00:00+00:00",
                           completed_at=now), now)          # completed
    assert not _overdue(_t(), now)                            # no due date


# ----------------------------- Templates --------------------------------------
def test_templates_have_stable_keys_and_clean_tasks():
    keys = {t["key"] for t in PROJECT_TEMPLATES}
    assert {"sprint", "campaign_launch", "content_calendar"} <= keys
    for t in PROJECT_TEMPLATES:
        assert t["tasks"], f"template {t['key']} has no starter tasks"
        for task in t["tasks"]:
            assert task["title"].strip()
            assert task.get("priority", "medium") in ("low", "medium", "high", "urgent")


# ----------------------------- Routes mounted ---------------------------------
def test_project_routes_are_mounted_under_api_prefix():
    schema = server.app.openapi()
    for path in ("/api/projects", "/api/projects/{pid}", "/api/projects/{pid}/tasks",
                 "/api/projects/{pid}/tasks/{tid}", "/api/projects/{pid}/comments",
                 "/api/projects/templates", "/api/projects/from-template"):
        assert path in schema["paths"], path


def test_billing_lists_project_create_cost():
    from billing import CREDIT_COSTS, ACTION_LABELS
    assert CREDIT_COSTS["project_create"] == 5
    assert ACTION_LABELS["project_create"] == "Project created"
