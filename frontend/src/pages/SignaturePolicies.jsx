import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Plus, Trash2, Users, Zap } from "lucide-react";

const ROLES = [
  { k: "org_admin", t: "Org Admin" },
  { k: "campaign_manager", t: "Campaign Manager" },
  { k: "sdr", t: "SDR / Rep" },
  { k: "viewer", t: "Viewer" },
];

export default function SignaturePolicies() {
  const [policies, setPolicies] = useState([]);
  const [signatures, setSignatures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: "", match_role: "", match_department: "", signature_id: "" });
  const [matchPreview, setMatchPreview] = useState({}); // { [policyId]: count }
  const [busyId, setBusyId] = useState(null);

  const load = () => {
    Promise.all([api.get("/signature-policies"), api.get("/signatures")])
      .then(([p, s]) => { setPolicies(p.data || []); setSignatures(s.data || []); setLoading(false); })
      .catch(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    if (!form.match_role && !form.match_department.trim()) {
      toast.error("Set at least a role or a department to match on");
      return;
    }
    if (!form.signature_id) { toast.error("Pick a signature to apply"); return; }
    try {
      await api.post("/signature-policies", {
        name: form.name.trim() || "Untitled policy",
        match_role: form.match_role || null,
        match_department: form.match_department.trim() || null,
        signature_id: form.signature_id,
      });
      toast.success("Policy created");
      setModal(false);
      setForm({ name: "", match_role: "", match_department: "", signature_id: "" });
      load();
    } catch (err) { toast.error(err?.response?.data?.detail || "Failed to create policy"); }
  };

  const remove = async (id) => {
    if (!confirm("Delete this policy?")) return;
    await api.delete(`/signature-policies/${id}`);
    load();
  };

  const preview = async (id) => {
    try {
      const { data } = await api.get(`/signature-policies/${id}/matching-users`);
      setMatchPreview((m) => ({ ...m, [id]: data.count }));
    } catch { toast.error("Failed to check matches"); }
  };

  const apply = async (id) => {
    setBusyId(id);
    try {
      const { data } = await api.post(`/signature-policies/${id}/apply`);
      toast.success(`Applied to ${data.applied_count} matching user${data.applied_count === 1 ? "" : "s"}`);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Apply failed");
    } finally { setBusyId(null); }
  };

  return (
    <div>
      <PageHeader
        title="Signature policies"
        subtitle="Org admin only — match a role or department to a signature, then apply it as each matching user's default for new campaigns."
        right={
          <button onClick={() => setModal(true)} className="btn-primary text-body" data-testid="policy-new">
            <Plus size={14} /> New policy
          </button>
        }
      />
      <div className="px-6 sm:px-8 pb-8 max-w-3xl mx-auto space-y-3">
        {loading ? (
          <div className="text-center py-12 text-ink-muted">Loading…</div>
        ) : policies.length === 0 ? (
          <div className="text-center py-16 text-ink-muted">
            <Zap size={32} className="mx-auto mb-3 text-ink-disabled" />
            <div className="text-body font-medium mb-1">No policies yet</div>
            <p className="text-caption">Create one to standardize which signature a role or department's new campaigns default to.</p>
          </div>
        ) : (
          policies.map((p) => {
            const sig = signatures.find((s) => s.id === p.signature_id);
            return (
              <div key={p.id} className="card-floating p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-body">{p.name}</div>
                    <div className="text-caption text-ink-muted mt-0.5">
                      {p.match_role && <span className="pill mr-1">{ROLES.find(r => r.k === p.match_role)?.t || p.match_role}</span>}
                      {p.match_department && <span className="pill mr-1">Dept: {p.match_department}</span>}
                      {" "}→ {sig ? sig.name : "(signature deleted)"}
                    </div>
                    {matchPreview[p.id] != null && (
                      <div className="text-tiny text-ink-tertiary mt-1">{matchPreview[p.id]} matching user{matchPreview[p.id] === 1 ? "" : "s"}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => preview(p.id)} className="btn-ghost text-caption p-1.5" title="Preview matching users">
                      <Users size={14} />
                    </button>
                    <button onClick={() => apply(p.id)} disabled={busyId === p.id} data-testid={`policy-apply-${p.id}`}
                      className="btn-secondary text-caption">
                      {busyId === p.id ? "Applying…" : "Apply"}
                    </button>
                    <button onClick={() => remove(p.id)} className="btn-ghost text-caption p-1.5 text-danger"><Trash2 size={14} /></button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50 p-4">
          <form onSubmit={create} className="bg-white border border-line rounded-2xl shadow-card p-6 sm:p-8 w-full max-w-md space-y-3">
            <div className="text-section font-display font-semibold">New signature policy</div>
            <input placeholder="Policy name (e.g. Sales default signature)" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="policy-name" className="input-premium w-full" />
            <label className="block">
              <span className="text-caption text-ink-muted">Match role</span>
              <select value={form.match_role} onChange={(e) => setForm({ ...form, match_role: e.target.value })}
                data-testid="policy-match-role" className="input-premium w-full bg-white mt-1">
                <option value="">Any role</option>
                {ROLES.map((r) => <option key={r.k} value={r.k}>{r.t}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-caption text-ink-muted">Match department</span>
              <input placeholder="e.g. Sales (blank = any department)" value={form.match_department}
                onChange={(e) => setForm({ ...form, match_department: e.target.value })}
                data-testid="policy-match-department" className="input-premium w-full mt-1" />
            </label>
            <label className="block">
              <span className="text-caption text-ink-muted">Apply this signature</span>
              <select value={form.signature_id} onChange={(e) => setForm({ ...form, signature_id: e.target.value })}
                data-testid="policy-signature" className="input-premium w-full bg-white mt-1">
                <option value="">Choose a signature…</option>
                {signatures.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <p className="text-caption text-ink-muted">Creating a policy doesn't change anything yet — use "Apply" afterward to set it for matching users.</p>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setModal(false)} className="btn-secondary">Cancel</button>
              <button type="submit" data-testid="policy-save" className="btn-primary">Create</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
