import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Plus, PenSquare, Trash2, Check, X, Loader2, Signature as SignatureIcon } from "lucide-react";

export default function Signatures() {
  const [sigs, setSigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // sig obj being edited, or "new"
  const [form, setForm] = useState({ name: "", content_html: "", is_default: false });
  const [saving, setSaving] = useState(false);

  const load = () => {
    api.get("/signatures").then((r) => { setSigs(r.data || []); setLoading(false); }).catch(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditing("new");
    setForm({ name: "", content_html: "", is_default: false });
  };

  const openEdit = (sig) => {
    setEditing(sig.id);
    setForm({ name: sig.name, content_html: sig.content_html, is_default: sig.is_default || false });
  };

  const cancel = () => { setEditing(null); setForm({ name: "", content_html: "", is_default: false }); };

  const save = async () => {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    if (!form.content_html.trim()) { toast.error("Content is required"); return; }
    setSaving(true);
    try {
      const txt = form.content_html.replace(/<[^>]+>/g, "").trim();
      const payload = { name: form.name, content_html: form.content_html, content_text: txt, is_default: form.is_default };
      if (editing === "new") {
        await api.post("/signatures", payload);
        toast.success("Signature created");
      } else {
        await api.put(`/signatures/${editing}`, payload);
        toast.success("Signature updated");
      }
      cancel();
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to save signature");
    } finally { setSaving(false); }
  };

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
      if (s.id === sig.id) {
        await api.put(`/signatures/${s.id}`, { ...s, is_default: true });
      } else if (s.is_default) {
        await api.put(`/signatures/${s.id}`, { ...s, is_default: false });
      }
    }
    load();
    toast.success("Default signature updated");
  };

  return (
    <div>
      <PageHeader
        title="Signatures"
        subtitle="Manage email signatures — each campaign picks which one to use"
        right={
          !editing && (
            <button onClick={openNew} className="btn-primary text-sm"><Plus size={14} /> New Signature</button>
          )
        }
      />
      <div className="px-6 sm:px-8 pb-8 max-w-4xl mx-auto">
        {loading ? (
          <div className="text-center py-12 text-ink-muted"><Loader2 size={20} className="animate-spin mx-auto mb-2" /> Loading...</div>
        ) : editing ? (
          <div className="card-floating p-6 space-y-4">
            <div className="text-card-title font-display font-semibold">{editing === "new" ? "New Signature" : "Edit Signature"}</div>
            <label className="block">
              <span className="form-label">Name</span>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="input-premium mt-1" placeholder="e.g. Standard signature" />
            </label>
            <label className="block">
              <span className="form-label">Content (HTML)</span>
              <textarea value={form.content_html} onChange={(e) => setForm({ ...form, content_html: e.target.value })}
                rows={6} className="input-premium mt-1 font-mono text-caption"
                placeholder="Paste or type your signature HTML here..." />
            </label>
            {form.content_html && (
              <div>
                <span className="form-label">Preview</span>
                <div className="mt-1 p-3 border border-line rounded-xl bg-white signature-preview" dangerouslySetInnerHTML={{ __html: form.content_html }} />
              </div>
            )}
            <label className="flex items-center gap-2 text-body cursor-pointer">
              <input type="checkbox" checked={form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} className="w-4 h-4" />
              Set as default signature (auto-selected for new campaigns)
            </label>
            <div className="flex gap-2 pt-2">
              <button onClick={cancel} className="btn-secondary text-sm"><X size={14} /> Cancel</button>
              <button onClick={save} disabled={saving} className="btn-primary text-sm">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                {editing === "new" ? "Create" : "Save"}
              </button>
            </div>
          </div>
        ) : sigs.length === 0 ? (
          <div className="text-center py-16 text-ink-muted">
            <SignatureIcon size={40} className="mx-auto mb-3 text-ink-disabled" />
            <div className="text-body font-medium mb-1">No signatures yet</div>
            <p className="text-caption mb-4">Create a signature to auto-append to campaign emails. You can have multiple signatures and assign a different one per campaign.</p>
            <button onClick={openNew} className="btn-primary"><Plus size={14} /> Create your first signature</button>
          </div>
        ) : (
          <div className="space-y-3">
            {sigs.map((sig) => (
              <div key={sig.id} className={`card-floating p-4 flex items-start gap-4 ${sig.is_default ? "ring-2 ring-accent/30" : ""}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-body">{sig.name}</span>
                    {sig.is_default && <span className="pill text-xs">Default</span>}
                  </div>
                  <div className="mt-2 p-2 bg-white border border-line rounded-lg text-caption signature-preview" dangerouslySetInnerHTML={{ __html: sig.content_html }} />
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => openEdit(sig)} className="btn-ghost text-xs p-1.5" title="Edit"><PenSquare size={14} /></button>
                  {!sig.is_default && <button onClick={() => setDefault(sig)} className="btn-ghost text-xs p-1.5" title="Set as default"><Check size={14} /></button>}
                  <button onClick={() => remove(sig.id)} className="btn-ghost text-xs p-1.5 text-danger" title="Delete"><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}