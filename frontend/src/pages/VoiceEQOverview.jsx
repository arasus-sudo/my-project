import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { Bot, PhoneCall, PhoneOutgoing, Clock } from "lucide-react";

export default function VoiceEQOverview() {
  const [agents, setAgents] = useState([]);
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.get("/voice-eq/agents"), api.get("/voice-eq/calls")])
      .then(([a, c]) => { setAgents(a.data); setCalls(c.data); setLoading(false); });
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const callsToday = calls.filter((c) => (c.created_at || "").slice(0, 10) === today);
  const connected = calls.filter((c) => ["ended", "ongoing"].includes(c.status)).length;
  const connectRate = calls.length ? Math.round((connected / calls.length) * 100) : 0;
  const totalMinutes = Math.round(calls.reduce((s, c) => s + (c.duration_seconds || 0), 0) / 60);

  return (
    <div>
      <PageHeader
        title="Voice EQ"
        subtitle="AI calling agent — reads leads from the CRM, places calls, qualifies, and updates the pipeline."
      />
      <div className="animate-fade-in px-6 sm:px-8 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard icon={Bot} label="Voice agents" value={loading ? "—" : agents.length} />
          <StatCard icon={PhoneOutgoing} label="Calls today" value={loading ? "—" : callsToday.length} />
          <StatCard icon={PhoneCall} label="Connect rate" value={loading ? "—" : `${connectRate}%`} />
          <StatCard icon={Clock} label="Minutes used" value={loading ? "—" : totalMinutes} />
        </div>

        {!loading && agents.length === 0 && (
          <div className="shadow-card rounded-2xl p-10 text-center">
            <div className="text-section font-display font-semibold">Set up your first calling agent</div>
            <p className="text-body text-ink-muted mt-2">Define a persona, pick a voice, and start calling leads from your CRM.</p>
            <Link to="/app/voice-eq/agents/new" className="btn-primary mt-6 inline-flex">Create voice agent</Link>
          </div>
        )}

        {!loading && calls.length > 0 && (
          <div className="shadow-card rounded-2xl border border-line bg-white">
            <div className="p-4 border-b border-line text-card-title font-display font-semibold">Recent calls</div>
            <div className="overflow-x-auto">
            <table className="w-full text-table">
              <tbody>
                {calls.slice(0, 8).map((c) => (
                  <tr key={c.id} className="border-b border-line last:border-0">
                    <td className="p-3">{c.lead ? `${c.lead.first_name} ${c.lead.last_name || ""}` : c.to_number}</td>
                    <td className="p-3 font-mono text-tiny text-ink-muted">{c.to_number}</td>
                    <td className="p-3 text-ink-tertiary">{c.status}</td>
                    <td className="p-3 text-right text-tiny text-ink-muted">{(c.created_at || "").slice(0, 16).replace("T", " ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }) {
  return (
    <div className="shadow-card rounded-2xl p-4">
      <div className="flex items-center gap-2 text-ink-muted">
        <Icon size={14} />
        <span className="ui-label">{label}</span>
      </div>
      <div className="text-page-title font-display font-semibold mt-1">{value}</div>
    </div>
  );
}
