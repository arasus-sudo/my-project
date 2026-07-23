import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Plus } from "lucide-react";

export default function WhatsAppContacts() {
  const [items, setItems] = useState([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", tags: "" });

  const load = () => api.get("/whatsapp-eq/contacts").then((r) => setItems(r.data));
  useEffect(() => { load(); }, []);

  const save = async (e) => {
    e.preventDefault();
    try {
      await api.post("/whatsapp-eq/contacts", { ...form, tags: form.tags.split(",").map(t => t.trim()).filter(Boolean) });
      toast.success("Contact added");
      setModal(false); setForm({ name: "", phone: "", tags: "" });
      load();
    } catch { toast.error("Save failed"); }
  };

  const toggleOptOut = async (id, optedOut) => {
    try {
      await api.put(`/whatsapp-eq/contacts/${id}`, { opted_out: !optedOut });
      toast.success(optedOut ? "Re-subscribed" : "Opted out");
      load();
    } catch { toast.error("Update failed"); }
  };

  return (
    <div>
      <PageHeader title="WhatsApp Contacts" subtitle="Manage your WhatsApp contact list."
        right={<button onClick={() => setModal(true)} className="btn-primary"><Plus size={14} /> Add contact</button>}
      />
      <div className="animate-fade-in px-6 sm:px-8">
        {items.length === 0 && <div className="text-body text-ink-muted">No contacts yet.</div>}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((c) => (
            <div key={c.id} className="bg-white border border-line rounded-2xl p-5">
              <div className="text-card-title font-display font-semibold">{c.name || c.phone}</div>
              <div className="text-caption text-ink-muted mt-1">{c.phone}</div>
              {c.opted_out && <span className="text-tiny text-danger">Opted out</span>}
              {c.tags?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">{c.tags.map((tg) => <span key={tg} className="pill">{tg}</span>)}</div>
              )}
              <button onClick={() => toggleOptOut(c.id, c.opted_out)} className="mt-3 text-xs text-accent hover:underline">
                {c.opted_out ? "Re-subscribe" : "Opt out"}
              </button>
            </div>
          ))}
        </div>
      </div>
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="text-card-title font-display font-semibold mb-4">Add Contact</div>
            <form onSubmit={save} className="space-y-4">
              <input className="inp w-full" placeholder="Name (optional)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <input className="inp w-full" placeholder="Phone number" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
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
