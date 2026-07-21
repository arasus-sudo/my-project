"""Service Library — Unlimited Services with AI Generation & Improvement.

Each service has a rich profile (name, description, pain points, target persona,
competitors, use cases, case studies, etc.). Users can manually create services,
generate them with AI from a description/website/brochure, or improve existing
services with competitive analysis.
"""

import json
import logging
import re
from typing import Dict, List, Optional, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from server import db, current_user, now_iso, new_id, _llm_chat, _extract_json, ANTHROPIC_API_KEY, _rate_ok

logger = logging.getLogger("service_library")
router = APIRouter(prefix="/services")


# ---------------------------------------------------------------------------
# Pydantic Models
# ---------------------------------------------------------------------------

class ServiceIn(BaseModel):
    name: str
    description: str = ""
    pain_points: List[str] = []
    target_persona: str = ""
    industry: str = ""
    keywords: List[str] = []
    cta: str = ""
    primary_offer: str = ""
    pricing: Optional[str] = None
    competitors: List[str] = []
    use_cases: List[str] = []
    case_studies: List[str] = []
    attachments: List[str] = []
    status: str = "active"


class ServiceGenerateIn(BaseModel):
    method: str = "description"  # "description" | "website" | "brochure"
    input_text: str = ""
    website_url: Optional[str] = None
    industry: Optional[str] = None


class ServiceImproveIn(BaseModel):
    competitor_urls: List[str] = []


# ---------------------------------------------------------------------------
# AI Generation
# ---------------------------------------------------------------------------

SERVICE_GENERATE_SYSTEM = """You are a Senior Product Marketing Manager and Service Strategist.

You help SaaS companies define and position their services for maximum market impact.

Given a description of a service, generate a comprehensive service profile with:
- A compelling name and description
- Key pain points this service solves
- Target buyer persona (who buys this, what titles)
- Industry focus
- Relevant keywords for targeting
- Strong call-to-action
- Primary offer
- Use cases
- Competitors in this space

Return STRICT JSON ONLY with this exact schema:
{
  "name": "Service name",
  "description": "2-3 sentence compelling description",
  "pain_points": ["Pain point 1", "Pain point 2", "..."],
  "target_persona": "Job titles and buyer persona description",
  "industry": "Target industry or industries",
  "keywords": ["keyword 1", "keyword 2", "..."],
  "cta": "Call to action (e.g. 'Book a demo' or 'Get a quote')",
  "primary_offer": "What the core offering is",
  "pricing": "Pricing model if applicable or null",
  "competitors": ["Competitor 1", "Competitor 2", "..."],
  "use_cases": ["Use case 1", "Use case 2", "..."],
  "case_studies": ["Hypothetical case study scenario 1", "Scenario 2"],
  "attachments": []
}"""

SERVICE_IMPROVE_SYSTEM = """You are a Senior Competitive Intelligence Analyst.

Your job is to analyse a company's service offering in the context of its competitors and the market, and suggest improvements to make the service more compelling and differentiated.

Given the current service profile and competitor context, suggest:
- A stronger description that better positions the service
- Additional pain points that competitors address
- Better value proposition and ROI messaging
- Stronger call-to-action
- New sales angles and triggers
- Decision maker titles to target
- Objections and how to handle them

Return STRICT JSON ONLY with this exact schema:
{
  "description": "Improved service description",
  "pain_points": ["expanded pain points"],
  "value_proposition": "Clear value prop with ROI framing",
  "cta": "Stronger call-to-action",
  "use_cases": ["additional use cases"],
  "sales_angles": ["Angle 1", "Angle 2", "..."],
  "triggers": ["Trigger event 1", "Trigger event 2", "..."],
  "decision_makers": ["Job title 1", "Job title 2", "..."],
  "objections": [
    {"objection": "Too expensive", "handling": "ROI framing response"},
    {"objection": "Already using vendor", "handling": "Differentiation response"}
  ],
  "keywords": ["additional keywords"],
  "competitors": ["expanded competitor list"],
  "improvements": ["Summary of key improvements made"]
}"""


async def _ai_generate_service(input_text: str, industry: Optional[str] = None) -> Dict[str, Any]:
    """Generate a service profile using AI."""
    context = f"Industry context: {industry}\n" if industry else ""
    user_text = f"{context}Service description: {input_text}\n\nGenerate a comprehensive service profile based on this description."
    raw = await _llm_chat(SERVICE_GENERATE_SYSTEM, user_text, f"svc-gen-{new_id()[:8]}")
    parsed = _extract_json(raw)
    if not parsed:
        raise RuntimeError("AI returned invalid JSON for service generation")
    return parsed


async def _ai_improve_service(service: Dict[str, Any], competitors_info: str = "") -> Dict[str, Any]:
    """Improve an existing service profile using AI."""
    current = json.dumps(service, indent=2)
    user_text = f"Current service profile:\n{current}\n\nCompetitor context:\n{competitors_info}\n\nSuggest improvements to this service profile."
    raw = await _llm_chat(SERVICE_IMPROVE_SYSTEM, user_text, f"svc-improve-{new_id()[:8]}")
    parsed = _extract_json(raw)
    if not parsed:
        raise RuntimeError("AI returned invalid JSON for service improvement")
    return parsed


async def _fetch_competitor_info(urls: List[str]) -> str:
    """Fetch competitor website content for context."""
    import urllib.request
    texts = []
    for url in urls[:3]:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 InnoiraSuite"})
            with urllib.request.urlopen(req, timeout=6) as r:
                raw = r.read(150_000).decode("utf-8", errors="ignore")
            raw = re.sub(r"<(script|style)[\s\S]*?</\1>", " ", raw, flags=re.I)
            text = re.sub(r"<[^>]+>", " ", raw)
            text = re.sub(r"\s+", " ", text)[:4000].strip()
            texts.append(f"--- {url} ---\n{text}")
        except Exception as ex:
            texts.append(f"--- {url} ---\n(failed to fetch: {ex})")
    return "\n\n".join(texts)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("")
async def list_services(user=Depends(current_user)):
    """List all services."""
    return await db.service_library.find(
        {"workspace_id": user["workspace_id"]},
        {"_id": 0},
    ).sort("created_at", -1).to_list(500)


@router.post("")
async def create_service(body: ServiceIn, user=Depends(current_user)):
    """Create a new service manually."""
    doc = body.model_dump()
    doc.update({
        "id": new_id(),
        "workspace_id": user["workspace_id"],
        "source": "manual",
        "created_at": now_iso(),
        "updated_at": now_iso(),
    })
    await db.service_library.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/{sid}")
async def get_service(sid: str, user=Depends(current_user)):
    """Get a single service."""
    doc = await db.service_library.find_one(
        {"id": sid, "workspace_id": user["workspace_id"]},
        {"_id": 0},
    )
    if not doc:
        raise HTTPException(404, "Service not found")
    return doc


@router.put("/{sid}")
async def update_service(sid: str, body: ServiceIn, user=Depends(current_user)):
    """Update a service."""
    existing = await db.service_library.find_one(
        {"id": sid, "workspace_id": user["workspace_id"]},
        {"_id": 0},
    )
    if not existing:
        raise HTTPException(404, "Service not found")
    update = body.model_dump()
    update["updated_at"] = now_iso()
    await db.service_library.update_one(
        {"id": sid, "workspace_id": user["workspace_id"]},
        {"$set": update},
    )
    return {**existing, **update, "updated_at": now_iso()}


@router.delete("/{sid}")
async def delete_service(sid: str, user=Depends(current_user)):
    """Delete a service."""
    await db.service_library.delete_one(
        {"id": sid, "workspace_id": user["workspace_id"]},
    )
    return {"ok": True}


@router.post("/generate")
async def generate_service(body: ServiceGenerateIn, user=Depends(current_user)):
    """AI-generate a service profile from a description, website, or brochure."""
    if not await _rate_ok(user):
        raise HTTPException(429, "Daily AI quota exceeded")

    input_text = body.input_text
    if body.method == "website" and body.website_url:
        import urllib.request
        try:
            req = urllib.request.Request(body.website_url, headers={"User-Agent": "Mozilla/5.0 InnoiraSuite"})
            with urllib.request.urlopen(req, timeout=8) as r:
                raw = r.read(200_000).decode("utf-8", errors="ignore")
            raw = re.sub(r"<(script|style)[\s\S]*?</\1>", " ", raw, flags=re.I)
            input_text = re.sub(r"<[^>]+>", " ", raw)
            input_text = re.sub(r"\s+", " ", input_text)[:6000].strip()
        except Exception as ex:
            raise HTTPException(502, f"Failed to fetch website: {ex}")

    if not input_text:
        raise HTTPException(400, "Input text is required for AI generation")

    try:
        profile = await _ai_generate_service(input_text, body.industry)
    except RuntimeError as ex:
        raise HTTPException(502, str(ex))

    doc = {
        "id": new_id(),
        "workspace_id": user["workspace_id"],
        "name": profile.get("name", "Untitled Service"),
        "description": profile.get("description", ""),
        "pain_points": profile.get("pain_points", []),
        "target_persona": profile.get("target_persona", ""),
        "industry": profile.get("industry", body.industry or ""),
        "keywords": profile.get("keywords", []),
        "cta": profile.get("cta", ""),
        "primary_offer": profile.get("primary_offer", ""),
        "pricing": profile.get("pricing"),
        "competitors": profile.get("competitors", []),
        "use_cases": profile.get("use_cases", []),
        "case_studies": profile.get("case_studies", []),
        "attachments": profile.get("attachments", []),
        "status": "active",
        "source": "ai_generated",
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.service_library.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.post("/{sid}/improve")
async def improve_service(sid: str, body: ServiceImproveIn, user=Depends(current_user)):
    """AI-improve an existing service with competitive analysis."""
    if not await _rate_ok(user):
        raise HTTPException(429, "Daily AI quota exceeded")

    service = await db.service_library.find_one(
        {"id": sid, "workspace_id": user["workspace_id"]},
        {"_id": 0},
    )
    if not service:
        raise HTTPException(404, "Service not found")

    competitors_info = ""
    if body.competitor_urls:
        competitors_info = await _fetch_competitor_info(body.competitor_urls)

    try:
        improvements = await _ai_improve_service(service, competitors_info)
    except RuntimeError as ex:
        raise HTTPException(502, str(ex))

    await db.service_library.update_one(
        {"id": sid, "workspace_id": user["workspace_id"]},
        {"$set": {
            "description": improvements.get("description", service["description"]),
            "pain_points": improvements.get("pain_points", service.get("pain_points", [])),
            "cta": improvements.get("cta", service.get("cta", "")),
            "use_cases": improvements.get("use_cases", service.get("use_cases", [])),
            "keywords": improvements.get("keywords", service.get("keywords", [])),
            "competitors": improvements.get("competitors", service.get("competitors", [])),
            "source": "ai_improved",
            "improvements": improvements.get("improvements", []),
            "updated_at": now_iso(),
        }},
    )

    updated = await db.service_library.find_one(
        {"id": sid, "workspace_id": user["workspace_id"]},
        {"_id": 0},
    )
    return {"service": updated, "improvements": improvements}


@router.post("/{sid}/duplicate")
async def duplicate_service(sid: str, user=Depends(current_user)):
    """Duplicate a service."""
    service = await db.service_library.find_one(
        {"id": sid, "workspace_id": user["workspace_id"]},
        {"_id": 0},
    )
    if not service:
        raise HTTPException(404, "Service not found")

    doc = {k: v for k, v in service.items() if k != "id"}
    doc.update({
        "id": new_id(),
        "name": f"{service['name']} (copy)",
        "source": service.get("source", "manual"),
        "created_at": now_iso(),
        "updated_at": now_iso(),
    })
    await db.service_library.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.post("/{sid}/archive")
async def archive_service(sid: str, user=Depends(current_user)):
    """Archive a service."""
    service = await db.service_library.find_one(
        {"id": sid, "workspace_id": user["workspace_id"]},
        {"_id": 0},
    )
    if not service:
        raise HTTPException(404, "Service not found")
    new_status = "archived" if service.get("status") != "archived" else "active"
    await db.service_library.update_one(
        {"id": sid, "workspace_id": user["workspace_id"]},
        {"$set": {"status": new_status, "updated_at": now_iso()}},
    )
    return {"status": new_status}
