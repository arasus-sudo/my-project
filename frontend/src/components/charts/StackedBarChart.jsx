import {
  BarChart as RBarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList,
} from "recharts";
import { CHART_SERIES, CHART_GRID, axisTickStyle, ChartTooltip, ChartLegend, ChartEmpty } from "./tokens";

/* Stacked bar chart — docs/design-system.md §12.1 + §12.3.
 * Series colors in fixed order, 2px white separators between segments, and
 * the total shown above the stack — a plain BarChart can't do either, which
 * is why this is a separate component rather than a `stacked` prop.
 */

export default function StackedBarChart({ data, series, height = 240, valueFormatter, className = "" }) {
  if (!data || data.length === 0) return <ChartEmpty height={height} />;
  const totals = data.map((d) => series.reduce((sum, s) => sum + (d[s.key] || 0), 0));
  return (
    <div className={className}>
      <ChartLegend
        className="justify-end mb-2"
        series={series.map((s, i) => ({ ...s, color: CHART_SERIES[i % CHART_SERIES.length] }))}
      />
      <div style={{ height }}>
        <ResponsiveContainer>
          <RBarChart data={data} margin={{ top: 16, right: 4, left: 0, bottom: 0 }} barCategoryGap="40%">
            <CartesianGrid stroke={CHART_GRID} vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axisTickStyle} />
            <YAxis tickLine={false} axisLine={false} tick={axisTickStyle} width={36} />
            <Tooltip content={<ChartTooltip formatter={valueFormatter} />} cursor={{ fill: "var(--bg-hover)" }} />
            {series.map((s, i) => (
              <Bar
                key={s.key} dataKey={s.key} name={s.label} stackId="stack"
                fill={CHART_SERIES[i % CHART_SERIES.length]} stroke="var(--bg-surface)" strokeWidth={2}
                maxBarSize={48}
              >
                {i === series.length - 1 && (
                  <LabelList
                    dataKey={s.key}
                    content={({ x, y, width, index }) => (
                      <text x={x + width / 2} y={y - 6} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--text-primary)">
                        {totals[index]}
                      </text>
                    )}
                  />
                )}
              </Bar>
            ))}
          </RBarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
