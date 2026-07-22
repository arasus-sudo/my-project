import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Save, Phone, Copy, Check, Plus, Trash2 } from "lucide-react";

const VOICES = [
  { id: "alloy", label: "Alloy — neutral, versatile", gender: "neutral" },
  { id: "echo", label: "Echo — warm, empathetic", gender: "male" },
  { id: "shimmer", label: "Shimmer — bright, articulate", gender: "female" },
  { id: "ash", label: "Ash — deep, authoritative", gender: "male" },
  { id: "ballad", label: "Ballad — smooth, melodic", gender: "female" },
  { id: "coral", label: "Coral — friendly, approachable", gender: "female" },
  { id: "sage", label: "Sage — calm, measured", gender: "male" },
  { id: "verse", label: "Verse — energetic, dynamic", gender: "female" },
];

const MALE_VOICES = VOICES.filter((v) => v.gender === "male");
const FEMALE_VOICES = VOICES.filter((v) => v.gender === "female");

const MODELS = [
  { id: "gpt-realtime-2.1", label: "GPT Realtime 2.1 (best)" },
  { id: "gpt-realtime-2.1-mini", label: "GPT Realtime 2.1 Mini (faster, cheaper)" },
  { id: "gpt-realtime-2", label: "GPT Realtime 2 (stable)" },
];

const LANGUAGES = [
  "en-US", "en-GB", "en-AU", "en-IN", "ar-SA", "hi-IN",
  "es-ES", "fr-FR", "de-DE", "pt-BR", "ja-JP", "ko-KR", "zh-CN",
];

const SPEAKING_STYLES = [
  "professional", "consultative", "friendly", "luxury",
  "healthcare", "legal", "finance", "corporate", "energetic", "technical",
];

const RESPONSE_STYLES = ["concise", "detailed", "natural", "conversational", "persuasive", "educational"];
const INTERRUPT_MODES = ["never", "balanced", "aggressive"];
const ACCENTS = [
  { id: "neutral", label: "Neutral English" },
  { id: "indian", label: "Indian English" },
  { id: "british", label: "British English" },
  { id: "australian", label: "Australian English" },
  { id: "american", label: "American English" },
];

const GOOGLE_VOICES = [
  { id: "en-US-Wavenet-A", label: "US Wavenet A (female)", gender: "female", lang: "en-US" },
  { id: "en-US-Wavenet-B", label: "US Wavenet B (male)", gender: "male", lang: "en-US" },
  { id: "en-US-Wavenet-C", label: "US Wavenet C (female)", gender: "female", lang: "en-US" },
  { id: "en-US-Wavenet-D", label: "US Wavenet D (male)", gender: "male", lang: "en-US" },
  { id: "en-US-Wavenet-E", label: "US Wavenet E (female)", gender: "female", lang: "en-US" },
  { id: "en-US-Wavenet-F", label: "US Wavenet F (female)", gender: "female", lang: "en-US" },
  { id: "en-US-Wavenet-G", label: "US Wavenet G (female)", gender: "female", lang: "en-US" },
  { id: "en-US-Wavenet-H", label: "US Wavenet H (male)", gender: "male", lang: "en-US" },
  { id: "en-US-Wavenet-I", label: "US Wavenet I (male)", gender: "male", lang: "en-US" },
  { id: "en-US-Wavenet-J", label: "US Wavenet J (male)", gender: "male", lang: "en-US" },
  { id: "en-US-Studio-O", label: "US Studio O (female) — highest quality", gender: "female", lang: "en-US" },
  { id: "en-US-Studio-Q", label: "US Studio Q (male) — highest quality", gender: "male", lang: "en-US" },
  { id: "en-GB-Wavenet-A", label: "UK Wavenet A (female)", gender: "female", lang: "en-GB" },
  { id: "en-GB-Wavenet-B", label: "UK Wavenet B (male)", gender: "male", lang: "en-GB" },
  { id: "en-GB-Wavenet-C", label: "UK Wavenet C (female)", gender: "female", lang: "en-GB" },
  { id: "en-GB-Wavenet-D", label: "UK Wavenet D (male)", gender: "male", lang: "en-GB" },
  { id: "en-GB-Studio-B", label: "UK Studio B (male) — highest quality", gender: "male", lang: "en-GB" },
  { id: "en-AU-Wavenet-A", label: "AU Wavenet A (female)", gender: "female", lang: "en-AU" },
  { id: "en-AU-Wavenet-B", label: "AU Wavenet B (male)", gender: "male", lang: "en-AU" },
  { id: "en-AU-Wavenet-C", label: "AU Wavenet C (female)", gender: "female", lang: "en-AU" },
  { id: "en-AU-Studio-A", label: "AU Studio A (female) — highest quality", gender: "female", lang: "en-AU" },
  { id: "en-IN-Wavenet-A", label: "IN Wavenet A (female) — Indian English", gender: "female", lang: "en-IN" },
  { id: "en-IN-Wavenet-B", label: "IN Wavenet B (male) — Indian English", gender: "male", lang: "en-IN" },
  { id: "en-IN-Wavenet-C", label: "IN Wavenet C (male) — Indian English", gender: "male", lang: "en-IN" },
  { id: "en-IN-Studio-A", label: "IN Studio A (female) — Indian English, highest quality", gender: "female", lang: "en-IN" },
  { id: "hi-IN-Wavenet-A", label: "Hindi Wavenet A (female)", gender: "female", lang: "hi-IN" },
  { id: "hi-IN-Wavenet-B", label: "Hindi Wavenet B (male)", gender: "male", lang: "hi-IN" },
  { id: "es-ES-Wavenet-B", label: "Spanish Wavenet B (male)", gender: "male", lang: "es-ES" },
  { id: "fr-FR-Wavenet-C", label: "French Wavenet C (female)", gender: "female", lang: "fr-FR" },
  { id: "de-DE-Wavenet-A", label: "German Wavenet A (female)", gender: "female", lang: "de-DE" },
  { id: "ja-JP-Wavenet-A", label: "Japanese Wavenet A (female)", gender: "female", lang: "ja-JP" },
  { id: "pt-BR-Wavenet-A", label: "Brazilian Wavenet A (female)", gender: "female", lang: "pt-BR" },
];



const TAB_LABELS = ["General", "Voice & AI", "Qualification", "Rules"];

const emptyAgent = () => ({
  name: "Untitled agent",
  persona_prompt: "You are a professional SDR calling on behalf of our company. Qualify the lead naturally, answer their questions, and book a meeting if they're interested. Do NOT ask for their name, company, or email — you already have it from the CRM.",
  inbound_enabled: false,
  outbound_enabled: true,
  provider: "twilio_openai",
  config: {
    voice: "alloy",
    language: "en-US",
    speaking_speed: 1.0,
    temperature: 0.7,
    interrupt_sensitivity: "balanced",
    model: "gpt-realtime-2.1",
    speaking_style: "professional",
    response_style: "conversational",
    max_duration_minutes: 10,
    silence_timeout_seconds: 15,
    voicemail_detection: true,
    amd_enabled: true,
    background_noise_suppression: true,
    call_recording: true,
    human_handoff_enabled: false,
    accent: "neutral",
    qualification_framework: "custom",
    qualification_fields: [],
    knowledge_base: "",
    crm_context_level: "full_lead",
    google_voice: "en-US-Studio-Q",
    google_stt_language: "en-US",
    greeting_message: "",
    volume_gain_db: 3.0,
  },
});

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

export default function VoiceAgentBuilder() {
  const { id } = useParams();
  const nav = useNavigate();
  const [agent, setAgent] = useState(emptyAgent());
  const [tab, setTab] = useState(0);
  const [busy, setBusy] = useState(false);
  const [inboundUrl, setInboundUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!id || id === "new") return;
    api.get(`/voice-eq/agents/${id}`).then((r) => setAgent({
      ...emptyAgent(),
      ...r.data,
      config: { ...emptyAgent().config, ...(r.data.config || {}) },
    }));
  }, [id]);

  useEffect(() => {
    if (id && id !== "new" && agent.inbound_enabled) {
      api.get(`/voice-eq/agents/${id}/inbound-url`).then((r) => setInboundUrl(r.data.url || ""));
    }
  }, [id, agent.inbound_enabled]);

  const patchAgent = (patch) => setAgent({ ...agent, ...patch });
  const patchConfig = (patch) => setAgent({ ...agent, config: { ...agent.config, ...patch } });

  const applyFramework = (fw) => {
    patchConfig({ qualification_framework: fw, qualification_fields: FRAMEWORKS[fw] || [] });
  };
  const updateField = (i, patch) => {
    const next = [...(agent.config.qualification_fields || [])];
    next[i] = { ...next[i], ...patch };
    patchConfig({ qualification_fields: next, qualification_framework: "custom" });
  };
  const addField = () => patchConfig({
    qualification_framework: "custom",
    qualification_fields: [...(agent.config.qualification_fields || []), { key: "", prompt: "", type: "string" }],
  });
  const removeField = (i) => patchConfig({
    qualification_fields: (agent.config.qualification_fields || []).filter((_, x) => x !== i),
  });

  const save = async () => {
    setBusy(true);
    try {
      if (id && id !== "new") {
        const { data } = await api.put(`/voice-eq/agents/${id}`, agent);
        setAgent({ ...emptyAgent(), ...data, config: { ...emptyAgent().config, ...(data.config || {}) } });
        toast.success("Saved");
      } else {
        const { data } = await api.post("/voice-eq/agents", agent);
        toast.success("Agent created");
        nav(`/app/voice-eq/agents/${data.id}`, { replace: true });
      }
    } catch (err) { toast.error(err?.response?.data?.detail || "Save failed"); }
    finally { setBusy(false); }
  };

  const copyInboundUrl = () => {
    if (inboundUrl) {
      navigator.clipboard.writeText(inboundUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const c = agent.config;

  return (
    <div>
      <PageHeader
        title={id && id !== "new" ? agent.name : "New voice agent"}
        subtitle="Configure your AI SDR agent — voice, personality, qualification, and call rules."
        right={
          <div className="flex gap-2">
            <button onClick={save} disabled={busy} className="btn-primary">
              <Save size={14} /> {id && id !== "new" ? "Save" : "Create agent"}
            </button>
          </div>
        }
      />

      {/* Tabs */}
      <div className="px-6 sm:px-8 border-b border-line">
        <div className="flex gap-6 -mb-px">
          {TAB_LABELS.map((label, i) => (
            <button key={i} onClick={() => setTab(i)}
              className={`pb-2 text-body font-medium font-display border-b-2 transition-colors ${
                i === tab ? "border-ink text-ink" : "border-transparent text-ink-muted hover:text-ink"
              }`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="animate-fade-in px-6 sm:px-8 max-w-4xl py-6 space-y-6">

        {/* ─────── Tab 0: General ─────── */}
        {tab === 0 && (
          <>
            <div className="shadow-card rounded-2xl p-6 space-y-4">
              <div className="text-card-title font-display font-semibold">Agent details</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="form-label block mb-1">Name</label>
                  <input value={agent.name} onChange={(e) => patchAgent({ name: e.target.value })}
                    className="w-full border border-line px-3 py-2 rounded-lg" />
                </div>
                <div>
                  <label className="form-label block mb-1">Provider</label>
                  <select value={agent.provider} onChange={(e) => patchAgent({ provider: e.target.value })}
                    className="w-full border border-line px-3 py-2 rounded-lg">
                    <option value="twilio_openai">Twilio + OpenAI Realtime</option>
                    <option value="google_provider">Google Cloud (STT → Claude → TTS)</option>
                  </select>
                  <p className="text-tiny text-ink-muted mt-1">
                    {agent.provider === "google_provider"
                      ? "Split architecture: 50+ WaveNet/Studio voices, 30+ languages, Indian/British/Australian accents natively supported. Requires GOOGLE_API_KEY in .env."
                      : "Low-latency end-to-end voice model. Limited to 8 OpenAI voices."}
                  </p>
                </div>
              </div>
              <div>
                <label className="form-label block mb-1">System prompt / persona</label>
                <textarea value={agent.persona_prompt} onChange={(e) => patchAgent({ persona_prompt: e.target.value })}
                  rows={6} className="w-full border border-line px-3 py-2 rounded-lg font-mono text-input" />
                <p className="text-tiny text-ink-muted mt-1">
                  The agent receives this as its core instruction. CRM context is appended automatically.
                </p>
              </div>
            </div>

            <div className="shadow-card rounded-2xl p-6 space-y-4">
              <div className="text-card-title font-display font-semibold">Inbound calling</div>
              <label className="flex items-center gap-2 text-body">
                <input type="checkbox" checked={agent.inbound_enabled}
                  onChange={(e) => patchAgent({ inbound_enabled: e.target.checked })} />
                Enable inbound calls — route incoming calls to this agent
              </label>
              {agent.inbound_enabled && inboundUrl && (
                <div className="flex items-center gap-2 bg-bone border border-line rounded-lg px-3 py-2 text-caption font-mono">
                  <Phone size={12} className="shrink-0 text-ink-muted" />
                  <span className="flex-1 truncate">{inboundUrl}</span>
                  <button onClick={copyInboundUrl} className="shrink-0 text-ink-muted hover:text-ink" title="Copy webhook URL">
                    {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
                  </button>
                </div>
              )}
              {agent.inbound_enabled && !inboundUrl && (
                <p className="text-caption text-warning">Save the agent first to generate the inbound webhook URL.</p>
              )}
              {agent.inbound_enabled && inboundUrl && (
                <p className="text-tiny text-ink-muted">
                  Set this URL as the Voice webhook in your Twilio Console → Phone Numbers → your number → Voice configuration.
                </p>
              )}
            </div>
          </>
        )}

        {/* ─────── Tab 1: Voice & AI ─────── */}
        {tab === 1 && (
          <>
            {agent.provider === "twilio_openai" ? (
              <>
                <div className="shadow-card rounded-2xl p-6 space-y-4">
                  <div className="text-card-title font-display font-semibold">AI model (OpenAI Realtime)</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="form-label block mb-1">Model</label>
                      <select value={c.model} onChange={(e) => patchConfig({ model: e.target.value })}
                        className="w-full border border-line px-3 py-2 rounded-lg">
                        {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="form-label block mb-1">Temperature · {c.temperature.toFixed(1)}</label>
                      <input type="range" min={0} max={1} step={0.05} value={c.temperature}
                        onChange={(e) => patchConfig({ temperature: Number(e.target.value) })}
                        className="w-full mt-2" />
                    </div>
                  </div>
                </div>

                <div className="shadow-card rounded-2xl p-6 space-y-4">
                  <div className="text-card-title font-display font-semibold">Voice (OpenAI)</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="form-label block mb-1">Voice</label>
                      <select value={c.voice} onChange={(e) => patchConfig({ voice: e.target.value })}
                        className="w-full border border-line px-3 py-2 rounded-lg">
                        <optgroup label="♀ Female voices">
                          {FEMALE_VOICES.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                        </optgroup>
                        <optgroup label="♂ Male voices">
                          {MALE_VOICES.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                        </optgroup>
                        <optgroup label="— Neutral">
                          {VOICES.filter((v) => v.gender === "neutral").map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                        </optgroup>
                      </select>
                    </div>
                    <div>
                      <label className="form-label block mb-1">Language</label>
                      <select value={c.language} onChange={(e) => patchConfig({ language: e.target.value })}
                        className="w-full border border-line px-3 py-2 rounded-lg">
                        {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="form-label block mb-1">Speaking speed · {c.speaking_speed.toFixed(1)}x</label>
                    <input type="range" min={0.5} max={2} step={0.1} value={c.speaking_speed}
                      onChange={(e) => patchConfig({ speaking_speed: Number(e.target.value) })}
                      className="w-full mt-2" />
                    <div className="flex justify-between text-tiny text-ink-muted mt-1">
                      <span>Slow (0.5x)</span>
                      <span>Normal (1.0x)</span>
                      <span>Fast (2.0x)</span>
                    </div>
                  </div>
                  <div>
                    <label className="form-label block mb-1">Volume boost · {c.volume_gain_db != null ? c.volume_gain_db.toFixed(1) : "3.0"} dB</label>
                    <input type="range" min={-6} max={12} step={0.5}
                      value={c.volume_gain_db ?? 3.0}
                      onChange={(e) => patchConfig({ volume_gain_db: Number(e.target.value) })}
                      className="w-full mt-2" />
                    <div className="flex justify-between text-tiny text-ink-muted mt-1">
                      <span>-6 dB (quieter)</span>
                      <span>0 dB (neutral)</span>
                      <span>+12 dB (louder)</span>
                    </div>
                  </div>
                </div>

                <div className="shadow-card rounded-2xl p-6 space-y-4">
                  <div className="text-card-title font-display font-semibold">Style & personality</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="form-label block mb-1">Speaking style</label>
                      <select value={c.speaking_style} onChange={(e) => patchConfig({ speaking_style: e.target.value })}
                        className="w-full border border-line px-3 py-2 rounded-lg">
                        {SPEAKING_STYLES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="form-label block mb-1">Response style</label>
                      <select value={c.response_style} onChange={(e) => patchConfig({ response_style: e.target.value })}
                        className="w-full border border-line px-3 py-2 rounded-lg">
                        {RESPONSE_STYLES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="form-label block mb-1">Interrupt mode</label>
                      <select value={c.interrupt_sensitivity} onChange={(e) => patchConfig({ interrupt_sensitivity: e.target.value })}
                        className="w-full border border-line px-3 py-2 rounded-lg">
                        {INTERRUPT_MODES.map((m) => <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
                      </select>
                      <p className="text-tiny text-ink-muted mt-1">How aggressively the agent handles barge-in.</p>
                    </div>
                    <div>
                      <label className="form-label block mb-1">Accent</label>
                      <select value={c.accent || "neutral"} onChange={(e) => patchConfig({ accent: e.target.value })}
                        className="w-full border border-line px-3 py-2 rounded-lg">
                        {ACCENTS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                      </select>
                      <p className="text-tiny text-ink-muted mt-1">Speaking accent applied via prompt.</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="form-label block mb-1">CRM context in prompt</label>
                      <select value={c.crm_context_level} onChange={(e) => patchConfig({ crm_context_level: e.target.value })}
                        className="w-full border border-line px-3 py-2 rounded-lg">
                        <option value="full_lead">Full lead profile (name, company, title, industry)</option>
                        <option value="summary">Summary only</option>
                        <option value="none">No CRM context</option>
                      </select>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="shadow-card rounded-2xl p-6 space-y-4">
                  <div className="text-card-title font-display font-semibold">Google Cloud voice</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="form-label block mb-1">Voice</label>
                      <select value={c.google_voice || "en-US-Wavenet-D"} onChange={(e) => {
                        const sel = GOOGLE_VOICES.find((v) => v.id === e.target.value);
                        patchConfig({ google_voice: e.target.value, google_stt_language: sel ? sel.lang : "en-US" });
                      }} className="w-full border border-line px-3 py-2 rounded-lg">
                        <optgroup label="🇺🇸 English (US)">
                          {GOOGLE_VOICES.filter((v) => v.lang === "en-US").map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                        </optgroup>
                        <optgroup label="🇬🇧 English (UK)">
                          {GOOGLE_VOICES.filter((v) => v.lang === "en-GB").map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                        </optgroup>
                        <optgroup label="🇦🇺 English (Australia)">
                          {GOOGLE_VOICES.filter((v) => v.lang === "en-AU").map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                        </optgroup>
                        <optgroup label="🇮🇳 Indian English">
                          {GOOGLE_VOICES.filter((v) => v.lang === "en-IN").map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                        </optgroup>
                        <optgroup label="🌐 Other languages">
                          {GOOGLE_VOICES.filter((v) => !["en-US","en-GB","en-AU","en-IN"].includes(v.lang)).map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                        </optgroup>
                      </select>
                      <p className="text-tiny text-ink-muted mt-1">WaveNet & Studio voices. Language auto-matched to voice.</p>
                    </div>
                    <div>
                      <label className="form-label block mb-1">STT language</label>
                      <select value={c.google_stt_language || "en-US"} onChange={(e) => patchConfig({ google_stt_language: e.target.value })}
                        className="w-full border border-line px-3 py-2 rounded-lg">
                        {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
                      </select>
                      <p className="text-tiny text-ink-muted mt-1">Speech recognition language code.</p>
                    </div>
                  </div>
                  <div>
                    <label className="form-label block mb-1">Speaking speed · {c.speaking_speed.toFixed(1)}x</label>
                    <input type="range" min={0.5} max={2} step={0.1} value={c.speaking_speed}
                      onChange={(e) => patchConfig({ speaking_speed: Number(e.target.value) })}
                      className="w-full mt-2" />
                    <div className="flex justify-between text-tiny text-ink-muted mt-1">
                      <span>Slow (0.5x)</span>
                      <span>Normal (1.0x)</span>
                      <span>Fast (2.0x)</span>
                    </div>
                  </div>
                </div>

                <div className="shadow-card rounded-2xl p-6 space-y-4">
                  <div className="text-card-title font-display font-semibold">Initial greeting</div>
                  <div>
                    <label className="form-label block mb-1">Greeting message</label>
                    <textarea value={c.greeting_message || ""} onChange={(e) => patchConfig({ greeting_message: e.target.value })}
                      rows={2} placeholder="Leave empty for AI-generated greeting. Example: Hi, this is Sarah calling from Innoira — do you have a moment to chat?"
                      className="w-full border border-line px-3 py-2 rounded-lg text-input" />
                    <p className="text-tiny text-ink-muted mt-1">
                      This plays in the agent's voice the instant the call connects. Leave blank to have the AI generate one.
                    </p>
                  </div>
                </div>

                <div className="shadow-card rounded-2xl p-6 space-y-4">
                  <div className="text-card-title font-display font-semibold">Style & personality</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="form-label block mb-1">Speaking style</label>
                      <select value={c.speaking_style} onChange={(e) => patchConfig({ speaking_style: e.target.value })}
                        className="w-full border border-line px-3 py-2 rounded-lg">
                        {SPEAKING_STYLES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="form-label block mb-1">Response style</label>
                      <select value={c.response_style} onChange={(e) => patchConfig({ response_style: e.target.value })}
                        className="w-full border border-line px-3 py-2 rounded-lg">
                        {RESPONSE_STYLES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="form-label block mb-1">Accent</label>
                      <select value={c.accent || "neutral"} onChange={(e) => patchConfig({ accent: e.target.value })}
                        className="w-full border border-line px-3 py-2 rounded-lg">
                        {ACCENTS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                      </select>
                      <p className="text-tiny text-ink-muted mt-1">Accent applied via Claude prompt.</p>
                    </div>
                    <div>
                      <label className="form-label block mb-1">CRM context in prompt</label>
                      <select value={c.crm_context_level} onChange={(e) => patchConfig({ crm_context_level: e.target.value })}
                        className="w-full border border-line px-3 py-2 rounded-lg">
                        <option value="full_lead">Full lead profile (name, company, title, industry)</option>
                        <option value="summary">Summary only</option>
                        <option value="none">No CRM context</option>
                      </select>
                    </div>
                  </div>
                </div>
              </>
            )}

            <div className="shadow-card rounded-2xl p-6 space-y-4">
              <div className="text-card-title font-display font-semibold">Knowledge base</div>
              <p className="text-caption text-ink-muted">Facts, pricing, and FAQs the agent can reference during calls.</p>
              <textarea value={c.knowledge_base} onChange={(e) => patchConfig({ knowledge_base: e.target.value })}
                rows={4} placeholder="e.g. Our Starter plan is $499/mo for up to 5 seats..."
                className="w-full border border-line px-3 py-2 rounded-lg text-input" />
            </div>
          </>
        )}

        {/* ─────── Tab 2: Qualification ─────── */}
        {tab === 2 && (
          <div className="shadow-card rounded-2xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <div className="text-card-title font-display font-semibold">Qualification fields</div>
                <p className="text-caption text-ink-muted">Structured data the agent extracts and saves to the CRM.</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => applyFramework("BANT")} className="btn-ghost text-xs">BANT</button>
                <button onClick={() => applyFramework("MEDDIC")} className="btn-ghost text-xs">MEDDIC</button>
              </div>
            </div>
            <div className="space-y-2">
              {(c.qualification_fields || []).map((f, i) => (
                <div key={i} className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
                  <input placeholder="key" value={f.key} onChange={(e) => updateField(i, { key: e.target.value })}
                    className="w-full sm:w-32 border border-line px-2 py-1.5 rounded-lg text-input font-mono" />
                  <input placeholder="What should the agent extract?" value={f.prompt}
                    onChange={(e) => updateField(i, { prompt: e.target.value })}
                    className="flex-1 border border-line px-2 py-1.5 rounded-lg text-input" />
                  <button onClick={() => removeField(i)} className="text-ink-muted hover:text-danger">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            <button onClick={addField} className="btn-ghost text-xs"><Plus size={12} /> Add field</button>
          </div>
        )}

        {/* ─────── Tab 3: Rules ─────── */}
        {tab === 3 && (
          <>
            <div className="shadow-card rounded-2xl p-6 space-y-4">
              <div className="text-card-title font-display font-semibold">Call limits</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="form-label block mb-1">Max call duration (minutes)</label>
                  <input type="number" min={1} max={60} value={c.max_duration_minutes}
                    onChange={(e) => patchConfig({ max_duration_minutes: Number(e.target.value) || 10 })}
                    className="w-full border border-line px-3 py-2 rounded-lg" />
                </div>
                <div>
                  <label className="form-label block mb-1">Silence timeout (seconds)</label>
                  <input type="number" min={5} max={120} value={c.silence_timeout_seconds}
                    onChange={(e) => patchConfig({ silence_timeout_seconds: Number(e.target.value) || 15 })}
                    className="w-full border border-line px-3 py-2 rounded-lg" />
                </div>
              </div>
            </div>

            <div className="shadow-card rounded-2xl p-6 space-y-4">
              <div className="text-card-title font-display font-semibold">Detection</div>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-body">
                  <input type="checkbox" checked={c.voicemail_detection}
                    onChange={(e) => patchConfig({ voicemail_detection: e.target.checked })} />
                  Voicemail detection — hang up and log as voicemail
                </label>
                <label className="flex items-center gap-2 text-body">
                  <input type="checkbox" checked={c.amd_enabled}
                    onChange={(e) => patchConfig({ amd_enabled: e.target.checked })} />
                  Answering Machine Detection
                </label>
                <label className="flex items-center gap-2 text-body">
                  <input type="checkbox" checked={c.background_noise_suppression}
                    onChange={(e) => patchConfig({ background_noise_suppression: e.target.checked })} />
                  Background noise suppression
                </label>
                <label className="flex items-center gap-2 text-body">
                  <input type="checkbox" checked={c.call_recording}
                    onChange={(e) => patchConfig({ call_recording: e.target.checked })} />
                  Record calls
                </label>
              </div>
            </div>

            <div className="shadow-card rounded-2xl p-6 space-y-4">
              <div className="text-card-title font-display font-semibold">Human handoff</div>
              <label className="flex items-center gap-2 text-body">
                <input type="checkbox" checked={c.human_handoff_enabled}
                  onChange={(e) => patchConfig({ human_handoff_enabled: e.target.checked })} />
                If the lead asks for a person, the agent offers to connect them
              </label>
              {c.human_handoff_enabled && (
                <p className="text-caption text-ink-muted">
                  The agent will acknowledge the request in the conversation — this doesn't yet perform a real call transfer.
                </p>
              )}
            </div>
          </>
        )}

      </div>
    </div>
  );
}
