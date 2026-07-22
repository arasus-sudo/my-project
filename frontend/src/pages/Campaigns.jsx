import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Link, useNavigate } from "react-router-dom";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Play, Pause, Plus, Workflow, Trash2 } from "lucide-react";

export default function Campaigns() {
  const nav = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => api.get("/campaigns").then((r) => { setItems(r.data); setLoading(false); });
  useEffect(() => { load(); }, []);

  const launch = async (id, skipPending) => {
    if (skipPending === undefined) {
      try {
        await api.post(`/campaigns/${id}/launch`);
        toast.success("Campaign launched"); load();
      } catch (err) {
        if (err?.response?.status === 400 && err?.response?.data?.detail?.includes("Review incomplete")) {
          toast.info("Send approved leads only?", {
            description: "Some leads need review — send to only those already approved",
            action: { label: "Send approved", onClick: () => launch(id, true) },
            duration: 10000,
          });
        } else {
          toast.error(err?.response?.data?.detail || "Launch failed");
        }
      }
      return;
    }
    try { await api.post(`/campaigns/${id}/launch?skip_pending=true`); toast.success("Campaign launched"); load(); }
    catch (err) { toast.error(err?.response?.data?.detail || "Launch failed"); }
  };
  const pause = async (id) => {
    try { await api.post(`/campaigns/${id}/pause`); toast.success("Paused"); load(); }
    catch { toast.error("Pause failed"); }
  };
  const remove = async (id) => {
    if (!window.confirm("Delete this campaign? This cannot be undone.")) return;
    try { await api.delete(`/campaigns/${id}`); toast.success("Campaign deleted"); load(); }
    catch { toast.error("Delete failed"); }
  };

  return (
    <div>
      <PageHeader
        title="Campaigns"
        subtitle="Multi-step sequences with AI personalization and hard-stop on reply."
        right={
          <div className="flex gap-2">
            <button onClick={() => nav("/app/campaigns/wizard")} data-testid="btn-ai-campaign" className="btn-secondary"><Workflow size={14} /> Campaign Wizard</button>
            <Link to="/app/campaigns/new" data-testid="btn-new-campaign" className="btn-primary"><Plus size={14} /> New campaign</Link>
          </div>
        }
      />
      <div className="animate-fade-in px-6 sm:px-8">
        {loading ? <div className="text-body text-ink-muted">Loading…</div> : items.length === 0 ? (
          <div className="shadow-card p-10 text-center rounded-2xl">
            <div className="text-section font-display font-semibold">No campaigns yet</div>
            <p className="text-body text-ink-muted mt-2">Create your first sequence to start booking meetings.</p>
            <Link to="/app/campaigns/new" className="btn-primary mt-6 inline-flex">Create campaign</Link>
          </div>
        ) : (
          <div className="card-floating p-4 border border-line bg-white overflow-x-auto rounded-2xl">
            <table className="w-full text-table min-w-[700px]">
              <thead>
                <tr className="border-b border-line">
                  <th className="table-header text-left p-4">Campaign</th>
                  <th className="table-header text-left p-4">Status</th>
                  <th className="table-header text-right p-4">Sent</th>
                  <th className="table-header text-right p-4">Opens</th>
                  <th className="table-header text-right p-4">Replies</th>
                  <th className="table-header text-right p-4">Meetings</th>
                  <th className="p-4"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <tr key={c.id} className="border-b border-line hover:bg-surfacehover">
                    <td className="p-4">
                      <Link to={`/app/campaigns/${c.id}`} data-testid={`campaign-row-${c.id}`} className="font-medium hover:text-ink">{c.name}</Link>
                      <div className="text-tiny text-ink-muted font-mono">{c.steps?.length || 0} steps · {c.lead_ids?.length || 0} leads</div>
                      {c.lead_ids?.length > 0 && (
                        <div className="text-tiny text-ink-muted font-mono mt-0.5">
                          {c.lead_ids.length} lead{c.lead_ids.length === 1 ? "" : "s"} · {(c.personalized_emails || []).filter((p) => p.status === "approved").length} approved
                        </div>
                      )}
                    </td>
                    <td className="p-4">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="p-4 text-right font-mono">{c.stats?.sent || 0}</td>
                    <td className="p-4 text-right font-mono">{c.stats?.opened || 0}</td>
                    <td className="p-4 text-right font-mono">{c.stats?.replied || 0}</td>
                    <td className="p-4 text-right font-mono">{c.stats?.meetings || 0}</td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {c.status === "active" ? (
                          <button data-testid={`pause-${c.id}`} onClick={() => pause(c.id)} className="btn-ghost text-xs"><Pause size={12} />Pause</button>
                        ) : (
                          <button data-testid={`launch-${c.id}`} onClick={() => launch(c.id)} className="btn-ghost text-xs text-ink"><Play size={12} />Launch</button>
                        )}
                        <button data-testid={`delete-${c.id}`} onClick={() => remove(c.id)} className="btn-ghost text-xs text-danger hover:text-danger"><Trash2 size={12} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    draft: "text-ink-muted border-neutral-300",
    active: "text-success border-success",
    paused: "text-warning border-warning",
    completed: "text-ink-muted border-line",
  };
  return (
    <span className={`ui-label inline-block px-2 py-1 border ${map[status] || map.draft}`}>{status}</span>
  );
}
