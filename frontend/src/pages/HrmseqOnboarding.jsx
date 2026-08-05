import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Plus, CheckCircle2, CircleDashed } from "../icons";
import Card from "../components/composites/Card";
import { EmptyState } from "../components/composites/EmptyState";
import { Modal, ModalContent } from "../components/composites/Modal";
import Input from "../components/primitives/Input";
import Select from "../components/primitives/Select";
import Button from "../components/primitives/Button";

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
        right={<Button variant="primary" icon={Plus} onClick={() => setModal(true)}>New task</Button>}
      />
      <div className="animate-fade-in px-6 sm:px-8 py-6 space-y-3">
        {tasks.length === 0 ? (
          <EmptyState title="No onboarding tasks yet" description="Create a checklist item for a new hire."
            actionLabel="New task" onAction={() => setModal(true)} />
        ) : tasks.map((t) => (
          <Card key={t.id}>
            <div className="flex items-start gap-3">
              <button onClick={() => toggleStatus(t.id, t.status)} className="mt-0.5 shrink-0">
                {t.status === "completed"
                  ? <CheckCircle2 size={18} strokeWidth={1.5} aria-hidden="true" style={{ color: "var(--color-success)" }} />
                  : <CircleDashed size={18} strokeWidth={1.5} aria-hidden="true" style={{ color: "var(--text-tertiary)" }} />}
              </button>
              <div className="flex-1">
                <div style={{ fontSize: 13, fontWeight: 500, color: t.status === "completed" ? "var(--text-tertiary)" : "var(--text-primary)", textDecoration: t.status === "completed" ? "line-through" : "none" }}>{t.title}</div>
                {t.description && <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginTop: 4 }}>{t.description}</div>}
                <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>
                  {employees.find(e => e.id === t.employee_id) ? `${employees.find(e => e.id === t.employee_id).first_name} ${employees.find(e => e.id === t.employee_id).last_name}` : "—"}
                  {t.due_by ? ` · Due: ${t.due_by}` : ""}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Modal open={modal} onOpenChange={setModal}>
        <ModalContent size="sm" title="New Onboarding Task"
          footer={
            <>
              <Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
              <Button variant="primary" type="submit" form="hrms-onboarding-form">Create</Button>
            </>
          }
        >
          <form id="hrms-onboarding-form" onSubmit={save} className="space-y-3">
            <Input required label="Task title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <Input as="textarea" rows={3} label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <Select label="Employee" value={form.employee_id} onChange={(v) => setForm({ ...form, employee_id: v })}
              options={[{ value: "", label: "Select employee" }, ...employees.map((e) => ({ value: e.id, label: `${e.first_name} ${e.last_name}` }))]} />
            <Input type="date" label="Due by" value={form.due_by} onChange={(e) => setForm({ ...form, due_by: e.target.value })} />
          </form>
        </ModalContent>
      </Modal>
    </div>
  );
}
