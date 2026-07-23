import { useEffect, useState, useMemo, useCallback } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";

export default function HrmseqEmployees() {
  const [items, setItems] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "", phone: "", department_id: "", position: "", employment_type: "full_time", start_date: "" });

  const deptMap = useMemo(() => {
    const m = {};
    departments.forEach((d) => { m[d.id] = d.name; });
    return m;
  }, [departments]);

  const load = useCallback(() => api.get(`/hrms-eq/employees?page=${page}&page_size=25`).then((r) => { setItems(r.data.items); setTotal(r.data.total); }), [page]);
  useEffect(() => { const c = new AbortController(); load(); api.get("/hrms-eq/departments").then((r) => setDepartments(r.data)); return () => c.abort(); }, [page, load]);

  const save = async (e) => {
    e.preventDefault();
    try {
      await api.post("/hrms-eq/employees", form);
      toast.success("Employee added");
      setModal(false); setForm({ first_name: "", last_name: "", email: "", phone: "", department_id: "", position: "", employment_type: "full_time", start_date: "" });
      load();
    } catch (err) { toast.error(err.response?.data?.detail || "Save failed"); }
  };

  const totalPages = Math.ceil(total / 25);

  return (
    <div>
      <PageHeader title="Employees" subtitle="Manage your workforce."
        right={<button onClick={() => setModal(true)} className="btn-primary"><Plus size={14} /> Add employee</button>}
      />
      <div className="animate-fade-in px-6 sm:px-8 space-y-4">
        {items.length === 0 && <div className="text-body text-ink-muted">No employees yet.</div>}
        {items.length > 0 && (
          <div className="bg-white border border-line rounded-2xl overflow-hidden">
            <table className="w-full text-body">
              <thead><tr className="border-b border-line bg-ash text-left ui-label">
                <th className="p-3">Name</th><th className="p-3">Email</th><th className="p-3">Position</th><th className="p-3">Department</th><th className="p-3">Status</th>
              </tr></thead>
              <tbody>
                {items.map((e) => (
                  <tr key={e.id} className="border-b border-line last:border-0 hover:bg-ash/50">
                    <td className="p-3 font-medium">{e.first_name} {e.last_name}</td>
                    <td className="p-3 text-ink-muted">{e.email}</td>
                    <td className="p-3">{e.position}</td>
                    <td className="p-3 text-ink-muted">{deptMap[e.department_id] || "—"}</td>
                    <td className="p-3"><span className={`text-tiny px-1.5 py-0.5 rounded-full border ${e.status === "active" ? "text-success border-success/30" : "text-ink-muted border-line"}`}>{e.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn-secondary"><ChevronLeft size={14} /></button>
            <span className="text-body text-ink-muted">Page {page} of {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="btn-secondary"><ChevronRight size={14} /></button>
          </div>
        )}
      </div>
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="text-card-title font-display font-semibold mb-4">Add Employee</div>
            <form onSubmit={save} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <input className="inp" placeholder="First name" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} required />
                <input className="inp" placeholder="Last name" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} required />
              </div>
              <input className="inp w-full" type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
              <input className="inp w-full" placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <div className="grid grid-cols-2 gap-4">
                <select className="inp" value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })}>
                  <option value="">No department</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <select className="inp" value={form.employment_type} onChange={(e) => setForm({ ...form, employment_type: e.target.value })}>
                  <option value="full_time">Full-time</option><option value="part_time">Part-time</option><option value="contractor">Contractor</option><option value="intern">Intern</option>
                </select>
              </div>
              <input className="inp w-full" placeholder="Position" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} />
              <input className="inp w-full" type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
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
