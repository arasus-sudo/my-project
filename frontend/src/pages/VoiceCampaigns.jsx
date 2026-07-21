import { useEffect, useState } from "react";
import { api, isCreditError } from "../lib/api";
import { Link } from "react-router-dom";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Play, Pause, Plus, Trash2 } from "lucide-react";

export default function VoiceCampaigns() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => api.get("/voice-eq/campaigns").then((r) => { setItems(r.data); setLoading(false); });
  useEffect(() => { load(); }, []);

  const launch = async (id) => {
    try { const { data } = await api.post(`/voice-eq/campaigns/${id}/launch`); toast.success(`Launched — ${data.calls_placed} call(s) placed`); load(); }
    catch (err) { if (!isCreditError(err)) toast.error(err?.response?.data?.detail || "Launch failed"); }
  };
  const pause = async (id) => {
    try { await api.post(`/voice-eq/campaigns/${id}/pause`); toast.success("Paused"); load(); }
    catch { toast.error("Pause failed"); }
  };
  const remove = async (id) => {
    if (!confirm("Delete this voice campaign?")) return;
    try { await api.delete(`/voice-eq/campaigns/${id}`); toast.success("Deleted"); load(); }
    catch { toast.error("Delete failed"); }
  };

  return (
    <div>
      <PageHeader
        title="Voice Campaigns"
        subtitle="Dial a lead list with a voice agent, respecting call windows and timezone."
        right={<Link to="/app/voice-eq/campaigns/new" className="btn-primary"><Plus size={14} /> New campaign</Link>}
      />
      <div className="animate-fade-in px-6 sm:px-8">
        {loading ? <div className="text-ink-muted text-body">Loading…</div> : items.length === 0 ? (
          <div className="shadow-card rounded-2xl p-10 text-center">
            <div className="text-section font-display font-semibold">No voice campaigns yet</div>
            <p className="text-body text-ink-muted mt-2">Pick an agent and a lead list to start dialing.</p>
            <Link to="/app/voice-eq/campaigns/new" className="btn-primary mt-6 inline-flex">Create campaign</Link>
          </div>
        ) : (
          <div className="shadow-card rounded-2xl border border-line bg-white overflow-x-auto">
            <table className="w-full text-table">
              <thead>
                <tr className="border-b border-line">
                  <th className="table-header text-left p-4">Campaign</th>
                  <th className="table-header text-left p-4">Status</th>
                  <th className="table-header text-right p-4">Calls</th>
                  <th className="table-header text-right p-4">Connected</th>
                  <th className="table-header text-right p-4">Qualified</th>
                  <th className="table-header text-right p-4">Minutes</th>
                  <th className="p-4"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <tr key={c.id} className="border-b border-line hover:bg-surfacehover">
                    <td className="p-4">
                      <Link to={`/app/voice-eq/campaigns/${c.id}`} className="font-medium hover:text-sanguine">{c.name}</Link>
                      <div className="text-tiny text-ink-muted font-mono">{c.lead_ids?.length || 0} leads · {c.send_window_start}–{c.send_window_end} {c.timezone}</div>
                    </td>
                    <td className="p-4"><StatusBadge status={c.status} /></td>
                    <td className="p-4 text-right font-mono">{c.stats?.calls_placed || 0}</td>
                    <td className="p-4 text-right font-mono">{c.stats?.connected || 0}</td>
                    <td className="p-4 text-right font-mono">{c.stats?.qualified || 0}</td>
                    <td className="p-4 text-right font-mono">{c.stats?.total_minutes || 0}</td>
                    <td className="p-4 text-right flex items-center justify-end gap-1">
                      {c.status === "active" ? (
                        <button onClick={() => pause(c.id)} className="btn-ghost text-xs"><Pause size={12} />Pause</button>
                      ) : (
                        <button onClick={() => launch(c.id)} className="btn-ghost text-xs text-sanguine"><Play size={12} />Launch</button>
                      )}
                      <button onClick={() => remove(c.id)} className="btn-ghost text-xs text-ink-muted hover:text-danger"><Trash2 size={12} /></button>
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
    draft: "text-ink-tertiary border-neutral-300",
    active: "text-success border-success",
    paused: "text-warning border-warning",
    completed: "text-ink-muted border-line",
  };
  return (
    <span className={`ui-label inline-block px-2 py-1 border ${map[status] || map.draft}`}>{status}</span>
  );
}
