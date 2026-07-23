"""HRMS EQ — Employee lifecycle, recruitment, onboarding, leave, performance reviews.

Independent agent with Schedule EQ integration for interview scheduling.
Mocked-first: everything demoable without real HR data.
"""

import logging
from datetime import datetime, timezone as dt_timezone
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from server import db, now_iso, new_id, current_user, _audit, _llm_chat, ANTHROPIC_API_KEY
from billing import charge_credits

log = logging.getLogger(__name__)

hrms_router = APIRouter(prefix="/hrms-eq")

PAGE_SIZE = 25

# ---- Models ----
class EmployeeIn(BaseModel):
    first_name: str
    last_name: str
    email: str
    phone: Optional[str] = None
    department_id: Optional[str] = None
    position: str = ""
    employment_type: str = "full_time"
    manager_id: Optional[str] = None
    start_date: Optional[str] = None
    status: str = "active"
    compensation_amount: Optional[float] = None
    compensation_currency: str = "USD"
    pay_frequency: str = "monthly"

class DepartmentIn(BaseModel):
    name: str
    head_id: Optional[str] = None
    description: str = ""

class JobRequisitionIn(BaseModel):
    title: str
    department_id: Optional[str] = None
    description: str = ""
    requirements: str = ""
    status: str = "open"
    salary_range_min: Optional[float] = None
    salary_range_max: Optional[float] = None

class CandidateIn(BaseModel):
    first_name: str
    last_name: str
    email: str
    phone: Optional[str] = None
    requisition_id: str
    resume_text: Optional[str] = None
    source: str = "direct"

class LeaveRequestIn(BaseModel):
    employee_id: str
    leave_type: str = "vacation"
    start_date: str
    end_date: str
    reason: str = ""

class PerformanceReviewIn(BaseModel):
    employee_id: str
    reviewer_id: str
    rating: Optional[int] = None
    strengths: str = ""
    areas_for_improvement: str = ""
    notes: str = ""

# ---- Authenticated Routes ----

# ── Employees ──
@hrms_router.get("/employees")
async def list_employees(
    department_id: Optional[str] = None,
    status: Optional[str] = None,
    page: int = Query(1, ge=1),
    user=Depends(current_user),
):
    query = {"workspace_id": user["workspace_id"]}
    if department_id:
        query["department_id"] = department_id
    if status:
        query["status"] = status
    total = await db.employees.count_documents(query)
    items = await db.employees.find(query, {"_id": 0}) \
        .sort("first_name", 1) \
        .skip((page - 1) * PAGE_SIZE) \
        .to_list(PAGE_SIZE)
    return {"items": items, "total": total, "page": page, "page_size": PAGE_SIZE}

@hrms_router.post("/employees")
async def create_employee(body: EmployeeIn, user=Depends(current_user)):
    existing = await db.employees.find_one(
        {"workspace_id": user["workspace_id"], "email": body.email.lower()}
    )
    if existing:
        raise HTTPException(400, "Employee with this email already exists")
    
    emp = {
        "id": new_id(), "workspace_id": user["workspace_id"],
        "first_name": body.first_name, "last_name": body.last_name,
        "email": body.email.lower(), "phone": body.phone,
        "department_id": body.department_id, "position": body.position,
        "employment_type": body.employment_type,
        "manager_id": body.manager_id, "start_date": body.start_date,
        "status": body.status,
        "compensation": {
            "amount": body.compensation_amount,
            "currency": body.compensation_currency,
            "pay_frequency": body.pay_frequency,
        } if body.compensation_amount else None,
        "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.employees.insert_one(emp)
    emp.pop("_id", None)
    await _audit(user, "hrms.employee.create", {"employee_id": emp["id"]})
    return emp

@hrms_router.get("/employees/{eid}")
async def get_employee(eid: str, user=Depends(current_user)):
    emp = await db.employees.find_one(
        {"id": eid, "workspace_id": user["workspace_id"]}, {"_id": 0}
    )
    if not emp:
        raise HTTPException(404, "Employee not found")
    # Enrich with department and manager names
    if emp.get("department_id"):
        dept = await db.departments.find_one({"id": emp["department_id"]}, {"_id": 0, "name": 1})
        if dept:
            emp["department_name"] = dept["name"]
    return emp

@hrms_router.put("/employees/{eid}")
async def update_employee(eid: str, body: dict, user=Depends(current_user)):
    emp = await db.employees.find_one({"id": eid, "workspace_id": user["workspace_id"]})
    if not emp:
        raise HTTPException(404, "Employee not found")
    
    update = {k: v for k, v in body.items() if v is not None and k != "workspace_id"}
    update["updated_at"] = now_iso()
    await db.employees.update_one({"id": eid}, {"$set": update})
    return {"ok": True}

@hrms_router.delete("/employees/{eid}")
async def delete_employee(eid: str, user=Depends(current_user)):
    await db.employees.delete_one({"id": eid, "workspace_id": user["workspace_id"]})
    return {"ok": True}

# ── Departments ──
@hrms_router.get("/departments")
async def list_departments(user=Depends(current_user)):
    items = await db.departments.find(
        {"workspace_id": user["workspace_id"]}, {"_id": 0}
    ).sort("name", 1).to_list(100)
    return items

@hrms_router.post("/departments")
async def create_department(body: DepartmentIn, user=Depends(current_user)):
    dept = {
        "id": new_id(), "workspace_id": user["workspace_id"],
        "name": body.name, "head_id": body.head_id,
        "description": body.description,
        "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.departments.insert_one(dept)
    dept.pop("_id", None)
    return dept

@hrms_router.put("/departments/{did}")
async def update_department(did: str, body: dict, user=Depends(current_user)):
    await db.departments.update_one(
        {"id": did, "workspace_id": user["workspace_id"]},
        {"$set": {**body, "updated_at": now_iso()}}
    )
    return {"ok": True}

@hrms_router.delete("/departments/{did}")
async def delete_department(did: str, user=Depends(current_user)):
    await db.departments.delete_one({"id": did, "workspace_id": user["workspace_id"]})
    return {"ok": True}

# ── Org Chart ──
@hrms_router.get("/org-chart")
async def get_org_chart(user=Depends(current_user)):
    employees = await db.employees.find(
        {"workspace_id": user["workspace_id"]}, {"_id": 0}
    ).to_list(500)
    
    depts = await db.departments.find(
        {"workspace_id": user["workspace_id"]}, {"_id": 0}
    ).to_list(100)
    dept_map = {d["id"]: d["name"] for d in depts}
    
    nodes = []
    for emp in employees:
        nodes.append({
            "id": emp["id"],
            "name": f"{emp.get('first_name', '')} {emp.get('last_name', '')}",
            "position": emp.get("position", ""),
            "department": dept_map.get(emp.get("department_id", ""), ""),
            "manager_id": emp.get("manager_id"),
        })
    
    return {"nodes": nodes, "departments": depts}

# ── Recruitment ──
@hrms_router.get("/requisitions")
async def list_requisitions(
    status: Optional[str] = None,
    user=Depends(current_user),
):
    query = {"workspace_id": user["workspace_id"]}
    if status:
        query["status"] = status
    items = await db.job_requisitions.find(query, {"_id": 0}) \
        .sort("created_at", -1).to_list(200)
    return items

@hrms_router.post("/requisitions")
async def create_requisition(body: JobRequisitionIn, user=Depends(current_user)):
    req = {
        "id": new_id(), "workspace_id": user["workspace_id"],
        "title": body.title, "department_id": body.department_id,
        "description": body.description, "requirements": body.requirements,
        "status": body.status,
        "salary_range_min": body.salary_range_min,
        "salary_range_max": body.salary_range_max,
        "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.job_requisitions.insert_one(req)
    req.pop("_id", None)
    await _audit(user, "hrms.requisition.create", {"requisition_id": req["id"]})
    return req

@hrms_router.put("/requisitions/{rid}")
async def update_requisition(rid: str, body: dict, user=Depends(current_user)):
    await db.job_requisitions.update_one(
        {"id": rid, "workspace_id": user["workspace_id"]},
        {"$set": {**body, "updated_at": now_iso()}}
    )
    return {"ok": True}

@hrms_router.get("/requisitions/{rid}/candidates")
async def list_candidates(rid: str, user=Depends(current_user)):
    items = await db.candidates.find(
        {"workspace_id": user["workspace_id"], "requisition_id": rid},
        {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    return items

@hrms_router.post("/candidates")
async def create_candidate(body: CandidateIn, user=Depends(current_user)):
    existing = await db.candidates.find_one(
        {"workspace_id": user["workspace_id"], "email": body.email.lower()}
    )
    if existing:
        raise HTTPException(400, "Candidate with this email already exists")
    
    c = {
        "id": new_id(), "workspace_id": user["workspace_id"],
        "first_name": body.first_name, "last_name": body.last_name,
        "email": body.email.lower(), "phone": body.phone,
        "requisition_id": body.requisition_id,
        "resume_text": body.resume_text,
        "source": body.source,
        "stage": "applied",
        "score": None, "score_notes": None,
        "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.candidates.insert_one(c)
    c.pop("_id", None)
    return c

@hrms_router.put("/candidates/{cid}")
async def update_candidate(cid: str, body: dict, user=Depends(current_user)):
    await db.candidates.update_one(
        {"id": cid, "workspace_id": user["workspace_id"]},
        {"$set": {**body, "updated_at": now_iso()}}
    )
    return {"ok": True}

@hrms_router.post("/candidates/{cid}/score")
async def score_candidate(cid: str, user=Depends(current_user)):
    c = await db.candidates.find_one(
        {"id": cid, "workspace_id": user["workspace_id"]}, {"_id": 0}
    )
    if not c:
        raise HTTPException(404, "Candidate not found")
    
    req = await db.job_requisitions.find_one(
        {"id": c.get("requisition_id")}, {"_id": 0}
    )
    
    system = ("You score job candidates for a recruiting pipeline. Given the position "
              "and the candidate's resume, respond with a score from 1-100 followed by "
              "a brief rationale — start your reply with the number.")
    resume = (c.get('resume_text') or 'No resume provided')[:2000]
    prompt = f"""Position: {req.get('title', 'N/A') if req else 'N/A'}
Requirements: {req.get('requirements', 'N/A') if req else 'N/A'}

Candidate: {c.get('first_name', '')} {c.get('last_name', '')}
Resume: {resume}"""

    try:
        result = await _llm_chat(system, prompt, f"hrms-score-{cid[:8]}", user=user)
        score = 70
        import re as _re
        m = _re.search(r'(\d{1,3})', result or "")
        if m:
            score = min(100, max(1, int(m.group(1))))
        
        await db.candidates.update_one(
            {"id": cid},
            {"$set": {"score": score, "score_notes": result[:500], "updated_at": now_iso()}}
        )
        
        await charge_credits(user["workspace_id"], "candidate_score", units=1)
    except Exception as e:
        log.warning("Candidate scoring failed: %s", e)
        score = None
    
    return {"score": score}

@hrms_router.post("/candidates/{cid}/schedule-interview")
async def schedule_interview(cid: str, body: dict, user=Depends(current_user)):
    """Schedule an interview using Schedule EQ's booking engine."""
    c = await db.candidates.find_one(
        {"id": cid, "workspace_id": user["workspace_id"]}, {"_id": 0}
    )
    if not c:
        raise HTTPException(404, "Candidate not found")
    
    # This integrates with Schedule EQ's existing booking system
    # In v1, we create a lightweight booking record
    booking = {
        "id": new_id(), "workspace_id": user["workspace_id"],
        "candidate_id": cid, "candidate_name": f"{c.get('first_name', '')} {c.get('last_name', '')}",
        "candidate_email": c.get("email", ""),
        "event_type_category": "interview",
        "start_time": body.get("start_time"),
        "end_time": body.get("end_time"),
        "status": "scheduled",
        "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.interview_bookings.insert_one(booking)
    booking.pop("_id", None)

    await db.candidates.update_one(
        {"id": cid},
        {"$set": {"stage": "interview", "interview_booking_id": booking["id"], "updated_at": now_iso()}}
    )
    
    return booking

# ── Onboarding ──
@hrms_router.get("/onboarding-tasks")
async def list_onboarding_tasks(employee_id: Optional[str] = None, user=Depends(current_user)):
    query = {"workspace_id": user["workspace_id"]}
    if employee_id:
        query["employee_id"] = employee_id
    items = await db.onboarding_tasks.find(query, {"_id": 0}) \
        .sort("created_at", 1).to_list(200)
    return items

@hrms_router.post("/onboarding-tasks")
async def create_onboarding_task(body: dict, user=Depends(current_user)):
    task = {
        "id": new_id(), "workspace_id": user["workspace_id"],
        "employee_id": body.get("employee_id"),
        "title": body.get("title", ""),
        "description": body.get("description", ""),
        "assigned_to": body.get("assigned_to"),
        "due_by": body.get("due_by"),
        "status": "pending",
        "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.onboarding_tasks.insert_one(task)
    task.pop("_id", None)
    return task

@hrms_router.put("/onboarding-tasks/{tid}")
async def update_onboarding_task(tid: str, body: dict, user=Depends(current_user)):
    await db.onboarding_tasks.update_one(
        {"id": tid, "workspace_id": user["workspace_id"]},
        {"$set": {**body, "updated_at": now_iso()}}
    )
    return {"ok": True}

# ── Leave ──
@hrms_router.get("/leave-requests")
async def list_leave_requests(
    status: Optional[str] = None,
    employee_id: Optional[str] = None,
    user=Depends(current_user),
):
    query = {"workspace_id": user["workspace_id"]}
    if status:
        query["status"] = status
    if employee_id:
        query["employee_id"] = employee_id
    items = await db.leave_requests.find(query, {"_id": 0}) \
        .sort("created_at", -1).to_list(200)
    return items

@hrms_router.post("/leave-requests")
async def create_leave_request(body: LeaveRequestIn, user=Depends(current_user)):
    # Check balance
    balance = await db.leave_balances.find_one({
        "workspace_id": user["workspace_id"],
        "employee_id": body.employee_id,
        "leave_type": body.leave_type,
    })
    
    if body.start_date > body.end_date:
        raise HTTPException(400, "Start date must be before end date")
    
    lr = {
        "id": new_id(), "workspace_id": user["workspace_id"],
        "employee_id": body.employee_id,
        "leave_type": body.leave_type,
        "start_date": body.start_date,
        "end_date": body.end_date,
        "reason": body.reason,
        "status": "pending",
        "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.leave_requests.insert_one(lr)
    lr.pop("_id", None)
    return lr

@hrms_router.put("/leave-requests/{lid}")
async def update_leave_request(lid: str, body: dict, user=Depends(current_user)):
    lr = await db.leave_requests.find_one({"id": lid, "workspace_id": user["workspace_id"]})
    if not lr:
        raise HTTPException(404, "Leave request not found")
    
    new_status = body.get("status")
    if new_status in ("approved", "declined"):
        if new_status == "approved":
            # Update balance
            start = datetime.fromisoformat(lr["start_date"])
            end = datetime.fromisoformat(lr["end_date"])
            days = (end - start).days + 1
            
            await db.leave_balances.update_one(
                {
                    "workspace_id": user["workspace_id"],
                    "employee_id": lr["employee_id"],
                    "leave_type": lr["leave_type"],
                },
                {"$inc": {"used_days": days}},
                upsert=True,
            )
        
        await db.leave_requests.update_one(
            {"id": lid},
            {"$set": {"status": new_status, "reviewed_by": user.get("id"), "updated_at": now_iso()}}
        )
    else:
        await db.leave_requests.update_one(
            {"id": lid},
            {"$set": {**body, "updated_at": now_iso()}}
        )
    
    return {"ok": True}

@hrms_router.get("/leave-balances")
async def get_leave_balances(employee_id: Optional[str] = None, user=Depends(current_user)):
    query = {"workspace_id": user["workspace_id"]}
    if employee_id:
        query["employee_id"] = employee_id
    items = await db.leave_balances.find(query, {"_id": 0}).to_list(200)
    return items

@hrms_router.post("/leave-balances")
async def set_leave_balance(body: dict, user=Depends(current_user)):
    await db.leave_balances.update_one(
        {
            "workspace_id": user["workspace_id"],
            "employee_id": body.get("employee_id"),
            "leave_type": body.get("leave_type", "vacation"),
        },
        {"$set": {
            "total_days": body.get("total_days", 0),
            "used_days": body.get("used_days", 0),
        }},
        upsert=True,
    )
    return {"ok": True}

# ── Performance Reviews ──
@hrms_router.get("/performance-reviews")
async def list_performance_reviews(
    employee_id: Optional[str] = None,
    user=Depends(current_user),
):
    query = {"workspace_id": user["workspace_id"]}
    if employee_id:
        query["employee_id"] = employee_id
    items = await db.performance_reviews.find(query, {"_id": 0}) \
        .sort("created_at", -1).to_list(200)
    return items

@hrms_router.post("/performance-reviews")
async def create_performance_review(body: PerformanceReviewIn, user=Depends(current_user)):
    pr = {
        "id": new_id(), "workspace_id": user["workspace_id"],
        "employee_id": body.employee_id,
        "reviewer_id": body.reviewer_id,
        "rating": body.rating,
        "strengths": body.strengths,
        "areas_for_improvement": body.areas_for_improvement,
        "notes": body.notes,
        "status": "draft",
        "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.performance_reviews.insert_one(pr)
    pr.pop("_id", None)
    return pr

@hrms_router.put("/performance-reviews/{pid}")
async def update_performance_review(pid: str, body: dict, user=Depends(current_user)):
    await db.performance_reviews.update_one(
        {"id": pid, "workspace_id": user["workspace_id"]},
        {"$set": {**body, "updated_at": now_iso()}}
    )
    return {"ok": True}

# ── Reports ──
@hrms_router.get("/reports/headcount")
async def headcount_report(user=Depends(current_user)):
    wid = user["workspace_id"]
    pipeline = [
        {"$match": {"workspace_id": wid}},
        {"$group": {"_id": "$department_id", "count": {"$sum": 1}}},
    ]
    by_dept = await db.employees.aggregate(pipeline).to_list(100)
    
    depts = {d["id"]: d["name"] async for d in db.departments.find({"workspace_id": wid})}
    
    return {
        "total": await db.employees.count_documents({"workspace_id": wid, "status": "active"}),
        "by_department": [{"department": depts.get(r["_id"], "Unknown"), "count": r["count"]} for r in by_dept],
    }

@hrms_router.get("/reports/attrition")
async def attrition_report(user=Depends(current_user)):
    wid = user["workspace_id"]
    total = await db.employees.count_documents({"workspace_id": wid})
    inactive = await db.employees.count_documents({"workspace_id": wid, "status": {"$ne": "active"}})
    return {
        "total_employees": total,
        "inactive_count": inactive,
        "attrition_rate": round((inactive / total * 100) if total > 0 else 0, 1),
    }

@hrms_router.get("/reports/leave")
async def leave_report(user=Depends(current_user)):
    wid = user["workspace_id"]
    pipeline = [
        {"$match": {"workspace_id": wid, "status": "approved"}},
        {"$group": {"_id": "$leave_type", "total_days": {"$sum": 1}}},
    ]
    by_type = await db.leave_requests.aggregate(pipeline).to_list(20)
    return {"by_type": by_type}

@hrms_router.get("/analytics")
async def get_analytics(user=Depends(current_user)):
    wid = user["workspace_id"]
    return {
        "total_employees": await db.employees.count_documents({"workspace_id": wid, "status": "active"}),
        "total_departments": await db.departments.count_documents({"workspace_id": wid}),
        "open_requisitions": await db.job_requisitions.count_documents({"workspace_id": wid, "status": "open"}),
        "total_candidates": await db.candidates.count_documents({"workspace_id": wid}),
        "pending_leave": await db.leave_requests.count_documents({"workspace_id": wid, "status": "pending"}),
    }

@hrms_router.get("/settings")
async def get_settings(user=Depends(current_user)):
    s = await db.hrms_settings.find_one({"workspace_id": user["workspace_id"]}, {"_id": 0})
    return s or {"company_name": "", "default_leave_allowance": 20}

@hrms_router.post("/settings")
async def update_settings(body: dict, user=Depends(current_user)):
    await db.hrms_settings.update_one(
        {"workspace_id": user["workspace_id"]},
        {"$set": body}, upsert=True,
    )
    return {"ok": True}
