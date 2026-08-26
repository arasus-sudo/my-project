/* Projects domain vocabulary — one place mapping board values to design-system
 * tones (§4.3), so Kanban, List, and the drawer all render a status the same
 * way. Keep in sync with backend/projects.py DEFAULT_STATUSES / PRIORITIES.
 */

export const STATUS_META = [
  { value: "backlog", label: "Backlog", tone: "neutral" },
  { value: "todo", label: "To do", tone: "warning" },
  { value: "in_progress", label: "In progress", tone: "primary" },
  { value: "review", label: "Review", tone: "risk" },
  { value: "done", label: "Done", tone: "success" },
];

export const PRIORITY_META = [
  { value: "urgent", label: "Urgent", tone: "danger" },
  { value: "high", label: "High", tone: "warning" },
  { value: "medium", label: "Medium", tone: "primary" },
  { value: "low", label: "Low", tone: "neutral" },
];

const statusMap = Object.fromEntries(STATUS_META.map((s) => [s.value, s]));
const priorityMap = Object.fromEntries(PRIORITY_META.map((p) => [p.value, p]));

export const statusMeta = (v) => statusMap[v] || { value: v, label: v, tone: "neutral" };
export const priorityMeta = (v) => priorityMap[v] || { value: v, label: v, tone: "neutral" };

/** ISO strings compare correctly as text — same format everywhere (backend now_iso). */
export const isOverdue = (task, nowIso) =>
  Boolean(task.due_at) && !task.completed_at && task.due_at < nowIso;

export const fmtDate = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

/** Assignee avatar initials ("Arasu S" -> "AS"). */
export const initials = (name) =>
  (name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("") || "?";
