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
  // Warm browns. The most current of the set — the espresso/mocha neutral has
  // displaced grey as the default "serious warm" in the last two seasons.
  mocha: {
    id: "mocha",
    name: "Cream & Mocha",
    blurb: "Cream paper, espresso ink, caramel accent. Warm, tactile, premium — hospitality, food, beauty, craft.",
    surfaces: {
      paper: { bg: "#FAF6F1", panel: "#F0E8DF", text: "#2A1F1A", muted: "#6F6157", accent: "#8A5330", accentDisplay: "#965C37", rule: "#E6DCD0", onAccent: "#FAF6F1", dark: false },
      cloud: { bg: "#F0E8DF", panel: "#E3D7C9", text: "#2A1F1A", muted: "#6F6157", accent: "#8A5330", accentDisplay: "#965C37", rule: "#D8CBBB", onAccent: "#FAF6F1", dark: false },
      ink:   { bg: "#2A1F1A", panel: "#3A2C25", text: "#F0E8DF", muted: "#A79689", accent: "#D09A66", accentDisplay: "#D09A66", rule: "#4A3A31", onAccent: "#2A1F1A", dark: true },
      clay:  { bg: "#8A5330", panel: "#714227", text: "#FDF8F3", muted: "#E5C3A8", accent: "#FDF8F3", accentDisplay: "#FDF8F3", rule: "#A87352", onAccent: "#8A5330", dark: true },
    },
  },
  // A true blue, not the indigo/violet the anti-slop audit names as a tell —
  // saturated and confident rather than the default SaaS gradient hue.
  cobalt: {
    id: "cobalt",
    name: "Porcelain & Cobalt",
    blurb: "Porcelain paper, true cobalt accent. Confident and modern — fintech, B2B software, enterprise.",
    surfaces: {
      paper: { bg: "#F7F8FA", panel: "#EAEEF4", text: "#101828", muted: "#5C6675", accent: "#1B4AC4", accentDisplay: "#1E52D6", rule: "#DDE3EC", onAccent: "#F7F8FA", dark: false },
      cloud: { bg: "#EAEEF4", panel: "#DCE3EC", text: "#101828", muted: "#5C6675", accent: "#1B4AC4", accentDisplay: "#1E52D6", rule: "#CED7E3", onAccent: "#F7F8FA", dark: false },
      ink:   { bg: "#101828", panel: "#1A2436", text: "#EAEEF4", muted: "#94A0B2", accent: "#7FA8FF", accentDisplay: "#7FA8FF", rule: "#2A3748", onAccent: "#101828", dark: true },
      clay:  { bg: "#1B4AC4", panel: "#153BA0", text: "#F2F6FF", muted: "#BACDFF", accent: "#F2F6FF", accentDisplay: "#F2F6FF", rule: "#5379DA", onAccent: "#1B4AC4", dark: true },
    },
  },
  // Dark-first. The amber only reads correctly against a near-black ground, so
  // this family leans on its ink surface far more than the others.
  amber: {
    id: "amber",
    name: "Charcoal & Amber",
    blurb: "Charcoal ground, signal-amber accent. High contrast and energetic — developer tools, data, events.",
    surfaces: {
      paper: { bg: "#FAF8F3", panel: "#F0ECE2", text: "#1C1A16", muted: "#6B6459", accent: "#8A6100", accentDisplay: "#996C00", rule: "#E6E0D2", onAccent: "#FAF8F3", dark: false },
      cloud: { bg: "#F0ECE2", panel: "#E3DDCD", text: "#1C1A16", muted: "#6B6459", accent: "#8A6100", accentDisplay: "#996C00", rule: "#D6CFBC", onAccent: "#FAF8F3", dark: false },
      ink:   { bg: "#1C1A16", panel: "#2A2620", text: "#F0ECE2", muted: "#A39B8C", accent: "#F0B429", accentDisplay: "#F0B429", rule: "#3A352C", onAccent: "#1C1A16", dark: true },
      clay:  { bg: "#B8860B", panel: "#9A7009", text: "#1C1A16", muted: "#4A3A0C", accent: "#1C1A16", accentDisplay: "#1C1A16", rule: "#D2A63C", onAccent: "#B8860B", dark: false },
    },
  },
  // Editorial and unusual — the direction to reach for when the topic would be
  // flattened by another neutral-plus-blue deck.
  plum: {
    id: "plum",
    name: "Blush & Plum",
    blurb: "Blush paper, deep plum accent. Editorial and distinctive — fashion, media, culture, brand work.",
    surfaces: {
      paper: { bg: "#FBF7F8", panel: "#F2E8EC", text: "#241820", muted: "#6E5C66", accent: "#7A2F52", accentDisplay: "#8A375E", rule: "#E8DAE0", onAccent: "#FBF7F8", dark: false },
      cloud: { bg: "#F2E8EC", panel: "#E5D5DC", text: "#241820", muted: "#6E5C66", accent: "#7A2F52", accentDisplay: "#8A375E", rule: "#DAC7D0", onAccent: "#FBF7F8", dark: false },
      ink:   { bg: "#241820", panel: "#33232C", text: "#F2E8EC", muted: "#A38F9A", accent: "#DE8FAE", accentDisplay: "#DE8FAE", rule: "#42303A", onAccent: "#241820", dark: true },
      clay:  { bg: "#7A2F52", panel: "#631F41", text: "#FBF3F6", muted: "#E2B6C8", accent: "#FBF3F6", accentDisplay: "#FBF3F6", rule: "#A0567A", onAccent: "#7A2F52", dark: true },
    },
  },
  // Cool without being corporate blue; the sand paper keeps it from going cold.
  teal: {
    id: "teal",
    name: "Sand & Deep Teal",
    blurb: "Sand paper, deep teal accent. Calm and considered — healthcare, education, non-profit, wellbeing.",
    surfaces: {
      paper: { bg: "#F8F7F2", panel: "#EDEBE0", text: "#14201F", muted: "#5F6D6B", accent: "#1F5E5B", accentDisplay: "#236B67", rule: "#E1DED0", onAccent: "#F8F7F2", dark: false },
      cloud: { bg: "#EDEBE0", panel: "#DFDCCC", text: "#14201F", muted: "#5F6D6B", accent: "#1F5E5B", accentDisplay: "#236B67", rule: "#D3CFBD", onAccent: "#F8F7F2", dark: false },
      ink:   { bg: "#14201F", panel: "#1F2E2C", text: "#EDEBE0", muted: "#93A5A2", accent: "#6FC7C0", accentDisplay: "#6FC7C0", rule: "#2C3E3B", onAccent: "#14201F", dark: true },
      clay:  { bg: "#1F5E5B", panel: "#174846", text: "#F1F8F7", muted: "#ADD6D2", accent: "#F1F8F7", accentDisplay: "#F1F8F7", rule: "#4E8A87", onAccent: "#1F5E5B", dark: true },
    },
  },
};

/**
 * Enforce contrast on every hand-authored surface, once, at module load.
 *
 * The literals above are chosen by eye, and an eye is unreliable about this:
 * an audit of the original three families found the clay accent at 4.16:1 on
 * ivory and clay-surface muted text at 2.82:1 — both below AA, both shipped.
 * onLightAccent() existed to prevent exactly that but was only ever wired into
 * brand-derived families, so the hand-written tables were never actually
 * checked against it.
 *
 * Doing the correction here rather than in the literals makes the guarantee
 * structural: any family added later is safe without anyone remembering to
 * verify it. Colours already passing are left untouched, so the palettes stay
 * as authored wherever they were right to begin with.
 */
function enforceContrast(fam) {
  for (const s of Object.values(fam.surfaces)) {
    // Some grounds are simply too mid-tone to carry AA text at any foreground:
    // the authored clay #C15F3C tops out around 4.0:1 against both white and
    // near-black, so no amount of adjusting the text can rescue it. Deepening
    // the ground keeps the hue — which is the design intent — while making the
    // surface legible, and these are punctuation surfaces where a richer tone
    // reads perfectly well.
    if (contrast(s.text, s.bg) < 4.5) {
      const away = luminance(s.text) > 0.5 ? "#000000" : "#FFFFFF";
      for (let i = 0; i < 24 && contrast(s.text, s.bg) < 4.5; i++) s.bg = mix(s.bg, away, 0.05);
      s.panel = mix(s.panel, away, 0.12);
    }
    s.text = ensureContrast(s.text, s.bg, 4.5);
    s.muted = ensureContrast(s.muted, s.bg, 4.5);
    // Small accent text has the full AA bar; the display variant only carries
    // headline-sized type, which AA rates at 3:1.
    s.accent = ensureContrast(s.accent, s.bg, 4.5);
    s.accentDisplay = ensureContrast(s.accentDisplay, s.bg, 3);
    s.onAccent = ensureContrast(s.onAccent, s.accent, 4.5);
  }
  return fam;
}

/** Walk `fg` toward whichever pole increases contrast against `bg` until it
 * clears `target`. Steps are small so a colour that only just fails is nudged
 * rather than collapsed to black or white. */
export function ensureContrast(fg, bg, target = 4.5) {
  if (!fg || !bg || contrast(fg, bg) >= target) return fg;
  // Pick the pole by measuring both, not by a luminance threshold. A mid-tone
  // ground breaks the threshold heuristic: against amber #B8860B black reaches
  // 6.8:1 while white only reaches 3.1:1, but its luminance sits on the "go
  // lighter" side of any fixed cutoff, so the rule would walk the colour the
  // wrong way and never converge.
  const toward = contrast("#000000", bg) >= contrast("#FFFFFF", bg) ? "#000000" : "#FFFFFF";
  let out = fg;
  for (let i = 0; i < 24 && contrast(out, bg) < target; i++) out = mix(out, toward, 0.06);
  return out;
}

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
  // Brand-derived families are built on demand from user colour, so they get
  // the same contrast enforcement the static tables receive at load.
  if (brand) return enforceContrast(familyFromBrand(brand));
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

// Runs here, not next to the palette tables: enforceContrast depends on mix()
// and contrast(), which are `const` bindings defined above and would still be
// in their temporal dead zone at the point the tables are declared.
Object.values(PALETTE_FAMILIES).forEach(enforceContrast);

/* ------------------------------- Typography -------------------------------- */
// Sizes are fractions of canvas WIDTH so every format (LinkedIn 4:5, IG square,
// IG story 9:16, custom) reads at the same relative scale. Leading/tracking are
// the part that actually makes it look editorial: display sits tight (1.05) and
// body sits open (1.55), and that contrast is deliberate.

// Geist, not Inter. Two independent rules land on the same verdict: the suite's
// own design system (docs/design-system.md §24.6) bans Inter outright and
// specifies Geist for UI text, and "Inter, chosen because it is safe" is a named
// tell on the anti-slop audit this system is modelled on. The display face stays
// an editorial serif — that is the deck's own typographic identity, and it is
// what carries the light/dark editorial look these compositions are built for.
export const FONTS = {
  display: "Instrument Serif", // high-contrast editorial serif, single weight by design
  sans: "Geist",
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
