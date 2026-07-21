import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Link } from "react-router-dom";
import { PageHeader } from "../components/AppLayout";
import { Plus, Trash2 } from "lucide-react";

export default function VoiceAgents() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => api.get("/voice-eq/agents").then((r) => { setItems(r.data); setLoading(false); });
  useEffect(() => { load(); }, []);

  const remove = async (id) => { await api.delete(`/voice-eq/agents/${id}`); load(); };

  return (
    <div>
      <PageHeader
        title="Voice Agents"
        subtitle="Personas that place and answer calls — persona, voice, and qualification schema."
        right={<Link to="/app/voice-eq/agents/new" className="btn-primary"><Plus size={14} /> New agent</Link>}
      />
      <div className="animate-fade-in px-6 sm:px-8">
        {loading ? <div className="text-ink-muted text-body">Loading…</div> : items.length === 0 ? (
          <div className="shadow-card rounded-2xl p-10 text-center">
            <div className="text-section font-display font-semibold">No voice agents yet</div>
            <p className="text-body text-ink-muted mt-2">Create a persona to start calling leads.</p>
            <Link to="/app/voice-eq/agents/new" className="btn-primary mt-6 inline-flex">Create agent</Link>
          </div>
        ) : (
          <div className="shadow-card rounded-2xl border border-line bg-white overflow-x-auto">
            <table className="w-full text-table">
              <thead>
                <tr className="border-b border-line">
                  <th className="table-header text-left p-4">Agent</th>
                  <th className="table-header text-left p-4">Model</th>
                  <th className="table-header text-left p-4">Voice</th>
                  <th className="table-header text-left p-4">Inbound</th>
                  <th className="table-header text-right p-4">Calls</th>
                </tr>
              </thead>
              <tbody>
                {items.map((a) => (
                  <tr key={a.id} className="border-b border-line hover:bg-surfacehover">
                    <td className="p-4">
                      <Link to={`/app/voice-eq/agents/${a.id}`} className="font-medium hover:text-sanguine">{a.name}</Link>
                      <div className="text-tiny text-ink-muted font-mono">v{a.version || 1}</div>
                    </td>
                    <td className="p-4 text-tiny text-ink-tertiary font-mono">{(a.config?.model || "").replace("-realtime-preview", "")}</td>
                    <td className="p-4 font-mono text-tiny text-ink-tertiary">{a.config?.voice || "alloy"}</td>
                    <td className="p-4">
                      {a.inbound_enabled ? <span className="text-success text-tiny font-medium">On</span> : <span className="text-ink-muted text-tiny">Off</span>}
                    </td>
                    <td className="p-4 text-right font-mono text-tiny text-ink-tertiary">{a.call_count || 0}</td>
                    <td className="p-4 text-right">
                      <button onClick={() => remove(a.id)} className="text-caption text-danger hover:underline inline-flex items-center gap-1">
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
