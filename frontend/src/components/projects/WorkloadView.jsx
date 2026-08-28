import { useMemo } from "react";
import ProgressBar from "../composites/ProgressBar";

/* WorkloadView — per-assignee capacity. Hours are the sum of estimated_hours
 * for open tasks; the bar is capped at 40h/week (configurable via maxHours).
 * Over-allocation is highlighted in risk tone.
 */

export default function WorkloadView({ tasks, team }) {
  const rows = useMemo(() => {
    const byUser = {};
    for (const t of tasks) {
      if (t.status === "done") continue;
      const uid = t.assignee_id || "__unassigned";
      const e = byUser[uid] ||= { assignee_id: uid, hours: 0, tasks: 0, overdue: 0 };
      e.hours += Number(t.estimated_hours || 0);
      e.tasks += 1;
      if (t.due_at && !t.completed_at && t.due_at < new Date().toISOString()) e.overdue += 1;
    }
    const names = Object.fromEntries((team || []).map((u) => [u.id, u.name || u.email]));
    return Object.values(byUser)
      .map((r) => ({ ...r, assignee_name: r.assignee_id === "__unassigned" ? "Unassigned" : (names[r.assignee_id] || r.assignee_id.slice(0, 8)) }))
      .sort((a, b) => b.hours - a.hours);
  }, [tasks, team]);

  if (rows.length === 0) {
    return <div className="py-8 text-center" style={{ fontSize: 13, color: "var(--text-tertiary)" }}>No open tasks to show workload for.</div>;
  }

  const maxHours = 40;

  return (
    <div data-testid="proj-workload" className="space-y-3" style={{ border: "1px solid var(--border-default)", borderRadius: "var(--radius-lg)", background: "var(--bg-surface)", padding: 12 }}>
      {rows.map((r) => {
        const pct = Math.min(100, (r.hours / maxHours) * 100);
        const over = r.hours > maxHours;
        return (
          <div key={r.assignee_id} className="flex items-center gap-3">
            <div style={{ width: 140, flexShrink: 0, fontSize: 13, fontWeight: 500, color: "var(--text-primary)", fontFamily: "var(--font-ui)" }} className="truncate" title={r.assignee_name}>
              {r.assignee_name}
            </div>
            <div className="flex-1">
              <ProgressBar segments={[{ value: Math.min(r.hours, maxHours), color: over ? "var(--color-danger)" : "var(--color-primary)" }]} total={maxHours} />
            </div>
            <span className="tnum" style={{ width: 80, textAlign: "right", fontSize: 12, color: over ? "var(--color-danger)" : "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
              {r.hours.toFixed(1)}h · {r.tasks} tasks{r.overdue ? ` · ${r.overdue} overdue` : ""}
            </span>
          </div>
        );
      })}
      <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 8 }}>Capacity is 40h/week. Over-allocation is highlighted in red.</div>
    </div>
  );
}
