import { Loader2 } from "../../icons";

/* Spinner + Skeleton — docs/design-system.md §4.4.
 *
 * §24.12 bans a full-page spinner as the loading state for a data view, and
 * §4.4 says why: a spinner tells the user nothing about what is arriving.
 * Skeletons matching the final geometry do. Spinners are therefore confined to
 * buttons and inline refreshes.
 */

/** §4.4: 16px, 700ms linear. Inside buttons and inline refreshes only. */
export function Spinner({ size = 16, label = "Loading", className = "" }) {
  return (
    <Loader2
      size={size}
      strokeWidth={1.5}
      role="status"
      aria-label={label}
      className={`ds-spin ${className}`}
    />
  );
}

/** §4.4: text bars at the height of the type they replace, 60-90% width,
 * --bg-active, --radius-sm, 1400ms shimmer. Geometry must match the final
 * content or the page jumps when data lands. */
export function Skeleton({ width = "100%", height = 14, radius = "var(--radius-sm)", className = "" }) {
  return (
    <span
      aria-hidden="true"
      className={`ds-skeleton block ${className}`}
      style={{ width, height, borderRadius: radius }}
    />
  );
}

/** Several text bars at varying widths — the common case. */
export function SkeletonText({ lines = 3, className = "" }) {
  const widths = ["90%", "75%", "60%", "82%", "68%"];
  return (
    <span className={`grid gap-2 ${className}`} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} width={widths[i % widths.length]} />
      ))}
    </span>
  );
}

/** Divider — §4.1. Full-bleed inside a card via negative margin. */
export function Divider({ className = "", inset = false }) {
  return (
    <hr
      className={className}
      style={{
        border: 0,
        borderTop: "1px solid var(--border-subtle)",
        margin: inset ? "0" : "0",
      }}
    />
  );
}

/** Kbd — §8.5. Used in the command palette and shortcut hints. */
export function Kbd({ children, className = "" }) {
  return (
    <kbd
      className={className}
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 12.5,
        lineHeight: "18px",
        background: "var(--bg-surface-sunken)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-xs)",
        padding: "2px 5px",
        color: "var(--text-secondary)",
      }}>
      {children}
    </kbd>
  );
}
