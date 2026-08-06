import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Plus, Users, Crosshair } from "../icons";
import { EmptyState } from "../components/composites/EmptyState";
import { Modal, ModalContent } from "../components/composites/Modal";
import Input from "../components/primitives/Input";
import Select from "../components/primitives/Select";
import Button from "../components/primitives/Button";

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
        right={<Button variant="primary" icon={Plus} onClick={() => setModal(true)}>New requisition</Button>}
      />
      <div className="animate-fade-in px-6 sm:px-8 py-6 space-y-4">
        {requisitions.length === 0 ? (
          <EmptyState title="No requisitions yet" description="Create a requisition to start tracking candidates."
            actionLabel="New requisition" onAction={() => setModal(true)} />
        ) : requisitions.map((r) => (
          <div key={r.id} style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-xl)", boxShadow: "var(--shadow-xs)", overflow: "hidden" }}>
            <div className="flex items-center justify-between" style={{ padding: 20 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>{r.title}</div>
                <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginTop: 4 }}>{departments.find(d => d.id === r.department_id)?.name || "—"} · {r.status}</div>
              </div>
              <Button variant="secondary" icon={Users} onClick={() => { setSelectedReq(r.id); setCandidateModal(true); }}>Add candidate</Button>
            </div>
            {candidates[r.id]?.length > 0 && (
              <div className="space-y-2" style={{ padding: "0 20px 20px" }}>
                {candidates[r.id].map((c) => (
                  <div key={c.id} className="flex items-center justify-between" style={{ border: "1px solid var(--border-default)", borderRadius: "var(--radius-lg)", padding: 12 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>{c.first_name} {c.last_name}</div>
                      <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{c.email} · Stage: {c.stage}</div>
                      {c.score && <div style={{ fontSize: 11, color: "var(--color-primary)" }}>Score: {c.score}/100</div>}
                    </div>
                    <Button variant="secondary" size="sm" icon={Crosshair} onClick={() => scoreCandidate(r.id, c.id)}>Score</Button>
                  </div>
                ))}
              </div>
            )}
            {(!candidates[r.id] || candidates[r.id].length === 0) && (
              <button onClick={() => loadCandidates(r.id)} style={{ padding: "0 20px 20px", fontSize: 12.5, color: "var(--text-tertiary)" }}>Click to load candidates</button>
            )}
          </div>
        ))}
      </div>

      <Modal open={modal} onOpenChange={setModal}>
        <ModalContent size="sm" title="New Requisition"
          footer={
            <>
              <Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
              <Button variant="primary" type="submit" form="hrms-req-form">Create</Button>
            </>
          }
        >
          <form id="hrms-req-form" onSubmit={saveReq} className="space-y-3">
            <Input required label="Job title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <Select label="Department" value={form.department_id} onChange={(v) => setForm({ ...form, department_id: v })}
              options={[{ value: "", label: "No department" }, ...departments.map((d) => ({ value: d.id, label: d.name }))]} />
            <Input as="textarea" rows={3} label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <Input as="textarea" rows={3} label="Requirements" value={form.requirements} onChange={(e) => setForm({ ...form, requirements: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <Input type="number" label="Min salary" value={form.salary_range_min} onChange={(e) => setForm({ ...form, salary_range_min: e.target.value })} />
              <Input type="number" label="Max salary" value={form.salary_range_max} onChange={(e) => setForm({ ...form, salary_range_max: e.target.value })} />
            </div>
          </form>
        </ModalContent>
      </Modal>

      <Modal open={candidateModal} onOpenChange={setCandidateModal}>
        <ModalContent size="sm" title="Add Candidate"
          footer={
            <>
              <Button variant="secondary" onClick={() => setCandidateModal(false)}>Cancel</Button>
              <Button variant="primary" type="submit" form="hrms-candidate-form">Add</Button>
            </>
          }
        >
          <form id="hrms-candidate-form" onSubmit={saveCandidate} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input required label="First name" value={candForm.first_name} onChange={(e) => setCandForm({ ...candForm, first_name: e.target.value })} />
              <Input required label="Last name" value={candForm.last_name} onChange={(e) => setCandForm({ ...candForm, last_name: e.target.value })} />
            </div>
            <Input required type="email" label="Email" value={candForm.email} onChange={(e) => setCandForm({ ...candForm, email: e.target.value })} />
            <Input label="Phone" value={candForm.phone} onChange={(e) => setCandForm({ ...candForm, phone: e.target.value })} />
            <Input as="textarea" rows={4} label="Resume text" help="For AI scoring" value={candForm.resume_text} onChange={(e) => setCandForm({ ...candForm, resume_text: e.target.value })} />
          </form>
        </ModalContent>
      </Modal>
    </div>
  );
}
