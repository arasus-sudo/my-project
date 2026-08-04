import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { PhoneCall } from "../icons";
import Table from "../components/composites/Table";
import { EmptyState } from "../components/composites/EmptyState";
import { Drawer, DrawerContent } from "../components/composites/Drawer";
import StatusPill from "../components/primitives/StatusPill";

const STATUS_TONE = {
  registered: "neutral", ongoing: "primary", ended: "success",
  error: "danger", voicemail: "warning", no_answer: "neutral", busy: "neutral",
};
const SENTIMENT_COLOR = { positive: "var(--color-success)", neutral: "var(--text-tertiary)", negative: "var(--color-danger)" };

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

  const columns = [
    { key: "lead", label: "Lead", render: (c) => <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>{c.lead ? `${c.lead.first_name} ${c.lead.last_name || ""}` : "—"}</span> },
    { key: "number", label: "Number", render: (c) => <span className="tnum" style={{ fontSize: 11.5, fontFamily: "var(--font-mono)", color: "var(--text-tertiary)" }}>{c.to_number}</span> },
    { key: "status", label: "Status", render: (c) => <StatusPill status={c.status} tone={STATUS_TONE[c.status] || "neutral"} /> },
    { key: "sentiment", label: "Sentiment", render: (c) => <span style={{ fontSize: 12.5, color: SENTIMENT_COLOR[c.sentiment] || "var(--text-tertiary)" }}>{c.sentiment || "—"}</span> },
    { key: "duration", label: "Duration", align: "right", numeric: true, render: (c) => c.duration_seconds ? `${Math.round(c.duration_seconds / 6) / 10}m` : "—" },
    { key: "when", label: "When", align: "right", render: (c) => <span className="tnum" style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{(c.created_at || "").slice(0, 16).replace("T", " ")}</span> },
  ];

  return (
    <div>
      <PageHeader title="Call Logs" subtitle={leadId ? "Calls for this lead." : "Every call placed or received by Voice EQ."} />
      <div className="animate-fade-in px-6 sm:px-8 py-6">
        {loading ? (
          <div style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Loading…</div>
        ) : calls.length === 0 ? (
          <EmptyState icon={PhoneCall} title="No calls yet" description="Click-to-call a lead or launch a voice campaign to see logs here." />
        ) : (
          <Table columns={columns} rows={calls} rowKey={(c) => c.id} onRowClick={(c) => setDetail(c)} />
        )}
      </div>

      <Drawer open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        {detail && (
          <DrawerContent
            size="md"
            title={detail.lead ? `${detail.lead.first_name} ${detail.lead.last_name || ""}` : detail.to_number}
            subtitle={`${detail.to_number} · ${detail.status}`}
          >
            <div className="space-y-4">
              {detail.summary && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Summary</div>
                  <p style={{ fontSize: 13, color: "var(--text-primary)" }}>{detail.summary}</p>
                </div>
              )}

              {detail.qualification && Object.keys(detail.qualification).length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Qualification</div>
                  <div className="space-y-1">
                    {Object.entries(detail.qualification).map(([k, v]) => (
                      <div key={k} className="flex gap-2" style={{ fontSize: 13 }}>
                        <span className="tnum" style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-tertiary)", minWidth: 100 }}>{k}</span>
                        <span style={{ color: "var(--text-primary)" }}>{String(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {detail.recording_url && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Recording</div>
                  <audio controls src={detail.recording_url} className="w-full" />
                </div>
              )}

              {detail.transcript && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Transcript</div>
                  <pre className="whitespace-pre-wrap" style={{
                    fontSize: 12.5, fontFamily: "var(--font-mono)", background: "var(--bg-surface-sunken)",
                    border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", padding: 12, color: "var(--text-primary)",
                  }}>{detail.transcript}</pre>
                </div>
              )}

              {!detail.summary && !detail.transcript && !detail.recording_url && (
                <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Call is still in progress or hasn't been analyzed yet.</p>
              )}
            </div>
          </DrawerContent>
        )}
      </Drawer>
    </div>
  );
}
