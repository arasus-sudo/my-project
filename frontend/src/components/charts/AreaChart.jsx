import {
  AreaChart as RAreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { CHART_GRID, axisTickStyle, ChartTooltip, ChartEmpty } from "./tokens";

/* Area chart — docs/design-system.md §12.1 + §12.2.
 * Single series only, per spec — a filled area under two overlapping series
 * is unreadable, which is exactly why multi-series uses LineChart instead.
 */

export default function AreaChart({ data, dataKey, label, height = 240, valueFormatter, className = "" }) {
  if (!data || data.length === 0) return <ChartEmpty height={height} />;
  return (
    <div className={className} style={{ height }}>
      <ResponsiveContainer>
        <RAreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="ds-area-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-area-from)" />
              <stop offset="100%" stopColor="var(--chart-area-to)" />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={CHART_GRID} vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axisTickStyle} />
          <YAxis tickLine={false} axisLine={false} tick={axisTickStyle} width={36} />
          <Tooltip content={<ChartTooltip formatter={valueFormatter} />} />
          <Area
            type="monotone" dataKey={dataKey} name={label}
            stroke="var(--chart-1)" strokeWidth={2} fill="url(#ds-area-fill)"
            dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#FFFFFF" }}
          />
        </RAreaChart>
      </ResponsiveContainer>
    </div>
  );
}
