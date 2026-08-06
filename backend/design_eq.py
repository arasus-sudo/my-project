"""Design EQ — surface-first design agent for decks, prototypes and landing pages.

Reverse-engineered from Anthropic's Claude Design (see
docs/createeq-handbook/ch16-creative-reasoning-engine.md §16.7 and the Design EQ
research brief). The discipline is copied deliberately; the architecture is
deliberately NOT.

What we copy
------------
1. Surface-first composition. The request is routed to exactly one of seven
   surface archetypes BEFORE any colour, type or layout decision. This is the
   single highest-leverage idea in their system: naming the surface collapses
   the entropy of "what should this look like" into "what does this surface
   do", which is what stops a model averaging every layout it has ever seen.
2. A design-system precedence chain — the user's prompt outranks the workspace
   design system, which outranks model defaults. Never inverted.
3. An anti-slop audit run against the model's own output, scored and returned
   to the caller rather than kept private.

What we deliberately do NOT copy
--------------------------------
Claude Design emits a single self-contained HTML file and treats every other
format as a translation away from it. That is why their PPTX export flattens
text to images, substitutes fonts and drops master slides, and why their own
guidance to users is "pick the exit before polish".

Design EQ keeps a STRUCTURED master (the same element-tree shape Create EQ
already renders and exports) and treats HTML as one render target among
several. Adding an HTML target to a structured master is straightforward;
adding a structured master to HTML is the problem they have not solved. That
asymmetry is the whole point of the architecture.
"""

import logging
import re
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from server import (
    db, now_iso, new_id, current_user, _audit,
    _llm_chat, _llm_configured, _extract_json, _creq_llm_kwargs,
    CREQ_PALETTE_FAMILIES,
)
from billing import charge_credits

log = logging.getLogger(__name__)

design_router = APIRouter(prefix="/design-eq")


# --------------------------------------------------------------------------
# Surface archetypes
# --------------------------------------------------------------------------
# Each entry carries what the USER is doing on that surface, because that is
# what conditions the layout. "does" is what the router matches against;
# "composition" is what the generator is told to build. Keeping both on one
# record means the classifier and the generator can never drift apart.

SURFACES: Dict[str, Dict[str, str]] = {
    "monitor": {
        "label": "Monitor",
        "does": "watching state change — dashboards, status pages, observability",
        "composition": "Density and glanceable hierarchy. Summary before detail. State encoded in form (pill, chip, severity stripe) as well as number. No marketing framing whatsoever.",
    },
    "operate": {
        "label": "Operate",
        "does": "taking action on things — consoles, admin panels, queues, inboxes",
        "composition": "Action affordances and selection state dominate. The primary action per row is unambiguous. Bulk state is visible.",
    },
    "compare": {
        "label": "Compare",
        "does": "weighing options against each other — pricing, plans, spec tables, search results",
        "composition": "Aligned columns and strict structural parity between options, with exactly ONE emphasized differentiator. Never emphasise two.",
    },
    "configure": {
        "label": "Configure",
        "does": "setting things up — settings, forms, wizards, onboarding",
        "composition": "Progressive disclosure, explicit save and validation states, low decoration. Field grouping carries the meaning.",
    },
    "decide": {
        "label": "Decide / Learn",
        "does": "being convinced or taught — landing pages, docs, pitch decks, one-pagers",
        "composition": "One idea per section, argument-led. This is the ONLY surface where a hero and a three-card row are correct.",
    },
    "explore": {
        "label": "Explore",
        "does": "browsing an open space — galleries, catalogs, maps, search-and-filter",
        "composition": "Filters, result grids and zoom/peek ARE the composition. Do not bolt a hero onto a browse surface.",
    },
    "inspect": {
        "label": "Command / Inspect",
        "does": "drilling into one object or driving by keyboard — command bars, inspectors, detail panes, property editors",
        "composition": "Speed and focus over breadth. One object's full depth, not many objects' summaries.",
    },
}

# Delivery formats. `master` records which renderer owns the output — this is
# the fork that keeps export lossless for the formats that need to stay
# editable, and lets the code target handle the ones that need interactivity.
FORMATS: Dict[str, Dict[str, Any]] = {
    "deck":        {"label": "Slide deck",          "master": "structured", "surface_default": "decide"},
    "one_pager":   {"label": "One-pager",           "master": "structured", "surface_default": "decide"},
    "landing":     {"label": "Landing page",        "master": "code",       "surface_default": "decide"},
    "prototype":   {"label": "Interactive prototype","master": "code",      "surface_default": "operate"},
    "comparison":  {"label": "Static comparison",   "master": "structured", "surface_default": "compare"},
    "component_lab": {"label": "Component lab",     "master": "code",       "surface_default": "inspect"},
}

# The anti-slop audit. Ten named tells, scored against the generated output.
# `auto` marks the ones we can detect deterministically from the structured
# master rather than asking the model to grade its own homework — those are the
# only ones whose score can be trusted without a human.
SLOP_TELLS: List[Dict[str, Any]] = [
    {"id": "tech_gradient",  "label": "Tech gradient (blue→violet glossy wash)", "auto": True},
    {"id": "generic_hue",    "label": "Generic tech hue (default indigo accent)", "auto": True},
    {"id": "feature_tiles",  "label": "Feature-tile grid (3 equal icon+text cards)", "auto": False},
    {"id": "accent_rail",    "label": "Accent rail used as decoration", "auto": False},
    {"id": "unearned_blur",  "label": "Glassmorphism with no depth system", "auto": False},
    {"id": "monument_stat",  "label": "Oversized number carrying no argument", "auto": False},
    {"id": "icon_topper",    "label": "Centered rounded-square icon topper", "auto": False},
    {"id": "center_stack",   "label": "Everything centered by default", "auto": True},
    {"id": "default_type",   "label": "Default type (Inter, chosen because it is safe)", "auto": True},
    {"id": "wrong_surface",  "label": "Composition does not match the named surface", "auto": False},
]

# Faces banned outright by docs/design-system.md §24.6, which is also tell 09 on
# the audit above. Checked on generated output AND on any design system a
# workspace tries to register, so the violation cannot enter through the back
# door.
BANNED_FONTS = {"inter"}


def surface_catalog() -> List[Dict[str, str]]:
    return [{"id": k, **v} for k, v in SURFACES.items()]


# --------------------------------------------------------------------------
# Design system registry
# --------------------------------------------------------------------------

class DesignSystemIn(BaseModel):
    name: str
    tokens: Dict[str, Any]          # {colors:{}, type:{}, spacing:{}, radius:{}}
    source: str = "manual"          # manual | repo | upload
    source_ref: Optional[str] = None
    is_default: bool = False


def _validate_tokens(tokens: Dict[str, Any]) -> None:
    """A registered system is a hard constraint on every future generation, so
    it is validated on the way IN. Catching a banned face here is worth far
    more than catching it on every generation afterwards."""
    if not isinstance(tokens, dict):
        raise HTTPException(400, "tokens must be an object")
    type_tokens = tokens.get("type") or {}
    if not isinstance(type_tokens, dict):
        raise HTTPException(400, "tokens.type must be an object")
    for role, family in type_tokens.items():
        if isinstance(family, str) and family.strip().lower() in BANNED_FONTS:
            raise HTTPException(
                400,
                f"'{family}' is not permitted as the {role} face — the suite design "
                f"system (§24.6) specifies Geist for UI text and Plus Jakarta Sans "
                f"for display.",
            )


@design_router.get("/surfaces")
async def list_surfaces(user=Depends(current_user)):
    """Taxonomy for the picker. Formats carry their own default surface so the
    UI can preselect sensibly without a round trip to the model."""
    return {
        "surfaces": surface_catalog(),
        "formats": [{"id": k, **v} for k, v in FORMATS.items()],
        "slop_tells": SLOP_TELLS,
    }


@design_router.get("/systems")
async def list_systems(user=Depends(current_user)):
    return await db.design_systems.find(
        {"workspace_id": user["workspace_id"]}, {"_id": 0}
    ).sort("updated_at", -1).to_list(100)


@design_router.post("/systems")
async def create_system(body: DesignSystemIn, user=Depends(current_user)):
    _validate_tokens(body.tokens)
    doc = {
        "id": new_id(),
        "workspace_id": user["workspace_id"],
        "name": body.name,
        "tokens": body.tokens,
        "source": body.source,
        "source_ref": body.source_ref,
        "is_default": body.is_default,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    if body.is_default:
        await db.design_systems.update_many(
            {"workspace_id": user["workspace_id"]}, {"$set": {"is_default": False}}
        )
    await db.design_systems.insert_one(doc)
    await _audit(user, "design.system.create", {"system_id": doc["id"], "name": body.name})
    doc.pop("_id", None)
    return doc


async def _resolve_system(workspace_id: str, system_id: Optional[str]) -> Optional[Dict[str, Any]]:
    """Explicit id wins; otherwise the workspace default; otherwise nothing and
    the generator falls back to its own tokens. This is the middle rung of the
    precedence chain — the caller's prompt still outranks whatever comes back."""
    q = {"workspace_id": workspace_id}
    if system_id:
        q["id"] = system_id
    else:
        q["is_default"] = True
    return await db.design_systems.find_one(q, {"_id": 0})


# --------------------------------------------------------------------------
# Surface routing
# --------------------------------------------------------------------------

class RouteIn(BaseModel):
    brief: str
    format: Optional[str] = None


ROUTER_SYSTEM = (
    "You classify a design brief onto exactly ONE surface archetype. The surface is "
    "determined by what the USER DOES on the screen, never by what the thing is called "
    "and never by how it should look.\n\n"
    + "\n".join(f"  {k}: user is {v['does']}" for k, v in SURFACES.items())
    + "\n\nIf a brief genuinely spans two surfaces, name the PRIMARY one and put the other "
    "in `secondary` — never average them, and never return two primaries. A dashboard is "
    "'monitor', not 'decide', even when it is being shown to a customer.\n"
    'STRICT JSON only: {"surface":str,"secondary":str|null,"confidence":number,"why":str}'
)


async def route_surface(brief: str, user: Dict[str, Any], fmt: Optional[str] = None) -> Dict[str, Any]:
    """Classify a brief onto one surface. Falls back to the format's default
    rather than failing the request — a wrong-but-sane surface still produces a
    usable artifact, whereas an error produces nothing."""
    fallback = FORMATS.get(fmt or "", {}).get("surface_default", "decide")
    if not _llm_configured():
        return {"surface": fallback, "secondary": None, "confidence": 0.0,
                "why": "No LLM configured — used the format's default surface."}
    try:
        resp = await _llm_chat(
            ROUTER_SYSTEM, f"Brief: {brief}", f"deq-route-{user['id']}",
            user=user, max_tokens=300, **_creq_llm_kwargs(),
        )
        parsed = _extract_json(resp) or {}
        surface = parsed.get("surface")
        if surface in SURFACES:
            secondary = parsed.get("secondary")
            return {
                "surface": surface,
                "secondary": secondary if secondary in SURFACES else None,
                "confidence": float(parsed.get("confidence") or 0.0),
                "why": str(parsed.get("why") or "")[:400],
            }
    except Exception as ex:
        log.warning("design-eq surface routing fell back: %s", ex)
    return {"surface": fallback, "secondary": None, "confidence": 0.0,
            "why": "Routing did not return a known surface — used the format's default."}


@design_router.post("/route")
async def route_endpoint(body: RouteIn, user=Depends(current_user)):
    """Exposed on its own so the UI can show the chosen surface and let the user
    override it BEFORE paying for a generation."""
    if not body.brief.strip():
        raise HTTPException(400, "brief is required")
    result = await route_surface(body.brief, user, body.format)
    result["surface_detail"] = SURFACES[result["surface"]]
    return result


# --------------------------------------------------------------------------
# Anti-slop audit
# --------------------------------------------------------------------------

GENERIC_HUES = {"#6366f1", "#4f46e5", "#818cf8", "#7c3aed", "#8b5cf6", "#a855f7"}


def audit_slop(master: Dict[str, Any]) -> Dict[str, Any]:
    """Deterministic half of the audit, run over the structured master.

    Only the tells that can be checked from geometry and tokens are scored here;
    the rest are returned unscored so the UI can show the full checklist without
    implying we verified items we did not. Score is hits-out-of-checked, and
    lower is better.
    """
    hits: List[Dict[str, str]] = []
    slides = master.get("slides") or []
    tokens = master.get("tokens") or {}

    palette = " ".join(
        str(v).lower() for v in (tokens.get("colors") or {}).values() if isinstance(v, str)
    )
    accent = str((tokens.get("colors") or {}).get("accent", "")).lower()

    if accent in GENERIC_HUES:
        hits.append({"id": "generic_hue", "detail": f"accent {accent} is a stock indigo/violet"})
    if "gradient" in palette and ("#6366f1" in palette or "#8b5cf6" in palette):
        hits.append({"id": "tech_gradient", "detail": "blue→violet gradient in the palette"})

    fonts = {
        str(e.get("font", "")).strip().lower()
        for s in slides for e in (s.get("elements") or [])
        if e.get("type") == "text" and e.get("font")
    }
    banned_used = fonts & BANNED_FONTS
    if banned_used:
        hits.append({"id": "default_type", "detail": f"uses {', '.join(sorted(banned_used))}"})

    # Center stack: a surface where nearly every text block is centre-aligned
    # reads as unconsidered regardless of how good the individual slides are.
    text_els = [e for s in slides for e in (s.get("elements") or []) if e.get("type") == "text"]
    if len(text_els) >= 4:
        centered = sum(1 for e in text_els if e.get("align") == "center")
        if centered / len(text_els) > 0.7:
            hits.append({"id": "center_stack", "detail": f"{centered}/{len(text_els)} text blocks centered"})

    checked = [t for t in SLOP_TELLS if t["auto"]]
    return {
        "score": len(hits),
        "checked": len(checked),
        "hits": hits,
        "unchecked": [t["id"] for t in SLOP_TELLS if not t["auto"]],
        "verdict": "clean" if not hits else ("minor" if len(hits) == 1 else "rework"),
    }


# --------------------------------------------------------------------------
# Generation
# --------------------------------------------------------------------------

class DesignGenIn(BaseModel):
    brief: str
    fmt: str = "deck"
    surface: Optional[str] = None       # omit to auto-route
    section_count: int = 6
    system_id: Optional[str] = None
    tone: str = "confident, precise"
    canvas: Optional[Dict[str, int]] = None


def _system_clause(system: Optional[Dict[str, Any]]) -> str:
    """Middle rung of the precedence chain, rendered into the prompt. Stated as
    a constraint with the reason attached — a bare token dump gets ignored far
    more often than one that says what it is."""
    if not system:
        families = "\n".join(f"  - {k}: {v}" for k, v in CREQ_PALETTE_FAMILIES.items())
        return (
            "No workspace design system is registered, so you also choose the palette. "
            f"Return ONE `palette_family` at the top level, from exactly these values:\n{families}\n"
            "Choose on subject matter, not decoration. Do NOT return hex values anywhere — the "
            "design system owns every colour, surface and contrast decision, and it already "
            "excludes Inter. Your job is to pick the family and write copy that suits it."
        )
    tok = system.get("tokens") or {}
    return (
        f"This workspace has a registered design system named '{system.get('name')}'. "
        f"It is a HARD constraint, exactly like a real client's brand guidelines — you do "
        f"not get to improve on it. Colours: {tok.get('colors')}. Type: {tok.get('type')}. "
        f"Spacing: {tok.get('spacing')}. Radius: {tok.get('radius')}. Use these values and "
        f"no others. The only thing that outranks this is an explicit instruction in the "
        f"brief itself."
    )


def _build_system_prompt(surface_id: str, fmt: str, count: int, tone: str,
                         system: Optional[Dict[str, Any]]) -> str:
    s = SURFACES[surface_id]
    fmt_label = FORMATS.get(fmt, {}).get("label", fmt)
    tells = "\n".join(f"  - {t['label']}" for t in SLOP_TELLS)
    return (
        f"You are Design EQ, a senior designer. You are building a {fmt_label}.\n\n"
        f"SURFACE — this is settled, do not renegotiate it: **{s['label']}**. "
        f"The user is {s['does']}. {s['composition']}\n\n"
        f"Everything you decide must follow from that surface. Layout is conditioned by what "
        f"the surface does, never by what looks nice in isolation.\n\n"
        f"{_system_clause(system)}\n\n"
        f"Produce exactly {count} sections. Tone: {tone}.\n\n"
        f"For each section choose an `archetype` from: cover, statement, stat, list, steps, "
        f"two_column, quote, compare, closer. The archetype dictates which fields are "
        f"REQUIRED, and a section missing them renders empty:\n"
        f"  stat    -> stat.value (<=8 chars) and stat.label\n"
        f"  list    -> items[] with label + text\n"
        f"  steps   -> items[] with label + text, in a real order\n"
        f"  compare -> exactly 2 items[]; item 2 is the favoured side\n"
        f"  quote   -> quote.text and quote.attribution\n"
        f"  closer  -> cta\n"
        f"Never fabricate a statistic you were not given. If you lack the data for an "
        f"archetype, choose a different archetype that fits what you actually have.\n\n"
        f"COPY LIMITS — these are the real dimensions of the layout, not style advice:\n"
        f"  eyebrow 1-3 words · title <=8 words · subtitle <=12 words\n"
        f"  body 20-40 words (under 15 looks empty, over 45 overruns and is cut)\n"
        f"  items[].label <=4 words · items[].text 10-20 words\n"
        f"  Plain prose. No emojis, hashtags, markdown or citation brackets.\n\n"
        f"Before returning, audit your own output against these known tells of "
        f"machine-generated design and fix any you hit:\n{tells}\n\n"
        f"Vary the archetype between adjacent sections. First section is 'cover', last is "
        f"'closer'.\n\n"
        'STRICT JSON only: {"palette_family":str,"sections":[{"archetype":str,"surface_intent":"light"|"dark",'
        '"eyebrow":str,"title":str,"subtitle":str,"body":str,'
        '"items":[{"label":str,"text":str}],"stat":{"value":str,"label":str},'
        '"quote":{"text":str,"attribution":str},"cta":str}]}\n'
        "Omit items/stat/quote entirely on sections whose archetype does not use them."
    )


@design_router.post("/generate")
async def generate(body: DesignGenIn, user=Depends(current_user)):
    if not body.brief.strip():
        raise HTTPException(400, "brief is required")
    if body.fmt not in FORMATS:
        raise HTTPException(400, f"unknown format '{body.fmt}'")
    if body.surface is not None and body.surface not in SURFACES:
        raise HTTPException(400, f"unknown surface '{body.surface}'")
    count = max(1, min(20, body.section_count))

    # 1) Surface first — before any content or styling decision exists.
    if body.surface:
        routing = {"surface": body.surface, "secondary": None, "confidence": 1.0,
                   "why": "Chosen explicitly by the user."}
    else:
        routing = await route_surface(body.brief, user, body.fmt)

    # 2) Design system, resolved but NOT allowed to outrank the brief.
    system = await _resolve_system(user["workspace_id"], body.system_id)

    sections: List[Dict[str, Any]] = []
    palette_family: Optional[str] = None
    if _llm_configured():
        await charge_credits(
            user["workspace_id"], "design_generate",
            meta={"format": body.fmt, "surface": routing["surface"], "sections": count},
        )
        try:
            resp = await _llm_chat(
                _build_system_prompt(routing["surface"], body.fmt, count, body.tone, system),
                f"Brief: {body.brief}",
                f"deq-gen-{user['id']}",
                user=user,
                max_tokens=min(8192, 600 + count * 600),
                **_creq_llm_kwargs(),
            )
            parsed = _extract_json(resp)
            if parsed and parsed.get("sections"):
                sections = parsed["sections"][:count]
                fam = parsed.get("palette_family")
                # Constrained choice, not free text — anything unrecognised
                # falls back rather than reaching the renderer as a family it
                # has no tokens for.
                if isinstance(fam, str) and fam in CREQ_PALETTE_FAMILIES:
                    palette_family = fam
        except Exception as ex:
            log.warning("design-eq generation failed: %s", ex)

    if not sections:
        sections = [{"archetype": "cover", "title": body.brief[:80],
                     "subtitle": "Draft — regenerate to fill this in."}]

    canvas = body.canvas or {"w": 1080, "h": 1350}
    doc = {
        "id": new_id(),
        "workspace_id": user["workspace_id"],
        "owner_id": user["id"],
        "brief": body.brief,
        "format": body.fmt,
        "master": FORMATS[body.fmt]["master"],
        "surface": routing["surface"],
        "surface_secondary": routing.get("secondary"),
        "routing_why": routing.get("why"),
        "system_id": (system or {}).get("id"),
        # A registered system supplies its own tokens; otherwise the composition
        # engine resolves this family name into surfaces.
        "palette_family": None if system else (palette_family or "claude"),
        "canvas": canvas,
        # The structured master. The frontend composition engine turns these
        # into positioned elements; nothing here is a rendered pixel, which is
        # what keeps every export target lossless.
        "sections": sections,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.design_projects.insert_one(doc)
    await _audit(user, "design.create", {"project_id": doc["id"], "surface": routing["surface"]})
    doc.pop("_id", None)
    doc["routing"] = routing
    return doc


# --------------------------------------------------------------------------
# Projects
# --------------------------------------------------------------------------

@design_router.get("/projects")
async def list_projects(user=Depends(current_user)):
    return await db.design_projects.find(
        {"workspace_id": user["workspace_id"]}, {"_id": 0}
    ).sort("updated_at", -1).to_list(200)


@design_router.get("/projects/{project_id}")
async def get_project(project_id: str, user=Depends(current_user)):
    doc = await db.design_projects.find_one(
        {"id": project_id, "workspace_id": user["workspace_id"]}, {"_id": 0}
    )
    if not doc:
        raise HTTPException(404, "not found")
    return doc


class ProjectUpdateIn(BaseModel):
    sections: Optional[List[Dict[str, Any]]] = None
    slides: Optional[List[Dict[str, Any]]] = None
    tokens: Optional[Dict[str, Any]] = None
    title: Optional[str] = None
    canvas: Optional[Dict[str, int]] = None
    surface: Optional[str] = None
    # Colours derived from an uploaded logo, plus the logo itself as a data URI.
    # Extraction happens client-side (node-vibrant) and the design system builds
    # the surface set around these, so the server only stores them.
    brand: Optional[Dict[str, Any]] = None
    palette_family: Optional[str] = None


@design_router.put("/projects/{project_id}")
async def update_project(project_id: str, body: ProjectUpdateIn, user=Depends(current_user)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "nothing to update")
    if "surface" in updates and updates["surface"] not in SURFACES:
        raise HTTPException(400, "unknown surface")
    updates["updated_at"] = now_iso()
    res = await db.design_projects.update_one(
        {"id": project_id, "workspace_id": user["workspace_id"]}, {"$set": updates}
    )
    if not res.matched_count:
        raise HTTPException(404, "not found")
    return await get_project(project_id, user)


@design_router.post("/projects/{project_id}/audit")
async def audit_project(project_id: str, user=Depends(current_user)):
    """Run the deterministic anti-slop audit over a project's rendered master.
    Deliberately a separate call: the audit is shown to the user as a visible
    gate, which is the part Claude Design keeps internal."""
    doc = await get_project(project_id, user)
    return audit_slop(doc)


class HandoffIn(BaseModel):
    # The direction the user was actually previewing when they hit open. Palette
    # families are switched client-side for free, so the stored family can be
    # stale by the time this is called — the deck must open in what they saw.
    palette_family: Optional[str] = None


@design_router.post("/projects/{project_id}/handoff")
async def handoff_to_editor(project_id: str, body: Optional[HandoffIn] = None,
                            user=Depends(current_user)):
    """Materialise a structured design into an editable Create EQ deck.

    This is the payoff of keeping a structured master rather than emitting HTML:
    the handoff is a straight copy, because Design EQ's section schema and Create
    EQ's premium slide schema are deliberately the same vocabulary (archetype +
    typed content). The composition engine, canvas editor, PDF and PNG export all
    work on the result with no translation and no fidelity loss — which is
    exactly the step Claude Design cannot perform.

    No credit charge: nothing is generated here, the design was already paid for.
    """
    doc = await get_project(project_id, user)
    if doc.get("master") != "structured":
        raise HTTPException(
            400,
            "Only structured designs can open in the deck editor. Code-master "
            "formats (landing pages, prototypes, component labs) render through "
            "the code target instead.",
        )
    sections = doc.get("sections") or []
    if not sections:
        raise HTTPException(400, "This design has no sections to open")

    chosen_family = (body.palette_family if body else None) or doc.get("palette_family") or "claude"
    # "brand" is not a house family — it means "build the surfaces from this
    # workspace's own logo colours", which the renderer resolves from the brand
    # kit rather than from a lookup table.
    if chosen_family != "brand" and chosen_family not in CREQ_PALETTE_FAMILIES:
        chosen_family = "claude"

    carousel_id = new_id()
    carousel = {
        "id": carousel_id,
        "workspace_id": user["workspace_id"],
        "owner_id": user["id"],
        "topic": doc.get("brief", "")[:200],
        "platform": "linkedin",
        "brand": {
            **{"bg": "#0F1010", "accent": "#E85D3A", "text": "#FFFFFF"},
            **{k: v for k, v in (doc.get("brand") or {}).items() if k in ("bg", "accent", "text")},
            "font": "Geist", "logo_text": "",
        },
        # Copied verbatim: `archetype` on a slide is what routes it through the
        # premium composition engine on open.
        "slides": sections,
        "design_mode": "premium",
        "palette_family": chosen_family,
        # The 5-colour palette itself is written by the caller straight after
        # this returns: the hex values live in the frontend design system, and
        # duplicating them here would give the tokens two sources of truth.
        "palette_id": "ai",
        "canvas": doc.get("canvas") or {"w": 1080, "h": 1350},
        "design_eq_id": project_id,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.carousels.insert_one(carousel)
    await db.design_projects.update_one(
        {"id": project_id, "workspace_id": user["workspace_id"]},
        {"$set": {"carousel_id": carousel_id, "updated_at": now_iso()}},
    )
    await _audit(user, "design.handoff", {"project_id": project_id, "carousel_id": carousel_id})
    carousel.pop("_id", None)
    return {"carousel_id": carousel_id, "project_id": project_id, "palette_family": chosen_family}


# --------------------------------------------------------------------------
# Code target — landing pages, prototypes, component labs
# --------------------------------------------------------------------------
# The formats a structured slide model genuinely cannot express. Here we DO emit
# a self-contained HTML file, the same shape Claude Design produces — but only
# for the surfaces where interactivity is the point, and with the design system
# and the anti-slop rules injected as hard constraints rather than left to the
# model's taste.

class CodeBuildIn(BaseModel):
    # Resolved design tokens, supplied by the caller. The hex values live in the
    # frontend design system (creqClaudeDesign.js); duplicating them into Python
    # would give the palette two sources of truth that would silently drift.
    tokens: Optional[Dict[str, Any]] = None
    notes: Optional[str] = None


CODE_BANNED = (
    "  - No CDN links, no <script src>, no <link href> to a font or stylesheet host, "
    "no remote images. Everything inline. A single file that opens offline.\n"
    "  - No Inter. UI text is Geist, display is Plus Jakarta Sans, mono is Roboto Mono; "
    "fall back through system-ui.\n"
    "  - No blue→violet gradient, no default indigo accent, no glassmorphism, no "
    "centered rounded-square icon toppers, no three equal icon+text feature tiles, no "
    "decorative colored left-border rails, and do not centre everything by default.\n"
)


def _code_prompt(surface_id: str, fmt: str, tokens: Optional[Dict[str, Any]], notes: Optional[str]) -> str:
    s = SURFACES[surface_id]
    fmt_label = FORMATS.get(fmt, {}).get("label", fmt)
    tok = tokens or {}
    token_clause = (
        f"Use EXACTLY these design tokens and no other colours: {tok}. They are the "
        f"workspace's system, not a suggestion."
        if tok else
        "No tokens were supplied, so choose one small coherent palette — warm or cool "
        "neutrals plus a single accent — and stay inside it."
    )
    return (
        f"You are Design EQ. Build a {fmt_label} as ONE self-contained HTML file.\n\n"
        f"SURFACE — settled, do not renegotiate: **{s['label']}**. The user is {s['does']}. "
        f"{s['composition']}\n\n"
        f"The surface decides the composition. A hero followed by three cards is correct "
        f"ONLY on Decide/Learn; reaching for it on any other surface is the single most "
        f"obvious tell that a machine made this.\n\n"
        f"{token_clause}\n\n"
        f"HARD CONSTRAINTS:\n{CODE_BANNED}"
        f"  - Responsive. Wide content scrolls inside its own container; the page body "
        f"never scrolls sideways.\n"
        f"  - Real content written for this brief. Never lorem ipsum, never placeholder.\n"
        f"  - Visible keyboard focus states. Respect prefers-reduced-motion for any "
        f"non-trivial animation.\n"
        f"  - Support light and dark via prefers-color-scheme, driven by CSS custom "
        f"properties rather than styling inside the media query.\n\n"
        + (f"Additional direction from the user: {notes}\n\n" if notes else "")
        + "Return ONLY the HTML document, starting at <!DOCTYPE html>. No prose, no code "
          "fences, no explanation."
    )


_EXTERNAL_REF = re.compile(r"""(?:src|href)\s*=\s*["']\s*(?:https?:)?//""", re.I)
_FENCE = re.compile(r"^\s*```[a-zA-Z]*\s*|\s*```\s*$")


def audit_code(html: str) -> Dict[str, Any]:
    """Deterministic QA on generated markup — the automated half of the design
    review. Every check here is a fact about the file, not an opinion about it,
    which is why the result can be shown to the user as a gate."""
    hits: List[Dict[str, str]] = []
    low = html.lower()

    ext = _EXTERNAL_REF.findall(html)
    if ext:
        hits.append({"id": "external_refs",
                     "detail": f"{len(ext)} remote resource reference(s) — the file will not open offline"})
    if re.search(r"font-family\s*:[^;}]*\binter\b", low):
        hits.append({"id": "default_type", "detail": "Inter is present in a font stack"})
    if re.search(r"linear-gradient\([^)]*(#6366f1|#4f46e5|#8b5cf6|#7c3aed)", low):
        hits.append({"id": "tech_gradient", "detail": "blue→violet gradient"})
    if re.search(r"(background|color)\s*:\s*(#6366f1|#4f46e5|#818cf8)", low):
        hits.append({"id": "generic_hue", "detail": "stock indigo used as a colour"})
    if "backdrop-filter" in low and "blur" in low:
        hits.append({"id": "unearned_blur", "detail": "backdrop blur — justify it or drop it"})
    if "viewport" not in low:
        hits.append({"id": "not_responsive", "detail": "no viewport meta tag"})
    if ("@keyframes" in low or "transition:" in low) and "prefers-reduced-motion" not in low:
        hits.append({"id": "motion_unguarded", "detail": "animation without a prefers-reduced-motion guard"})
    if "prefers-color-scheme" not in low:
        hits.append({"id": "single_theme", "detail": "no dark-mode handling"})

    return {
        "score": len(hits),
        "hits": hits,
        "verdict": "clean" if not hits else ("minor" if len(hits) <= 2 else "rework"),
        "bytes": len(html.encode("utf-8")),
    }


@design_router.post("/projects/{project_id}/build-code")
async def build_code(project_id: str, body: Optional[CodeBuildIn] = None, user=Depends(current_user)):
    """Generate the HTML for a code-master design and store it on the project."""
    doc = await get_project(project_id, user)
    if doc.get("master") != "code":
        raise HTTPException(400, "This format uses the structured master — open it as a deck instead.")
    if not _llm_configured():
        raise HTTPException(503, "No LLM is configured")

    await charge_credits(user["workspace_id"], "design_generate",
                         meta={"format": doc.get("format"), "surface": doc.get("surface"), "target": "code"})
    try:
        resp = await _llm_chat(
            _code_prompt(doc.get("surface") or "decide", doc.get("format") or "landing",
                         (body.tokens if body else None), (body.notes if body else None)),
            f"Brief: {doc.get('brief')}",
            f"deq-code-{user['id']}",
            user=user, max_tokens=16000, **_creq_llm_kwargs(),
        )
    except Exception as ex:
        log.warning("design-eq code build failed: %s", ex)
        raise HTTPException(502, "The build did not complete — try again")

    html = _FENCE.sub("", (resp or "").strip())
    start = html.lower().find("<!doctype")
    if start == -1:
        start = html.lower().find("<html")
    if start > 0:
        html = html[start:]
    if "<html" not in html.lower():
        raise HTTPException(502, "The build did not return a usable HTML document")

    review = audit_code(html)
    await db.design_projects.update_one(
        {"id": project_id, "workspace_id": user["workspace_id"]},
        {"$set": {"code": html, "code_audit": review, "updated_at": now_iso()}},
    )
    await _audit(user, "design.build_code", {"project_id": project_id, **{k: review[k] for k in ("score", "bytes")}})
    return {"project_id": project_id, "audit": review, "bytes": review["bytes"], "code": html}


@design_router.get("/decks/{carousel_id}/pptx")
async def export_deck_pptx(carousel_id: str, user=Depends(current_user)):
    """Export a deck as a native .pptx with live, editable text.

    The point of the structured master, delivered. Every text block lands as a
    real PowerPoint text frame rather than a picture of one, so the deck can be
    restyled, translated or edited downstream by someone who has never opened
    this product — which is exactly what a rasterising HTML→PPTX path cannot
    offer, and the most-cited complaint about the tool this agent is modelled on.

    Lives on the Design EQ router because Design EQ is where the structured
    master is a guarantee; it accepts any Create EQ deck id, including the ones
    produced by /handoff.
    """
    from fastapi import Response
    from pptx_export import deck_to_pptx, deck_text_stats

    doc = await db.carousels.find_one(
        {"id": carousel_id, "workspace_id": user["workspace_id"]}, {"_id": 0}
    )
    if not doc:
        raise HTTPException(404, "deck not found")
    if not (doc.get("slides") or []):
        raise HTTPException(400, "this deck has no slides")
    # Composition runs in the browser, so a deck that was created but never
    # composed holds archetypes and copy with no positioned elements. Exporting
    # it would produce a file of blank slides — an empty deck that looks like a
    # working export is worse than a refusal.
    if not any((s.get("elements") or []) for s in doc["slides"]):
        raise HTTPException(
            409,
            "This deck hasn't been composed yet — open it once so its layout is "
            "generated, then export.",
        )

    try:
        blob = deck_to_pptx(doc)
    except Exception as ex:
        log.exception("pptx export failed for %s", carousel_id)
        raise HTTPException(500, f"could not build the presentation: {ex}")

    stats = deck_text_stats(doc)
    safe = re.sub(r"[^A-Za-z0-9]+", "-", (doc.get("topic") or "deck"))[:48].strip("-") or "deck"
    await _audit(user, "design.export.pptx", {"carousel_id": carousel_id, **stats})
    return Response(
        content=blob,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        headers={
            "Content-Disposition": f'attachment; filename="{safe}.pptx"',
            # Surfaced so the UI can state plainly how much of the deck came
            # across as live text rather than leaving the user to trust it.
            "X-Deck-Text-Elements": str(stats["text_elements"]),
            "X-Deck-Slides": str(stats["slides"]),
            "Access-Control-Expose-Headers": "X-Deck-Text-Elements, X-Deck-Slides",
        },
    )


@design_router.delete("/projects/{project_id}")
async def delete_project(project_id: str, user=Depends(current_user)):
    res = await db.design_projects.delete_one(
        {"id": project_id, "workspace_id": user["workspace_id"]}
    )
    if not res.deleted_count:
        raise HTTPException(404, "not found")
    await _audit(user, "design.delete", {"project_id": project_id})
    return {"ok": True}
