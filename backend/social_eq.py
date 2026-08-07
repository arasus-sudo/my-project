"""Social EQ — autonomous social media drafting/scheduling agent.

Sixth agent in the Innoira Agentic Suite. Two ways to get a post into the
queue:

1. Manual — Compose a single post (`POST /posts/generate`), review it in the
   Queue, approve, publish. Unchanged from the original build.
2. Bulk import — upload a CSV/XLSX of dated content briefs
   (`POST /bulk-import`); each row generates one post per listed platform
   (static image or a linked carousel project + cover image), all posts land
   as `pending_approval`, and ONE digest email goes out with an Approve/Reject
   link per post — no login required to act on those links (see
   `social_public_router`). Approving without a manual publish click is fine:
   `run_social_publish_tick` (registered in server.py's scheduler) picks up
   `approved` posts and publishes them automatically once their scheduled
   time arrives (or immediately if none was set).

Real platform posting is mocked-first, exactly like every other integration
in this app (HubSpot, Twilio, Google): `linkedin_client.py`,
`instagram_client.py`, `youtube_client.py` each expose a static `*_MOCKED`
flag derived from whether real credentials are in `.env`. With none
configured, connect/publish simulate realistically. YouTube is a partial
exception — see `youtube_client.py`'s docstring: there is no public API for
creating a Community-tab post at all, on any platform credentials, so it
always simulates for that specific action.
"""

import csv
import io
import json
import logging
import secrets
import base64
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request
from fastapi.responses import HTMLResponse, PlainTextResponse, RedirectResponse, FileResponse

from pydantic import BaseModel

from server import (
    db, current_user, now_iso, new_id, _audit, _log_activity,
    _llm_chat, _extract_json, ANTHROPIC_API_KEY, generate_ai_image,
    FRONTEND_URL, PUBLIC_BASE_URL, _crawl_site, limiter, _workspace_or_ip_key,
)
from email_client import send_email
from import_utils import _parse_rows, _parse_date

import linkedin_client
import instagram_client
import youtube_client
import veo_client

log = logging.getLogger(__name__)

social_router = APIRouter(prefix="/social-eq")
social_public_router = APIRouter()

PROVIDERS = ("linkedin", "instagram", "youtube")
CLIENTS = {"linkedin": linkedin_client, "instagram": instagram_client, "youtube": youtube_client}

PLATFORM_GUIDANCE = {
    "linkedin": "LinkedIn: 1-3 short paragraphs, professional but human, hook in the first line, at most 3 hashtags.",
    "instagram": "Instagram: punchy, visual caption, light emoji use is fine, up to 8 relevant hashtags.",
    "youtube": "YouTube: headline is the video title (<=60 chars, searchable), body is the video description (2-3 sentences + a call to action).",
}

MEDIA_DIR = Path(__file__).parent / "media" / "social"
MEDIA_DIR.mkdir(parents=True, exist_ok=True)

REQUIRED_IMPORT_COLUMNS = ("date", "platforms", "topic")
IMPORT_TEMPLATE_COLUMNS = ("date", "platforms", "topic", "content_type", "tone", "cta")


# ----------------------------- Models ------------------------------------------
class PostGenIn(BaseModel):
    platform: str
    topic: str
    tone: str = "confident, professional"
    lead_id: Optional[str] = None
    content_type: str = "static"  # "text" | "static" | "carousel" | "video"
    first_comment: Optional[str] = None


class CreateEqPublishIn(BaseModel):
    """A post drafted inside Create EQ and handed to Social EQ for caption
    generation + approval. The file (PDF carousel or a single-slide PNG) is
    sent base64; this route never rasterizes slides itself — Create EQ is the
    browser-side renderer, and re-rendering server-side would need a browser
    runtime. `project_id` is the Create EQ carousel doc's id, used only for
    the back-link and stored on the post for the queue's "open in Create EQ"."""
    project_id: str
    topic: str
    content_type: str = "carousel"  # "carousel" | "static"
    platform: str = "linkedin"      # v1: only linkedin carries documents
    tone: str = "confident, professional"
    file_b64: str
    first_comment: Optional[str] = None


class CreateEqPublishOut(BaseModel):
    post_id: str
    status: str
    headline: str
    body: str
    hashtags: List[str]
    carousel_project_id: Optional[str] = None
    media_url: Optional[str] = None


class PostUpdateIn(BaseModel):
    headline: Optional[str] = None
    body: Optional[str] = None
    hashtags: Optional[List[str]] = None
    scheduled_for: Optional[str] = None
    first_comment: Optional[str] = None


class HashtagGroupIn(BaseModel):
    name: str
    hashtags: List[str]


class RssFeedIn(BaseModel):
    feed_url: str
    platforms: List[str]
    content_type: str = "static"
    tone: str = "confident, professional"
    active: bool = True


class SetupAnalyzeIn(BaseModel):
    persona_type: str
    input_text: str = ""
    url: str = ""


# ----------------------------- Media hosting (public — Instagram must fetch it) --
# LinkedIn's upload API takes raw bytes we send it directly, so it never needs
# this route. Instagram's Content Publishing API only accepts a public
# `image_url` it fetches itself — this route is that URL.
def _media_path(post_id: str, filename: str) -> Path:
    return MEDIA_DIR / post_id / filename


def _save_media(post_id: str, image_bytes: bytes, ext: str = "png") -> str:
    folder = MEDIA_DIR / post_id
    folder.mkdir(parents=True, exist_ok=True)
    filename = f"image.{ext}"
    (folder / filename).write_bytes(image_bytes)
    return filename


def _save_document(post_id: str, document_bytes: bytes, ext: str = "pdf") -> str:
    """Same bucket as `_save_media`, but name the file `document.<pdf>` so the
    publish path can tell a document post apart from an image post by
    extension — LinkedIn document uploads (PDF carousels) go through a
    different API flow than images, so this must be distinguishable at
    publish time without extra fields."""
    folder = MEDIA_DIR / post_id
    folder.mkdir(parents=True, exist_ok=True)
    filename = f"document.{ext}"
    (folder / filename).write_bytes(document_bytes)
    return filename


def _public_media_url(post: Dict[str, Any]) -> Optional[str]:
    if not post.get("media_url") or not PUBLIC_BASE_URL:
        return None
    return f"{PUBLIC_BASE_URL}/api{post['media_url']}"


async def _brand_kit_colors(workspace_id: str, brand_kit_id: Optional[str]) -> List[str]:
    if not brand_kit_id:
        return []
    kit = await db.brandkits.find_one({"id": brand_kit_id, "workspace_id": workspace_id}, {"_id": 0, "colors": 1})
    return (kit or {}).get("colors") or []


async def _generate_media(user: Dict[str, Any], post_id: str, topic: str,
                          platform: str, content_type: str,
                          brand_voice: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """One image-generation path for both manual Compose and bulk-import, so
    a post looks and costs the same regardless of which route created it.
    For `content_type="carousel"` this also spins up a full editable
    multi-slide project in Create EQ (linked via `carousel_project_id`) —
    the social post itself still publishes with the cover image + caption,
    since native multi-image carousel publishing to each platform is a
    larger, separate build (see plan notes). Brand colors are baked into the
    generation prompt ("compliance by construction") rather than checked
    post-hoc, since the shared LLM helper isn't a vision model.

    For `content_type="video"`, generation is async (Veo takes minutes, not
    a same-request round trip) — this only submits the job and returns
    `video_status: "processing"` + `video_operation_name`; `media_url` stays
    None until `run_video_poll_tick` fills it in once Veo finishes."""
    if content_type == "text":
        return {"media_url": None, "carousel_project_id": None,
                "video_status": None, "video_operation_name": None}

    if content_type == "video":
        colors = await _brand_kit_colors(user["workspace_id"], (brand_voice or {}).get("brand_kit_id"))
        style_hint = f" Visual style: clean, modern, on-brand, using a color palette of {', '.join(colors)}." \
            if colors else " Visual style: clean, modern, professional."
        video_prompt = f"Short social media video about: {topic}.{style_hint}"
        try:
            op_name = await veo_client.submit_video_job(video_prompt)
            return {"media_url": None, "carousel_project_id": None,
                    "video_status": "processing", "video_operation_name": op_name}
        except Exception as ex:
            log.warning("video generation submit failed for post %s: %s", post_id, ex)
            return {"media_url": None, "carousel_project_id": None,
                    "video_status": "failed", "video_operation_name": None}

    media_url, carousel_project_id = None, None
    colors = await _brand_kit_colors(user["workspace_id"], (brand_voice or {}).get("brand_kit_id"))
    style_hint = f"Style: clean, modern, on-brand, using a color palette of {', '.join(colors)}." if colors \
        else "Style: clean, modern, professional."
    image_prompt = (
        f"Carousel cover image for a social post about: {topic}. {style_hint}"
        if content_type == "carousel" else
        f"Social media static post image about: {topic}. {style_hint}"
    )
    try:
        size = "1080x1080" if platform == "instagram" else "1080x1350"
        img = await generate_ai_image(user, image_prompt, size=size)
        filename = _save_media(post_id, img["image_bytes"])
        media_url = f"/social-eq/media/{post_id}/{filename}"
    except Exception as ex:
        log.warning("image generation failed for post %s: %s", post_id, ex)

    if content_type == "carousel":
        try:
            from server import carousel_generate, CarouselGenIn
            proj = await carousel_generate(CarouselGenIn(topic=topic, platform="square", slide_count=6), user)
            carousel_project_id = proj["id"]
        except Exception as ex:
            log.warning("linked carousel project generation failed for post %s: %s", post_id, ex)

    return {"media_url": media_url, "carousel_project_id": carousel_project_id,
            "video_status": None, "video_operation_name": None}


@social_public_router.get("/social-eq/media/{post_id}/{filename}")
async def get_media(post_id: str, filename: str):
    path = _media_path(post_id, filename)
    if not path.is_file():
        raise HTTPException(404, "not found")
    return FileResponse(path)


# ----------------------------- Integrations (real OAuth, mocked-first) -----------
@social_router.get("/integrations")
async def list_integrations(user=Depends(current_user)):
    docs = await db.social_integrations.find({"workspace_id": user["workspace_id"]}, {"_id": 0}).to_list(10)
    by_provider = {d["provider"]: d for d in docs}
    out = []
    for p in PROVIDERS:
        client_status = CLIENTS[p].status()
        d = by_provider.get(p)
        if d:
            d = {**d, **client_status}
        else:
            d = {"provider": p, "connected": False, **client_status}
        out.append(d)
    return out


@social_router.post("/integrations/{provider}/connect")
async def connect_integration(provider: str, user=Depends(current_user)):
    if provider not in PROVIDERS:
        raise HTTPException(400, "unknown provider")
    client = CLIENTS[provider]
    if client.status()["mocked"]:
        doc = {
            "id": new_id(), "workspace_id": user["workspace_id"], "provider": provider,
            "connected": True, "account_name": f"demo-{provider}-account",
            "connected_at": now_iso(), "mocked": True,
        }
        await db.social_integrations.replace_one(
            {"workspace_id": user["workspace_id"], "provider": provider}, doc, upsert=True,
        )
        await _audit(user, "social_eq.integration.connect", {"provider": provider, "mocked": True})
        return {**doc, "url": None}

    state = secrets.token_urlsafe(24)
    await db.oauth_states.insert_one({
        "state": state, "kind": f"social_{provider}",
        "workspace_id": user["workspace_id"], "user_id": user["id"], "at": now_iso(),
    })
    return {"url": client.auth_url(state), "mocked": False}


@social_router.post("/integrations/{provider}/disconnect")
async def disconnect_integration(provider: str, user=Depends(current_user)):
    await db.social_integrations.delete_one({"workspace_id": user["workspace_id"], "provider": provider})
    await _audit(user, "social_eq.integration.disconnect", {"provider": provider})
    return {"ok": True}


@social_public_router.get("/social-eq/oauth/{provider}/callback")
async def oauth_callback(provider: str, code: str, state: str):
    """PUBLIC. The platform redirects the browser here after the user grants access."""
    if provider not in PROVIDERS:
        raise HTTPException(404, "unknown provider")
    pending = await db.oauth_states.find_one({"state": state, "kind": f"social_{provider}"}, {"_id": 0})
    if not pending:
        raise HTTPException(400, "invalid or expired oauth state")
    await db.oauth_states.delete_one({"state": state})

    client = CLIENTS[provider]
    try:
        tokens = await client.exchange_code(code)
    except Exception as ex:
        log.warning("social_eq %s oauth exchange failed: %s", provider, ex)
        return RedirectResponse(f"{FRONTEND_URL}/app/social-eq/settings?error=oauth_failed")

    from google_calendar_client import encrypt_token
    doc = {
        "id": new_id(), "workspace_id": pending["workspace_id"], "provider": provider,
        "connected": True, "mocked": False, "connected_at": now_iso(),
        "access_token_enc": encrypt_token(tokens.get("access_token")),
        "refresh_token_enc": encrypt_token(tokens.get("refresh_token")) if tokens.get("refresh_token") else None,
    }
    if provider == "linkedin":
        doc["member_id"] = tokens.get("member_id")
        doc["account_name"] = tokens.get("member_name") or "LinkedIn account"
    elif provider == "instagram":
        doc["ig_user_id"] = tokens.get("ig_user_id")
        doc["page_id"] = tokens.get("page_id")
        doc["account_name"] = "Instagram account"
    else:
        doc["account_name"] = "YouTube channel"

    await db.social_integrations.replace_one(
        {"workspace_id": pending["workspace_id"], "provider": provider}, doc, upsert=True)
    return RedirectResponse(f"{FRONTEND_URL}/app/social-eq/settings?connected={provider}")


# ----------------------------- Draft generation -----------------------------------
def _fallback_draft(platform: str, topic: str) -> Dict[str, Any]:
    return {"headline": topic[:60], "body": f"Draft post about: {topic}", "hashtags": []}


async def _get_brand_voice(workspace_id: str) -> Dict[str, Any]:
    ws = await db.workspaces.find_one({"id": workspace_id}, {"_id": 0, "brand_voice": 1})
    return (ws or {}).get("brand_voice") or {}


async def _draft_post(platform: str, topic: str, tone: str, lead_context: Optional[str],
                       brand_voice: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    if not ANTHROPIC_API_KEY:
        return _fallback_draft(platform, topic)
    brand_context = ""
    if brand_voice:
        if brand_voice.get("offer"):
            brand_context += f" What we offer: {brand_voice['offer']}."
        if brand_voice.get("icp_description"):
            brand_context += f" Who we're speaking to: {brand_voice['icp_description']}."
        if brand_voice.get("banned_phrases"):
            brand_context += f" Never use these words/phrases: {', '.join(brand_voice['banned_phrases'])}."
    system = (
        f"You are Social EQ, drafting a {platform} post. Tone: {tone}.{brand_context} "
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


def _setup_fallback() -> Dict[str, Any]:
    return {
        "tone": "warm", "offer": "", "icp_description": "",
        "content_pillars": ["Behind the scenes", "Tips and insights", "Customer stories"],
    }


@social_router.post("/setup/analyze")
async def social_setup_analyze(body: SetupAnalyzeIn, user=Depends(current_user)):
    """First-pass positioning proposal for the Social EQ setup flow — the user
    reviews/edits everything before it's saved, so this only needs to be a
    good starting point, not perfect. Same _llm_chat -> _extract_json ->
    safe-fallback-dict convention as company_intel.py's _build_ai_profile."""
    crawled_text = ""
    if body.url.strip():
        pages = _crawl_site(body.url.strip(), max_pages=4)
        crawled_text = "\n\n".join(f"URL: {u}\n{t[:3500]}" for u, t in pages.items())[:14000]

    source_text = crawled_text or body.input_text.strip()
    if not source_text:
        raise HTTPException(400, "Provide a URL or a short description to analyze")

    from billing import charge_credits
    await charge_credits(user["workspace_id"], "social_setup", meta={"persona_type": body.persona_type})

    if not ANTHROPIC_API_KEY:
        return _setup_fallback()

    persona_label = body.persona_type.replace("_", " ")
    system = (
        f"You help a {persona_label} define their social media brand voice and positioning. "
        "Read the input below and propose a starting point for them to review and edit — "
        "not a final answer, a good first draft. STRICT JSON only: "
        '{"tone": one of ["warm","professional","direct","playful","formal"], '
        '"offer": "1-2 sentences: what they do, sell, or offer", '
        '"icp_description": "who their audience, ideal follower, or ideal customer is", '
        '"content_pillars": ["3-5 short recurring topics or themes they should post about"]}'
    )
    try:
        raw = await _llm_chat(system, source_text, f"social-setup-{user['id'][:8]}", user=user)
        parsed = _extract_json(raw)
        if parsed and parsed.get("content_pillars"):
            return parsed
    except Exception as ex:
        log.warning("social_setup_analyze fallback: %s", ex)
    return _setup_fallback()


# ----------------------------- Organiser QC --------------------------------------
async def _organiser_check(draft: Dict[str, Any], brand_voice: Optional[Dict[str, Any]],
                            workspace_id: str) -> Dict[str, Any]:
    """One small LLM call checking a draft against brand_voice (banned
    phrases + tone match) before it reaches the digest. Never hard-blocks —
    a human reviews every post in the digest regardless, so this is a
    quality nudge (auto-fix when confident), not a gate that could stall the
    pipeline. v1 is text-only; see plan notes on why visual/color QC is
    deferred (the shared _llm_chat model isn't a vision model)."""
    if not brand_voice or not ANTHROPIC_API_KEY:
        return {"passed": True, "issues": [], "fixed_body": None}

    system = (
        "You are a brand-compliance checker for a social media post. Given the post and the "
        "brand's banned phrases plus its intended tone, check whether it uses any banned phrase "
        "and whether the tone roughly matches. STRICT JSON only: "
        '{"passed": bool, "issues": [str], "fixed_body": str_or_null} '
        "fixed_body should be a corrected version of the body ONLY if passed is false and the "
        "fix is a small, confident edit (e.g. swap one phrase) — otherwise null. Never invent new "
        "claims while fixing."
    )
    user_text = json.dumps({
        "headline": draft.get("headline"), "body": draft.get("body"),
        "intended_tone": brand_voice.get("tone"), "banned_phrases": brand_voice.get("banned_phrases", []),
    })
    try:
        from billing import charge_credits
        await charge_credits(workspace_id, "social_organiser_qc", meta={})
        raw = await _llm_chat(system, user_text, f"seq-organiser-{new_id()[:8]}")
        parsed = _extract_json(raw)
        if parsed and "passed" in parsed:
            return parsed
    except Exception as ex:
        log.warning("organiser check skipped: %s", ex)
    return {"passed": True, "issues": [], "fixed_body": None}


async def _apply_organiser_check(draft: Dict[str, Any], brand_voice: Optional[Dict[str, Any]],
                                  workspace_id: str) -> Dict[str, Any]:
    """Runs the QC pass and applies an auto-fix to `draft` in place when one
    is offered. Returns the QC result so callers can store `issues` for
    visibility in the queue/digest."""
    qc = await _organiser_check(draft, brand_voice, workspace_id)
    if not qc.get("passed") and qc.get("fixed_body"):
        draft["body"] = qc["fixed_body"]
    return qc


def _compose_caption(post: Dict[str, Any]) -> str:
    parts = [post.get("body") or ""]
    tags = post.get("hashtags") or []
    if tags:
        parts.append(" ".join(f"#{t.lstrip('#')}" for t in tags))
    return "\n\n".join(p for p in parts if p)


@social_router.post("/posts/generate")
@limiter.limit("20/minute", key_func=_workspace_or_ip_key)
async def generate_post(request: Request, body: PostGenIn, user=Depends(current_user)):
    if body.platform not in PROVIDERS:
        raise HTTPException(400, "unknown platform")
    content_type = body.content_type if body.content_type in ("text", "static", "carousel", "video") else "static"
    from billing import charge_credits
    await charge_credits(user["workspace_id"],
                         "social_video_generate" if content_type == "video" else "social_draft",
                         meta={"platform": body.platform})
    lead_context = None
    lead_id = body.lead_id
    if lead_id:
        lead = await db.leads.find_one({"id": lead_id, "workspace_id": user["workspace_id"]}, {"_id": 0})
        if lead:
            lead_context = f"{lead.get('first_name')} at {lead.get('company')}"

    brand_voice = await _get_brand_voice(user["workspace_id"])
    draft = await _draft_post(body.platform, body.topic, body.tone, lead_context, brand_voice)
    qc = await _apply_organiser_check(draft, brand_voice, user["workspace_id"])
    post_id = new_id()
    media = await _generate_media(user, post_id, body.topic, body.platform, content_type, brand_voice)
    doc = {
        "id": post_id, "workspace_id": user["workspace_id"], "owner_id": user["id"],
        "lead_id": lead_id, "platform": body.platform, "topic": body.topic,
        "headline": draft.get("headline", ""), "body": draft.get("body", ""),
        "hashtags": draft.get("hashtags", []), "media_url": media["media_url"], "content_type": content_type,
        "carousel_project_id": media["carousel_project_id"], "source": "manual",
        "video_status": media.get("video_status"), "video_operation_name": media.get("video_operation_name"),
        "first_comment": body.first_comment, "first_comment_posted": False,
        "status": "draft", "scheduled_for": None, "approval_token": None,
        "approved_by": None, "approved_at": None, "organiser_issues": qc.get("issues", []),
        "published_at": None, "platform_post_id": None, "platform_post_url": None, "engagement": None, "publish_charge_taken": False,
        "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.social_posts.insert_one(doc)
    doc.pop("_id", None)
    await _audit(user, "social_eq.post.generate", {"id": doc["id"], "platform": body.platform})
    if lead_id:
        await _log_activity(user["workspace_id"], lead_id, "social", "post_drafted",
                             f"Drafted a {body.platform} post: {doc['headline']}", {"post_id": doc["id"]})
    return doc


@social_router.post("/posts/from-create-eq", response_model=CreateEqPublishOut)
@limiter.limit("20/minute", key_func=_workspace_or_ip_key)
async def create_from_create_eq(request: Request, body: CreateEqPublishIn, user=Depends(current_user)):
    """Publish a Create EQ deck/slide to LinkedIn, funnelled through Social EQ
    so every post gets the same caption/hashtag engine + approval gate that
    manual Compose uses. The user clicks "Publish to LinkedIn" inside Create EQ;
    this route receives the already-rendered file (PDF for a carousel, PNG for a
    single slide), runs `_draft_post` + the organiser QC on `body.topic`, and
    stores the post as `pending_approval` with the document linked via
    `carousel_project_id` so the queue can "open in Create EQ"."""

    if body.content_type not in ("carousel", "static"):
        raise HTTPException(400, "content_type must be carousel or static")
    if body.platform != "linkedin":
        raise HTTPException(400, "Create EQ publishing v1 is LinkedIn-only (documents are a LinkedIn format)")

    if body.file_b64:
        try:
            file_bytes = base64.b64decode(body.file_b64, validate=True)
        except Exception:
            raise HTTPException(400, "file_b64 is not valid base64")
    else:
        file_bytes = b""
    if not file_bytes:
        raise HTTPException(400, "missing rendered file (file_b64)")
    if len(file_bytes) > 100 * 1024 * 1024:
        raise HTTPException(400, "rendered file exceeds 100MB")

    # Verify the project belongs to this workspace (keeps the carousel back-link
    # honest — you can only link to your own deck).
    if body.project_id:
        proj = await db.carousels.find_one(
            {"id": body.project_id, "workspace_id": user["workspace_id"]}, {"_id": 0})
        if not proj:
            raise HTTPException(404, "carousel project not found in your workspace")

    from billing import charge_credits
    await charge_credits(user["workspace_id"], "social_draft", meta={"platform": body.platform, "topic": body.topic})

    brand_voice = await _get_brand_voice(user["workspace_id"])
    draft = await _draft_post(body.platform, body.topic, body.tone, None, brand_voice)
    qc = await _apply_organiser_check(draft, brand_voice, user["workspace_id"])

    post_id = new_id()
    if body.content_type == "carousel":
        filename = _save_document(post_id, file_bytes, ext="pdf")
    else:
        filename = _save_media(post_id, file_bytes, ext="png")
    media_url = f"/social-eq/media/{post_id}/{filename}"

    doc = {
        "id": post_id, "workspace_id": user["workspace_id"], "owner_id": user["id"],
        "lead_id": None, "platform": body.platform, "topic": body.topic,
        "headline": draft.get("headline", ""), "body": draft.get("body", ""),
        "hashtags": draft.get("hashtags", []), "media_url": media_url, "content_type": body.content_type,
        "carousel_project_id": body.project_id or None, "source": "create_eq",
        "video_status": None, "video_operation_name": None,
        "first_comment": body.first_comment, "first_comment_posted": False,
        "status": "pending_approval", "scheduled_for": None, "approval_token": None,
        "approved_by": None, "approved_at": None, "organiser_issues": qc.get("issues", []),
        "published_at": None, "platform_post_id": None, "platform_post_url": None, "engagement": None,
        "publish_charge_taken": False, "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.social_posts.insert_one(doc)
    doc.pop("_id", None)
    await _audit(user, "social_eq.post.from_create_eq", {"id": doc["id"], "project_id": body.project_id})
    return CreateEqPublishOut(
        post_id=doc["id"], status=doc["status"], headline=doc["headline"], body=doc["body"],
        hashtags=doc["hashtags"], carousel_project_id=doc["carousel_project_id"], media_url=media_url)


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
    existing = await db.social_posts.find_one({"id": pid, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "not found")
    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    patch["updated_at"] = now_iso()
    if "scheduled_for" in patch and existing["status"] == "draft":
        patch["status"] = "scheduled"
    await db.social_posts.update_one({"id": pid, "workspace_id": user["workspace_id"]}, {"$set": patch})
    return await db.social_posts.find_one({"id": pid, "workspace_id": user["workspace_id"]}, {"_id": 0})


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


@social_router.post("/posts/{pid}/reject")
async def reject_post(pid: str, user=Depends(current_user)):
    p = await db.social_posts.find_one({"id": pid, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not p:
        raise HTTPException(404, "not found")
    if p["status"] == "published":
        raise HTTPException(400, "already published")
    await db.social_posts.update_one({"id": pid}, {"$set": {"status": "rejected", "updated_at": now_iso()}})
    await _audit(user, "social_eq.post.reject", {"id": pid})
    return {"ok": True}


async def _publish_to_platform(workspace_id: str, p: Dict[str, Any]) -> Dict[str, Any]:
    """Core publish logic — shared by the authenticated manual-publish route
    and the scheduler's automatic tick, so both paths bill, log, and simulate
    identically. Calls the real platform client when connected/un-mocked;
    otherwise (or on any real-publish failure) falls back to the same
    deterministic-mock engagement numbers the app has always used.

    Charges credits at most once per post (tracked via `publish_charge_taken`)
    so retrying a `publish_failed` post never charges twice. Any exception
    anywhere below — not just the ones the real-platform branch already
    expects — resolves the post to `publish_failed` rather than leaving it
    stuck mid-status: the scheduler tick claims a post by flipping it to
    "publishing" first, and there is no UI action available for that status,
    so an uncaught exception here would otherwise strand the post forever."""
    if not p.get("publish_charge_taken"):
        from billing import charge_credits
        await charge_credits(workspace_id, "social_publish", meta={"post_id": p["id"], "platform": p["platform"]})
        await db.social_posts.update_one({"id": p["id"]}, {"$set": {"publish_charge_taken": True}})

    try:
        integration = await db.social_integrations.find_one(
            {"workspace_id": workspace_id, "provider": p["platform"]}, {"_id": 0})
        client = CLIENTS[p["platform"]]
        client_mocked = client.status()["mocked"]
        real_publish_supported = client.status().get("real_publish_supported", True)

        platform_post_id, post_url, mocked = None, "", True
        if not client_mocked and integration and integration.get("connected") and real_publish_supported:
            try:
                caption = _compose_caption(p)
                if p["platform"] == "linkedin":
                    if p.get("content_type") == "carousel" and (p.get("media_url") or "").endswith((".pdf", ".ppt", ".pptx")):
                        # Create EQ document posts are uploaded as PDFs and go
                        # through the LinkedIn Documents API (the flow that
                        # produces native swipeable carousels), not the image path.
                        path = _media_path(p["id"], Path(p["media_url"]).name)
                        if not path.is_file():
                            raise RuntimeError("document file missing for carousel post")
                        document_bytes = path.read_bytes()
                        result = await client.publish_document(
                            integration, caption, document_bytes,
                            title=f"{p.get('topic') or 'deck'}.pdf")
                    else:
                        image_bytes = None
                        if p.get("media_url"):
                            path = _media_path(p["id"], Path(p["media_url"]).name)
                            if path.is_file():
                                image_bytes = path.read_bytes()
                        result = await client.publish(integration, caption, image_bytes=image_bytes)
                elif p["platform"] == "instagram":
                    image_url = _public_media_url(p)
                    if not image_url:
                        raise RuntimeError("Instagram requires a publicly-hosted image; none available for this post")
                    result = await client.publish(integration, caption, image_url)
                else:
                    result = await client.publish(integration, caption)
                platform_post_id = result.get("platform_post_id")
                post_url = result.get("url", "")
                mocked = bool(result.get("simulated", False))
                media_omitted = bool(result.get("media_omitted", False))

                # First-comment scheduling — best-effort: a failed comment must
                # never fail (or retroactively un-publish) the post itself.
                if p.get("first_comment") and hasattr(client, "create_comment"):
                    try:
                        await client.create_comment(integration, platform_post_id, p["first_comment"])
                        await db.social_posts.update_one({"id": p["id"]}, {"$set": {"first_comment_posted": True}})
                    except Exception as ex:
                        log.warning("first-comment post failed for %s post %s: %s", p["platform"], p["id"], ex)
            except Exception as ex:
                log.warning("real publish failed for %s post %s: %s", p["platform"], p["id"], ex)
                raise

        engagement = None
        if not platform_post_id:
            seed = sum(ord(c) for c in p["id"]) % 500
            engagement = {"likes": seed % 200, "comments": seed % 20, "shares": seed % 10, "views": (seed % 200) * 8}
            platform_post_id = f"mock-{p['platform']}-{p['id'][:8]}"

        await db.social_posts.update_one({"id": p["id"]}, {"$set": {
            "status": "published", "published_at": now_iso(),
            "platform_post_id": platform_post_id, "platform_post_url": post_url,
            "engagement": engagement,
        }})
        if media_omitted:
            await db.social_posts.update_one({"id": p["id"]}, {"$set": {"media_omitted": True}})
        await _audit({"workspace_id": workspace_id, "id": None, "email": "system"},
                    "social_eq.post.publish", {"id": p["id"], "platform": p["platform"], "mocked": mocked})
        if p.get("lead_id"):
            await _log_activity(workspace_id, p["lead_id"], "social", "post_published",
                                 f"Published a {p['platform']} post: {p['headline']}", {"post_id": p["id"]})
        return {"ok": True, "mocked": mocked, "engagement": engagement, "platform_post_id": platform_post_id}
    except Exception as ex:
        await db.social_posts.update_one({"id": p["id"], "status": {"$ne": "published"}}, {"$set": {
            "status": "publish_failed", "publish_error": str(ex), "updated_at": now_iso(),
        }})
        raise


@social_router.post("/posts/{pid}/publish")
async def publish_post(pid: str, user=Depends(current_user)):
    """The only route that can move a post to 'published' on demand — the
    scheduler tick is the other path, and both funnel through
    `_publish_to_platform`. Hard-gated: requires an explicit prior /approve."""
    p = await db.social_posts.find_one({"id": pid, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not p:
        raise HTTPException(404, "not found")
    if p["status"] != "approved":
        raise HTTPException(400, "post must be approved before it can be published")
    try:
        return await _publish_to_platform(user["workspace_id"], p)
    except Exception as ex:
        raise HTTPException(502, f"publish failed: {ex}")


@social_router.delete("/posts/{pid}")
async def delete_post(pid: str, user=Depends(current_user)):
    await db.social_posts.delete_one({"id": pid, "workspace_id": user["workspace_id"]})
    return {"ok": True}


# ----------------------------- Bulk import (CSV/XLSX) -----------------------------
async def _generate_post_for_row(user: Dict[str, Any], platform: str, topic: str, tone: str,
                                 cta: str, content_type: str, scheduled_for: Optional[str]) -> Dict[str, Any]:
    from billing import charge_credits
    await charge_credits(user["workspace_id"],
                         "social_video_generate" if content_type == "video" else "social_draft",
                         meta={"platform": platform, "source": "bulk_import"})

    lead_context = f"Extra call to action: {cta}" if cta else None
    brand_voice = await _get_brand_voice(user["workspace_id"])
    draft = await _draft_post(platform, topic, tone, lead_context, brand_voice)
    qc = await _apply_organiser_check(draft, brand_voice, user["workspace_id"])

    post_id = new_id()
    media = await _generate_media(user, post_id, topic, platform, content_type, brand_voice)

    # A video post isn't ready to review until run_video_poll_tick fills in
    # its media_url — it stays a draft (no approval_token yet, excluded from
    # this batch's digest) until the poll tick flips it to pending_approval
    # and fires a digest of its own once Veo actually finishes.
    video_pending = content_type == "video"
    doc = {
        "id": post_id, "workspace_id": user["workspace_id"], "owner_id": user["id"],
        "lead_id": None, "platform": platform, "topic": topic,
        "headline": draft.get("headline", ""), "body": draft.get("body", ""),
        "hashtags": draft.get("hashtags", []), "media_url": media["media_url"],
        "content_type": content_type, "carousel_project_id": media["carousel_project_id"],
        "source": "bulk_import",
        "video_status": media.get("video_status"), "video_operation_name": media.get("video_operation_name"),
        "first_comment": None, "first_comment_posted": False,
        "status": "draft" if video_pending else "pending_approval",
        "scheduled_for": scheduled_for,
        "approval_token": None if video_pending else secrets.token_urlsafe(32),
        "approved_by": None, "approved_at": None, "organiser_issues": qc.get("issues", []),
        "published_at": None, "platform_post_id": None, "platform_post_url": None, "engagement": None, "publish_charge_taken": False,
        "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.social_posts.insert_one(doc)
    doc.pop("_id", None)
    return doc


@social_router.get("/bulk-import/template")
async def bulk_import_template():
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(IMPORT_TEMPLATE_COLUMNS)
    writer.writerow([
        "2026-08-01", "linkedin,instagram", "Why cold outreach fails in 2026",
        "static", "confident, professional", "Book a demo at innoira.com",
    ])
    return PlainTextResponse(
        buf.getvalue(), media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=social-eq-bulk-import-template.csv"},
    )


@social_router.post("/bulk-import")
async def bulk_import(file: UploadFile = File(...), user=Depends(current_user)):
    raw = await file.read()
    try:
        rows = _parse_rows(raw, file.filename or "")
    except Exception as ex:
        raise HTTPException(400, f"could not parse file: {ex}")

    created, skipped, errors = 0, 0, []
    created_posts: List[Dict[str, Any]] = []

    for i, row in enumerate(rows, start=1):
        missing = [c for c in REQUIRED_IMPORT_COLUMNS if not (row.get(c) or "").strip()]
        if missing:
            skipped += 1
            errors.append(f"Row {i}: missing {', '.join(missing)}")
            continue

        scheduled_for = _parse_date(row["date"])
        if not scheduled_for:
            skipped += 1
            errors.append(f"Row {i}: unrecognised date '{row['date']}'")
            continue

        platforms = [p.strip().lower() for p in row["platforms"].split(",") if p.strip()]
        content_type = (row.get("content_type") or "static").strip().lower()
        if content_type not in ("text", "static", "carousel", "video"):
            content_type = "static"
        tone = (row.get("tone") or "confident, professional").strip()
        cta = (row.get("cta") or "").strip()

        for platform in platforms:
            if platform not in PROVIDERS:
                errors.append(f"Row {i}: unknown platform '{platform}'")
                continue
            try:
                post = await _generate_post_for_row(
                    user, platform, row["topic"].strip(), tone, cta, content_type, scheduled_for)
                created_posts.append(post)
                created += 1
            except Exception as ex:
                errors.append(f"Row {i} ({platform}): {ex}")

    # Video posts aren't ready to review yet — run_video_poll_tick digests
    # each one individually once Veo actually finishes.
    digestible = [p for p in created_posts if p["status"] == "pending_approval"]
    if digestible:
        await _send_approval_digest(user, digestible)
    if created_posts:
        await _audit(user, "social_eq.bulk_import", {"created": created, "skipped": skipped})

    return {"created": created, "skipped": skipped, "errors": errors}


# ----------------------------- Approval digest email -------------------------------
async def _send_approval_digest(user: Dict[str, Any], posts: List[Dict[str, Any]]) -> None:
    from email_client import _shell, _MUTED, _INK, _LINE, _BONE  # reuse the shared shell/CTA styling

    rows_html = ""
    for p in posts:
        approve_url = f"{(PUBLIC_BASE_URL or FRONTEND_URL)}/api/social-eq-public/approve/{p['approval_token']}"
        reject_url = f"{(PUBLIC_BASE_URL or FRONTEND_URL)}/api/social-eq-public/reject/{p['approval_token']}"
        thumb = _public_media_url(p) or ""
        thumb_html = (
            f'<img src="{thumb}" width="72" height="72" style="border-radius:8px;object-fit:cover;'
            f'vertical-align:top;margin-right:12px;" />' if thumb else ""
        )
        rows_html += f"""
        <tr>
          <td style="padding:14px 0;border-top:1px solid {_LINE};vertical-align:top;">
            <table style="width:100%;"><tr>
              <td style="width:84px;vertical-align:top;">{thumb_html}</td>
              <td style="vertical-align:top;">
                <div style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:{_MUTED};font-weight:600;">
                  {p['platform']} &middot; {(p.get('scheduled_for') or '')[:10]}
                </div>
                <div style="font-size:14px;color:{_INK};font-weight:600;margin-top:2px;">{p['headline']}</div>
                <div style="font-size:13px;color:{_MUTED};margin-top:4px;line-height:1.5;">{(p.get('body') or '')[:180]}</div>
                <div style="margin-top:10px;">
                  <a href="{approve_url}" style="display:inline-block;padding:7px 14px;background:{_INK};color:#fff;
                    text-decoration:none;border-radius:999px;font-size:12px;font-weight:600;margin-right:8px;">Approve</a>
                  <a href="{reject_url}" style="display:inline-block;padding:7px 14px;background:transparent;color:{_MUTED};
                    text-decoration:none;border-radius:999px;font-size:12px;font-weight:600;border:1px solid {_LINE};">Reject</a>
                </div>
              </td>
            </tr></table>
          </td>
        </tr>"""

    html = f"""\
<div style="margin:0;padding:32px 16px;background:{_BONE};font-family:Inter,-apple-system,Segoe UI,Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid {_LINE};border-radius:16px;padding:32px;">
    <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:{_MUTED};font-weight:600;">Social EQ</div>
    <h1 style="margin:12px 0 0;font-size:22px;line-height:1.3;color:{_INK};font-weight:700;">
      {len(posts)} post{"s" if len(posts) != 1 else ""} ready for review
    </h1>
    <p style="margin:10px 0 0;color:{_MUTED};font-size:14px;line-height:1.6;">
      Generated from your bulk import. Approve or reject each one below — nothing publishes without your say-so.
    </p>
    <table style="width:100%;border-collapse:collapse;">{rows_html}</table>
    <p style="margin:24px 0 0;color:{_MUTED};font-size:12px;line-height:1.6;">
      Approved posts publish automatically at their scheduled time (or shortly after approval if none was set).
    </p>
  </div>
</div>"""

    await send_email(
        to=user["email"],
        subject=f"Social EQ: {len(posts)} post{'s' if len(posts) != 1 else ''} ready for your approval",
        html=html,
        workspace_id=user["workspace_id"],
    )


# ----------------------------- Public approve/reject (email links, no login) -----
def _approval_page(title: str, message: str) -> HTMLResponse:
    return HTMLResponse(f"""\
<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;
  background:#F5F5F7;font-family:Inter,-apple-system,Segoe UI,Helvetica,Arial,sans-serif;">
  <div style="max-width:420px;padding:36px;background:#fff;border:1px solid #E5E5E7;border-radius:16px;text-align:center;">
    <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#8E8E93;font-weight:600;">Social EQ</div>
    <h1 style="margin:12px 0 8px;font-size:20px;color:#1D1D1F;">{title}</h1>
    <p style="margin:0;color:#6E6E73;font-size:14px;line-height:1.6;">{message}</p>
  </div>
</div>""")


async def _post_by_token(token: str) -> Dict[str, Any]:
    p = await db.social_posts.find_one({"approval_token": token}, {"_id": 0})
    if not p:
        raise HTTPException(404, "not found")
    return p


@social_public_router.get("/social-eq-public/approve/{token}")
async def public_approve(token: str):
    p = await _post_by_token(token)
    if p["status"] == "published":
        return _approval_page("Already published", f"“{p['headline']}” already went out.")
    if p["status"] == "rejected":
        return _approval_page("Already rejected", f"“{p['headline']}” was already rejected. Reopen it in the Queue to change your mind.")
    await db.social_posts.update_one({"id": p["id"]}, {"$set": {
        "status": "approved", "approved_at": now_iso(), "approved_by": "email-approval",
    }})
    when = f"on {p['scheduled_for'][:10]}" if p.get("scheduled_for") else "shortly"
    return _approval_page("Approved", f"“{p['headline']}” is approved and will publish to {p['platform']} {when}.")


@social_public_router.get("/social-eq-public/reject/{token}")
async def public_reject(token: str):
    p = await _post_by_token(token)
    if p["status"] == "published":
        return _approval_page("Already published", f"“{p['headline']}” already went out — rejecting it now has no effect.")
    await db.social_posts.update_one({"id": p["id"]}, {"$set": {"status": "rejected", "updated_at": now_iso()}})
    return _approval_page("Rejected", f"“{p['headline']}” has been rejected and will not publish.")


# ----------------------------- Scheduler tick (auto-publish) -----------------------
async def run_social_publish_tick() -> None:
    """Registered in server.py's APScheduler alongside reminders/sends/reply-
    polling. Picks up every `approved` post whose scheduled time has arrived
    (or has none) and publishes it. Claims each post before publishing
    (status flip is the claim) so overlapping ticks can't double-publish.
    `_publish_to_platform` itself guarantees any failure resolves the post
    to `publish_failed` (never leaves it stuck at "publishing"), so this
    except is just a log line — the post is always left in a state the
    Queue UI has a retry action for."""
    now = now_iso()
    cursor = db.social_posts.find({
        "status": "approved",
        "published_at": None,
        "$or": [{"scheduled_for": None}, {"scheduled_for": {"$lte": now}}],
    }, {"_id": 0})
    async for p in cursor:
        claimed = await db.social_posts.update_one(
            {"id": p["id"], "status": "approved"}, {"$set": {"status": "publishing"}})
        if claimed.modified_count == 0:
            continue  # another tick already grabbed it
        try:
            await _publish_to_platform(p["workspace_id"], p)
        except Exception as ex:
            log.warning("scheduled publish failed for post %s: %s", p["id"], ex)


# ----------------------------- Scheduler tick (Veo video poll) ---------------------
async def run_video_poll_tick() -> None:
    """Registered in server.py's APScheduler at 2-min intervals, same as
    run_social_publish_tick. Drains posts whose video is still generating.
    Claims each post before polling (status flip is the claim) so
    overlapping ticks can't double-poll the same operation; reverts the
    claim back to "processing" on a not-done or transient result so the
    next tick retries — Veo generation runs for minutes, well past a single
    2-min tick window. On done: saves the video, sets media_url, and — since
    a video post shouldn't reach a human's inbox until the video actually
    exists — only now flips the post to pending_approval with a real
    approval_token and fires the existing approval digest, a fourth trigger
    source alongside bulk-import/RSS/daily-pipeline."""
    cursor = db.social_posts.find({"video_status": "processing"}, {"_id": 0})
    async for p in cursor:
        claimed = await db.social_posts.update_one(
            {"id": p["id"], "video_status": "processing"}, {"$set": {"video_status": "polling"}})
        if claimed.modified_count == 0:
            continue  # another tick already grabbed it

        try:
            result = await veo_client.poll_video_job(p["video_operation_name"])
        except Exception as ex:
            log.warning("veo poll crashed for post %s: %s", p["id"], ex)
            await db.social_posts.update_one({"id": p["id"]}, {"$set": {"video_status": "processing"}})
            continue

        if not result["done"]:
            await db.social_posts.update_one({"id": p["id"]}, {"$set": {"video_status": "processing"}})
            continue

        if result.get("error") or not result.get("video_bytes"):
            log.warning("veo generation failed for post %s: %s", p["id"], result.get("error"))
            await db.social_posts.update_one({"id": p["id"]}, {"$set": {
                "video_status": "failed", "updated_at": now_iso(),
            }})
            continue

        filename = _save_media(p["id"], result["video_bytes"], ext="mp4")
        media_url = f"/social-eq/media/{p['id']}/{filename}"
        approval_token = secrets.token_urlsafe(32)
        await db.social_posts.update_one({"id": p["id"]}, {"$set": {
            "media_url": media_url, "video_status": "ready",
            "status": "pending_approval", "approval_token": approval_token,
            "updated_at": now_iso(),
        }})

        owner = await db.users.find_one({"id": p["owner_id"]}, {"_id": 0})
        if owner:
            updated_post = {**p, "media_url": media_url, "video_status": "ready",
                            "status": "pending_approval", "approval_token": approval_token}
            try:
                await _send_approval_digest(owner, [updated_post])
            except Exception as ex:
                log.warning("video approval digest failed for post %s: %s", p["id"], ex)


# ----------------------------- Engagement inbox ------------------------------------
# Reading comments/engagement back is free (same "we never charge for reading
# data you already own" convention as billing.py's reply-polling); only the
# new AI-suggested-reply LLM call is billed, at the cheapest existing tier
# (email_ai: 1 credit) since it's a single small completion, same as that.
async def _suggest_reply(comment_text: str, post: Dict[str, Any]) -> str:
    if not ANTHROPIC_API_KEY:
        return ""
    system = (
        "You are Social EQ, suggesting a reply to a comment on one of the user's own "
        f"{post.get('platform', 'social')} posts. Keep it short (1-2 sentences), warm, on-brand, "
        "no hashtags, no emoji unless the comment itself uses one. Return plain text only, no quotes."
    )
    user_text = json.dumps({"post_headline": post.get("headline"), "post_body": post.get("body"), "comment": comment_text})
    try:
        resp = await _llm_chat(system, user_text, "seq-reply-suggest")
        return (resp or "").strip().strip('"')
    except Exception as ex:
        log.warning("reply suggestion failed: %s", ex)
        return ""


async def run_social_engagement_tick() -> None:
    """Every 10 min: for each connected, REAL (non-mocked) integration, pulls
    comments on its published posts into `social_comments` and refreshes the
    post's `engagement` counts. Deliberately does nothing for mocked/simulated
    posts — a fabricated "customer comment" would be actively misleading, so
    those keep their existing frozen mock numbers instead."""
    for provider in PROVIDERS:
        client = CLIENTS[provider]
        if client.status()["mocked"] or not hasattr(client, "list_comments"):
            continue
        integrations = await db.social_integrations.find(
            {"provider": provider, "connected": True, "mocked": False}, {"_id": 0}).to_list(200)
        for integration in integrations:
            posts = await db.social_posts.find({
                "workspace_id": integration["workspace_id"], "platform": provider,
                "status": "published", "platform_post_id": {"$exists": True, "$ne": None},
            }, {"_id": 0}).to_list(200)
            for post in posts:
                if not post["platform_post_id"] or post["platform_post_id"].startswith("mock-"):
                    continue
                try:
                    comments = await client.list_comments(integration, post["platform_post_id"])
                except Exception as ex:
                    log.warning("list_comments failed for %s post %s: %s", provider, post["id"], ex)
                    continue
                for c in comments:
                    existing = await db.social_comments.find_one(
                        {"platform_comment_id": c["id"]}, {"_id": 0, "id": 1})
                    if existing:
                        continue
                    suggestion = await _suggest_reply(c["text"], post)
                    if suggestion:
                        from billing import charge_credits
                        try:
                            await charge_credits(integration["workspace_id"], "social_reply_suggest",
                                                 meta={"post_id": post["id"]})
                        except Exception:
                            suggestion = ""  # out of credits — leave the comment unsuggested, still visible
                    await db.social_comments.insert_one({
                        "id": new_id(), "workspace_id": integration["workspace_id"],
                        "post_id": post["id"], "platform": provider,
                        "platform_comment_id": c["id"], "author": c.get("author", ""),
                        "text": c["text"], "at": c.get("at") or now_iso(),
                        "status": "new", "ai_suggested_reply": suggestion,
                        "replied_text": None, "replied_at": None,
                        "created_at": now_iso(),
                    })

                if provider == "instagram" and hasattr(client, "get_insights"):
                    try:
                        insights = await client.get_insights(integration, post["platform_post_id"])
                        await db.social_posts.update_one({"id": post["id"]}, {"$set": {"engagement": insights}})
                    except Exception as ex:
                        log.warning("get_insights failed for %s post %s: %s", provider, post["id"], ex)


@social_router.get("/inbox")
async def list_inbox(status: Optional[str] = None, user=Depends(current_user)):
    q: Dict[str, Any] = {"workspace_id": user["workspace_id"]}
    if status:
        q["status"] = status
    comments = await db.social_comments.find(q, {"_id": 0}).sort("at", -1).to_list(500)
    post_ids = list({c["post_id"] for c in comments})
    posts = await db.social_posts.find({"id": {"$in": post_ids}}, {"_id": 0}).to_list(len(post_ids) or 1)
    posts_by_id = {p["id"]: p for p in posts}
    for c in comments:
        post = posts_by_id.get(c["post_id"])
        c["post_headline"] = post["headline"] if post else None
    return comments


@social_router.get("/inbox/{cid}")
async def get_inbox_item(cid: str, user=Depends(current_user)):
    c = await db.social_comments.find_one({"id": cid, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not c:
        raise HTTPException(404, "not found")
    c["post"] = await db.social_posts.find_one({"id": c["post_id"]}, {"_id": 0})
    return c


class InboxReplyIn(BaseModel):
    body: str


@social_router.post("/inbox/{cid}/reply")
async def reply_inbox_item(cid: str, body: InboxReplyIn, user=Depends(current_user)):
    c = await db.social_comments.find_one({"id": cid, "workspace_id": user["workspace_id"]}, {"_id": 0})
    if not c:
        raise HTTPException(404, "not found")
    post = await db.social_posts.find_one({"id": c["post_id"]}, {"_id": 0})
    client = CLIENTS[c["platform"]]
    if post and not client.status()["mocked"]:
        integration = await db.social_integrations.find_one(
            {"workspace_id": user["workspace_id"], "provider": c["platform"]}, {"_id": 0})
        if integration:
            # Instagram threads replies off the comment id directly; LinkedIn's
            # comments API instead addresses the post and passes the parent
            # comment as a field — hence the two different client shapes.
            if hasattr(client, "reply_to_comment"):
                await client.reply_to_comment(integration, c["platform_comment_id"], body.body)
            elif hasattr(client, "create_comment"):
                await client.create_comment(integration, post["platform_post_id"], body.body,
                                            parent_comment_urn=c["platform_comment_id"])
    await db.social_comments.update_one({"id": cid}, {"$set": {
        "status": "replied", "replied_text": body.body, "replied_at": now_iso(),
    }})
    await _audit(user, "social_eq.inbox.reply", {"id": cid})
    return {"ok": True}


@social_router.post("/inbox/{cid}/ignore")
async def ignore_inbox_item(cid: str, user=Depends(current_user)):
    await db.social_comments.update_one(
        {"id": cid, "workspace_id": user["workspace_id"]}, {"$set": {"status": "ignored"}})
    return {"ok": True}


# ----------------------------- Hashtag manager --------------------------------------
@social_router.get("/hashtag-groups")
async def list_hashtag_groups(user=Depends(current_user)):
    return await db.hashtag_groups.find({"workspace_id": user["workspace_id"]}, {"_id": 0}).to_list(200)


@social_router.post("/hashtag-groups")
async def create_hashtag_group(body: HashtagGroupIn, user=Depends(current_user)):
    doc = {"id": new_id(), "workspace_id": user["workspace_id"], "name": body.name, "hashtags": body.hashtags}
    await db.hashtag_groups.insert_one(doc)
    doc.pop("_id", None)
    return doc


@social_router.put("/hashtag-groups/{gid}")
async def update_hashtag_group(gid: str, body: HashtagGroupIn, user=Depends(current_user)):
    await db.hashtag_groups.update_one(
        {"id": gid, "workspace_id": user["workspace_id"]},
        {"$set": {"name": body.name, "hashtags": body.hashtags}})
    return await db.hashtag_groups.find_one({"id": gid, "workspace_id": user["workspace_id"]}, {"_id": 0})


@social_router.delete("/hashtag-groups/{gid}")
async def delete_hashtag_group(gid: str, user=Depends(current_user)):
    await db.hashtag_groups.delete_one({"id": gid, "workspace_id": user["workspace_id"]})
    return {"ok": True}


# ----------------------------- RSS auto-posting --------------------------------------
@social_router.get("/rss-feeds")
async def list_rss_feeds(user=Depends(current_user)):
    return await db.rss_feeds.find({"workspace_id": user["workspace_id"]}, {"_id": 0}).to_list(100)


@social_router.post("/rss-feeds")
async def create_rss_feed(body: RssFeedIn, user=Depends(current_user)):
    doc = {
        "id": new_id(), "workspace_id": user["workspace_id"], "feed_url": body.feed_url,
        "platforms": body.platforms, "content_type": body.content_type, "tone": body.tone,
        "active": body.active, "last_polled_at": None, "seen_entry_ids": [],
        "created_at": now_iso(),
    }
    await db.rss_feeds.insert_one(doc)
    doc.pop("_id", None)
    return doc


@social_router.put("/rss-feeds/{fid}")
async def update_rss_feed(fid: str, body: RssFeedIn, user=Depends(current_user)):
    await db.rss_feeds.update_one(
        {"id": fid, "workspace_id": user["workspace_id"]},
        {"$set": {"feed_url": body.feed_url, "platforms": body.platforms,
                  "content_type": body.content_type, "tone": body.tone, "active": body.active}})
    return await db.rss_feeds.find_one({"id": fid, "workspace_id": user["workspace_id"]}, {"_id": 0})


@social_router.delete("/rss-feeds/{fid}")
async def delete_rss_feed(fid: str, user=Depends(current_user)):
    await db.rss_feeds.delete_one({"id": fid, "workspace_id": user["workspace_id"]})
    return {"ok": True}


async def run_rss_poll_tick() -> None:
    """Every 30 min: for each active feed, diff entries against
    `seen_entry_ids` and generate one pending_approval post per configured
    platform for each new entry — reusing `_generate_post_for_row` verbatim,
    so RSS-sourced posts go through the exact same digest-email approval flow
    bulk-import posts do (a new trigger source, not a parallel pipeline)."""
    import feedparser
    feeds = await db.rss_feeds.find({"active": True}, {"_id": 0}).to_list(500)
    for feed in feeds:
        try:
            parsed = feedparser.parse(feed["feed_url"])
        except Exception as ex:
            log.warning("RSS parse failed for %s: %s", feed["feed_url"], ex)
            continue
        seen = set(feed.get("seen_entry_ids") or [])
        new_ids: List[str] = []
        created_posts: List[Dict[str, Any]] = []
        user = await db.users.find_one({"workspace_id": feed["workspace_id"]}, {"_id": 0})
        if not user:
            continue
        for entry in parsed.entries[:20]:
            entry_id = entry.get("id") or entry.get("link") or entry.get("title", "")
            if not entry_id or entry_id in seen:
                continue
            new_ids.append(entry_id)
            topic = f"{entry.get('title', '')} — {(entry.get('summary') or '')[:200]}".strip(" —")
            for platform in feed["platforms"]:
                if platform not in PROVIDERS:
                    continue
                try:
                    post = await _generate_post_for_row(
                        user, platform, topic, feed["tone"], "", feed["content_type"], now_iso())
                    post["source"] = "rss"
                    await db.social_posts.update_one({"id": post["id"]}, {"$set": {"source": "rss"}})
                    created_posts.append(post)
                except Exception as ex:
                    log.warning("RSS post generation failed for feed %s entry %s: %s", feed["id"], entry_id, ex)

        if new_ids:
            await db.rss_feeds.update_one({"id": feed["id"]}, {
                "$set": {"last_polled_at": now_iso()},
                "$push": {"seen_entry_ids": {"$each": new_ids, "$slice": -500}},
            })
        if created_posts:
            await _send_approval_digest(user, created_posts)


# ----------------------------- Analytics --------------------------------------------
async def _compute_analytics(workspace_id: str) -> Dict[str, Any]:
    posts = await db.social_posts.find(
        {"workspace_id": workspace_id, "status": "published"}, {"_id": 0}).to_list(2000)

    by_platform: Dict[str, Dict[str, int]] = {}
    by_week: Dict[str, Dict[str, int]] = {}
    real_count, mocked_count = 0, 0
    for p in posts:
        eng = p.get("engagement") or {}
        is_mock = (p.get("platform_post_id") or "").startswith("mock-")
        real_count += 0 if is_mock else 1
        mocked_count += 1 if is_mock else 0

        bucket = by_platform.setdefault(p["platform"], {"posts": 0, "likes": 0, "comments": 0, "shares": 0, "views": 0})
        bucket["posts"] += 1
        for k in ("likes", "comments", "shares", "views"):
            bucket[k] += eng.get(k, 0) or 0

        published_at = p.get("published_at") or p.get("created_at") or ""
        week = published_at[:10]  # daily buckets are simpler and still useful at current volumes
        wk = by_week.setdefault(week, {"posts": 0, "likes": 0, "comments": 0, "shares": 0, "views": 0})
        wk["posts"] += 1
        for k in ("likes", "comments", "shares", "views"):
            wk[k] += eng.get(k, 0) or 0

    def _score(p):
        eng = p.get("engagement") or {}
        return sum(eng.get(k, 0) or 0 for k in ("likes", "comments", "shares", "views"))

    top_posts = sorted(posts, key=_score, reverse=True)[:5]
    top_posts = [{"id": p["id"], "headline": p["headline"], "platform": p["platform"],
                 "engagement": p.get("engagement"), "published_at": p.get("published_at")} for p in top_posts]

    return {
        "by_platform": by_platform,
        "by_day": dict(sorted(by_week.items())),
        "top_posts": top_posts,
        "real_count": real_count, "mocked_count": mocked_count,
        "total_posts": len(posts),
    }


@social_router.get("/analytics")
async def get_analytics(user=Depends(current_user)):
    return await _compute_analytics(user["workspace_id"])


# ----------------------------- Feedback Master: insights tick ---------------------
async def run_social_insights_tick():
    """Daily: summarize each workspace's last 7 days of published-post
    performance into a short 'what worked / try next' note, so the next
    day's topic selection has something better than a flat rotation to go
    on. Lightweight by design — a summarizer, not a live agent."""
    if not ANTHROPIC_API_KEY:
        return
    workspace_ids = await db.social_posts.distinct("workspace_id", {"status": "published"})
    for wid in workspace_ids:
        try:
            analytics = await _compute_analytics(wid)
            if analytics["total_posts"] == 0:
                continue
            from billing import charge_credits
            await charge_credits(wid, "social_insights", meta={})
            system = (
                "You analyze a workspace's recent social media performance. Given per-platform and "
                "per-day aggregates plus the top posts, summarize briefly. STRICT JSON only: "
                '{"what_worked": ["1-3 short observations"], "try_next": ["1-3 short suggestions for future topics/angles"]}'
            )
            raw = await _llm_chat(system, json.dumps(analytics), f"seq-insights-{wid[:8]}")
            parsed = _extract_json(raw) or {}
            if not parsed.get("what_worked") and not parsed.get("try_next"):
                continue
            await db.social_insights.insert_one({
                "id": new_id(), "workspace_id": wid, "generated_at": now_iso(),
                "what_worked": parsed.get("what_worked", []), "try_next": parsed.get("try_next", []),
            })
        except Exception as ex:
            log.warning("social insights tick failed for workspace %s: %s", wid, ex)


# ----------------------------- Daily content pipeline (closes the loop) -----------
async def run_daily_social_content_tick():
    """Daily: for every workspace that's completed Social EQ setup (has
    content_pillars configured), generate today's post(s) — one per
    configured platform — from the pillars (biased by the latest
    Feedback Master insight), run each through the same draft -> media ->
    organiser-QC pipeline every other creation path uses, then fire the
    existing approval digest — a third trigger source alongside bulk-import
    and RSS, not a parallel pipeline."""
    workspaces = await db.workspaces.find(
        {"brand_voice.content_pillars.0": {"$exists": True}}, {"_id": 0}).to_list(500)

    for ws in workspaces:
        wid = ws["id"]
        bv = ws.get("brand_voice") or {}
        pillars = bv.get("content_pillars") or []
        platforms = (bv.get("posting_cadence") or {}).get("preferred_platforms") or []
        if not pillars or not platforms:
            continue

        # Attribute owner_id / bill credits against the workspace's admin —
        # same "first user" convention used at workspace creation.
        owner = await db.users.find_one({"workspace_id": wid, "role": "org_admin"}, {"_id": 0}) \
            or await db.users.find_one({"workspace_id": wid}, {"_id": 0})
        if not owner:
            continue

        day_index = datetime.now(timezone.utc).timetuple().tm_yday
        topic = pillars[day_index % len(pillars)]
        insight = await db.social_insights.find_one(
            {"workspace_id": wid}, {"_id": 0}, sort=[("generated_at", -1)])
        if insight and insight.get("try_next"):
            topic = f"{topic} — {insight['try_next'][0]}"

        created_posts = []
        for platform in platforms:
            try:
                from billing import charge_credits
                await charge_credits(wid, "social_draft", meta={"platform": platform, "source": "daily_pipeline"})
                draft = await _draft_post(platform, topic, bv.get("tone", "warm"), None, bv)
                qc = await _apply_organiser_check(draft, bv, wid)
                post_id = new_id()
                media = await _generate_media(owner, post_id, topic, platform, "static", bv)
                doc = {
                    "id": post_id, "workspace_id": wid, "owner_id": owner["id"],
                    "lead_id": None, "platform": platform, "topic": topic,
                    "headline": draft.get("headline", ""), "body": draft.get("body", ""),
                    "hashtags": draft.get("hashtags", []), "media_url": media["media_url"],
                    "content_type": "static", "carousel_project_id": media["carousel_project_id"],
                    "source": "daily_pipeline",
                    "first_comment": None, "first_comment_posted": False,
                    "status": "pending_approval", "scheduled_for": None,
                    "approval_token": secrets.token_urlsafe(32),
                    "approved_by": None, "approved_at": None, "organiser_issues": qc.get("issues", []),
                    "published_at": None, "platform_post_id": None, "platform_post_url": None, "engagement": None, "publish_charge_taken": False,
                    "created_at": now_iso(), "updated_at": now_iso(),
                }
                await db.social_posts.insert_one(doc)
                doc.pop("_id", None)
                created_posts.append(doc)
            except Exception as ex:
                log.warning("daily social content generation failed (workspace %s, platform %s): %s", wid, platform, ex)

        if created_posts:
            await _send_approval_digest(owner, created_posts)
