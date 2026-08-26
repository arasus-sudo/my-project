import Table from "../composites/Table";
import StatusPill from "../primitives/StatusPill";
import { MessageSquare, Clock, Flame } from "../../icons";
import { statusMeta, priorityMeta, isOverdue, fmtDate, initials } from "./constants";

/* TaskList — §11 table rendering of the same tasks the board shows. Sorting
 * stays server-order (manual board order); filters live in the page header.
 */

export default function TaskList({ tasks, nowIso, onOpen }) {
  const columns = [
    {
      key: "title", label: "Task",
      render: (t) => (
        <button type="button" onClick={() => onOpen(t)} data-testid={`proj-row-${t.id}`}
          className="text-left" style={{ color: "var(--text-primary)" }}>
          <div className="flex items-center gap-2">
            <span className="tnum" style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-tertiary)", flexShrink: 0 }}>
              {t.key}-{t.number}
            </span>
            <span style={{ fontSize: 13, fontWeight: 500, fontFamily: "var(--font-ui)" }}
              className="truncate" title={t.title}>{t.title}</span>
          </div>
        </button>
      ),
    },
    {
      key: "status", label: "Status",
      render: (t) => <StatusPill tone={statusMeta(t.status).tone}>{statusMeta(t.status).label}</StatusPill>,
    },
    {
      key: "priority", label: "Priority",
      render: (t) => {
        const p = priorityMeta(t.priority);
        return (
          <span className="inline-flex items-center gap-1.5">
            {(t.priority === "urgent" || t.priority === "high") && (
              <Flame size={12} strokeWidth={1.5} aria-hidden="true"
                style={{ color: `var(--color-${p.tone === "danger" ? "danger" : "warning"})` }} />
            )}
            <StatusPill tone={p.tone}>{p.label}</StatusPill>
          </span>
        );
      },
    },
    {
      key: "assignee", label: "Assignee",
      render: (t) => t.assignee_name || <span style={{ color: "var(--text-tertiary)" }}>Unassigned</span>,
    },
    {
      key: "due_at", label: "Due",
      render: (t) => {
        const overdue = isOverdue(t, nowIso);
        return t.due_at ? (
          <span className="inline-flex items-center gap-1 tnum" style={{
            fontSize: 12.5, fontFamily: "var(--font-mono)",
            color: overdue ? "var(--color-danger)" : "var(--text-secondary)",
            fontWeight: overdue ? 600 : 400,
          }}>
            <Clock size={12} strokeWidth={1.5} aria-hidden="true" />
            {fmtDate(t.due_at)}
          </span>
        ) : <span style={{ color: "var(--text-tertiary)" }}>—</span>;
      },
    },
    {
      key: "comments", label: "",
      align: "right",
      render: (t) => (t.comment_count || 0) > 0 ? (
        <span className="inline-flex items-center gap-1 tnum" style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
          <MessageSquare size={12} strokeWidth={1.5} aria-hidden="true" />
          {t.comment_count}
        </span>
      ) : null,
    },
  ];

  return (
    <Table
      columns={columns}
      rows={tasks}
      rowKey={(t) => t.id}
      density="compact"
      onRowClick={onOpen}
      data-testid="proj-list"
    />
  );
}
