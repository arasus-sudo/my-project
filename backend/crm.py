"""CRM — the shared lead/list/pipeline module every agent reads and writes.

Extracted out of server.py (previously the last domain still inline there) so
it follows the same spoke pattern as every other agent module in this app.
Covers: leads, lead lists (with CSV/XLSX bulk upload), the deal pipeline,
notes, tasks, tagging, ownership, bulk actions, CSV export, and the
quarantine/suppression review flow.
"""

import csv
import io
import json
import re
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from pymongo.errors import DuplicateKeyError

from server import db, current_user, now_iso, new_id, _audit, _log_activity, _is_admin, _llm_chat, _extract_json
from import_utils import _parse_rows

crm_router = APIRouter()

STAGES = ["new", "qualified", "meeting", "proposal", "won", "lost"]

# Soft-delete: {"deleted_at": None} matches both explicitly-null and (for
# every pre-existing document) missing `deleted_at` fields under Mongo's
# normal null-equality semantics, so this is safe to merge into every
# existing read query without a migration.
NOT_DELETED = {"deleted_at": None}


def _active(workspace_id: str, **extra) -> Dict[str, Any]:
    return {"workspace_id": workspace_id, **NOT_DELETED, **extra}


def require_role(*allowed: str):
    """Gate a route to workspace roles in `allowed` (suite admins always pass).

    The workspace ROLES set (org_admin/campaign_manager/sdr/viewer) is declared
    in server.py but wasn't enforced anywhere in this module — a viewer could
    delete/merge/reshape data same as an admin. This closes that gap for the
    handful of destructive or schema-shaping actions that need it; reads and
    normal create/edit stay open to every workspace role.
    """
    async def _dep(user=Depends(current_user)):
        if user.get("role") not in allowed and not _is_admin(user):
            raise HTTPException(403, "Not permitted for your role")
        return user
    return _dep

LEAD_IMPORT_TEMPLATE_COLUMNS = ("first_name", "last_name", "email", "company", "title", "phone", "tags")


# ----------------------------- Models ----------------------------------------
class LeadIn(BaseModel):
    first_name: str
    last_name: Optional[str] = ""
    email: str
    company: Optional[str] = ""
    title: Optional[str] = ""
    linkedin: Optional[str] = ""
    linkedin_url: Optional[str] = ""
    website: Optional[str] = ""
    company_id: Optional[str] = None
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
    linkedin_url: Optional[str] = None
    website: Optional[str] = None
    company_id: Optional[str] = None
    tags: Optional[List[str]] = None
    status: Optional[str] = None
    owner_id: Optional[str] = None
    dnc: Optional[bool] = None
    custom_fields: Optional[Dict[str, Any]] = None


class CompanyIn(BaseModel):
    name: str
    domain: Optional[str] = ""
    website: Optional[str] = ""
    linkedin_url: Optional[str] = ""
    industry: Optional[str] = ""
    employee_count: Optional[int] = None
    description: Optional[str] = ""
    logo_url: Optional[str] = ""
    hq_location: Optional[str] = ""
    tags: List[str] = []


class CompanyUpdate(BaseModel):
    name: Optional[str] = None
    domain: Optional[str] = None
    website: Optional[str] = None
    linkedin_url: Optional[str] = None
    industry: Optional[str] = None
    employee_count: Optional[int] = None
    description: Optional[str] = None
    logo_url: Optional[str] = None
    hq_location: Optional[str] = None
    tags: Optional[List[str]] = None


class CompanyListIn(BaseModel):
    name: str
    description: Optional[str] = ""
    company_ids: List[str] = []


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
    query = _active(user["workspace_id"])
    total = await db.leads.count_documents(query)
    items = await db.leads.find(query, {"_id": 0}) \
        .sort("created_at", -1) \
        .skip((page - 1) * page_size) \
        .to_list(page_size)
    await _enrich_campaign_names(items)
    await _enrich_owner_names(items)
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@crm_router.get("/leads/all-ids")
async def list_all_lead_ids(
    search: Optional[str] = None,
    list_id: Optional[str] = None,
    tags: Optional[str] = None,  # comma-separated
    status: Optional[str] = None,
    owner_id: Optional[str] = None,
    band: Optional[str] = None,
    user=Depends(current_user),
):
    query = _active(user["workspace_id"])
    if search:
        q = search.strip().lower()
        query["$or"] = [
            {"first_name": {"$regex": q, "$options": "i"}},
            {"last_name": {"$regex": q, "$options": "i"}},
            {"company": {"$regex": q, "$options": "i"}},
            {"email": {"$regex": q, "$options": "i"}},
            {"title": {"$regex": q, "$options": "i"}},
        ]
    if list_id:
        lst = await db.lead_lists.find_one(_active(user["workspace_id"], id=list_id), {"lead_ids": 1})
        if lst and lst.get("lead_ids"):
            query["id"] = {"$in": lst["lead_ids"]}
        else:
            return {"ids": []}
    if tags:
        tag_list = [t.strip() for t in tags.split(",") if t.strip()]
        if tag_list:
            query["tags"] = {"$in": tag_list}
    if status:
        query["status"] = status
    if owner_id:
        query["owner_id"] = owner_id
    if band:
        query["intent.band"] = band
    cursor = db.leads.find(query, {"id": 1, "_id": 0})
    ids = [doc["id"] async for doc in cursor]
    return {"ids": ids}


@crm_router.get("/leads/export")
async def export_leads(user=Depends(current_user)):
    items = await db.leads.find(_active(user["workspace_id"]), {"_id": 0}).to_list(2000)
    await _enrich_owner_names(items)
    return await _leads_csv_response(items, "leads-export.csv", user["workspace_id"])


@crm_router.post("/leads")
async def create_lead(body: LeadIn, user=Depends(current_user)):
    lead = body.model_dump()
    lead["id"] = new_id()
    lead["workspace_id"] = user["workspace_id"]
    lead["email"] = lead["email"].lower()
    lead["status"] = "new"
    # icp_score is intentionally left unset here — it's only meaningful once
    # intent_engine.score_lead() has real signal to work with (see "Research
    # this lead" in pitch_eq.py). A number derived from the company name's
    # length is worse than no number, because reps trust it.
    lead["verified"] = "@" in lead["email"] and "." in lead["email"].split("@")[-1]
    lead["phone_verified"] = False
    lead["dnc"] = False
    lead["owner_id"] = None
    lead["created_at"] = now_iso()
    # Normalize linkedin → linkedin_url for backward compatibility
    if not lead.get("linkedin_url") and lead.get("linkedin"):
        lead["linkedin_url"] = lead["linkedin"]
    if not lead.get("linkedin") and lead.get("linkedin_url"):
        lead["linkedin"] = lead["linkedin_url"]
    if await db.leads.find_one(_active(user["workspace_id"], email=lead["email"])):
        raise HTTPException(400, "Lead with this email already exists")
    lead["deleted_at"] = None
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
        if await db.leads.find_one(_active(user["workspace_id"], email=d["email"])):
            skipped += 1
            continue
        # Normalize linkedin → linkedin_url
        if not d.get("linkedin_url") and d.get("linkedin"):
            d["linkedin_url"] = d["linkedin"]
        if not d.get("linkedin") and d.get("linkedin_url"):
            d["linkedin"] = d["linkedin_url"]
        d.update({
            "id": new_id(),
            "workspace_id": user["workspace_id"],
            "status": "new",
            # icp_score intentionally unset — see create_lead's comment above.
            "verified": True,
            "phone_verified": False,
            "dnc": False,
            "owner_id": None,
            "deleted_at": None,
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
async def bulk_delete_leads(body: BulkIdsIn, user=Depends(require_role("org_admin", "campaign_manager"))):
    if not body.ids:
        raise HTTPException(400, "No ids provided")
    result = await db.leads.update_many(
        _active(user["workspace_id"], id={"$in": body.ids}),
        {"$set": {"deleted_at": now_iso(), "deleted_by": user["id"]}},
    )
    await _audit(user, "crm.leads.bulk_delete", {"count": result.modified_count})
    return {"deleted": result.modified_count}


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

    # custom_fields is a per-key merge (dot-notation $set), never a blanket
    # replace — a payload that only sets one field must not clobber the rest.
    custom_fields = update.pop("custom_fields", None)
    if custom_fields:
        defs = await db.custom_field_defs.find(
            {"workspace_id": user["workspace_id"], "entity": "lead", "archived": {"$ne": True}}, {"_id": 0},
        ).to_list(200)
        defs_by_key = {d["key"]: d for d in defs}
        for key, value in custom_fields.items():
            if key not in defs_by_key:
                raise HTTPException(400, f"Unknown custom field: {key}")
            fdef = defs_by_key[key]
            if fdef["type"] == "number" and value not in (None, ""):
                try:
                    value = float(value)
                except (TypeError, ValueError):
                    raise HTTPException(400, f"{fdef['name']} must be a number")
            update[f"custom_fields.{key}"] = value

    update["updated_at"] = now_iso()
    try:
        result = await db.leads.update_one(
            _active(user["workspace_id"], id=lead_id),
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
async def delete_lead(lead_id: str, user=Depends(require_role("org_admin", "campaign_manager"))):
    r = await db.leads.update_one(
        _active(user["workspace_id"], id=lead_id),
        {"$set": {"deleted_at": now_iso(), "deleted_by": user["id"]}},
    )
    if r.modified_count:
        await _audit(user, "crm.leads.delete", {"lead_id": lead_id})
    return {"ok": True}


@crm_router.get("/leads/{lead_id}")
async def get_lead(lead_id: str, user=Depends(current_user)):
    lead = await db.leads.find_one(_active(user["workspace_id"], id=lead_id), {"_id": 0})
    if not lead:
        raise HTTPException(404, "not found")
    lead["deal"] = await db.deals.find_one({"lead_id": lead_id, "workspace_id": user["workspace_id"]}, {"_id": 0})
    await _enrich_campaign_names([lead])
    await _enrich_owner_names([lead])
    return lead


@crm_router.get("/leads/{lead_id}/duplicates")
async def find_lead_duplicates(lead_id: str, user=Depends(current_user)):
    """Find potential duplicates for a specific lead by email local part match."""
    lead = await db.leads.find_one(_active(user["workspace_id"], id=lead_id), {"_id": 0})
    if not lead:
        raise HTTPException(404, "not found")
    email = (lead.get("email") or "").lower().strip()
    if not email or "@" not in email:
        return {"duplicates": []}
    local_part = email.split("@")[0]
    domain = email.split("@")[1]
    # Match leads with same email, or same local part + different domain, or same domain + similar name
    query = _active(user["workspace_id"], id={"$ne": lead_id})
    query["$or"] = [
        {"email": {"$regex": f"^{re.escape(local_part)}@", "$options": "i"}},
        {"email": {"$regex": f"@^{re.escape(domain)}", "$options": "i"}},
    ]
    duplicates = await db.leads.find(query, {"_id": 0}).to_list(20)
    await _enrich_campaign_names(duplicates)
    return {"duplicates": duplicates, "total": len(duplicates)}


@crm_router.post("/leads/merge")
async def merge_leads(body: Dict[str, Any], user=Depends(current_user)):
    """Merge two leads. primary_id survives, secondary_id is deleted.
    Fields from secondary fill gaps in primary. Tags, campaign/lists references are merged."""
    primary_id = body.get("primary_id")
    secondary_id = body.get("secondary_id")
    if not primary_id or not secondary_id:
        raise HTTPException(400, "primary_id and secondary_id required")
    if primary_id == secondary_id:
        raise HTTPException(400, "Cannot merge a lead with itself")
    wid = user["workspace_id"]
    primary = await db.leads.find_one(_active(wid, id=primary_id), {"_id": 0})
    secondary = await db.leads.find_one(_active(wid, id=secondary_id), {"_id": 0})
    if not primary or not secondary:
        raise HTTPException(404, "One or both leads not found")
    # Merge fields — secondary fills gaps where primary is empty
    mergeable = {"first_name", "last_name", "company", "title", "phone",
                 "linkedin", "linkedin_url", "website", "company_id"}
    update = {}
    for field in mergeable:
        if not primary.get(field) and secondary.get(field):
            update[field] = secondary[field]
    # Merge tags
    merged_tags = list(set(primary.get("tags", []) + secondary.get("tags", [])))
    update["tags"] = merged_tags
    # Merge raw_* fields — secondary fills gaps
    for k, v in secondary.items():
        if k.startswith("raw_") and v and not primary.get(k):
            update[k] = v
    if update:
        await db.leads.update_one({"id": primary_id}, {"$set": update})
    # Update all lists that reference secondary to reference primary instead
    lists_with_secondary = await db.lead_lists.find(
        {"workspace_id": wid, "lead_ids": secondary_id, "deleted_at": None},
        {"_id": 0, "id": 1, "lead_ids": 1}
    ).to_list(50)
    for lst in lists_with_secondary:
        new_ids = [primary_id if lid == secondary_id else lid for lid in lst.get("lead_ids", [])]
        await db.lead_lists.update_one({"id": lst["id"]}, {"$set": {"lead_ids": list(set(new_ids))}})
    # Update all campaigns that reference secondary
    campaigns_with_secondary = await db.campaigns.find(
        {"workspace_id": wid, "lead_ids": secondary_id},
        {"_id": 0, "id": 1, "lead_ids": 1}
    ).to_list(50)
    for c in campaigns_with_secondary:
        new_ids = [primary_id if lid == secondary_id else lid for lid in c.get("lead_ids", [])]
        await db.campaigns.update_one({"id": c["id"]}, {"$set": {"lead_ids": list(set(new_ids))}})
    # Update campaign_ids on primary
    all_campaign_ids = list(set(primary.get("campaign_ids", []) + secondary.get("campaign_ids", [])))
    await db.leads.update_one({"id": primary_id}, {"$set": {"campaign_ids": all_campaign_ids}})
    # Move deals from secondary to primary
    await db.deals.update_many(
        {"lead_id": secondary_id, "workspace_id": wid},
        {"$set": {"lead_id": primary_id}}
    )
    # Delete secondary
    await db.leads.update_one({"id": secondary_id}, {"$set": {
        "deleted_at": now_iso(), "merged_into": primary_id, "deleted_by": user["id"]
    }})
    await _audit(user, "crm.leads.merge", {"primary_id": primary_id, "secondary_id": secondary_id})
    merged = await db.leads.find_one({"id": primary_id, "workspace_id": wid}, {"_id": 0})
    await _enrich_campaign_names([merged])
    return {"ok": True, "lead": merged}


@crm_router.get("/duplicates")
async def list_all_duplicates(user=Depends(current_user)):
    """Find all potential duplicates across the workspace by same email."""
    wid = user["workspace_id"]
    pipeline = [
        {"$match": {"workspace_id": wid, "deleted_at": None}},
        {"$group": {"_id": "$email", "ids": {"$push": "$id"}, "count": {"$sum": 1}}},
        {"$match": {"count": {"$gt": 1}}},
        {"$sort": {"count": -1}},
    ]
    exact = await db.leads.aggregate(pipeline).to_list(50)
    groups = []
    for g in exact:
        leads = await db.leads.find(
            {"workspace_id": wid, "id": {"$in": g["ids"]}, "deleted_at": None},
            {"_id": 0}
        ).to_list(10)
        await _enrich_campaign_names(leads)
        groups.append({"email": g["_id"], "count": g["count"], "leads": leads})
    # Also find fuzzy matches: same email local part, different domain
    all_leads = await db.leads.find(
        {"workspace_id": wid, "deleted_at": None},
        {"_id": 0, "id": 1, "email": 1, "first_name": 1, "last_name": 1, "company": 1}
    ).to_list(2000)
    local_map = {}
    for l in all_leads:
        e = (l.get("email") or "").lower().strip()
        if "@" in e:
            local = e.split("@")[0]
            local_map.setdefault(local, []).append(l)
    fuzzy = []
    for local, matches in local_map.items():
        if len(matches) > 1:
            fuzzy.append({"local_part": local, "count": len(matches), "leads": matches})
    fuzzy.sort(key=lambda x: -x["count"])
    return {"exact_duplicates": groups, "fuzzy_duplicates": fuzzy[:20]}


@crm_router.get("/duplicates/count")
async def duplicates_count(user=Depends(current_user)):
    """Get total count of duplicate emails."""
    wid = user["workspace_id"]
    pipeline = [
        {"$match": {"workspace_id": wid, "deleted_at": None}},
        {"$group": {"_id": "$email", "count": {"$sum": 1}}},
        {"$match": {"count": {"$gt": 1}}},
        {"$count": "duplicate_emails"},
    ]
    result = await db.leads.aggregate(pipeline).to_list(1)
    count = result[0]["duplicate_emails"] if result else 0
    affected = 0
    if count > 0:
        pipe2 = [
            {"$match": {"workspace_id": wid, "deleted_at": None}},
            {"$group": {"_id": "$email", "ids": {"$push": "$id"}, "count": {"$sum": 1}}},
            {"$match": {"count": {"$gt": 1}}},
            {"$project": {"total_affected": {"$size": "$ids"}}},
            {"$group": {"_id": None, "total": {"$sum": "$total_affected"}}},
        ]
        r2 = await db.leads.aggregate(pipe2).to_list(1)
        affected = r2[0]["total"] if r2 else 0
    return {"duplicate_emails": count, "affected_leads": affected}


class ConvertLeadIn(BaseModel):
    title: Optional[str] = None
    value: float = 0
    stage: str = "qualified"


@crm_router.post("/leads/{lead_id}/convert")
async def convert_lead(lead_id: str, body: ConvertLeadIn, user=Depends(current_user)):
    """The one explicit "I'm qualifying this lead right now" action a rep can
    take — distinct from the automatic deal creation Voice/Schedule/Proposal EQ
    already do. Creating a deal here also advances the lead's own status,
    which plain `POST /deals` deliberately does not (it's a generic form, not
    a conversion moment)."""
    lead = await db.leads.find_one({"id": lead_id, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "lead not found")
    existing = await db.deals.find_one({"lead_id": lead_id, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if existing:
        raise HTTPException(400, {"error": "deal_exists", "deal_id": existing["id"]})

    stage = body.stage if body.stage in STAGES else "qualified"
    title = body.title or f"{lead.get('company') or (lead.get('first_name', '') + ' ' + lead.get('last_name', '')).strip()} — Opportunity"
    deal = {
        "id": new_id(), "workspace_id": user["workspace_id"], "lead_id": lead_id,
        "title": title, "value": body.value, "stage": stage, "notes": "",
        "created_at": now_iso(),
    }
    await db.deals.insert_one(deal)
    deal.pop("_id", None)

    if lead.get("status") != stage:
        await db.leads.update_one(
            {"id": lead_id, "workspace_id": user["workspace_id"]},
            {"$set": {"status": "qualified", "updated_at": now_iso()}},
        )

    await _log_activity(user["workspace_id"], lead_id, "crm", "lead_converted",
                         f"{user.get('name') or user.get('email')} converted this lead to a deal: “{title}”",
                         {"deal_id": deal["id"]})
    return deal


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
    return await db.lead_lists.find(_active(user["workspace_id"]), {"_id": 0}).sort("created_at", -1).to_list(200)


@crm_router.post("/crm/lists")
async def create_lead_list(body: Dict[str, Any], user=Depends(current_user)):
    doc = {
        "id": new_id(),
        "workspace_id": user["workspace_id"],
        "name": body.get("name", "Untitled list"),
        "description": body.get("description", ""),
        "lead_ids": [],
        "deleted_at": None,
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
    column_map: Optional[str] = None,
    user=Depends(current_user),
):
    wid = user["workspace_id"]
    raw = await file.read()
    try:
        rows = _parse_rows(raw, file.filename or "")
    except Exception as ex:
        raise HTTPException(400, f"could not parse file: {ex}")

    # Apply column mapping if provided — remap CSV headers to lead field names
    if column_map:
        try:
            mapping = json.loads(column_map)
        except json.JSONDecodeError:
            raise HTTPException(400, "column_map must be a valid JSON object")
        remapped = []
        for row in rows:
            remapped.append({mapping.get(k, k): v for k, v in row.items()})
        rows = remapped

    if list_id:
        target_list = await db.lead_lists.find_one(_active(wid, id=list_id), {"_id": 0})
        if not target_list:
            raise HTTPException(404, "list not found")
    else:
        target_list = {
            "id": new_id(), "workspace_id": wid,
            "name": (list_name or "Untitled list").strip() or "Untitled list",
            "description": (list_description or "").strip(),
            "lead_ids": [], "deleted_at": None, "created_at": now_iso(), "updated_at": now_iso(),
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

        existing = await db.leads.find_one(_active(wid, email=email), {"_id": 0, "id": 1})
        if existing:
            lead_ids_to_add.append(existing["id"])
            linked_existing += 1
            continue

        first_name = (row.get("first_name") or "").strip() or email.split("@")[0].replace(".", " ").replace("_", " ").title()
        tags = [t.strip() for t in (row.get("tags") or "").split(",") if t.strip()]
        linkedin_url = (row.get("linkedin_url") or row.get("linkedin") or "").strip()
        doc = {
            "id": new_id(), "workspace_id": wid,
            "first_name": first_name, "last_name": (row.get("last_name") or "").strip(),
            "email": email, "company": (row.get("company") or row.get("raw_company_name") or row.get("company_name") or "").strip(),
            "title": (row.get("title") or "").strip(),
            "linkedin": linkedin_url, "linkedin_url": linkedin_url,
            "website": (row.get("website") or "").strip(),
            "phone": (row.get("phone") or "").strip() or None, "tags": tags,
            "status": "new", "verified": True, "phone_verified": False,
            "dnc": False, "owner_id": None, "deleted_at": None, "created_at": now_iso(),
        }
        # Store all other remapped fields on the lead document
        KNOWN_LEAD_KEYS = {"id", "workspace_id", "first_name", "last_name", "email", "company",
            "title", "linkedin", "linkedin_url", "website", "phone", "tags", "status",
            "verified", "phone_verified", "dnc", "owner_id", "deleted_at", "created_at",
            "campaign_ids", "intent", "icp_score", "notes", "tasks", "company_name",
            "raw_company_name"}
        for k, v in row.items():
            if k not in KNOWN_LEAD_KEYS and v is not None and str(v).strip():
                doc[k if k.startswith("raw_") else "raw_" + k] = str(v).strip()
        try:
            await db.leads.insert_one(doc)
        except DuplicateKeyError:
            existing2 = await db.leads.find_one(_active(wid, email=email), {"_id": 0, "id": 1})
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
    return await _leads_csv_response(items, fname, user["workspace_id"])


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
async def delete_lead_list(list_id: str, user=Depends(require_role("org_admin", "campaign_manager"))):
    await db.lead_lists.update_one(
        _active(user["workspace_id"], id=list_id),
        {"$set": {"deleted_at": now_iso(), "deleted_by": user["id"]}},
    )
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


async def _leads_csv_response(items: List[Dict[str, Any]], filename: str, workspace_id: str) -> PlainTextResponse:
    buf = io.StringIO()
    columns = ["first_name", "last_name", "email", "company", "title", "phone", "status",
               "tags", "owner_name", "verified", "dnc", "created_at"]
    field_defs = await db.custom_field_defs.find(
        {"workspace_id": workspace_id, "entity": "lead"}, {"_id": 0, "key": 1, "name": 1},
    ).sort("order", 1).to_list(200)
    writer = csv.writer(buf)
    writer.writerow(columns + [f["name"] for f in field_defs])
    for it in items:
        row = [it.get(c) for c in columns]
        tags_idx = columns.index("tags")
        row[tags_idx] = ",".join(it.get("tags") or [])
        row.extend((it.get("custom_fields") or {}).get(f["key"], "") for f in field_defs)
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


# ----------------------------- Companies --------------------------------------
@crm_router.get("/companies")
async def list_companies(
    page: int = 1,
    page_size: int = 25,
    user=Depends(current_user),
):
    query = _active(user["workspace_id"])
    total = await db.companies.count_documents(query)
    items = await db.companies.find(query, {"_id": 0}) \
        .sort("name", 1) \
        .skip((page - 1) * page_size) \
        .to_list(page_size)
    # Enrich with lead count per company
    for c in items:
        c["lead_count"] = await db.leads.count_documents({"workspace_id": user["workspace_id"], "company_id": c["id"]})
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@crm_router.post("/companies")
async def create_company(body: CompanyIn, user=Depends(current_user)):
    company = body.model_dump()
    company["id"] = new_id()
    company["workspace_id"] = user["workspace_id"]
    company["deleted_at"] = None
    company["created_at"] = now_iso()
    await db.companies.insert_one(company)
    company.pop("_id", None)
    return company


@crm_router.get("/companies/{cid}")
async def get_company(cid: str, user=Depends(current_user)):
    c = await db.companies.find_one(_active(user["workspace_id"], id=cid), {"_id": 0})
    if not c:
        raise HTTPException(404, "not found")
    c["lead_count"] = await db.leads.count_documents({"workspace_id": user["workspace_id"], "company_id": cid})
    c["leads"] = await db.leads.find({"workspace_id": user["workspace_id"], "company_id": cid}, {"_id": 0}) \
        .sort("created_at", -1).to_list(100)
    return c


@crm_router.put("/companies/{cid}")
async def update_company(cid: str, body: CompanyUpdate, user=Depends(current_user)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "No fields to update")
    await db.companies.update_one(
        {"id": cid, "workspace_id": user["workspace_id"]},
        {"$set": updates},
    )
    return await db.companies.find_one({"id": cid, "workspace_id": user["workspace_id"]}, {"_id": 0})


@crm_router.delete("/companies/{cid}")
async def delete_company(cid: str, user=Depends(require_role("org_admin", "campaign_manager"))):
    r = await db.companies.update_one(
        _active(user["workspace_id"], id=cid),
        {"$set": {"deleted_at": now_iso(), "deleted_by": user["id"]}},
    )
    if r.modified_count == 0:
        raise HTTPException(404, "not found")
    # Leads referencing this company keep their company_id — a soft-deleted
    # company can be restored, and clearing the link would lose that on undo.
    await _audit(user, "crm.companies.delete", {"company_id": cid})
    return {"ok": True}


# ----------------------------- Company Lists ----------------------------------
@crm_router.get("/company-lists")
async def list_company_lists(user=Depends(current_user)):
    items = await db.company_lists.find(_active(user["workspace_id"]), {"_id": 0}) \
        .sort("name", 1).to_list(200)
    return items


@crm_router.post("/company-lists")
async def create_company_list(body: CompanyListIn, user=Depends(current_user)):
    cl = body.model_dump()
    cl["id"] = new_id()
    cl["workspace_id"] = user["workspace_id"]
    cl["deleted_at"] = None
    cl["created_at"] = now_iso()
    await db.company_lists.insert_one(cl)
    cl.pop("_id", None)
    return cl


@crm_router.put("/company-lists/{clid}")
async def update_company_list(clid: str, body: CompanyListIn, user=Depends(current_user)):
    updates = body.model_dump()
    await db.company_lists.update_one(
        {"id": clid, "workspace_id": user["workspace_id"]},
        {"$set": updates},
    )
    return await db.company_lists.find_one({"id": clid, "workspace_id": user["workspace_id"]}, {"_id": 0})


@crm_router.delete("/company-lists/{clid}")
async def delete_company_list(clid: str, user=Depends(require_role("org_admin", "campaign_manager"))):
    r = await db.company_lists.update_one(
        _active(user["workspace_id"], id=clid),
        {"$set": {"deleted_at": now_iso(), "deleted_by": user["id"]}},
    )
    if r.modified_count == 0:
        raise HTTPException(404, "not found")
    await _audit(user, "crm.company_lists.delete", {"list_id": clid})
    return {"ok": True}


@crm_router.post("/company-lists/{clid}/companies")
async def add_companies_to_list(clid: str, body: BulkIdsIn, user=Depends(current_user)):
    cl = await db.company_lists.find_one({"id": clid, "workspace_id": user["workspace_id"]})
    if not cl:
        raise HTTPException(404, "list not found")
    existing = set(cl.get("company_ids", []))
    existing.update(body.ids)
    await db.company_lists.update_one({"id": clid}, {"$set": {"company_ids": list(existing)}})
    return {"ok": True, "count": len(body.ids)}


@crm_router.delete("/company-lists/{clid}/companies/{cid}")
async def remove_company_from_list(clid: str, cid: str, user=Depends(current_user)):
    cl = await db.company_lists.find_one({"id": clid, "workspace_id": user["workspace_id"]})
    if not cl:
        raise HTTPException(404, "list not found")
    ids = [x for x in cl.get("company_ids", []) if x != cid]
    await db.company_lists.update_one({"id": clid}, {"$set": {"company_ids": ids}})
    return {"ok": True}


# ----------------------------- Recycle bin ------------------------------------
# Soft-deleted leads/companies/lists are recoverable here for 30 days, after
# which run_recycle_bin_purge_tick (registered in server.py's scheduler)
# hard-deletes them — bounded retention, not indefinite accumulation.
RECYCLE_BIN_RETENTION_DAYS = 30

def _recycle_types() -> Dict[str, Any]:
    # Built lazily (not at module import time) since it just reads attributes
    # off the already-initialized `db` — but kept as a function so the shape
    # is documented in one place rather than four scattered dict literals.
    return {
        "lead": (db.leads, lambda d: (f"{d.get('first_name','')} {d.get('last_name','')}".strip() or d.get("email", ""))),
        "company": (db.companies, lambda d: d.get("name", "")),
        "list": (db.lead_lists, lambda d: d.get("name", "")),
        "company_list": (db.company_lists, lambda d: d.get("name", "")),
    }


@crm_router.get("/crm/recycle-bin")
async def list_recycle_bin(user=Depends(require_role("org_admin", "campaign_manager"))):
    out = []
    for type_key, (col, label_fn) in _recycle_types().items():
        docs = await col.find(
            {"workspace_id": user["workspace_id"], "deleted_at": {"$ne": None}}, {"_id": 0},
        ).sort("deleted_at", -1).to_list(500)
        for d in docs:
            out.append({
                "type": type_key, "id": d["id"], "name": label_fn(d),
                "deleted_at": d.get("deleted_at"), "deleted_by": d.get("deleted_by"),
            })
    out.sort(key=lambda r: r["deleted_at"] or "", reverse=True)
    return out


@crm_router.post("/crm/recycle-bin/{type}/{item_id}/restore")
async def restore_recycled(type: str, item_id: str, user=Depends(require_role("org_admin", "campaign_manager"))):
    types = _recycle_types()
    if type not in types:
        raise HTTPException(404, "unknown type")
    col, _ = types[type]
    try:
        result = await col.update_one(
            {"id": item_id, "workspace_id": user["workspace_id"], "deleted_at": {"$ne": None}},
            {"$set": {"deleted_at": None, "deleted_by": None}},
        )
    except DuplicateKeyError:
        raise HTTPException(400, "A lead with this email already exists — resolve that first, then restore.")
    if result.matched_count == 0:
        raise HTTPException(404, "not found in recycle bin")
    await _audit(user, "crm.recycle_bin.restore", {"type": type, "id": item_id})
    return {"ok": True}


@crm_router.delete("/crm/recycle-bin/{type}/{item_id}")
async def purge_recycled(type: str, item_id: str, user=Depends(require_role("org_admin", "campaign_manager"))):
    types = _recycle_types()
    if type not in types:
        raise HTTPException(404, "unknown type")
    col, _ = types[type]
    result = await col.delete_one(
        {"id": item_id, "workspace_id": user["workspace_id"], "deleted_at": {"$ne": None}},
    )
    if result.deleted_count == 0:
        raise HTTPException(404, "not found in recycle bin")
    await _audit(user, "crm.recycle_bin.purge", {"type": type, "id": item_id})
    return {"ok": True}


async def run_recycle_bin_purge_tick():
    """Daily: hard-delete anything soft-deleted more than 30 days ago."""
    from datetime import datetime, timedelta, timezone
    cutoff = (datetime.now(timezone.utc) - timedelta(days=RECYCLE_BIN_RETENTION_DAYS)).isoformat()
    for _col, _label_fn in _recycle_types().values():
        await _col.delete_many({"deleted_at": {"$ne": None, "$lt": cutoff}})


# ----------------------------- Duplicate detection & merge --------------------
# No embedding/vector infra exists anywhere in this repo, and lead volumes here
# don't justify standing one up. Instead: cheap deterministic candidate
# generation (same phone / same company-domain+lastname / near-identical email
# local-part), then one small batched LLM call per workspace scan to assign a
# confidence score. Merging is always a human-confirmed action — nothing here
# auto-merges, since a false-positive merge is worse than a missed duplicate.


def _normalize_phone(phone: Optional[str]) -> str:
    digits = "".join(c for c in (phone or "") if c.isdigit())
    return digits[-10:] if len(digits) >= 7 else ""


def _edit_distance_le1(a: str, b: str) -> bool:
    """True if `a` and `b` differ by at most one insert/delete/substitute."""
    if a == b:
        return False  # exact matches are already caught by the unique index
    if abs(len(a) - len(b)) > 1:
        return False
    shorter, longer = (a, b) if len(a) <= len(b) else (b, a)
    if len(shorter) == len(longer):
        return sum(1 for x, y in zip(shorter, longer) if x != y) <= 1
    i = j = 0
    skipped = False
    while i < len(shorter) and j < len(longer):
        if shorter[i] != longer[j]:
            if skipped:
                return False
            skipped = True
            j += 1
        else:
            i += 1
            j += 1
    return True


def _find_dedup_candidates(leads: List[Dict[str, Any]]) -> Dict[frozenset, str]:
    pairs: Dict[frozenset, str] = {}

    by_phone: Dict[str, List[Dict[str, Any]]] = {}
    for l in leads:
        p = _normalize_phone(l.get("phone"))
        if p:
            by_phone.setdefault(p, []).append(l)
    for group in by_phone.values():
        for i in range(len(group)):
            for j in range(i + 1, len(group)):
                pairs[frozenset((group[i]["id"], group[j]["id"]))] = "phone"

    by_domain_last: Dict[Any, List[Dict[str, Any]]] = {}
    by_domain: Dict[str, List[Dict[str, Any]]] = {}
    for l in leads:
        email = l.get("email") or ""
        if "@" not in email:
            continue
        domain = email.split("@", 1)[1]
        last = (l.get("last_name") or "").strip().lower()
        if domain and last:
            by_domain_last.setdefault((domain, last), []).append(l)
        by_domain.setdefault(domain, []).append(l)
    for group in by_domain_last.values():
        for i in range(len(group)):
            for j in range(i + 1, len(group)):
                pairs.setdefault(frozenset((group[i]["id"], group[j]["id"])), "domain_lastname")

    for group in by_domain.values():
        if len(group) > 50:  # cap — avoid O(n^2) on a domain shared by hundreds of leads
            continue
        for i in range(len(group)):
            for j in range(i + 1, len(group)):
                a, b = group[i], group[j]
                if _edit_distance_le1((a.get("email") or "").split("@")[0], (b.get("email") or "").split("@")[0]):
                    pairs.setdefault(frozenset((a["id"], b["id"])), "email_similar")

    return pairs


async def _dedup_llm_confidence(lead_by_id: Dict[str, Dict[str, Any]],
                                 candidates: List[Dict[str, str]]) -> Dict[str, float]:
    """One batched call per scan (not one per pair) — cheap and keeps this
    background job from making N LLM calls when N candidates are found."""
    from server import ANTHROPIC_API_KEY
    if not ANTHROPIC_API_KEY or not candidates:
        return {}

    def _brief(lid: str) -> Dict[str, Any]:
        l = lead_by_id[lid]
        return {
            "name": f"{l.get('first_name', '')} {l.get('last_name', '')}".strip(),
            "email": l.get("email"), "phone": l.get("phone"), "company": l.get("company"),
        }

    payload = [{"key": f'{c["id_a"]}|{c["id_b"]}', "a": _brief(c["id_a"]), "b": _brief(c["id_b"])}
               for c in candidates[:30]]
    system = (
        "You judge whether two CRM lead records are the same real person entered twice "
        "(e.g. a typo'd email, or captured via two different channels). For each pair, "
        'decide a confidence 0-1 that they are the same person. STRICT JSON only: '
        '{"results": [{"key": str, "confidence": float}, ...]}'
    )
    try:
        raw = await _llm_chat(system, json.dumps(payload), "crm-dedup-scan")
        parsed = _extract_json(raw) or {}
        results = parsed.get("results") if isinstance(parsed, dict) else parsed
        return {r["key"]: max(0.0, min(1.0, float(r.get("confidence", 0.5))))
                for r in (results or []) if r.get("key")}
    except Exception:
        return {}


async def run_dedup_scan_tick():
    """Hourly: find new duplicate-lead candidates per workspace and record
    them for human review — nothing here writes to `db.leads` itself."""
    workspace_ids = await db.leads.distinct("workspace_id", NOT_DELETED)
    for wid in workspace_ids:
        leads = await db.leads.find(
            _active(wid),
            {"_id": 0, "id": 1, "first_name": 1, "last_name": 1, "email": 1, "phone": 1, "company": 1},
        ).to_list(5000)
        if len(leads) < 2:
            continue

        pairs = _find_dedup_candidates(leads)
        if not pairs:
            continue

        new_candidates = []
        for pair_key, reason in pairs.items():
            id_a, id_b = sorted(pair_key)
            existing = await db.dedup_candidates.find_one({
                "workspace_id": wid,
                "$or": [{"lead_id_a": id_a, "lead_id_b": id_b}, {"lead_id_a": id_b, "lead_id_b": id_a}],
            })
            if not existing:
                new_candidates.append({"id_a": id_a, "id_b": id_b, "reason": reason})
        if not new_candidates:
            continue

        lead_by_id = {l["id"]: l for l in leads}
        confidences = await _dedup_llm_confidence(lead_by_id, new_candidates)
        docs = [{
            "id": new_id(), "workspace_id": wid,
            "lead_id_a": c["id_a"], "lead_id_b": c["id_b"],
            "match_reason": c["reason"],
            "confidence": confidences.get(f'{c["id_a"]}|{c["id_b"]}', 0.5),
            "status": "pending", "created_at": now_iso(),
        } for c in new_candidates]
        await db.dedup_candidates.insert_many(docs)


class MergeDuplicateIn(BaseModel):
    survivor_id: str
    overrides: Dict[str, Any] = {}


@crm_router.get("/crm/duplicates")
async def list_duplicates(user=Depends(require_role("org_admin", "campaign_manager"))):
    candidates = await db.dedup_candidates.find(
        {"workspace_id": user["workspace_id"], "status": "pending"}, {"_id": 0},
    ).sort("confidence", -1).to_list(200)
    lead_ids = {c["lead_id_a"] for c in candidates} | {c["lead_id_b"] for c in candidates}
    if not lead_ids:
        return []
    leads = await db.leads.find(
        {"id": {"$in": list(lead_ids)}, "workspace_id": user["workspace_id"]}, {"_id": 0},
    ).to_list(len(lead_ids))
    lead_map = {l["id"]: l for l in leads}
    out = []
    for c in candidates:
        a, b = lead_map.get(c["lead_id_a"]), lead_map.get(c["lead_id_b"])
        if not a or not b:  # one side already deleted/merged elsewhere — stale candidate
            continue
        out.append({**c, "lead_a": a, "lead_b": b})
    return out


@crm_router.post("/crm/duplicates/{candidate_id}/merge")
async def merge_duplicate(candidate_id: str, body: MergeDuplicateIn,
                           user=Depends(require_role("org_admin", "campaign_manager"))):
    cand = await db.dedup_candidates.find_one({"id": candidate_id, "workspace_id": user["workspace_id"]})
    if not cand or cand["status"] != "pending":
        raise HTTPException(404, "candidate not found or already resolved")
    lead_ids = {cand["lead_id_a"], cand["lead_id_b"]}
    if body.survivor_id not in lead_ids:
        raise HTTPException(400, "survivor_id must be one of the two candidate leads")
    loser_id = (lead_ids - {body.survivor_id}).pop()

    survivor = await db.leads.find_one(_active(user["workspace_id"], id=body.survivor_id))
    loser = await db.leads.find_one(_active(user["workspace_id"], id=loser_id))
    if not survivor or not loser:
        raise HTTPException(404, "one of the leads no longer exists")

    # Reassign everything keyed by lead_id onto the survivor.
    for col in (db.lead_notes, db.lead_tasks, db.activities, db.deals):
        await col.update_many({"lead_id": loser_id, "workspace_id": user["workspace_id"]},
                               {"$set": {"lead_id": body.survivor_id}})

    if body.overrides:
        safe_overrides = {k: v for k, v in body.overrides.items() if k in LeadUpdate.model_fields}
        if safe_overrides:
            safe_overrides["updated_at"] = now_iso()
            await db.leads.update_one({"id": body.survivor_id, "workspace_id": user["workspace_id"]},
                                       {"$set": safe_overrides})

    await db.leads.update_one(
        {"id": loser_id, "workspace_id": user["workspace_id"]},
        {"$set": {"deleted_at": now_iso(), "deleted_by": user["id"]}},
    )
    await db.dedup_candidates.update_one({"id": candidate_id}, {"$set": {"status": "merged"}})
    # Any other pending candidate involving the now-deleted lead is stale.
    await db.dedup_candidates.update_many(
        {"workspace_id": user["workspace_id"], "status": "pending",
         "$or": [{"lead_id_a": loser_id}, {"lead_id_b": loser_id}]},
        {"$set": {"status": "dismissed"}},
    )
    await _log_activity(user["workspace_id"], body.survivor_id, "crm", "leads_merged",
                         f"{user.get('name') or user.get('email')} merged a duplicate lead into this one",
                         {"merged_lead_id": loser_id})
    await _audit(user, "crm.duplicates.merge", {"survivor_id": body.survivor_id, "loser_id": loser_id})
    return {"ok": True, "survivor_id": body.survivor_id}


@crm_router.post("/crm/duplicates/{candidate_id}/dismiss")
async def dismiss_duplicate(candidate_id: str, user=Depends(require_role("org_admin", "campaign_manager"))):
    result = await db.dedup_candidates.update_one(
        {"id": candidate_id, "workspace_id": user["workspace_id"], "status": "pending"},
        {"$set": {"status": "dismissed"}},
    )
    if result.matched_count == 0:
        raise HTTPException(404, "not found")
    return {"ok": True}


# ----------------------------- Custom fields -----------------------------------
# v1 scope: leads only (the same "leads first, extend later" pattern the rest
# of this module already follows), 4 simple types — matches what Twenty itself
# ships, not a bigger type system nobody's asked for.
CUSTOM_FIELD_TYPES = {"text", "number", "date", "select"}


class CustomFieldDefIn(BaseModel):
    entity: str = "lead"
    name: str
    type: str
    options: List[str] = []


class CustomFieldDefUpdate(BaseModel):
    name: Optional[str] = None
    options: Optional[List[str]] = None
    archived: Optional[bool] = None
    order: Optional[int] = None


def _slugify_key(name: str) -> str:
    key = "".join(c.lower() if c.isalnum() else "_" for c in name).strip("_")
    while "__" in key:
        key = key.replace("__", "_")
    return key or new_id()[:8]


@crm_router.get("/crm/custom-fields")
async def list_custom_fields(entity: Optional[str] = None, user=Depends(current_user)):
    q = {"workspace_id": user["workspace_id"]}
    if entity:
        q["entity"] = entity
    return await db.custom_field_defs.find(q, {"_id": 0}).sort("order", 1).to_list(200)


@crm_router.post("/crm/custom-fields")
async def create_custom_field(body: CustomFieldDefIn, user=Depends(require_role("org_admin"))):
    if body.type not in CUSTOM_FIELD_TYPES:
        raise HTTPException(400, f"type must be one of {sorted(CUSTOM_FIELD_TYPES)}")
    if body.type == "select" and not body.options:
        raise HTTPException(400, "select fields need at least one option")
    key = _slugify_key(body.name)
    if await db.custom_field_defs.find_one({
        "workspace_id": user["workspace_id"], "entity": body.entity, "key": key, "archived": {"$ne": True},
    }):
        raise HTTPException(400, "A field with this name already exists")
    count = await db.custom_field_defs.count_documents({"workspace_id": user["workspace_id"], "entity": body.entity})
    doc = {
        "id": new_id(), "workspace_id": user["workspace_id"], "entity": body.entity,
        "name": body.name, "key": key, "type": body.type, "options": body.options,
        "archived": False, "order": count, "created_at": now_iso(),
    }
    await db.custom_field_defs.insert_one(doc)
    doc.pop("_id", None)
    return doc


@crm_router.put("/crm/custom-fields/{fid}")
async def update_custom_field(fid: str, body: CustomFieldDefUpdate, user=Depends(require_role("org_admin"))):
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(400, "No fields to update")
    result = await db.custom_field_defs.update_one(
        {"id": fid, "workspace_id": user["workspace_id"]}, {"$set": updates},
    )
    if result.matched_count == 0:
        raise HTTPException(404, "not found")
    return await db.custom_field_defs.find_one({"id": fid, "workspace_id": user["workspace_id"]}, {"_id": 0})


@crm_router.delete("/crm/custom-fields/{fid}")
async def archive_custom_field(fid: str, user=Depends(require_role("org_admin"))):
    # Archive, never hard-delete — a field with existing values on records
    # shouldn't silently lose that data just because the definition is gone.
    result = await db.custom_field_defs.update_one(
        {"id": fid, "workspace_id": user["workspace_id"]}, {"$set": {"archived": True}},
    )
    if result.matched_count == 0:
        raise HTTPException(404, "not found")
    return {"ok": True}
