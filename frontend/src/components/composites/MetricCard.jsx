import { TrendingUp, TrendingDown } from "../../icons";
import IconSquare from "../primitives/IconSquare";

/* MetricCard — docs/design-system.md §4.2.
 *
 * §1.4: "Every number carries context. A metric is never alone. It ships with
 * a label, a comparison delta and a basis line. A bare number is an unfinished
 * component." This component makes that structural rather than a convention —
 * `basis` renders under the value, and `delta` renders a signed change with
 * the comparison window it is measured against.
 *
 * §4.2 RULE: favourability is a property of the METRIC, not of the arrow
 * direction. A rising churn rate is bad. So callers declare `higherIsBetter`
 * and the component colours the delta from that, while the arrow always points
 * the way the number actually moved (§3.3: direction = data, colour = judgment).
 */

export default function MetricCard({
  label,
  value,
  icon,
  tone = "primary",       // §3.2: semantic — max four tones on a screen
  delta,                  // signed number, e.g. 12.4 or -3.1
  deltaSuffix = "%",
  comparison = "vs last month", // §4.2: a delta without a window is meaningless
  higherIsBetter = true,
  basis,                  // §4.2: "64 active opportunities"
  size = "default",       // "hero" uses metric-lg (30px)
  className = "",
  ...rest
}) {
  const hasDelta = typeof delta === "number" && Number.isFinite(delta);
  const rose = hasDelta && delta > 0;
  const flat = hasDelta && delta === 0;
  // Favourable when the direction it moved matches what we want it to do.
  const favourable = hasDelta && (rose === higherIsBetter);
  const deltaColor = !hasDelta || flat
    ? "var(--text-tertiary)"
    : favourable ? "var(--color-success)" : "var(--color-danger)";
  const Arrow = rose ? TrendingUp : TrendingDown;

  return (
    <div
      className={className}
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-xl)",
        boxShadow: "var(--shadow-xs)",
        padding: 20,
      }}
      {...rest}>
      {/* §4.2 step 1: 36px tinted square + caption label. */}
      <div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
        {icon && <IconSquare icon={icon} tone={tone} size={36} />}
        <span style={{
          fontSize: 11.5, lineHeight: "16px", letterSpacing: "0.005em",
          color: "var(--text-secondary)", fontFamily: "var(--font-ui)",
        }}>
          {label}
        </span>
      </div>

      {/* §4.2 step 2 — tabular so a row of cards lines up (§2.4 RULE).
          aria-live on the VALUE only, never the whole card (§5.3). */}
      <div
        className="tnum"
        aria-live="polite"
        style={{
          fontSize: size === "hero" ? 30 : 22,
          lineHeight: size === "hero" ? "34px" : "26px",
          fontWeight: 700,
          letterSpacing: size === "hero" ? "-0.02em" : "-0.015em",
          color: "var(--text-primary)",
          fontFamily: "var(--font-display)",
        }}>
        {value}
      </div>

      {/* §4.2 step 3: delta + the window it is measured against. Rendered only
          when a real comparison exists — inventing one would breach §24.16. */}
      {hasDelta && (
        <div className="flex items-center gap-1" style={{ marginTop: 6, color: deltaColor }}>
          {!flat && <Arrow size={14} strokeWidth={1.5} aria-hidden="true" />}
          <span className="tnum" style={{ fontSize: 11.5, lineHeight: "16px", fontWeight: 500 }}>
            {delta > 0 ? "+" : ""}{delta}{deltaSuffix}
          </span>
          <span style={{ fontSize: 11.5, lineHeight: "16px", color: "var(--text-tertiary)" }}>
            {comparison}
          </span>
        </div>
      )}

      {/* §4.2 step 4: the basis line. */}
      {basis && (
        <div style={{
          fontSize: 11.5, lineHeight: "16px", color: "var(--text-tertiary)",
          marginTop: hasDelta ? 2 : 6, fontFamily: "var(--font-ui)",
        }}>
          {basis}
        </div>
      )}
    </div>
  );
}
