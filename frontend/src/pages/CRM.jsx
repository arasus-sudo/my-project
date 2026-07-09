import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";

const STAGES = [
  { k: "new", t: "New" },
  { k: "qualified", t: "Qualified" },
  { k: "meeting", t: "Meeting" },
  { k: "proposal", t: "Proposal" },
  { k: "won", t: "Won" },
  { k: "lost", t: "Lost" },
];

export default function CRM() {
  const [deals, setDeals] = useState([]);
  const [dragging, setDragging] = useState(null);

  const load = () => api.get("/deals").then((r) => setDeals(r.data));
  useEffect(() => { load(); }, []);

  const move = async (id, stage) => {
    setDeals((d) => d.map((x) => (x.id === id ? { ...x, stage } : x)));
    try { await api.put(`/deals/${id}`, { stage }); toast.success(`Moved to ${stage}`); }
    catch { toast.error("Move failed"); load(); }
  };

  return (
    <div>
      <PageHeader title="Pipeline" subtitle="Deals auto-created from interested replies." />
      <div className="p-6 overflow-x-auto">
        <div className="grid grid-cols-6 gap-0 min-w-[1100px] border border-line bg-white">
          {STAGES.map((s) => (
            <div
              key={s.k}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { if (dragging) { move(dragging, s.k); setDragging(null); } }}
              data-testid={`stage-${s.k}`}
              className="border-r border-line last:border-r-0 min-h-[70vh] bg-bone"
            >
              <div className="p-3 border-b border-line bg-white sticky top-0 z-10">
                <div className="ui-label">{s.t}</div>
                <div className="font-mono text-xs text-neutral-500">
                  {deals.filter((d) => d.stage === s.k).length} deals
                </div>
              </div>
              <div className="p-3 space-y-3">
                {deals.filter((d) => d.stage === s.k).map((d) => (
                  <div
                    key={d.id}
                    draggable
                    onDragStart={() => setDragging(d.id)}
                    onDragEnd={() => setDragging(null)}
                    data-testid={`deal-${d.id}`}
                    className="card-flat p-3 cursor-grab active:cursor-grabbing hover:border-ink"
                  >
                    <div className="font-medium text-sm truncate">{d.title}</div>
                    <div className="text-xs text-neutral-500 mt-1 truncate">
                      {d.lead?.first_name} {d.lead?.last_name} · {d.lead?.company}
                    </div>
                    <div className="mt-3 flex justify-between items-center">
                      <span className="font-mono text-sm font-bold text-sanguine">
                        ${Number(d.value || 0).toLocaleString()}
                      </span>
                      <span className="ui-label text-[9px]">{s.t}</span>
                    </div>
                  </div>
                ))}
                {deals.filter((d) => d.stage === s.k).length === 0 && (
                  <div className="text-xs text-neutral-400 text-center py-8">Drop deals here</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
