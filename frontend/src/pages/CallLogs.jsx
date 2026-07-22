import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { X } from "lucide-react";

const STATUS_COLOR = {
  registered: "text-ink-muted border-neutral-300",
  ongoing: "text-info border-info",
  ended: "text-success border-success",
  error: "text-danger border-danger",
  voicemail: "text-warning border-warning",
  no_answer: "text-ink-muted border-neutral-300",
  busy: "text-ink-muted border-neutral-300",
};

const SENTIMENT_COLOR = { positive: "text-success", neutral: "text-ink-muted", negative: "text-danger" };

export default function CallLogs() {
  const [params] = useSearchParams();
  const leadId = params.get("lead_id");
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    const q = leadId ? { lead_id: leadId } : {};
    api.get("/voice-eq/calls", { params: q }).then((r) => { setCalls(r.data); setLoading(false); });
  }, [leadId]);

  return (
    <div>
      <PageHeader title="Call Logs" subtitle={leadId ? "Calls for this lead." : "Every call placed or received by Voice EQ."} />
      <div className="animate-fade-in px-6 sm:px-8">
        {loading ? <div className="text-ink-muted text-body">Loading…</div> : calls.length === 0 ? (
          <div className="shadow-card rounded-2xl p-10 text-center">
            <div className="text-section font-display font-semibold">No calls yet</div>
            <p className="text-body text-ink-muted mt-2">Click-to-call a lead or launch a voice campaign to see logs here.</p>
          </div>
        ) : (
          <div className="shadow-card rounded-2xl border border-line bg-white overflow-x-auto">
            <table className="w-full text-table">
              <thead>
                <tr className="border-b border-line">
                  <th className="table-header text-left p-3">Lead</th>
                  <th className="table-header text-left p-3">Number</th>
                  <th className="table-header text-left p-3">Status</th>
                  <th className="table-header text-left p-3">Sentiment</th>
                  <th className="table-header text-right p-3">Duration</th>
                  <th className="table-header text-right p-3">When</th>
                </tr>
              </thead>
              <tbody>
                {calls.map((c) => (
                  <tr key={c.id} onClick={() => setDetail(c)}
                    className="border-b border-line hover:bg-surfacehover cursor-pointer transition-colors duration-150">
                    <td className="p-3 font-medium">{c.lead ? `${c.lead.first_name} ${c.lead.last_name || ""}` : "—"}</td>
                    <td className="p-3 font-mono text-tiny text-ink-muted">{c.to_number}</td>
                    <td className="p-3"><span className={`ui-label inline-block px-2 py-0.5 border ${STATUS_COLOR[c.status] || STATUS_COLOR.registered}`}>{c.status}</span></td>
                    <td className={`p-3 text-caption ${SENTIMENT_COLOR[c.sentiment] || "text-ink-muted"}`}>{c.sentiment || "—"}</td>
                    <td className="p-3 text-right font-mono">{c.duration_seconds ? `${Math.round(c.duration_seconds / 6) / 10}m` : "—"}</td>
                    <td className="p-3 text-right text-tiny text-ink-muted">{(c.created_at || "").slice(0, 16).replace("T", " ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detail && (
        <div className="fixed inset-0 bg-ink/40 flex items-center justify-end z-50" onClick={(e) => e.target === e.currentTarget && setDetail(null)}>
          <div className="bg-white border-l border-line h-full w-full max-w-lg overflow-y-auto p-4 sm:p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-section font-display font-semibold">{detail.lead ? `${detail.lead.first_name} ${detail.lead.last_name || ""}` : detail.to_number}</div>
                <div className="text-tiny text-ink-muted font-mono mt-1">{detail.to_number} · {detail.status}</div>
              </div>
              <button onClick={() => setDetail(null)} className="text-ink-muted hover:text-ink"><X size={16} /></button>
            </div>

            {detail.summary && (
              <div>
                <div className="ui-label mb-1">Summary</div>
                <p className="text-body">{detail.summary}</p>
              </div>
            )}

            {detail.qualification && Object.keys(detail.qualification).length > 0 && (
              <div>
                <div className="ui-label mb-1">Qualification</div>
                <div className="space-y-1">
                  {Object.entries(detail.qualification).map(([k, v]) => (
                    <div key={k} className="text-body flex gap-2">
                      <span className="font-mono text-tiny text-ink-muted min-w-[100px]">{k}</span>
                      <span>{String(v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {detail.recording_url && (
              <div>
                <div className="ui-label mb-1">Recording</div>
                <audio controls src={detail.recording_url} className="w-full" />
              </div>
            )}

            {detail.transcript && (
              <div>
                <div className="ui-label mb-1">Transcript</div>
                <pre className="text-body whitespace-pre-wrap bg-surfacehover p-3 rounded-sm font-mono">{detail.transcript}</pre>
              </div>
            )}

            {!detail.summary && !detail.transcript && !detail.recording_url && (
              <p className="text-body text-ink-muted">Call is still in progress or hasn't been analyzed yet.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
