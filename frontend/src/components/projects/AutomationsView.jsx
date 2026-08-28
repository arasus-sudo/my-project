import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { toast } from "sonner";
import Button from "../primitives/Button";
import Input from "../primitives/Input";
import Select from "../primitives/Select";
import { Plus, Trash2, Zap } from "../../icons";
import { EmptyState } from "../composites/EmptyState";

/* AutomationsView — When → Do rule builder. v1 is CRUD only; execution
 * via a tick will be added once the first few rules prove useful.
 */

const TRIGGER_OPTIONS = [
  { value: "task.created", label: "Task created" },
  { value: "task.moved", label: "Task moved" },
  { value: "task.completed", label: "Task completed" },
  { value: "task.overdue", label: "Task overdue" },
  { value: "comment.added", label: "Comment added" },
];

const ACTION_OPTIONS = [
  { value: "assign", label: "Assign to user" },
  { value: "notify", label: "Notify assignee" },
  { value: "set_status", label: "Set status" },
  { value: "add_tag", label: "Add tag" },
  { value: "create_task", label: "Create task" },
];

export default function AutomationsView({ project }) {
  const [items, setItems] = useState([]);
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState("task.created");
  const [actionType, setActionType] = useState("notify");

  const load = async () => {
    try {
      const { data } = await api.get(`/projects/${project.id}/automations`);
      setItems(data || []);
    } catch {}
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [project.id]);

  const create = async () => {
    const n = name.trim();
    if (!n) return;
    try {
      await api.post(`/projects/${project.id}/automations`, {
        name: n, trigger: { event: trigger }, actions: [{ type: actionType, params: {} }], enabled: true,
      });
      setName("");
      load();
      toast.success("Automation created");
    } catch (err) { toast.error(err?.response?.data?.detail || "Create failed"); }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this automation?")) return;
    try {
      await api.delete(`/projects/${project.id}/automations/${id}`);
      load();
    } catch { toast.error("Delete failed"); }
  };

  const toggle = async (it) => {
    try {
      await api.put(`/projects/${project.id}/automations/${it.id}`, { enabled: !it.enabled });
      load();
    } catch { toast.error("Toggle failed"); }
  };

  return (
    <div data-testid="proj-automations" className="space-y-4">
      <div className="flex items-end gap-2 flex-wrap" style={{ border: "1px solid var(--border-default)", borderRadius: "var(--radius-lg)", background: "var(--bg-surface)", padding: 12 }}>
        <Input size="sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="Automation name…" className="w-48" data-testid="proj-auto-name" />
        <Select size="sm" value={trigger} onChange={setTrigger} options={TRIGGER_OPTIONS} className="w-40" />
        <span style={{ color: "var(--text-tertiary)" }}>→</span>
        <Select size="sm" value={actionType} onChange={setActionType} options={ACTION_OPTIONS} className="w-40" />
        <Button variant="primary" size="sm" icon={Plus} onClick={create} isDisabled={!name.trim()} data-testid="proj-auto-create">Add</Button>
      </div>

      {items.length === 0 ? (
        <EmptyState icon={Zap} title="No automations yet" description="When a task is created, moved, or completed — do something automatically." />
      ) : (
        <div className="space-y-2">
          {items.map((it) => (
            <div key={it.id} className="flex items-center gap-3" style={{ border: "1px solid var(--border-default)", borderRadius: "var(--radius-lg)", background: "var(--bg-surface)", padding: "10px 12px" }}>
              <Zap size={14} strokeWidth={1.5} style={{ color: it.enabled ? "var(--color-primary)" : "var(--text-tertiary)" }} />
              <div className="flex-1 min-w-0">
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{it.name}</div>
                <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>When <b>{it.trigger?.event}</b> → {it.actions?.map((a) => a.type).join(", ")}</div>
              </div>
              <Button variant="tertiary" size="xs" onClick={() => toggle(it)}>{it.enabled ? "Disable" : "Enable"}</Button>
              <Button variant="danger-subtle" size="xs" icon={Trash2} onClick={() => remove(it.id)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
