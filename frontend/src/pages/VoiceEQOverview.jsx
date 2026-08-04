import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { Bot, PhoneCall, PhoneOutgoing, Clock } from "../icons";
import MetricCard from "../components/composites/MetricCard";
import Card from "../components/composites/Card";
import { EmptyState } from "../components/composites/EmptyState";
import StatusPill from "../components/primitives/StatusPill";
import Button from "../components/primitives/Button";

export default function VoiceEQOverview() {
  const nav = useNavigate();
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
      <div className="animate-fade-in px-6 sm:px-8 py-6 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <MetricCard label="Voice agents" value={loading ? "—" : agents.length} icon={Bot} tone="primary" />
          <MetricCard label="Calls today" value={loading ? "—" : callsToday.length} icon={PhoneOutgoing} tone="primary" />
          <MetricCard label="Connect rate" value={loading ? "—" : `${connectRate}%`} icon={PhoneCall} tone="success" />
          <MetricCard label="Minutes used" value={loading ? "—" : totalMinutes} icon={Clock} tone="warning" />
        </div>

        {!loading && agents.length === 0 && (
          <EmptyState
            icon={Bot}
            title="Set up your first calling agent"
            description="Define a persona, pick a voice, and start calling leads from your CRM."
            actionLabel="Create voice agent"
            onAction={() => nav("/app/voice-eq/agents/new")}
          />
        )}

        {!loading && calls.length > 0 && (
          <Card title="Recent calls" padding="compact" bodyClassName="-mx-5 -mb-5">
            {calls.slice(0, 8).map((c, i) => (
              <div key={c.id} className="flex items-center justify-between"
                style={{ padding: "10px 20px", borderTop: i > 0 ? "1px solid var(--border-subtle)" : "none", fontSize: 13 }}>
                <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>{c.lead ? `${c.lead.first_name} ${c.lead.last_name || ""}` : c.to_number}</span>
                <span className="tnum" style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--text-tertiary)" }}>{c.to_number}</span>
                <StatusPill status={c.status} />
                <span className="tnum" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{(c.created_at || "").slice(0, 16).replace("T", " ")}</span>
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
