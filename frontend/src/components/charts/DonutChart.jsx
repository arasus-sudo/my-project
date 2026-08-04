import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { CHART_SERIES, ChartTooltip, ChartEmpty } from "./tokens";

/* Donut chart — docs/design-system.md §12.1 + §12.4.
 * 8-12px ring, 2px segment gaps, center holds the total, legend as rows of
 * swatch + label + right-aligned tabular percentage. Max 6 segments; the
 * remainder is folded into "Other" in --neutral-300 by the caller (the
 * component enforces the cap, callers own the aggregation logic).
 */

const OTHER_COLOR = "#B4B4B9";

export default function DonutChart({ data, size = 168, thickness = 10, centerLabel, height, valueFormatter, className = "" }) {
  if (!data || data.length === 0) return <ChartEmpty height={height || size} />;

  const capped = data.length > 6
    ? [...data.slice(0, 5), { label: "Other", value: data.slice(5).reduce((s, d) => s + d.value, 0) }]
    : data;
  const total = capped.reduce((s, d) => s + d.value, 0);

  return (
    <div className={`flex items-center gap-6 ${className}`}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={capped} dataKey="value" nameKey="label" cx="50%" cy="50%"
              innerRadius={size / 2 - thickness - 4} outerRadius={size / 2 - 4}
              paddingAngle={2} stroke="none"
            >
              {capped.map((d, i) => (
                <Cell key={d.label} fill={d.label === "Other" ? OTHER_COLOR : CHART_SERIES[i % CHART_SERIES.length]} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip formatter={valueFormatter} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="tnum" style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
            {total}
          </span>
          {centerLabel && <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{centerLabel}</span>}
        </div>
      </div>
      <div className="flex-1 min-w-0 space-y-1.5">
        {capped.map((d, i) => (
          <div key={d.label} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 min-w-0" style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
              <span style={{
                width: 8, height: 8, borderRadius: 2, flexShrink: 0,
                background: d.label === "Other" ? OTHER_COLOR : CHART_SERIES[i % CHART_SERIES.length],
              }} />
              <span className="truncate">{d.label}</span>
            </span>
            <span className="tnum shrink-0" style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)" }}>
              {total ? Math.round((d.value / total) * 100) : 0}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
