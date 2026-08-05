import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, isCreditError } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Check, Play, Pause } from "../icons";
import Card from "../components/composites/Card";
import Button from "../components/primitives/Button";
import Input from "../components/primitives/Input";
import Select from "../components/primitives/Select";
import StatusPill from "../components/primitives/StatusPill";

const TIMEZONES = [
  "UTC", "US/Eastern", "US/Central", "US/Mountain", "US/Pacific",
  "US/Alaska", "US/Hawaii", "Canada/Atlantic", "Canada/Newfoundland",
  "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Madrid",
  "Europe/Rome", "Europe/Amsterdam", "Europe/Stockholm", "Europe/Moscow",
  "Asia/Almaty", "Asia/Amman", "Asia/Aqtau", "Asia/Aqtobe", "Asia/Ashgabat",
  "Asia/Baghdad", "Asia/Bahrain", "Asia/Baku", "Asia/Bangkok", "Asia/Beirut",
  "Asia/Bishkek", "Asia/Colombo", "Asia/Damascus", "Asia/Dhaka", "Asia/Dili",
  "Asia/Dubai", "Asia/Dushanbe", "Asia/Ho_Chi_Minh", "Asia/Hong_Kong",
  "Asia/Irkutsk", "Asia/Jakarta", "Asia/Jayapura", "Asia/Jerusalem",
  "Asia/Kabul", "Asia/Kamchatka", "Asia/Karachi", "Asia/Kathmandu",
  "Asia/Kolkata", "Asia/Krasnoyarsk", "Asia/Kuala_Lumpur", "Asia/Kuwait",
  "Asia/Macau", "Asia/Magadan", "Asia/Makassar", "Asia/Manila",
  "Asia/Muscat", "Asia/Nicosia", "Asia/Novosibirsk", "Asia/Oral",
  "Asia/Phnom_Penh", "Asia/Pyongyang", "Asia/Qatar", "Asia/Riyadh",
  "Asia/Sakhalin", "Asia/Samarkand", "Asia/Seoul", "Asia/Shanghai",
  "Asia/Singapore", "Asia/Taipei", "Asia/Tashkent", "Asia/Tbilisi",
  "Asia/Tehran", "Asia/Thimphu", "Asia/Tokyo", "Asia/Ulaanbaatar",
  "Asia/Vientiane", "Asia/Vladivostok", "Asia/Yakutsk", "Asia/Yangon",
  "Asia/Yekaterinburg", "Asia/Yerevan",
  "Australia/Sydney", "Australia/Melbourne", "Australia/Perth",
  "Pacific/Auckland", "Pacific/Fiji", "America/Sao_Paulo",
  "America/Mexico_City", "America/Argentina/Buenos_Aires",
  "Africa/Cairo", "Africa/Lagos", "Africa/Johannesburg",
];

const emptyCampaign = () => ({
  name: "Untitled voice campaign", goal: "Qualify leads",
  agent_id: "", lead_ids: [],
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
    api.get("/leads?page_size=2000").then((r) => setLeads(r.data.items || r.data));
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
    } catch (err) {
      if (!isCreditError(err)) {
        const detail = err?.response?.data?.detail;
        const status = err?.response?.status;
        console.error("Launch failed:", { status, detail, data: err?.response?.data });
        toast.error(detail ? (typeof detail === "string" ? detail : JSON.stringify(detail)) : `Launch failed (${status || "network"})`);
      }
    }
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
            {status !== "active" && <Button variant="secondary" icon={Check} onClick={save} isLoading={busy}>Save</Button>}
            {status === "active" ? (
              <Button variant="primary" icon={Pause} onClick={pause} isLoading={busy}>Pause</Button>
            ) : (
              <Button variant="primary" icon={Play} onClick={launch} isLoading={busy} isDisabled={id === "new"}>Launch</Button>
            )}
          </div>
        }
      />
      <div className="animate-fade-in px-6 sm:px-8 py-6 max-w-4xl space-y-4">
        <Card>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input className="sm:col-span-2" label="Campaign name" value={campaign.name} onChange={(e) => setCampaign({ ...campaign, name: e.target.value })} />
            <Select
              label="Voice agent" value={campaign.agent_id} onChange={(v) => setCampaign({ ...campaign, agent_id: v })} placeholder="Select an agent…"
              options={agents.map((a) => ({ value: a.id, label: a.name }))}
            />
            <Input type="number" min={1} label="Max concurrent calls" value={campaign.max_concurrent_calls}
              onChange={(e) => setCampaign({ ...campaign, max_concurrent_calls: Number(e.target.value) || 1 })} />
            <Input type="time" label="Call window start" value={campaign.send_window_start} onChange={(e) => setCampaign({ ...campaign, send_window_start: e.target.value })} />
            <Input type="time" label="Call window end" value={campaign.send_window_end} onChange={(e) => setCampaign({ ...campaign, send_window_end: e.target.value })} />
            <Select
              label="Timezone" value={campaign.timezone} onChange={(v) => setCampaign({ ...campaign, timezone: v })}
              options={TIMEZONES.map((tz) => ({ value: tz, label: tz }))}
            />
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>Leads to call</div>
              <p style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>{campaign.lead_ids.length} selected · only leads with a phone number can be called.</p>
            </div>
            <Button variant="tertiary" size="sm" onClick={selectAllCallable}>Select all callable</Button>
          </div>
          <div style={{ border: "1px solid var(--border-default)", borderRadius: "var(--radius-lg)", maxHeight: 320, overflowY: "auto" }}>
            {callableLeads.length === 0 ? (
              <div style={{ padding: 16, fontSize: 13, color: "var(--text-tertiary)" }}>No leads with a phone number yet — add one from the Leads page.</div>
            ) : callableLeads.map((l, i) => (
              <label key={l.id} className="flex items-center gap-3 cursor-pointer transition-colors"
                style={{ padding: "8px 12px", borderTop: i > 0 ? "1px solid var(--border-subtle)" : "none" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <input type="checkbox" checked={campaign.lead_ids.includes(l.id)} onChange={() => toggleLead(l.id)} />
                <span className="flex-1" style={{ fontSize: 13, color: "var(--text-primary)" }}>{l.first_name} {l.last_name}</span>
                <span className="tnum" style={{ fontSize: 11.5, fontFamily: "var(--font-mono)", color: "var(--text-tertiary)" }}>{l.phone}</span>
                {l.dnc && <StatusPill status="DNC" tone="danger" />}
              </label>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
