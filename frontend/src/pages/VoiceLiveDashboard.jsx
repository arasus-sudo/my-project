import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { Radio } from "lucide-react";

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
        {loading ? <div className="text-ink-muted text-body">Loading…</div> : calls.length === 0 ? (
          <div className="shadow-card rounded-2xl p-10 text-center">
            <Radio size={20} className="mx-auto text-ink-disabled mb-2" />
            <div className="text-section font-display font-semibold">No active calls</div>
            <p className="text-body text-ink-muted mt-2">Calls in progress will appear here in real time.</p>
          </div>
        ) : (
          <div className="shadow-card rounded-2xl border border-line bg-white overflow-x-auto">
            <table className="w-full text-table">
              <thead>
                <tr className="border-b border-line">
                  <th className="table-header text-left p-3">Lead</th>
                  <th className="table-header text-left p-3">Number</th>
                  <th className="table-header text-left p-3">Status</th>
                  <th className="table-header text-right p-3">Started</th>
                </tr>
              </thead>
              <tbody>
                {calls.map((c) => (
                  <tr key={c.id} className="border-b border-line last:border-0">
                    <td className="p-3 font-medium flex items-center gap-2">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
                      </span>
                      {c.lead ? `${c.lead.first_name} ${c.lead.last_name || ""}` : c.to_number}
                    </td>
                    <td className="p-3 font-mono text-tiny text-ink-muted">{c.to_number}</td>
                    <td className="p-3 text-ink-tertiary">{c.status}</td>
                    <td className="p-3 text-right text-tiny text-ink-muted">{(c.started_at || c.created_at || "").slice(11, 19)}</td>
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
