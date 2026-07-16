import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, isCreditError } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Save, Play, Pause } from "lucide-react";

const emptyCampaign = () => ({
  name: "Untitled voice campaign", goal: "Qualify leads",
  agent_id: "", agent_id_b: null, ab_split: 0, lead_ids: [],
  send_window_start: "09:00", send_window_end: "17:00", timezone: "UTC",
  max_concurrent_calls: 5,
});

export default function VoiceCampaignBuilder() {
  const { id } = useParams();
  const nav = useNavigate();
  const [campaign, setCampaign] = useState(emptyCampaign());
  const [status, setStatus] = useState("draft");
  const [agents, setAgents] = useState([]);
  const [leads, setLeads] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/voice-eq/agents").then((r) => setAgents(r.data));
    api.get("/leads").then((r) => setLeads(r.data));
    if (id && id !== "new") {
      api.get(`/voice-eq/campaigns/${id}`).then((r) => {
        const { stats, ...c } = r.data;
        setCampaign(c); setStatus(r.data.status);
      });
    }
  }, [id]);

  const toggleLead = (lid) => {
    const has = campaign.lead_ids.includes(lid);
    setCampaign({ ...campaign, lead_ids: has ? campaign.lead_ids.filter((x) => x !== lid) : [...campaign.lead_ids, lid] });
  };
  const selectAllCallable = () => {
    setCampaign({ ...campaign, lead_ids: leads.filter((l) => l.phone && !l.dnc).map((l) => l.id) });
  };

  const save = async () => {
    if (!campaign.agent_id) { toast.error("Pick a voice agent"); return; }
    setBusy(true);
    try {
      if (id && id !== "new") {
        const { data } = await api.put(`/voice-eq/campaigns/${id}`, campaign);
        setCampaign((prev) => ({ ...prev, ...data })); setStatus(data.status);
        toast.success("Saved");
      } else {
        const { data } = await api.post("/voice-eq/campaigns", campaign);
        toast.success("Campaign created");
        nav(`/app/voice-eq/campaigns/${data.id}`, { replace: true });
      }
    } catch (err) { toast.error(err?.response?.data?.detail || "Save failed"); }
    finally { setBusy(false); }
  };

  const launch = async () => {
    if (id === "new") { toast.error("Save the campaign first"); return; }
    setBusy(true);
    try {
      const { data } = await api.post(`/voice-eq/campaigns/${id}/launch`);
      setStatus("active");
      toast.success(`Launched — ${data.calls_placed} call(s) placed${data.skipped ? `, ${data.skipped} skipped (no phone/DNC)` : ""}`);
    } catch (err) { if (!isCreditError(err)) toast.error(err?.response?.data?.detail || "Launch failed"); }
    finally { setBusy(false); }
  };
  const pause = async () => {
    setBusy(true);
    try { await api.post(`/voice-eq/campaigns/${id}/pause`); setStatus("paused"); toast.success("Paused"); }
    finally { setBusy(false); }
  };

  const callableLeads = leads.filter((l) => l.phone);

  return (
    <div>
      <PageHeader
        title={id && id !== "new" ? campaign.name : "New voice campaign"}
        subtitle="Dial a lead list with a voice agent, respecting call windows and timezone."
        right={
          <div className="flex gap-2">
            <button onClick={save} disabled={busy} data-testid="save-voice-campaign-btn" className="btn-secondary">
              <Save size={14} /> Save
            </button>
            {status === "active" ? (
              <button onClick={pause} disabled={busy} data-testid="pause-voice-campaign-btn" className="btn-primary">
                <Pause size={14} /> Pause
              </button>
            ) : (
              <button onClick={launch} disabled={busy || id === "new"} data-testid="launch-voice-campaign-btn" className="btn-primary disabled:opacity-50">
                <Play size={14} /> Launch
              </button>
            )}
          </div>
        }
      />
      <div className="animate-fade-in px-6 sm:px-8 max-w-4xl space-y-6">
        <div className="shadow-card rounded-2xl p-6 sm:p-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="ui-label block mb-1">Name</label>
            <input value={campaign.name} onChange={(e) => setCampaign({ ...campaign, name: e.target.value })}
              data-testid="voice-campaign-name" className="w-full border border-line px-3 py-2 rounded-sm" />
          </div>
          <div>
            <label className="ui-label block mb-1">Voice agent</label>
            <select value={campaign.agent_id} onChange={(e) => setCampaign({ ...campaign, agent_id: e.target.value })}
              data-testid="voice-campaign-agent" className="w-full border border-line px-3 py-2 rounded-sm">
              <option value="">Select an agent…</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}{a.status !== "synced" ? " (unsynced)" : ""}</option>)}
            </select>
          </div>
          <div>
            <label className="ui-label block mb-1">Call window start</label>
            <input type="time" value={campaign.send_window_start} onChange={(e) => setCampaign({ ...campaign, send_window_start: e.target.value })}
              data-testid="voice-campaign-window-start" className="w-full border border-line px-3 py-2 rounded-sm" />
          </div>
          <div>
            <label className="ui-label block mb-1">Call window end</label>
            <input type="time" value={campaign.send_window_end} onChange={(e) => setCampaign({ ...campaign, send_window_end: e.target.value })}
              data-testid="voice-campaign-window-end" className="w-full border border-line px-3 py-2 rounded-sm" />
          </div>
          <div>
            <label className="ui-label block mb-1">Timezone</label>
            <input value={campaign.timezone} onChange={(e) => setCampaign({ ...campaign, timezone: e.target.value })}
              data-testid="voice-campaign-timezone" className="w-full border border-line px-3 py-2 rounded-sm" />
          </div>
          <div>
            <label className="ui-label block mb-1">Max concurrent calls</label>
            <input type="number" min={1} value={campaign.max_concurrent_calls}
              onChange={(e) => setCampaign({ ...campaign, max_concurrent_calls: Number(e.target.value) || 1 })}
              data-testid="voice-campaign-concurrency" className="w-full border border-line px-3 py-2 rounded-sm" />
          </div>
          <div>
            <label className="ui-label block mb-1">A/B test agent (optional)</label>
            <select value={campaign.agent_id_b || ""} onChange={(e) => setCampaign({ ...campaign, agent_id_b: e.target.value || null })}
              data-testid="voice-campaign-agent-b" className="w-full border border-line px-3 py-2 rounded-sm">
              <option value="">None</option>
              {agents.filter((a) => a.id !== campaign.agent_id).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="ui-label block mb-1">% of leads to variant B</label>
            <input type="number" min={0} max={100} value={campaign.ab_split} disabled={!campaign.agent_id_b}
              onChange={(e) => setCampaign({ ...campaign, ab_split: Number(e.target.value) || 0 })}
              data-testid="voice-campaign-ab-split" className="w-full border border-line px-3 py-2 rounded-sm disabled:opacity-50" />
          </div>
        </div>

        <div className="shadow-card rounded-2xl p-6 sm:p-8 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-display font-semibold">Leads to call</div>
              <p className="text-xs text-neutral-400">{campaign.lead_ids.length} selected · only leads with a phone number can be called.</p>
            </div>
            <button onClick={selectAllCallable} data-testid="select-all-callable" className="btn-ghost text-xs">Select all callable</button>
          </div>
          <div className="border border-line max-h-80 overflow-y-auto">
            {callableLeads.length === 0 ? (
              <div className="p-4 text-sm text-neutral-400">No leads with a phone number yet — add one from the Leads page.</div>
            ) : callableLeads.map((l) => (
              <label key={l.id} className="flex items-center gap-3 px-3 py-2 border-b border-line last:border-0 hover:bg-surfacehover cursor-pointer">
                <input type="checkbox" checked={campaign.lead_ids.includes(l.id)} onChange={() => toggleLead(l.id)}
                  data-testid={`voice-campaign-lead-${l.id}`} />
                <span className="flex-1 text-sm">{l.first_name} {l.last_name}</span>
                <span className="text-xs font-mono text-neutral-400">{l.phone}</span>
                {l.dnc && <span className="ui-label text-red-600">DNC</span>}
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
