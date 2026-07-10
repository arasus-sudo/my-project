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

/** Deep-strip local-only keys before persisting the project. */
export function stripLocalKeys(project) {
  return {
    ...project,
    slides: project.slides.map(({ _k, ...s }) => ({ ...s, elements: (s.elements || []).map((e) => ({ ...e })) })),
  };
}
