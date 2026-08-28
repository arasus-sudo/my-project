import { useMemo } from "react";
import { Clock, AlertTriangle } from "../../icons";
import { statusMeta, isOverdue } from "./constants";

/* GanttView — horizontal timeline with bars. No external Gantt lib: the suite
 * already ships date-fns, and a 60-line grid is easier to theme than wrapping
 * frappe-gantt and fighting its CSS. Dependencies are shown as a small label;
 * critical path is highlighted. Unscheduled tasks are listed below the grid.
 */

function parseDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

function daysBetween(a, b) {
  const ms = b.getTime() - a.getTime();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function fmtDay(d) {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function criticalPathIds(tasks) {
  // Longest path via depends_on (DAG). Simple DP over topological order.
  const byId = Object.fromEntries(tasks.map((t) => [t.id, t]));
  const memo = {};
  const visiting = new Set();
  function longest(id) {
    if (memo[id] !== undefined) return memo[id];
    if (visiting.has(id)) return 0; // cycle guard
    visiting.add(id);
    const t = byId[id];
    if (!t || !t.depends_on || t.depends_on.length === 0) {
      memo[id] = 1;
      visiting.delete(id);
      return 1;
    }
    let best = 0;
    for (const dep of t.depends_on) {
      if (byId[dep]) best = Math.max(best, longest(dep));
    }
    memo[id] = best + 1;
    visiting.delete(id);
    return memo[id];
  }
  let maxLen = 0;
  const lens = {};
  for (const t of tasks) {
    const l = longest(t.id);
    lens[t.id] = l;
    maxLen = Math.max(maxLen, l);
  }
  // Reconstruct one longest path
  const path = new Set();
  let cur = tasks.find((t) => lens[t.id] === maxLen);
  while (cur) {
    path.add(cur.id);
    const deps = (cur.depends_on || []).filter((d) => byId[d]);
    if (deps.length === 0) break;
    // pick dep with longest lens
    deps.sort((a, b) => (lens[b] || 0) - (lens[a] || 0));
    cur = byId[deps[0]];
  }
  return path;
}

export default function GanttView({ project, tasks, nowIso, onOpen }) {
  const { scheduled, unscheduled, range, crit } = useMemo(() => {
    const withDates = tasks.filter((t) => parseDate(t.start_at) || parseDate(t.due_at));
    const without = tasks.filter((t) => !parseDate(t.start_at) && !parseDate(t.due_at));
    if (withDates.length === 0) {
      return { scheduled: [], unscheduled: without, range: null, crit: new Set() };
    }
    const dates = withDates.flatMap((t) => [parseDate(t.start_at), parseDate(t.due_at)].filter(Boolean));
    const min = new Date(Math.min(...dates.map((d) => d.getTime())));
    const max = new Date(Math.max(...dates.map((d) => d.getTime())));
    // Pad range by 2 days each side for breathing room
    const start = addDays(min, -2);
    const end = addDays(max, 2);
    const totalDays = Math.max(7, daysBetween(start, end));
    return {
      scheduled: withDates,
      unscheduled: without,
      range: { start, end, totalDays },
      crit: criticalPathIds(withDates),
    };
  }, [tasks]);

  if (!range) {
    return (
      <div className="py-8 text-center" style={{ color: "var(--text-tertiary)", fontSize: 13 }}>
        No tasks have dates yet. Add a start or due date to see them on the timeline.
        {unscheduled.length > 0 && (
          <div className="mt-4 text-left max-w-md mx-auto">
            <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>Unscheduled</div>
            {unscheduled.map((t) => (
              <button key={t.id} type="button" onClick={() => onOpen(t)} data-testid={`gantt-unsched-${t.id}`}
                className="w-full text-left truncate" style={{ padding: "6px 8px", fontSize: 13, color: "var(--text-primary)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", marginBottom: 4 }}>
                {t.key}-{t.number} · {t.title}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  const { start, totalDays } = range;
  const dayW = 32; // px per day

  return (
    <div className="overflow-x-auto scrollbar-thin" data-testid="proj-gantt" style={{ border: "1px solid var(--border-default)", borderRadius: "var(--radius-lg)", background: "var(--bg-surface)" }}>
      {/* Header */}
      <div className="flex" style={{ minWidth: totalDays * dayW + 220, borderBottom: "1px solid var(--border-default)", background: "var(--bg-surface-sunken)" }}>
        <div style={{ width: 220, flexShrink: 0, padding: "8px 10px", fontSize: 11.5, fontWeight: 600, color: "var(--text-tertiary)" }}>Task</div>
        <div className="flex">
          {Array.from({ length: totalDays }, (_, i) => {
            const d = addDays(start, i);
            const isToday = d.toDateString() === new Date().toDateString();
            return (
              <div key={i} style={{
                width: dayW, flexShrink: 0, textAlign: "center", padding: "6px 0",
                fontSize: 10.5, color: isToday ? "var(--color-primary)" : "var(--text-tertiary)",
                fontWeight: isToday ? 700 : 400, borderLeft: i === 0 ? "none" : "1px solid var(--border-subtle)",
                background: isToday ? "var(--color-primary-subtle)" : "transparent",
              }}>
                {fmtDay(d)}
              </div>
            );
          })}
        </div>
      </div>

      {/* Rows */}
      <div>
        {scheduled.map((t) => {
          const s = parseDate(t.start_at) || parseDate(t.due_at);
          const e = parseDate(t.due_at) || parseDate(t.start_at);
          const sIdx = Math.max(0, daysBetween(start, s));
          const eIdx = Math.max(sIdx + 1, daysBetween(start, e) + 1);
          const left = sIdx * dayW;
          const width = Math.max(dayW - 4, (eIdx - sIdx) * dayW - 4);
          const overdue = isOverdue(t, nowIso);
          const isCrit = crit.has(t.id);
          return (
            <div key={t.id} className="flex items-center" style={{ minWidth: totalDays * dayW + 220, height: 36, borderBottom: "1px solid var(--border-subtle)" }}>
              <button type="button" onClick={() => onOpen(t)} data-testid={`gantt-row-${t.id}`}
                className="truncate text-left flex items-center gap-1.5" style={{ width: 220, flexShrink: 0, padding: "0 10px", fontSize: 12.5, color: "var(--text-primary)" }}>
                <span className="tnum" style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{t.key}-{t.number}</span>
                <span className="truncate" title={t.title}>{t.title}</span>
                {isCrit && <span title="Critical path" style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--color-danger)", flexShrink: 0 }} />}
                {t.depends_on && t.depends_on.length > 0 && <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>↳{t.depends_on.length}</span>}
              </button>
              <div className="relative flex-1" style={{ height: 36 }}>
                <div
                  title={`${t.title} · ${statusMeta(t.status).label}`}
                  style={{
                    position: "absolute", left, top: 8, width, height: 20, borderRadius: "var(--radius-sm)",
                    background: isCrit ? "var(--color-danger-subtle)" : `var(--color-${statusMeta(t.status).tone === "neutral" ? "neutral-status" : statusMeta(t.status).tone}-subtle)`,
                    border: `1px solid ${isCrit ? "var(--color-danger)" : `var(--color-${statusMeta(t.status).tone === "neutral" ? "neutral-status" : statusMeta(t.status).tone}-border)`}`,
                    display: "flex", alignItems: "center", padding: "0 6px", overflow: "hidden",
                  }}>
                  <span className="truncate" style={{ fontSize: 11, fontWeight: 500, color: overdue ? "var(--color-danger)" : "var(--text-primary)" }}>{t.title}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {unscheduled.length > 0 && (
        <div style={{ padding: "10px 12px", borderTop: "1px solid var(--border-default)", background: "var(--bg-surface-sunken)" }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>Unscheduled · {unscheduled.length}</div>
          <div className="flex flex-wrap gap-1.5">
            {unscheduled.map((t) => (
              <button key={t.id} type="button" onClick={() => onOpen(t)} data-testid={`gantt-unsched-${t.id}`}
                style={{ padding: "4px 8px", fontSize: 12, border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", background: "var(--bg-surface)", color: "var(--text-primary)" }}>
                {t.key}-{t.number}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
