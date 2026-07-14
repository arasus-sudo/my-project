import { memo } from "react";
import {
  Zap, Award, Star, Rocket, Sparkles,
  ArrowRight, ArrowUpRight, Check, X, Heart, Flame, Trophy, Lightbulb, Target,
  TrendingUp, Quote, ThumbsUp, MessageCircle, Clock, Calendar, Mail, Globe,
  ShieldCheck, Users, Gift,
} from "lucide-react";
import { resolveColor } from "../../lib/creqTemplates";

export const ICONS = {
  Zap, Award, Star, Rocket, Sparkles,
  ArrowRight, ArrowUpRight, Check, X, Heart, Flame, Trophy, Lightbulb, Target,
  TrendingUp, Quote, ThumbsUp, MessageCircle, Clock, Calendar, Mail, Globe,
  ShieldCheck, Users, Gift,
};

const RESIZE_HANDLES = [
  { pos: "nw", cursor: "nwse-resize", style: { top: -6, left: -6 } },
  { pos: "n",  cursor: "ns-resize",   style: { top: -6, left: "50%", transform: "translateX(-50%)" } },
  { pos: "ne", cursor: "nesw-resize", style: { top: -6, right: -6 } },
  { pos: "e",  cursor: "ew-resize",   style: { top: "50%", right: -6, transform: "translateY(-50%)" } },
  { pos: "se", cursor: "nwse-resize", style: { bottom: -6, right: -6 } },
  { pos: "s",  cursor: "ns-resize",   style: { bottom: -6, left: "50%", transform: "translateX(-50%)" } },
  { pos: "sw", cursor: "nesw-resize", style: { bottom: -6, left: -6 } },
  { pos: "w",  cursor: "ew-resize",   style: { top: "50%", left: -6, transform: "translateY(-50%)" } },
];

/** rotate + flip combine into one CSS transform; resize handles stay axis-aligned. */
function elementTransform(el) {
  const parts = [];
  if (el.rotate) parts.push(`rotate(${el.rotate}deg)`);
  if (el.flip_h) parts.push("scaleX(-1)");
  if (el.flip_v) parts.push("scaleY(-1)");
  return parts.length ? parts.join(" ") : undefined;
}

/** Shared drop-shadow for shapes/images/badges (text uses text-shadow instead, see below). */
function elementBoxShadow(el) {
  if (!el.shadow) return "none";
  const x = el.shadow_x || 0;
  const y = el.shadow_y ?? 4;
  const blur = el.shadow_blur ?? 12;
  const color = el.shadow_color || "rgba(0,0,0,0.35)";
  return `${x}px ${y}px ${blur}px ${color}`;
}

/** Render a single Create EQ element on the canvas.
 * `selected` drives the outline (true for every element in a multi-selection);
 * `showHandles` (defaults to `selected`) gates the resize handles — callers with
 * multi-select pass it separately so handles only ever appear on one element
 * at a time. */
function ElementRender({ el, palette, selected, showHandles, onPointerDown, onResizeStart }) {
  const common = {
    position: "absolute",
    left: el.x, top: el.y, width: el.w, height: el.h,
    cursor: "move",
    userSelect: "none",
    outline: selected ? "2px solid #E85D3A" : "none",
    outlineOffset: 3,
    boxSizing: "border-box",
    opacity: el.opacity ?? 1,
    transform: elementTransform(el),
  };
  const bind = (e) => onPointerDown(e, el);
  const handles = (showHandles ?? selected) && onResizeStart ? (
    <>
      {RESIZE_HANDLES.map((h) => (
        <div key={h.pos}
          data-testid={`resize-${h.pos}`}
          onPointerDown={(e) => { e.stopPropagation(); onResizeStart(e, el, h.pos); }}
          style={{
            position: "absolute", width: 12, height: 12, background: "#E85D3A",
            border: "2px solid #FFFFFF", borderRadius: 3, cursor: h.cursor, zIndex: 20,
            boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
            ...h.style,
          }} />
      ))}
    </>
  ) : null;

  if (el.type === "text") {
    const shadow = el.shadow ? `${el.shadow_x || 0}px ${el.shadow_y ?? 4}px ${el.shadow_blur ?? 12}px ${resolveColor(el.shadow_color || "rgba(0,0,0,0.35)", palette)}` : "none";
    const stroke = el.stroke_w
      ? `-${el.stroke_w}px -${el.stroke_w}px 0 ${resolveColor(el.stroke_color || "bg", palette)}, ${el.stroke_w}px -${el.stroke_w}px 0 ${resolveColor(el.stroke_color || "bg", palette)}, -${el.stroke_w}px ${el.stroke_w}px 0 ${resolveColor(el.stroke_color || "bg", palette)}, ${el.stroke_w}px ${el.stroke_w}px 0 ${resolveColor(el.stroke_color || "bg", palette)}`
      : null;
    return (
      <div style={{
        ...common,
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
      }} onPointerDown={bind}>
        {el.text}
        {handles}
      </div>
    );
  }
  if (el.type === "image") {
    // The faint dark tint is a loading/broken-image placeholder for photos —
    // logos are almost always transparent-background PNGs meant to sit
    // directly on the slide's own background, so the tint just shows through
    // as a visible box behind them. Skip it for role:"logo" images.
    const isLogo = el.role === "logo";
    return (
      <div onPointerDown={bind} style={{ ...common, borderRadius: el.radius ?? 0, overflow: "hidden", background: isLogo ? "transparent" : "#00000010", boxShadow: elementBoxShadow(el) }}>
        <img src={el.src} alt="" crossOrigin="anonymous"
          style={{ width: "100%", height: "100%", objectFit: el.fit || "cover", display: "block", pointerEvents: "none", imageRendering: "auto" }}
          onError={(e) => { e.currentTarget.style.opacity = 0.2; }} />
        {handles}
      </div>
    );
  }
  if (el.type === "shape") {
    const filled = !el.stroke_only;
    return (
      <div onPointerDown={bind} style={{
        ...common,
        background: filled ? resolveColor(el.fill, palette) : "transparent",
        border: el.stroke_only ? `${el.border_w || 3}px solid ${resolveColor(el.border_color || el.fill || "text", palette)}` : "none",
        boxShadow: elementBoxShadow(el),
        borderRadius: el.shape === "circle" ? 9999 : (el.radius ?? 0),
      }}>{handles}</div>
    );
  }
  if (el.type === "line") {
    return (
      <div onPointerDown={bind} style={{
        ...common,
        background: resolveColor(el.color || "text", palette),
        borderRadius: (el.h || 4) / 2,
      }}>{handles}</div>
    );
  }
  if (el.type === "badge") {
    return (
      <div onPointerDown={bind} style={{
        ...common,
        background: resolveColor(el.bg, palette),
        color: resolveColor(el.color, palette),
        borderRadius: el.radius ?? 999,
        padding: "10px 20px",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontFamily: `"JetBrains Mono", monospace`, fontSize: el.size || 20,
        letterSpacing: "0.14em", textTransform: "uppercase",
        width: "auto", height: "auto", minWidth: 0,
        boxShadow: elementBoxShadow(el),
      }}>{el.text}{handles}</div>
    );
  }
  if (el.type === "icon") {
    const IC = ICONS[el.name] || Zap;
    return (
      <div onPointerDown={bind} style={{ ...common, width: el.w, height: el.w, color: resolveColor(el.color, palette) }}>
        <IC size={el.w} strokeWidth={el.stroke || 2} />
        {handles}
      </div>
    );
  }
  return null;
}

export default memo(ElementRender);
