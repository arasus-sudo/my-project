import {
  LineChart as RLineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { CHART_SERIES, CHART_GRID, axisTickStyle, ChartTooltip, ChartLegend, ChartEmpty } from "./tokens";

/* Line chart — docs/design-system.md §12.1 + §12.2.
 * Multi-series lines carry no area fill (that's AreaChart's job, single
 * series only per spec). 2px stroke, round joins, no point markers except
 * the hovered point (recharts' `activeDot` covers that).
 */

export default function LineChart({
  data,
  series,           // [{ key, label }]
  height = 240,
  reference,         // { value, label }
  valueFormatter,
  className = "",
}) {
  if (!data || data.length === 0) return <ChartEmpty height={height} />;
  return (
    <div className={className}>
      {series.length > 1 && (
        <ChartLegend
          className="justify-end mb-2"
          series={series.map((s, i) => ({ ...s, color: CHART_SERIES[i % CHART_SERIES.length] }))}
        />
      )}
      <div style={{ height }}>
        <ResponsiveContainer>
          <RLineChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={CHART_GRID} vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axisTickStyle} />
            <YAxis tickLine={false} axisLine={false} tick={axisTickStyle} width={36} />
            <Tooltip content={<ChartTooltip formatter={valueFormatter} />} />
            {reference && (
              <ReferenceLine
                y={reference.value} stroke="var(--chart-reference)" strokeDasharray="4 4"
                label={{ value: reference.label, position: "insideTopLeft", fill: "var(--text-tertiary)", fontSize: 11 }}
              />
            )}
            {series.map((s, i) => (
              <Line
                key={s.key} type="monotone" dataKey={s.key} name={s.label}
                stroke={CHART_SERIES[i % CHART_SERIES.length]} strokeWidth={2}
                dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#FFFFFF" }}
              />
            ))}
          </RLineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
