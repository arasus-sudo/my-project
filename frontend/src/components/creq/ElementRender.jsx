import { Zap, Award, Star, Rocket, Sparkles } from "lucide-react";
import { resolveColor } from "../../lib/creqTemplates";

export const ICONS = { Zap, Award, Star, Rocket, Sparkles };

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

/** Render a single Create EQ element on the canvas. */
export default function ElementRender({ el, palette, selected, onPointerDown, onResizeStart }) {
  const common = {
    position: "absolute",
    left: el.x, top: el.y, width: el.w, height: el.h,
    cursor: "move",
    userSelect: "none",
    outline: selected ? "2px solid #E85D3A" : "none",
    outlineOffset: 3,
    boxSizing: "border-box",
  };
  const handles = selected && onResizeStart ? (
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
    const shadow = el.shadow ? `${el.shadow_x || 0}px ${el.shadow_y || 4}px ${el.shadow_blur || 12}px ${el.shadow_color || "rgba(0,0,0,0.35)"}` : "none";
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
      }} onPointerDown={onPointerDown}>
        {el.text}
        {handles}
      </div>
    );
  }
  if (el.type === "image") {
    return (
      <div onPointerDown={onPointerDown} style={{ ...common, borderRadius: el.radius ?? 0, overflow: "hidden", background: "#00000010" }}>
        <img src={el.src} alt="" crossOrigin="anonymous"
          style={{ width: "100%", height: "100%", objectFit: el.fit || "cover", display: "block", pointerEvents: "none" }}
          onError={(e) => { e.currentTarget.style.opacity = 0.2; }} />
        {handles}
      </div>
    );
  }
  if (el.type === "shape") {
    return (
      <div onPointerDown={onPointerDown} style={{
        ...common,
        background: resolveColor(el.fill, palette),
        opacity: el.opacity ?? 1,
        borderRadius: el.shape === "circle" ? 9999 : (el.radius ?? 0),
      }}>{handles}</div>
    );
  }
  if (el.type === "badge") {
    return (
      <div onPointerDown={onPointerDown} style={{
        ...common,
        background: resolveColor(el.bg, palette),
        color: resolveColor(el.color, palette),
        borderRadius: el.radius ?? 999,
        padding: "10px 20px",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontFamily: `"JetBrains Mono", monospace`, fontSize: el.size || 20,
        letterSpacing: "0.14em", textTransform: "uppercase",
        width: "auto", height: "auto", minWidth: 0,
      }}>{el.text}{handles}</div>
    );
  }
  if (el.type === "icon") {
    const IC = ICONS[el.name] || Zap;
    return (
      <div onPointerDown={onPointerDown} style={{ ...common, width: el.w, height: el.w, color: resolveColor(el.color, palette) }}>
        <IC size={el.w} strokeWidth={el.stroke || 2} />
        {handles}
      </div>
    );
  }
  return null;
}
