"""CRM — the shared lead/list/pipeline module every agent reads and writes.

Extracted out of server.py (previously the last domain still inline there) so
it follows the same spoke pattern as every other agent module in this app.
Covers: leads, lead lists (with CSV/XLSX bulk upload), the deal pipeline,
notes, tasks, tagging, ownership, bulk actions, CSV export, and the
quarantine/suppression review flow.
"""

import csv
import io
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from pymongo.errors import DuplicateKeyError

from server import db, current_user, now_iso, new_id, _audit, _log_activity
from import_utils import _parse_rows

crm_router = APIRouter()

STAGES = ["new", "qualified", "meeting", "proposal", "won", "lost"]

LEAD_IMPORT_TEMPLATE_COLUMNS = ("first_name", "last_name", "email", "company", "title", "phone", "tags")


# ----------------------------- Models ----------------------------------------
class LeadIn(BaseModel):
    first_name: str
    last_name: Optional[str] = ""
    email: str
    company: Optional[str] = ""
    title: Optional[str] = ""
    linkedin: Optional[str] = ""
    phone: Optional[str] = None
    tags: List[str] = []


class LeadUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    company: Optional[str] = None
    title: Optional[str] = None
    phone: Optional[str] = None
    linkedin: Optional[str] = None
    tags: Optional[List[str]] = None
    status: Optional[str] = None
    owner_id: Optional[str] = None
    dnc: Optional[bool] = None


class LeadBulk(BaseModel):
    leads: List[LeadIn]


class DealIn(BaseModel):
    lead_id: str
    title: str
    value: float = 0
    stage: str = "new"


class LeadNoteIn(BaseModel):
    text: str


class LeadTaskIn(BaseModel):
    title: str
    due_at: Optional[str] = None
    assignee_id: Optional[str] = None


class LeadTaskUpdate(BaseModel):
    title: Optional[str] = None
    due_at: Optional[str] = None
    assignee_id: Optional[str] = None
    status: Optional[str] = None


class BulkIdsIn(BaseModel):
    ids: List[str]


class BulkUpdateIn(BaseModel):
    ids: List[str]
    status: Optional[str] = None
    add_tag: Optional[str] = None


# ----------------------------- Shared enrichment helpers ----------------------
async def _enrich_owner_names(items: List[Dict[str, Any]]):
    owner_ids = {it["owner_id"] for it in items if it.get("owner_id")}
    if not owner_ids:
        return
    owners = await db.users.find({"id": {"$in": list(owner_ids)}}, {"_id": 0, "id": 1, "name": 1}).to_list(None)
    owner_map = {o["id"]: o["name"] for o in owners}
    for it in items:
        if it.get("owner_id"):
            it["owner_name"] = owner_map.get(it["owner_id"])


async def _enrich_campaign_names(items: List[Dict[str, Any]]):
    all_camp_ids = set()
    for it in items:
        if it.get("campaign_ids"):
            all_camp_ids.update(it["campaign_ids"])
    if not all_camp_ids:
        return
    camps = await db.campaigns.find({"id": {"$in": list(all_camp_ids)}}, {"_id": 0, "id": 1, "name": 1}).to_list(None)
    camp_map = {c["id"]: c["name"] for c in camps}
    for it in items:
        if it.get("campaign_ids"):
            it["campaign_names"] = [camp_map.get(cid) or cid for cid in it["campaign_ids"] if camp_map.get(cid)]


# ----------------------------- Leads -----------------------------------------
@crm_router.get("/leads")
async def list_leads(
    page: int = 1,
    page_size: int = 25,
    user=Depends(current_user),
):
    query = {"workspace_id": user["workspace_id"]}
    total = await db.leads.count_documents(query)
    items = await db.leads.find(query, {"_id": 0}) \
        .sort("created_at", -1) \
        .skip((page - 1) * page_size) \
        .to_list(page_size)
    await _enrich_campaign_names(items)
    await _enrich_owner_names(items)
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@crm_router.get("/leads/export")
async def export_leads(user=Depends(current_user)):
    items = await db.leads.find({"workspace_id": user["workspace_id"]}, {"_id": 0}).to_list(2000)
    await _enrich_owner_names(items)
    return _leads_csv_response(items, "leads-export.csv")


@crm_router.post("/leads")
async def create_lead(body: LeadIn, user=Depends(current_user)):
    lead = body.model_dump()
    lead["id"] = new_id()
    lead["workspace_id"] = user["workspace_id"]
    lead["email"] = lead["email"].lower()
    lead["status"] = "new"
    lead["icp_score"] = 60 + (len(lead.get("company", "")) % 40)
    lead["verified"] = "@" in lead["email"] and "." in lead["email"].split("@")[-1]
    lead["phone_verified"] = False
    lead["dnc"] = False
    lead["owner_id"] = None
    lead["created_at"] = now_iso()
    if await db.leads.find_one({"workspace_id": user["workspace_id"], "email": lead["email"]}):
        raise HTTPException(400, "Lead with this email already exists")
    try:
        await db.leads.insert_one(lead)
    except DuplicateKeyError:
        raise HTTPException(400, "Lead with this email already exists")
    lead.pop("_id", None)
    return lead


@crm_router.post("/leads/bulk")
async def bulk_leads(body: LeadBulk, user=Depends(current_user)):
    added, skipped = 0, 0
    for item in body.leads:
        d = item.model_dump()
        d["email"] = d["email"].lower()
        if await db.leads.find_one({"workspace_id": user["workspace_id"], "email": d["email"]}):
            skipped += 1
            continue
        d.update({
            "id": new_id(),
            "workspace_id": user["workspace_id"],
            "status": "new",
            "icp_score": 55 + (len(d.get("company", "")) % 45),
            "verified": True,
            "phone_verified": False,
            "dnc": False,
            "owner_id": None,
            "created_at": now_iso(),
        })
        try:
            await db.leads.insert_one(d)
        except DuplicateKeyError:
            skipped += 1
            continue
        added += 1
    return {"added": added, "skipped": skipped}


@crm_router.post("/leads/bulk-delete")
async def bulk_delete_leads(body: BulkIdsIn, user=Depends(current_user)):
    if not body.ids:
        raise HTTPException(400, "No ids provided")
    result = await db.leads.delete_many({"id": {"$in": body.ids}, "workspace_id": user["workspace_id"]})
    await _audit(user, "crm.leads.bulk_delete", {"count": result.deleted_count})
    return {"deleted": result.deleted_count}


@crm_router.post("/leads/bulk-update")
async def bulk_update_leads(body: BulkUpdateIn, user=Depends(current_user)):
    if not body.ids:
        raise HTTPException(400, "No ids provided")
    q = {"id": {"$in": body.ids}, "workspace_id": user["workspace_id"]}
    matched = 0
    if body.status:
        r = await db.leads.update_many(q, {"$set": {"status": body.status, "updated_at": now_iso()}})
        matched = max(matched, r.matched_count)
    if body.add_tag:
        r = await db.leads.update_many(q, {"$addToSet": {"tags": body.add_tag}, "$set": {"updated_at": now_iso()}})
        matched = max(matched, r.matched_count)
    await _audit(user, "crm.leads.bulk_update", {"count": len(body.ids), "status": body.status, "add_tag": body.add_tag})
    return {"matched": matched}


@crm_router.put("/leads/{lead_id}")
async def update_lead(lead_id: str, body: LeadUpdate, user=Depends(current_user)):
    update = {k: v for k, v in body.model_dump(exclude_none=True).items() if v is not None}
    if not update:
        raise HTTPException(400, "No fields to update")
    if "email" in update:
        update["email"] = update["email"].lower()
    update["updated_at"] = now_iso()
    try:
        result = await db.leads.update_one(
            {"id": lead_id, "workspace_id": user["workspace_id"]},
            {"$set": update},
        )
    except DuplicateKeyError:
        raise HTTPException(400, "Another lead already has this email")
    if result.matched_count == 0:
        raise HTTPException(404, "not found")
    lead = await db.leads.find_one({"id": lead_id, "workspace_id": user["workspace_id"]}, {"_id": 0})
    await _enrich_owner_names([lead])
    return lead


@crm_router.delete("/leads/{lead_id}")
async def delete_lead(lead_id: str, user=Depends(current_user)):
    await db.leads.delete_one({"id": lead_id, "workspace_id": user["workspace_id"]})
    return {"ok": True}


@crm_router.get("/leads/{lead_id}")
async def get_lead(lead_id: str, user=Depends(current_user)):
    lead = await db.leads.find_one({"id": lead_id, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "not found")
    lead["deal"] = await db.deals.find_one({"lead_id": lead_id, "workspace_id": user["workspace_id"]}, {"_id": 0})
    await _enrich_campaign_names([lead])
    await _enrich_owner_names([lead])
    return lead


@crm_router.get("/leads/{lead_id}/timeline")
async def lead_timeline(lead_id: str, user=Depends(current_user)):
    return await db.activities.find(
        {"lead_id": lead_id, "workspace_id": user["workspace_id"]}, {"_id": 0}
    ).sort("at", -1).to_list(500)


# ----------------------------- Lead notes -------------------------------------
@crm_router.get("/leads/{lead_id}/notes")
async def list_lead_notes(lead_id: str, user=Depends(current_user)):
    return await db.lead_notes.find(
        {"lead_id": lead_id, "workspace_id": user["workspace_id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)


@crm_router.post("/leads/{lead_id}/notes")
async def add_lead_note(lead_id: str, body: LeadNoteIn, user=Depends(current_user)):
    text = (body.text or "").strip()
    if not text:
        raise HTTPException(400, "Note text is required")
    text = text[:4000]
    lead = await db.leads.find_one({"id": lead_id, "workspace_id": user["workspace_id"]}, {"_id": 0, "id": 1})
    if not lead:
        raise HTTPException(404, "lead not found")
    note = {
        "id": new_id(), "workspace_id": user["workspace_id"], "lead_id": lead_id,
        "author_id": user["id"], "author_name": user.get("name") or user.get("email"),
        "body": text, "created_at": now_iso(),
    }
    await db.lead_notes.insert_one(note)
    note.pop("_id", None)
    await _log_activity(user["workspace_id"], lead_id, "crm", "note_added",
                         f"{note['author_name']} added a note: “{text[:80]}”", {"note_id": note["id"]})
    return note


@crm_router.delete("/leads/{lead_id}/notes/{note_id}")
async def delete_lead_note(lead_id: str, note_id: str, user=Depends(current_user)):
    note = await db.lead_notes.find_one({"id": note_id, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not note:
        raise HTTPException(404, "not found")
    if note["author_id"] != user["id"]:
        raise HTTPException(403, "Only the author can delete this note")
    await db.lead_notes.delete_one({"id": note_id, "workspace_id": user["workspace_id"]})
    return {"ok": True}


# ----------------------------- Lead tasks -------------------------------------
@crm_router.get("/leads/{lead_id}/tasks")
async def list_lead_tasks(lead_id: str, user=Depends(current_user)):
    return await db.lead_tasks.find(
        {"lead_id": lead_id, "workspace_id": user["workspace_id"]}, {"_id": 0}
    ).sort("due_at", 1).to_list(500)


@crm_router.post("/leads/{lead_id}/tasks")
async def create_lead_task(lead_id: str, body: LeadTaskIn, user=Depends(current_user)):
    lead = await db.leads.find_one({"id": lead_id, "workspace_id": user["workspace_id"]}, {"_id": 0, "id": 1})
    if not lead:
        raise HTTPException(404, "lead not found")
    task = {
        "id": new_id(), "workspace_id": user["workspace_id"], "lead_id": lead_id,
        "title": body.title.strip(), "due_at": body.due_at, "status": "open",
        "assignee_id": body.assignee_id, "created_at": now_iso(), "completed_at": None,
    }
    await db.lead_tasks.insert_one(task)
    task.pop("_id", None)
    return task


@crm_router.put("/tasks/{task_id}")
async def update_lead_task(task_id: str, body: LeadTaskUpdate, user=Depends(current_user)):
    update = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    if not update:
        raise HTTPException(400, "No fields to update")
    if update.get("status") == "done":
        update["completed_at"] = now_iso()
    elif update.get("status") == "open":
        update["completed_at"] = None
    result = await db.lead_tasks.update_one(
        {"id": task_id, "workspace_id": user["workspace_id"]}, {"$set": update},
    )
    if result.matched_count == 0:
        raise HTTPException(404, "not found")
    return await db.lead_tasks.find_one({"id": task_id, "workspace_id": user["workspace_id"]}, {"_id": 0})


@crm_router.delete("/tasks/{task_id}")
async def delete_lead_task(task_id: str, user=Depends(current_user)):
    await db.lead_tasks.delete_one({"id": task_id, "workspace_id": user["workspace_id"]})
    return {"ok": True}


@crm_router.get("/crm/tasks")
async def list_workspace_tasks(status: Optional[str] = None, user=Depends(current_user)):
    q = {"workspace_id": user["workspace_id"]}
    if status:
        q["status"] = status
    tasks = await db.lead_tasks.find(q, {"_id": 0}).sort("due_at", 1).to_list(200)
    lead_ids = list({t["lead_id"] for t in tasks if t.get("lead_id")})
    leads = {}
    if lead_ids:
        async for l in db.leads.find({"id": {"$in": lead_ids}}, {"_id": 0, "id": 1, "first_name": 1, "last_name": 1, "company": 1}):
            leads[l["id"]] = l
    for t in tasks:
        t["lead"] = leads.get(t["lead_id"])
    return tasks


# ── Lead Lists ─────────────────────────────────────────────────────────────
@crm_router.get("/crm/lists")
async def list_lead_lists(user=Depends(current_user)):
    return await db.lead_lists.find({"workspace_id": user["workspace_id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)


@crm_router.post("/crm/lists")
async def create_lead_list(body: Dict[str, Any], user=Depends(current_user)):
    doc = {
        "id": new_id(),
        "workspace_id": user["workspace_id"],
        "name": body.get("name", "Untitled list"),
        "description": body.get("description", ""),
        "lead_ids": [],
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.lead_lists.insert_one(doc)
    doc.pop("_id", None)
    return doc


@crm_router.get("/crm/lists/bulk-import/template")
async def lead_list_import_template():
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(LEAD_IMPORT_TEMPLATE_COLUMNS)
    writer.writerow(["Jordan", "Lee", "jordan.lee@example.com", "Acme Co", "VP Sales", "+14155551234", "warm-intro"])
    return PlainTextResponse(
        buf.getvalue(), media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=crm-lead-import-template.csv"},
    )


@crm_router.post("/crm/lists/bulk-import")
async def lead_list_bulk_import(
    file: UploadFile = File(...),
    list_id: Optional[str] = None,
    list_name: Optional[str] = None,
    list_description: Optional[str] = None,
    user=Depends(current_user),
):
    wid = user["workspace_id"]
    raw = await file.read()
    try:
        rows = _parse_rows(raw, file.filename or "")
    except Exception as ex:
        raise HTTPException(400, f"could not parse file: {ex}")

    if list_id:
        target_list = await db.lead_lists.find_one({"id": list_id, "workspace_id": wid}, {"_id": 0})
        if not target_list:
            raise HTTPException(404, "list not found")
    else:
        target_list = {
            "id": new_id(), "workspace_id": wid,
            "name": (list_name or "Untitled list").strip() or "Untitled list",
            "description": (list_description or "").strip(),
            "lead_ids": [], "created_at": now_iso(), "updated_at": now_iso(),
        }
        await db.lead_lists.insert_one(dict(target_list))

    created, linked_existing, skipped, errors = 0, 0, 0, []
    lead_ids_to_add: List[str] = []

    for i, row in enumerate(rows, start=1):
        email = (row.get("email") or "").strip().lower()
        if not email or "@" not in email or "." not in email.split("@")[-1]:
            skipped += 1
            errors.append(f"Row {i}: missing or invalid email")
            continue

        existing = await db.leads.find_one({"workspace_id": wid, "email": email}, {"_id": 0, "id": 1})
        if existing:
            lead_ids_to_add.append(existing["id"])
            linked_existing += 1
            continue

        first_name = (row.get("first_name") or "").strip() or email.split("@")[0].replace(".", " ").replace("_", " ").title()
        tags = [t.strip() for t in (row.get("tags") or "").split(",") if t.strip()]
        doc = {
            "id": new_id(), "workspace_id": wid,
            "first_name": first_name, "last_name": (row.get("last_name") or "").strip(),
            "email": email, "company": (row.get("company") or "").strip(),
            "title": (row.get("title") or "").strip(), "linkedin": "",
            "phone": (row.get("phone") or "").strip() or None, "tags": tags,
            "status": "new", "icp_score": 55, "verified": True, "phone_verified": False,
            "dnc": False, "owner_id": None, "created_at": now_iso(),
        }
        try:
            await db.leads.insert_one(doc)
        except DuplicateKeyError:
            existing2 = await db.leads.find_one({"workspace_id": wid, "email": email}, {"_id": 0, "id": 1})
            if existing2:
                lead_ids_to_add.append(existing2["id"])
                linked_existing += 1
            else:
                skipped += 1
                errors.append(f"Row {i}: insert conflict")
            continue
        lead_ids_to_add.append(doc["id"])
        created += 1

    if lead_ids_to_add:
        await db.lead_lists.update_one(
            {"id": target_list["id"], "workspace_id": wid},
            {"$addToSet": {"lead_ids": {"$each": lead_ids_to_add}}, "$set": {"updated_at": now_iso()}},
        )

    await _audit(user, "crm.lists.bulk_import", {
        "list_id": target_list["id"], "created": created, "linked_existing": linked_existing, "skipped": skipped,
    })
    refreshed_list = await db.lead_lists.find_one({"id": target_list["id"], "workspace_id": wid}, {"_id": 0})
    return {
        "list_id": target_list["id"], "list": refreshed_list,
        "created": created, "linked_existing": linked_existing, "skipped": skipped, "errors": errors,
    }


@crm_router.get("/crm/lists/{list_id}/export")
async def export_lead_list(list_id: str, user=Depends(current_user)):
    lst = await db.lead_lists.find_one({"id": list_id, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not lst:
        raise HTTPException(404, "not found")
    items = await db.leads.find(
        {"id": {"$in": lst.get("lead_ids", [])}, "workspace_id": user["workspace_id"]}, {"_id": 0}
    ).to_list(2000)
    await _enrich_owner_names(items)
    fname = f"{lst['name'].replace(' ', '-').lower()}-export.csv"
    return _leads_csv_response(items, fname)


@crm_router.put("/crm/lists/{list_id}")
async def update_lead_list(list_id: str, body: Dict[str, Any], user=Depends(current_user)):
    update = {}
    if "name" in body:
        update["name"] = body["name"]
    if "description" in body:
        update["description"] = body["description"]
    update["updated_at"] = now_iso()
    await db.lead_lists.update_one(
        {"id": list_id, "workspace_id": user["workspace_id"]},
        {"$set": update},
    )
    return await db.lead_lists.find_one({"id": list_id, "workspace_id": user["workspace_id"]}, {"_id": 0})


@crm_router.delete("/crm/lists/{list_id}")
async def delete_lead_list(list_id: str, user=Depends(current_user)):
    await db.lead_lists.delete_one({"id": list_id, "workspace_id": user["workspace_id"]})
    return {"ok": True}


@crm_router.post("/crm/lists/{list_id}/leads")
async def add_leads_to_list(list_id: str, body: Dict[str, Any], user=Depends(current_user)):
    lead_ids = body.get("lead_ids", [])
    if not lead_ids:
        raise HTTPException(400, "No lead_ids provided")
    await db.lead_lists.update_one(
        {"id": list_id, "workspace_id": user["workspace_id"]},
        {"$addToSet": {"lead_ids": {"$each": lead_ids}}, "$set": {"updated_at": now_iso()}},
    )
    return {"ok": True}


@crm_router.delete("/crm/lists/{list_id}/leads/{lead_id}")
async def remove_lead_from_list(list_id: str, lead_id: str, user=Depends(current_user)):
    await db.lead_lists.update_one(
        {"id": list_id, "workspace_id": user["workspace_id"]},
        {"$pull": {"lead_ids": lead_id}, "$set": {"updated_at": now_iso()}},
    )
    return {"ok": True}


def _leads_csv_response(items: List[Dict[str, Any]], filename: str) -> PlainTextResponse:
    buf = io.StringIO()
    columns = ["first_name", "last_name", "email", "company", "title", "phone", "status",
               "tags", "owner_name", "verified", "dnc", "created_at"]
    writer = csv.writer(buf)
    writer.writerow(columns)
    for it in items:
        row = [it.get(c) for c in columns]
        tags_idx = columns.index("tags")
        row[tags_idx] = ",".join(it.get("tags") or [])
        writer.writerow(row)
    return PlainTextResponse(
        buf.getvalue(), media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


# ----------------------------- Suppressions -----------------------------------
@crm_router.post("/suppressions")
async def suppress(body: Dict[str, str], user=Depends(current_user)):
    email = body.get("email", "").lower()
    if not email:
        raise HTTPException(400, "email required")
    await db.suppressions.update_one(
        {"workspace_id": user["workspace_id"], "email": email},
        {"$set": {"workspace_id": user["workspace_id"], "email": email, "created_at": now_iso()}},
        upsert=True,
    )
    return {"ok": True}


@crm_router.get("/suppressions")
async def list_suppressions(user=Depends(current_user)):
    return await db.suppressions.find({"workspace_id": user["workspace_id"]}, {"_id": 0}).to_list(1000)


@crm_router.delete("/suppressions/{email}")
async def unsuppress(email: str, user=Depends(current_user)):
    await db.suppressions.delete_one({"workspace_id": user["workspace_id"], "email": email.lower()})
    return {"ok": True}


# ----------------------------- Quarantine review ------------------------------
@crm_router.get("/quarantine")
async def list_quarantine(user=Depends(current_user)):
    return await db.quarantine.find(
        {"workspace_id": user["workspace_id"]}, {"_id": 0}
    ).sort("at", -1).to_list(500)


@crm_router.delete("/quarantine/{qid}")
async def dismiss_quarantine(qid: str, user=Depends(current_user)):
    await db.quarantine.delete_one({"id": qid, "workspace_id": user["workspace_id"]})
    return {"ok": True}


# ----------------------------- Deals / Pipeline -------------------------------
@crm_router.get("/deals")
async def list_deals(user=Depends(current_user)):
    deals = await db.deals.find({"workspace_id": user["workspace_id"]}, {"_id": 0}).to_list(1000)
    for d in deals:
        d["lead"] = await db.leads.find_one({"id": d["lead_id"]}, {"_id": 0})
    return deals


@crm_router.get("/deals/export")
async def export_deals(user=Depends(current_user)):
    deals = await db.deals.find({"workspace_id": user["workspace_id"]}, {"_id": 0}).to_list(1000)
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["title", "value", "stage", "notes", "lead_name", "lead_company", "created_at"])
    for d in deals:
        lead = await db.leads.find_one({"id": d["lead_id"]}, {"_id": 0, "first_name": 1, "last_name": 1, "company": 1})
        lead_name = f"{lead.get('first_name','')} {lead.get('last_name','')}".strip() if lead else ""
        writer.writerow([d.get("title"), d.get("value", 0), d.get("stage"), d.get("notes", ""),
                          lead_name, (lead or {}).get("company", ""), d.get("created_at")])
    return PlainTextResponse(
        buf.getvalue(), media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=deals-export.csv"},
    )


@crm_router.get("/deals/{did}")
async def get_deal(did: str, user=Depends(current_user)):
    d = await db.deals.find_one({"id": did, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not d:
        raise HTTPException(404, "not found")
    d["lead"] = await db.leads.find_one({"id": d["lead_id"]}, {"_id": 0})
    return d


@crm_router.post("/deals")
async def create_deal(body: DealIn, user=Depends(current_user)):
    d = body.model_dump()
    d.update({"id": new_id(), "workspace_id": user["workspace_id"], "notes": "", "created_at": now_iso()})
    if d["stage"] not in STAGES:
        d["stage"] = "new"
    await db.deals.insert_one(d)
    d.pop("_id", None)
    return d


@crm_router.put("/deals/{did}")
async def update_deal(did: str, body: Dict[str, Any], user=Depends(current_user)):
    allowed = {k: v for k, v in body.items() if k in {"stage", "value", "title", "notes"}}
    if "stage" in allowed and allowed["stage"] not in STAGES:
        raise HTTPException(400, "invalid stage")
    await db.deals.update_one(
        {"id": did, "workspace_id": user["workspace_id"]},
        {"$set": allowed},
    )
    return await db.deals.find_one({"id": did, "workspace_id": user["workspace_id"]}, {"_id": 0})
