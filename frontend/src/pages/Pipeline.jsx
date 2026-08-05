import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Phone, Plus, Check } from "../icons";
import { SkeletonKanban } from "../components/ui/loading-states";
import { Modal, ModalContent } from "../components/composites/Modal";
import Button from "../components/primitives/Button";
import Input from "../components/primitives/Input";
import Select from "../components/primitives/Select";

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
  const [dragOverStage, setDragOverStage] = useState(null);
  const [active, setActive] = useState(null); // deal being viewed/edited
  const [editForm, setEditForm] = useState({});
  const [creating, setCreating] = useState(false);
  const [newDeal, setNewDeal] = useState({ lead_id: "", title: "", value: "", stage: "new" });
  const [loading, setLoading] = useState(true);

  const load = () => api.get("/deals").then((r) => { setDeals(r.data); setLoading(false); });
  useEffect(() => {
    load();
    api.get("/leads?page_size=2000").then((r) => setLeads(r.data.items || r.data)).catch(() => {});
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
            <Button variant="secondary" onClick={exportCsv}>Export CSV</Button>
            <Button variant="primary" icon={Plus} onClick={() => setCreating(true)} data-testid="add-deal-btn">Add deal</Button>
          </div>
        }
      />
      <div className="animate-fade-in px-6 sm:px-8 py-6 overflow-x-auto">
        {loading ? (
          <div style={{ padding: 16, borderRadius: "var(--radius-xl)", border: "1px solid var(--border-default)", background: "var(--bg-surface)", minWidth: 1100 }}>
            <SkeletonKanban columns={6} cardsPerColumn={2} />
          </div>
        ) : (
          <div className="flex" style={{ minWidth: 1100, borderRadius: "var(--radius-xl)", border: "1px solid var(--border-default)", background: "var(--bg-surface)", overflow: "hidden" }}>
            {STAGES.map((s, si) => {
              const stageDeals = deals.filter((d) => d.stage === s.k);
              const subtotal = stageDeals.reduce((sum, d) => sum + Number(d.value || 0), 0);
              const isDragOver = dragOverStage === s.k;
              return (
                <div
                  key={s.k}
                  onDragOver={(e) => { e.preventDefault(); setDragOverStage(s.k); }}
                  onDragLeave={() => setDragOverStage((cur) => (cur === s.k ? null : cur))}
                  onDrop={() => { if (dragging) { move(dragging, s.k); setDragging(null); } setDragOverStage(null); }}
                  data-testid={`stage-${s.k}`}
                  className="flex-1 min-h-[70vh]"
                  style={{
                    borderRight: si < STAGES.length - 1 ? "1px solid var(--border-default)" : "none",
                    background: isDragOver ? "var(--bg-selected)" : "var(--bg-surface-sunken)",
                    outline: isDragOver ? "1px dashed var(--color-primary-border)" : "none",
                    outlineOffset: -1,
                  }}
                >
                  <div className="sticky top-0 z-10" style={{ padding: 12, borderBottom: "1px solid var(--border-default)", background: "var(--bg-surface)" }}>
                    <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{s.t}</div>
                    <div className="tnum" style={{ fontSize: 12, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{stageDeals.length} deals</div>
                    <div className="tnum" style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-mono)", marginTop: 2 }}>${subtotal.toLocaleString()}</div>
                  </div>
                  <div className="space-y-2" style={{ padding: 12 }}>
                    {stageDeals.map((d) => (
                      <div
                        key={d.id}
                        draggable
                        onDragStart={() => setDragging(d.id)}
                        onDragEnd={() => setDragging(null)}
                        onClick={() => openDeal(d)}
                        data-testid={`deal-${d.id}`}
                        className="cursor-grab active:cursor-grabbing transition-shadow"
                        style={{
                          padding: 12, borderRadius: "var(--radius-lg)", background: "var(--bg-surface)",
                          border: "1px solid var(--border-default)", boxShadow: "var(--shadow-xs)",
                        }}
                      >
                        <div className="truncate" style={{ fontWeight: 500, fontSize: 13.5, color: "var(--text-primary)" }}>{d.title}</div>
                        <div className="truncate" style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 4 }}>
                          {d.lead?.first_name} {d.lead?.last_name} · {d.lead?.company}
                        </div>
                        <div className="flex justify-between items-center" style={{ marginTop: 10 }}>
                          <span className="tnum" style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                            ${Number(d.value || 0).toLocaleString()}
                          </span>
                          {d.lead?.id && (
                            <Link to={`/app/voice-eq/calls?lead_id=${d.lead.id}`} onClick={(e) => e.stopPropagation()}
                              data-testid={`deal-call-history-${d.id}`} title="Call history"
                              style={{ color: "var(--text-tertiary)" }}>
                              <Phone size={12} strokeWidth={1.5} aria-hidden="true" />
                            </Link>
                          )}
                        </div>
                      </div>
                    ))}
                    {stageDeals.length === 0 && (
                      <div className="text-center" style={{ padding: "32px 0", fontSize: 12, color: "var(--text-tertiary)" }}>Drop deals here</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Modal open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        {active && (
          <ModalContent
            size="sm"
            title="Edit deal"
            subtitle={`${active.lead?.first_name || ""} ${active.lead?.last_name || ""} · ${active.lead?.company || ""}`}
            footer={
              <>
                <Button variant="secondary" onClick={() => setActive(null)}>Cancel</Button>
                <Button variant="primary" icon={Check} onClick={saveDeal} data-testid="save-deal-btn">Save</Button>
              </>
            }
          >
            <div className="space-y-3">
              <Input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} placeholder="Title" data-testid="edit-deal-title" />
              <div className="grid grid-cols-2 gap-3">
                <Input type="number" value={editForm.value} onChange={(e) => setEditForm({ ...editForm, value: e.target.value })} placeholder="Value" data-testid="edit-deal-value" />
                <Select value={editForm.stage} onChange={(v) => setEditForm({ ...editForm, stage: v })} data-testid="edit-deal-stage"
                  options={STAGES.map((s) => ({ value: s.k, label: s.t }))} />
              </div>
              <Input as="textarea" rows={4} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} placeholder="Notes…" data-testid="edit-deal-notes" />
            </div>
          </ModalContent>
        )}
      </Modal>

      <Modal open={creating} onOpenChange={setCreating}>
        <ModalContent
          size="sm"
          title="Add deal"
          footer={
            <>
              <Button variant="secondary" onClick={() => setCreating(false)}>Cancel</Button>
              <Button variant="primary" onClick={createDeal} data-testid="save-new-deal-btn">Create</Button>
            </>
          }
        >
          <div className="space-y-3">
            <Select
              value={newDeal.lead_id} onChange={(v) => setNewDeal({ ...newDeal, lead_id: v })} data-testid="new-deal-lead"
              placeholder="Pick a lead…"
              options={leads.map((l) => ({ value: l.id, label: `${l.first_name} ${l.last_name} — ${l.company || l.email}` }))}
            />
            <Input value={newDeal.title} onChange={(e) => setNewDeal({ ...newDeal, title: e.target.value })} placeholder="Deal title" data-testid="new-deal-title" />
            <div className="grid grid-cols-2 gap-3">
              <Input type="number" value={newDeal.value} onChange={(e) => setNewDeal({ ...newDeal, value: e.target.value })} placeholder="Value" data-testid="new-deal-value" />
              <Select value={newDeal.stage} onChange={(v) => setNewDeal({ ...newDeal, stage: v })} data-testid="new-deal-stage"
                options={STAGES.map((s) => ({ value: s.k, label: s.t }))} />
            </div>
          </div>
        </ModalContent>
      </Modal>
    </div>
  );
}
