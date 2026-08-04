import { Sparkles, ChevronRight } from "../../icons";
import StatusPill from "../primitives/StatusPill";
import Button from "../primitives/Button";

/* Intelligence container — docs/design-system.md §4.5.
 * RULE: every assisted block names its inputs and offers at least one
 * explicit human action — no silent writes. `signals` renders that line;
 * omitting it is a spec violation, so it's a required prop, not optional.
 */

const CONFIDENCE = {
  high: { label: "High confidence", tone: "success" },
  medium: { label: "Medium confidence", tone: "warning" },
  low: { label: "Low confidence", tone: "neutral" },
};

export default function InsightCard({ title, confidence = "medium", signals, rows = [], onViewAnalysis, className = "" }) {
  const c = CONFIDENCE[confidence] || CONFIDENCE.medium;
  return (
    <div className={className} style={{
      border: "1px solid var(--color-intel-border)", borderRadius: "var(--radius-xl)",
      background: "var(--bg-surface)", overflow: "hidden",
    }}>
      <div className="flex items-center justify-between gap-3" style={{ background: "var(--color-intel-subtle)", padding: "12px 16px" }}>
        <span className="flex items-center gap-2">
          <Sparkles size={16} strokeWidth={1.5} aria-hidden="true" style={{ color: "var(--color-intel)" }} />
          <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>{title}</span>
        </span>
        <StatusPill status={c.label} tone={c.tone} />
      </div>

      {signals && (
        <div style={{ padding: "10px 16px 0", fontSize: 11.5, color: "var(--text-tertiary)" }}>
          Signals: {signals}
        </div>
      )}

      <div style={{ padding: 16 }} className="space-y-3">
        {rows.map((r, i) => (
          <InsightRow key={i} {...r} />
        ))}
      </div>

      {onViewAnalysis && (
        <button
          type="button" onClick={onViewAnalysis}
          className="flex items-center gap-1"
          style={{ padding: "0 16px 14px", fontSize: 12.5, fontWeight: 500, color: "var(--text-link)", fontFamily: "var(--font-ui)" }}
        >
          View full analysis <ChevronRight size={14} strokeWidth={1.5} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

const ROW_TONE = {
  success: "var(--color-success)", warning: "var(--color-warning)",
  danger: "var(--color-danger)", primary: "var(--color-primary)", intel: "var(--color-intel)",
};

export function InsightRow({ icon: Icon, tone = "intel", finding, reason, action, onAction }) {
  return (
    <div className="flex items-start gap-2.5">
      {Icon && <Icon size={16} strokeWidth={1.5} aria-hidden="true" style={{ color: ROW_TONE[tone] || ROW_TONE.intel, marginTop: 2, flexShrink: 0 }} />}
      <div className="min-w-0 flex-1">
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>{finding}</div>
        {reason && <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 1 }}>{reason}</div>}
      </div>
      {action && <Button variant="tertiary" size="xs" onClick={onAction} className="shrink-0">{action}</Button>}
    </div>
  );
}
