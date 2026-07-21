// SVG chart generators and card presets for Create EQ slides
import { resolveColor } from "./creqTemplates";

// ── SVG chart renderers ───────────────────────────────────────────────

export function renderBarChart(el, palette) {
  const w = el.w || 400, h = el.h || 300;
  const data = el.chart_data || [30, 55, 42, 78, 63, 90, 45];
  const labels = el.chart_labels || data.map((_, i) => `Q${i + 1}`);
  const accent = resolveColor(el.color || "accent", palette);
  const muted = resolveColor(el.muted_color || "muted", palette);
  const pad = { t: 20, r: 20, b: 40, l: 40 };
  const cw = w - pad.l - pad.r;
  const ch = h - pad.t - pad.b;
  const max = Math.max(...data, 1);
  const barW = Math.max(8, (cw / data.length) * 0.7);
  const gap = (cw / data.length) * 0.3;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }} aria-label="Bar chart">
      {data.map((v, i) => {
        const bh = (v / max) * ch;
        const x = pad.l + i * (barW + gap) + gap / 2;
        const y = pad.t + ch - bh;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={bh} rx={Math.min(4, barW / 4)}
              fill={accent} opacity={0.7 + 0.3 * (v / max)} />
            <text x={x + barW / 2} y={pad.t + ch + 16} textAnchor="middle"
              fill={muted} fontSize={10} fontFamily="JetBrains Mono">
              {labels[i]}
            </text>
            <text x={x + barW / 2} y={y - 6} textAnchor="middle"
              fill={accent} fontSize={11} fontFamily="JetBrains Mono" fontWeight={600}>
              {v}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function renderPieChart(el, palette) {
  const size = el.w || 300;
  const data = el.chart_data || [35, 25, 20, 12, 8];
  const labels = el.chart_labels || ["Product", "Marketing", "Sales", "Support", "Other"];
  const colors = palette
    ? [resolveColor("accent", palette), resolveColor("text", palette),
       resolveColor("muted", palette), resolveColor("bg2", palette || {}),
       "#8B5CF6", "#3B82F6", "#10B981", "#F59E0B"]
    : ["#E85D3A", "#9CA3AF", "#525252", "#1F2937", "#8B5CF6"];
  const cx = size / 2, cy = size / 2, r = Math.min(cx, cy) - 24;
  const total = data.reduce((s, v) => s + v, 0) || 1;
  let startAngle = -90;

  function polarToCartesian(angle, radius) {
    const a = (angle * Math.PI) / 180;
    return { x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) };
  }

  function describeArc(start, end) {
    const s = polarToCartesian(start, r);
    const e = polarToCartesian(end, r);
    const large = end - start > 180 ? 1 : 0;
    return `M ${cx} ${cy} L ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y} Z`;
  }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block" }} aria-label="Pie chart">
      {data.map((v, i) => {
        const pct = v / total;
        const angle = pct * 360;
        if (angle < 0.5) return null;
        const endAngle = startAngle + angle;
        const path = describeArc(startAngle, endAngle);
        const mid = (startAngle + endAngle) / 2;
        const lp = polarToCartesian(mid, r * 0.6);
        startAngle = endAngle;
        return (
          <g key={i}>
            <path d={path} fill={colors[i % colors.length]} opacity={0.85} stroke="white" strokeWidth={1} />
            {pct > 0.06 && (
              <text x={lp.x} y={lp.y} textAnchor="middle" dominantBaseline="central"
                fill="white" fontSize={11} fontFamily="Inter" fontWeight={700}>
                {Math.round(pct * 100)}%
              </text>
            )}
          </g>
        );
      })}
      <text x={cx} y={cy + r + 24} textAnchor="middle" fill={resolveColor("muted", palette)}
        fontSize={11} fontFamily="Inter">
        {el.chart_title || ""}
      </text>
    </svg>
  );
}

export function renderDonutChart(el, palette) {
  const size = el.w || 300;
  const data = el.chart_data || [35, 25, 20, 12, 8];
  const labels = el.chart_labels || [];
  const colors = palette
    ? [resolveColor("accent", palette), resolveColor("text", palette),
       resolveColor("muted", palette), resolveColor("bg2", palette || {}),
       "#8B5CF6", "#3B82F6", "#10B981", "#F59E0B"]
    : ["#E85D3A", "#9CA3AF", "#525252", "#1F2937", "#8B5CF6"];
  const cx = size / 2, cy = size / 2, outerR = Math.min(cx, cy) - 16, innerR = outerR * 0.55;
  const total = data.reduce((s, v) => s + v, 0) || 1;
  let startAngle = -90;

  function polarToCartesian(angle, radius) {
    const a = (angle * Math.PI) / 180;
    return { x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) };
  }

  function describeArc(start, end) {
    const s1 = polarToCartesian(start, outerR), e1 = polarToCartesian(end, outerR);
    const s2 = polarToCartesian(end, innerR), e2 = polarToCartesian(start, innerR);
    const large = end - start > 180 ? 1 : 0;
    return `M ${s1.x} ${s1.y} A ${outerR} ${outerR} 0 ${large} 1 ${e1.x} ${e1.y} L ${s2.x} ${s2.y} A ${innerR} ${innerR} 0 ${large} 0 ${e2.x} ${e2.y} Z`;
  }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block" }} aria-label="Donut chart">
      {data.map((v, i) => {
        const pct = v / total;
        const angle = pct * 360;
        if (angle < 0.5) return null;
        const endAngle = startAngle + angle;
        startAngle = endAngle;
        return (
          <path key={i} d={describeArc(startAngle - angle, startAngle)}
            fill={colors[i % colors.length]} opacity={0.85} stroke="white" strokeWidth={1} />
        );
      })}
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
        fill={resolveColor("accent", palette)} fontSize={24} fontFamily="Archivo Black" fontWeight={900}>
        {total}
      </text>
      <text x={cx} y={cy + 20} textAnchor="middle" fill={resolveColor("muted", palette)}
        fontSize={10} fontFamily="Inter">Total</text>
    </svg>
  );
}

export function renderLineChart(el, palette) {
  const w = el.w || 500, h = el.h || 250;
  const data = el.chart_data || [10, 25, 18, 42, 35, 60, 55, 78, 65, 90];
  const labels = el.chart_labels || [];
  const accent = resolveColor(el.color || "accent", palette);
  const muted = resolveColor(el.muted_color || "muted", palette);
  const pad = { t: 20, r: 20, b: 30, l: 40 };
  const cw = w - pad.l - pad.r, ch = h - pad.t - pad.b;
  const max = Math.max(...data, 1);
  const step = cw / (data.length - 1);

  const points = data.map((v, i) => ({
    x: pad.l + i * step, y: pad.t + ch - (v / max) * ch, v,
  }));

  const lineD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaD = `${lineD} L ${points[points.length - 1].x} ${pad.t + ch} L ${points[0].x} ${pad.t + ch} Z`;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }} aria-label="Line chart">
      <defs>
        <linearGradient id={`linegrad-${el.id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.25" />
          <stop offset="100%" stopColor={accent} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#linegrad-${el.id})`} />
      <path d={lineD} fill="none" stroke={accent} strokeWidth={3} strokeLinejoin="round" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={4} fill="white" stroke={accent} strokeWidth={2} />
          <text x={p.x} y={p.y - 10} textAnchor="middle" fill={muted} fontSize={9} fontFamily="JetBrains Mono">
            {p.v}
          </text>
        </g>
      ))}
      {labels.length === data.length && points.map((p, i) => (
        <text key={`l${i}`} x={p.x} y={pad.t + ch + 16} textAnchor="middle"
          fill={muted} fontSize={9} fontFamily="JetBrains Mono">
          {labels[i]}
        </text>
      ))}
    </svg>
  );
}

export function renderAreaChart(el, palette) {
  const w = el.w || 500, h = el.h || 250;
  const data = el.chart_data || [10, 25, 18, 42, 35, 60, 55, 78, 65, 90];
  const labels = el.chart_labels || [];
  const accent = resolveColor(el.color || "accent", palette);
  const muted = resolveColor(el.muted_color || "muted", palette);
  const pad = { t: 20, r: 20, b: 30, l: 40 };
  const cw = w - pad.l - pad.r, ch = h - pad.t - pad.b;
  const max = Math.max(...data, 1);
  const step = cw / (data.length - 1);
  const points = data.map((v, i) => ({ x: pad.l + i * step, y: pad.t + ch - (v / max) * ch, v }));
  const lineD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaD = `${lineD} L ${points[points.length - 1].x} ${pad.t + ch} L ${points[0].x} ${pad.t + ch} Z`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }} aria-label="Area chart">
      <defs>
        <linearGradient id={`areagrad-${el.id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.35" />
          <stop offset="100%" stopColor={accent} stopOpacity="0.04" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#areagrad-${el.id})`} />
      <path d={lineD} fill="none" stroke={accent} strokeWidth={3} strokeLinejoin="round" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={3} fill={accent} />
          <text x={p.x} y={p.y - 10} textAnchor="middle" fill={muted} fontSize={9} fontFamily="JetBrains Mono">{p.v}</text>
        </g>
      ))}
      {labels.length === data.length && points.map((p, i) => (
        <text key={`l${i}`} x={p.x} y={pad.t + ch + 16} textAnchor="middle" fill={muted} fontSize={9} fontFamily="JetBrains Mono">{labels[i]}</text>
      ))}
    </svg>
  );
}

export function renderStackedBarChart(el, palette) {
  const w = el.w || 500, h = el.h || 300;
  const series = el.chart_series || [
    { label: "Q1", values: [30, 20, 10] },
    { label: "Q2", values: [40, 25, 15] },
    { label: "Q3", values: [35, 30, 20] },
    { label: "Q4", values: [50, 35, 25] },
  ];
  const segLabels = el.chart_labels || ["Product", "Service", "Other"];
  const colors = [resolveColor("accent", palette), resolveColor("text", palette), resolveColor("muted", palette), "#8B5CF6", "#3B82F6"];
  const pad = { t: 20, r: 20, b: 40, l: 40 };
  const cw = w - pad.l - pad.r, ch = h - pad.t - pad.b;
  const max = Math.max(...series.map((s) => s.values.reduce((a, b) => a + b, 0)), 1);
  const barW = Math.max(8, (cw / series.length) * 0.6);
  const gap = (cw / series.length) * 0.4;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }} aria-label="Stacked bar chart">
      {series.map((s, i) => {
        let yOff = 0;
        const x = pad.l + i * (barW + gap) + gap / 2;
        return s.values.map((v, j) => {
          const bh = (v / max) * ch;
          const y = pad.t + ch - yOff - bh;
          const seg = (
            <g key={`${i}-${j}`}>
              <rect x={x} y={y} width={barW} height={bh} rx={2} fill={colors[j % colors.length]} opacity={0.8} />
            </g>
          );
          yOff += bh;
          return seg;
        });
      })}
      {(series.length > 0) && series.map((s, i) => (
        <text key={`l${i}`} x={pad.l + i * (barW + gap) + gap / 2 + barW / 2} y={pad.t + ch + 16}
          textAnchor="middle" fill={resolveColor("muted", palette)} fontSize={9} fontFamily="JetBrains Mono">
          {s.label}
        </text>
      ))}
      {segLabels.length > 0 && (
        <g>
          {segLabels.map((l, i) => (
            <g key={`sl${i}`} transform={`translate(${pad.l}, ${pad.t + 8 + i * 16})`}>
              <rect x={0} y={0} width={10} height={10} rx={2} fill={colors[i % colors.length]} opacity={0.8} />
              <text x={16} y={9} fill={resolveColor("muted", palette)} fontSize={9} fontFamily="Inter">{l}</text>
            </g>
          ))}
        </g>
      )}
    </svg>
  );
}

export function renderHBarChart(el, palette) {
  const w = el.w || 500, h = el.h || 300;
  const data = el.chart_data || [30, 55, 42, 78, 63];
  const labels = el.chart_labels || ["A", "B", "C", "D", "E"];
  const accent = resolveColor(el.color || "accent", palette);
  const muted = resolveColor(el.muted_color || "muted", palette);
  const pad = { t: 20, r: 50, b: 20, l: 60 };
  const cw = w - pad.l - pad.r, ch = h - pad.t - pad.b;
  const max = Math.max(...data, 1);
  const barH = Math.max(8, (ch / data.length) * 0.6);
  const gap = (ch / data.length) * 0.4;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }} aria-label="Horizontal bar chart">
      {data.map((v, i) => {
        const bw = (v / max) * cw;
        const y = pad.t + i * (barH + gap) + gap / 2;
        return (
          <g key={i}>
            <text x={pad.l - 6} y={y + barH / 2 + 3} textAnchor="end" fill={muted} fontSize={9} fontFamily="JetBrains Mono">{labels[i]}</text>
            <rect x={pad.l} y={y} width={bw} height={barH} rx={Math.min(4, barH / 3)} fill={accent} opacity={0.7 + 0.3 * (v / max)} />
            <text x={pad.l + bw + 4} y={y + barH / 2 + 3} fill={accent} fontSize={9} fontFamily="JetBrains Mono" fontWeight={600}>{v}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function renderProgressBar(el, palette) {
  const w = el.w || 400, h = el.h || 36;
  const pct = Math.min(100, Math.max(0, el.progress ?? 65));
  const accent = resolveColor(el.color || "accent", palette);
  const muted = resolveColor(el.muted_color || "muted", palette);
  const label = el.label || "";

  return (
    <div style={{ width: w, fontFamily: '"Inter", sans-serif' }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: muted }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: accent, fontFamily: '"JetBrains Mono", monospace' }}>
          {Math.round(pct)}%
        </span>
      </div>
      <div style={{ width: "100%", height: h, background: muted + "22", borderRadius: h / 2, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: accent, borderRadius: h / 2,
          transition: "width 0.3s ease" }} />
      </div>
    </div>
  );
}

export function renderKpiCard(el, palette) {
  const w = el.w || 260, h = el.h || 160;
  const value = el.kpi_value ?? "86%";
  const label = el.kpi_label || "Conversion Rate";
  const change = el.kpi_change ?? "+12%";
  const positive = !el.kpi_negative;
  const accent = resolveColor(el.color || "accent", palette);
  const muted = resolveColor(el.muted_color || "muted", palette);
  const textC = resolveColor("text", palette);

  return (
    <div style={{ width, height, background: "white", borderRadius: 16, border: `1px solid ${muted}22`,
      padding: 20, display: "flex", flexDirection: "column", justifyContent: "center",
      boxShadow: `0 4px 20px rgba(0,0,0,0.06)`, fontFamily: '"Inter", sans-serif' }}>
      <div style={{ fontSize: 13, color: muted, marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 48, fontWeight: 900, color: accent, fontFamily: '"Archivo Black", sans-serif',
        lineHeight: 1, marginBottom: 8 }}>
        {value}
      </div>
      <div style={{ fontSize: 13, color: positive ? "#10B981" : "#EF4444", fontWeight: 600 }}>
        {change} {positive ? "↑" : "↓"}
      </div>
    </div>
  );
}

export function renderTimeline(el, palette) {
  const w = el.w || 500, h = el.h || 400;
  const items = el.timeline_items || [
    { date: "Q1 2026", title: "Research", desc: "Market analysis" },
    { date: "Q2 2026", title: "Build", desc: "MVP development" },
    { date: "Q3 2026", title: "Launch", desc: "Public release" },
    { date: "Q4 2026", title: "Scale", desc: "Growth phase" },
  ];
  const accent = resolveColor(el.color || "accent", palette);
  const muted = resolveColor(el.muted_color || "muted", palette);

  return (
    <div style={{ width: w, height: h, position: "relative", fontFamily: '"Inter", sans-serif',
      paddingLeft: 80, paddingTop: 16 }}>
      <div style={{ position: "absolute", left: 32, top: 16, bottom: 16, width: 3,
        background: accent, borderRadius: 2, opacity: 0.4 }} />
      {items.map((item, i) => {
        const y = 16 + i * (h / items.length);
        return (
          <div key={i} style={{ position: "absolute", left: 80, top: y, width: w - 100 }}>
            <div style={{ position: "absolute", left: -56, top: 4, width: 16, height: 16,
              borderRadius: "50%", background: accent, border: "3px solid white",
              boxShadow: `0 0 0 2px ${accent}` }} />
            <div style={{ fontSize: 11, color: muted, fontFamily: '"JetBrains Mono", monospace',
              marginBottom: 2, fontWeight: 600 }}>{item.date}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: resolveColor("text", palette),
              marginBottom: 2 }}>{item.title}</div>
            <div style={{ fontSize: 13, color: muted }}>{item.desc}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── Chart presets for LeftPanel ────────────────────────────────────────

export const CHART_PRESETS = [
  { name: "Bar chart", type: "chart", chart_type: "bar", w: 500, h: 320,
    chart_data: [30, 55, 42, 78, 63, 90, 45], chart_labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] },
  { name: "Pie chart", type: "chart", chart_type: "pie", w: 320, h: 320,
    chart_data: [35, 25, 20, 12, 8], chart_labels: ["Sales", "Marketing", "Product", "Support", "Other"] },
  { name: "Donut", type: "chart", chart_type: "donut", w: 320, h: 320,
    chart_data: [40, 30, 20, 10], chart_labels: ["A", "B", "C", "D"] },
  { name: "Line chart", type: "chart", chart_type: "line", w: 520, h: 280,
    chart_data: [10, 25, 18, 42, 35, 60, 55, 78], chart_labels: [] },
  { name: "Area chart", type: "chart", chart_type: "area", w: 520, h: 280,
    chart_data: [10, 25, 18, 42, 35, 60, 55, 78, 65, 90], chart_labels: [] },
  { name: "Stacked bar", type: "chart", chart_type: "stacked-bar", w: 500, h: 300,
    chart_series: [{ label: "Q1", values: [30,20,10] },{ label: "Q2", values: [40,25,15] },{ label: "Q3", values: [35,30,20] },{ label: "Q4", values: [50,35,25] }],
    chart_labels: ["Product","Service","Other"] },
  { name: "H-Bar chart", type: "chart", chart_type: "hbar", w: 500, h: 280,
    chart_data: [30, 55, 42, 78, 63, 90], chart_labels: ["Mon","Tue","Wed","Thu","Fri","Sat"] },
  { name: "Progress", type: "progress", w: 420, h: 60, progress: 75, label: "Task completion" },
  { name: "KPI card", type: "kpi", w: 280, h: 180, kpi_value: "86%", kpi_label: "Conversion Rate", kpi_change: "+12%" },
  { name: "Timeline", type: "timeline", w: 520, h: 380,
    timeline_items: [
      { date: "Week 1", title: "Discover", desc: "Customer interviews" },
      { date: "Week 2", title: "Define", desc: "Problem validation" },
      { date: "Week 3", title: "Develop", desc: "Solution prototype" },
      { date: "Week 4", title: "Deliver", desc: "Launch & iterate" },
    ] },
  { name: "Funnel", type: "funnel", w: 360, h: 340, chart_data: [100, 65, 32, 12],
    chart_labels: ["Leads", "Qualified", "Demo", "Closed"] },
];

// ── Card presets ──────────────────────────────────────────────────────

export const CARD_PRESETS = [
  {
    name: "Glass card",
    type: "card",
    card_style: "glass",
    w: 320, h: 240,
    title: "Glass Morphism",
    body: "Frosted glass effect with subtle backdrop blur and soft border.",
  },
  {
    name: "Elevated card",
    type: "card",
    card_style: "elevated",
    w: 320, h: 240,
    title: "Elevated Card",
    body: "Floating with a soft shadow, perfect for highlighting key content.",
  },
  {
    name: "Outlined card",
    type: "card",
    card_style: "outlined",
    w: 320, h: 240,
    title: "Outlined Card",
    body: "Clean border-only style with minimal visual weight.",
  },
  {
    name: "Flat card",
    type: "card",
    card_style: "flat",
    w: 320, h: 240,
    title: "Flat Card",
    body: "Simple background fill, no elevation. Clean and direct.",
  },
  {
    name: "Bento card",
    type: "card",
    card_style: "bento",
    w: 240, h: 240,
    title: "Bento",
    body: "Compact grid-friendly card with subtle border.",
    icon_name: "Zap",
  },
  {
    name: "Dashboard card",
    type: "card",
    card_style: "dashboard",
    w: 340, h: 200,
    title: "Dashboard Metric",
    body: "Key metric with label and trend indicator.",
    metric: "99.7%",
    metric_label: "Uptime",
  },
  {
    name: "Split card",
    type: "card",
    card_style: "split",
    w: 480, h: 240,
    title: "Split Card",
    body: "Two-tone background split diagonally or horizontally.",
  },
  {
    name: "Timeline card",
    type: "card",
    card_style: "timeline",
    w: 320, h: 160,
    title: "Milestone",
    body: "Phase 1 complete",
    badge: "2026 Q2",
  },
];

// ── Image effects ────────────────────────────────────────────────────

export const IMAGE_EFFECTS = [
  { id: "none", label: "None", css: {} },
  { id: "grayscale", label: "B&W", css: { filter: "grayscale(100%)" } },
  { id: "sepia", label: "Sepia", css: { filter: "sepia(60%)" } },
  { id: "duotone-dark", label: "Duotone dark", css: { filter: "contrast(120%) brightness(70%) saturate(50%)" } },
  { id: "duotone-warm", label: "Duotone warm", css: { filter: "sepia(40%) contrast(110%) saturate(80%)" } },
  { id: "fade", label: "Fade", css: { opacity: 0.6 } },
  { id: "grain", label: "Grain", css: { filter: "contrast(110%) brightness(90%)" }, overlay: "grain" },
  { id: "blur-light", label: "Soft blur", css: { filter: "blur(2px)" } },
  { id: "blur-heavy", label: "Heavy blur", css: { filter: "blur(8px)" } },
  { id: "vignette", label: "Vignette", css: {}, overlay: "vignette" },
];
