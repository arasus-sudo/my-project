import { useEffect, useState, useMemo } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Plus, Check, X } from "lucide-react";

export default function HrmseqLeave() {
  const [requests, setRequests] = useState([]);
  const [balances, setBalances] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ employee_id: "", leave_type: "vacation", start_date: "", end_date: "", reason: "" });

  const empMap = useMemo(() => {
    const m = {};
    employees.forEach((e) => { m[e.id] = `${e.first_name || ""} ${e.last_name || ""}`.trim(); });
    return m;
  }, [employees]);

  const load = () => {
    api.get("/hrms-eq/leave-requests").then((r) => setRequests(r.data));
    api.get("/hrms-eq/leave-balances").then((r) => setBalances(r.data));
  };
  useEffect(() => { load(); api.get("/hrms-eq/employees").then((r) => setEmployees(r.data.items || r.data)); }, []);

  const save = async (e) => {
    e.preventDefault();
    try {
      await api.post("/hrms-eq/leave-requests", form);
      toast.success("Leave request submitted");
      setModal(false); setForm({ employee_id: "", leave_type: "vacation", start_date: "", end_date: "", reason: "" });
      load();
    } catch (err) { toast.error(err.response?.data?.detail || "Submit failed"); }
  };

  const review = async (id, status) => {
    try {
      await api.put(`/hrms-eq/leave-requests/${id}`, { status });
      toast.success(status === "approved" ? "Approved" : "Declined");
      load();
    } catch { toast.error("Review failed"); }
  };

  const STATUS_META = { pending: "Pending", approved: "Approved", declined: "Declined" };

  return (
    <div>
      <PageHeader title="Leave Management" subtitle="Track and manage leave requests."
        right={<button onClick={() => setModal(true)} className="btn-primary"><Plus size={14} /> New request</button>}
      />
      <div className="animate-fade-in px-6 sm:px-8 space-y-6">
        {/* Balances */}
        {balances.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {balances.map((b) => (
              <div key={`${b.employee_id}-${b.leave_type}`} className="bg-white border border-line rounded-2xl p-4">
                <div className="text-caption text-ink-muted">{b.leave_type}</div>
                <div className="text-section font-display font-bold">{b.total_days - b.used_days}/{b.total_days}d</div>
              </div>
            ))}
          </div>
        )}
        {requests.length === 0 && <div className="text-body text-ink-muted">No leave requests yet.</div>}
        {requests.map((r) => (
          <div key={r.id} className="bg-white border border-line rounded-2xl p-5 flex items-center justify-between">
            <div>
              <div className="text-body font-medium">{empMap[r.employee_id] || r.employee_id}</div>
              <div className="text-caption text-ink-muted">{r.leave_type} · {r.start_date} to {r.end_date}{r.reason ? ` · ${r.reason}` : ""}</div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-tiny px-2 py-0.5 rounded-full border ${r.status === "approved" ? "text-success border-success/30" : r.status === "declined" ? "text-danger border-danger/30" : "text-warning border-warning"}`}>{STATUS_META[r.status]}</span>
              {r.status === "pending" && (
                <>
                  <button onClick={() => review(r.id, "approved")} className="btn-secondary text-success"><Check size={14} /></button>
                  <button onClick={() => review(r.id, "declined")} className="btn-secondary text-danger"><X size={14} /></button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="text-card-title font-display font-semibold mb-4">New Leave Request</div>
            <form onSubmit={save} className="space-y-4">
              <select className="inp w-full" value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })} required>
                <option value="">Select employee</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
              </select>
              <select className="inp w-full" value={form.leave_type} onChange={(e) => setForm({ ...form, leave_type: e.target.value })}>
                <option value="vacation">Vacation</option><option value="sick">Sick</option><option value="personal">Personal</option><option value="other">Other</option>
              </select>
              <div className="grid grid-cols-2 gap-4">
                <input className="inp" type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} required />
                <input className="inp" type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} required />
              </div>
              <textarea className="inp w-full h-20" placeholder="Reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary">Submit</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
