import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Save, RefreshCw, Plus, Trash2 } from "lucide-react";

const VOICE_OPTIONS = [
  { id: "11labs-Adrian", label: "Adrian — warm, male" },
  { id: "11labs-Amy", label: "Amy — crisp, female" },
  { id: "11labs-Marissa", label: "Marissa — energetic, female" },
  { id: "11labs-Brian", label: "Brian — calm, male" },
];

const FRAMEWORKS = {
  BANT: [
    { key: "budget", prompt: "Does the prospect have budget allocated?", type: "string" },
    { key: "authority", prompt: "Is this person the decision maker?", type: "string" },
    { key: "need", prompt: "What problem are they trying to solve?", type: "string" },
    { key: "timeline", prompt: "When do they want to make a decision?", type: "string" },
  ],
  MEDDIC: [
    { key: "metrics", prompt: "What metrics define success for them?", type: "string" },
    { key: "economic_buyer", prompt: "Who controls the budget?", type: "string" },
    { key: "decision_criteria", prompt: "What criteria will they use to decide?", type: "string" },
    { key: "decision_process", prompt: "What does their buying process look like?", type: "string" },
    { key: "identify_pain", prompt: "What pain point are they experiencing?", type: "string" },
    { key: "champion", prompt: "Who internally is advocating for this?", type: "string" },
  ],
};

const emptyAgent = () => ({
  name: "Untitled agent", purpose: "outbound",
  persona_prompt: "You are a friendly, concise SDR calling on behalf of our company. Qualify the lead, answer questions, and book a follow-up meeting if there's interest.",
  voice_id: VOICE_OPTIONS[0].id, language: "en-US",
  llm_mode: "retell_managed", llm_model: "claude-5-sonnet",
  qualification_framework: "custom", qualification_fields: [],
  voicemail_detection: true, begin_message: "Hi, this is Alex calling from {{company}} — do you have a quick minute?",
  knowledge_base: "", warm_transfer_number: "", max_call_duration_minutes: 15,
  ambient_sound: "none", voice_speed: 1.0, voice_temperature: 1.0, post_call_action: "none",
});

export default function VoiceAgentBuilder() {
  const { id } = useParams();
  const nav = useNavigate();
  const [agent, setAgent] = useState(emptyAgent());
  const [status, setStatus] = useState("draft");
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (!id || id === "new") return;
    api.get(`/voice-eq/agents/${id}`).then((r) => { setAgent(r.data); setStatus(r.data.status); });
  }, [id]);

  const applyFramework = (fw) => {
    setAgent({ ...agent, qualification_framework: fw, qualification_fields: FRAMEWORKS[fw] || [] });
  };

  const updateField = (i, patch) => {
    const next = [...agent.qualification_fields];
    next[i] = { ...next[i], ...patch };
    setAgent({ ...agent, qualification_fields: next, qualification_framework: "custom" });
  };
  const addField = () => setAgent({
    ...agent, qualification_framework: "custom",
    qualification_fields: [...agent.qualification_fields, { key: "", prompt: "", type: "string" }],
  });
  const removeField = (i) => setAgent({
    ...agent, qualification_fields: agent.qualification_fields.filter((_, x) => x !== i),
  });

  const save = async () => {
    setBusy(true);
    try {
      if (id && id !== "new") {
        const { data } = await api.put(`/voice-eq/agents/${id}`, agent);
        setAgent(data); setStatus(data.status);
        toast.success("Saved");
      } else {
        const { data } = await api.post("/voice-eq/agents", agent);
        toast.success("Agent created");
        nav(`/app/voice-eq/agents/${data.id}`, { replace: true });
      }
    } catch (err) { toast.error(err?.response?.data?.detail || "Save failed"); }
    finally { setBusy(false); }
  };

  const sync = async () => {
    if (!id || id === "new") { toast.error("Save the agent first"); return; }
    setSyncing(true);
    try {
      const { data } = await api.post(`/voice-eq/agents/${id}/sync`);
      setStatus(data.status);
      toast.success(data.mocked === false ? "Synced to Retell" : "Synced in test mode — connect a Retell account to place live calls");
    } catch (err) { toast.error(err?.response?.data?.detail || "Sync failed"); }
    finally { setSyncing(false); }
  };

  return (
    <div>
      <PageHeader
        title={id && id !== "new" ? agent.name : "New voice agent"}
        subtitle="Persona, voice, and qualification schema for this calling agent."
        right={
          <div className="flex gap-2">
            <button onClick={sync} disabled={syncing} data-testid="sync-agent-btn" className="btn-secondary">
              <RefreshCw size={14} className={syncing ? "animate-spin" : ""} /> {status === "synced" ? "Re-sync" : "Sync to Retell"}
            </button>
            <button onClick={save} disabled={busy} data-testid="save-agent-btn" className="btn-primary">
              <Save size={14} /> Save
            </button>
          </div>
        }
      />
      <div className="p-6 max-w-3xl space-y-6">
        <div className="card-flat p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="ui-label block mb-1">Name</label>
              <input value={agent.name} onChange={(e) => setAgent({ ...agent, name: e.target.value })}
                data-testid="agent-name" className="w-full border border-line px-3 py-2 rounded-sm" />
            </div>
            <div>
              <label className="ui-label block mb-1">Purpose</label>
              <select value={agent.purpose} onChange={(e) => setAgent({ ...agent, purpose: e.target.value })}
                data-testid="agent-purpose" className="w-full border border-line px-3 py-2 rounded-sm">
                <option value="outbound">Outbound</option>
                <option value="inbound">Inbound</option>
              </select>
            </div>
          </div>
          <div>
            <label className="ui-label block mb-1">Persona / system prompt</label>
            <textarea value={agent.persona_prompt} onChange={(e) => setAgent({ ...agent, persona_prompt: e.target.value })}
              data-testid="agent-persona" rows={5} className="w-full border border-line px-3 py-2 rounded-sm font-mono text-sm" />
          </div>
          <div>
            <label className="ui-label block mb-1">Opening line</label>
            <input value={agent.begin_message} onChange={(e) => setAgent({ ...agent, begin_message: e.target.value })}
              data-testid="agent-begin-message" className="w-full border border-line px-3 py-2 rounded-sm" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="ui-label block mb-1">Voice</label>
              <select value={agent.voice_id} onChange={(e) => setAgent({ ...agent, voice_id: e.target.value })}
                data-testid="agent-voice" className="w-full border border-line px-3 py-2 rounded-sm">
                {VOICE_OPTIONS.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="ui-label block mb-1">Language</label>
              <select value={agent.language} onChange={(e) => setAgent({ ...agent, language: e.target.value })}
                data-testid="agent-language" className="w-full border border-line px-3 py-2 rounded-sm">
                <option value="en-US">English (US)</option>
                <option value="en-GB">English (UK)</option>
                <option value="es-ES">Spanish</option>
                <option value="fr-FR">French</option>
                <option value="de-DE">German</option>
                <option value="hi-IN">Hindi</option>
                <option value="multi">Auto-detect (multilingual)</option>
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={agent.voicemail_detection}
              onChange={(e) => setAgent({ ...agent, voicemail_detection: e.target.checked })}
              data-testid="agent-voicemail-detection" />
            Detect voicemail and hang up automatically
          </label>
        </div>

        <div className="card-flat p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-display font-semibold">Qualification schema</div>
              <p className="text-xs text-neutral-500">Structured fields the agent extracts during the call — written to the call log and cascaded to the CRM.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => applyFramework("BANT")} data-testid="framework-bant" className="btn-ghost text-xs">BANT</button>
              <button onClick={() => applyFramework("MEDDIC")} data-testid="framework-meddic" className="btn-ghost text-xs">MEDDIC</button>
            </div>
          </div>
          <div className="space-y-2">
            {agent.qualification_fields.map((f, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input placeholder="key" value={f.key} onChange={(e) => updateField(i, { key: e.target.value })}
                  data-testid={`qfield-key-${i}`} className="w-32 border border-line px-2 py-1.5 rounded-sm text-sm font-mono" />
                <input placeholder="What should the agent extract?" value={f.prompt} onChange={(e) => updateField(i, { prompt: e.target.value })}
                  data-testid={`qfield-prompt-${i}`} className="flex-1 border border-line px-2 py-1.5 rounded-sm text-sm" />
                <button onClick={() => removeField(i)} data-testid={`qfield-remove-${i}`} className="text-neutral-400 hover:text-red-600">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <button onClick={addField} data-testid="qfield-add" className="btn-ghost text-xs"><Plus size={12} /> Add field</button>
        </div>

        {/* Cross-agent handoff — the differentiator: a qualified call fires another agent automatically */}
        <div className="card-flat p-5 space-y-3">
          <div>
            <div className="font-display font-semibold">When a call qualifies the lead</div>
            <p className="text-xs text-neutral-500">The suite's edge over standalone dialers — hand off to another agent automatically, no Zapier.</p>
          </div>
          <select value={agent.post_call_action} onChange={(e) => setAgent({ ...agent, post_call_action: e.target.value })}
            data-testid="agent-post-call-action" className="w-full border border-line px-3 py-2 rounded-sm">
            <option value="none">Do nothing extra (just update the CRM)</option>
            <option value="draft_proposal">Auto-draft a proposal (Proposal EQ)</option>
            <option value="send_booking_link">Queue a booking link (Schedule EQ)</option>
            <option value="follow_up_email">Queue a follow-up email (Pitch EQ)</option>
          </select>
        </div>

        <div className="card-flat p-5 space-y-4">
          <div>
            <div className="font-display font-semibold">Knowledge base</div>
            <p className="text-xs text-neutral-500">Facts, pricing, and FAQs the agent can answer from mid-call.</p>
          </div>
          <textarea value={agent.knowledge_base} onChange={(e) => setAgent({ ...agent, knowledge_base: e.target.value })}
            data-testid="agent-knowledge-base" rows={4} placeholder="e.g. Our Starter plan is $499/mo for up to 5 seats. We support SSO on Growth and above…"
            className="w-full border border-line px-3 py-2 rounded-sm text-sm" />
        </div>

        <div className="card-flat p-5 space-y-4">
          <div className="font-display font-semibold">Advanced</div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="ui-label block mb-1">Warm-transfer number</label>
              <input value={agent.warm_transfer_number || ""} onChange={(e) => setAgent({ ...agent, warm_transfer_number: e.target.value })}
                data-testid="agent-transfer-number" placeholder="+14155550100"
                className="w-full border border-line px-3 py-2 rounded-sm" />
              <p className="text-[11px] text-neutral-400 mt-1">Agent hands off to a human when asked.</p>
            </div>
            <div>
              <label className="ui-label block mb-1">Max call length (min)</label>
              <input type="number" min={1} max={60} value={agent.max_call_duration_minutes}
                onChange={(e) => setAgent({ ...agent, max_call_duration_minutes: Number(e.target.value) || 15 })}
                data-testid="agent-max-duration" className="w-full border border-line px-3 py-2 rounded-sm" />
            </div>
            <div>
              <label className="ui-label block mb-1">Ambient sound</label>
              <select value={agent.ambient_sound} onChange={(e) => setAgent({ ...agent, ambient_sound: e.target.value })}
                data-testid="agent-ambient" className="w-full border border-line px-3 py-2 rounded-sm">
                <option value="none">None</option>
                <option value="coffee-shop">Coffee shop</option>
                <option value="call-center">Call center</option>
                <option value="convention-hall">Convention hall</option>
              </select>
            </div>
            <div>
              <label className="ui-label block mb-1">Speaking speed · {agent.voice_speed.toFixed(1)}×</label>
              <input type="range" min={0.5} max={2} step={0.1} value={agent.voice_speed}
                onChange={(e) => setAgent({ ...agent, voice_speed: Number(e.target.value) })}
                data-testid="agent-voice-speed" className="w-full mt-2" />
            </div>
            <div>
              <label className="ui-label block mb-1">Expressiveness · {agent.voice_temperature.toFixed(1)}</label>
              <input type="range" min={0} max={2} step={0.1} value={agent.voice_temperature}
                onChange={(e) => setAgent({ ...agent, voice_temperature: Number(e.target.value) })}
                data-testid="agent-voice-temp" className="w-full mt-2" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
