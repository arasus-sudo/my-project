import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Link } from "react-router-dom";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Play, Pause, Plus } from "lucide-react";

export default function VoiceCampaigns() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => api.get("/voice-eq/campaigns").then((r) => { setItems(r.data); setLoading(false); });
  useEffect(() => { load(); }, []);

  const launch = async (id) => {
    try { const { data } = await api.post(`/voice-eq/campaigns/${id}/launch`); toast.success(`Launched — ${data.calls_placed} call(s) placed`); load(); }
    catch (err) { toast.error(err?.response?.data?.detail || "Launch failed"); }
  };
  const pause = async (id) => {
    try { await api.post(`/voice-eq/campaigns/${id}/pause`); toast.success("Paused"); load(); }
    catch { toast.error("Pause failed"); }
  };

  return (
    <div>
      <PageHeader
        title="Voice Campaigns"
        subtitle="Dial a lead list with a voice agent, respecting call windows and timezone."
        right={<Link to="/app/voice-eq/campaigns/new" data-testid="btn-new-voice-campaign" className="btn-primary"><Plus size={14} /> New campaign</Link>}
      />
      <div className="p-6">
        {loading ? <div className="text-neutral-500 text-sm">Loading…</div> : items.length === 0 ? (
          <div className="card-flat p-10 text-center">
            <div className="font-display text-xl font-bold">No voice campaigns yet</div>
            <p className="text-sm text-neutral-500 mt-2">Pick an agent and a lead list to start dialing.</p>
            <Link to="/app/voice-eq/campaigns/new" className="btn-primary mt-6 inline-flex">Create campaign</Link>
          </div>
        ) : (
          <div className="border border-line bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-neutral-500">
                  <th className="ui-label text-left p-4">Campaign</th>
                  <th className="ui-label text-left p-4">Status</th>
                  <th className="ui-label text-right p-4">Calls</th>
                  <th className="ui-label text-right p-4">Connected</th>
                  <th className="ui-label text-right p-4">Qualified</th>
                  <th className="ui-label text-right p-4">Minutes</th>
                  <th className="p-4"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <tr key={c.id} className="border-b border-line hover:bg-surfacehover">
                    <td className="p-4">
                      <Link to={`/app/voice-eq/campaigns/${c.id}`} data-testid={`voice-campaign-row-${c.id}`} className="font-medium hover:text-sanguine">{c.name}</Link>
                      <div className="text-xs text-neutral-500 font-mono">{c.lead_ids?.length || 0} leads · {c.send_window_start}–{c.send_window_end} {c.timezone}</div>
                    </td>
                    <td className="p-4"><StatusBadge status={c.status} /></td>
                    <td className="p-4 text-right font-mono">{c.stats?.calls_placed || 0}</td>
                    <td className="p-4 text-right font-mono">{c.stats?.connected || 0}</td>
                    <td className="p-4 text-right font-mono">{c.stats?.qualified || 0}</td>
                    <td className="p-4 text-right font-mono">{c.stats?.total_minutes || 0}</td>
                    <td className="p-4 text-right">
                      {c.status === "active" ? (
                        <button data-testid={`pause-voice-${c.id}`} onClick={() => pause(c.id)} className="btn-ghost text-xs"><Pause size={12} />Pause</button>
                      ) : (
                        <button data-testid={`launch-voice-${c.id}`} onClick={() => launch(c.id)} className="btn-ghost text-xs text-sanguine"><Play size={12} />Launch</button>
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
    draft: "text-neutral-600 border-neutral-300",
    active: "text-green-700 border-green-700",
    paused: "text-amber-700 border-amber-500",
    completed: "text-neutral-500 border-line",
  };
  return (
    <span className={`ui-label inline-block px-2 py-1 border ${map[status] || map.draft}`}>{status}</span>
  );
}
