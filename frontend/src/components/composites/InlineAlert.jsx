import { CheckCircle2, AlertTriangle, AlertCircle, Info } from "../../icons";

/* InlineAlert / banner — docs/design-system.md §10.6. */

const TONES = {
  success: { icon: CheckCircle2, fg: "var(--color-success)", bg: "var(--color-success-subtle)", border: "var(--color-success-border)" },
  warning: { icon: AlertTriangle, fg: "var(--color-warning)", bg: "var(--color-warning-subtle)", border: "var(--color-warning-border)" },
  danger:  { icon: AlertCircle,   fg: "var(--color-danger)",  bg: "var(--color-danger-subtle)",  border: "var(--color-danger-border)" },
  info:    { icon: Info,          fg: "var(--color-primary)", bg: "var(--color-primary-subtle)", border: "var(--color-primary-border)" },
};

export default function InlineAlert({ tone = "info", title, children, actions, className = "" }) {
  const t = TONES[tone] || TONES.info;
  const Icon = t.icon;
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={`flex items-start gap-3 ${className}`}
      style={{
        background: t.bg, border: `1px solid ${t.border}`, borderRadius: "var(--radius-lg)", padding: "14px 16px",
      }}
    >
      <Icon size={18} strokeWidth={1.5} aria-hidden="true" style={{ color: t.fg, flexShrink: 0, marginTop: 1 }} />
      <div className="min-w-0 flex-1">
        {title && <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>{title}</div>}
        {children && <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: title ? 2 : 0 }}>{children}</div>}
      </div>
      {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
    </div>
  );
}
