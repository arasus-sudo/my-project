import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Plus, PenSquare, Trash2, Star, Loader2, Signature as SignatureIcon, ShieldCheck, ThumbsUp, ThumbsDown } from "lucide-react";
import SignatureBuilder from "../components/signature-builder/SignatureBuilder";

// Signatures authored in the old plain-text textarea store literal "\n" line
// breaks, which have no rendering meaning in HTML. The new block-based
// builder already emits proper single-line table HTML with <br>-free markup,
// so this conversion is only needed for signatures that predate it.
const displayHtml = (sig) => (sig.blocks_json?.length ? sig.content_html : (sig.content_html || "").replace(/\n/g, "<br>"));

const STATUS_PILL = {
  pending_approval: { label: "Pending approval", cls: "bg-warning/10 text-warning" },
  draft: { label: "Draft", cls: "bg-ash text-ink-muted" },
};

function ApprovalAdminCard({ onChanged }) {
  const [requireApproval, setRequireApproval] = useState(false);
  const [pending, setPending] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const load = () => {
    Promise.all([api.get("/signatures/settings/approval-required"), api.get("/signatures/pending-approval")])
      .then(([s, p]) => { setRequireApproval(s.data.require_approval); setPending(p.data); setLoaded(true); })
      .catch(() => setLoaded(true));
  };
  useEffect(() => { load(); }, []);

  const toggle = async () => {
    const next = !requireApproval;
    setRequireApproval(next);
    await api.put("/signatures/settings/approval-required", { require_approval: next });
    toast.success(next ? "New signatures now require approval" : "Approval requirement turned off");
  };

  const decide = async (sid, approve) => {
    await api.post(`/signatures/${sid}/${approve ? "approve" : "reject"}`);
    load();
    onChanged();
  };

  if (!loaded) return null;

  return (
    <div className="card-floating p-4">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-body cursor-pointer">
          <input type="checkbox" checked={requireApproval} onChange={toggle} className="w-4 h-4" />
          <ShieldCheck size={14} className="text-ink-muted" /> Require org-admin approval for new signatures
        </label>
      </div>
      {pending.length > 0 && (
        <div className="mt-3 space-y-2 border-t border-line pt-3">
          <div className="text-caption font-medium text-ink-muted">Pending approval ({pending.length})</div>
          {pending.map((s) => (
            <div key={s.id} className="flex items-center justify-between text-caption">
              <span>{s.name}</span>
              <div className="flex items-center gap-1">
                <button onClick={() => decide(s.id, true)} className="btn-ghost p-1"><ThumbsUp size={13} /></button>
                <button onClick={() => decide(s.id, false)} className="btn-ghost p-1"><ThumbsDown size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Signatures() {
  const { user } = useAuth();
  const isOrgAdmin = user?.role === "org_admin" || user?.is_admin;
  const [sigs, setSigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // signature object, or "new", or null

  const load = () => {
    api.get("/signatures").then((r) => { setSigs(r.data || []); setLoading(false); }).catch(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const remove = async (sid) => {
    if (!window.confirm("Delete this signature?")) return;
    try {
      await api.delete(`/signatures/${sid}`);
      setSigs((prev) => prev.filter((s) => s.id !== sid));
      toast.success("Signature deleted");
    } catch { toast.error("Failed to delete"); }
  };

  const setDefault = async (sig) => {
    for (const s of sigs) {
      if (s.id === sig.id) await api.put(`/signatures/${s.id}`, { ...s, is_default: true });
      else if (s.is_default) await api.put(`/signatures/${s.id}`, { ...s, is_default: false });
    }
    load();
    toast.success("Default signature updated");
  };

  const onSaved = async (saved) => {
    if (saved.is_default) {
      // Autosave just made this the default — unset any other default so
      // exactly one signature stays marked, matching setDefault()'s rule.
      const others = sigs.filter((s) => s.id !== saved.id && s.is_default);
      await Promise.all(others.map((s) => api.put(`/signatures/${s.id}`, { ...s, is_default: false })));
    }
    load();
  };

  if (editing) {
    return (
      <SignatureBuilder
        signature={editing === "new" ? null : editing}
        onBack={() => { setEditing(null); load(); }}
        onSaved={onSaved}
      />
    );
  }

  return (
    <div>
      <PageHeader
        title="Signatures"
        subtitle="Manage email signatures — each campaign picks which one to use"
        right={
          <button onClick={() => setEditing("new")} className="btn-primary text-body" data-testid="sig-new">
            <Plus size={14} /> New Signature
          </button>
        }
      />
      <div className="px-6 sm:px-8 pb-8 max-w-4xl mx-auto space-y-4">
        {isOrgAdmin && <ApprovalAdminCard onChanged={load} />}
        {loading ? (
          <div className="text-center py-12 text-ink-muted"><Loader2 size={20} className="animate-spin mx-auto mb-2" /> Loading...</div>
        ) : sigs.length === 0 ? (
          <div className="text-center py-16 text-ink-muted">
            <SignatureIcon size={40} className="mx-auto mb-3 text-ink-disabled" />
            <div className="text-body font-medium mb-1">No signatures yet</div>
            <p className="text-caption mb-4">Create a signature to auto-append to campaign emails. You can have multiple signatures and assign a different one per campaign.</p>
            <button onClick={() => setEditing("new")} className="btn-primary"><Plus size={14} /> Create your first signature</button>
          </div>
        ) : (
          <div className="space-y-3">
            {sigs.map((sig) => {
              const pill = STATUS_PILL[sig.status];
              return (
                <div key={sig.id} className={`card-floating p-4 flex items-start gap-4 ${sig.is_default ? "ring-2 ring-accent/30" : ""}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-body">{sig.name}</span>
                      {sig.is_default && <span className="pill text-caption">Default</span>}
                      {pill && <span className={`text-tiny px-2 py-0.5 rounded-full ${pill.cls}`}>{pill.label}</span>}
                    </div>
                    <div className="mt-2 p-2 bg-white border border-line rounded-lg text-caption signature-preview" dangerouslySetInnerHTML={{ __html: displayHtml(sig) }} />
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => setEditing(sig)} className="btn-ghost text-caption p-1.5" title="Edit"><PenSquare size={14} /></button>
                    {!sig.is_default && <button onClick={() => setDefault(sig)} className="btn-ghost text-caption p-1.5" title="Set as default"><Star size={14} /></button>}
                    <button onClick={() => remove(sig.id)} className="btn-ghost text-caption p-1.5 text-danger" title="Delete"><Trash2 size={14} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
