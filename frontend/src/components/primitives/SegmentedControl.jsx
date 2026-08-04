/* SegmentedControl — docs/design-system.md §7.8.
 * RULE: 2-4 segments only ("Revenue | Pipeline | Won deals", "7D | 30D | 90D").
 */

export default function SegmentedControl({ options, value, onChange, className = "", ...rest }) {
  if (process.env.NODE_ENV !== "production" && (options.length < 2 || options.length > 4)) {
    console.warn("[SegmentedControl] §7.8: 2-4 segments only.");
  }
  return (
    <div
      role="tablist"
      className={`inline-flex ${className}`}
      style={{ background: "var(--bg-surface-sunken)", borderRadius: "var(--radius-md)", padding: 3, gap: 2 }}
      {...rest}
    >
      {options.map((opt) => {
        const val = typeof opt === "object" ? opt.value : opt;
        const text = typeof opt === "object" ? opt.label : opt;
        const selected = val === value;
        return (
          <button
            key={val}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(val)}
            style={{
              height: 28,
              padding: "0 12px",
              fontSize: 12.5,
              fontWeight: 500,
              fontFamily: "var(--font-ui)",
              borderRadius: "var(--radius-sm)",
              background: selected ? "var(--bg-surface)" : "transparent",
              boxShadow: selected ? "var(--shadow-xs)" : "none",
              color: selected ? "var(--text-primary)" : "var(--text-secondary)",
              transition: `background-color var(--dur-base) var(--ease-out), color var(--dur-fast) var(--ease-out), box-shadow var(--dur-base) var(--ease-out)`,
              cursor: "pointer",
            }}
          >
            {text}
          </button>
        );
      })}
    </div>
  );
}
