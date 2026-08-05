/* Count badge — docs/design-system.md §9.3. */

export default function CountBadge({ count, dot = false, className = "" }) {
  if (dot) {
    return (
      <span
        className={className}
        style={{
          width: 8, height: 8, borderRadius: "var(--radius-full)",
          background: "var(--color-primary)", boxShadow: "0 0 0 2px var(--bg-surface)",
          display: "inline-block",
        }}
      />
    );
  }
  return (
    <span
      className={`tnum inline-grid place-items-center ${className}`}
      style={{
        minWidth: 18, height: 18, padding: "0 5px", borderRadius: "var(--radius-full)",
        background: "var(--color-primary)", color: "#FFFFFF",
        fontSize: 11, fontWeight: 500, fontFamily: "var(--font-ui)",
      }}
    >
      {count}
    </span>
  );
}
