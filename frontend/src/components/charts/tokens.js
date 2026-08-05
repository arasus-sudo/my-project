/* Shared chart constants — docs/design-system.md §12.1.
 * Series order is FIXED: --chart-1 first, then 2…6. Never reorder per-chart;
 * a metric that is chart-2 on one screen must stay chart-2 everywhere so a
 * color always means the same series.
 */

export const CHART_SERIES = [
  "var(--chart-1)", "var(--chart-2)", "var(--chart-3)",
  "var(--chart-4)", "var(--chart-5)", "var(--chart-6)",
];

export const CHART_GRID = "var(--chart-grid)";
export const CHART_AXIS = "var(--chart-axis)";
export const CHART_REFERENCE = "var(--chart-reference)";

export const axisTickStyle = { fontSize: 11.5, fill: "var(--chart-axis)", fontFamily: "var(--font-ui)" };

/* §12.1: tooltip is card-style, --shadow-md, category then one row per
 * series (swatch + label + tabular value). Built as a recharts
 * `content={ChartTooltip}` render prop rather than relying on the default
 * tooltip, which does not match the card spec. */
export function ChartTooltip({ active, payload, label, formatter }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={{
      background: "var(--bg-surface-raised)", border: "1px solid var(--border-default)",
      borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-md)", padding: "10px 12px",
      fontFamily: "var(--font-ui)", minWidth: 140,
    }}>
      {label != null && (
        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginBottom: 6 }}>{label}</div>
      )}
      {payload.map((p, i) => (
        <div key={p.dataKey || i} className="flex items-center justify-between gap-4" style={{ marginTop: i ? 4 : 0 }}>
          <span className="flex items-center gap-1.5" style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color, display: "inline-block" }} />
            {p.name}
          </span>
          <span className="tnum" style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)" }}>
            {formatter ? formatter(p.value, p.dataKey) : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/* §12.1: legend sits top-right of the card header — 8px square swatches,
 * caption labels. Omit entirely for single-series charts (caller decides). */
export function ChartLegend({ series, className = "" }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {series.map((s) => (
        <span key={s.key} className="flex items-center gap-1.5" style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, display: "inline-block" }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

/* §12.1: every chart card carries a metric summary row beneath it so the
 * chart is never the only quantitative source on the card. */
export function ChartSummaryRow({ label, value, delta, className = "" }) {
  const positive = typeof delta === "number" && delta > 0;
  return (
    <div className={`flex items-baseline gap-2 ${className}`} style={{ marginTop: 8 }}>
      <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{label}</span>
      <span className="tnum" style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{value}</span>
      {typeof delta === "number" && (
        <span className="tnum" style={{ fontSize: 12, fontWeight: 500, color: positive ? "var(--color-success)" : "var(--color-danger)" }}>
          {positive ? "↑" : "↓"}{Math.abs(delta)}%
        </span>
      )}
    </div>
  );
}

export function ChartEmpty({ height = 240 }) {
  return (
    <div className="flex items-center justify-center" style={{ height, fontSize: 12.5, color: "var(--text-tertiary)" }}>
      No data for this period
    </div>
  );
}
