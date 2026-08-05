import { forwardRef, useId } from "react";
import { Check } from "../../icons";

/* Checkbox — docs/design-system.md §7.5.
 * Whole row is clickable and the hit area is >=32px tall even though the box
 * itself renders at 16x16 — §5.1 minimum target size applies to the label
 * row, not just the visible glyph.
 */

const Checkbox = forwardRef(function Checkbox({
  label,
  checked = false,
  indeterminate = false,
  disabled = false,
  className = "",
  id,
  ...rest
}, ref) {
  const autoId = useId();
  const boxId = id || autoId;
  const on = checked || indeterminate;
  return (
    <label
      htmlFor={boxId}
      className={`inline-flex items-center gap-2 ${disabled ? "cursor-not-allowed" : "cursor-pointer"} ${className}`}
      style={{ minHeight: 32 }}
    >
      <span className="relative inline-flex shrink-0 items-center justify-center" style={{
        width: 16, height: 16, borderRadius: "var(--radius-xs)",
        border: `1.5px solid ${on ? "var(--color-primary)" : "var(--border-strong)"}`,
        background: on ? "var(--color-primary)" : "var(--bg-surface)",
        opacity: disabled ? 0.5 : 1,
        transition: "background-color var(--dur-base) var(--ease-spring), border-color var(--dur-base) var(--ease-spring)",
      }}>
        {indeterminate ? (
          <span style={{ width: 8, height: 2, background: "#FFFFFF", borderRadius: 1 }} />
        ) : checked ? (
          <Check size={12} strokeWidth={1.75} color="#FFFFFF" aria-hidden="true" />
        ) : null}
        <input
          ref={ref}
          id={boxId}
          type="checkbox"
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

export default Checkbox;
