import { X } from "../../icons";

/* Chip — docs/design-system.md §9.2, removable filter or token. */

export default function Chip({ label, icon: Icon, onRemove, className = "", ...rest }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 ${className}`}
      style={{
        height: 26, padding: "0 8px", borderRadius: "var(--radius-sm)",
        border: "1px solid var(--border-default)", background: "var(--bg-surface)",
        fontSize: 12.5, fontWeight: 500, color: "var(--text-primary)", fontFamily: "var(--font-ui)",
      }}
      {...rest}
    >
      {Icon && <Icon size={14} strokeWidth={1.5} aria-hidden="true" style={{ color: "var(--text-tertiary)" }} />}
      {label}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${label}`}
          className="inline-grid place-items-center"
          style={{ color: "var(--text-tertiary)", marginLeft: 2 }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-tertiary)")}
        >
          <X size={12} strokeWidth={1.75} aria-hidden="true" />
        </button>
      )}
    </span>
  );
}
