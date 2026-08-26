import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { toast } from "sonner";
import Button from "../primitives/Button";
import Input from "../primitives/Input";
import Select from "../primitives/Select";
import StatusPill from "../primitives/StatusPill";
import {
  X, Trash2, CheckCircle2, MessageSquare, Plus, Clock,
} from "../../icons";
import { STATUS_META, PRIORITY_META, statusMeta, isOverdue, fmtDate, initials } from "./constants";

/* TaskDrawer — the one surface where a task is read AND edited. Slides over
 * from the right (§7 pattern used by CampaignBuilder's lightbox), closes on
 * overlay click / Escape / X. Subtasks and comments live here so the board
 * card stays scannable.
 */

const fieldLabel = { display: "block", fontSize: 12.5, fontWeight: 500, color: "var(--text-secondary)", fontFamily: "var(--font-ui)", marginBottom: 5 };

export default function TaskDrawer({ project, task, team, onClose, onChanged, onDeleted }) {
  const [draft, setDraft] = useState(task);
  const [subtasks, setSubtasks] = useState([]);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState("");
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    try {
      const [subsRes, comRes] = await Promise.all([
        api.get(`/projects/${project.id}/tasks`).catch(() => ({ data: [] })),
        api.get(`/projects/${project.id}/comments`, { params: { task_id: task.id } }).catch(() => ({ data: [] })),
      ]);
      setSubtasks((subsRes.data || []).filter((t) => t.parent_task_id === task.id));
      setComments(comRes.data || []);
    } catch { /* drawer still usable with stale lists */ }
  };

  useEffect(() => { setDraft(task); reload(); /* eslint-disable-next-line */ }, [task.id]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = async (patch) => {
    setSaving(true);
    try {
      const { data } = await api.put(`/projects/${project.id}/tasks/${task.id}`, patch);
      setDraft(data);
      onChanged(data);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Save failed");
    }
    setSaving(false);
  };

  // Field edits save on blur/change — no separate Save button to hunt for.
  const edit = (key) => (e) => {
    const value = e?.target ? e.target.value : e;
    setDraft((d) => ({ ...d, [key]: value }));
  };
  const commit = (key) => () => {
    if (draft[key] !== task[key]) save({ [key]: draft[key] ?? null });
  };

  const addSubtask = async () => {
    const title = subtaskTitle.trim();
    if (!title) return;
    try {
      await api.post(`/projects/${project.id}/tasks`, {
        title, parent_task_id: task.id, status: "todo", priority: "medium",
      });
      setSubtaskTitle("");
      reload();
      onChanged();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not add subtask");
    }
  };

  const toggleSubtask = async (st) => {
    try {
      await api.put(`/projects/${project.id}/tasks/${st.id}`, {
        status: st.status === "done" ? "todo" : "done",
      });
      reload();
      onChanged();
    } catch { toast.error("Update failed"); }
  };

  const removeSubtask = async (st) => {
    try {
      await api.delete(`/projects/${project.id}/tasks/${st.id}`);
      setSubtasks((s) => s.filter((x) => x.id !== st.id));
      onChanged();
    } catch { toast.error("Delete failed"); }
  };

  const addComment = async () => {
    const body = commentText.trim();
    if (!body) return;
    try {
      await api.post(`/projects/${project.id}/comments`, { task_id: task.id, body });
      setCommentText("");
      reload();
      onChanged();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Comment failed");
    }
  };

  const deleteTask = async () => {
    if (!window.confirm(`Delete ${draft.key}-${draft.number}? Its comments and subtasks go too.`)) return;
    try {
      await api.delete(`/projects/${project.id}/tasks/${task.id}`);
      toast.success("Task deleted");
      onDeleted(task.id);
    } catch { toast.error("Delete failed"); }
  };

  const doneSubs = subtasks.filter((s) => s.status === "done").length;
  const overdue = isOverdue(draft, new Date().toISOString());
  const statusOptions = (project.statuses || []).map((s) => ({ value: s, label: statusMeta(s).label }));
  const priorityOptions = PRIORITY_META.map((p) => ({ value: p.value, label: p.label }));

  return (
    <>
      <div className="fixed inset-0 z-40 animate-fade-in" style={{ background: "var(--bg-overlay)" }} onClick={onClose} />
      <aside
        className="fixed right-0 top-0 bottom-0 z-50 flex flex-col animate-slide-in-right"
        data-testid="proj-task-drawer"
        style={{
          width: 460, maxWidth: "100vw", background: "var(--bg-surface)",
          borderLeft: "1px solid var(--border-default)", boxShadow: "var(--shadow-lg)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2" style={{ padding: "14px 18px", borderBottom: "1px solid var(--border-default)" }}>
          <span className="tnum" style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--text-tertiary)" }}>
            {draft.key}-{draft.number}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <Button variant="danger-subtle" size="xs" icon={Trash2} onClick={deleteTask} data-testid="proj-task-delete">
              Delete
            </Button>
            <Button variant="tertiary" size="xs" icon={X} onClick={onClose} aria-label="Close" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin" style={{ padding: 18 }}>
          {/* Title */}
          <Input value={draft.title} onChange={edit("title")} onBlur={commit("title")}
            data-testid="proj-task-title" className="w-full" />

          {/* Meta grid */}
          <div className="grid grid-cols-2 gap-3" style={{ marginTop: 14 }}>
            <div>
              <label style={fieldLabel}>Status</label>
              <Select size="sm" options={statusOptions} value={draft.status}
                onChange={(v) => save({ status: v })} data-testid="proj-task-status" />
            </div>
            <div>
              <label style={fieldLabel}>Priority</label>
              <Select size="sm" options={priorityOptions} value={draft.priority}
                onChange={(v) => save({ priority: v })} data-testid="proj-task-priority" />
            </div>
            <div>
              <label style={fieldLabel}>Assignee</label>
              <Select size="sm" placeholder="Unassigned"
                options={[{ value: "", label: "Unassigned" },
                  ...team.map((m) => ({ value: m.id, label: m.name || m.email }))]}
                value={draft.assignee_id || ""}
                onChange={(v) => save({ assignee_id: v || null })} />
            </div>
            <div>
              <label style={fieldLabel}>Due date</label>
              <input type="date" value={(draft.due_at || "").slice(0, 10)}
                onChange={(e) => save({ due_at: e.target.value || null })}
                data-testid="proj-task-due"
                className="ds-input w-full"
                style={{
                  height: 34, padding: "0 10px", borderRadius: "var(--radius-md)",
                  border: `1px solid ${overdue ? "var(--color-danger)" : "var(--border-default)"}`,
                  background: "var(--bg-surface)", color: "var(--text-primary)", fontSize: 13.5,
                }} />
            </div>
          </div>

          {overdue && (
            <div className="flex items-center gap-1.5" style={{ marginTop: 8, fontSize: 12, color: "var(--color-danger)" }}>
              <Clock size={13} strokeWidth={1.5} aria-hidden="true" /> Overdue — was due {fmtDate(draft.due_at)}
            </div>
          )}

          {/* Description */}
          <div style={{ marginTop: 16 }}>
            <label style={fieldLabel}>Description</label>
            <textarea
              value={draft.description || ""}
              onChange={edit("description")}
              onBlur={commit("description")}
              rows={4}
              placeholder="Add context, acceptance criteria, links…"
              className="ds-input w-full scrollbar-thin"
              style={{
                padding: "8px 10px", borderRadius: "var(--radius-md)", resize: "vertical",
                background: "var(--bg-surface)", color: "var(--text-primary)", fontSize: 13.5,
              }}
            />
          </div>

          {/* Tags */}
          <div style={{ marginTop: 12 }}>
            <label style={fieldLabel}>Tags</label>
            <Input value={(draft.tags || []).join(", ")} size="sm"
              onChange={(e) => setDraft((d) => ({ ...d, tags: e.target.value.split(",") }))}
              onBlur={() => {
                const cleaned = draft.tags.map((t) => t.trim()).filter(Boolean);
                if (JSON.stringify(cleaned) !== JSON.stringify(task.tags)) save({ tags: cleaned });
              }}
              placeholder="design, q3, customer…" />
          </div>

          {/* Subtasks */}
          <div style={{ marginTop: 20 }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
              <label style={{ ...fieldLabel, marginBottom: 0 }}>
                Subtasks {subtasks.length > 0 && <span className="tnum" style={{ color: "var(--text-tertiary)" }}>({doneSubs}/{subtasks.length})</span>}
              </label>
            </div>
            <div className="flex flex-col gap-1.5">
              {subtasks.map((st) => (
                <div key={st.id} className="flex items-center gap-2 group">
                  <button type="button" onClick={() => toggleSubtask(st)} data-testid={`proj-subtask-${st.id}`}
                    aria-label={st.status === "done" ? "Reopen subtask" : "Complete subtask"}
                    className="inline-grid place-items-center shrink-0"
                    style={{
                      width: 18, height: 18, borderRadius: "var(--radius-sm)",
                      border: `1.5px solid ${st.status === "done" ? "var(--color-success)" : "var(--border-default)"}`,
                      background: st.status === "done" ? "var(--color-success-subtle)" : "transparent",
                      cursor: "pointer",
                    }}>
                    {st.status === "done" && <CheckCircle2 size={13} strokeWidth={1.75} aria-hidden="true" style={{ color: "var(--color-success)" }} />}
                  </button>
                  <span style={{
                    fontSize: 13, fontFamily: "var(--font-ui)",
                    color: st.status === "done" ? "var(--text-tertiary)" : "var(--text-primary)",
                    textDecoration: st.status === "done" ? "line-through" : "none",
                  }} className="truncate">{st.title}</span>
                  <button type="button" onClick={() => removeSubtask(st)} aria-label={`Delete ${st.title}`}
                    className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity inline-grid place-items-center shrink-0"
                    style={{ color: "var(--text-tertiary)" }}>
                    <Trash2 size={13} strokeWidth={1.5} aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2" style={{ marginTop: 8 }}>
              <Input size="sm" value={subtaskTitle} className="flex-1"
                onChange={(e) => setSubtaskTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addSubtask(); }}
                placeholder="Add a subtask…" data-testid="proj-subtask-input" />
              <Button variant="secondary" size="sm" icon={Plus} onClick={addSubtask}
                isDisabled={!subtaskTitle.trim()} />
            </div>
          </div>

          {/* Comments */}
          <div style={{ marginTop: 22 }}>
            <label className="flex items-center gap-1.5" style={fieldLabel}>
              <MessageSquare size={13} strokeWidth={1.5} aria-hidden="true" />
              Comments {comments.length > 0 && <span className="tnum">({comments.length})</span>}
            </label>
            <div className="flex flex-col gap-3" style={{ marginBottom: 10 }}>
              {comments.map((c) => (
                <div key={c.id} className="flex gap-2.5">
                  <span className="inline-grid place-items-center shrink-0" style={{
                    width: 26, height: 26, borderRadius: "var(--radius-full)",
                    background: "var(--color-primary-subtle)", color: "var(--color-primary)",
                    fontSize: 10, fontWeight: 700, fontFamily: "var(--font-ui)",
                  }}>{initials(c.author_name)}</span>
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>
                        {c.author_name}
                      </span>
                      <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                        {new Date(c.created_at).toLocaleString()}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                      {c.body}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-start gap-2">
              <textarea value={commentText} rows={2}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addComment(); } }}
                placeholder="Write a comment… (Enter to post)"
                className="ds-input flex-1 scrollbar-thin"
                style={{
                  padding: "8px 10px", borderRadius: "var(--radius-md)", resize: "none",
                  background: "var(--bg-surface)", color: "var(--text-primary)", fontSize: 13,
                }}
                data-testid="proj-comment-input" />
              <Button variant="secondary" size="sm" icon={MessageSquare} onClick={addComment}
                isLoading={false} isDisabled={!commentText.trim()} />
            </div>
          </div>

          <div style={{ marginTop: 24, fontSize: 11, color: "var(--text-tertiary)" }}>
            Created {new Date(draft.created_at).toLocaleDateString()}
            {draft.completed_at && <> · Completed {new Date(draft.completed_at).toLocaleString()}</>}
          </div>
        </div>

        {/* Footer status mirror */}
        <div className="flex items-center gap-2" style={{ padding: "10px 18px", borderTop: "1px solid var(--border-default)" }}>
          <StatusPill tone={statusMeta(draft.status).tone}>{statusMeta(draft.status).label}</StatusPill>
          <span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
            {saving ? "Saving…" : "Changes save automatically"}
          </span>
        </div>
      </aside>
    </>
  );
}
