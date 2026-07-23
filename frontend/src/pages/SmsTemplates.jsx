import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

export default function SmsTemplates() {
  const [items, setItems] = useState([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: "", body: "", tags: "" });

  const load = () => api.get("/sms-eq/templates").then((r) => setItems(r.data));
  useEffect(() => { load(); }, []);

  const save = async (e) => {
    e.preventDefault();
    try {
      await api.post("/sms-eq/templates", { ...form, tags: form.tags.split(",").map(t => t.trim()).filter(Boolean) });
      toast.success("Template saved");
      setModal(false); setForm({ name: "", body: "", tags: "" });
      load();
    } catch { toast.error("Save failed"); }
  };
  const del = async (id) => { await api.delete(`/sms-eq/templates/${id}`); load(); };

  return (
    <div>
      <PageHeader title="SMS Templates" subtitle="Reusable message templates for broadcasts."
        right={<button onClick={() => setModal(true)} className="btn-primary"><Plus size={14} /> New template</button>}
      />
      <div className="animate-fade-in px-6 sm:px-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.length === 0 && <div className="col-span-full text-body text-ink-muted">No templates yet.</div>}
        {items.map((t) => (
          <div key={t.id} className="bg-white border border-line rounded-2xl p-5">
            <div className="text-card-title font-display font-semibold">{t.name}</div>
            <div className="text-caption text-ink-muted mt-3 line-clamp-4 whitespace-pre-wrap font-mono">{t.body}</div>
            {t.tags?.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">{t.tags.map((tg) => <span key={tg} className="pill">{tg}</span>)}</div>
            )}
            <button onClick={() => del(t.id)} className="mt-4 text-xs text-danger hover:underline"><Trash2 size={12} className="inline" /> delete</button>
          </div>
        ))}
      </div>
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="text-card-title font-display font-semibold mb-4">New SMS Template</div>
            <form onSubmit={save} className="space-y-4">
              <input className="inp w-full" placeholder="Template name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              <textarea className="inp w-full h-24" placeholder="Message body (supports {{var}} placeholders)" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required />
              <input className="inp w-full" placeholder="Tags (comma-separated)" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
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
