import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

const ROLES = [
  { k: "org_admin", t: "Org Admin" },
  { k: "campaign_manager", t: "Campaign Manager" },
  { k: "sdr", t: "SDR / Rep" },
  { k: "viewer", t: "Viewer" },
];

export default function Team() {
  const { user } = useAuth();
  const [members, setMembers] = useState([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", role: "campaign_manager", password: "" });

  const load = () => api.get("/team").then((r) => setMembers(r.data));
  useEffect(() => { load(); }, []);

  const invite = async (e) => {
    e.preventDefault();
    try {
      await api.post("/team/invite", form);
      toast.success(`Invited ${form.email}`);
      setModal(false); setForm({ name: "", email: "", role: "campaign_manager", password: "" });
      load();
    } catch (err) { toast.error(err?.response?.data?.detail || "Invite failed"); }
  };
  const remove = async (id) => {
    if (!confirm("Remove this member?")) return;
    try { await api.delete(`/team/${id}`); load(); }
    catch (err) { toast.error(err?.response?.data?.detail || "Failed"); }
  };

  return (
    <div className="animate-fade-in">
      <PageHeader title="Team" subtitle="Invite people to your workspace."
        right={<button onClick={() => setModal(true)} data-testid="invite-btn" className="btn-primary"><Plus size={14} /> Invite</button>}
      />
      <div className="p-6 sm:p-8">
        <div className="bg-white border border-line rounded-2xl overflow-hidden card-floating">
          <table className="w-full text-table">
            <thead>
              <tr className="border-b border-line">
                {["Name", "Email", "Role", "Joined", ""].map((h) => <th key={h} className="table-header text-left p-3">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-b border-line">
                  <td className="p-3 font-medium">{m.name} {m.id === user?.id && <span className="pill ml-1">You</span>}</td>
                  <td className="p-3 font-mono">{m.email}</td>
                  <td className="p-3">{ROLES.find(r => r.k === m.role)?.t || m.role}</td>
                  <td className="p-3 text-ink-muted">{m.created_at?.slice(0, 10)}</td>
                  <td className="p-3 text-right">
                    {m.id !== user?.id && (
                      <button onClick={() => remove(m.id)} data-testid={`remove-member-${m.id}`} className="text-xs text-danger hover:underline">
                        <Trash2 size={11} className="inline" /> remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {modal && (
        <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50 p-4">
          <form onSubmit={invite} className="bg-white border border-line rounded-2xl shadow-card p-6 sm:p-8 w-full max-w-md space-y-3">
            <div className="text-section font-display font-semibold">Invite team member</div>
            <input required placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="invite-name" className="input-premium w-full" />
            <input required type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="invite-email" className="input-premium w-full" />
            <input required minLength={6} type="text" placeholder="Temporary password (share with them)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} data-testid="invite-password" className="input-premium w-full font-mono text-sm" />
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} data-testid="invite-role" className="input-premium w-full bg-white">
              {ROLES.map((r) => <option key={r.k} value={r.k}>{r.t}</option>)}
            </select>
            <p className="text-caption text-ink-muted">MVP note: no email sending yet — share the temporary password with them directly.</p>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setModal(false)} className="btn-secondary">Cancel</button>
              <button type="submit" data-testid="save-invite" className="btn-primary">Invite</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
