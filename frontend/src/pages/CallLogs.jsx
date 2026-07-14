import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { X } from "lucide-react";

const STATUS_COLOR = {
  registered: "text-neutral-500 border-neutral-300",
  ongoing: "text-blue-700 border-blue-500",
  ended: "text-green-700 border-green-700",
  error: "text-red-700 border-red-500",
  voicemail: "text-amber-700 border-amber-500",
  no_answer: "text-neutral-500 border-neutral-300",
  busy: "text-neutral-500 border-neutral-300",
};

const SENTIMENT_COLOR = { positive: "text-green-700", neutral: "text-neutral-500", negative: "text-red-600" };

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
      <div className="p-6">
        {loading ? <div className="text-neutral-500 text-sm">Loading…</div> : calls.length === 0 ? (
          <div className="card-flat p-10 text-center">
            <div className="font-display text-xl font-bold">No calls yet</div>
            <p className="text-sm text-neutral-500 mt-2">Click-to-call a lead or launch a voice campaign to see logs here.</p>
          </div>
        ) : (
          <div className="border border-line bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-neutral-500">
                  <th className="ui-label text-left p-3">Lead</th>
                  <th className="ui-label text-left p-3">Number</th>
                  <th className="ui-label text-left p-3">Status</th>
                  <th className="ui-label text-left p-3">Sentiment</th>
                  <th className="ui-label text-right p-3">Duration</th>
                  <th className="ui-label text-right p-3">When</th>
                </tr>
              </thead>
              <tbody>
                {calls.map((c) => (
                  <tr key={c.id} onClick={() => setDetail(c)} data-testid={`call-row-${c.id}`}
                    className="border-b border-line hover:bg-surfacehover cursor-pointer">
                    <td className="p-3 font-medium">{c.lead ? `${c.lead.first_name} ${c.lead.last_name || ""}` : "—"}</td>
                    <td className="p-3 font-mono text-xs text-neutral-500">{c.to_number}</td>
                    <td className="p-3"><span className={`ui-label inline-block px-2 py-0.5 border ${STATUS_COLOR[c.status] || STATUS_COLOR.registered}`}>{c.status}</span></td>
                    <td className={`p-3 text-xs ${SENTIMENT_COLOR[c.sentiment] || "text-neutral-400"}`}>{c.sentiment || "—"}</td>
                    <td className="p-3 text-right font-mono">{c.duration_seconds ? `${Math.round(c.duration_seconds / 6) / 10}m` : "—"}</td>
                    <td className="p-3 text-right text-xs text-neutral-400">{(c.created_at || "").slice(0, 16).replace("T", " ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detail && (
        <div className="fixed inset-0 bg-ink/40 flex items-center justify-end z-50" onClick={(e) => e.target === e.currentTarget && setDetail(null)}>
          <div className="bg-white border-l border-line h-full w-full max-w-lg overflow-y-auto p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-display font-bold text-xl">{detail.lead ? `${detail.lead.first_name} ${detail.lead.last_name || ""}` : detail.to_number}</div>
                <div className="text-xs text-neutral-500 font-mono">{detail.to_number} · {detail.status}</div>
              </div>
              <button onClick={() => setDetail(null)} data-testid="close-call-detail" className="text-neutral-400 hover:text-ink"><X size={18} /></button>
            </div>

            {detail.summary && (
              <div>
                <div className="ui-label mb-1">Summary</div>
                <p className="text-sm">{detail.summary}</p>
              </div>
            )}

            {detail.qualification && Object.keys(detail.qualification).length > 0 && (
              <div>
                <div className="ui-label mb-1">Qualification</div>
                <div className="space-y-1">
                  {Object.entries(detail.qualification).map(([k, v]) => (
                    <div key={k} className="text-sm flex gap-2">
                      <span className="font-mono text-xs text-neutral-500 min-w-[100px]">{k}</span>
                      <span>{String(v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {detail.recording_url && (
              <div>
                <div className="ui-label mb-1">Recording</div>
                <audio controls src={detail.recording_url} className="w-full" data-testid="call-recording-player" />
              </div>
            )}

            {detail.transcript && (
              <div>
                <div className="ui-label mb-1">Transcript</div>
                <pre className="text-xs whitespace-pre-wrap bg-surfacehover p-3 rounded-sm font-mono">{detail.transcript}</pre>
              </div>
            )}

            {!detail.summary && !detail.transcript && !detail.recording_url && (
              <p className="text-sm text-neutral-500">Call is still in progress or hasn't been analyzed yet.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
