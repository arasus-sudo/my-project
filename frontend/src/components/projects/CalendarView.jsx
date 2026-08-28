import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "../../icons";

/* CalendarView — month grid of due dates. Tasks without due_at are omitted
 * (they live in the Gantt unscheduled bucket). Click a task to open the drawer.
 */

function startOfMonth(d) { const r = new Date(d); r.setDate(1); r.setHours(0,0,0,0); return r; }
function daysInMonth(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); }
function weekday(d) { return (d.getDay() + 6) % 7; } // Mon=0

export default function CalendarView({ tasks, onOpen }) {
  const [cursor, setCursor] = useState(() => new Date());
  const monthStart = startOfMonth(cursor);
  const dim = daysInMonth(cursor);
  const offset = weekday(monthStart);
  const cells = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) cells.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));

  const byDay = useMemo(() => {
    const m = {};
    for (const t of tasks) {
      if (!t.due_at) continue;
      const d = new Date(t.due_at);
      if (isNaN(d.getTime())) continue;
      // Only include tasks in current month view for performance
      if (d.getMonth() !== cursor.getMonth() || d.getFullYear() !== cursor.getFullYear()) continue;
      const key = d.toDateString();
      (m[key] ||= []).push(t);
    }
    return m;
  }, [tasks, cursor]);

  const todayStr = new Date().toDateString();

  return (
    <div data-testid="proj-calendar" style={{ border: "1px solid var(--border-default)", borderRadius: "var(--radius-lg)", background: "var(--bg-surface)", overflow: "hidden" }}>
      <div className="flex items-center justify-between" style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-default)" }}>
        <button type="button" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
          className="inline-grid place-items-center" style={{ width: 28, height: 28, borderRadius: "var(--radius-md)" }}>
          <ChevronLeft size={16} strokeWidth={1.5} />
        </button>
        <span style={{ fontSize: 13, fontWeight: 600, fontFamily: "var(--font-ui)", color: "var(--text-primary)" }}>
          {cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </span>
        <button type="button" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
          className="inline-grid place-items-center" style={{ width: 28, height: 28, borderRadius: "var(--radius-md)" }}>
          <ChevronRight size={16} strokeWidth={1.5} />
        </button>
      </div>

      <div className="grid grid-cols-7" style={{ background: "var(--bg-surface-sunken)", borderBottom: "1px solid var(--border-default)" }}>
        {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((w) => (
          <div key={w} style={{ padding: "6px 0", textAlign: "center", fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)" }}>{w}</div>
        ))}
      </div>

      <div className="grid grid-cols-7" style={{ minHeight: 380 }}>
        {cells.map((d, i) => {
          if (!d) return <div key={i} style={{ minHeight: 90, borderRight: "1px solid var(--border-subtle)", borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-surface-sunken)" }} />;
          const key = d.toDateString();
          const dayTasks = byDay[key] || [];
          const isToday = key === todayStr;
          return (
            <div key={i} style={{ minHeight: 90, borderRight: "1px solid var(--border-subtle)", borderBottom: "1px solid var(--border-subtle)", padding: 6, background: isToday ? "var(--color-primary-subtle)" : "var(--bg-surface)" }}>
              <div className="tnum" style={{ fontSize: 11, fontWeight: isToday ? 700 : 400, color: isToday ? "var(--color-primary)" : "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{d.getDate()}</div>
              <div className="flex flex-col gap-1" style={{ marginTop: 4 }}>
                {dayTasks.slice(0, 4).map((t) => (
                  <button key={t.id} type="button" onClick={() => onOpen(t)} data-testid={`cal-task-${t.id}`}
                    className="truncate text-left" style={{ fontSize: 11, padding: "2px 6px", borderRadius: "var(--radius-sm)", background: "var(--color-primary-subtle)", color: "var(--text-primary)", border: "1px solid var(--color-primary-border)" }}>
                    {t.key}-{t.number} {t.title.slice(0, 18)}
                  </button>
                ))}
                {dayTasks.length > 4 && <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>+{dayTasks.length - 4} more</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
