import { useState } from "react";
import { Clock, MessageSquare, Flame } from "../../icons";
import { statusMeta, priorityMeta, isOverdue, fmtDate, initials } from "./constants";

/* KanbanBoard — §13 board. Native HTML5 drag-and-drop (no DnD library): the
 * card writes its id on dragstart, a column highlights on dragover and claims
 * the drop. Cross-column moves bubble up via onMove(taskId, status); ordering
 * within a column stays creation-order for v1.
 */

function TaskCard({ task, nowIso, onOpen }) {
  const prio = priorityMeta(task.priority);
  const overdue = isOverdue(task, nowIso);
  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/task-id", task.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={() => onOpen(task)}
      data-testid={`proj-card-${task.id}`}
      className="w-full text-left block"
      style={{
        background: "var(--bg-surface)", border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-lg)", padding: "10px 12px", cursor: "grab",
        boxShadow: "var(--shadow-xs)",
        transition: "box-shadow var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out)",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--border-strong, var(--border-default))"; e.currentTarget.style.boxShadow = "var(--shadow-sm)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-default)"; e.currentTarget.style.boxShadow = "var(--shadow-xs)"; }}
    >
      <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
        <span className="tnum" style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-tertiary)" }}>
          {task.key}-{task.number}
        </span>
        {(task.priority === "urgent" || task.priority === "high") && (
          <Flame size={12} strokeWidth={1.5} aria-hidden="true"
            style={{ color: `var(--color-${prio.tone === "danger" ? "danger" : "warning"})` }} />
        )}
      </div>
      <div style={{
        fontSize: 13, fontWeight: 500, color: "var(--text-primary)", fontFamily: "var(--font-ui)",
        lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
      }}>
        {task.title}
      </div>
      {(task.tags || []).length > 0 && (
        <div className="flex flex-wrap gap-1" style={{ marginTop: 6 }}>
          {task.tags.slice(0, 3).map((t) => (
            <span key={t} style={{
              fontSize: 10.5, padding: "1px 6px", borderRadius: "var(--radius-sm)",
              background: "var(--bg-surface-sunken)", color: "var(--text-secondary)", fontFamily: "var(--font-ui)",
            }}>{t}</span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2" style={{ marginTop: 8 }}>
        {task.due_at && (
          <span className="inline-flex items-center gap-1" style={{
            fontSize: 11, fontFamily: "var(--font-ui)",
            color: overdue ? "var(--color-danger)" : "var(--text-tertiary)",
            fontWeight: overdue ? 600 : 400,
          }}>
            <Clock size={12} strokeWidth={1.5} aria-hidden="true" />
            {fmtDate(task.due_at)}
          </span>
        )}
        {(task.comment_count || 0) > 0 && (
          <span className="inline-flex items-center gap-1 tnum" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
            <MessageSquare size={12} strokeWidth={1.5} aria-hidden="true" />
            {task.comment_count}
          </span>
        )}
        <span className="ml-auto inline-grid place-items-center" title={task.assignee_name || "Unassigned"}
          style={{
            width: 22, height: 22, borderRadius: "var(--radius-full)",
            background: task.assignee_id ? "var(--color-primary-subtle)" : "var(--bg-surface-sunken)",
            color: task.assignee_id ? "var(--color-primary)" : "var(--text-tertiary)",
            fontSize: 9.5, fontWeight: 700, fontFamily: "var(--font-ui)",
          }}>
          {task.assignee_id ? initials(task.assignee_name) : "—"}
        </span>
      </div>
    </button>
  );
}

export default function KanbanBoard({ project, tasks, nowIso, onMove, onOpen }) {
  const [dragOver, setDragOver] = useState(null);
  const statuses = project.statuses || [];

  const byStatus = Object.fromEntries(statuses.map((s) => [s, []]));
  for (const t of tasks) {
    (byStatus[t.status] !== undefined ? byStatus[t.status] : (byStatus[statuses[0]] ||= [])).push(t);
  }

  const drop = (status) => (e) => {
    e.preventDefault();
    setDragOver(null);
    const id = e.dataTransfer.getData("text/task-id");
    const task = tasks.find((t) => t.id === id);
    if (id && task && task.status !== status) onMove(task, status);
  };

  return (
    <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-thin" data-testid="proj-kanban">
      {statuses.map((s) => {
        const meta = statusMeta(s);
        const items = byStatus[s];
        const active = dragOver === s;
        return (
          <div key={s}
            onDragOver={(e) => { e.preventDefault(); setDragOver(s); }}
            onDragLeave={() => setDragOver((cur) => (cur === s ? null : cur))}
            onDrop={drop(s)}
            data-testid={`proj-col-${s}`}
            style={{
              width: 272, flexShrink: 0, borderRadius: "var(--radius-xl)", padding: 8,
              background: active ? "var(--bg-selected)" : "var(--bg-surface-sunken)",
              border: `1px dashed ${active ? "var(--color-primary-border)" : "transparent"}`,
              transition: "background-color var(--dur-fast) var(--ease-out)",
              maxHeight: "calc(100vh - 260px)",
            }}>
            <div className="flex items-center gap-2" style={{ padding: "2px 4px 8px" }}>
              <span aria-hidden="true" style={{
                width: 7, height: 7, borderRadius: "var(--radius-full)", flexShrink: 0,
                background: `var(--color-${meta.tone === "neutral" ? "neutral-status" : meta.tone})`,
              }} />
              <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)", fontFamily: "var(--font-ui)" }}>
                {meta.label}
              </span>
              <span className="tnum" style={{ fontSize: 11, color: "var(--text-tertiary)", marginLeft: "auto", fontFamily: "var(--font-mono)" }}>
                {items.length}
              </span>
            </div>
            <div className="flex flex-col gap-2 overflow-y-auto scrollbar-thin" style={{ maxHeight: "calc(100vh - 300px)" }}>
              {items.map((t) => <TaskCard key={t.id} task={t} nowIso={nowIso} onOpen={onOpen} />)}
              {items.length === 0 && !active && (
                <div style={{
                  border: "1px dashed var(--border-default)", borderRadius: "var(--radius-lg)",
                  padding: "18px 10px", textAlign: "center", fontSize: 11.5, color: "var(--text-tertiary)",
                }}>
                  Drop tasks here
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
