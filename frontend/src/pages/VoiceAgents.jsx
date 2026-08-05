import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Link, useNavigate } from "react-router-dom";
import { PageHeader } from "../components/AppLayout";
import { Plus, Trash2, Bot } from "../icons";
import { SkeletonTableRows } from "../components/ui/loading-states";
import Table from "../components/composites/Table";
import { EmptyState } from "../components/composites/EmptyState";
import Button from "../components/primitives/Button";
import StatusPill from "../components/primitives/StatusPill";

export default function VoiceAgents() {
  const nav = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => api.get("/voice-eq/agents").then((r) => { setItems(r.data); setLoading(false); });
  useEffect(() => { load(); }, []);

  const remove = async (id) => { await api.delete(`/voice-eq/agents/${id}`); load(); };

  const columns = [
    {
      key: "agent", label: "Agent",
      render: (a) => (
        <div>
          <Link to={`/app/voice-eq/agents/${a.id}`} style={{ fontWeight: 500, color: "var(--text-primary)" }}>{a.name}</Link>
          <div className="tnum" style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>v{a.version || 1}</div>
        </div>
      ),
    },
    { key: "model", label: "Model", render: (a) => <span className="tnum" style={{ fontSize: 11.5, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{(a.config?.model || "").replace("-realtime-preview", "")}</span> },
    { key: "voice", label: "Voice", render: (a) => <span className="tnum" style={{ fontSize: 11.5, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{a.config?.voice || "alloy"}</span> },
    { key: "inbound", label: "Inbound", render: (a) => <StatusPill status={a.inbound_enabled ? "On" : "Off"} tone={a.inbound_enabled ? "success" : "neutral"} /> },
    { key: "calls", label: "Calls", align: "right", numeric: true, render: (a) => a.call_count || 0 },
    {
      key: "actions", label: "", align: "right",
      render: (a) => (
        <button onClick={() => remove(a.id)} className="inline-flex items-center gap-1 ds-row-action" style={{ fontSize: 12, color: "var(--color-danger)" }}>
          <Trash2 size={12} strokeWidth={1.5} aria-hidden="true" /> Delete
        </button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Voice Agents"
        subtitle="Personas that place and answer calls — persona, voice, and qualification schema."
        right={<Link to="/app/voice-eq/agents/new"><Button variant="primary" icon={Plus}>New agent</Button></Link>}
      />
      <div className="animate-fade-in px-6 sm:px-8 py-6">
        {loading ? (
          <div style={{ padding: 16, borderRadius: "var(--radius-xl)", border: "1px solid var(--border-default)", background: "var(--bg-surface)" }}>
            <table className="w-full"><tbody><SkeletonTableRows rows={5} cols={5} /></tbody></table>
          </div>
        ) : items.length === 0 ? (
          <EmptyState icon={Bot} title="No voice agents yet" description="Create a persona to start calling leads." actionLabel="Create agent" onAction={() => nav("/app/voice-eq/agents/new")} />
        ) : (
          <Table columns={columns} rows={items} rowKey={(a) => a.id} />
        )}
      </div>
    </div>
  );
}
