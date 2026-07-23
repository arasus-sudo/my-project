import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Plus, UserPlus, Brain } from "lucide-react";

export default function HrmseqRecruitment() {
  const [requisitions, setRequisitions] = useState([]);
  const [candidates, setCandidates] = useState({});
  const [departments, setDepartments] = useState([]);
  const [modal, setModal] = useState(false);
  const [candidateModal, setCandidateModal] = useState(false);
  const [selectedReq, setSelectedReq] = useState(null);
  const [form, setForm] = useState({ title: "", department_id: "", description: "", requirements: "", salary_range_min: "", salary_range_max: "" });
  const [candForm, setCandForm] = useState({ first_name: "", last_name: "", email: "", phone: "", resume_text: "", source: "direct" });

  const load = () => {
    api.get("/hrms-eq/requisitions").then((r) => setRequisitions(r.data));
    api.get("/hrms-eq/departments").then((r) => setDepartments(r.data));
  };
  useEffect(() => { load(); }, []);

  const loadCandidates = (rid) => {
    api.get(`/hrms-eq/requisitions/${rid}/candidates`).then((r) => setCandidates((p) => ({ ...p, [rid]: r.data })));
  };

  const saveReq = async (e) => {
    e.preventDefault();
    try {
      await api.post("/hrms-eq/requisitions", form);
      toast.success("Requisition created");
      setModal(false); setForm({ title: "", department_id: "", description: "", requirements: "", salary_range_min: "", salary_range_max: "" });
      load();
    } catch { toast.error("Save failed"); }
  };

  const saveCandidate = async (e) => {
    e.preventDefault();
    if (!selectedReq) return;
    try {
      await api.post("/hrms-eq/candidates", { ...candForm, requisition_id: selectedReq });
      toast.success("Candidate added");
      setCandidateModal(false); setCandForm({ first_name: "", last_name: "", email: "", phone: "", resume_text: "", source: "direct" });
      loadCandidates(selectedReq);
    } catch (err) { toast.error(err.response?.data?.detail || "Save failed"); }
  };

  const scoreCandidate = async (rid, cid) => {
    try {
      await api.post(`/hrms-eq/candidates/${cid}/score`);
      toast.success("Candidate scored");
      loadCandidates(rid);
    } catch { toast.error("Scoring failed"); }
  };

  return (
    <div>
      <PageHeader title="Recruitment" subtitle="Job requisitions and candidate tracking."
        right={<button onClick={() => setModal(true)} className="btn-primary"><Plus size={14} /> New requisition</button>}
      />
      <div className="animate-fade-in px-6 sm:px-8 space-y-6">
        {requisitions.length === 0 && <div className="text-body text-ink-muted">No requisitions yet.</div>}
        {requisitions.map((r) => (
          <div key={r.id} className="bg-white border border-line rounded-2xl overflow-hidden">
            <div className="p-5 border-b border-line flex items-center justify-between">
              <div>
                <div className="text-card-title font-display font-semibold">{r.title}</div>
                <div className="text-caption text-ink-muted">{departments.find(d => d.id === r.department_id)?.name || "—"} · {r.status}</div>
              </div>
              <button onClick={() => { setSelectedReq(r.id); setCandidateModal(true); }} className="btn-secondary"><UserPlus size={14} /> Add candidate</button>
            </div>
            {candidates[r.id]?.length > 0 && (
              <div className="p-4 space-y-2">
                {candidates[r.id].map((c) => (
                  <div key={c.id} className="flex items-center justify-between border border-line rounded-xl p-3">
                    <div>
                      <div className="text-body font-medium">{c.first_name} {c.last_name}</div>
                      <div className="text-caption text-ink-muted">{c.email} · Stage: {c.stage}</div>
                      {c.score && <div className="text-tiny text-accent">Score: {c.score}/100</div>}
                    </div>
                    <button onClick={() => scoreCandidate(r.id, c.id)} className="btn-secondary"><Brain size={14} /> Score</button>
                  </div>
                ))}
              </div>
            )}
            {(!candidates[r.id] || candidates[r.id].length === 0) && (
              <div className="p-4 text-caption text-ink-muted" onClick={() => loadCandidates(r.id)}>Click to load candidates</div>
            )}
          </div>
        ))}
      </div>
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="text-card-title font-display font-semibold mb-4">New Requisition</div>
            <form onSubmit={saveReq} className="space-y-4">
              <input className="inp w-full" placeholder="Job title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
              <select className="inp w-full" value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })}>
                <option value="">No department</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <textarea className="inp w-full h-20" placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              <textarea className="inp w-full h-20" placeholder="Requirements" value={form.requirements} onChange={(e) => setForm({ ...form, requirements: e.target.value })} />
              <div className="grid grid-cols-2 gap-4">
                <input className="inp" type="number" placeholder="Min salary" value={form.salary_range_min} onChange={(e) => setForm({ ...form, salary_range_min: e.target.value })} />
                <input className="inp" type="number" placeholder="Max salary" value={form.salary_range_max} onChange={(e) => setForm({ ...form, salary_range_max: e.target.value })} />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {candidateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setCandidateModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="text-card-title font-display font-semibold mb-4">Add Candidate</div>
            <form onSubmit={saveCandidate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <input className="inp" placeholder="First name" value={candForm.first_name} onChange={(e) => setCandForm({ ...candForm, first_name: e.target.value })} required />
                <input className="inp" placeholder="Last name" value={candForm.last_name} onChange={(e) => setCandForm({ ...candForm, last_name: e.target.value })} required />
              </div>
              <input className="inp w-full" type="email" placeholder="Email" value={candForm.email} onChange={(e) => setCandForm({ ...candForm, email: e.target.value })} required />
              <input className="inp w-full" placeholder="Phone" value={candForm.phone} onChange={(e) => setCandForm({ ...candForm, phone: e.target.value })} />
              <textarea className="inp w-full h-24" placeholder="Resume text (for AI scoring)" value={candForm.resume_text} onChange={(e) => setCandForm({ ...candForm, resume_text: e.target.value })} />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setCandidateModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary">Add</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
