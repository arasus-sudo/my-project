import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Link } from "react-router-dom";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import VoiceProviderBadge from "../components/VoiceProviderBadge";

export default function VoiceAgents() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(null);

  const load = () => api.get("/voice-eq/agents").then((r) => { setItems(r.data); setLoading(false); });
  useEffect(() => { load(); }, []);

  const sync = async (agent) => {
    setSyncing(agent.id);
    try {
      await api.post(`/voice-eq/agents/${agent.id}/sync`);
      toast.success(`Synced to ${agent.provider === "twilio_openai" ? "Twilio + OpenAI" : "Retell"}`);
      load();
    }
    catch (err) { toast.error(err?.response?.data?.detail || "Sync failed"); }
    finally { setSyncing(null); }
  };
  const remove = async (id) => {
    await api.delete(`/voice-eq/agents/${id}`);
    load();
  };

  return (
    <div>
      <PageHeader
        title="Voice Agents"
        subtitle="Personas that place and answer calls — persona, voice, and qualification schema."
        right={<Link to="/app/voice-eq/agents/new" data-testid="btn-new-agent" className="btn-primary"><Plus size={14} /> New agent</Link>}
      />
      <div className="animate-fade-in px-6 sm:px-8">
        {loading ? <div className="text-neutral-400 text-sm">Loading…</div> : items.length === 0 ? (
          <div className="shadow-card rounded-2xl p-10 text-center">
            <div className="font-display text-xl sm:text-2xl font-semibold">No voice agents yet</div>
            <p className="text-sm text-neutral-400 mt-2">Create a persona to start calling leads.</p>
            <Link to="/app/voice-eq/agents/new" className="btn-primary mt-6 inline-flex">Create agent</Link>
          </div>
        ) : (
          <div className="shadow-card rounded-2xl border border-line bg-white overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-neutral-400">
                  <th className="ui-label text-left p-4">Agent</th>
                  <th className="ui-label text-left p-4">Provider</th>
                  <th className="ui-label text-left p-4">Purpose</th>
                  <th className="ui-label text-left p-4">Voice</th>
                  <th className="ui-label text-left p-4">Status</th>
                  <th className="p-4"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((a) => (
                  <tr key={a.id} className="border-b border-line hover:bg-surfacehover">
                    <td className="p-4">
                      <Link to={`/app/voice-eq/agents/${a.id}`} data-testid={`agent-row-${a.id}`} className="font-medium hover:text-sanguine">{a.name}</Link>
                      <div className="text-xs text-neutral-400 font-mono">v{a.version} · {a.language}</div>
                    </td>
                    <td className="p-4"><VoiceProviderBadge provider={a.provider} /></td>
                    <td className="p-4 text-neutral-500 capitalize">{a.purpose}</td>
                    <td className="p-4 font-mono text-xs text-neutral-500">{a.voice_id}</td>
                    <td className="p-4"><StatusBadge status={a.status} /></td>
                    <td className="p-4 text-right space-x-2 whitespace-nowrap">
                      <button data-testid={`sync-${a.id}`} onClick={() => sync(a)} disabled={syncing === a.id}
                        className="btn-ghost text-xs">
                        <RefreshCw size={12} className={syncing === a.id ? "animate-spin" : ""} /> Sync
                      </button>
                      <button onClick={() => remove(a.id)} data-testid={`delete-agent-${a.id}`} className="text-xs text-red-600 hover:underline inline-flex items-center gap-1">
                        <Trash2 size={12} /> delete
                      </button>
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
    draft: "text-neutral-500 border-neutral-300",
    synced: "text-green-700 border-green-700",
    sync_error: "text-red-700 border-red-500",
  };
  return (
    <span className={`ui-label inline-block px-2 py-1 border ${map[status] || map.draft}`}>{status}</span>
  );
}
