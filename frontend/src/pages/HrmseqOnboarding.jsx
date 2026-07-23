import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Plus, CheckCircle2, Circle } from "lucide-react";

export default function HrmseqOnboarding() {
  const [tasks, setTasks] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ employee_id: "", title: "", description: "", assigned_to: "", due_by: "" });

  const load = () => api.get("/hrms-eq/onboarding-tasks").then((r) => setTasks(r.data));
  useEffect(() => { load(); api.get("/hrms-eq/employees").then((r) => setEmployees(r.data.items || r.data)); }, []);

  const save = async (e) => {
    e.preventDefault();
    try {
      await api.post("/hrms-eq/onboarding-tasks", form);
      toast.success("Task created");
      setModal(false); setForm({ employee_id: "", title: "", description: "", assigned_to: "", due_by: "" });
      load();
    } catch { toast.error("Save failed"); }
  };

  const toggleStatus = async (id, current) => {
    const newStatus = current === "completed" ? "pending" : "completed";
    try {
      await api.put(`/hrms-eq/onboarding-tasks/${id}`, { status: newStatus });
      load();
    } catch { toast.error("Update failed"); }
  };

  return (
    <div>
      <PageHeader title="Onboarding" subtitle="Onboarding checklists for new hires."
        right={<button onClick={() => setModal(true)} className="btn-primary"><Plus size={14} /> New task</button>}
      />
      <div className="animate-fade-in px-6 sm:px-8 space-y-3">
        {tasks.length === 0 && <div className="text-body text-ink-muted">No onboarding tasks yet.</div>}
        {tasks.map((t) => (
          <div key={t.id} className="bg-white border border-line rounded-2xl p-5 flex items-start gap-4">
            <button onClick={() => toggleStatus(t.id, t.status)} className="mt-0.5">
              {t.status === "completed" ? <CheckCircle2 size={18} className="text-success" /> : <Circle size={18} className="text-ink-muted" />}
            </button>
            <div className="flex-1">
              <div className={`text-body font-medium ${t.status === "completed" ? "line-through text-ink-muted" : ""}`}>{t.title}</div>
              {t.description && <div className="text-caption text-ink-muted mt-1">{t.description}</div>}
              <div className="text-tiny text-ink-muted mt-1">
                {employees.find(e => e.id === t.employee_id) ? `${employees.find(e => e.id === t.employee_id).first_name} ${employees.find(e => e.id === t.employee_id).last_name}` : "—"}
                {t.due_by ? ` · Due: ${t.due_by}` : ""}
              </div>
            </div>
          </div>
        ))}
      </div>
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="text-card-title font-display font-semibold mb-4">New Onboarding Task</div>
            <form onSubmit={save} className="space-y-4">
              <input className="inp w-full" placeholder="Task title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
              <textarea className="inp w-full h-20" placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              <select className="inp w-full" value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}>
                <option value="">Select employee</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
              </select>
              <input className="inp w-full" type="date" value={form.due_by} onChange={(e) => setForm({ ...form, due_by: e.target.value })} />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
