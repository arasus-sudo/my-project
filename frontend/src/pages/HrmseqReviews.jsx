import { useEffect, useState, useMemo } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Plus } from "../icons";
import Card from "../components/composites/Card";
import { EmptyState } from "../components/composites/EmptyState";
import { Modal, ModalContent } from "../components/composites/Modal";
import Input from "../components/primitives/Input";
import Select from "../components/primitives/Select";
import Button from "../components/primitives/Button";

export default function HrmseqReviews() {
  const [reviews, setReviews] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ employee_id: "", reviewer_id: "", rating: "3", strengths: "", areas_for_improvement: "", notes: "" });

  const empMap = useMemo(() => {
    const m = {};
    employees.forEach((e) => { m[e.id] = `${e.first_name || ""} ${e.last_name || ""}`.trim(); });
    return m;
  }, [employees]);

  const load = () => api.get("/hrms-eq/performance-reviews").then((r) => setReviews(r.data));
  useEffect(() => {
    load();
    api.get("/hrms-eq/employees").then((r) => setEmployees(r.data.items || r.data));
  }, []);

  const save = async (e) => {
    e.preventDefault();
    try {
      await api.post("/hrms-eq/performance-reviews", { ...form, rating: parseInt(form.rating) });
      toast.success("Review saved");
      setModal(false); setForm({ employee_id: "", reviewer_id: "", rating: "3", strengths: "", areas_for_improvement: "", notes: "" });
      load();
    } catch { toast.error("Save failed"); }
  };

  const employeeOptions = employees.map((e) => ({ value: e.id, label: `${e.first_name} ${e.last_name}` }));

  return (
    <div>
      <PageHeader title="Performance Reviews" subtitle="Employee performance evaluations."
        right={<Button variant="primary" icon={Plus} onClick={() => setModal(true)}>New review</Button>}
      />
      <div className="animate-fade-in px-6 sm:px-8 py-6 space-y-3">
        {reviews.length === 0 ? (
          <EmptyState title="No reviews yet" description="Record a performance review for an employee."
            actionLabel="New review" onAction={() => setModal(true)} />
        ) : reviews.map((r) => (
          <Card key={r.id}>
            <div className="flex items-center justify-between">
              <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>{empMap[r.employee_id] || r.employee_id}</div>
              <div className="tnum" style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>{r.rating}/5</div>
            </div>
            <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginTop: 4 }}>Reviewer: {empMap[r.reviewer_id] || r.reviewer_id}</div>
            {r.strengths && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-tertiary)" }}>Strengths</div>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>{r.strengths}</p>
              </div>
            )}
            {r.areas_for_improvement && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-tertiary)" }}>To improve</div>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>{r.areas_for_improvement}</p>
              </div>
            )}
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 10 }}>Status: {r.status} · {r.created_at?.slice(0, 10)}</div>
          </Card>
        ))}
      </div>

      <Modal open={modal} onOpenChange={setModal}>
        <ModalContent size="sm" title="New Performance Review"
          footer={
            <>
              <Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
              <Button variant="primary" type="submit" form="hrms-review-form">Save</Button>
            </>
          }
        >
          <form id="hrms-review-form" onSubmit={save} className="space-y-3">
            <Select required label="Employee" value={form.employee_id} onChange={(v) => setForm({ ...form, employee_id: v })}
              options={[{ value: "", label: "Select employee" }, ...employeeOptions]} />
            <Select required label="Reviewer" value={form.reviewer_id} onChange={(v) => setForm({ ...form, reviewer_id: v })}
              options={[{ value: "", label: "Select reviewer" }, ...employeeOptions]} />
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--text-primary)", marginBottom: 6 }}>Rating (1-5)</label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" onClick={() => setForm({ ...form, rating: String(n) })}
                    style={{
                      width: 40, height: 40, borderRadius: "var(--radius-full)", fontSize: 13, fontWeight: 500,
                      border: `1px solid ${parseInt(form.rating) === n ? "var(--color-primary)" : "var(--border-default)"}`,
                      background: parseInt(form.rating) === n ? "var(--color-primary)" : "var(--bg-surface)",
                      color: parseInt(form.rating) === n ? "#fff" : "var(--text-primary)",
                    }}>{n}</button>
                ))}
              </div>
            </div>
            <Input as="textarea" rows={3} label="Strengths" value={form.strengths} onChange={(e) => setForm({ ...form, strengths: e.target.value })} />
            <Input as="textarea" rows={3} label="Areas for improvement" value={form.areas_for_improvement} onChange={(e) => setForm({ ...form, areas_for_improvement: e.target.value })} />
            <Input as="textarea" rows={3} label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </form>
        </ModalContent>
      </Modal>
    </div>
  );
}
