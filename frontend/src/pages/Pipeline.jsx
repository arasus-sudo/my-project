import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Phone, Plus, X, Save } from "lucide-react";

const STAGES = [
  { k: "new", t: "New" },
  { k: "qualified", t: "Qualified" },
  { k: "meeting", t: "Meeting" },
  { k: "proposal", t: "Proposal" },
  { k: "won", t: "Won" },
  { k: "lost", t: "Lost" },
];

export default function Pipeline() {
  const [deals, setDeals] = useState([]);
  const [leads, setLeads] = useState([]);
  const [dragging, setDragging] = useState(null);
  const [active, setActive] = useState(null); // deal being viewed/edited
  const [editForm, setEditForm] = useState({});
  const [creating, setCreating] = useState(false);
  const [newDeal, setNewDeal] = useState({ lead_id: "", title: "", value: "", stage: "new" });

  const load = () => api.get("/deals").then((r) => setDeals(r.data));
  useEffect(() => {
    load();
    api.get("/leads").then((r) => setLeads(r.data)).catch(() => {});
  }, []);

  const move = async (id, stage) => {
    setDeals((d) => d.map((x) => (x.id === id ? { ...x, stage } : x)));
    try { await api.put(`/deals/${id}`, { stage }); toast.success(`Moved to ${stage}`); }
    catch { toast.error("Move failed"); load(); }
  };

  const openDeal = (d) => {
    setActive(d);
    setEditForm({ title: d.title, value: d.value || 0, stage: d.stage, notes: d.notes || "" });
  };

  const saveDeal = async () => {
    try {
      await api.put(`/deals/${active.id}`, editForm);
      toast.success("Deal updated");
      setActive(null);
      load();
    } catch (err) { toast.error(err?.response?.data?.detail || "Failed"); }
  };

  const createDeal = async () => {
    if (!newDeal.lead_id || !newDeal.title.trim()) { toast.error("Pick a lead and give the deal a title"); return; }
    try {
      await api.post("/deals", { ...newDeal, value: Number(newDeal.value) || 0 });
      toast.success("Deal created");
      setCreating(false);
      setNewDeal({ lead_id: "", title: "", value: "", stage: "new" });
      load();
    } catch (err) { toast.error(err?.response?.data?.detail || "Failed"); }
  };

  const exportCsv = async () => {
    const { data } = await api.get("/deals/export", { responseType: "blob" });
    const url = URL.createObjectURL(new Blob([data], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = "deals-export.csv";
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader
        title="Pipeline"
        subtitle="Deals auto-created by Voice EQ, Schedule EQ, and Proposal EQ — or add your own."
        right={
          <div className="flex items-center gap-2">
            <button onClick={exportCsv} className="btn-secondary text-xs">Export CSV</button>
            <button onClick={() => setCreating(true)} data-testid="add-deal-btn" className="btn-primary text-xs">
              <Plus size={13} /> Add deal
            </button>
          </div>
        }
      />
      <div className="animate-fade-in px-6 sm:px-8 overflow-x-auto">
        <div className="card-floating p-4 grid grid-cols-6 gap-0 min-w-[1100px] border border-line bg-white rounded-2xl">
          {STAGES.map((s) => {
            const stageDeals = deals.filter((d) => d.stage === s.k);
            const subtotal = stageDeals.reduce((sum, d) => sum + Number(d.value || 0), 0);
            return (
              <div
                key={s.k}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (dragging) { move(dragging, s.k); setDragging(null); } }}
                data-testid={`stage-${s.k}`}
                className="border-r border-line last:border-r-0 min-h-[70vh] bg-bone"
              >
                <div className="p-3 border-b border-line bg-white sticky top-0 z-10">
                  <div className="ui-label">{s.t}</div>
                  <div className="font-mono text-caption text-ink-muted">{stageDeals.length} deals</div>
                  <div className="font-mono text-caption font-semibold text-ink mt-0.5">${subtotal.toLocaleString()}</div>
                </div>
                <div className="p-3 space-y-3">
                  {stageDeals.map((d) => (
                    <div
                      key={d.id}
                      draggable
                      onDragStart={() => setDragging(d.id)}
                      onDragEnd={() => setDragging(null)}
                      onClick={() => openDeal(d)}
                      data-testid={`deal-${d.id}`}
                      className="shadow-card p-3 cursor-grab active:cursor-grabbing hover:shadow-card-hover hover:border-ink"
                    >
                      <div className="font-medium text-body truncate">{d.title}</div>
                      <div className="text-caption text-ink-muted mt-1 truncate">
                        {d.lead?.first_name} {d.lead?.last_name} · {d.lead?.company}
                      </div>
                      <div className="mt-3 flex justify-between items-center">
                        <span className="font-mono text-body font-bold text-ink">
                          ${Number(d.value || 0).toLocaleString()}
                        </span>
                        <div className="flex items-center gap-2">
                          {d.lead?.id && (
                            <Link to={`/app/voice-eq/calls?lead_id=${d.lead.id}`} onClick={(e) => e.stopPropagation()}
                              data-testid={`deal-call-history-${d.id}`} title="Call history"
                              className="text-ink-muted hover:text-ink">
                              <Phone size={12} />
                            </Link>
                          )}
                          <span className="ui-label">{s.t}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {stageDeals.length === 0 && (
                    <div className="text-caption text-ink-muted text-center py-8">Drop deals here</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Deal detail drawer */}
      {active && (
        <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50">
          <div className="bg-white border border-line p-6 rounded-2xl w-full max-w-md space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-section font-display font-semibold">Edit deal</div>
              <button onClick={() => setActive(null)} className="text-ink-muted hover:text-ink"><X size={18} /></button>
            </div>
            <p className="text-caption text-ink-muted">
              {active.lead?.first_name} {active.lead?.last_name} · {active.lead?.company}
            </p>
            <input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
              placeholder="Title" data-testid="edit-deal-title" className="w-full border border-line px-3 py-2 rounded-sm" />
            <div className="flex gap-2">
              <input type="number" value={editForm.value} onChange={(e) => setEditForm({ ...editForm, value: e.target.value })}
                placeholder="Value" data-testid="edit-deal-value" className="w-1/2 border border-line px-3 py-2 rounded-sm" />
              <select value={editForm.stage} onChange={(e) => setEditForm({ ...editForm, stage: e.target.value })}
                data-testid="edit-deal-stage" className="w-1/2 border border-line px-3 py-2 rounded-sm">
                {STAGES.map((s) => <option key={s.k} value={s.k}>{s.t}</option>)}
              </select>
            </div>
            <textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
              rows={4} placeholder="Notes…" data-testid="edit-deal-notes" className="w-full border border-line px-3 py-2 rounded-sm text-input" />
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setActive(null)} className="btn-secondary">Cancel</button>
              <button onClick={saveDeal} data-testid="save-deal-btn" className="btn-primary"><Save size={13} /> Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Add deal modal */}
      {creating && (
        <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50">
          <div className="bg-white border border-line p-6 rounded-2xl w-full max-w-md space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-section font-display font-semibold">Add deal</div>
              <button onClick={() => setCreating(false)} className="text-ink-muted hover:text-ink"><X size={18} /></button>
            </div>
            <select value={newDeal.lead_id} onChange={(e) => setNewDeal({ ...newDeal, lead_id: e.target.value })}
              data-testid="new-deal-lead" className="w-full border border-line px-3 py-2 rounded-sm">
              <option value="">Pick a lead…</option>
              {leads.map((l) => (
                <option key={l.id} value={l.id}>{l.first_name} {l.last_name} — {l.company || l.email}</option>
              ))}
            </select>
            <input value={newDeal.title} onChange={(e) => setNewDeal({ ...newDeal, title: e.target.value })}
              placeholder="Deal title" data-testid="new-deal-title" className="w-full border border-line px-3 py-2 rounded-sm" />
            <div className="flex gap-2">
              <input type="number" value={newDeal.value} onChange={(e) => setNewDeal({ ...newDeal, value: e.target.value })}
                placeholder="Value" data-testid="new-deal-value" className="w-1/2 border border-line px-3 py-2 rounded-sm" />
              <select value={newDeal.stage} onChange={(e) => setNewDeal({ ...newDeal, stage: e.target.value })}
                data-testid="new-deal-stage" className="w-1/2 border border-line px-3 py-2 rounded-sm">
                {STAGES.map((s) => <option key={s.k} value={s.k}>{s.t}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setCreating(false)} className="btn-secondary">Cancel</button>
              <button onClick={createDeal} data-testid="save-new-deal-btn" className="btn-primary">Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
