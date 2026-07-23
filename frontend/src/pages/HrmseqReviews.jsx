import { useEffect, useState, useMemo } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Plus } from "lucide-react";

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

  return (
    <div>
      <PageHeader title="Performance Reviews" subtitle="Employee performance evaluations."
        right={<button onClick={() => setModal(true)} className="btn-primary"><Plus size={14} /> New review</button>}
      />
      <div className="animate-fade-in px-6 sm:px-8 space-y-4">
        {reviews.length === 0 && <div className="text-body text-ink-muted">No reviews yet.</div>}
        {reviews.map((r) => (
          <div key={r.id} className="bg-white border border-line rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <div className="text-card-title font-display font-semibold">{empMap[r.employee_id] || r.employee_id}</div>
              <div className="text-section font-display font-bold">{r.rating}/5</div>
            </div>
            <div className="text-caption text-ink-muted mt-1">Reviewer: {empMap[r.reviewer_id] || r.reviewer_id}</div>
            {r.strengths && <div className="mt-3"><span className="ui-label">Strengths:</span><p className="text-body">{r.strengths}</p></div>}
            {r.areas_for_improvement && <div className="mt-2"><span className="ui-label">To improve:</span><p className="text-body">{r.areas_for_improvement}</p></div>}
            <div className="text-tiny text-ink-muted mt-2">Status: {r.status} · {r.created_at?.slice(0, 10)}</div>
          </div>
        ))}
      </div>
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="text-card-title font-display font-semibold mb-4">New Performance Review</div>
            <form onSubmit={save} className="space-y-4">
              <select className="inp w-full" value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })} required>
                <option value="">Select employee</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
              </select>
              <select className="inp w-full" value={form.reviewer_id} onChange={(e) => setForm({ ...form, reviewer_id: e.target.value })} required>
                <option value="">Select reviewer</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
              </select>
              <div>
                <label className="ui-label">Rating (1-5)</label>
                <div className="flex gap-2 mt-1">
                  {[1,2,3,4,5].map((n) => (
                    <button key={n} type="button" className={`w-10 h-10 rounded-full border ${parseInt(form.rating) === n ? "bg-accent text-white border-accent" : "border-line"}`} onClick={() => setForm({ ...form, rating: String(n) })}>{n}</button>
                  ))}
                </div>
              </div>
              <textarea className="inp w-full h-20" placeholder="Strengths" value={form.strengths} onChange={(e) => setForm({ ...form, strengths: e.target.value })} />
              <textarea className="inp w-full h-20" placeholder="Areas for improvement" value={form.areas_for_improvement} onChange={(e) => setForm({ ...form, areas_for_improvement: e.target.value })} />
              <textarea className="inp w-full h-20" placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
