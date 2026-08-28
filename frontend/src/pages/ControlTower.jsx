import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { toast } from "sonner";
import { ShieldCheck, Activity, DollarSign, Gauge, Bot, Zap, Eye, X, CheckCircle2, Clock } from "../icons";
import { PageHeader } from "../components/AppLayout";
import Card from "../components/composites/Card";
import Table from "../components/composites/Table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/composites/Tabs";
import MetricCard from "../components/composites/MetricCard";
import StatusPill from "../components/primitives/StatusPill";
import Button from "../components/primitives/Button";
import Input from "../components/primitives/Input";
import Select from "../components/primitives/Select";
import { EmptyState } from "../components/composites/EmptyState";

export default function ControlTower() {
  const [agents, setAgents] = useState([]);
  const [traces, setTraces] = useState(null);
  const [roi, setRoi] = useState(null);
  const [tab, setTab] = useState("agents");
  const [team, setTeam] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setBusy(true);
    try {
      const [a, t, r, tm] = await Promise.all([
        api.get("/control-tower/agents"),
        api.get("/control-tower/traces", { params: { limit: 50 } }).catch(() => ({ data: null })),
        api.get("/control-tower/roi").catch(() => ({ data: null })),
        api.get("/team").catch(() => ({ data: [] })),
      ]);
      setAgents(a.data || []);
      setTraces(t.data);
      setRoi(r.data);
      setTeam(tm.data || []);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to load Control Tower");
    } finally { setBusy(false); }
  };

  useEffect(() => { load(); }, []);

  const toggle = async (key, enabled) => {
    try {
      await api.post(`/control-tower/agents/${key}/toggle`, { enabled });
      toast.success(`${key} ${enabled ? "enabled" : "disabled"}`);
      load();
    } catch { toast.error("Toggle failed"); }
  };

  const setSponsor = async (key, sponsor_user_id) => {
    try {
      await api.post(`/control-tower/agents/${key}/sponsor`, { sponsor_user_id: sponsor_user_id || null });
      toast.success("Sponsor updated");
      load();
    } catch { toast.error("Failed to set sponsor"); }
  };

  const agentColumns = [
    { key: "label", label: "Agent", render: (r) => (
      <span className="inline-flex items-center gap-2">
        <Bot size={14} strokeWidth={1.5} style={{ color: "var(--text-tertiary)" }} />
        <span style={{ fontWeight: 600 }}>{r.label}</span>
        <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>v{r.version}</span>
      </span>
    )},
    { key: "category", label: "Category", render: (r) => <StatusPill tone="neutral">{r.category}</StatusPill> },
    { key: "enabled", label: "Status", render: (r) => (
      <span className="inline-flex items-center gap-2">
        <StatusPill tone={r.enabled ? "success" : "danger"}>{r.enabled ? "Enabled" : "Killed"}</StatusPill>
        <Button
          variant={r.enabled ? "tertiary" : "primary"}
          size="xs"
          icon={r.enabled ? X : CheckCircle2}
          onClick={() => toggle(r.agent_key, !r.enabled)}
        >
          {r.enabled ? "Kill-switch" : "Enable"}
        </Button>
      </span>
    )},
    { key: "sponsor", label: "Sponsor", render: (r) => (
      <Select
        size="sm"
        placeholder="Unassigned"
        value={r.sponsor_user_id || ""}
        onChange={(v) => setSponsor(r.agent_key, v)}
        options={[{ value: "", label: "Unassigned" }, ...team.map((m) => ({ value: m.id, label: m.name || m.email }))]}
      />
    )},
  ];

  const traceRows = traces?.recent || [];
  const traceColumns = [
    { key: "at", label: "Time", render: (r) => <span className="tnum" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{new Date(r.at).toLocaleString()}</span> },
    { key: "gen_ai_agent_name", label: "Agent", render: (r) => r.gen_ai_agent_name || "—" },
    { key: "gen_ai_tool_name", label: "Tool", render: (r) => r.gen_ai_tool_name || r.gen_ai_operation || "—" },
    { key: "gen_ai_request_model", label: "Model", render: (r) => <span className="tnum" style={{ fontSize: 11 }}>{r.gen_ai_request_model || "—"}</span> },
    { key: "tokens", label: "Tokens", render: (r) => `${r.gen_ai_usage_input_tokens || 0} / ${r.gen_ai_usage_output_tokens || 0}` },
    { key: "latency_ms", label: "Latency", render: (r) => `${r.latency_ms || 0}ms` },
    { key: "status", label: "Status", render: (r) => <StatusPill tone={r.status === "ok" ? "success" : "danger"}>{r.status}</StatusPill> },
    { key: "eval_score", label: "Eval", render: (r) => r.eval_score != null ? <StatusPill tone={r.eval_score >= 70 ? "success" : r.eval_score >= 40 ? "warning" : "danger"}>{r.eval_score}</StatusPill> : <span style={{ color: "var(--text-tertiary)" }}>—</span> },
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Control Tower"
        subtitle="Govern every agent — kill-switch, sponsor, spend caps, traces, and ROI. The Observe/Govern/Measure layer."
      />

      <div className="px-6 sm:px-8 py-6 space-y-6">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="agents">Registry</TabsTrigger>
            <TabsTrigger value="traces">Traces</TabsTrigger>
            <TabsTrigger value="roi">ROI</TabsTrigger>
          </TabsList>

          <TabsContent value="agents" className="space-y-4 mt-4">
            <Card>
              <div className="flex items-center justify-between mb-3">
                <h3 className="flex items-center gap-2" style={{ fontSize: 14, fontWeight: 600 }}>
                  <ShieldCheck size={16} strokeWidth={1.5} /> Agent Registry
                </h3>
                <Button variant="tertiary" size="xs" icon={Activity} onClick={load} isLoading={busy}>Refresh</Button>
              </div>
              {agents.length === 0 ? (
                <EmptyState icon={Bot} title="No agents" description="Registry will seed on first load." />
              ) : (
                <Table columns={agentColumns} rows={agents} rowKey={(r) => r.agent_key} />
              )}
              <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 8 }}>
                Kill-switch is per-workspace and checked on every Command EQ tool dispatch. Sponsors are accountable humans per Microsoft Entra Agent ID pattern.
              </p>
            </Card>
          </TabsContent>

          <TabsContent value="traces" className="space-y-4 mt-4">
            <div className="grid grid-cols-3 gap-3">
              <MetricCard label="Spans (last 100)" value={traces?.total_spans ?? "—"} icon={Activity} />
              <MetricCard label="Input tokens" value={traces?.total_input_tokens ?? "—"} icon={Eye} />
              <MetricCard label="Output tokens" value={traces?.total_output_tokens ?? "—"} icon={Zap} />
            </div>
            <Card>
              <h3 className="flex items-center gap-2 mb-3" style={{ fontSize: 14, fontWeight: 600 }}>
                <Clock size={16} strokeWidth={1.5} /> Recent spans (OTel GenAI)
              </h3>
              {traceRows.length === 0 ? (
                <EmptyState icon={Activity} title="No traces yet" description="Traces appear after the next LLM call." />
              ) : (
                <Table columns={traceColumns} rows={traceRows} rowKey={(r) => r.id} density="compact" />
              )}
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div>
                  <h4 style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>By agent</h4>
                  {(traces?.by_agent || []).map((a) => (
                    <div key={a.agent} className="flex justify-between text-sm" style={{ padding: "2px 0", fontSize: 12 }}>
                      <span>{a.agent}</span><span className="tnum">{a.calls} calls · {a.avg_latency_ms}ms avg · {a.errors} err</span>
                    </div>
                  ))}
                </div>
                <div>
                  <h4 style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>By model</h4>
                  {(traces?.by_model || []).map((m) => (
                    <div key={m.model} className="flex justify-between text-sm" style={{ padding: "2px 0", fontSize: 12 }}>
                      <span>{m.model}</span><span className="tnum">{m.calls} calls</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="roi" className="space-y-4 mt-4">
            <div className="grid grid-cols-3 gap-3">
              <MetricCard label="Credits spent" value={roi?.total_credits_spent ?? "—"} icon={DollarSign} />
              <MetricCard label="Minutes saved" value={roi?.total_minutes_saved ?? "—"} icon={Clock} />
              <MetricCard label="Saved ($)" value={roi?.total_saved_usd != null ? `$${roi.total_saved_usd}` : "—"} icon={Gauge} />
            </div>
            <Card>
              <h3 className="flex items-center gap-2 mb-3" style={{ fontSize: 14, fontWeight: 600 }}>
                <DollarSign size={16} strokeWidth={1.5} /> By action
              </h3>
              {!roi || (roi.by_action || []).length === 0 ? (
                <EmptyState icon={DollarSign} title="No ROI yet" description="ROI appears after billable actions (email drafts, proposals, etc.)." />
              ) : (
                <Table
                  columns={[
                    { key: "action", label: "Action" },
                    { key: "calls", label: "Calls", render: (r) => <span className="tnum">{r.calls}</span> },
                    { key: "credits_spent", label: "Credits", render: (r) => <span className="tnum">{r.credits_spent}</span> },
                    { key: "minutes_saved", label: "Min saved", render: (r) => <span className="tnum">{r.minutes_saved}</span> },
                  ]}
                  rows={roi.by_action}
                  rowKey={(r) => r.action}
                  density="compact"
                />
              )}
              <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 8 }}>
                Estimates are conservative wall-clock time a human would have spent. Rate: $0.50/min blended.
              </p>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
