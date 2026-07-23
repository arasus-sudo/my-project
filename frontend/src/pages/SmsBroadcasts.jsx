import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Plus, Play, Pause } from "lucide-react";

export default function SmsBroadcasts() {
  const [items, setItems] = useState([]);
  const [modal, setModal] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [form, setForm] = useState({ name: "", template_id: "", contact_ids: "", scheduled_at: "" });

  const load = () => api.get("/sms-eq/broadcasts").then((r) => setItems(r.data));
  useEffect(() => { load(); api.get("/sms-eq/templates").then((r) => setTemplates(r.data)); }, []);

  const save = async (e) => {
    e.preventDefault();
    try {
      await api.post("/sms-eq/broadcasts", {
        ...form,
        contact_ids: form.contact_ids.split(",").map(s => s.trim()).filter(Boolean),
      });
      toast.success("Broadcast created");
      setModal(false); setForm({ name: "", template_id: "", contact_ids: "", scheduled_at: "" });
      load();
    } catch { toast.error("Create failed"); }
  };

  const toggleLaunch = async (id, status) => {
    try {
      await api.post(`/sms-eq/broadcasts/${id}/${status === "paused" ? "launch" : "pause"}`);
      toast.success(status === "paused" ? "Broadcast launched" : "Broadcast paused");
      load();
    } catch { toast.error("Action failed"); }
  };

  const STATUS_META = { draft: "Draft", scheduled: "Scheduled", sending: "Sending", sent: "Sent", paused: "Paused", cancelled: "Cancelled" };

  return (
    <div>
      <PageHeader title="SMS Broadcasts" subtitle="Send bulk SMS to your contacts."
        right={<button onClick={() => setModal(true)} className="btn-primary"><Plus size={14} /> New broadcast</button>}
      />
      <div className="animate-fade-in px-6 sm:px-8 space-y-4">
        {items.length === 0 && <div className="text-body text-ink-muted">No broadcasts yet.</div>}
        {items.map((b) => (
          <div key={b.id} className="bg-white border border-line rounded-2xl p-5 flex items-center justify-between">
            <div>
              <div className="text-card-title font-display font-semibold">{b.name}</div>
              <div className="text-caption text-ink-muted mt-1">Template: {b.template_name || "—"} | Sent: {b.sent_count ?? 0}/{b.total_count ?? 0}</div>
              <div className="text-tiny text-ink-muted mt-0.5">Status: {STATUS_META[b.status] || b.status}</div>
            </div>
            <div className="flex gap-2">
              {b.status === "paused" && <button onClick={() => toggleLaunch(b.id, "paused")} className="btn-secondary"><Play size={14} /> Resume</button>}
              {b.status === "sending" && <button onClick={() => toggleLaunch(b.id, "sending")} className="btn-secondary"><Pause size={14} /> Pause</button>}
            </div>
          </div>
        ))}
      </div>
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="text-card-title font-display font-semibold mb-4">New SMS Broadcast</div>
            <form onSubmit={save} className="space-y-4">
              <input className="inp w-full" placeholder="Broadcast name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              <select className="inp w-full" value={form.template_id} onChange={(e) => setForm({ ...form, template_id: e.target.value })} required>
                <option value="">Select template</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <input className="inp w-full" placeholder="Contact IDs (comma-separated)" value={form.contact_ids} onChange={(e) => setForm({ ...form, contact_ids: e.target.value })} />
              <input className="inp w-full" type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
