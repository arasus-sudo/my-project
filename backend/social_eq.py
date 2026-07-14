"""Social EQ — autonomous social media drafting/scheduling agent.

Sixth agent in the Innoira Agentic Suite: drafts and schedules posts for
LinkedIn, Instagram, and YouTube. Ships fully mocked — no real platform
credentials exist yet — following the exact HubSpot "mocked until keys
provided" convention. Publishing always requires an explicit human
approve-then-publish action; nothing auto-publishes, and even once real
platform credentials are added, the same two-step gate stays in place.
"""

import json
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

from server import (
    db, current_user, now_iso, new_id, _audit, _log_activity,
    _llm_chat, _extract_json, ANTHROPIC_API_KEY,
)

social_router = APIRouter(prefix="/social-eq")

PROVIDERS = ("linkedin", "instagram", "youtube")

PLATFORM_GUIDANCE = {
    "linkedin": "LinkedIn: 1-3 short paragraphs, professional but human, hook in the first line, at most 3 hashtags.",
    "instagram": "Instagram: punchy, visual caption, light emoji use is fine, up to 8 relevant hashtags.",
    "youtube": "YouTube: headline is the video title (<=60 chars, searchable), body is the video description (2-3 sentences + a call to action).",
}


# ----------------------------- Models ------------------------------------------
class PostGenIn(BaseModel):
    platform: str
    topic: str
    tone: str = "confident, professional"
    lead_id: Optional[str] = None


class PostUpdateIn(BaseModel):
    headline: Optional[str] = None
    body: Optional[str] = None
    hashtags: Optional[List[str]] = None
    scheduled_for: Optional[str] = None


# ----------------------------- Integrations (MOCKED) -----------------------------
@social_router.get("/integrations")
async def list_integrations(user=Depends(current_user)):
    docs = await db.social_integrations.find({"workspace_id": user["workspace_id"]}, {"_id": 0}).to_list(10)
    by_provider = {d["provider"]: d for d in docs}
    return [by_provider.get(p, {"provider": p, "connected": False, "mocked": True}) for p in PROVIDERS]


@social_router.post("/integrations/{provider}/connect")
async def connect_integration(provider: str, user=Depends(current_user)):
    if provider not in PROVIDERS:
        raise HTTPException(400, "unknown provider")
    doc = {
        "id": new_id(), "workspace_id": user["workspace_id"], "provider": provider,
        "connected": True, "account_name": f"demo-{provider}-account",
        "connected_at": now_iso(), "mocked": True,
    }
    await db.social_integrations.replace_one(
        {"workspace_id": user["workspace_id"], "provider": provider}, doc, upsert=True,
    )
    await _audit(user, "social_eq.integration.connect", {"provider": provider, "mocked": True})
    return doc


@social_router.post("/integrations/{provider}/disconnect")
async def disconnect_integration(provider: str, user=Depends(current_user)):
    await db.social_integrations.delete_one({"workspace_id": user["workspace_id"], "provider": provider})
    await _audit(user, "social_eq.integration.disconnect", {"provider": provider})
    return {"ok": True}


# ----------------------------- Draft generation -----------------------------------
def _fallback_draft(platform: str, topic: str) -> Dict[str, Any]:
    return {"headline": topic[:60], "body": f"Draft post about: {topic}", "hashtags": []}


async def _draft_post(platform: str, topic: str, tone: str, lead_context: Optional[str]) -> Dict[str, Any]:
    if not ANTHROPIC_API_KEY:
        return _fallback_draft(platform, topic)
    system = (
        f"You are Social EQ, drafting a {platform} post. Tone: {tone}. "
        f"{PLATFORM_GUIDANCE.get(platform, '')} "
        "STRICT JSON only: {\"headline\": str, \"body\": str, \"hashtags\": [str]}"
    )
    user_text = json.dumps({"topic": topic, "lead_context": lead_context})
    try:
        resp = await _llm_chat(system, user_text, f"seq-social-{platform}")
        parsed = _extract_json(resp)
        if parsed and parsed.get("body"):
            return parsed
    except Exception:
        pass
    return _fallback_draft(platform, topic)


@social_router.post("/posts/generate")
async def generate_post(body: PostGenIn, user=Depends(current_user)):
    if body.platform not in PROVIDERS:
        raise HTTPException(400, "unknown platform")
    lead_context = None
    lead_id = body.lead_id
    if lead_id:
        lead = await db.leads.find_one({"id": lead_id, "workspace_id": user["workspace_id"]}, {"_id": 0})
        if lead:
            lead_context = f"{lead.get('first_name')} at {lead.get('company')}"

    draft = await _draft_post(body.platform, body.topic, body.tone, lead_context)
    doc = {
        "id": new_id(), "workspace_id": user["workspace_id"], "owner_id": user["id"],
        "lead_id": lead_id, "platform": body.platform, "topic": body.topic,
        "headline": draft.get("headline", ""), "body": draft.get("body", ""),
        "hashtags": draft.get("hashtags", []), "media_url": None,
        "status": "draft", "scheduled_for": None,
        "approved_by": None, "approved_at": None,
        "published_at": None, "platform_post_id": None, "engagement": None,
        "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.social_posts.insert_one(doc)
    doc.pop("_id", None)
    await _audit(user, "social_eq.post.generate", {"id": doc["id"], "platform": body.platform})
    if lead_id:
        await _log_activity(user["workspace_id"], lead_id, "social", "post_drafted",
                             f"Drafted a {body.platform} post: {doc['headline']}", {"post_id": doc["id"]})
    return doc


# ----------------------------- Posts CRUD + workflow ------------------------------
@social_router.get("/posts")
async def list_posts(platform: Optional[str] = None, status: Optional[str] = None, user=Depends(current_user)):
    q: Dict[str, Any] = {"workspace_id": user["workspace_id"]}
    if platform:
        q["platform"] = platform
    if status:
        q["status"] = status
    return await db.social_posts.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)


@social_router.get("/posts/{pid}")
async def get_post(pid: str, user=Depends(current_user)):
    p = await db.social_posts.find_one({"id": pid, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not p:
        raise HTTPException(404, "not found")
    return p


@social_router.put("/posts/{pid}")
async def update_post(pid: str, body: PostUpdateIn, user=Depends(current_user)):
    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    patch["updated_at"] = now_iso()
    if "scheduled_for" in patch:
        patch["status"] = "scheduled"
    await db.social_posts.update_one({"id": pid, "workspace_id": user["workspace_id"]}, {"$set": patch})
    p = await db.social_posts.find_one({"id": pid, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not p:
        raise HTTPException(404, "not found")
    return p


@social_router.post("/posts/{pid}/approve")
async def approve_post(pid: str, user=Depends(current_user)):
    p = await db.social_posts.find_one({"id": pid, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not p:
        raise HTTPException(404, "not found")
    if p["status"] == "published":
        raise HTTPException(400, "already published")
    await db.social_posts.update_one({"id": pid}, {"$set": {
        "status": "approved", "approved_by": user["id"], "approved_at": now_iso(),
    }})
    await _audit(user, "social_eq.post.approve", {"id": pid})
    return {"ok": True}


@social_router.post("/posts/{pid}/publish")
async def publish_post(pid: str, user=Depends(current_user)):
    """The only route that can move a post to 'published'. Hard-gated: requires
    an explicit prior /approve call — nothing skips the human review step, and
    since every integration here is mocked, no real platform is actually
    contacted; this simulates the outcome."""
    p = await db.social_posts.find_one({"id": pid, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not p:
        raise HTTPException(404, "not found")
    if p["status"] != "approved":
        raise HTTPException(400, "post must be approved before it can be published")

    integration = await db.social_integrations.find_one(
        {"workspace_id": user["workspace_id"], "provider": p["platform"]}, {"_id": 0})
    mocked = not integration or integration.get("mocked", True)

    seed = sum(ord(c) for c in pid) % 500
    engagement = {"likes": seed % 200, "comments": seed % 20, "shares": seed % 10, "views": (seed % 200) * 8}

    await db.social_posts.update_one({"id": pid}, {"$set": {
        "status": "published", "published_at": now_iso(),
        "platform_post_id": f"mock-{p['platform']}-{pid[:8]}", "engagement": engagement,
    }})
    await _audit(user, "social_eq.post.publish", {"id": pid, "platform": p["platform"], "mocked": mocked})
    if p.get("lead_id"):
        await _log_activity(user["workspace_id"], p["lead_id"], "social", "post_published",
                             f"Published a {p['platform']} post: {p['headline']}", {"post_id": pid})
    return {"ok": True, "mocked": mocked, "engagement": engagement}


@social_router.delete("/posts/{pid}")
async def delete_post(pid: str, user=Depends(current_user)):
    await db.social_posts.delete_one({"id": pid, "workspace_id": user["workspace_id"]})
    return {"ok": True}
