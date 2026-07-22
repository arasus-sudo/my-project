import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

export default function Templates() {
  const [items, setItems] = useState([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: "", subject: "", body: "", tags: "" });

  const load = () => api.get("/templates").then((r) => setItems(r.data));
  useEffect(() => { load(); }, []);

  const save = async (e) => {
    e.preventDefault();
    try {
      await api.post("/templates", { ...form, tags: form.tags.split(",").map(t => t.trim()).filter(Boolean) });
      toast.success("Template saved");
      setModal(false); setForm({ name: "", subject: "", body: "", tags: "" });
      load();
    } catch { toast.error("Save failed"); }
  };
  const del = async (id) => {
    await api.delete(`/templates/${id}`); load();
  };

  return (
    <div>
      <PageHeader title="Templates" subtitle="Reusable email drafts scored by EQ."
        right={<button onClick={() => setModal(true)} data-testid="new-template-btn" className="btn-primary"><Plus size={14} /> New template</button>}
      />
      <div className="animate-fade-in px-6 sm:px-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.length === 0 && <div className="col-span-full text-body text-ink-muted">No templates yet. Save your best-performing emails here.</div>}
        {items.map((t) => (
          <div key={t.id} className="bg-white border border-line rounded-2xl p-5">
            <div className="flex items-start justify-between">
              <div className="text-card-title font-display font-semibold">{t.name}</div>
              <div className="font-mono text-xl sm:text-2xl font-bold text-ink">{t.eq_score}</div>
            </div>
            <div className="text-caption text-ink-muted mt-1">Subject: {t.subject}</div>
            <div className="text-caption text-ink-muted mt-3 line-clamp-4 whitespace-pre-wrap font-mono">{t.body}</div>
            {t.tags?.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">{t.tags.map((tg) => <span key={tg} className="pill">{tg}</span>)}</div>
            )}
            <button onClick={() => del(t.id)} data-testid={`delete-template-${t.id}`} className="mt-4 text-xs text-danger hover:underline"><Trash2 size={12} className="inline" /> delete</button>
          </div>
        ))}
      </div>
      {modal && (
        <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50 p-4">
          <form onSubmit={save} className="bg-white border border-line rounded-2xl p-6 w-full max-w-lg space-y-3">
            <div className="text-section font-display font-semibold">New template</div>
            <input required placeholder="Template name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="template-name" className="w-full border border-line px-3 py-2 rounded-xl" />
            <input required placeholder="Subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} data-testid="template-subject" className="w-full border border-line px-3 py-2 rounded-xl" />
            <textarea required rows={8} placeholder="Body… use {{first_name}}, {{company}}" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} data-testid="template-body" className="w-full border border-line px-3 py-2 rounded-2xl font-mono text-sm" />
            <input placeholder="Tags (comma-separated)" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} className="w-full border border-line px-3 py-2 rounded-xl" />
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setModal(false)} className="btn-secondary">Cancel</button>
              <button type="submit" data-testid="save-template" className="btn-primary">Save</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
