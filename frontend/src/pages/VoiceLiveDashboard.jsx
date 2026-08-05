import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { Activity } from "../icons";
import Table from "../components/composites/Table";
import { EmptyState } from "../components/composites/EmptyState";
import StatusPill from "../components/primitives/StatusPill";

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

  const columns = [
    {
      key: "lead", label: "Lead",
      render: (c) => (
        <div className="flex items-center gap-2">
          <span className="relative flex" style={{ height: 8, width: 8 }}>
            <span className="animate-ping absolute inline-flex rounded-full" style={{ height: "100%", width: "100%", background: "var(--color-success)", opacity: 0.75 }} />
            <span className="relative inline-flex rounded-full" style={{ height: 8, width: 8, background: "var(--color-success)" }} />
          </span>
          <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>{c.lead ? `${c.lead.first_name} ${c.lead.last_name || ""}` : c.to_number}</span>
        </div>
      ),
    },
    { key: "number", label: "Number", render: (c) => <span className="tnum" style={{ fontSize: 11.5, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{c.to_number}</span> },
    { key: "status", label: "Status", render: (c) => <StatusPill status={c.status} /> },
    { key: "started", label: "Started", align: "right", render: (c) => <span className="tnum" style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{(c.started_at || c.created_at || "").slice(11, 19)}</span> },
  ];

  return (
    <div>
      <PageHeader title="Live" subtitle="Calls currently ringing or in progress — refreshes every few seconds." />
      <div className="animate-fade-in px-6 sm:px-8 py-6">
        {loading ? (
          <div style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Loading…</div>
        ) : calls.length === 0 ? (
          <EmptyState icon={Activity} title="No active calls" description="Calls in progress will appear here in real time." />
        ) : (
          <Table columns={columns} rows={calls} rowKey={(c) => c.id} />
        )}
      </div>
    </div>
  );
}
