import { forwardRef, useId } from "react";

/* Toggle (switch) — docs/design-system.md §7.7.
 * RULE: immediate-effect settings only — never inside a form with a Save
 * button, where a checkbox is the correct control instead.
 */

const Toggle = forwardRef(function Toggle({
  label,
  description,
  checked = false,
  disabled = false,
  className = "",
  id,
  ...rest
}, ref) {
  const autoId = useId();
  const toggleId = id || autoId;
  return (
    <label
      htmlFor={toggleId}
      className={`flex items-center justify-between gap-4 ${disabled ? "cursor-not-allowed" : "cursor-pointer"} ${className}`}
    >
      {(label || description) && (
        <span>
          {label && (
            <span className="block" style={{ fontSize: 13, fontWeight: 500, color: disabled ? "var(--text-disabled)" : "var(--text-primary)", fontFamily: "var(--font-ui)" }}>
              {label}
            </span>
          )}
          {description && (
            <span className="block" style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
              {description}
            </span>
          )}
        </span>
      )}
      <span className="relative inline-flex shrink-0" style={{
        width: 40, height: 22, borderRadius: "var(--radius-full)",
        background: checked ? "var(--color-primary)" : "var(--border-strong)",
        opacity: disabled ? 0.5 : 1,
        transition: "background-color var(--dur-base) var(--ease-spring)",
      }}>
        <span style={{
          position: "absolute", top: 2, left: checked ? 20 : 2,
          width: 18, height: 18, borderRadius: "var(--radius-full)",
          background: "#FFFFFF", boxShadow: "var(--shadow-xs)",
          transition: "left var(--dur-base) var(--ease-spring)",
        }} />
        <input
          ref={ref}
          id={toggleId}
          type="checkbox"
          role="switch"
          checked={checked}
          disabled={disabled}
          className="absolute inset-0 opacity-0"
          style={{ cursor: disabled ? "not-allowed" : "pointer" }}
          {...rest}
        />
      </span>
    </label>
  );
});

export default Toggle;
