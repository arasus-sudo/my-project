import { forwardRef, useId } from "react";
import { AlertCircle } from "../../icons";

/* Input — docs/design-system.md §7.1 (text input) and §7.2 (textarea).
 *
 * Label/help/error are structural, not left to call sites, so §1.4's "every
 * control carries context" applies to forms the same way it applies to
 * metrics. Error REPLACES help text rather than stacking under it (§7.1).
 */

const SIZES = {
  sm: { height: 34, font: 13 },
  md: { height: 38, font: 14 },
  lg: { height: 44, font: 15 },
};

const Input = forwardRef(function Input({
  as = "input",           // "input" | "textarea"
  size = "md",
  label,
  optional = false,
  help,
  error,
  leadingIcon: Leading,
  trailingIcon: Trailing,
  onTrailingClick,
  disabled = false,
  readOnly = false,
  className = "",
  id,
  ...rest
}, ref) {
  const autoId = useId();
  const inputId = id || autoId;
  const s = SIZES[size] || SIZES.md;
  const Tag = as === "textarea" ? "textarea" : "input";
  const hasError = Boolean(error);

  const style = {
    width: "100%",
    height: as === "textarea" ? undefined : s.height,
    minHeight: as === "textarea" ? 96 : undefined,
    padding: `10px 12px`,
    paddingLeft: Leading ? 36 : 12,
    paddingRight: Trailing ? 36 : 12,
    fontSize: s.font,
    lineHeight: as === "textarea" ? 1.6 : undefined,
    borderRadius: "var(--radius-md)",
    border: `1px solid ${hasError ? "var(--color-danger)" : "var(--border-default)"}`,
    background: disabled ? "var(--bg-disabled)" : readOnly ? "var(--bg-surface-sunken)" : "var(--bg-surface)",
    color: disabled ? "var(--text-disabled)" : "var(--text-primary)",
    fontFamily: "var(--font-ui)",
    resize: as === "textarea" ? "vertical" : undefined,
    transition: "border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)",
  };

  return (
    <div className={className}>
      {label && (
        <label htmlFor={inputId} className="flex items-baseline gap-1.5" style={{
          fontSize: 13, fontWeight: 500, color: "var(--text-primary)",
          fontFamily: "var(--font-ui)", marginBottom: 6,
        }}>
          {label}
          {optional && <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", fontWeight: 400 }}>(optional)</span>}
        </label>
      )}
      <div className="relative">
        {Leading && (
          <Leading size={16} strokeWidth={1.5} aria-hidden="true"
            className="absolute pointer-events-none" style={{ left: 10, top: as === "textarea" ? 12 : "50%", transform: as === "textarea" ? undefined : "translateY(-50%)", color: "var(--text-tertiary)" }} />
        )}
        <Tag
          ref={ref}
          id={inputId}
          disabled={disabled}
          readOnly={readOnly}
          aria-invalid={hasError || undefined}
          aria-describedby={help || error ? `${inputId}-hint` : undefined}
          className="ds-input"
          style={style}
          {...rest}
        />
        {Trailing && (
          <Trailing size={16} strokeWidth={1.5} aria-hidden="true"
            onClick={onTrailingClick}
            className="absolute" style={{
              right: 10, top: as === "textarea" ? 12 : "50%", transform: as === "textarea" ? undefined : "translateY(-50%)",
              color: "var(--text-tertiary)", cursor: onTrailingClick ? "pointer" : undefined,
            }} />
        )}
      </div>
      {(help || error) && (
        <div id={`${inputId}-hint`} className="flex items-center gap-1" style={{
          marginTop: 6, fontSize: 11.5, lineHeight: "16px",
          color: hasError ? "var(--color-danger-text)" : "var(--text-tertiary)",
        }}>
          {hasError && <AlertCircle size={14} strokeWidth={1.5} aria-hidden="true" />}
          {hasError ? error : help}
        </div>
      )}
    </div>
  );
});

export default Input;
