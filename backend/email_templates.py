"""Email template maker — block-based, email-safe HTML templates for Pitch EQ.

A template is stored as a structured block array (blocks_json) plus a style
object, mirroring the signature-builder pattern: the JSON is the source of
truth, the rendered HTML/text is derived output kept on the doc for reuse
(e.g. pasting into a campaign step's body_html).

The renderer emits table-based markup with inline styles only — no <style>
blocks, no web fonts, no transparent elements — so it survives Gmail,
Outlook desktop and Outlook mobile dark mode.

Every endpoint is workspace-scoped via current_user; nothing here touches the
legacy /templates routes in server.py.
"""

import hashlib
import hmac
import html as html_lib
import logging
import os
import re
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from server import (
    db, current_user, now_iso, new_id, _audit, compute_eq, personalize,
    FRONTEND_URL,
)
from email_client import send_email

log = logging.getLogger(__name__)
email_template_router = APIRouter(prefix="/email-templates")
email_public_router = APIRouter()  # the unsubscribe landing — no auth

# ----------------------------- Domain constants --------------------------------

STEP_POSITIONS = ["intro", "followup_1", "followup_2", "reframe", "breakup"]
STEP_LABELS = {
    "intro": "Intro", "followup_1": "Follow-up 1", "followup_2": "Follow-up 2",
    "reframe": "Reframe", "breakup": "Breakup",
}
STEP_ORDER = {p: i for i, p in enumerate(STEP_POSITIONS)}

# The sequence slot each position maps to in a campaign: which day it lands on
# and which condition drives it (the existing if_no_reply follow-up logic).
STEP_CAMPAIGN_MAP = {
    "intro": {"day": 0, "condition": "always"},
    "followup_1": {"day": 3, "condition": "if_no_reply"},
    "followup_2": {"day": 6, "condition": "if_no_reply"},
    "reframe": {"day": 9, "condition": "if_no_reply"},
    "breakup": {"day": 12, "condition": "if_no_reply"},
}

TONE_PRESETS = [
    {"id": "founder_direct", "label": "Direct founder-to-founder",
     "guidance": "Short sentences, plain words, one clear question. No adjectives that would embarrass you in print."},
    {"id": "consultative", "label": "Consultative",
     "guidance": "Lead with their business problem, offer a point of view, propose a conversation. No hard sell."},
    {"id": "warm_intro", "label": "Warm intro",
     "guidance": "Reference shared context up front, keep it personal, end with a soft ask."},
    {"id": "none", "label": "No preset",
     "guidance": "No phrasing guardrails — team members write in their own voice."},
]

SAMPLE_LEAD = {
    "first_name": "Alex",
    "last_name": "Morgan",
    "company": "Acme Corp",
    "role": "Head of Finance",
    "title": "Head of Finance",
    "industry_pain_point": "manual AP workflows eating 12+ hours a week",
    "sender_name": "Nadia",
    "calendly_link": "https://calendly.com/innoira/30min",
    "personalized_opener": "I noticed Acme just closed its Series B — congrats on the round.",
}

# ----------------------------- Email-safe styling ------------------------------
# System font stack only (spec: no web fonts — they break in mail clients).
# Every element sets an explicit background and text color so nothing relies on
# a transparent background that dark mode would invert into invisible text.

_FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
_INK = "#0f1729"
_MUTED = "#64748b"
_LINE = "#e2e8f0"
_CALL = "#f8fafc"
_WHITE = "#ffffff"
_HEX_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")

# ----------------------------- Compliance settings -----------------------------

DEFAULT_COMPLIANCE = {
    "legal_name": "",
    "address": "",
    "regions": ["ca"],
    "auto_append": True,
    "unsubscribe_mode": "one_click",
}


def _unsub_secret() -> str:
    return os.environ.get("UNSUBSCRIBE_SECRET", "innoira-unsub-dev-key")


def _unsub_token(workspace_id: str, email: str) -> str:
    return hmac.new(
        _unsub_secret().encode(), f"{workspace_id}|{email}".lower().encode(), hashlib.sha256
    ).hexdigest()[:32]


async def _get_compliance(workspace_id: str) -> Dict[str, Any]:
    ws = await db.workspaces.find_one({"id": workspace_id}, {"_id": 0, "compliance_settings": 1})
    cfg = {**DEFAULT_COMPLIANCE, **((ws or {}).get("compliance_settings") or {})}
    cfg["regions"] = [r.lower() for r in cfg.get("regions") or []]
    return cfg


def _footer_enabled(compliance: Optional[Dict[str, Any]], cfg: Dict[str, Any]) -> bool:
    if not compliance or not compliance.get("enabled"):
        return False
    regions = [r.lower() for r in compliance.get("regions") or []]
    footer_regions = cfg.get("regions") or []
    if regions and footer_regions:
        return bool(set(regions) & set(footer_regions))
    return bool(regions or footer_regions)


# ----------------------------- Merge-field helpers -----------------------------


def _fill(text: str, ctx: Dict[str, Any]) -> str:
    """Personalize then escape, in that order — unresolved tokens stay visible."""
    return html_lib.escape(personalize(text, ctx))


def _accent(style: Optional[Dict[str, Any]]) -> str:
    color = ((style or {}).get("accent_color") or "").strip()
    return color if _HEX_COLOR.match(color) else "#2563eb"


# ----------------------------- Block renderers ---------------------------------
# Each returns the inner HTML for a <td> row. Table rows are the only layout
# primitive Outlook understands, so paragraphs and callouts become table rows
# rather than stacked <div>s.


def _render_greeting(data: Dict[str, Any], ctx: Dict[str, Any]) -> str:
    return f'<p style="margin:0;font-size:16px;font-weight:600;color:{_INK};">{_fill(data.get("value", ""), ctx)}</p>'


def _render_paragraph(data: Dict[str, Any], ctx: Dict[str, Any]) -> str:
    return f'<p style="margin:0;font-size:15px;line-height:1.6;color:{_INK};">{_fill(data.get("value", ""), ctx)}</p>'


def _render_proof(data: Dict[str, Any], ctx: Dict[str, Any], accent: str) -> str:
    highlight = _fill(data.get("highlight", ""), ctx)
    value = _fill(data.get("value", ""), ctx)
    strong = f'<strong style="color:{accent};">{highlight}</strong> ' if highlight else ""
    return (
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0">'
        f'<tr><td style="background-color:{_CALL};border-left:3px solid {accent};'
        f'border-radius:4px;padding:14px 16px;font-size:14px;line-height:1.55;color:{_INK};">'
        f'{strong}{value}</td></tr></table>'
    )


def _render_cta(data: Dict[str, Any], ctx: Dict[str, Any], accent: str) -> str:
    label = _fill(data.get("label", ""), ctx)
    href = html_lib.escape(personalize(data.get("href", ""), ctx))
    kind = data.get("type", "button")
    if kind == "link" or not label:
        return (
            f'<p style="margin:0;font-size:15px;line-height:1.6;">'
            f'<a href="{href}" style="color:{accent};font-weight:600;text-decoration:underline;">{label}</a></p>'
        )
    return (
        f'<table role="presentation" cellpadding="0" cellspacing="0">'
        f'<tr><td style="background-color:{accent};border-radius:6px;padding:11px 20px;font-size:14px;font-weight:600;">'
        f'<a href="{href}" style="color:{_WHITE};text-decoration:none;display:inline-block;">{label}</a>'
        f'</td></tr></table>'
    )


def _render_divider(accent: str) -> str:
    return (
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0">'
        f'<tr><td style="padding:0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">'
        f'<tr><td style="border-top:1px solid {_LINE};font-size:0;line-height:0;height:1px;">&nbsp;</td></tr>'
        f'</table></td></tr></table>'
    )


def _render_signature(signature: Optional[Dict[str, Any]]) -> str:
    if not signature:
        return ""
    html = signature.get("content_html") or ""
    if not html:
        name = signature.get("name") or ""
        email = signature.get("email") or ""
        line = " · ".join(x for x in (name, email) if x)
        html = f'<p style="margin:0;font-size:15px;color:{_INK};">{html_lib.escape(line)}</p>'
    return html


def _render_footer(cfg: Dict[str, Any], ctx: Dict[str, Any]) -> str:
    lines = [x for x in (cfg.get("legal_name") or "", cfg.get("address") or "") if x]
    legal = "<br>".join(html_lib.escape(x) for x in lines)
    legal_html = f"{legal}<br>" if legal else ""
    unsub_url = ctx.get("unsubscribe_url") or "{{unsubscribe_url}}"
    return (
        f'<tr><td style="padding:16px 28px 24px;border-top:1px solid {_LINE};font-size:11px;line-height:1.6;color:{_MUTED};">'
        f'{legal_html}'
        f'<a href="{html_lib.escape(unsub_url)}" style="color:{_MUTED};text-decoration:underline;">Unsubscribe</a>'
        f'</td></tr>'
    )


def render_email_html(
    blocks: List[Dict[str, Any]],
    style: Optional[Dict[str, Any]],
    ctx: Dict[str, Any],
    compliance: Optional[Dict[str, Any]] = None,
    compliance_cfg: Optional[Dict[str, Any]] = None,
) -> str:
    accent = _accent(style)
    rows = []
    for b in blocks or []:
        t = b.get("type")
        data = b.get("data") or {}
        if t == "greeting":
            inner = _render_greeting(data, ctx)
            pad = "padding:28px 28px 14px;"
        elif t == "opening":
            inner = _render_paragraph(data, ctx)
            pad = "padding:0 28px 14px;"
        elif t == "body":
            inner = _render_paragraph(data, ctx)
            pad = "padding:0 28px 14px;"
        elif t == "proof":
            inner = _render_proof(data, ctx, accent)
            pad = "padding:0 28px 16px;"
        elif t == "cta":
            inner = _render_cta(data, ctx, accent)
            pad = "padding:2px 28px 16px;"
        elif t == "signature":
            inner = _render_signature(data.get("_resolved"))
            pad = "padding:0 28px 16px;"
        elif t == "divider":
            inner = _render_divider(accent)
            pad = "padding:6px 28px 16px;"
        else:
            continue
        rows.append(
            f'<tr><td style="{pad}vertical-align:top;">{inner}</td></tr>'
        )
    footer = ""
    if _footer_enabled(compliance, compliance_cfg or {}):
        footer = _render_footer(compliance_cfg or {}, ctx)
    body = "".join(rows) + footer
    return (
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
        f'style="margin:0;padding:24px 0;background-color:{_CALL};font-family:{_FONT};">'
        f'<tr><td align="center" style="padding:0 16px;">'
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
        f'style="max-width:560px;width:100%;background-color:{_WHITE};border-radius:8px;'
        f'border:1px solid {_LINE};">{body}</table>'
        f'</td></tr></table>'
    )


def render_email_text(
    blocks: List[Dict[str, Any]],
    ctx: Dict[str, Any],
    compliance: Optional[Dict[str, Any]] = None,
    compliance_cfg: Optional[Dict[str, Any]] = None,
) -> str:
    parts = []
    for b in blocks or []:
        data = b.get("data") or {}
        t = b.get("type")
        if t == "signature":
            sig = data.get("_resolved")
            if sig:
                parts.append(sig.get("content_text") or sig.get("name") or "")
            continue
        if t == "cta":
            if data.get("label"):
                parts.append(f'{data.get("label")}: {personalize(data.get("href", ""), ctx)}')
            continue
        if t in ("divider",):
            continue
        value = data.get("value", "")
        if data.get("highlight"):
            value = f'{data.get("highlight")} — {value}'
        if value:
            parts.append(personalize(value, ctx))
    text = "\n\n".join(parts)
    if _footer_enabled(compliance, compliance_cfg or {}):
        lines = [x for x in (compliance_cfg.get("legal_name") or "", compliance_cfg.get("address") or "") if x]
        text += "\n\n" + "\n".join(lines)
        text += f"\nUnsubscribe: {ctx.get('unsubscribe_url') or '{{unsubscribe_url}}'}"
    return text.strip()


# ----------------------------- Repeat-wording check ----------------------------
# The "just checking in" guard: flag a follow-up that re-uses >70% of a prior
# step's wording. Uses 3-gram Jaccard over normalized text — a copy-pasted or
# near-copy email scores near 1.0, a shared greeting alone stays well under.


def _normalize(text: str) -> str:
    return " ".join(re.findall(r"[a-z0-9']+", text.lower()))


def overlap_score(a: str, b: str) -> float:
    wa, wb = _normalize(a).split(), _normalize(b).split()
    ga = set(zip(wa, wa[1:], wa[2:]))
    gb = set(zip(wb, wb[1:], wb[2:]))
    if not ga or not gb:
        return 0.0
    return len(ga & gb) / len(ga | gb)


REPEAT_THRESHOLD = 0.70


def repeat_warnings(
    step_position: str, subject: str, body: str, prior: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """Compare against earlier-position templates; return matches over threshold."""
    mine = f"{subject}\n{body}"
    out = []
    for t in prior:
        score = overlap_score(f'{t.get("subject") or ""}\n{t.get("body") or ""}', mine)
        if score > REPEAT_THRESHOLD:
            out.append({"template_id": t["id"], "name": t.get("name") or "Untitled", "score": round(score * 100)})
    return sorted(out, key=lambda w: -w["score"])


async def _prior_templates(user: Dict[str, Any], step_position: str) -> List[Dict[str, Any]]:
    order = STEP_ORDER.get(step_position)
    if order is None:
        return []
    cursor = db.templates.find(
        {
            "workspace_id": user["workspace_id"],
            "blocks_json": {"$exists": True},
            "step_position": {"$in": STEP_POSITIONS[:order]},
        },
        {"_id": 0, "id": 1, "name": 1, "subject": 1, "body": 1},
    )
    return await cursor.to_list(50)


async def _resolve_signatures(user: Dict[str, Any], blocks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Attach _resolved signature docs to signature blocks (best-effort)."""
    out = []
    for b in blocks or []:
        if b.get("type") == "signature":
            data = dict(b.get("data") or {})
            sig_id = data.get("signature_id") or "default"
            sig = None
            if sig_id and sig_id != "default":
                sig = await db.signatures.find_one(
                    {"id": sig_id, "workspace_id": user["workspace_id"]}, {"_id": 0}
                )
            if not sig:
                sig = await db.signatures.find_one(
                    {"workspace_id": user["workspace_id"], "is_default": True}, {"_id": 0}
                )
            data["_resolved"] = sig
            out.append({**b, "data": data})
        else:
            out.append(b)
    return out


async def _render_doc(user: Dict[str, Any], blocks: List[Dict[str, Any]],
                      style: Dict[str, Any], compliance: Optional[Dict[str, Any]],
                      ctx: Dict[str, Any]) -> tuple:
    blocks = await _resolve_signatures(user, blocks)
    cfg = await _get_compliance(user["workspace_id"])
    html = render_email_html(blocks, style, ctx, compliance, cfg)
    text = render_email_text(blocks, ctx, compliance, cfg)
    return html, text


def _sample_ctx(unsub_url: str = "https://example.com/unsubscribe/sample") -> Dict[str, Any]:
    return {**SAMPLE_LEAD, "unsubscribe_url": unsub_url}


def _compliance_defaults() -> Dict[str, Any]:
    return {"enabled": True, "regions": ["ca"]}


# ----------------------------- Pydantic models ---------------------------------

class TemplateMakerIn(BaseModel):
    name: str
    subject: str = ""
    blocks_json: List[Dict[str, Any]] = []
    style_json: Dict[str, Any] = {}
    tone: str = "none"
    step_position: str = "intro"
    tags: List[str] = []
    service_line: str = ""
    persona: str = ""
    compliance: Optional[Dict[str, Any]] = None


class RenderIn(BaseModel):
    blocks_json: List[Dict[str, Any]] = []
    style_json: Dict[str, Any] = {}


class CheckRepeatIn(BaseModel):
    step_position: str
    subject: str = ""
    body: str


class ComplianceSettingsIn(BaseModel):
    legal_name: str = ""
    address: str = ""
    regions: List[str] = ["ca"]
    auto_append: bool = True
    unsubscribe_mode: str = "one_click"


# ----------------------------- Routes ------------------------------------------

@email_template_router.get("")
async def list_email_templates(
    step_position: Optional[str] = None,
    tone: Optional[str] = None,
    service_line: Optional[str] = None,
    q: Optional[str] = None,
    user=Depends(current_user),
):
    query = {"workspace_id": user["workspace_id"], "blocks_json": {"$exists": True}}
    if step_position:
        query["step_position"] = step_position
    if tone:
        query["tone"] = tone
    if service_line:
        query["service_line"] = service_line
    if q:
        rx = re.compile(re.escape(q), re.IGNORECASE)
        query["$or"] = [{"name": rx}, {"tags": rx}]
    items = await db.templates.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return {"items": items}


@email_template_router.get("/settings")
async def get_compliance_settings(user=Depends(current_user)):
    return await _get_compliance(user["workspace_id"])


@email_template_router.put("/settings")
async def put_compliance_settings(body: ComplianceSettingsIn, user=Depends(current_user)):
    cfg = body.model_dump()
    cfg["regions"] = [r.lower().strip() for r in cfg["regions"] if r.strip()]
    await db.workspaces.update_one(
        {"id": user["workspace_id"]},
        {"$set": {"compliance_settings": cfg}},
    )
    await _audit(user, "email_template.settings", cfg)
    return cfg


@email_template_router.post("/render")
async def render_template(body: RenderIn, user=Depends(current_user)):
    ctx = _sample_ctx()
    html, text = await _render_doc(user, body.blocks_json, body.style_json,
                                   _compliance_defaults(), ctx)
    return {"html": html, "text": text}


@email_template_router.post("/check-repeat")
async def check_repeat(body: CheckRepeatIn, user=Depends(current_user)):
    prior = await _prior_templates(user, body.step_position)
    return {"warnings": repeat_warnings(body.step_position, body.subject, body.body, prior)}


@email_template_router.post("")
async def create_email_template(body: TemplateMakerIn, user=Depends(current_user)):
    if not body.name.strip():
        raise HTTPException(400, "name is required")
    if body.step_position not in STEP_POSITIONS:
        raise HTTPException(400, f"step_position must be one of {', '.join(STEP_POSITIONS)}")
    compliance = {**_compliance_defaults(), **(body.compliance or {})}
    ctx = _sample_ctx()
    html, text = await _render_doc(user, body.blocks_json, body.style_json, compliance, ctx)
    eq = compute_eq(body.subject, text)
    prior = await _prior_templates(user, body.step_position)
    doc = {
        "id": new_id(),
        "workspace_id": user["workspace_id"],
        "owner_id": user["id"],
        "name": body.name.strip(),
        "subject": body.subject,
        "blocks_json": body.blocks_json,
        "style_json": body.style_json,
        "html": html,
        "body": text,
        "tone": body.tone,
        "step_position": body.step_position,
        "tags": body.tags,
        "service_line": body.service_line,
        "persona": body.persona,
        "compliance": compliance,
        "eq_score": eq["overall"],
        "created_at": now_iso(),
    }
    await db.templates.insert_one(doc)
    doc.pop("_id", None)
    await _audit(user, "email_template.create", {"template_id": doc["id"], "name": doc["name"]})
    return {**doc, "overlap_warnings": repeat_warnings(body.step_position, body.subject, text, prior)}


@email_template_router.get("/{tid}")
async def get_email_template(tid: str, user=Depends(current_user)):
    t = await db.templates.find_one(
        {"id": tid, "workspace_id": user["workspace_id"], "blocks_json": {"$exists": True}},
        {"_id": 0},
    )
    if not t:
        raise HTTPException(404, "template not found")
    return t


@email_template_router.put("/{tid}")
async def update_email_template(tid: str, body: TemplateMakerIn, user=Depends(current_user)):
    existing = await db.templates.find_one(
        {"id": tid, "workspace_id": user["workspace_id"]}, {"_id": 0}
    )
    if not existing:
        raise HTTPException(404, "template not found")
    if body.step_position not in STEP_POSITIONS:
        raise HTTPException(400, f"step_position must be one of {', '.join(STEP_POSITIONS)}")
    compliance = {**_compliance_defaults(), **(body.compliance or {})}
    ctx = _sample_ctx()
    html, text = await _render_doc(user, body.blocks_json, body.style_json, compliance, ctx)
    eq = compute_eq(body.subject, text)
    update = {
        "name": body.name.strip(),
        "subject": body.subject,
        "blocks_json": body.blocks_json,
        "style_json": body.style_json,
        "html": html,
        "body": text,
        "tone": body.tone,
        "step_position": body.step_position,
        "tags": body.tags,
        "service_line": body.service_line,
        "persona": body.persona,
        "compliance": compliance,
        "eq_score": eq["overall"],
        "updated_at": now_iso(),
    }
    await db.templates.update_one({"id": tid, "workspace_id": user["workspace_id"]}, {"$set": update})
    await _audit(user, "email_template.update", {"template_id": tid})
    prior = await _prior_templates(user, body.step_position)
    return {**existing, **update, "overlap_warnings": repeat_warnings(body.step_position, body.subject, text, prior)}


@email_template_router.delete("/{tid}")
async def delete_email_template(tid: str, user=Depends(current_user)):
    res = await db.templates.delete_one({"id": tid, "workspace_id": user["workspace_id"]})
    if not res.deleted_count:
        raise HTTPException(404, "template not found")
    await _audit(user, "email_template.delete", {"template_id": tid})
    return {"ok": True}


@email_template_router.post("/{tid}/duplicate")
async def duplicate_email_template(tid: str, user=Depends(current_user)):
    t = await db.templates.find_one(
        {"id": tid, "workspace_id": user["workspace_id"]}, {"_id": 0}
    )
    if not t:
        raise HTTPException(404, "template not found")
    doc = {k: v for k, v in t.items() if k not in ("_id", "id", "created_at", "updated_at")}
    doc.update({
        "id": new_id(),
        "name": f"{t.get('name', 'Untitled')} (copy)",
        "created_at": now_iso(),
    })
    await db.templates.insert_one(doc)
    doc.pop("_id", None)
    await _audit(user, "email_template.duplicate", {"template_id": t["id"], "clone_id": doc["id"]})
    return doc


@email_template_router.post("/{tid}/test-send")
async def test_send_template(tid: str, request: Request, user=Depends(current_user)):
    t = await db.templates.find_one(
        {"id": tid, "workspace_id": user["workspace_id"]}, {"_id": 0}
    )
    if not t:
        raise HTTPException(404, "template not found")
    email = user.get("email") or ""
    base = str(request.base_url).rstrip("/")
    unsub_url = f"{base}/api/unsubscribe/{_unsub_token(user['workspace_id'], email)}"
    ctx = _sample_ctx(unsub_url)
    compliance = t.get("compliance") or _compliance_defaults()
    html, text = await _render_doc(user, t.get("blocks_json") or [], t.get("style_json") or {},
                                   compliance, ctx)
    subject = personalize(t.get("subject") or "", ctx)
    result = await send_email(
        to=email,
        subject=f"[TEST] {subject}" if subject else "[TEST] Template preview",
        html=html,
        workspace_id=user["workspace_id"],
    )
    await _audit(user, "email_template.test_send", {"template_id": tid, "mocked": result.get("mocked")})
    return result


# ----------------------------- Public: one-click unsubscribe -------------------

@email_public_router.get("/unsubscribe/{token}", response_class=HTMLResponse)
async def unsubscribe_landing(token: str):
    """PUBLIC. One-click unsubscribe from a template footer.

    The token is a 32-hex HMAC over workspace_id|email, issued per recipient at
    send time and carried in the footer link — it proves the address without
    exposing it. A token seen for the first time is recorded; an already-seen
    token returns the same confirmation page.
    """
    found = await db.unsubscribes.find_one({"token": token}, {"_id": 0})
    if not found:
        await db.unsubscribes.insert_one({
            "id": new_id(), "token": token, "at": now_iso(), "source": "template_footer",
        })
    # Also add to opt-out list for permanent suppression
    if found:
        workspace_id = found.get("workspace_id")
        email = found.get("email")
        if workspace_id and email:
            from optout import add_to_optout
            await add_to_optout(workspace_id, email, "unsubscribed_via_link", "unsubscribe_link")
    return _unsub_page("You've been unsubscribed. You've been removed from our mailing list and added to our opt-out list. You won't receive any emails from us unless you're manually re-added in the CRM.")


def _unsub_page(message: str, muted: bool = False) -> str:
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Unsubscribed</title></head>
<body style="margin:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<div style="max-width:440px;margin:64px auto;padding:32px;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;">
<h1 style="margin:0 0 8px;font-size:18px;color:#0f1729;">{message}</h1>
<p style="margin:0;font-size:14px;line-height:1.6;color:#64748b;">This was processed automatically. If this wasn't you, ignore this page.</p>
</div></body></html>"""
