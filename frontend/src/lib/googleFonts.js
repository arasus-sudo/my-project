// Shared Google Fonts loader — keyless CSS2 endpoint (fonts.googleapis.com),
// same mechanism the 10-font preload in public/index.html already uses.
//
// ElementRender.jsx renders text via a plain inline `fontFamily: el.font`
// (no lookup table, no CSS class) — so any of the ~1900 families the picker
// now offers renders correctly the instant its stylesheet link exists in
// <head>. This is the one place that link gets injected, deduped so the same
// family is never requested twice.

const _loaded = new Set();

function toCss2Family(family, weights) {
  const w = [...new Set(weights?.length ? weights : [400])].sort((a, b) => a - b).join(";");
  return `${encodeURIComponent(family).replace(/%20/g, "+")}:wght@${w}`;
}

/** Inject a <link> for one family/weight set. Safe to call repeatedly — a
 *  family already loaded (at any weight set) is skipped, since re-requesting
 *  it with different weights would just add a second <link> for the same
 *  font family and isn't worth the bookkeeping for an editor use case. */
export function loadFont(family, weights = [400, 700]) {
  if (!family || _loaded.has(family)) return;
  _loaded.add(family);
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${toCss2Family(family, weights)}&display=swap`;
  document.head.appendChild(link);
}

export function isFontLoaded(family) {
  return _loaded.has(family);
}

/** Walk a deck's slides and make sure every font actually in use is loaded —
 *  needed so a saved project reopens showing the right fonts (not just
 *  whatever was loaded while it was last being edited), and so export
 *  (html2canvas rasterizes whatever is currently rendered) never falls back
 *  to a system font because a family's stylesheet hadn't loaded yet. */
export function ensureProjectFontsLoaded(slides) {
  const families = new Set();
  for (const slide of slides || []) {
    for (const el of slide.elements || []) {
      if (el.type === "text" && el.font) families.add(el.font);
    }
  }
  families.forEach((f) => loadFont(f));
  return families;
}

/** Export needs a stronger guarantee than "the <link> exists" — html2canvas
 *  rasterizes whatever is on screen the instant it's called, and injecting a
 *  stylesheet link doesn't mean the browser has fetched/parsed that font yet.
 *  Without this, an export triggered right after picking a new font can
 *  silently rasterize the fallback font instead. `document.fonts.load` forces
 *  the fetch and resolves once it's actually usable; a per-font timeout keeps
 *  one slow/unavailable family from hanging the whole export. */
export async function waitForProjectFonts(slides, timeoutMs = 4000) {
  const families = ensureProjectFontsLoaded(slides);
  if (!families.size || !document.fonts?.load) return;

  const withTimeout = (p) => Promise.race([
    p, new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);

  await Promise.all(
    [...families].map((f) => withTimeout(document.fonts.load(`16px "${f}"`).catch(() => {})))
  );
}
