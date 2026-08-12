// Shared vertical-flow layout primitives — canvas-size-aware text-height
// estimation and a flow cursor so no composition (standard OR premium) can
// place two blocks on top of each other, regardless of how much text the
// model returns or what canvas dimensions the deck was created at (LinkedIn
// 1080x1350, Instagram Square 1080x1080, Instagram Story 1080x1920, or a
// custom size). Extracted out of creqPremiumEngine.js so legacySlideToElements
// (standard mode) can share the same overlap-proof positioning instead of the
// old fixed-literal-pixel layout that only ever worked for one canvas size.

const uid = () => Math.random().toString(36).slice(2, 10);

/* --------------------------- Text-height estimation ------------------------ */
// No canvas/DOM measurement available in the off-DOM slide-building path, so
// this approximates: average glyph width as a fraction of font size (~0.56
// for the sans/display faces this deck uses), wrap at that estimate, then
// account for explicit newlines separately. Deliberately conservative (rounds
// UP) — a box slightly too tall costs empty space; one too short overlaps
// the next block, which was the original bug this replaced.
export function estimateLines(text, boxWidth, fontSize, avgCharWidthRatio = 0.56) {
  if (!text) return 0;
  const charsPerLine = Math.max(1, Math.floor(boxWidth / (fontSize * avgCharWidthRatio)));
  let total = 0;
  for (const manualLine of String(text).split("\n")) {
    total += manualLine.length === 0 ? 1 : Math.max(1, Math.ceil(manualLine.length / charsPerLine));
  }
  return total;
}

/** A font's natural line box (ascent + descent) as a multiple of font size.
 * Measured by rasterising ascender-and-descender text at line-height 1 and
 * reading the painted extent: Instrument Serif 1.95, JetBrains Mono 1.95,
 * Geist 1.88. One slightly-conservative constant covers all three — erring high
 * costs a few pixels of whitespace, erring low causes the collision below. */
const NATURAL_LINE_BOX = 1.92;

/**
 * How far a block's glyphs paint BELOW its own CSS box.
 *
 * When line-height is smaller than the font's natural line box, the box is
 * crushed but the glyphs keep their size, so they spill past the bottom edge by
 * half the difference. Nothing in the DOM reflects that overhang — the box
 * reports its declared height — so a flow cursor that advances by box height
 * places the next element inside the previous one's descenders.
 *
 * That is what broke stat slides: the numeral is set at 0.9 leading, so a 232px
 * figure overflowed its box by 116px and the hairline rule beneath it landed
 * inside the digits. On screen the two merely touched; rasterised to PDF they
 * merged into a single blob, because rule and numeral share the accent colour.
 *
 * Verified against measurement: predicted 116px at 232px/0.9, 46px at
 * 105px/1.02 and 6px at 29px/1.5 — matching the 73/47/5px overflows observed.
 */
export function glyphOverhang(fontSize, lineHeight = 1.2) {
  return Math.ceil(Math.max(0, (NATURAL_LINE_BOX - lineHeight) / 2) * fontSize);
}

export function estimateBlockHeight(text, boxWidth, fontSize, lineHeight = 1.2, avgCharWidthRatio = 0.56) {
  const lines = estimateLines(text, boxWidth, fontSize, avgCharWidthRatio);
  return Math.ceil(lines * fontSize * lineHeight) + glyphOverhang(fontSize, lineHeight);
}

/** Average glyph width as a fraction of font size, per family. A single shared
 * constant mis-measures both ends of the type system — the display serif is
 * materially narrower than a grotesque and the mono is wider — and because the
 * composer and the geometry audit BOTH estimate height, any disagreement
 * between them makes the audit "correct" boxes that were already right,
 * pushing them into their neighbours. Both sides call this. */
// Measured with canvas measureText over representative English prose at 100px:
// Geist 0.4425, Inter 0.4615, Instrument Serif 0.3269, JetBrains Mono 0.6000.
// The constants below sit deliberately ABOVE those averages, because a pure
// average under-counts lines — real text breaks at word boundaries and leaves a
// ragged right edge, so a box sized to the average is too short and its text
// collides with the block beneath it. Over-estimating only costs whitespace.
// Geist's value is Inter's validated constant scaled by the measured ratio
// between the two faces, which preserves the margin already proven out rather
// than re-deriving it.
const CHAR_RATIO = {
  "Instrument Serif": 0.40,
  "JetBrains Mono": 0.60,
  Geist: 0.50,
  Inter: 0.52, // retained: decks generated before the Geist switch still use it
};

/** Letter-spacing is specified in em, so it adds to effective glyph width 1:1. */
export function charRatio(font, tracking = 0, uppercase = false) {
  const base = CHAR_RATIO[font] ?? 0.54;
  return base * (uppercase ? 1.08 : 1) + Math.max(0, tracking || 0);
}

/* ------------------------------ Element helpers --------------------------- */

export const textEl = (over) => ({ id: uid(), type: "text", align: "left", letter_spacing: -0.01, line_height: 1.2, weight: 700, color: "text", font: "Inter", ...over });
export const shapeEl = (over) => ({ id: uid(), type: "shape", shape: "rect", fill: "accent", opacity: 1, radius: 0, ...over });
export const badgeEl = (over) => ({ id: uid(), type: "badge", bg: "accent", color: "bg", radius: 999, size: 20, ...over });

/** Padding/content-width scale proportionally with canvas size instead of a
 * literal 80px that only ever looked right on the 1080-wide authoring
 * canvas — a 1080x1920 Story canvas or a small custom size both need this to
 * track their own width, not LinkedIn's. */
export function contentBox(canvas) {
  const pad = Math.round(canvas.w * 0.074); // ≈80px at 1080 wide
  return { pad, cw: canvas.w - pad * 2 };
}

/** A vertical-flow cursor: each `add*` call estimates the real height its
 * content needs at the given font size, places it at the current y, and
 * advances by (height + gap) — no two blocks can land on top of each other
 * regardless of how long the generated copy turns out to be. */
export function makeFlow(x, startY, width) {
  let y = startY;
  const els = [];
  return {
    els,
    cursorY: () => y,
    addText(str, { font, size, weight, color = "text", lineHeight = 1.2, gap = 24, uppercase = false, letterSpacing, align = "left", boxX = x, boxW = width } = {}) {
      if (!str) return;
      const h = estimateBlockHeight(str, boxW, size, lineHeight);
      els.push(textEl({
        x: boxX, y, w: boxW, h, text: str, font, size, weight, color,
        line_height: lineHeight, uppercase, align,
        ...(letterSpacing !== undefined ? { letter_spacing: letterSpacing } : {}),
      }));
      y += h + gap;
    },
    addRule({ w = 160, h = 8, gap = 24 } = {}) {
      els.push(shapeEl({ x, y, w, h, radius: h / 2 }));
      y += h + gap;
    },
    addBadge(str, { size = 22, gap = 24 } = {}) {
      if (!str) return;
      els.push(badgeEl({ x, y, text: str, size }));
      y += size + 40 + gap;
    },
    remaining: (canvas) => Math.max(0, canvas.h - Math.round(canvas.w * 0.074) - y),
  };
}

/** If a flow overran the canvas (long generated copy at a composition's
 * default sizes), shrink every text element's font size by the same factor
 * so the deck stays legible instead of clipping or overlapping the canvas
 * edge — single pass, not a retry loop, since compositions already pick
 * conservative starting sizes. */
export function fitToCanvas(flow, canvas) {
  const safeBottom = canvas.h - Math.round(canvas.w * 0.074);
  const overflow = flow.cursorY() - safeBottom;
  if (overflow <= 0) return flow.els;
  const totalTextHeight = flow.els.reduce((sum, e) => sum + (e.type === "text" ? e.h : 0), 0) || 1;
  const shrink = Math.max(0.6, 1 - overflow / totalTextHeight);
  return flow.els.map((e) => e.type === "text" ? { ...e, size: Math.round(e.size * shrink), h: Math.round(e.h * shrink) } : e);
}

/* -------------------------------- Anchoring -------------------------------- */

/** Bounding box of a built element list. */
export function measureBlock(els) {
  if (!els.length) return { top: 0, bottom: 0, height: 0 };
  const top = Math.min(...els.map((e) => e.y));
  const bottom = Math.max(...els.map((e) => e.y + (e.h || 0)));
  return { top, bottom, height: bottom - top };
}

/**
 * Shift a built block vertically so it sits where the composition INTENDED,
 * rather than wherever the flow cursor happened to end up.
 *
 * This is the fix for the single most visible flaw in the old engine: every
 * composition flushed its content to the top of the canvas, so a slide with
 * three words of copy rendered as a small huddle of text above 60% empty
 * canvas. Editorial decks anchor deliberately — a cover's title block sits low,
 * a statement sits optically centred (slightly above true centre, which reads
 * as centred to the eye), body slides start below the top margin.
 *
 * `optical` biases centring upward by 3% of canvas height; true mathematical
 * centring consistently looks low.
 */
export function anchorBlock(els, canvas, anchor = "top", { top, bottom, optical = true } = {}) {
  if (!els.length) return els;
  const pad = Math.round(canvas.w * 0.093);
  const topLimit = top ?? pad;
  const bottomLimit = bottom ?? canvas.h - pad;
  const box = measureBlock(els);
  let targetTop = box.top;

  if (anchor === "center") {
    targetTop = topLimit + (bottomLimit - topLimit - box.height) / 2 - (optical ? canvas.h * 0.03 : 0);
  } else if (anchor === "bottom") {
    targetTop = bottomLimit - box.height;
  } else {
    targetTop = topLimit;
  }
  // Never push content off either edge to satisfy an anchor — a block taller
  // than its own slot just starts at the top limit and lets the shrink/audit
  // passes deal with the overflow.
  targetTop = Math.max(topLimit, Math.min(targetTop, bottomLimit - box.height));
  if (box.height > bottomLimit - topLimit) targetTop = topLimit;

  const dy = Math.round(targetTop - box.top);
  if (dy === 0) return els;
  return els.map((e) => (e._pin ? e : { ...e, y: e.y + dy }));
}

/* -------------------------------- Rescaling -------------------------------- */

/**
 * Re-fit a slide's elements from one canvas size to another.
 *
 * Two decisions carry this:
 *
 * Scale is uniform, at min(widthRatio, heightRatio). Scaling each axis
 * independently would stretch the type — a 4:5 deck taken to 9:16 would render
 * every letter 42% taller than it is wide — so the aspect change is absorbed by
 * whitespace instead of by distortion.
 *
 * The leftover space is distributed in the SAME RATIO as the original margins
 * rather than simply centred. Centring would silently redesign the deck: a
 * cover whose title is deliberately anchored low would drift to the middle, and
 * a top-flushed list would sink. Preserving the ratio keeps bottom-anchored
 * content bottom-anchored and centred content centred, which is what "resize
 * the canvas" should mean.
 *
 * Full-bleed elements — a background image or a panel covering the whole
 * canvas — are snapped to the new bounds instead of scaled, since their intent
 * is "cover everything", not "be this many pixels".
 */
export function rescaleElements(elements, from, to) {
  if (!elements?.length || !from?.w || !to?.w) return elements || [];
  const k = Math.min(to.w / from.w, to.h / from.h);
  const fullBleed = (e) =>
    e.x <= 1 && e.y <= 1 && (e.w || 0) >= from.w - 2 && (e.h || 0) >= from.h - 2;

  const flow = elements.filter((e) => !fullBleed(e));
  let minX = 0, minY = 0, maxX = from.w, maxY = from.h;
  if (flow.length) {
    minX = Math.min(...flow.map((e) => e.x));
    minY = Math.min(...flow.map((e) => e.y));
    maxX = Math.max(...flow.map((e) => e.x + (e.w || 0)));
    maxY = Math.max(...flow.map((e) => e.y + (e.h || 0)));
  }
  const blockW = (maxX - minX) * k;
  const blockH = (maxY - minY) * k;
  // Original margins decide how the new slack is split.
  const leadX = minX, trailX = Math.max(0, from.w - maxX);
  const leadY = minY, trailY = Math.max(0, from.h - maxY);
  const freeX = Math.max(0, to.w - blockW);
  const freeY = Math.max(0, to.h - blockH);
  const offX = leadX + trailX > 0 ? freeX * (leadX / (leadX + trailX)) : freeX / 2;
  const offY = leadY + trailY > 0 ? freeY * (leadY / (leadY + trailY)) : freeY / 2;

  return elements.map((e) => {
    if (fullBleed(e)) return { ...e, x: 0, y: 0, w: to.w, h: to.h };
    const out = {
      ...e,
      x: Math.round(offX + (e.x - minX) * k),
      y: Math.round(offY + (e.y - minY) * k),
      w: Math.round((e.w || 0) * k),
      h: Math.round((e.h || 0) * k),
    };
    // Anything measured in px has to travel with the geometry, or the type
    // stays at its old size on a canvas that is no longer that size.
    if (typeof e.size === "number") out.size = Math.max(6, Math.round(e.size * k));
    if (typeof e.radius === "number") out.radius = Math.round(e.radius * k);
    if (typeof e.stroke_w === "number") out.stroke_w = Math.round(e.stroke_w * k * 100) / 100;
    if (typeof e.border_w === "number") out.border_w = Math.max(1, Math.round(e.border_w * k));
    return out;
  });
}

/* ------------------------------ Geometry audit ----------------------------- */
// The deterministic half of "loop engineering" (see ch16-creative-reasoning-
// engine.md §16.3.1's Eye Tracking / Self Critique stages): after a slide's
// elements are built, check for real geometry problems — overlapping text
// boxes, elements that landed off-canvas, boxes narrower/shorter than their
// own estimated content needs — and correct them in place. This runs on
// every premium slide (and can run on standard slides too) with no extra LLM
// call; it's the fast, free, always-on half of the refinement loop. A second,
// LLM-driven qualitative pass (regenerate copy on slides that still look
// weak) is layered on top in creqPremiumEngine.js's refineDeck() — this
// function is the geometry guardrail under it, not a replacement for it.
export function auditAndCorrect(elements, canvas) {
  const texts = elements.filter((e) => e.type === "text");
  const issues = [];
  // 1) Off-canvas: clamp any element whose box extends past the canvas.
  for (const e of elements) {
    if (e.x < 0) { e.x = 0; issues.push(`${e.id} clamped x`); }
    if (e.y < 0) { e.y = 0; issues.push(`${e.id} clamped y`); }
    if (e.x + (e.w || 0) > canvas.w) { e.x = Math.max(0, canvas.w - (e.w || 0)); issues.push(`${e.id} clamped right edge`); }
    if (e.y + (e.h || 0) > canvas.h) { e.y = Math.max(0, canvas.h - (e.h || 0)); issues.push(`${e.id} clamped bottom edge`); }
  }
  // 2) Re-verify every text box is tall enough for its own content at its
  // final font size — a shrink pass upstream (fitToCanvas) can leave a box
  // sized for the PRE-shrink font; regrow to the shrunk estimate so text
  // never clips against its own box.
  for (const e of texts) {
    if (e._hlock) continue; // height declared deliberately by the composition
    // Same measurement the composer used — see charRatio()'s note on why a
    // mismatch here actively creates the overlaps this pass exists to prevent.
    const needed = estimateBlockHeight(e.text, e.w, e.size, e.line_height || 1.2,
      charRatio(e.font, e.letter_spacing, e.uppercase));
    if (needed > e.h) { e.h = needed; issues.push(`${e.id} regrown to fit its own text`); }
  }
  // 3) Overlap resolution: sort by y, push down any text block whose box top
  // starts before the previous block's box actually ends (can happen after
  // rule 2 regrows an earlier block).
  // Two boxes only collide if they overlap on BOTH axes. Checking y alone
  // treats a deliberate two-column layout (headline left, body right, same y)
  // as a collision and shoves the right column below the left one — which is
  // exactly what it used to do. `_pin`ned elements are absolutely placed on
  // purpose and are never moved.
  // `_fixed` text is positioned RELATIVE TO SOMETHING ELSE — a button's label,
  // a panel's inner copy, a list row's index numeral. Moving it independently
  // separates it from the thing it belongs to (the CTA label used to get
  // pushed clean out of its own button), so it is never a push target.
  // `_pin` additionally opts out of anchoring.
  const overlapsX = (a, b) => a.x < b.x + (b.w || 0) && b.x < a.x + (a.w || 0);
  const sorted = texts.filter((e) => !e._pin && !e._fixed).sort((a, b) => a.y - b.y);
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i];
    for (let j = 0; j < i; j++) {
      const prev = sorted[j];
      if (!overlapsX(prev, cur)) continue;
      const prevBottom = prev.y + prev.h;
      if (cur.y < prevBottom) {
        const shift = prevBottom - cur.y + 16;
        cur.y += shift;
        issues.push(`${cur.id} pushed down ${shift}px to clear overlap with ${prev.id}`);
      }
    }
  }
  return { elements, issues };
}
