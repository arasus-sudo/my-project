import { strokeFor } from "../../icons";

/* IconSquare — docs/design-system.md §3.2, "the system's signature element".
 *
 * A rounded square with a subtle tinted background and a stroke icon in the
 * matching strong tone. Used for KPI leading icons, feature cards, empty
 * states and category rows.
 *
 * §3.2 RULE: the tone is SEMANTIC, not decorative — blue for data/records,
 * violet for machine-generated, green for growth/wins, amber for
 * revenue/attention, orange for urgency, neutral for settings/files. A screen
 * may show at most FOUR tones; more reads as a toy.
 */

// §3.2 size table: each size fixes its own radius and icon size. They are not
// independently adjustable — that is the point of the component.
const SIZES = {
  28: { radius: 8,  icon: 14 },
  36: { radius: 10, icon: 18 },
  44: { radius: 12, icon: 20 },
  56: { radius: 14, icon: 24 },
  72: { radius: 16, icon: 32 },
};

const TONES = {
  primary: { bg: "var(--color-primary-subtle)", fg: "var(--color-primary)", border: "var(--color-primary-border)" },
  intel:   { bg: "var(--color-intel-subtle)",   fg: "var(--color-intel)",   border: "var(--color-intel-border)" },
  success: { bg: "var(--color-success-subtle)", fg: "var(--color-success)", border: "var(--color-success-border)" },
  warning: { bg: "var(--color-warning-subtle)", fg: "var(--color-warning)", border: "var(--color-warning-border)" },
  risk:    { bg: "var(--color-risk-subtle)",    fg: "var(--color-risk)",    border: "var(--color-risk-border)" },
  neutral: { bg: "var(--color-neutral-status-subtle)", fg: "var(--color-neutral-status)", border: "var(--color-neutral-status-border)" },
};

export default function IconSquare({
  icon: Icon,
  tone = "primary",
  size = 36,
  bordered = false, // §3.2: no border in console; 1px tone border on marketing
  className = "",
  ...rest
}) {
  const s = SIZES[size] || SIZES[36];
  const t = TONES[tone] || TONES.primary;
  return (
    <span
      className={`inline-grid place-items-center shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: s.radius,
        background: t.bg,
        color: t.fg,
        border: bordered ? `1px solid ${t.border}` : undefined,
      }}
      {...rest}>
      {/* Decorative by definition — the meaning is carried by the adjacent
          label, per §3.1's "never use an icon as the sole carrier of status". */}
      {Icon ? <Icon size={s.icon} strokeWidth={strokeFor(s.icon)} aria-hidden="true" /> : null}
    </span>
  );
}
