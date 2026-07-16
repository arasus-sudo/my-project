"""Proposal EQ — deep-research proposal generator.

Rewritten from the old single-call slide-deck generator into a document engine:

  deal + service template
    -> Context Pack (crm_adapters + research + HubSpot engagements, cached 24h)
    -> 6-step chain (Solution Fit -> Scope -> Pricing -> Risks -> Exec Summary)
    -> structured sections + a REAL priced table (money math in Python)
    -> edit inline -> export DOCX / text-selectable PDF

The deck/PPTX path is retired (Create EQ keeps its slide engine). Pricing is now
numeric with quantities and totals — never LLM free-form.
"""

import re
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse, Response
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

from server import (
    db, current_user, now_iso, new_id, _audit, _log_activity,
)
import proposal_templates
import context_pack
import proposal_chain
import proposal_docx
import proposal_pdf

proposal_router = APIRouter(prefix="/proposal-eq")


# ----------------------------- Models ------------------------------------------
class PricingItemIn(BaseModel):
    name: str
    unit_price: float
    currency: str = "USD"
    unit: str = ""
    description: str = ""


class ProposalGenIn(BaseModel):
    deal_id: Optional[str] = None
    lead_id: Optional[str] = None      # convenience: resolve/create the deal
    template_id: Optional[str] = None
    service: str = "custom"
    topic: str = ""


# ----------------------------- Pricing catalog (structured) ---------------------
def _migrate_price(item: Dict[str, Any]) -> Dict[str, Any]:
    """Old items stored `price` as a free-text string ("$1,499"). Parse the number
    out on read so legacy catalogs keep working after the numeric switch."""
    if "unit_price" in item and item["unit_price"] is not None:
        return item
    raw = str(item.get("price", "") or "")
    num = re.sub(r"[^\d.]", "", raw)
    item["unit_price"] = float(num) if num else 0.0
    item["currency"] = item.get("currency", "USD")
    return item


@proposal_router.get("/pricing-catalog")
async def list_pricing(user=Depends(current_user)):
    items = await db.pricing_catalog.find({"workspace_id": user["workspace_id"]}, {"_id": 0}).to_list(200)
    out = []
    for it in items:
        migrated = _migrate_price(it)
        # Persist the migration so it happens once, not on every read.
        if "price" in it:
            await db.pricing_catalog.update_one(
                {"id": it["id"]},
                {"$set": {"unit_price": migrated["unit_price"], "currency": migrated["currency"]},
                 "$unset": {"price": ""}})
            migrated.pop("price", None)
        out.append(migrated)
    return out


@proposal_router.post("/pricing-catalog")
async def create_pricing_item(body: PricingItemIn, user=Depends(current_user)):
    doc = body.model_dump()
    doc.update({"id": new_id(), "workspace_id": user["workspace_id"], "created_at": now_iso()})
    await db.pricing_catalog.insert_one(doc)
    doc.pop("_id", None)
    return doc


@proposal_router.put("/pricing-catalog/{item_id}")
async def update_pricing_item(item_id: str, body: PricingItemIn, user=Depends(current_user)):
    patch = body.model_dump()
    await db.pricing_catalog.update_one(
        {"id": item_id, "workspace_id": user["workspace_id"]}, {"$set": patch})
    doc = await db.pricing_catalog.find_one(
        {"id": item_id, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "not found")
    return doc


@proposal_router.delete("/pricing-catalog/{item_id}")
async def delete_pricing_item(item_id: str, user=Depends(current_user)):
    await db.pricing_catalog.delete_one({"id": item_id, "workspace_id": user["workspace_id"]})
    return {"ok": True}


# ----------------------------- Templates ----------------------------------------
@proposal_router.get("/templates")
async def list_templates(user=Depends(current_user)):
    return await proposal_templates.list_templates(user["workspace_id"])


# ----------------------------- Proposals ----------------------------------------
@proposal_router.get("/proposals")
async def list_proposals(user=Depends(current_user)):
    items = await db.proposals.find({"workspace_id": user["workspace_id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    for p in items:
        p["lead"] = await db.leads.find_one(
            {"id": p.get("lead_id")}, {"_id": 0, "first_name": 1, "last_name": 1, "company": 1})
    return items


@proposal_router.get("/proposals/{pid}")
async def get_proposal(pid: str, user=Depends(current_user)):
    p = await db.proposals.find_one({"id": pid, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not p:
        raise HTTPException(404, "not found")
    return p


async def _resolve_deal(workspace_id: str, body: ProposalGenIn) -> Dict[str, Any]:
    """A proposal is written for a deal. Accept a deal_id directly, or a lead_id and
    find/create that lead's deal — so the flow works from a lead too."""
    if body.deal_id:
        deal = await db.deals.find_one({"id": body.deal_id, "workspace_id": workspace_id}, {"_id": 0})
        if not deal:
            raise HTTPException(404, "deal not found")
        return deal

    if not body.lead_id:
        raise HTTPException(400, "a deal_id or lead_id is required")
    lead = await db.leads.find_one({"id": body.lead_id, "workspace_id": workspace_id}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "lead not found")
    deal = await db.deals.find_one({"lead_id": lead["id"], "workspace_id": workspace_id}, {"_id": 0})
    if deal:
        return deal
    deal = {
        "id": new_id(), "workspace_id": workspace_id, "lead_id": lead["id"],
        "title": body.topic or f"{lead.get('company') or lead.get('first_name')} — proposal",
        "value": 0, "stage": "proposal", "currency": "USD", "created_at": now_iso(),
    }
    await db.deals.insert_one(dict(deal))
    return deal


@proposal_router.post("/generate")
async def generate_proposal(body: ProposalGenIn, user=Depends(current_user)):
    wid = user["workspace_id"]
    deal = await _resolve_deal(wid, body)

    from billing import charge_credits
    await charge_credits(wid, "proposal_generate", meta={"deal_id": deal["id"]})

    template = await proposal_templates.get_template(wid, body.template_id) \
        if body.template_id else None
    if not template:
        templates = await proposal_templates.list_templates(wid)
        template = next((t for t in templates if t["service"] == body.service), templates[-1])

    pack = await context_pack.build(wid, deal["id"])
    catalog = await list_pricing(user)   # migrated, numeric

    ws = await db.workspaces.find_one({"id": wid}, {"_id": 0})
    offer = (ws or {}).get("brand_voice", {}).get("offer") or \
        "The Innoira Agentic Suite — AI agents for outbound, calls, scheduling and proposals."

    try:
        built = await proposal_chain.run(
            pack, template, service=body.service, offer=offer, catalog=catalog)
    except proposal_chain.ChainError as ex:
        raise HTTPException(502, f"Proposal chain failed: {ex}")

    lead = await db.leads.find_one({"id": deal["lead_id"]}, {"_id": 0}) or {}
    topic = body.topic or f"{template['name']} — {lead.get('company') or lead.get('first_name') or 'Proposal'}"

    doc = {
        "id": new_id(), "workspace_id": wid, "owner_id": user["id"],
        "lead_id": deal["lead_id"], "deal_id": deal["id"], "topic": topic,
        "service": body.service, "template_id": template["id"], "template_name": template["name"],
        "status": "draft",
        "sections": built["sections"],
        "pricing": built["pricing"],
        "client_facts": pack.get("client_facts", {}),
        "missing": built.get("missing", []),
        "created_at": now_iso(), "updated_at": now_iso(), "sent_at": None,
    }
    await db.proposals.insert_one(doc)
    doc.pop("_id", None)
    await _audit(user, "proposal_eq.proposal.generate", {"id": doc["id"], "deal_id": deal["id"]})
    await _log_activity(wid, deal["lead_id"], "proposal", "proposal_generated",
                        f"Generated proposal: {topic}", {"proposal_id": doc["id"]})
    return doc


@proposal_router.put("/proposals/{pid}")
async def update_proposal(pid: str, body: Dict[str, Any], user=Depends(current_user)):
    p = await db.proposals.find_one({"id": pid, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not p:
        raise HTTPException(404, "not found")

    allowed = {k: v for k, v in body.items() if k in {"sections", "topic", "status"}}

    # Pricing edits are re-priced server-side: the client can change quantities,
    # add/remove lines and set a discount, but never the totals — money math stays
    # in Python (draft chain's rule, applied to manual edits too).
    if "pricing" in body and isinstance(body["pricing"], dict):
        catalog = await list_pricing(user)
        by_id = {c["id"]: c for c in catalog}
        selections = []
        for li in body["pricing"].get("line_items", []):
            selections.append({"catalog_id": li.get("catalog_id"), "qty": li.get("qty", 1)})
        # Allow ad-hoc lines not in the catalog (name + unit_price supplied inline).
        ad_hoc = [li for li in body["pricing"].get("line_items", [])
                  if li.get("catalog_id") not in by_id and li.get("name")]
        priced = proposal_chain.compute_pricing(
            catalog, selections, discount_pct=body["pricing"].get("discount_pct", 0),
            currency=body["pricing"].get("currency", p.get("pricing", {}).get("currency", "USD")))
        for li in ad_hoc:
            qty = max(1, int(li.get("qty", 1) or 1))
            up = round(float(li.get("unit_price", 0) or 0), 2)
            priced["line_items"].append({
                "catalog_id": None, "name": li["name"], "description": li.get("description", ""),
                "unit": li.get("unit", ""), "qty": qty, "unit_price": up,
                "line_total": round(qty * up, 2)})
        # Recompute totals including ad-hoc lines.
        priced["subtotal"] = round(sum(x["line_total"] for x in priced["line_items"]), 2)
        priced["discount"] = round(priced["subtotal"] * priced["discount_pct"] / 100.0, 2)
        priced["total"] = round(priced["subtotal"] - priced["discount"], 2)
        priced["notes"] = body["pricing"].get("notes", p.get("pricing", {}).get("notes", ""))
        allowed["pricing"] = priced

    allowed["updated_at"] = now_iso()
    await db.proposals.update_one({"id": pid}, {"$set": allowed})
    return await db.proposals.find_one({"id": pid}, {"_id": 0})


@proposal_router.post("/proposals/{pid}/mark-sent")
async def mark_proposal_sent(pid: str, user=Depends(current_user)):
    p = await db.proposals.find_one({"id": pid, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not p:
        raise HTTPException(404, "not found")
    await db.proposals.update_one({"id": pid}, {"$set": {"status": "sent", "sent_at": now_iso()}})
    await _log_activity(user["workspace_id"], p["lead_id"], "proposal", "proposal_sent",
                        f"Sent proposal “{p['topic']}”", {"proposal_id": pid})
    deal = await db.deals.find_one({"id": p.get("deal_id"), "workspace_id": user["workspace_id"]}, {"_id": 0}) \
        or await db.deals.find_one({"lead_id": p["lead_id"], "workspace_id": user["workspace_id"]}, {"_id": 0})
    if deal and deal.get("stage") in ("new", "qualified", "meeting"):
        await db.deals.update_one({"id": deal["id"]}, {"$set": {"stage": "proposal"}})
    elif not deal:
        await db.deals.insert_one({
            "id": new_id(), "workspace_id": user["workspace_id"], "lead_id": p["lead_id"],
            "title": p["topic"], "value": p.get("pricing", {}).get("total", 0) or 0,
            "stage": "proposal", "currency": p.get("pricing", {}).get("currency", "USD"),
            "created_at": now_iso(), "source_proposal_id": pid,
        })
    return {"ok": True}


@proposal_router.delete("/proposals/{pid}")
async def delete_proposal(pid: str, user=Depends(current_user)):
    await db.proposals.delete_one({"id": pid, "workspace_id": user["workspace_id"]})
    return {"ok": True}


# ----------------------------- Exports ------------------------------------------
def _filename(p: Dict[str, Any], ext: str) -> str:
    base = re.sub(r"[^\w\-]+", "-", (p.get("topic") or "proposal")[:50]).strip("-")
    return f"{base or 'proposal'}.{ext}"


@proposal_router.get("/proposals/{pid}/export.docx")
async def export_docx(pid: str, user=Depends(current_user)):
    p = await db.proposals.find_one({"id": pid, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not p:
        raise HTTPException(404, "not found")
    data = proposal_docx.build_docx(p)
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{_filename(p, "docx")}"'},
    )


@proposal_router.get("/proposals/{pid}/export.pdf")
async def export_pdf(pid: str, user=Depends(current_user)):
    p = await db.proposals.find_one({"id": pid, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not p:
        raise HTTPException(404, "not found")
    data = proposal_pdf.build_pdf(p)
    return Response(
        content=data, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{_filename(p, "pdf")}"'},
    )
