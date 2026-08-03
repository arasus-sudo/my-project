/* StatusPill — docs/design-system.md §9.1, driven by the §4.3 vocabulary.
 *
 * §1.6: status is a vocabulary, not a decoration. Six statuses, six tones,
 * used identically everywhere — a green pill means won/healthy/success on
 * every screen in the product.
 *
 * §4.3 RULE: copy is sentence-case, one or two words. §24.13 bans uppercase
 * status pills outright, so the label is rendered exactly as passed and the
 * component never applies text-transform.
 *
 * §9.1: never wraps, and truncation is NOT allowed — if a label does not fit,
 * shorten the word rather than clipping it.
 */

const TONES = {
  success: { bg: "var(--color-success-subtle)", fg: "var(--color-success-text)", dot: "var(--color-success)" },
  primary: { bg: "var(--color-primary-subtle)", fg: "var(--color-primary)",      dot: "var(--color-primary)" },
  warning: { bg: "var(--color-warning-subtle)", fg: "var(--color-warning-text)", dot: "var(--color-warning)" },
  risk:    { bg: "var(--color-risk-subtle)",    fg: "var(--color-risk-text)",    dot: "var(--color-risk)" },
  danger:  { bg: "var(--color-danger-subtle)",  fg: "var(--color-danger-text)",  dot: "var(--color-danger)" },
  neutral: { bg: "var(--color-neutral-status-subtle)", fg: "var(--color-neutral-status)", dot: "var(--color-neutral-status)" },
};

/* §4.3 status vocabulary. Exported so screens map a domain value to a tone in
 * one place instead of re-deciding per table. Unknown values fall to neutral
 * ("inert"), which is the correct default for New/Draft/Archived. */
export const STATUS_TONE = {
  // Positive / closed-won
  won: "success", qualified: "success", connected: "success", active: "success",
  success: "success", opened: "success", sent: "success", healthy: "success",
  // In progress
  "in progress": "primary", "proposal sent": "primary", negotiation: "primary",
  syncing: "primary", running: "primary", sending: "primary",
  // Attention / medium
  medium: "warning", pending: "warning", "needs review": "warning",
  "due soon": "warning", paused: "warning", draft_review: "warning",
  // At risk
  "at risk": "risk", "high priority": "risk", stalled: "risk", overdue: "risk",
  // Failure / closed-lost
  lost: "danger", failed: "danger", error: "danger", disconnected: "danger",
  bounced: "danger", quarantined: "danger",
  // Inert
  new: "neutral", draft: "neutral", archived: "neutral",
  "not connected": "neutral", low: "neutral", completed: "neutral",
};

/** Tone for a domain status string, case-insensitively. */
export function toneForStatus(status) {
  return STATUS_TONE[String(status || "").trim().toLowerCase()] || "neutral";
}

export default function StatusPill({
  children,
  tone,               // explicit tone wins
  status,             // …otherwise derive it from the §4.3 vocabulary
  icon: Icon,
  withDot = false,
  dense = false,      // §9.1: 20px inside dense tables, 22px elsewhere
  className = "",
  ...rest
}) {
  const resolved = tone || toneForStatus(status ?? children);
  const t = TONES[resolved] || TONES.neutral;
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap align-middle ${className}`}
      style={{
        height: dense ? 20 : 22,
        padding: "0 8px",
        borderRadius: "var(--radius-sm)",
        background: t.bg,
        color: t.fg,
        fontSize: 12,
        fontWeight: 500,
        fontFamily: "var(--font-ui)",
        lineHeight: 1,
      }}
      {...rest}>
      {withDot && (
        <span aria-hidden="true" style={{
          width: 6, height: 6, borderRadius: "var(--radius-full)", background: t.dot, flexShrink: 0,
        }} />
      )}
      {Icon ? <Icon size={14} strokeWidth={1.5} aria-hidden="true" /> : null}
      {children ?? status}
    </span>
  );
}
