import { useEffect, useState } from "react";
import { api, isCreditError } from "../lib/api";
import { Link, useNavigate } from "react-router-dom";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Play, Pause, Plus, Trash2, PhoneCall } from "../icons";
import Table from "../components/composites/Table";
import { EmptyState } from "../components/composites/EmptyState";
import Button from "../components/primitives/Button";
import StatusPill from "../components/primitives/StatusPill";

export default function VoiceCampaigns() {
  const nav = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => api.get("/voice-eq/campaigns").then((r) => { setItems(r.data); setLoading(false); });
  useEffect(() => { load(); }, []);

  const launch = async (id) => {
    try { const { data } = await api.post(`/voice-eq/campaigns/${id}/launch`); toast.success(`Launched — ${data.calls_placed} call(s) placed`); load(); }
    catch (err) { if (!isCreditError(err)) toast.error(err?.response?.data?.detail || "Launch failed"); }
  };
  const pause = async (id) => {
    try { await api.post(`/voice-eq/campaigns/${id}/pause`); toast.success("Paused"); load(); }
    catch { toast.error("Pause failed"); }
  };
  const remove = async (id) => {
    if (!window.confirm("Delete this voice campaign?")) return;
    try { await api.delete(`/voice-eq/campaigns/${id}`); toast.success("Deleted"); load(); }
    catch { toast.error("Delete failed"); }
  };

  const columns = [
    {
      key: "name", label: "Campaign",
      render: (c) => (
        <div>
          <Link to={`/app/voice-eq/campaigns/${c.id}`} style={{ fontWeight: 500, color: "var(--text-primary)" }}>{c.name}</Link>
          <div className="tnum" style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
            {c.lead_ids?.length || 0} leads · {c.send_window_start}–{c.send_window_end} {c.timezone}
          </div>
        </div>
      ),
    },
    { key: "status", label: "Status", render: (c) => <StatusPill status={c.status} /> },
    { key: "calls", label: "Calls", align: "right", numeric: true, render: (c) => c.stats?.calls_placed || 0 },
    { key: "connected", label: "Connected", align: "right", numeric: true, render: (c) => c.stats?.connected || 0 },
    { key: "qualified", label: "Qualified", align: "right", numeric: true, render: (c) => c.stats?.qualified || 0 },
    { key: "minutes", label: "Minutes", align: "right", numeric: true, render: (c) => c.stats?.total_minutes || 0 },
    {
      key: "actions", label: "", align: "right",
      render: (c) => (
        <div className="flex items-center justify-end gap-1 ds-row-action">
          {c.status === "active" ? (
            <RowAction title="Pause" icon={Pause} onClick={() => pause(c.id)} />
          ) : (
            <RowAction title="Launch" icon={Play} onClick={() => launch(c.id)} hoverColor="var(--color-primary)" />
          )}
          <RowAction title="Delete" icon={Trash2} onClick={() => remove(c.id)} hoverColor="var(--color-danger)" />
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Voice Campaigns"
        subtitle="Dial a lead list with a voice agent, respecting call windows and timezone."
        right={<Link to="/app/voice-eq/campaigns/new"><Button variant="primary" icon={Plus}>New campaign</Button></Link>}
      />
      <div className="animate-fade-in px-6 sm:px-8 py-6">
        {loading ? (
          <div style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Loading…</div>
        ) : items.length === 0 ? (
          <EmptyState icon={PhoneCall} title="No voice campaigns yet" description="Pick an agent and a lead list to start dialing." actionLabel="Create campaign" onAction={() => nav("/app/voice-eq/campaigns/new")} />
        ) : (
          <Table columns={columns} rows={items} rowKey={(c) => c.id} />
        )}
      </div>
    </div>
  );
}

function RowAction({ title, icon: Icon, onClick, hoverColor = "var(--text-primary)" }) {
  return (
    <button
      type="button" title={title} onClick={onClick}
      className="inline-grid place-items-center transition-colors"
      style={{ width: 26, height: 26, borderRadius: "var(--radius-sm)", color: "var(--text-tertiary)" }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-active)"; e.currentTarget.style.color = hoverColor; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-tertiary)"; }}
    >
      <Icon size={14} strokeWidth={1.5} aria-hidden="true" />
    </button>
  );
}
