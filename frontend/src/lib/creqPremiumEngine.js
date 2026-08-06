// Create EQ "Premium / Claude Design" composition engine — v4.
//
// v3 and earlier let the LLM invent five arbitrary hex values per deck and then
// stacked Archivo-Black text down from the top margin of the canvas. That
// combination could only ever produce a generic startup poster: wrong colour
// temperature, wrong type, and a dead lower half on every sparse slide.
//
// v4 inverts the relationship. The model no longer chooses colour or position
// at all — it chooses a palette FAMILY and, per slide, an ARCHETYPE plus
// *typed* content (a stat has a value and a label; a list has items; a quote
// has a quotation and an attribution). Every hex, size, leading, margin, rule
// weight and anchor comes from creqClaudeDesign.js. See that file's header for
// the reverse-engineered characteristics being reproduced.
//
// The other structural change: content is TYPED rather than being squeezed into
// title/subtitle/body and re-guessed at render time. The old engine tried to
// recover list items by splitting body copy on sentence boundaries, which is
// why list slides looked arbitrary — it was inventing structure that the copy
// never had. Archetypes now receive the structure the model actually authored.

import { estimateBlockHeight, anchorBlock, auditAndCorrect, charRatio } from "./creqLayoutFlow";
import { type, getFamily, planSurfaces, slideContext, DEFAULT_FAMILY } from "./creqClaudeDesign";

const uid = () => Math.random().toString(36).slice(2, 10);
const DEFAULT_CANVAS = { w: 1080, h: 1350 };

/* ------------------------------ Density scoring ---------------------------- */

/** Words -> a low/medium/high bucket, computed from the real generated copy.
 * Compositions use this to nudge type scale, not to change layout. */
export function scoreDensity(slide) {
  const parts = [slide.title, slide.subtitle, slide.body, slide.quote?.text];
  for (const it of slide.items || []) parts.push(it.label, it.text);
  const t = parts.filter(Boolean).join(" ");
  const wordCount = t.trim() ? t.trim().split(/\s+/).length : 0;
  const bucket = wordCount <= 12 ? "low" : wordCount <= 34 ? "medium" : "high";
  return { wordCount, charCount: t.length, bucket, scale: { low: 1.06, medium: 1, high: 0.88 }[bucket] };
}

/* --------------------------------- Composer -------------------------------- */
// A small design-system-aware flow cursor. Every call resolves a TYPE role and
// a surface colour rather than accepting raw font/size/hex, so an archetype
// physically cannot introduce an off-system value.

function composer(ctx) {
  const { canvas, surface, g } = ctx;
  const els = [];
  let y = g.top;

  const api = {
    els,
    y: () => y,
    at(v) { y = v; return api; },
    space(px) { y += px; return api; },

    /** @param role a key of TYPE  @param opts.tone paper-relative colour role */
    text(str, role, { tone = "text", scale = 1, x = g.left, w = g.cw, gap = 0, align = "left", italic } = {}) {
      if (!str) return api;
      const t = type(role, canvas, scale);
      const color = api.tone(tone, role);
      const h = estimateBlockHeight(String(str), w, t.size, t.lineHeight, charRatio(t.font, t.letterSpacing, t.uppercase));
      els.push({
        id: uid(), type: "text", x, y, w, h, text: String(str),
        font: t.font, size: t.size, weight: t.weight,
        italic: italic ?? t.italic, uppercase: t.uppercase,
        color, align, letter_spacing: t.letterSpacing, line_height: t.lineHeight,
      });
      y += h + gap;
      return api;
    },

    /** Hairline rules are the system's structural furniture — never a filled
     * pill. Default weight is a true hairline that scales with the canvas. */
    rule({ w = g.cw, x = g.left, tone = "rule", gap = 0, weight } = {}) {
      const h = Math.max(1, Math.round(weight ?? canvas.w * 0.0018));
      els.push({ id: uid(), type: "shape", shape: "rect", x, y, w, h, fill: api.tone(tone), opacity: 1, radius: 0 });
      y += h + gap;
      return api;
    },

    /** A filled area (comparison panel, CTA block, step node). Shapes never
     * participate in the overlap pass, and they anchor with the block. */
    panel({ x, y: py, w, h, tone = "panel", radius = 0, opacity = 1 }) {
      els.push({ id: uid(), type: "shape", shape: "rect", x, y: py, w, h, fill: api.tone(tone), opacity, radius });
      return api;
    },

    /**
     * Place text at an explicit y WITHOUT advancing the cursor — for content
     * that sits beside the main flow (a list's index numeral, a panel's inner
     * copy, a button's label). It still anchors with the rest of the block;
     * `absolute: true` additionally opts out of anchoring, which is only
     * correct for furniture pinned to the canvas edge (a cover's top eyebrow).
     */
    place(str, role, { tone = "muted", x = g.left, y: py, w = g.cw, align = "left", scale = 1, absolute = false, h: hOverride } = {}) {
      if (!str) return api;
      const t = type(role, canvas, scale);
      const h = hOverride ?? estimateBlockHeight(String(str), w, t.size, t.lineHeight, charRatio(t.font, t.letterSpacing, t.uppercase));
      els.push({
        id: uid(), type: "text", x, y: py, w, h, text: String(str),
        font: t.font, size: t.size, weight: t.weight, italic: !!t.italic, uppercase: t.uppercase,
        color: api.tone(tone, role), align, letter_spacing: t.letterSpacing, line_height: t.lineHeight,
        _fixed: true,
        // An explicit height is a deliberate typographic decision (an outsized
        // glyph declared at its true visual extent, not its line box) — tell
        // the audit not to "correct" it back to the generic estimate.
        ...(hOverride ? { _hlock: true } : {}),
        ...(absolute ? { _pin: true } : {}),
      });
      return api;
    },

    /** Height this string would occupy, for laying out inside a panel where
     * the cursor can't be used (two panels share one y band). */
    measure(str, role, w, scale = 1) {
      if (!str) return 0;
      const t = type(role, canvas, scale);
      return estimateBlockHeight(String(str), w, t.size, t.lineHeight, charRatio(t.font, t.letterSpacing, t.uppercase));
    },

    /** Map a semantic tone to the current surface's hex. `accent` resolves to
     * the display variant for large roles and the contrast-safe darker variant
     * for small ones — the reason accent body copy stayed readable. */
    tone(name, role) {
      if (name === "accent") {
        const big = role && /display|stat|quote/.test(role);
        return big ? surface.accentDisplay : surface.accent;
      }
      return surface[name] || name;
    },
  };
  return api;
}

/* --------------------------- Content normalisation ------------------------- */
// Decks generated before v4 (and any slide where the model omitted a typed
// field) still have to render. Everything below degrades to the flat
// title/subtitle/body shape rather than throwing or rendering an empty slide.

function itemsOf(slide, max = 4) {
  if (Array.isArray(slide.items) && slide.items.length) {
    return slide.items.slice(0, max).map((it) =>
      typeof it === "string" ? { label: "", text: it } : { label: it.label || "", text: it.text || "" });
  }
  if (!slide.body) return [];
  const sentences = String(slide.body).split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  if (sentences.length < 2) return [];
  return sentences.slice(0, max).map((s) => ({ label: "", text: s }));
}

function statOf(slide) {
  if (slide.stat?.value) return { value: String(slide.stat.value), label: slide.stat.label || slide.subtitle || "" };
  // A title that is essentially just a number ("3.7x", "68%") is a stat even
  // when the model didn't tag it as one.
  const t = String(slide.title || "").trim();
  if (t && t.length <= 8 && /[\d]/.test(t)) return { value: t, label: slide.subtitle || "" };
  return null;
}

function quoteOf(slide) {
  if (slide.quote?.text) return { text: slide.quote.text, attribution: slide.quote.attribution || "" };
  if (slide.kind === "quote" && slide.title) return { text: slide.title, attribution: slide.subtitle || "" };
  return null;
}

const eyebrowOf = (slide) =>
  slide.eyebrow || slide.narrative?.emotion || slide.emotion_primary || "";

/* -------------------------------- Archetypes ------------------------------- */
// Each returns { els, anchor }. Anchor is applied by build() rather than by the
// archetype, so vertical placement stays a system decision.

function cover(slide, ctx, d) {
  const { g, canvas } = ctx;
  const c = composer(ctx);
  const eb = eyebrowOf(slide);
  // Genuinely canvas-absolute: the eyebrow holds the top margin while the
  // title block below it anchors to the bottom.
  if (eb) c.place(eb, "eyebrow", { tone: "muted", y: g.top, absolute: true });

  c.at(g.top);
  c.text(slide.title, "displayXl", { tone: "text", scale: d.scale, w: g.span(11), gap: canvas.h * 0.032 });
  c.rule({ w: g.span(3), tone: "accent", weight: canvas.w * 0.0037, gap: canvas.h * 0.028 });
  if (slide.subtitle) c.text(slide.subtitle, "bodyLg", { tone: "muted", w: g.span(8) });
  return { els: c.els, anchor: "bottom" };
}

function statement(slide, ctx, d) {
  const { g, canvas } = ctx;
  const c = composer(ctx);
  const eb = eyebrowOf(slide);
  if (eb) c.text(eb, "eyebrow", { tone: "muted", gap: canvas.h * 0.03 });
  c.text(slide.title, "displayLg", {
    tone: slide.accent_role === "title" ? "accent" : "text",
    scale: d.scale, w: g.span(10), gap: canvas.h * 0.03,
  });
  if (slide.body) c.text(slide.body, "bodyLg", { tone: "muted", w: g.span(8) });
  return { els: c.els, anchor: "center" };
}

function stat(slide, ctx, d) {
  const { g, canvas } = ctx;
  const c = composer(ctx);
  const s = statOf(slide) || { value: slide.title || "", label: slide.subtitle || "" };
  if (s.label) c.text(s.label, "eyebrow", { tone: "muted", gap: canvas.h * 0.022 });
  // The number is the one accent element on the slide — this is the archetype
  // where the accent earns its keep.
  c.text(s.value, "stat", { tone: "accent", scale: s.value.length > 5 ? 0.72 : 1, gap: canvas.h * 0.026 });
  c.rule({ w: g.span(2), tone: "accent", weight: canvas.w * 0.0037, gap: canvas.h * 0.026 });
  if (slide.body) c.text(slide.body, "bodyLg", { tone: "text", w: g.span(8) });
  return { els: c.els, anchor: "center" };
}

function list(slide, ctx, d) {
  const { g, canvas } = ctx;
  const c = composer(ctx);
  const items = itemsOf(slide, 4);
  const eb = eyebrowOf(slide);
  if (eb) c.text(eb, "eyebrow", { tone: "muted", gap: canvas.h * 0.02 });
  if (slide.title) c.text(slide.title, "displayMd", { tone: "text", scale: d.scale, w: g.span(10), gap: canvas.h * 0.038 });

  const indexW = g.span(1);
  const textX = g.x(1);
  const textW = g.span(11);
  items.forEach((it, i) => {
    const rowTop = c.y();
    c.place(String(i + 1).padStart(2, "0"), "itemLabel", { tone: "accent", x: g.left, y: rowTop + canvas.h * 0.004, w: indexW });
    if (it.label) c.text(it.label, "headline", { tone: "text", x: textX, w: textW, gap: canvas.h * 0.008 });
    if (it.text) c.text(it.text, "body", { tone: it.label ? "muted" : "text", x: textX, w: textW });
    c.space(canvas.h * 0.022);
    if (i < items.length - 1) c.rule({ w: g.cw, tone: "rule", gap: canvas.h * 0.022 });
  });
  if (!items.length && slide.body) c.text(slide.body, "bodyLg", { tone: "text", w: g.span(9) });
  // Centred, not top-flushed: a three-item list fills about half the slot, and
  // anchoring it to the top margin leaves an obvious dead band underneath.
  // anchorBlock falls back to the top when the block is too tall to centre.
  return { els: c.els, anchor: "center" };
}

function steps(slide, ctx, d) {
  const { g, canvas } = ctx;
  const c = composer(ctx);
  const items = itemsOf(slide, 4);
  if (!items.length) return list(slide, ctx, d);
  const eb = eyebrowOf(slide);
  if (eb) c.text(eb, "eyebrow", { tone: "muted", gap: canvas.h * 0.02 });
  if (slide.title) c.text(slide.title, "displayMd", { tone: "text", scale: d.scale, w: g.span(10), gap: canvas.h * 0.04 });

  const dot = Math.round(canvas.w * 0.018);
  const railX = g.left + dot / 2;
  const textX = g.left + dot * 2.6;
  const textW = g.cw - dot * 2.6;
  const railTop = c.y();
  items.forEach((it, i) => {
    const rowTop = c.y();
    c.panel({ x: railX - dot / 2, y: rowTop + canvas.h * 0.006, w: dot, h: dot, tone: "accent", radius: 999 });
    if (it.label) c.text(it.label, "headline", { tone: "text", x: textX, w: textW, gap: canvas.h * 0.008 });
    if (it.text) c.text(it.text, "body", { tone: it.label ? "muted" : "text", x: textX, w: textW });
    if (i < items.length - 1) c.space(canvas.h * 0.03);
  });
  // Vertical rail behind the nodes, connecting first to last.
  const railBottom = c.y();
  c.els.unshift({
    id: uid(), type: "shape", shape: "rect",
    x: railX - Math.max(1, Math.round(canvas.w * 0.0012)) / 2,
    y: railTop + canvas.h * 0.006 + dot / 2,
    w: Math.max(1, Math.round(canvas.w * 0.0012)),
    h: Math.max(0, railBottom - railTop - canvas.h * 0.02),
    fill: ctx.surface.rule, opacity: 1, radius: 0,
  });
  return { els: c.els, anchor: "center" };
}

function twoColumn(slide, ctx, d) {
  const { g, canvas } = ctx;
  const c = composer(ctx);
  const eb = eyebrowOf(slide);
  if (eb) c.text(eb, "eyebrow", { tone: "muted", gap: canvas.h * 0.018 });
  c.rule({ w: g.cw, tone: "rule", gap: canvas.h * 0.03 });
  const top = c.y();
  c.text(slide.title, "displayMd", { tone: "text", scale: d.scale, x: g.left, w: g.span(5), gap: 0 });
  const leftBottom = c.y();
  c.at(top);
  if (slide.body) c.text(slide.body, "body", { tone: "muted", x: g.x(6), w: g.span(6) });
  if (slide.subtitle) c.space(canvas.h * 0.02).text(slide.subtitle, "caption", { tone: "accent", x: g.x(6), w: g.span(6) });
  c.at(Math.max(leftBottom, c.y()));
  return { els: c.els, anchor: "center" };
}

function quote(slide, ctx, d) {
  const { g, canvas } = ctx;
  const c = composer(ctx);
  const q = quoteOf(slide) || { text: slide.title || "", attribution: slide.subtitle || "" };
  // Oversized opening mark, set in the display serif and bled slightly left of
  // the margin so the quotation itself stays optically aligned to the grid.
  // The quotation clears the mark's MEASURED height — a fixed fraction of
  // canvas height collides with it on shorter formats.
  const markScale = 0.62;
  // A quotation mark occupies only the top ~55% of its line box, so the box is
  // declared at its true visual extent. Left at full line height it would
  // reserve a band of empty space the quotation then has to clear, which on
  // shorter formats pushed the two into each other.
  const markH = Math.round(c.measure("“", "stat", g.span(3), markScale) * 0.55);
  c.place("“", "stat", { tone: "accent", x: g.left - canvas.w * 0.012, y: g.top, w: g.span(3), scale: markScale, h: markH });
  c.at(g.top + markH + canvas.h * 0.012);
  c.text(q.text, "quote", { tone: "text", scale: d.scale, w: g.span(10), gap: canvas.h * 0.036 });
  if (q.attribution) {
    c.rule({ w: g.span(1), tone: "accent", weight: canvas.w * 0.0028, gap: canvas.h * 0.02 });
    c.text(q.attribution, "eyebrow", { tone: "muted", w: g.span(8) });
  }
  return { els: c.els, anchor: "center" };
}

function compare(slide, ctx, d) {
  const { g, canvas } = ctx;
  const c = composer(ctx);
  const items = itemsOf(slide, 2);
  if (items.length < 2) return twoColumn(slide, ctx, d);
  const eb = eyebrowOf(slide);
  if (eb) c.text(eb, "eyebrow", { tone: "muted", gap: canvas.h * 0.02 });
  if (slide.title) c.text(slide.title, "displayMd", { tone: "text", scale: d.scale, w: g.span(10), gap: canvas.h * 0.036 });

  const panelTop = c.y();
  const panelW = g.span(6) - g.gutter / 2;
  const pad = Math.round(canvas.w * 0.038);
  const innerW = panelW - pad * 2;
  const gapY = canvas.h * 0.016;
  // Both panels share one y band, so the panel height is driven by whichever
  // side has more copy — measured, not assumed, so neither side's text can
  // spill out of its own box.
  const panelH = pad * 2 + Math.max(...items.map((it) =>
    c.measure(it.label, "eyebrow", innerW) + (it.label ? gapY : 0) + c.measure(it.text, "body", innerW)));

  items.forEach((it, i) => {
    const px = i === 0 ? g.left : g.left + panelW + g.gutter;
    // The second panel is the "after"/preferred side — it gets the accent
    // treatment so the comparison reads directionally, not as two equal boxes.
    c.panel({ x: px, y: panelTop, w: panelW, h: panelH, tone: i === 1 ? "accent" : "panel", radius: Math.round(canvas.w * 0.007) });
    // Placed, not flowed: this copy belongs to its panel and must not be
    // repositioned independently of it.
    const ix = px + pad;
    let iy = panelTop + pad;
    if (it.label) {
      c.place(it.label, "eyebrow", { tone: i === 1 ? "onAccent" : "muted", x: ix, y: iy, w: innerW });
      iy += c.measure(it.label, "eyebrow", innerW) + gapY;
    }
    if (it.text) c.place(it.text, "body", { tone: i === 1 ? "onAccent" : "text", x: ix, y: iy, w: innerW });
  });
  c.at(panelTop + panelH + canvas.h * 0.03);
  if (slide.body && !items.some((it) => it.text === slide.body)) {
    c.text(slide.body, "caption", { tone: "muted", w: g.span(9) });
  }
  return { els: c.els, anchor: "center" };
}

function closer(slide, ctx, d) {
  const { g, canvas } = ctx;
  const c = composer(ctx);
  const eb = eyebrowOf(slide);
  if (eb) c.text(eb, "eyebrow", { tone: "muted", gap: canvas.h * 0.028 });
  c.text(slide.title, "displayLg", { tone: "text", scale: d.scale, w: g.span(10), gap: canvas.h * 0.028 });
  if (slide.body) c.text(slide.body, "bodyLg", { tone: "muted", w: g.span(8), gap: canvas.h * 0.045 });
  if (slide.cta) {
    // A rectangle with a small radius, not a fully-rounded pill — the pill is
    // the single most "SaaS landing page" tell and is banned from the system.
    const t = type("caption", canvas);
    const padX = Math.round(canvas.w * 0.032);
    const padY = Math.round(canvas.h * 0.019);
    const textW = Math.min(g.span(7), Math.ceil(String(slide.cta).length * t.size * charRatio(t.font)));
    const btnW = textW + padX * 2;
    const btnH = t.size * 1.4 + padY * 2;
    const btnY = c.y();
    c.panel({ x: g.left, y: btnY, w: btnW, h: btnH, tone: "accent", radius: Math.round(canvas.w * 0.006) });
    c.place(slide.cta, "caption", { tone: "onAccent", x: g.left, y: btnY + padY, w: btnW, align: "center" });
    c.at(btnY + btnH);
  }
  return { els: c.els, anchor: "center" };
}

/* ------------------------------- Selection --------------------------------- */

const ARCHETYPES = { cover, statement, stat, list, steps, two_column: twoColumn, quote, compare, closer };

/** Legacy `kind` values (and anything unrecognised) map onto the archetype that
 * best expresses that intent, so pre-v4 decks still compose sensibly. */
const KIND_TO_ARCHETYPE = {
  hook: "statement", body: "two_column", cta: "closer",
  warning: "statement", failure: "statement", celebration: "statement",
  proof: "stat", statistics: "stat", success: "stat",
  comparison: "compare", myth: "compare", reality: "compare",
  timeline: "steps", framework: "steps", checklist: "list",
  prediction: "statement", story: "statement", quote: "quote",
  lesson: "two_column", question: "statement",
};

function pickArchetype(slide, index, total) {
  const explicit = slide.archetype && ARCHETYPES[slide.archetype] ? slide.archetype : null;
  if (index === 0) return explicit && explicit !== "closer" ? explicit : "cover";
  if (index === total - 1) return "closer";
  if (explicit && explicit !== "cover") return explicit;
  const mapped = KIND_TO_ARCHETYPE[slide.kind];
  if (mapped && ARCHETYPES[mapped]) return mapped;
  return itemsOf(slide).length >= 2 ? "list" : "two_column";
}

/* ---------------------------------- Build ---------------------------------- */

/**
 * Last-resort safeguard for copy that simply cannot fit at the composition's
 * intended sizes — the model returning a 60-word "body" into a slot designed
 * for 30. Scales the whole block about its own top so relative layout and the
 * type hierarchy survive; clamped at 62% so a slide degrades into "small but
 * legible and correctly composed" rather than "clipped" or "overlapping".
 *
 * Height is scaled linearly, which over-estimates (narrower text at a smaller
 * size wraps to fewer lines, not proportionally fewer) — deliberately, since
 * the audit that follows can safely shrink a too-tall box but a too-short one
 * clips its own text.
 */
function fitBlock(els, canvas) {
  if (!els.length) return els;
  const margin = Math.round(canvas.w * 0.093);
  const usable = canvas.h - margin * 2;
  const top = Math.min(...els.map((e) => e.y));
  const height = Math.max(...els.map((e) => e.y + (e.h || 0))) - top;
  if (height <= usable) return els;
  const k = Math.max(0.62, usable / height);
  return els.map((e) => ({
    ...e,
    y: top + (e.y - top) * k,
    h: (e.h || 0) * k,
    ...(e.type === "text" ? { size: Math.max(9, Math.round(e.size * k)) } : {}),
  }));
}

/** Compose one slide against an already-resolved context. */
function buildSlide(slide, ctx, archetypeName) {
  const d = scoreDensity(slide);
  const fn = ARCHETYPES[archetypeName] || twoColumn;
  let out;
  try {
    out = fn(slide, ctx, d);
  } catch {
    out = statement(slide, ctx, d); // never fail a whole deck over one slide
  }
  const anchored = anchorBlock(fitBlock(out.els, ctx.canvas), ctx.canvas, out.anchor);
  const audited = auditAndCorrect(anchored, ctx.canvas);
  // `_pin`/`_fixed`/`_hlock` are build-time layout hints; they have no meaning
  // once the deck is a user-editable document, so they aren't persisted.
  const elements = audited.elements.map(({ _pin, _fixed, _hlock, ...el }) => el);
  return {
    _k: uid(),
    // Surfaces are literal hex, which is what allows one deck to mix light and
    // dark slides — a palette token cannot invert per slide.
    bg: { type: "solid", color: ctx.surface.bg },
    elements,
    _premium: {
      archetype: archetypeName, surface: ctx.surfaceName, family: ctx.family.id,
      density: d.bucket, geometryFixes: audited.issues.length,
    },
  };
}

/**
 * Compose a whole premium deck. Deck-level, not per-slide, because surface
 * rhythm (which slides go dark, and where) is a property of the sequence — the
 * old per-slide entry point could not make that decision and so never did.
 *
 * @param slides raw slide objects from the backend
 * @param opts   {canvas, familyId, brand}
 */
export function buildPremiumDeck(slides, { canvas = DEFAULT_CANVAS, familyId = DEFAULT_FAMILY, brand = null } = {}) {
  const family = getFamily(familyId, brand);
  const surfaces = planSurfaces(slides || []);
  return (slides || []).map((slide, i) => {
    const ctx = slideContext(canvas, family, surfaces[i]);
    return buildSlide(slide, ctx, pickArchetype(slide, i, slides.length));
  });
}

/** The 5-colour palette to store on the project so the editor's swatch panel,
 * deck chrome and any hand-added elements stay inside the deck's own system. */
export function paletteForDeck(familyId = DEFAULT_FAMILY, brand = null) {
  const f = getFamily(familyId, brand);
  const p = f.surfaces.paper;
  return { bg: p.bg, bg2: p.panel, accent: p.accentDisplay, text: p.text, muted: p.muted, rationale: `${f.name} — ${f.blurb}` };
}

/** Single-slide entry point kept for callers that rebuild one slide in place
 * (the editor's regenerate path). Deck rhythm can't be inferred from one slide,
 * so the caller supplies the surface it already had. */
export function premiumSlideToElements(slide, priorOrOpts, canvas = DEFAULT_CANVAS) {
  const opts = Array.isArray(priorOrOpts) ? {} : (priorOrOpts || {});
  const family = getFamily(opts.familyId || DEFAULT_FAMILY, opts.brand || null);
  const ctx = slideContext(canvas, family, opts.surface || "paper");
  return buildSlide(slide, ctx, opts.archetype || pickArchetype(slide, opts.index ?? 1, opts.total ?? 3));
}

/** True when a slide carries premium metadata and should route through this
 * engine rather than the flat standard-mode layout. */
export function isPremiumSlide(slide) {
  if (!slide) return false;
  if (slide.archetype || slide.items || slide.stat || slide.quote) return true;
  if (slide.narrative || slide.hierarchy || slide.editorial_direction || slide.emotion_primary) return true;
  return !!slide.kind && !["hook", "body", "cta"].includes(slide.kind);
}

/* ------------------------------ Refinement loop ---------------------------- */
// "Loop engineering", two tiers. auditAndCorrect() already guarantees geometry
// on every slide for free. This is the conditional, qualitative tier: score the
// composed result and send only the slides that still read badly back for a
// targeted COPY rewrite. It asks for the specific change the geometry implies
// ("this ran past its slot, cut it to N words") rather than a vague "improve",
// because the failure is nearly always length, not quality.

function scoreSlide(built, canvas) {
  const texts = built.elements.filter((e) => e.type === "text");
  if (!texts.length) return { score: 0, reason: "empty" };
  const box = texts.reduce((acc, e) => ({
    top: Math.min(acc.top, e.y), bottom: Math.max(acc.bottom, e.y + e.h),
  }), { top: Infinity, bottom: 0 });
  const pad = canvas.w * 0.093;
  const usable = canvas.h - pad * 2;
  const vertical = (box.bottom - box.top) / usable;      // how much of the slot is used
  const ink = texts.reduce((s, e) => s + e.w * e.h, 0) / (canvas.w * canvas.h);
  const shrunk = built._premium?.geometryFixes > 2;

  if (box.bottom > canvas.h - pad * 0.5 || shrunk) return { score: 0.3, reason: "overflow" };
  if (vertical < 0.28 && ink < 0.07) return { score: 0.3, reason: "sparse" };
  if (ink > 0.5) return { score: 0.3, reason: "overflow" };
  return { score: 1, reason: "ok" };
}

/**
 * @param api        axios-like client
 * @param projectId  carousel id
 * @param slides     raw backend slides (parallel to `built`)
 * @param built      output of buildPremiumDeck
 * @param opts       {canvas, familyId, brand} — same values the deck was built with
 */
export async function refineDeck(api, projectId, slides, built, opts = {}) {
  const canvas = opts.canvas || DEFAULT_CANVAS;
  const weak = built
    .map((b, i) => ({ i, ...scoreSlide(b, canvas) }))
    .filter((x) => x.score < 1);
  if (!weak.length) return built;

  const family = getFamily(opts.familyId || DEFAULT_FAMILY, opts.brand || null);
  const out = [...built];
  for (const { i, reason } of weak) {
    // An 'empty' slide needs MORE copy, like a sparse one — sending it the
    // "cut this down" instruction would ask the model to shorten nothing.
    const instruction = reason === "overflow"
      ? "This slide's copy overruns its layout. Cut the title to at most 7 words and the body to at most 28 words, keeping the strongest concrete detail. Do not add new ideas."
      : "This slide is under-filled for its layout. Keep the same point, but add one concrete specific — a number, a named example, or a consequence — so the body is 25-40 words. Do not add a second idea.";
    try {
      const { data } = await api.post("/carousel/edit", { project_id: projectId, slide_index: i, instruction });
      const patched = { ...slides[i], ...(data?.slide || {}) };
      const ctx = slideContext(canvas, family, out[i]._premium?.surface || "paper");
      const rebuilt = buildSlide(patched, ctx, out[i]._premium?.archetype);
      // Only keep the rewrite if it actually scored better — a refinement that
      // makes the slide worse is worse than no refinement.
      if (scoreSlide(rebuilt, canvas).score >= scoreSlide(out[i], canvas).score) {
        out[i] = rebuilt;
        slides[i] = patched;
      }
    } catch {
      // Non-fatal: keep the geometry-corrected original rather than fail the
      // deck over one refinement call.
    }
  }
  return out;
}
