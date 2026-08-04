import {
  BarChart as RBarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { CHART_GRID, axisTickStyle, ChartTooltip, ChartEmpty } from "./tokens";

/* Bar / column chart — docs/design-system.md §12.1 + §12.3.
 * Single-series bars in --chart-1, 4px radius on top corners only, max bar
 * width 48px. `horizontal` flips to a ranked-category layout for labels
 * longer than ~12 characters, per spec.
 */

export default function BarChart({ data, dataKey, label, height = 240, horizontal = false, valueFormatter, className = "" }) {
  if (!data || data.length === 0) return <ChartEmpty height={height} />;
  return (
    <div className={className} style={{ height }}>
      <ResponsiveContainer>
        <RBarChart
          data={data}
          layout={horizontal ? "vertical" : "horizontal"}
          margin={{ top: 4, right: 4, left: horizontal ? 8 : 0, bottom: 0 }}
          barCategoryGap="40%"
        >
          <CartesianGrid stroke={CHART_GRID} vertical={horizontal} horizontal={!horizontal} />
          {horizontal ? (
            <>
              <XAxis type="number" tickLine={false} axisLine={false} tick={axisTickStyle} />
              <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} tick={axisTickStyle} width={96} />
            </>
          ) : (
            <>
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axisTickStyle} />
              <YAxis tickLine={false} axisLine={false} tick={axisTickStyle} width={36} />
            </>
          )}
          <Tooltip content={<ChartTooltip formatter={valueFormatter} />} cursor={{ fill: "var(--bg-hover)" }} />
          <Bar dataKey={dataKey} name={label} fill="var(--chart-1)" radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={48}>
            {data.map((_, i) => <Cell key={i} />)}
          </Bar>
        </RBarChart>
      </ResponsiveContainer>
    </div>
  );
}
