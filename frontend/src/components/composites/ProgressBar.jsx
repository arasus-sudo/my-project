/* Progress & workload bar — docs/design-system.md §12.6.
 * `segments`: [{ value, color, label }]. Single-segment usage passes one
 * item — the multi-segment "workload" case is the general form, a plain
 * progress bar is just its 1-segment special case.
 */

export default function ProgressBar({ segments, total, className = "" }) {
  const sum = segments.reduce((a, s) => a + s.value, 0);
  const max = total ?? sum;
  return (
    <div className={className}>
      <div className="flex" style={{ height: 8, borderRadius: "var(--radius-full)", background: "var(--bg-active)", overflow: "hidden", gap: 2 }}>
        {segments.map((s, i) => {
          const pct = max ? (s.value / max) * 100 : 0;
          return (
            <div
              key={s.label || i}
              style={{
                width: `${pct}%`, background: s.color || "var(--color-primary)",
                borderRadius: "var(--radius-full)", minWidth: pct > 0 ? 2 : 0,
              }}
              title={s.label ? `${s.label}: ${s.value}` : String(s.value)}
            />
          );
        })}
      </div>
      {total != null && (
        <div className="tnum text-right" style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginTop: 4 }}>
          {sum}/{total}
        </div>
      )}
    </div>
  );
}
