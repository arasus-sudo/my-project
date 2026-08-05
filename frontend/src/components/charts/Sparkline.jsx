import { LineChart, Line, ResponsiveContainer } from "recharts";

/* Sparkline — docs/design-system.md §12.5.
 * 28-36px tall, no axes, no grid, 1.5px stroke, never interactive — so
 * Tooltip/CartesianGrid/axes are deliberately absent, not just hidden.
 */

export default function Sparkline({ data, dataKey = "value", positive = false, height = 32, width = 80, terminalDot = false, className = "" }) {
  if (!data || data.length < 2) return <div style={{ width, height }} className={className} />;
  const color = positive ? "var(--chart-positive)" : "var(--chart-1)";
  return (
    <div className={className} style={{ width, height }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
          <Line
            type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.5}
            dot={terminalDot ? (props) => (
              props.index === data.length - 1
                ? <circle key="terminal" cx={props.cx} cy={props.cy} r={3} fill={color} />
                : null
            ) : false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
