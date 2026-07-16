/** Small helpers shared across Create EQ editor modules. */
import { resolveColor } from "../../lib/creqTemplates";

export function newId() {
  return Math.random().toString(36).slice(2, 10);
}

export function renderBackground(bg, palette) {
  if (!bg) return palette.bg;
  if (bg.type === "gradient") {
    const c1 = resolveColor(bg.color, palette);
    const c2 = resolveColor(bg.color2 || "accent", palette);
    return `linear-gradient(${bg.angle || 145}deg, ${c1}, ${c2})`;
  }
  return resolveColor(bg.color || "bg", palette);
}

/** The on-canvas bounding box of an element, in canvas px. Two types don't
 * follow their stored w/h: icons render square from `w` alone, and badges
 * auto-size to their text (width/height:auto) so their stored w/h are stale —
 * callers that have live measurements (ResizeObserver, see ElementRender's
 * badge branch) pass them via `measured` keyed by element id. */
export function elementBounds(el, measured) {
  if (el.type === "icon") return { x: el.x, y: el.y, w: el.w, h: el.w };
  if (el.type === "badge") {
    const m = measured?.[el.id];
    if (m) return { x: el.x, y: el.y, w: m.w, h: m.h };
  }
  return { x: el.x, y: el.y, w: el.w || 0, h: el.h || 0 };
}

/** Deep-strip local-only keys before persisting the project. */
export function stripLocalKeys(project) {
  return {
    ...project,
    slides: project.slides.map(({ _k, ...s }) => ({ ...s, elements: (s.elements || []).map((e) => ({ ...e })) })),
  };
}
