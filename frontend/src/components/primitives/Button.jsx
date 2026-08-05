import { forwardRef } from "react";
import { Loader2 } from "../../icons";

/* Button — docs/design-system.md §6.
 *
 * Dimensions come from the §6.2 size table and colours from the §6.1 variant
 * table, both expressed as tokens. They are applied as inline style rather
 * than utility classes on purpose: the spec is a table of exact heights and
 * paddings (26/32/38/44/52), and encoding those as arbitrary Tailwind values
 * would scatter the source of truth across call sites. §20 also requires that
 * a component take `variant`/`size`/`tone` — never a colour or a height.
 *
 * `className` is passed through for LAYOUT ONLY (margins, grid placement,
 * width). Per §20 it must never be used to override colour, padding or
 * radius — that is what variant and size are for.
 */

// §6.2. `type` is the type-scale row from §2.5, not a px guess.
const SIZES = {
  xs: { height: 26, padX: 8,  font: 12,   weight: 500, icon: 14, radius: "var(--radius-sm)" },
  sm: { height: 32, padX: 12, font: 12,   weight: 500, icon: 14, radius: "var(--radius-md)" },
  md: { height: 38, padX: 14, font: 13,   weight: 500, icon: 16, radius: "var(--radius-md)" },
  lg: { height: 44, padX: 18, font: 14,   weight: 500, icon: 16, radius: "var(--radius-md)" },
  xl: { height: 52, padX: 24, font: 15,   weight: 600, icon: 18, radius: "var(--radius-lg)" },
};

// §6.1. `ring` is the focus treatment: filled variants use the 3px shadow ring
// (§5.1) so it reads against the fill; outlined ones use the standard outline.
const VARIANTS = {
  primary: {
    bg: "var(--color-primary)", fg: "var(--color-on-primary)", border: "transparent",
    bgHover: "var(--color-primary-hover)", filled: true,
  },
  secondary: {
    bg: "var(--bg-surface)", fg: "var(--text-primary)", border: "var(--border-default)",
    bgHover: "var(--bg-hover)", filled: false,
  },
  tertiary: {
    bg: "transparent", fg: "var(--text-secondary)", border: "transparent",
    bgHover: "var(--bg-hover)", filled: false,
  },
  subtle: {
    bg: "var(--color-primary-subtle)", fg: "var(--color-primary)", border: "transparent",
    bgHover: "var(--color-primary-subtle-hover)", filled: false,
  },
  intel: {
    bg: "var(--color-intel)", fg: "var(--color-on-intel)", border: "transparent",
    bgHover: "var(--color-intel-hover)", filled: true,
  },
  "intel-subtle": {
    bg: "var(--color-intel-subtle)", fg: "var(--color-intel)", border: "var(--color-intel-border)",
    bgHover: "var(--color-intel-subtle)", filled: false,
  },
  danger: {
    bg: "var(--color-danger)", fg: "#FFFFFF", border: "transparent",
    bgHover: "var(--color-danger-text)", filled: true, danger: true,
  },
  "danger-subtle": {
    bg: "var(--color-danger-subtle)", fg: "var(--color-danger-text)", border: "var(--color-danger-border)",
    bgHover: "var(--color-danger-subtle)", filled: false, danger: true,
  },
  link: {
    bg: "transparent", fg: "var(--text-link)", border: "transparent",
    bgHover: "transparent", filled: false, underlineOnHover: true,
  },
};

const Button = forwardRef(function Button({
  variant = "secondary",
  size = "md",
  icon: Icon,           // leading — creative/destructive actions (§6.2 RULE)
  trailingIcon: Trailing, // direction/disclosure only; never both
  isLoading = false,
  isDisabled = false,
  iconOnly = false,
  type = "button",
  className = "",
  children,
  ...rest
}, ref) {
  const s = SIZES[size] || SIZES.md;
  const v = VARIANTS[variant] || VARIANTS.secondary;

  if (process.env.NODE_ENV !== "production") {
    // §6.2 RULE: leading OR trailing, never both.
    if (Icon && Trailing) {
      console.warn("[Button] §6.2: use a leading icon or a trailing icon, never both.");
    }
    // §3.1 RULE: an icon-only control must be labelled or it is invisible to
    // assistive tech and has no tooltip.
    if (iconOnly && !rest["aria-label"]) {
      console.warn("[Button] §3.1: icon-only buttons require an aria-label.");
    }
  }

  // §5.1: disabled must not use opacity — it degrades text contrast. Tokens
  // carry the disabled treatment instead.
  const disabled = isDisabled || isLoading;

  const style = {
    height: s.height,
    padding: iconOnly ? 0 : `0 ${s.padX}px`,
    width: iconOnly ? s.height : undefined,
    fontSize: s.font,
    fontWeight: s.weight,
    borderRadius: iconOnly ? "var(--radius-md)" : s.radius,
    background: disabled ? "var(--bg-disabled)" : v.bg,
    color: disabled ? "var(--text-disabled)" : v.fg,
    border: `1px solid ${disabled ? "var(--border-subtle)" : v.border}`,
    fontFamily: "var(--font-ui)",
    cursor: disabled ? "not-allowed" : "pointer",
    // §2.9: hover/focus animate colour only, at --dur-fast.
    transition: "background-color var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)",
    ["--btn-bg-hover"]: v.bgHover,
    ["--btn-ring"]: v.danger ? "var(--shadow-focus-danger)" : "var(--shadow-focus)",
  };

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled}
      aria-busy={isLoading || undefined}
      data-state={isLoading ? "loading" : undefined}
      data-variant={variant}
      className={`ds-btn inline-flex items-center justify-center gap-2 whitespace-nowrap select-none ${v.underlineOnHover ? "ds-btn--link" : ""} ${className}`}
      style={style}
      {...rest}>
      {/* §6.1: loading replaces the LEADING icon and keeps the label, so the
          button does not change width mid-action. */}
      {isLoading
        ? <Loader2 size={s.icon} strokeWidth={1.5} className="ds-spin" aria-hidden="true" />
        : Icon ? <Icon size={s.icon} strokeWidth={1.5} aria-hidden="true" /> : null}
      {!iconOnly && children}
      {!isLoading && Trailing ? <Trailing size={s.icon} strokeWidth={1.5} aria-hidden="true" /> : null}
    </button>
  );
});

export default Button;
