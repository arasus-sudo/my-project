import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { Radio } from "lucide-react";
import VoiceProviderBadge from "../components/VoiceProviderBadge";

export default function VoiceLiveDashboard() {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let stopped = false;
    const poll = () => api.get("/voice-eq/calls/active").then((r) => { if (!stopped) { setCalls(r.data); setLoading(false); } });
    poll();
    const t = setInterval(poll, 4000);
    return () => { stopped = true; clearInterval(t); };
  }, []);

  return (
    <div>
      <PageHeader title="Live" subtitle="Calls currently ringing or in progress — refreshes every few seconds." />
      <div className="animate-fade-in px-6 sm:px-8">
        {loading ? <div className="text-neutral-400 text-sm">Loading…</div> : calls.length === 0 ? (
          <div className="shadow-card rounded-2xl p-10 text-center">
            <Radio size={20} className="mx-auto text-neutral-300 mb-2" />
            <div className="font-display text-xl sm:text-2xl font-semibold">No active calls</div>
            <p className="text-sm text-neutral-400 mt-2">Calls in progress will appear here in real time.</p>
          </div>
        ) : (
          <div className="shadow-card rounded-2xl border border-line bg-white overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-neutral-400">
                  <th className="ui-label text-left p-3">Lead</th>
                  <th className="ui-label text-left p-3">Number</th>
                  <th className="ui-label text-left p-3">Provider</th>
                  <th className="ui-label text-left p-3">Status</th>
                  <th className="ui-label text-right p-3">Started</th>
                </tr>
              </thead>
              <tbody>
                {calls.map((c) => (
                  <tr key={c.id} data-testid={`live-call-${c.id}`} className="border-b border-line last:border-0">
                    <td className="p-3 font-medium flex items-center gap-2">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                      </span>
                      {c.lead ? `${c.lead.first_name} ${c.lead.last_name || ""}` : c.to_number}
                    </td>
                    <td className="p-3 font-mono text-xs text-neutral-400">{c.to_number}</td>
                    <td className="p-3"><VoiceProviderBadge provider={c.provider} /></td>
                    <td className="p-3 text-neutral-500">{c.status}</td>
                    <td className="p-3 text-right text-xs text-neutral-400">{(c.started_at || c.created_at || "").slice(11, 19)}</td>
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
