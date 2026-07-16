import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Link } from "react-router-dom";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Play, Pause, Plus } from "lucide-react";

export default function Campaigns() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => api.get("/campaigns").then((r) => { setItems(r.data); setLoading(false); });
  useEffect(() => { load(); }, []);

  const launch = async (id) => {
    try { await api.post(`/campaigns/${id}/launch`); toast.success("Campaign launched"); load(); }
    catch { toast.error("Launch failed"); }
  };
  const pause = async (id) => {
    try { await api.post(`/campaigns/${id}/pause`); toast.success("Paused"); load(); }
    catch { toast.error("Pause failed"); }
  };

  return (
    <div>
      <PageHeader
        title="Campaigns"
        subtitle="Multi-step sequences with AI personalization and hard-stop on reply."
        right={<Link to="/app/campaigns/new" data-testid="btn-new-campaign" className="btn-primary"><Plus size={14} /> New campaign</Link>}
      />
      <div className="animate-fade-in px-6 sm:px-8">
        {loading ? <div className="text-neutral-400 text-sm">Loading…</div> : items.length === 0 ? (
          <div className="shadow-card p-10 text-center rounded-2xl">
            <div className="font-display text-xl font-semibold">No campaigns yet</div>
            <p className="text-sm text-neutral-400 mt-2">Create your first sequence to start booking meetings.</p>
            <Link to="/app/campaigns/new" className="btn-primary mt-6 inline-flex">Create campaign</Link>
          </div>
        ) : (
          <div className="card-floating p-4 border border-line bg-white overflow-x-auto rounded-2xl">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="border-b border-line text-neutral-400">
                  <th className="ui-label text-left p-4">Campaign</th>
                  <th className="ui-label text-left p-4">Status</th>
                  <th className="ui-label text-right p-4">Sent</th>
                  <th className="ui-label text-right p-4">Opens</th>
                  <th className="ui-label text-right p-4">Replies</th>
                  <th className="ui-label text-right p-4">Meetings</th>
                  <th className="p-4"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <tr key={c.id} className="border-b border-line hover:bg-surfacehover">
                    <td className="p-4">
                      <Link to={`/app/campaigns/${c.id}`} data-testid={`campaign-row-${c.id}`} className="font-medium hover:text-sanguine">{c.name}</Link>
                      <div className="text-xs text-neutral-400 font-mono">{c.steps?.length || 0} steps · {c.lead_ids?.length || 0} leads</div>
                    </td>
                    <td className="p-4">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="p-4 text-right font-mono">{c.stats?.sent || 0}</td>
                    <td className="p-4 text-right font-mono">{c.stats?.opened || 0}</td>
                    <td className="p-4 text-right font-mono">{c.stats?.replied || 0}</td>
                    <td className="p-4 text-right font-mono">{c.stats?.meetings || 0}</td>
                    <td className="p-4 text-right">
                      {c.status === "active" ? (
                        <button data-testid={`pause-${c.id}`} onClick={() => pause(c.id)} className="btn-ghost text-xs"><Pause size={12} />Pause</button>
                      ) : (
                        <button data-testid={`launch-${c.id}`} onClick={() => launch(c.id)} className="btn-ghost text-xs text-sanguine"><Play size={12} />Launch</button>
                      )}
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
    draft: "text-neutral-400 border-neutral-300",
    active: "text-green-700 border-green-700",
    paused: "text-amber-700 border-amber-500",
    completed: "text-neutral-400 border-line",
  };
  return (
    <span className={`ui-label inline-block px-2 py-1 border ${map[status] || map.draft}`}>{status}</span>
  );
}
