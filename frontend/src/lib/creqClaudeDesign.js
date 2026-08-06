// Create EQ — "Claude Design" system.
//
// This is the design system Premium mode composes against. It exists because
// the previous premium engine let the LLM invent five arbitrary hex values per
// deck and then stacked Archivo-Black text down from the top of the canvas —
// which reliably produced a generic "startup poster", never the editorial,
// print-like look the product is being held to.
//
// The fix is the same one a real studio would apply: STOP asking the model for
// raw colour, and give it a system to choose FROM. The model picks a family
// and an archetype; every actual hex, size, leading, margin and rule weight in
// the output comes from the tokens below.
//
// Reverse-engineered characteristics this encodes (see ch16 §16.6):
//   1. Warm paper, not white; warm near-black, not #000. Backgrounds sit
//      around #FAF9F5/#F0EEE6 and ink around #191919 — the whole system is
//      warm-biased, which is most of why it reads as "designed" rather than
//      "default".
//   2. Exactly ONE chromatic accent (a clay/terracotta), used sparingly, and
//      DARKENED on light surfaces so small accent text still passes contrast.
//   3. High-contrast display serif for headlines at 1.05 leading, a quiet
//      grotesque for body at ~1.55 leading. The leading gap between the two is
//      doing a lot of the work.
//   4. Generous margins (~9.3% per side) and deliberate whitespace — content
//      is optically anchored (centre/bottom), never just flushed to the top
//      leaving a dead lower half.
//   5. Hairline rules and small tracked-out mono eyebrows instead of filled
//      pills/badges as the structural furniture.
//   6. Deck-level rhythm: mostly paper slides, punctuated by one or two ink or
//      clay slides. Two dark slides never sit adjacent.
//
// Element colours are emitted as literal hex, which works because
// creqTemplates.js's resolveColor() falls through to the raw string when a
// name isn't a palette key. That is what lets a single deck mix light and dark
// slides — a token like "text" cannot invert per-slide, a hex can.

/* ------------------------------- Surfaces --------------------------------- */
// A surface is a complete, self-consistent colour context for ONE slide:
// background, the panel tone that sits on it, text, muted text, the accent as
// used for display vs small text, hairline rule colour, and what colour text
// must be when it sits ON the accent.

/** @typedef {{bg:string,panel:string,text:string,muted:string,accent:string,
 *  accentDisplay:string,rule:string,onAccent:string,dark:boolean}} Surface */

export const PALETTE_FAMILIES = {
  // The default and the reference implementation — Anthropic/Claude's own
  // warm ivory + book-cloth clay. Everything else in here is built to the
  // same construction rules so a deck never loses the discipline.
  claude: {
    id: "claude",
    name: "Ivory & Clay",
    blurb: "Warm ivory paper, book-cloth clay accent, warm near-black ink. The default.",
    surfaces: {
      paper: { bg: "#FAF9F5", panel: "#F0EEE6", text: "#191919", muted: "#6B6862", accent: "#BD5D3A", accentDisplay: "#C15F3C", rule: "#DFDCD2", onAccent: "#FFF8F3", dark: false },
      cloud: { bg: "#F0EEE6", panel: "#E4E1D6", text: "#191919", muted: "#6B6862", accent: "#BD5D3A", accentDisplay: "#C15F3C", rule: "#D5D1C5", onAccent: "#FFF8F3", dark: false },
      ink:   { bg: "#191919", panel: "#262625", text: "#F0EEE6", muted: "#A1A09A", accent: "#D97757", accentDisplay: "#D97757", rule: "#3A3A38", onAccent: "#191919", dark: true },
      clay:  { bg: "#C15F3C", panel: "#A94E2F", text: "#FFF8F3", muted: "#F2CBB9", accent: "#FFF8F3", accentDisplay: "#FFF8F3", rule: "#D98A6C", onAccent: "#C15F3C", dark: true },
    },
  },
  // Same construction, cooler botanical hue — for topics where terracotta
  // reads wrong (sustainability, health, research).
  sage: {
    id: "sage",
    name: "Chalk & Sage",
    blurb: "Cool chalk paper, deep evergreen accent. Quieter, more institutional.",
    surfaces: {
      paper: { bg: "#F7F8F5", panel: "#ECEEE8", text: "#16201A", muted: "#616B62", accent: "#2F6B4F", accentDisplay: "#337355", rule: "#DCE0D8", onAccent: "#F7F8F5", dark: false },
      cloud: { bg: "#ECEEE8", panel: "#DFE3DA", text: "#16201A", muted: "#616B62", accent: "#2F6B4F", accentDisplay: "#337355", rule: "#D2D7CC", onAccent: "#F7F8F5", dark: false },
      ink:   { bg: "#16201A", panel: "#222D25", text: "#ECEEE8", muted: "#9AA69D", accent: "#7FBFA0", accentDisplay: "#7FBFA0", rule: "#334037", onAccent: "#16201A", dark: true },
      clay:  { bg: "#2F6B4F", panel: "#265741", text: "#F2F7F3", muted: "#B6D7C4", accent: "#F2F7F3", accentDisplay: "#F2F7F3", rule: "#5B9377", onAccent: "#2F6B4F", dark: true },
    },
  },
  // Same construction, mineral/blue-grey — for finance, engineering, data.
  oxide: {
    id: "oxide",
    name: "Bone & Oxide",
    blurb: "Bone paper, oxidised steel-blue accent. Reads technical and precise.",
    surfaces: {
      paper: { bg: "#F8F8F6", panel: "#EDEDEA", text: "#15181C", muted: "#61666E", accent: "#2C5470", accentDisplay: "#2F5C7A", rule: "#DEDEDA", onAccent: "#F8F8F6", dark: false },
      cloud: { bg: "#EDEDEA", panel: "#E0E0DC", text: "#15181C", muted: "#61666E", accent: "#2C5470", accentDisplay: "#2F5C7A", rule: "#D2D2CD", onAccent: "#F8F8F6", dark: false },
      ink:   { bg: "#15181C", panel: "#212529", text: "#EDEDEA", muted: "#989EA6", accent: "#7FB0D0", accentDisplay: "#7FB0D0", rule: "#333A41", onAccent: "#15181C", dark: true },
      clay:  { bg: "#2C5470", panel: "#23445C", text: "#F1F6F9", muted: "#B4CEDF", accent: "#F1F6F9", accentDisplay: "#F1F6F9", rule: "#5A82A0", onAccent: "#2C5470", dark: true },
    },
  },
};

export const DEFAULT_FAMILY = "claude";

/** Ids + blurbs, for the backend prompt's constrained choice list. */
export const FAMILY_CHOICES = Object.values(PALETTE_FAMILIES).map((f) => ({ id: f.id, name: f.name, blurb: f.blurb }));

/** Build a family from a user-supplied brand kit. Their colours are treated as
 * a hard constraint (a real client's guidelines), but the SYSTEM still applies:
 * we derive the paper/ink/clay surface set around their hexes rather than
 * dumping one bg + one accent onto every slide, which is what made
 * brand-locked premium decks look flat. */
export function familyFromBrand(brand) {
  const bg = brand?.bg || "#FAF9F5";
  const accent = brand?.accent || "#C15F3C";
  const text = brand?.text || "#191919";
  const bgDark = isDark(bg);
  // The brand's own background becomes the deck's dominant surface; the
  // opposite pole is synthesised from their text colour so there is still a
  // light/dark rhythm to punctuate with.
  const light = bgDark ? { bg: text, text: bg } : { bg, text };
  const dark = bgDark ? { bg, text } : { bg: text, text: bg };
  return {
    id: "brand",
    name: "Brand kit",
    blurb: "Your supplied brand colours.",
    surfaces: {
      paper: { bg: light.bg, panel: mix(light.bg, light.text, 0.06), text: light.text, muted: mix(light.text, light.bg, 0.42), accent: onLightAccent(accent, light.bg), accentDisplay: onLightAccent(accent, light.bg), rule: mix(light.bg, light.text, 0.14), onAccent: light.bg, dark: false },
      cloud: { bg: mix(light.bg, light.text, 0.06), panel: mix(light.bg, light.text, 0.12), text: light.text, muted: mix(light.text, light.bg, 0.42), accent: onLightAccent(accent, light.bg), accentDisplay: onLightAccent(accent, light.bg), rule: mix(light.bg, light.text, 0.18), onAccent: light.bg, dark: false },
      ink:   { bg: dark.bg, panel: mix(dark.bg, dark.text, 0.1), text: dark.text, muted: mix(dark.text, dark.bg, 0.42), accent, accentDisplay: accent, rule: mix(dark.bg, dark.text, 0.2), onAccent: dark.bg, dark: true },
      clay:  { bg: accent, panel: mix(accent, "#000000", 0.14), text: readableOn(accent), muted: mix(readableOn(accent), accent, 0.35), accent: readableOn(accent), accentDisplay: readableOn(accent), rule: mix(accent, readableOn(accent), 0.35), onAccent: accent, dark: isDark(accent) },
    },
  };
}

export function getFamily(id, brand) {
  if (brand) return familyFromBrand(brand);
  return PALETTE_FAMILIES[id] || PALETTE_FAMILIES[DEFAULT_FAMILY];
}

/* ----------------------------- Colour utilities ---------------------------- */

function hexToRgb(hex) {
  const h = String(hex || "").replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6);
  const n = parseInt(full || "000000", 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
const toHex = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");

/** Relative luminance, used for the light/dark decisions above. */
export function luminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const f = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
export const isDark = (hex) => luminance(hex) < 0.42;
export const readableOn = (hex) => (isDark(hex) ? "#FFF8F3" : "#191919");

/** Linear blend, `t` of `b` into `a`. */
export function mix(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return `#${toHex(A.r + (B.r - A.r) * t)}${toHex(A.g + (B.g - A.g) * t)}${toHex(A.b + (B.b - A.b) * t)}`;
}

/** Contrast ratio between two hexes (WCAG). */
export function contrast(a, b) {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** An accent used for SMALL text on a light background usually fails contrast
 * at its display value — darken it until it clears ~4.5:1 rather than shipping
 * unreadable body copy. Display-size text has a lower bar (3:1) and keeps the
 * brighter value, which is why surfaces carry both. */
export function onLightAccent(accent, bg) {
  let c = accent;
  for (let i = 0; i < 12 && contrast(c, bg) < 4.5; i++) c = mix(c, "#000000", 0.08);
  return c;
}

/* ------------------------------- Typography -------------------------------- */
// Sizes are fractions of canvas WIDTH so every format (LinkedIn 4:5, IG square,
// IG story 9:16, custom) reads at the same relative scale. Leading/tracking are
// the part that actually makes it look editorial: display sits tight (1.05) and
// body sits open (1.55), and that contrast is deliberate.

export const FONTS = {
  display: "Instrument Serif", // high-contrast editorial serif, single weight by design
  sans: "Inter",
  mono: "JetBrains Mono",
};

export const TYPE = {
  eyebrow:   { font: FONTS.mono,    ratio: 0.0165, weight: 500, leading: 1.2,  tracking: 0.18, uppercase: true },
  displayXl: { font: FONTS.display, ratio: 0.092,  weight: 400, leading: 1.02, tracking: -0.02 },
  displayLg: { font: FONTS.display, ratio: 0.074,  weight: 400, leading: 1.05, tracking: -0.02 },
  displayMd: { font: FONTS.display, ratio: 0.056,  weight: 400, leading: 1.1,  tracking: -0.015 },
  headline:  { font: FONTS.sans,    ratio: 0.040,  weight: 600, leading: 1.2,  tracking: -0.01 },
  stat:      { font: FONTS.display, ratio: 0.215,  weight: 400, leading: 0.9,  tracking: -0.03 },
  bodyLg:    { font: FONTS.sans,    ratio: 0.0265, weight: 400, leading: 1.5,  tracking: 0 },
  body:      { font: FONTS.sans,    ratio: 0.0225, weight: 400, leading: 1.55, tracking: 0 },
  caption:   { font: FONTS.sans,    ratio: 0.0175, weight: 500, leading: 1.4,  tracking: 0 },
  quote:     { font: FONTS.display, ratio: 0.062,  weight: 400, leading: 1.18, tracking: -0.015, italic: true },
  itemLabel: { font: FONTS.mono,    ratio: 0.0195, weight: 500, leading: 1.2,  tracking: 0.06 },
};

/** Resolve a TYPE role into concrete px for a canvas, with an optional scale
 * nudge (compositions use this to react to density without redefining a role). */
export function type(role, canvas, scale = 1) {
  const t = TYPE[role] || TYPE.body;
  return {
    font: t.font,
    size: Math.max(9, Math.round(canvas.w * t.ratio * scale)),
    weight: t.weight,
    lineHeight: t.leading,
    letterSpacing: t.tracking,
    uppercase: !!t.uppercase,
    italic: !!t.italic,
  };
}

/* --------------------------------- Grid ------------------------------------ */

/** Margins are proportional and generous — the single most reliable difference
 * between an editorial slide and a cramped one. 12 columns so compositions can
 * align to real column edges instead of arbitrary percentages. */
export function grid(canvas) {
  const margin = Math.round(canvas.w * 0.093);
  const gutter = Math.round(canvas.w * 0.026);
  const cw = canvas.w - margin * 2;
  const col = (cw - gutter * 11) / 12;
  return {
    margin, gutter, cw, col,
    baseline: canvas.h / 54,
    left: margin,
    right: canvas.w - margin,
    top: margin,
    bottom: canvas.h - margin,
    /** x offset of column `i` (0-indexed) */
    x: (i) => margin + i * (col + gutter),
    /** width spanning `n` columns */
    span: (n) => n * col + (n - 1) * gutter,
  };
}

/* ------------------------------ Deck rhythm -------------------------------- */

const DARK = new Set(["ink", "clay"]);

/**
 * Assign a surface to every slide in the deck.
 *
 * The model gets to express an INTENT ("this one should feel heavy") but not to
 * pick the literal surface, because per-slide independent choices produce decks
 * that either strobe light/dark or never vary at all. Rhythm rules enforced
 * here instead:
 *   - the cover opens dark (ink), which is how these decks nearly always open
 *   - the closer lands dark, and on a different dark surface than the cover
 *     when the deck is long enough to have earned the contrast
 *   - interior slides are paper by default, drifting to cloud every third slide
 *     so long decks don't read as one flat sheet
 *   - at most one interior dark punctuation slide, placed ~60% through, and
 *     never adjacent to another dark slide
 */
export function planSurfaces(slides) {
  const n = slides.length;
  if (n === 0) return [];
  const out = new Array(n).fill("paper");
  out[0] = "ink";
  if (n > 1) out[n - 1] = n >= 5 ? "clay" : "ink";

  for (let i = 1; i < n - 1; i++) out[i] = i % 3 === 2 ? "cloud" : "paper";

  // One interior punctuation slide, preferring whatever the model flagged as
  // heaviest if that index is legal.
  if (n >= 5) {
    const preferred = slides.findIndex((s, i) => i > 1 && i < n - 2 && (s?.surface_intent === "dark" || s?.archetype === "stat"));
    const fallback = Math.max(2, Math.min(n - 3, Math.round(n * 0.6)));
    const idx = preferred > 1 && preferred < n - 2 ? preferred : fallback;
    if (!DARK.has(out[idx - 1]) && !DARK.has(out[idx + 1])) out[idx] = "ink";
  }
  return out;
}

/** Full render context for one slide. */
export function slideContext(canvas, family, surfaceName) {
  const surface = family.surfaces[surfaceName] || family.surfaces.paper;
  return { canvas, family, surface, surfaceName, g: grid(canvas) };
}
