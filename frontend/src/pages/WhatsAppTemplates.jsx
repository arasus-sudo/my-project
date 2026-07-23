import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Plus, Trash2, CheckCircle2, XCircle } from "lucide-react";

export default function WhatsAppTemplates() {
  const [items, setItems] = useState([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: "", body: "", language: "en", category: "marketing", tags: "" });

  const load = () => api.get("/whatsapp-eq/templates").then((r) => setItems(r.data));
  useEffect(() => { load(); }, []);

  const save = async (e) => {
    e.preventDefault();
    try {
      await api.post("/whatsapp-eq/templates", { ...form, tags: form.tags.split(",").map(t => t.trim()).filter(Boolean) });
      toast.success("Template saved for mock approval");
      setModal(false); setForm({ name: "", body: "", language: "en", category: "marketing", tags: "" });
      load();
    } catch { toast.error("Save failed"); }
  };
  const del = async (id) => { await api.delete(`/whatsapp-eq/templates/${id}`); load(); };

  return (
    <div>
      <PageHeader title="WhatsApp Templates" subtitle="Message templates submitted for WhatsApp approval."
        right={<button onClick={() => setModal(true)} className="btn-primary"><Plus size={14} /> New template</button>}
      />
      <div className="animate-fade-in px-6 sm:px-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.length === 0 && <div className="col-span-full text-body text-ink-muted">No templates yet.</div>}
        {items.map((t) => (
          <div key={t.id} className="bg-white border border-line rounded-2xl p-5">
            <div className="flex items-start justify-between">
              <div className="text-card-title font-display font-semibold">{t.name}</div>
              {t.status === "approved" ? <CheckCircle2 size={16} className="text-success" /> : t.status === "rejected" ? <XCircle size={16} className="text-danger" /> : null}
            </div>
            <div className="text-caption text-ink-muted mt-1">{t.language} · {t.category}</div>
            <div className="text-caption text-ink-muted mt-2 line-clamp-4 whitespace-pre-wrap font-mono">{t.body}</div>
            {t.tags?.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">{t.tags.map((tg) => <span key={tg} className="pill">{tg}</span>)}</div>
            )}
            <div className="mt-2 flex items-center gap-2">
              <span className={`text-tiny px-1.5 py-0.5 rounded-full border ${t.status === "approved" ? "text-success border-success/30 bg-success/10" : t.status === "rejected" ? "text-danger border-danger/30" : "text-ink-muted border-line"}`}>{t.status}</span>
              <button onClick={() => del(t.id)} className="text-xs text-danger hover:underline"><Trash2 size={12} className="inline" /> delete</button>
            </div>
          </div>
        ))}
      </div>
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="text-card-title font-display font-semibold mb-4">New WhatsApp Template</div>
            <form onSubmit={save} className="space-y-4">
              <input className="inp w-full" placeholder="Template name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              <textarea className="inp w-full h-24" placeholder="Message body (supports {{var}} placeholders)" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required />
              <div className="grid grid-cols-2 gap-4">
                <select className="inp" value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })}>
                  <option value="en">English</option>
                  <option value="es">Spanish</option>
                  <option value="fr">French</option>
                  <option value="de">German</option>
                </select>
                <select className="inp" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  <option value="marketing">Marketing</option>
                  <option value="utility">Utility</option>
                  <option value="authentication">Authentication</option>
                </select>
              </div>
              <input className="inp w-full" placeholder="Tags (comma-separated)" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary">Submit for approval</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
