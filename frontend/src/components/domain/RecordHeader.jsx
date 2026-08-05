import { MoreVertical } from "../../icons";
import StatusPill from "../primitives/StatusPill";
import Button from "../primitives/Button";

/* RecordHeader — docs/design-system.md §14, header band of the three-zone
 * record detail layout. 48px avatar, name + status pill inline, a
 * role/company subline, up to 3 secondary actions + 1 primary + overflow.
 */

export default function RecordHeader({ avatar, name, status, subline, actions = [], primaryAction, className = "" }) {
  return (
    <div className={className} style={{ background: "var(--bg-surface)", borderBottom: "1px solid var(--border-default)", padding: "20px 24px" }}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <span className="inline-grid place-items-center shrink-0 overflow-hidden" style={{
            width: 48, height: 48, borderRadius: "var(--radius-full)", background: "var(--bg-active)",
            fontSize: 16, fontWeight: 600, color: "var(--text-secondary)", fontFamily: "var(--font-ui)",
          }}>
            {avatar ? <img src={avatar} alt="" className="w-full h-full object-cover" /> : (name || "").slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate" style={{ fontSize: 20, lineHeight: "26px", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>
                {name}
              </h1>
              {status && <StatusPill status={status} />}
            </div>
            {subline && (
              <div className="truncate" style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>{subline}</div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {actions.slice(0, 3).map((a, i) => (
            <Button key={i} variant="secondary" size="sm" onClick={a.onClick} icon={a.icon}>{a.label}</Button>
          ))}
          {primaryAction && <Button variant="primary" size="sm" onClick={primaryAction.onClick}>{primaryAction.label}</Button>}
          <button type="button" aria-label="More actions" className="inline-grid place-items-center" style={{ width: 32, height: 32, borderRadius: "var(--radius-md)", color: "var(--text-tertiary)" }}>
            <MoreVertical size={16} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* Label/value row — §14: used inside the left column's profile card. */
export function FieldRow({ icon: Icon, label, value, href, className = "" }) {
  return (
    <div className={`flex items-center justify-between gap-3 ${className}`} style={{ padding: "10px 0", borderBottom: "1px solid var(--border-subtle)" }}>
      <span className="flex items-center gap-1.5 shrink-0" style={{ fontSize: 12, color: "var(--text-secondary)" }}>
        {Icon && <Icon size={14} strokeWidth={1.5} aria-hidden="true" style={{ color: "var(--text-tertiary)" }} />}
        {label}
      </span>
      {href ? (
        <a href={href} className="truncate text-right" style={{ fontSize: 13, color: "var(--text-link)" }}>{value}</a>
      ) : (
        <span className="truncate text-right" style={{ fontSize: 13, color: "var(--text-primary)" }}>{value}</span>
      )}
    </div>
  );
}

/* Three-zone record detail layout — §14: left (profile) / center (activity)
 * / right (score, next action) columns, collapsing to a single column below
 * 1280px in center → left → right order. */
export function DetailPanel({ left, center, right, className = "" }) {
  return (
    <div className={`grid grid-cols-1 xl:grid-cols-[320px_1fr_320px] gap-6 ${className}`} style={{ padding: 24 }}>
      <div className="order-2 xl:order-1 space-y-4">{left}</div>
      <div className="order-1 xl:order-2 space-y-4">{center}</div>
      <div className="order-3 space-y-4">{right}</div>
    </div>
  );
}

/* Timeline row — §14 center column. */
export function TimelineRow({ icon: Icon, tone = "primary", title, detail, timestamp, className = "" }) {
  const TONE_BG = {
    primary: "var(--color-primary-subtle)", intel: "var(--color-intel-subtle)",
    success: "var(--color-success-subtle)", warning: "var(--color-warning-subtle)", danger: "var(--color-danger-subtle)",
  };
  const TONE_FG = {
    primary: "var(--color-primary)", intel: "var(--color-intel)",
    success: "var(--color-success)", warning: "var(--color-warning)", danger: "var(--color-danger)",
  };
  return (
    <div className={`flex items-start gap-3 ${className}`} style={{ padding: "10px 0", borderBottom: "1px solid var(--border-subtle)" }}>
      <span className="inline-grid place-items-center shrink-0" style={{ width: 28, height: 28, borderRadius: "var(--radius-md)", background: TONE_BG[tone], color: TONE_FG[tone] }}>
        {Icon && <Icon size={14} strokeWidth={1.5} aria-hidden="true" />}
      </span>
      <div className="min-w-0 flex-1">
        <div style={{ fontSize: 13, color: "var(--text-primary)" }}>{title}</div>
        {detail && <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 1 }}>{detail}</div>}
      </div>
      {timestamp && <span className="shrink-0" style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{timestamp}</span>}
    </div>
  );
}
