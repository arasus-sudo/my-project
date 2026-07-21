import { memo, useEffect, useRef } from "react";
import {
  Zap, Award, Star, Rocket, Sparkles,
  ArrowRight, ArrowUpRight, Check, X, Heart, Flame, Trophy, Lightbulb, Target,
  TrendingUp, Quote, ThumbsUp, MessageCircle, Clock, Calendar, Mail, Globe,
  ShieldCheck, Users, Gift,
} from "lucide-react";
import { Coolshape } from "coolshapes-react";
import { resolveColor } from "../../lib/creqTemplates";
import { textStyleOf } from "./utils";
import { SHAPE_KINDS, renderShapeSvg, renderLineSvg } from "./shapes";
import { IMAGE_FRAMES } from "../../lib/creqDesignEngine";
import { renderBarChart, renderPieChart, renderDonutChart, renderLineChart, renderAreaChart, renderStackedBarChart, renderHBarChart, renderProgressBar, renderKpiCard, renderTimeline, IMAGE_EFFECTS } from "../../lib/creqCharts";

export const ICONS = {
  Zap, Award, Star, Rocket, Sparkles,
  ArrowRight, ArrowUpRight, Check, X, Heart, Flame, Trophy, Lightbulb, Target,
  TrendingUp, Quote, ThumbsUp, MessageCircle, Clock, Calendar, Mail, Globe,
  ShieldCheck, Users, Gift,
};

/** rotate + flip combine into one CSS transform. */
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

/** Badges auto-size to their text (width/height:auto), so their stored w/h are
 * stale — the selection chrome needs the real rendered box. offsetWidth/Height
 * are layout px BEFORE the canvas's scale() transform, i.e. already in canvas
 * space, exactly what the chrome positions in. Own component because the
 * ResizeObserver needs hooks and only this one type needs measuring. */
function BadgeEl({ el, style, bind, onMeasure }) {
  const ref = useRef(null);
  useEffect(() => {
    const node = ref.current;
    if (!node || !onMeasure) return undefined;
    const report = () => onMeasure(el.id, { w: node.offsetWidth, h: node.offsetHeight });
    report();
    const ro = new ResizeObserver(report);
    ro.observe(node);
    return () => ro.disconnect();
  }, [el.id, onMeasure]);
  return <div ref={ref} className="creq-el" style={style} onPointerDown={bind}>{el.text}</div>;
}

/** Render a single Create EQ element on the canvas. Selection visuals live in
 * SelectionChrome (an overlay sibling), NOT here — this component renders the
 * pure element, identically for the live canvas and the off-screen export
 * tree. The `.creq-el` class carries the CSS-only hover affordance. */
function ElementRender({ el, palette, onPointerDown, onMeasure, onDoubleClick, editing, isDropTarget, isRepositioning, onImageDrop, onContextMenu }) {
  const common = {
    position: "absolute",
    left: el.x, top: el.y, width: el.w, height: el.h,
    userSelect: "none",
    boxSizing: "border-box",
    opacity: el.opacity ?? 1,
    transform: elementTransform(el),
  };
  const bind = (e) => onPointerDown(e, el);
  const ctx = onContextMenu ? (e) => onContextMenu(e, el) : undefined;

  if (el.type === "text") {
    return (
      <div className="creq-el"
        style={{
          ...common,
          ...textStyleOf(el, palette),
          // While the inline editor overlays this element, keep it mounted (so
          // layout/undo state is untouched) but invisible — the editor renders
          // the live text in the exact same style on top.
          ...(editing ? { color: "transparent", textShadow: "none" } : null),
        }}
        onPointerDown={bind}
        onContextMenu={ctx}
        onDoubleClick={onDoubleClick ? (e) => { e.stopPropagation(); onDoubleClick(el); } : undefined}>
        {el.text}
      </div>
    );
  }
  if (el.type === "image") {
    const isLogo = el.role === "logo";
    const frameDef = el.frame ? IMAGE_FRAMES.find((f) => f.id === el.frame) : null;
    const clipPath = frameDef?.clip || undefined;
    const clipExtra = frameDef?.clipExtra || undefined;
    const bRadius = el.frame === "squircle" ? 999 : frameDef?.radius ?? el.radius ?? 0;
    const effectDef = el.effect ? IMAGE_EFFECTS.find((f) => f.id === el.effect) : null;
    const effectFilter = effectDef?.css?.filter || "";
    const imgOpacity = effectDef?.css?.opacity ?? 1;
    const f = el.filters || {};
    const customFilter = `brightness(${f.brightness ?? 100}%) contrast(${f.contrast ?? 100}%) saturate(${f.saturate ?? 100}%)${f.blur ? ` blur(${f.blur}px)` : ""}`;
    const imgFilter = [effectFilter, customFilter].filter(Boolean).join(" ");
    const frameGradient = "linear-gradient(135deg, #3B82F6, #8B5CF6)";

    const imgTransform = `translate(${el.imgOffsetX || 0}%, ${el.imgOffsetY || 0}%) scale(${el.imgScale || 1})`;

    // Drag-source props: framed images with content are draggable to other frames
    const dragSrcProps = el.src && el.frame ? {
      draggable: "true",
      onDragStart: (e) => { e.dataTransfer.setData("text/creq-image-id", el.id); e.dataTransfer.effectAllowed = "move"; },
    } : {};
    // Drop-target props: any framed image (empty or full) accepts drops from other framed images
    const dropTargetProps = el.frame ? {
      onDragOver: (e) => { if (e.dataTransfer?.types?.includes("text/creq-image-id")) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; } },
      onDrop: (e) => { e.preventDefault(); const srcId = e.dataTransfer.getData("text/creq-image-id"); if (srcId && onImageDrop) onImageDrop(srcId); },
    } : {};
    const frameEventProps = { ...dragSrcProps, ...dropTargetProps, onPointerDown: bind, onContextMenu: ctx };

    // ── Mockup: Polaroid ──
    if (frameDef?.mockup === "polaroid") {
      if (!el.src) {
        return (
          <div className="creq-el" {...frameEventProps} style={{ ...common, borderRadius: 4, background: "#fff", boxShadow: elementBoxShadow(el), display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.5 }}>
            <svg viewBox="0 0 24 24" style={{ width: 20, height: 20 }} fill="none" stroke="#999" strokeWidth="1.5"><rect x="2" y="4" width="20" height="16" rx="2" /><circle cx="9" cy="11" r="2" /><path d="M14 11l4 4v3H6l5-6 3 3z" /></svg>
          </div>
        );
      }
      const pad = Math.min(el.w, el.h) * 0.06;
      const bottomH = Math.min(el.w, el.h) * 0.22;
      return (
        <div className="creq-el" {...frameEventProps} style={{ ...common, borderRadius: 4, background: "#fff", boxShadow: elementBoxShadow(el), overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ flex: 1, margin: pad, overflow: "hidden", borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "center", background: "#00000008" }}>
            <img src={el.src} alt="" crossOrigin="anonymous" style={{ width: "100%", height: "100%", objectFit: el.fit || "cover", display: "block", pointerEvents: "none", filter: imgFilter, opacity: imgOpacity, transform: imgTransform, transformOrigin: "center" }} onError={(e) => { e.currentTarget.style.opacity = 0.2; }} />
          </div>
          <div style={{ height: bottomH, minHeight: 20 }} />
        </div>
      );
    }

    // ── Mockup: Browser window ──
    if (frameDef?.mockup === "browser") {
      if (!el.src) {
        return (
          <div className="creq-el" {...frameEventProps} style={{ ...common, borderRadius: 8, background: "#f0f0f0", boxShadow: elementBoxShadow(el), display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.5, overflow: "hidden" }}>
            <svg viewBox="0 0 24 24" style={{ width: 20, height: 20 }} fill="none" stroke="#999" strokeWidth="1.5"><rect x="2" y="4" width="20" height="16" rx="2" /><circle cx="9" cy="11" r="2" /><path d="M14 11l4 4v3H6l5-6 3 3z" /></svg>
          </div>
        );
      }
      const barH = Math.max(26, Math.min(el.h * 0.08, 36));
      const dotR = Math.max(3, barH * 0.2);
      return (
        <div className="creq-el" {...frameEventProps} style={{ ...common, borderRadius: 8, background: "#e8e8ea", boxShadow: elementBoxShadow(el), overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ background: "#f0f0f2", height: barH, display: "flex", alignItems: "center", padding: `0 ${barH * 0.3}px`, gap: barH * 0.25 }}>
            <div style={{ width: dotR * 2, height: dotR * 2, borderRadius: "50%", background: "#ff5f56" }} />
            <div style={{ width: dotR * 2, height: dotR * 2, borderRadius: "50%", background: "#ffbd2e" }} />
            <div style={{ width: dotR * 2, height: dotR * 2, borderRadius: "50%", background: "#27c93f" }} />
            <div style={{ flex: 1, background: "#fff", borderRadius: dotR, height: barH * 0.55, marginLeft: barH * 0.3, display: "flex", alignItems: "center", padding: `0 ${barH * 0.4}px`, fontSize: barH * 0.28, color: "#999", lineHeight: 1 }}>localhost</div>
          </div>
          <div style={{ flex: 1, overflow: "hidden", display: "flex" }}>
            <img src={el.src} alt="" crossOrigin="anonymous" style={{ width: "100%", height: "100%", objectFit: el.fit || "cover", display: "block", pointerEvents: "none", filter: imgFilter, opacity: imgOpacity, transform: imgTransform, transformOrigin: "center" }} onError={(e) => { e.currentTarget.style.opacity = 0.2; }} />
          </div>
        </div>
      );
    }

    // ── Mockup: Filmstrip ──
    if (frameDef?.mockup === "filmstrip") {
      if (!el.src) {
        return (
          <div className="creq-el" {...frameEventProps} style={{ ...common, background: "#222", borderRadius: 4, boxShadow: elementBoxShadow(el), display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.5 }}>
            <svg viewBox="0 0 24 24" style={{ width: 20, height: 20 }} fill="none" stroke="#999" strokeWidth="1.5"><rect x="2" y="4" width="20" height="16" rx="2" /><circle cx="9" cy="11" r="2" /><path d="M14 11l4 4v3H6l5-6 3 3z" /></svg>
          </div>
        );
      }
      const holeH = Math.max(8, Math.min(el.h * 0.04, 14));
      const holeR = Math.max(2, holeH * 0.35);
      const holeCount = Math.max(8, Math.floor(el.w / (holeR * 6)));
      const holes = Array.from({ length: holeCount }, (_, i) => i);
      return (
        <div className="creq-el" {...frameEventProps} style={{ ...common, background: "#1a1a1a", borderRadius: 4, boxShadow: elementBoxShadow(el), overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ height: holeH, display: "flex", alignItems: "center", justifyContent: "space-evenly", padding: `0 ${holeR * 2}px` }}>
            {holes.map((i) => <div key={i} style={{ width: holeR * 2, height: holeR * 2, borderRadius: "50%", background: "#333", flexShrink: 0 }} />)}
          </div>
          <div style={{ flex: 1, margin: "0 2px", overflow: "hidden", display: "flex" }}>
            <img src={el.src} alt="" crossOrigin="anonymous" style={{ width: "100%", height: "100%", objectFit: el.fit || "cover", display: "block", pointerEvents: "none", filter: imgFilter, opacity: imgOpacity, transform: imgTransform, transformOrigin: "center" }} onError={(e) => { e.currentTarget.style.opacity = 0.2; }} />
          </div>
          <div style={{ height: holeH, display: "flex", alignItems: "center", justifyContent: "space-evenly", padding: `0 ${holeR * 2}px` }}>
            {holes.map((i) => <div key={i} style={{ width: holeR * 2, height: holeR * 2, borderRadius: "50%", background: "#333", flexShrink: 0 }} />)}
          </div>
        </div>
      );
    }

    // ── Standard image rendering (non-mockup frames) ──
    return (
      <div className="creq-el" {...frameEventProps} style={{
        ...common, borderRadius: bRadius, overflow: "hidden",
        background: (!el.src && frameDef) ? frameGradient : (isLogo || clipPath ? "transparent" : "#00000010"),
        boxShadow: elementBoxShadow(el),
        clipPath: clipExtra || clipPath, WebkitClipPath: clipExtra || clipPath,
        ...(!el.src ? { display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", opacity: 0.5 } : {}),
      }}>
        {el.src ? (
          <>
            <img src={el.src} alt="" crossOrigin="anonymous"
              style={{
                width: "100%", height: "100%", objectFit: el.fit || "cover",
                display: "block", pointerEvents: "none", imageRendering: "auto",
                filter: imgFilter, opacity: imgOpacity,
                transform: imgTransform,
                transformOrigin: "center",
              }}
              onError={(e) => { e.currentTarget.style.opacity = 0.2; }} />
            {effectDef?.overlay === "vignette" && (
              <div style={{ position: "absolute", inset: 0, pointerEvents: "none",
                background: "radial-gradient(circle, transparent 50%, rgba(0,0,0,0.5) 100%)" }} />
            )}
            {effectDef?.overlay === "grain" && (
              <div style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: 0.06,
                backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")` }} />
            )}
          </>
        ) : (
          <div style={{ textAlign: "center", color: "#fff", fontSize: 10 }}>
            <svg viewBox="0 0 24 24" style={{ width: 20, height: 20, margin: "0 auto 2px", display: "block" }} fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <circle cx="9" cy="11" r="2" />
              <path d="M14 11l4 4v3H6l5-6 3 3z" />
            </svg>
            <div>Add image</div>
          </div>
        )}
        {isDropTarget && (
          <div style={{ position: "absolute", inset: 0, border: "3px solid #3B82F6", borderRadius: "inherit", pointerEvents: "none", zIndex: 10, background: "rgba(59,130,246,0.08)" }} />
        )}
        {isRepositioning && (
          <div style={{ position: "absolute", inset: -4, border: "2px solid #8B5CF6", borderRadius: 4, pointerEvents: "none", zIndex: 10, background: "transparent" }} />
        )}
      </div>
    );
  }
  if (el.type === "shape") {
    // Registry kinds (triangle, star, blobs, …) render as inline SVG so
    // stroke-only mode, gradients, and export share one path. rect/circle keep
    // their original div rendering — byte-identical for every saved deck.
    if (SHAPE_KINDS[el.shape]) {
      return (
        <div className="creq-el" onPointerDown={bind}
          style={{ ...common, filter: el.shadow ? `drop-shadow(${el.shadow_x || 0}px ${el.shadow_y ?? 4}px ${(el.shadow_blur ?? 12) / 2}px ${el.shadow_color || "rgba(0,0,0,0.35)"})` : undefined }}>
          {renderShapeSvg(el, palette)}
        </div>
      );
    }
    const filled = !el.stroke_only;
    const gradient = filled && el.fill_type === "gradient";
    const clipStyle = el.clip ? { clipPath: el.clip, WebkitClipPath: el.clip } : {};
    return (
      <div className="creq-el" onPointerDown={bind} style={{
        ...common, ...clipStyle,
        background: !filled ? "transparent"
          : gradient
            ? `linear-gradient(${el.gradient_angle ?? 145}deg, ${resolveColor(el.fill, palette)}, ${resolveColor(el.fill2 || "accent", palette)})`
            : resolveColor(el.fill, palette),
        border: el.stroke_only ? `${el.border_w || 3}px solid ${resolveColor(el.border_color || el.fill || "text", palette)}` : "none",
        boxShadow: elementBoxShadow(el),
        borderRadius: el.shape === "circle" ? 9999 : (el.radius ?? 0),
      }} />
    );
  }
  if (el.type === "line") {
    // Arrow/dot caps render as SVG; a plain line keeps the original div bar.
    const hasCaps = (el.cap_start && el.cap_start !== "none") || (el.cap_end && el.cap_end !== "none");
    if (hasCaps) {
      return (
        <div className="creq-el" onPointerDown={bind} style={{ ...common, background: "transparent" }}>
          {renderLineSvg(el, palette)}
        </div>
      );
    }
    return (
      <div className="creq-el" onPointerDown={bind} style={{
        ...common,
        background: resolveColor(el.color || "text", palette),
        borderRadius: (el.h || 4) / 2,
      }} />
    );
  }
  if (el.type === "badge") {
    return (
      <BadgeEl el={el} bind={bind} onMeasure={onMeasure} style={{
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
      }} />
    );
  }
  if (el.type === "coolshape") {
    const size = el.size || 200;
    return (
      <div className="creq-el" onPointerDown={bind} style={{
        ...common, width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center",
        color: resolveColor(el.color || "accent", palette),
        opacity: el.opacity ?? 0.3,
      }}>
        <Coolshape type={el.shape_category || "star"} index={el.shape_index || 0} size={size} noise={el.noise ?? true} />
      </div>
    );
  }
  if (el.type === "chart") {
    const w = el.w || 400, h = el.h || 300;
    let chart;
    if (el.chart_type === "bar") chart = renderBarChart(el, palette);
    else if (el.chart_type === "pie") chart = renderPieChart(el, palette);
    else if (el.chart_type === "donut") chart = renderDonutChart(el, palette);
    else if (el.chart_type === "line") chart = renderLineChart(el, palette);
    else if (el.chart_type === "area") chart = renderAreaChart(el, palette);
    else if (el.chart_type === "stacked-bar") chart = renderStackedBarChart(el, palette);
    else if (el.chart_type === "hbar") chart = renderHBarChart(el, palette);
    else chart = renderBarChart(el, palette);
    return (
      <div className="creq-el" onPointerDown={bind} style={{ ...common, width: w, height: h, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {chart}
      </div>
    );
  }

  if (el.type === "progress") {
    return (
      <div className="creq-el" onPointerDown={bind} style={{ ...common, display: "flex", alignItems: "center" }}>
        {renderProgressBar(el, palette)}
      </div>
    );
  }

  if (el.type === "kpi") {
    return (
      <div className="creq-el" onPointerDown={bind} style={{ ...common }}>
        {renderKpiCard(el, palette)}
      </div>
    );
  }

  if (el.type === "timeline") {
    return (
      <div className="creq-el" onPointerDown={bind} style={{ ...common }}>
        {renderTimeline(el, palette)}
      </div>
    );
  }

  if (el.type === "funnel") {
    const data = el.chart_data || [100, 65, 32, 12];
    const labels = el.chart_labels || [];
    const w = el.w || 360, h = el.h || 340;
    const accent = resolveColor(el.color || "accent", palette);
    const muted = resolveColor(el.muted_color || "muted", palette);
    const max = data[0] || 1;
    const stepH = h / (data.length + 1);
    return (
      <div className="creq-el" onPointerDown={bind} style={{ ...common, width: w, height: h, position: "relative" }}>
        {data.map((v, i) => {
          const pct = v / max;
          const fw = Math.max(20, w * (0.9 - 0.15 * i) * pct);
          const fy = i * stepH + 20;
          return (
            <div key={i} style={{
              position: "absolute", left: (w - fw) / 2, top: fy, width: fw, height: stepH - 12,
              background: accent, opacity: 0.5 + 0.4 * (1 - i / data.length), borderRadius: 6,
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "0 16px", fontSize: 13, color: "white", fontWeight: 600, fontFamily: '"Inter", sans-serif',
            }}>
              <span>{labels[i] || ""}</span>
              <span style={{ fontFamily: '"JetBrains Mono", monospace' }}>{v}</span>
            </div>
          );
        })}
      </div>
    );
  }

  if (el.type === "card") {
    const cardW = el.w || 320, cardH = el.h || 240;
    const title = el.title || "Card";
    const body = el.body || "";
    const style = el.card_style || "flat";
    const accent = resolveColor(el.color || "accent", palette);
    const muted = resolveColor(el.muted_color || "muted", palette);
    const textC = resolveColor("text", palette);
    const bgC = resolveColor("bg", palette);

    const baseCard = {
      width: cardW, height: cardH, fontFamily: '"Inter", sans-serif',
      display: "flex", flexDirection: "column", justifyContent: "center",
      padding: 24, boxSizing: "border-box", position: "relative",
    };

    if (style === "glass") {
      return (
        <div className="creq-el" onPointerDown={bind} style={{
          ...common, ...baseCard,
          background: `${bgC}88`, backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          border: `1px solid ${accent}22`,
          borderRadius: 20, boxShadow: `0 8px 32px rgba(0,0,0,0.08)`,
        }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: textC, marginBottom: 8 }}>{title}</div>
          <div style={{ fontSize: 14, color: muted, lineHeight: 1.5 }}>{body}</div>
        </div>
      );
    }

    if (style === "elevated") {
      return (
        <div className="creq-el" onPointerDown={bind} style={{
          ...common, ...baseCard,
          background: "white", borderRadius: 20,
          boxShadow: `0 12px 40px rgba(0,0,0,0.1), 0 4px 12px rgba(0,0,0,0.06)`,
        }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: textC, marginBottom: 8 }}>{title}</div>
          <div style={{ fontSize: 14, color: muted, lineHeight: 1.5 }}>{body}</div>
        </div>
      );
    }

    if (style === "outlined") {
      return (
        <div className="creq-el" onPointerDown={bind} style={{
          ...common, ...baseCard,
          background: "transparent", borderRadius: 20,
          border: `2px solid ${muted}44`,
        }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: textC, marginBottom: 8 }}>{title}</div>
          <div style={{ fontSize: 14, color: muted, lineHeight: 1.5 }}>{body}</div>
        </div>
      );
    }

    if (style === "dashboard") {
      const metric = el.metric || "—";
      const metricLabel = el.metric_label || "";
      return (
        <div className="creq-el" onPointerDown={bind} style={{
          ...common, ...baseCard,
          background: "white", borderRadius: 16,
          border: `1px solid ${muted}22`,
          boxShadow: `0 4px 16px rgba(0,0,0,0.05)`,
        }}>
          <div style={{ fontSize: 13, color: muted, marginBottom: 12 }}>{title}</div>
          <div style={{ fontSize: 42, fontWeight: 900, color: accent, fontFamily: '"Archivo Black", sans-serif', lineHeight: 1, marginBottom: 8 }}>{metric}</div>
          <div style={{ fontSize: 13, color: muted }}>{metricLabel}</div>
        </div>
      );
    }

    if (style === "bento") {
      const IconComp = ICONS[el.icon_name] || null;
      return (
        <div className="creq-el" onPointerDown={bind} style={{
          ...common, ...baseCard,
          background: "white", borderRadius: 16,
          border: `1px solid ${muted}22`, alignItems: "center", textAlign: "center",
        }}>
          {IconComp && <IconComp size={32} color={accent} style={{ marginBottom: 12 }} />}
          <div style={{ fontSize: 16, fontWeight: 700, color: textC, marginBottom: 4 }}>{title}</div>
          <div style={{ fontSize: 12, color: muted, lineHeight: 1.4 }}>{body}</div>
        </div>
      );
    }

    if (style === "split") {
      return (
        <div className="creq-el" onPointerDown={bind} style={{
          ...common, width: cardW, height: cardH, borderRadius: 20, overflow: "hidden",
          fontFamily: '"Inter", sans-serif', position: "relative",
        }}>
          <div style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg, ${textC} 0%, ${textC} 50%, ${accent} 50%, ${accent} 100%)` }} />
          <div style={{ position: "relative", zIndex: 1, padding: 24, display: "flex", flexDirection: "column", justifyContent: "center", height: "100%", boxSizing: "border-box" }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: "white", marginBottom: 8 }}>{title}</div>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", lineHeight: 1.5 }}>{body}</div>
          </div>
        </div>
      );
    }

    if (style === "timeline") {
      const badge = el.badge || "";
      return (
        <div className="creq-el" onPointerDown={bind} style={{
          ...common, ...baseCard,
          background: "white", borderRadius: 16,
          border: `1px solid ${muted}22`, paddingLeft: 56,
          boxShadow: `0 4px 16px rgba(0,0,0,0.05)`,
        }}>
          <div style={{ position: "absolute", left: 20, top: 24, width: 3, height: "60%", background: accent, borderRadius: 2, opacity: 0.4 }} />
          <div style={{ position: "absolute", left: 13, top: 28, width: 16, height: 16, borderRadius: "50%", background: accent, border: "3px solid white", boxShadow: `0 0 0 2px ${accent}` }} />
          {badge && <div style={{ fontSize: 11, color: muted, fontFamily: '"JetBrains Mono", monospace', marginBottom: 4, fontWeight: 600 }}>{badge}</div>}
          <div style={{ fontSize: 18, fontWeight: 700, color: textC, marginBottom: 4 }}>{title}</div>
          <div style={{ fontSize: 13, color: muted }}>{body}</div>
        </div>
      );
    }

    return (
      <div className="creq-el" onPointerDown={bind} style={{
        ...common, ...baseCard,
        background: "white", borderRadius: 16,
        boxShadow: `0 4px 16px rgba(0,0,0,0.05)`,
        border: `1px solid ${muted}22`,
      }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: textC, marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 14, color: muted, lineHeight: 1.5 }}>{body}</div>
      </div>
    );
  }

  if (el.type === "icon") {
    const IC = ICONS[el.name] || Zap;
    return (
      <div className="creq-el" onPointerDown={bind} style={{ ...common, width: el.w, height: el.w, color: resolveColor(el.color, palette) }}>
        <IC size={el.w} strokeWidth={el.stroke || 2} />
      </div>
    );
  }
  return null;
}

export default memo(ElementRender);
