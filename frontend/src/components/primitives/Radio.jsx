import { forwardRef, useId } from "react";

/* Radio — docs/design-system.md §7.6. */

const Radio = forwardRef(function Radio({
  label,
  checked = false,
  disabled = false,
  className = "",
  id,
  ...rest
}, ref) {
  const autoId = useId();
  const radioId = id || autoId;
  return (
    <label
      htmlFor={radioId}
      className={`inline-flex items-center gap-2 ${disabled ? "cursor-not-allowed" : "cursor-pointer"} ${className}`}
      style={{ minHeight: 32 }}
    >
      <span className="relative inline-flex shrink-0 items-center justify-center" style={{
        width: 16, height: 16, borderRadius: "var(--radius-full)",
        border: `1.5px solid ${checked ? "var(--color-primary)" : "var(--border-strong)"}`,
        background: "var(--bg-surface)",
        opacity: disabled ? 0.5 : 1,
        transition: "border-color var(--dur-base) var(--ease-spring)",
      }}>
        {checked && (
          <span style={{ width: 6, height: 6, borderRadius: "var(--radius-full)", background: "var(--color-primary)" }} />
        )}
        <input
          ref={ref}
          id={radioId}
          type="radio"
          checked={checked}
          disabled={disabled}
          className="absolute inset-0 opacity-0"
          style={{ cursor: disabled ? "not-allowed" : "pointer" }}
          {...rest}
        />
      </span>
      {label && (
        <span style={{ fontSize: 13, lineHeight: "18px", color: disabled ? "var(--text-disabled)" : "var(--text-primary)", fontFamily: "var(--font-ui)" }}>
          {label}
        </span>
      )}
    </label>
  );
});

export default Radio;

/* Card-radio variant — onboarding goal pickers (§7.6). Full card, selected
 * state uses --bg-selected + a check badge rather than the dot glyph. */
export function CardRadio({ label, description, icon: Icon, checked = false, className = "", ...rest }) {
  return (
    <label className={`relative block cursor-pointer ${className}`} style={{
      border: `1px solid ${checked ? "var(--color-primary-border)" : "var(--border-default)"}`,
      background: checked ? "var(--bg-selected)" : "var(--bg-surface)",
      borderRadius: "var(--radius-lg)",
      padding: 16,
      transition: "background-color var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out)",
    }}>
      <input type="radio" checked={checked} className="absolute opacity-0" style={{ top: 12, left: 12 }} {...rest} />
      {Icon && <Icon size={20} strokeWidth={1.5} aria-hidden="true" style={{ color: "var(--text-secondary)", marginBottom: 8 }} />}
      <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>{label}</div>
      {description && <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>{description}</div>}
      {checked && (
        <span className="absolute inline-grid place-items-center" style={{
          top: -9, right: -9, width: 18, height: 18, borderRadius: "var(--radius-full)",
          background: "var(--color-primary)", color: "#FFFFFF", boxShadow: "var(--shadow-xs)",
        }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </span>
      )}
    </label>
  );
}
