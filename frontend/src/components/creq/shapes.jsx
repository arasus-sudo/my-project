import { resolveColor } from "../../lib/creqTemplates";

/** Shape registry for Create EQ — every kind beyond the original rect/circle
 * renders as inline SVG with geometry computed from the element's REAL w/h
 * (not a stretched fixed viewBox), so outlines stay uniform when a shape is
 * resized non-uniformly. rect/circle keep their original div rendering in
 * ElementRender for byte-identical back-compat with saved decks.
 *
 * Inline SVG (vs clip-path) so stroke-only mode, gradient fills, and
 * html2canvas export all work from one code path. */

function ngonPath(n, w, h, startDeg = -90) {
  const cx = w / 2, cy = h / 2;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = ((startDeg + (360 / n) * i) * Math.PI) / 180;
    pts.push(`${cx + (w / 2) * Math.cos(a)} ${cy + (h / 2) * Math.sin(a)}`);
  }
  return `M ${pts.join(" L ")} Z`;
}

function starPath(points, w, h, innerRatio = 0.45) {
  const cx = w / 2, cy = h / 2;
  const pts = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? 1 : innerRatio;
    const a = ((-90 + (180 / points) * i) * Math.PI) / 180;
    pts.push(`${cx + (w / 2) * r * Math.cos(a)} ${cy + (h / 2) * r * Math.sin(a)}`);
  }
  return `M ${pts.join(" L ")} Z`;
}

/** Organic blobs — normalized 0..100 bezier paths scaled to w/h. */
function scaleBlob(d100, w, h) {
  return d100.replace(/(-?\d+\.?\d*)[ ,](-?\d+\.?\d*)/g, (m, x, y) =>
    `${((+x / 100) * w).toFixed(1)} ${((+y / 100) * h).toFixed(1)}`);
}
const BLOB_1 = "M 50,4 C 72,2 94,16 96,40 C 98,64 88,90 62,95 C 38,99 10,88 5,62 C 0,38 14,8 50,4 Z";
const BLOB_2 = "M 42,6 C 66,-4 96,12 97,38 C 98,60 84,70 82,86 C 80,99 52,101 34,94 C 12,86 2,64 6,42 C 10,22 24,13 42,6 Z";
const BLOB_3 = "M 55,2 C 78,6 90,26 95,48 C 100,72 84,94 58,97 C 34,100 8,90 4,64 C 0,40 8,14 28,6 C 38,2 46,1 55,2 Z";

/** Decorative strokes / paint — normalized as cubic bezier paths on 0..100 grid. */
function scribblePath(w, h) {
  const s = (v) => (v / 100) * Math.min(w, h);
  return `M ${s(10)} ${s(50)} Q ${s(30)} ${s(30)} ${s(50)} ${s(50)} T ${s(90)} ${s(50)}`;
}
function wavyPath(w, h) {
  const amp = h * 0.15;
  return `M 0 ${h / 2} Q ${w * 0.12} ${h / 2 - amp} ${w * 0.25} ${h / 2} T ${w * 0.5} ${h / 2} T ${w * 0.75} ${h / 2} T ${w} ${h / 2}`;
}
function zigzagPath(w, h) {
  const segs = 6;
  const step = w / segs;
  let d = `M 0 ${h / 2}`;
  for (let i = 1; i <= segs; i++) d += ` L ${i * step} ${i % 2 === 0 ? h / 2 : 0}`;
  return d;
}
function spiralPath(w, h) {
  const cx = w / 2, cy = h / 2;
  const maxR = Math.min(w, h) * 0.4;
  let d = `M ${cx} ${cy}`;
  for (let i = 1; i <= 8; i++) {
    const t = i * 0.785;
    const r = maxR * (i / 8);
    d += ` A ${r} ${r} 0 0 1 ${cx + Math.cos(t) * r} ${cy + Math.sin(t) * r}`;
  }
  return d;
}

/** Decorative organic / hand-drawn closed shapes (always fillable). */
const LEAF_PATH = "M 50 0 C 85 20 90 60 50 100 C 10 60 15 20 50 0 Z";
const TEARDROP_PATH = "M 50 2 C 92 38 92 72 50 100 C 8 72 8 38 50 2 Z";
const CROSS_PATH = "M 35 0 H 65 V 35 H 100 V 65 H 65 V 100 H 35 V 65 H 0 V 35 H 35 Z";
const PLUS_PATH = "M 36 0 H 64 V 36 H 100 V 64 H 64 V 100 H 36 V 64 H 0 V 36 H 36 Z";

export const SHAPE_KINDS = {
  triangle: { label: "Triangle", path: (w, h) => `M ${w / 2} 0 L ${w} ${h} L 0 ${h} Z` },
  "right-triangle": { label: "Right triangle", path: (w, h) => `M 0 0 L ${w} ${h} L 0 ${h} Z` },
  diamond: { label: "Diamond", path: (w, h) => `M ${w / 2} 0 L ${w} ${h / 2} L ${w / 2} ${h} L 0 ${h / 2} Z` },
  pentagon: { label: "Pentagon", path: (w, h) => ngonPath(5, w, h) },
  hexagon: { label: "Hexagon", path: (w, h) => ngonPath(6, w, h, 0) },
  "star-5": { label: "Star", path: (w, h) => starPath(5, w, h) },
  "arrow-right": {
    label: "Arrow",
    path: (w, h) => {
      const shaft = h * 0.5, head = Math.min(w * 0.42, h);
      const t = (h - shaft) / 2;
      return `M 0 ${t} L ${w - head} ${t} L ${w - head} 0 L ${w} ${h / 2} L ${w - head} ${h} L ${w - head} ${h - t} L 0 ${h - t} Z`;
    },
  },
  "speech-bubble": {
    label: "Speech bubble",
    path: (w, h) => {
      const r = Math.min(w, h) * 0.18, body = h * 0.78;
      const tailX = w * 0.22;
      return `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${body - r} Q ${w} ${body} ${w - r} ${body} H ${tailX + w * 0.16} L ${tailX} ${h} V ${body} H ${r} Q 0 ${body} 0 ${body - r} V ${r} Q 0 0 ${r} 0 Z`;
    },
  },
  "half-circle": { label: "Half circle", path: (w, h) => `M 0 ${h} A ${w / 2} ${h} 0 0 1 ${w} ${h} Z` },
  "quarter-circle": { label: "Quarter circle", path: (w, h) => `M 0 ${h} V 0 A ${w} ${h} 0 0 1 ${w} ${h} Z` },
  "blob-1": { label: "Blob 1", path: (w, h) => scaleBlob(BLOB_1, w, h) },
  "blob-2": { label: "Blob 2", path: (w, h) => scaleBlob(BLOB_2, w, h) },
  "blob-3": { label: "Blob 3", path: (w, h) => scaleBlob(BLOB_3, w, h) },
  ring: {
    label: "Ring",
    fillRule: "evenodd",
    path: (w, h) => {
      const rx = w / 2, ry = h / 2, t = Math.min(w, h) * 0.18;
      return `M ${w / 2} 0 A ${rx} ${ry} 0 1 0 ${w / 2} ${h} A ${rx} ${ry} 0 1 0 ${w / 2} 0 Z ` +
             `M ${w / 2} ${t} A ${rx - t} ${ry - t} 0 1 1 ${w / 2} ${h - t} A ${rx - t} ${ry - t} 0 1 1 ${w / 2} ${t} Z`;
    },
  },
  /* --- Decorative paint / strokes --- */
  scribble: { label: "Scribble", strokeOnly: true, path: (w, h) => scribblePath(w, h) },
  wavy: { label: "Wavy", strokeOnly: true, path: (w, h) => wavyPath(w, h) },
  zigzag: { label: "Zigzag", strokeOnly: true, path: (w, h) => zigzagPath(w, h) },
  spiral: { label: "Spiral", strokeOnly: true, path: (w, h) => spiralPath(w, h) },
  leaf: { label: "Leaf", path: (w, h) => scaleBlob(LEAF_PATH, w, h) },
  teardrop: { label: "Teardrop", path: (w, h) => scaleBlob(TEARDROP_PATH, w, h) },
  cross: { label: "Cross", path: (w, h) => scaleBlob(CROSS_PATH, w, h) },
  plus: { label: "Plus", path: (w, h) => scaleBlob(PLUS_PATH, w, h) },
  /* --- Paint brush strokes (stretched organic) --- */
  "paint-splash": { label: "Paint splash", path: (w, h) => {
    const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.45;
    const bumps = [
      { a: 0, r1: 0.8, r2: 0.7 }, { a: 30, r1: 0.9, r2: 1.0 }, { a: 60, r1: 0.7, r2: 0.8 },
      { a: 90, r1: 1.0, r2: 0.9 }, { a: 120, r1: 0.8, r2: 0.7 }, { a: 150, r1: 0.9, r2: 1.1 },
      { a: 180, r1: 0.7, r2: 0.8 }, { a: 210, r1: 1.0, r2: 0.9 }, { a: 240, r1: 0.8, r2: 0.7 },
      { a: 270, r1: 0.9, r2: 1.0 }, { a: 300, r1: 0.7, r2: 0.8 }, { a: 330, r1: 1.0, r2: 0.9 },
    ];
    let d = "";
    bumps.forEach((b, i) => {
      const a1 = ((b.a) * Math.PI) / 180;
      const a2 = ((b.a + 30) * Math.PI) / 180;
      const r1 = r * b.r1, r2 = r * b.r2;
      const cp1x = cx + Math.cos(a1 + 0.15) * r1 * 1.2;
      const cp1y = cy + Math.sin(a1 + 0.15) * r1 * 1.2;
      const cp2x = cx + Math.cos(a2 - 0.15) * r2 * 1.2;
      const cp2y = cy + Math.sin(a2 - 0.15) * r2 * 1.2;
      const ex = cx + Math.cos(a2) * r2;
      const ey = cy + Math.sin(a2) * r2;
      d += `${i === 0 ? `M ${cx + Math.cos(0) * r * 0.8} ${cy + Math.sin(0) * r * 0.8}` : ""} C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)} ${cp2x.toFixed(1)} ${cp2y.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`;
    });
    return d + " Z";
  }},
  highlight: {
    label: "Highlighter",
    path: (w, h) => `M 0 ${h * 0.55} Q ${w * 0.15} ${h * 0.3} ${w * 0.3} ${h * 0.5} Q ${w * 0.5} ${h * 0.45} ${w * 0.7} ${h * 0.55} Q ${w * 0.85} ${h * 0.5} ${w} ${h * 0.6} L ${w} ${h * 0.75} Q ${w * 0.85} ${h * 0.65} ${w * 0.7} ${h * 0.7} Q ${w * 0.5} ${h * 0.6} ${w * 0.3} ${h * 0.65} Q ${w * 0.15} ${h * 0.5} 0 ${h * 0.7} Z`,
  },
};

/** CSS/SVG gradient endpoints from a CSS-convention angle (0deg = up). */
function gradientVector(angleDeg) {
  const a = ((angleDeg ?? 145) - 90) * (Math.PI / 180);
  const x2 = 50 + Math.cos(a) * 50, y2 = 50 + Math.sin(a) * 50;
  return { x1: `${100 - x2}%`, y1: `${100 - y2}%`, x2: `${x2}%`, y2: `${y2}%` };
}

/** Full-size SVG for one shape element. Gradient defs ids are namespaced by
 * element id so several gradient shapes on one slide (or in the export host)
 * never collide. */
export function renderShapeSvg(el, palette) {
  const kind = SHAPE_KINDS[el.shape];
  if (!kind) return null;
  const w = el.w || 100, h = el.h || 100;
  const gradId = `creq-g-${el.id}`;
  const isGrad = el.fill_type === "gradient" && !el.stroke_only;
  const v = gradientVector(el.gradient_angle);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }} aria-hidden="true">
      {isGrad && (
        <defs>
          <linearGradient id={gradId} x1={v.x1} y1={v.y1} x2={v.x2} y2={v.y2}>
            <stop offset="0%" stopColor={resolveColor(el.fill, palette)} />
            <stop offset="100%" stopColor={resolveColor(el.fill2 || "accent", palette)} />
          </linearGradient>
        </defs>
      )}
      <path
        d={kind.path(w, h)}
        fillRule={kind.fillRule}
        fill={el.stroke_only || kind.strokeOnly ? "none" : (isGrad ? `url(#${gradId})` : resolveColor(el.fill, palette))}
        stroke={el.stroke_only || kind.strokeOnly ? resolveColor(el.border_color || el.fill || "text", palette) : "none"}
        strokeWidth={el.stroke_only || kind.strokeOnly ? (el.border_w || (kind.strokeOnly ? 4 : 3)) : 0}
        strokeLinecap={kind.strokeOnly ? "round" : undefined}
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Tiny ink preview for the LeftPanel element grid. */
export function ShapePreview({ kind, size = 22 }) {
  const k = SHAPE_KINDS[kind];
  if (kind === "rect") return <svg width={size} height={size} viewBox="0 0 22 22"><rect x="2" y="4" width="18" height="14" rx="2" fill="#3F3F46" /></svg>;
  if (kind === "circle") return <svg width={size} height={size} viewBox="0 0 22 22"><circle cx="11" cy="11" r="8.5" fill="#3F3F46" /></svg>;
  if (!k) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 22 22">
      <path d={k.path(22, 22)} fillRule={k.fillRule} fill="#3F3F46" />
    </svg>
  );
}

/** SVG rendering for a line element with arrow/dot caps. Legacy lines (no
 * caps) keep ElementRender's original div bar untouched. The SVG is taller
 * than the element box (caps overhang the stroke), absolutely centered. */
export function renderLineSvg(el, palette) {
  const w = el.w || 100, t = el.h || 4;
  const color = resolveColor(el.color || "text", palette);
  const cap = Math.max(t * 3, 14);
  const svgH = cap * 2;
  const y = svgH / 2;
  const startInset = el.cap_start === "arrow" ? cap * 0.9 : el.cap_start === "dot" ? cap / 2 : 0;
  const endInset = el.cap_end === "arrow" ? cap * 0.9 : el.cap_end === "dot" ? cap / 2 : 0;
  return (
    <svg width={w} height={svgH} viewBox={`0 0 ${w} ${svgH}`} aria-hidden="true"
      style={{ position: "absolute", left: 0, top: (t - svgH) / 2, display: "block" }}>
      <line x1={startInset} y1={y} x2={w - endInset} y2={y} stroke={color} strokeWidth={t} strokeLinecap="round" />
      {el.cap_start === "arrow" && <path d={`M ${cap} ${y - cap / 2} L 0 ${y} L ${cap} ${y + cap / 2} Z`} fill={color} />}
      {el.cap_end === "arrow" && <path d={`M ${w - cap} ${y - cap / 2} L ${w} ${y} L ${w - cap} ${y + cap / 2} Z`} fill={color} />}
      {el.cap_start === "dot" && <circle cx={cap / 2} cy={y} r={cap / 2} fill={color} />}
      {el.cap_end === "dot" && <circle cx={w - cap / 2} cy={y} r={cap / 2} fill={color} />}
    </svg>
  );
}
