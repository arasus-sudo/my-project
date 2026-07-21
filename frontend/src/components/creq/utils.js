/** Small helpers shared across Create EQ editor modules. */
import { resolveColor } from "../../lib/creqTemplates";
import { renderBackgroundExt } from "../../lib/creqBgStyles";

export function newId() {
  return Math.random().toString(36).slice(2, 10);
}

export function renderBackground(bg, palette) {
  return renderBackgroundExt(bg, palette);
}

export function renderBackgroundImageCss(slide) {
  if (!slide?.bg_img) return null;
  return {
    position: "absolute", inset: 0,
    backgroundImage: `url("${slide.bg_img}")`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    opacity: slide.bg_img_opacity ?? 0.3,
    pointerEvents: "none",
    zIndex: 0,
  };
}

/** The full typographic style of a text element. Shared by ElementRender and
 * InlineTextEditor so double-click editing is pixel-identical to the rendered
 * text — same font, size, spacing, shadow, highlight — with zero visual jump
 * when the editor overlay appears. */
export function textStyleOf(el, palette) {
  const shadow = el.shadow ? `${el.shadow_x || 0}px ${el.shadow_y ?? 4}px ${el.shadow_blur ?? 12}px ${resolveColor(el.shadow_color || "rgba(0,0,0,0.35)", palette)}` : "none";
  const strokeC = resolveColor(el.stroke_color || "bg", palette);
  const stroke = el.stroke_w
    ? `-${el.stroke_w}px -${el.stroke_w}px 0 ${strokeC}, ${el.stroke_w}px -${el.stroke_w}px 0 ${strokeC}, -${el.stroke_w}px ${el.stroke_w}px 0 ${strokeC}, ${el.stroke_w}px ${el.stroke_w}px 0 ${strokeC}`
    : null;
  return {
    color: resolveColor(el.color, palette),
    fontFamily: `"${el.font || "Inter"}", sans-serif`,
    fontSize: el.size,
    fontWeight: el.weight,
    fontStyle: el.italic ? "italic" : "normal",
    textTransform: el.uppercase ? "uppercase" : "none",
    letterSpacing: `${el.letter_spacing || 0}em`,
    lineHeight: el.line_height || 1.2,
    textAlign: el.align || "left",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    textShadow: stroke ? `${stroke}${el.shadow ? `, ${shadow}` : ""}` : shadow,
    ...(el.highlight ? {
      backgroundColor: resolveColor(el.highlight, palette),
      padding: "0.05em 0.25em",
      boxDecorationBreak: "clone",
      WebkitBoxDecorationBreak: "clone",
    } : null),
  };
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
