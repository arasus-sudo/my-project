/* Card — docs/design-system.md §4.1, "the atomic container of the console".
 *
 * §4.1: the card is defined by its BORDER, not by a shadow. --shadow-xs is
 * almost invisible and exists only to lift it a hair off the canvas; §24.10
 * bans deep or wide shadows outright.
 *
 * §2.7 RULE: never nest equal radii. The card is --radius-xl (12px), so
 * anything inside it must use --radius-lg (10px) or smaller.
 */

export default function Card({
  title,
  subtitle,
  action,                 // §4.1: right-aligned text link or icon button
  padding = "default",    // §2.6: 20px compact / 24px default
  as: Tag = "section",
  headingLevel: H = "h3", // §5.3: card titles are h2/h3 in document order
  className = "",
  bodyClassName = "",
  children,
  ...rest
}) {
  const pad = padding === "compact" ? 20 : 24;
  const hasHeader = title || action;
  return (
    <Tag
      className={className}
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-xl)",
        boxShadow: "var(--shadow-xs)",
        padding: pad,
      }}
      {...rest}>
      {hasHeader && (
        // §4.1: title block → body gap is 16px.
        <header className="flex items-start justify-between gap-4" style={{ marginBottom: 16 }}>
          <div className="min-w-0">
            {title && (
              <H style={{
                fontSize: 17, lineHeight: "24px", fontWeight: 600,
                letterSpacing: "-0.008em", color: "var(--text-primary)",
                fontFamily: "var(--font-ui)", margin: 0,
              }}>
                {title}
              </H>
            )}
            {subtitle && (
              <p style={{
                fontSize: 11.5, lineHeight: "16px", color: "var(--text-tertiary)",
                margin: "2px 0 0", fontFamily: "var(--font-ui)",
              }}>
                {subtitle}
              </p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </Tag>
  );
}

/** §4.1: dividers inside a card are full-bleed — they run to the card's edges,
 * which means cancelling the card's own padding with a negative margin. */
export function CardDivider({ padding = "default" }) {
  const pad = padding === "compact" ? 20 : 24;
  return (
    <hr style={{
      border: 0,
      borderTop: "1px solid var(--border-subtle)",
      margin: `16px -${pad}px`,
    }} />
  );
}
