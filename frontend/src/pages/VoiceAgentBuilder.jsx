import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Check, Phone, Copy, Plus, Trash2 } from "../icons";
import Card from "../components/composites/Card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/composites/Tabs";
import Button from "../components/primitives/Button";
import Input from "../components/primitives/Input";
import Select from "../components/primitives/Select";
import Checkbox from "../components/primitives/Checkbox";

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
const NEUTRAL_VOICES = VOICES.filter((v) => v.gender === "neutral");

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
    fish_voice_id: "",
    fish_model: "s2.1-pro",
    greeting_message: "",
    volume_gain_db: 3.0,
  },
});

const FISH_MODELS = [
  { id: "s2.1-pro", label: "S2.1 Pro — recommended" },
  { id: "s2-pro", label: "S2 Pro" },
  { id: "s1", label: "S1 (legacy)" },
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

const langOptions = LANGUAGES.map((l) => ({ value: l, label: l }));
const accentOptions = ACCENTS.map((a) => ({ value: a.id, label: a.label }));
const styleOptions = SPEAKING_STYLES.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }));
const responseOptions = RESPONSE_STYLES.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }));
const interruptOptions = INTERRUPT_MODES.map((m) => ({ value: m, label: m.charAt(0).toUpperCase() + m.slice(1) }));
const crmContextOptions = [
  { value: "full_lead", label: "Full lead profile (name, company, title, industry)" },
  { value: "summary", label: "Summary only" },
  { value: "none", label: "No CRM context" },
];

function RangeField({ label, value, min, max, step, onChange, format, hints }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--text-primary)", fontFamily: "var(--font-ui)", marginBottom: 6 }}>
        {label} · {format ? format(value) : value}
      </label>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary" style={{ marginTop: 4 }} />
      {hints && (
        <div className="flex justify-between" style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>
          {hints.map((h) => <span key={h}>{h}</span>)}
        </div>
      )}
    </div>
  );
}

export default function VoiceAgentBuilder() {
  const { id } = useParams();
  const nav = useNavigate();
  const [agent, setAgent] = useState(emptyAgent());
  const [tab, setTab] = useState("0");
  const [busy, setBusy] = useState(false);
  const [inboundUrl, setInboundUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [fishVoices, setFishVoices] = useState([]);

  // Cloned voices are workspace-scoped, so this only ever lists voices this
  // workspace supplied samples for.
  useEffect(() => {
    if (agent.provider !== "twilio_fish") return;
    api.get("/voice-eq/fish/voices")
      .then((r) => setFishVoices(r.data || []))
      .catch(() => setFishVoices([]));
  }, [agent.provider]);

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

  const googleVoiceOptions = [
    { group: "English (US)", options: GOOGLE_VOICES.filter((v) => v.lang === "en-US").map((v) => ({ value: v.id, label: v.label })) },
    { group: "English (UK)", options: GOOGLE_VOICES.filter((v) => v.lang === "en-GB").map((v) => ({ value: v.id, label: v.label })) },
    { group: "English (Australia)", options: GOOGLE_VOICES.filter((v) => v.lang === "en-AU").map((v) => ({ value: v.id, label: v.label })) },
    { group: "Indian English", options: GOOGLE_VOICES.filter((v) => v.lang === "en-IN").map((v) => ({ value: v.id, label: v.label })) },
    { group: "Other languages", options: GOOGLE_VOICES.filter((v) => !["en-US", "en-GB", "en-AU", "en-IN"].includes(v.lang)).map((v) => ({ value: v.id, label: v.label })) },
  ];

  return (
    <div>
      <PageHeader
        title={id && id !== "new" ? agent.name : "New voice agent"}
        subtitle="Configure your AI SDR agent — voice, personality, qualification, and call rules."
        right={<Button variant="primary" icon={Check} onClick={save} isLoading={busy}>{id && id !== "new" ? "Save" : "Create agent"}</Button>}
      />

      <Tabs value={tab} onValueChange={setTab}>
        <div className="px-6 sm:px-8">
          <TabsList>
            {TAB_LABELS.map((label, i) => <TabsTrigger key={i} value={String(i)}>{label}</TabsTrigger>)}
          </TabsList>
        </div>

        <div className="animate-fade-in px-6 sm:px-8 max-w-4xl py-6 space-y-4">
          {/* ─────── Tab 0: General ─────── */}
          <TabsContent value="0" className="space-y-4">
            <Card title="Agent details">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input label="Name" value={agent.name} onChange={(e) => patchAgent({ name: e.target.value })} />
                <div>
                  <Select
                    label="Provider" value={agent.provider} onChange={(v) => patchAgent({ provider: v })}
                    options={[
                      { value: "twilio_openai", label: "Twilio + OpenAI Realtime" },
                      { value: "google_provider", label: "Google Cloud (STT → Claude → TTS)" },
                      { value: "twilio_fish", label: "Fish Audio (STT → Claude → cloned voice)" },
                    ]}
                  />
                  <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 6 }}>
                    {agent.provider === "google_provider"
                      ? "Split architecture: 50+ WaveNet/Studio voices, 30+ languages, Indian/British/Australian accents natively supported. Requires GOOGLE_API_KEY in .env."
                      : agent.provider === "twilio_fish"
                      ? "Split architecture with voice cloning — speaks in a voice your workspace supplied, and Claude adds word-level emphasis. Requires FISH_AUDIO_API_KEY and GOOGLE_API_KEY (speech recognition) in .env."
                      : "Low-latency end-to-end voice model. Limited to 8 OpenAI voices."}
                  </p>
                </div>
              </div>
              <div style={{ marginTop: 16 }}>
                <Input as="textarea" rows={6} label="System prompt / persona" value={agent.persona_prompt} onChange={(e) => patchAgent({ persona_prompt: e.target.value })}
                  style={{ fontFamily: "var(--font-mono)" }}
                  help="The agent receives this as its core instruction. CRM context is appended automatically." />
              </div>
            </Card>

            <Card title="Inbound calling">
              <Checkbox label="Enable inbound calls — route incoming calls to this agent" checked={agent.inbound_enabled}
                onChange={(e) => patchAgent({ inbound_enabled: e.target.checked })} />
              {agent.inbound_enabled && inboundUrl && (
                <div className="tnum flex items-center gap-2" style={{
                  marginTop: 12, background: "var(--bg-surface-sunken)", border: "1px solid var(--border-default)",
                  borderRadius: "var(--radius-lg)", padding: "8px 12px", fontSize: 12.5, fontFamily: "var(--font-mono)",
                }}>
                  <Phone size={12} strokeWidth={1.5} aria-hidden="true" className="shrink-0" style={{ color: "var(--text-tertiary)" }} />
                  <span className="flex-1 truncate">{inboundUrl}</span>
                  <button onClick={copyInboundUrl} title="Copy webhook URL" className="shrink-0" style={{ color: copied ? "var(--color-success)" : "var(--text-tertiary)" }}>
                    {copied ? <Check size={14} strokeWidth={1.5} aria-hidden="true" /> : <Copy size={14} strokeWidth={1.5} aria-hidden="true" />}
                  </button>
                </div>
              )}
              {agent.inbound_enabled && !inboundUrl && (
                <p style={{ fontSize: 12.5, color: "var(--color-warning-text)", marginTop: 8 }}>Save the agent first to generate the inbound webhook URL.</p>
              )}
              {agent.inbound_enabled && inboundUrl && (
                <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 8 }}>
                  Set this URL as the Voice webhook in your Twilio Console → Phone Numbers → your number → Voice configuration.
                </p>
              )}
            </Card>
          </TabsContent>

          {/* ─────── Tab 1: Voice & AI ─────── */}
          <TabsContent value="1" className="space-y-4">
            {agent.provider === "twilio_openai" ? (
              <>
                <Card title="AI model (OpenAI Realtime)">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Select label="Model" value={c.model} onChange={(v) => patchConfig({ model: v })} options={MODELS.map((m) => ({ value: m.id, label: m.label }))} />
                    <RangeField label="Temperature" value={c.temperature} min={0} max={1} step={0.05} format={(v) => v.toFixed(1)} onChange={(v) => patchConfig({ temperature: v })} />
                  </div>
                </Card>

                <Card title="Voice (OpenAI)">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Select
                      label="Voice" value={c.voice} onChange={(v) => patchConfig({ voice: v })}
                      options={[
                        { group: "Female voices", options: FEMALE_VOICES.map((v) => ({ value: v.id, label: v.label })) },
                        { group: "Male voices", options: MALE_VOICES.map((v) => ({ value: v.id, label: v.label })) },
                        { group: "Neutral", options: NEUTRAL_VOICES.map((v) => ({ value: v.id, label: v.label })) },
                      ]}
                    />
                    <Select label="Language" value={c.language} onChange={(v) => patchConfig({ language: v })} options={langOptions} />
                  </div>
                  <div style={{ marginTop: 16 }}>
                    <RangeField label="Speaking speed" value={c.speaking_speed} min={0.5} max={2} step={0.1} format={(v) => `${v.toFixed(1)}x`}
                      onChange={(v) => patchConfig({ speaking_speed: v })} hints={["Slow (0.5x)", "Normal (1.0x)", "Fast (2.0x)"]} />
                  </div>
                  <div style={{ marginTop: 16 }}>
                    <RangeField label="Volume boost" value={c.volume_gain_db ?? 3.0} min={-6} max={12} step={0.5} format={(v) => `${v.toFixed(1)} dB`}
                      onChange={(v) => patchConfig({ volume_gain_db: v })} hints={["-6 dB (quieter)", "0 dB (neutral)", "+12 dB (louder)"]} />
                  </div>
                </Card>

                <Card title="Style & personality">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Select label="Speaking style" value={c.speaking_style} onChange={(v) => patchConfig({ speaking_style: v })} options={styleOptions} />
                    <Select label="Response style" value={c.response_style} onChange={(v) => patchConfig({ response_style: v })} options={responseOptions} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" style={{ marginTop: 16 }}>
                    <Select label="Interrupt mode" value={c.interrupt_sensitivity} onChange={(v) => patchConfig({ interrupt_sensitivity: v })} options={interruptOptions}
                      help="How aggressively the agent handles barge-in." />
                    <Select label="Accent" value={c.accent || "neutral"} onChange={(v) => patchConfig({ accent: v })} options={accentOptions}
                      help="Speaking accent applied via prompt." />
                  </div>
                  <div style={{ marginTop: 16 }}>
                    <Select label="CRM context in prompt" value={c.crm_context_level} onChange={(v) => patchConfig({ crm_context_level: v })} options={crmContextOptions} />
                  </div>
                </Card>
              </>
            ) : (
              <>
                <Card title={agent.provider === "twilio_fish" ? "Fish Audio voice" : "Google Cloud voice"}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {agent.provider === "twilio_fish" ? (
                      <>
                        <Select
                          label="Voice" value={c.fish_voice_id || ""} onChange={(v) => patchConfig({ fish_voice_id: v })}
                          placeholder="Fish Audio default voice"
                          options={[{ value: "", label: "Fish Audio default voice" }, ...fishVoices.map((v) => ({ value: v.fish_voice_id, label: v.title }))]}
                          help={fishVoices.length ? "Voices cloned by this workspace." : "No cloned voices yet — upload samples in Voice Settings to add one."}
                        />
                        <Select label="Model" value={c.fish_model || "s2.1-pro"} onChange={(v) => patchConfig({ fish_model: v })} options={FISH_MODELS.map((m) => ({ value: m.id, label: m.label }))}
                          help="S2 models take inline emphasis cues; S1 is the older fixed-tag model." />
                        <Select label="STT language" value={c.google_stt_language || "en-US"} onChange={(v) => patchConfig({ google_stt_language: v })} options={langOptions}
                          help="Speech recognition language code." />
                      </>
                    ) : (
                      <>
                        <Select
                          label="Voice" value={c.google_voice || "en-US-Wavenet-D"}
                          onChange={(v) => {
                            const sel = GOOGLE_VOICES.find((gv) => gv.id === v);
                            patchConfig({ google_voice: v, google_stt_language: sel ? sel.lang : "en-US" });
                          }}
                          options={googleVoiceOptions}
                          help="WaveNet & Studio voices. Language auto-matched to voice."
                        />
                        <Select label="STT language" value={c.google_stt_language || "en-US"} onChange={(v) => patchConfig({ google_stt_language: v })} options={langOptions}
                          help="Speech recognition language code." />
                      </>
                    )}
                  </div>
                  <div style={{ marginTop: 16 }}>
                    <RangeField label="Speaking speed" value={c.speaking_speed} min={0.5} max={2} step={0.1} format={(v) => `${v.toFixed(1)}x`}
                      onChange={(v) => patchConfig({ speaking_speed: v })} hints={["Slow (0.5x)", "Normal (1.0x)", "Fast (2.0x)"]} />
                  </div>
                </Card>

                <Card title="Initial greeting">
                  <Input as="textarea" rows={2} label="Greeting message" value={c.greeting_message || ""} onChange={(e) => patchConfig({ greeting_message: e.target.value })}
                    placeholder="Leave empty for AI-generated greeting. Example: Hi, this is Sarah calling from Innoira — do you have a moment to chat?"
                    help="This plays in the agent's voice the instant the call connects. Leave blank to have the AI generate one." />
                </Card>

                <Card title="Style & personality">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Select label="Speaking style" value={c.speaking_style} onChange={(v) => patchConfig({ speaking_style: v })} options={styleOptions} />
                    <Select label="Response style" value={c.response_style} onChange={(v) => patchConfig({ response_style: v })} options={responseOptions} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" style={{ marginTop: 16 }}>
                    <Select label="Accent" value={c.accent || "neutral"} onChange={(v) => patchConfig({ accent: v })} options={accentOptions}
                      help="Accent applied via Claude prompt." />
                    <Select label="CRM context in prompt" value={c.crm_context_level} onChange={(v) => patchConfig({ crm_context_level: v })} options={crmContextOptions} />
                  </div>
                </Card>
              </>
            )}

            <Card title="Knowledge base">
              <p style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginBottom: 12 }}>Facts, pricing, and FAQs the agent can reference during calls.</p>
              <Input as="textarea" rows={4} value={c.knowledge_base} onChange={(e) => patchConfig({ knowledge_base: e.target.value })}
                placeholder="e.g. Our Starter plan is $499/mo for up to 5 seats..." />
            </Card>
          </TabsContent>

          {/* ─────── Tab 2: Qualification ─────── */}
          <TabsContent value="2">
            <Card>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2" style={{ marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>Qualification fields</div>
                  <p style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>Structured data the agent extracts and saves to the CRM.</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="tertiary" size="sm" onClick={() => applyFramework("BANT")}>BANT</Button>
                  <Button variant="tertiary" size="sm" onClick={() => applyFramework("MEDDIC")}>MEDDIC</Button>
                </div>
              </div>
              <div className="space-y-2">
                {(c.qualification_fields || []).map((f, i) => (
                  <div key={i} className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
                    <Input size="sm" placeholder="key" value={f.key} onChange={(e) => updateField(i, { key: e.target.value })} style={{ fontFamily: "var(--font-mono)" }} className="w-full sm:w-32" />
                    <Input size="sm" placeholder="What should the agent extract?" value={f.prompt} onChange={(e) => updateField(i, { prompt: e.target.value })} className="flex-1" />
                    <button onClick={() => removeField(i)} style={{ color: "var(--text-tertiary)" }}><Trash2 size={14} strokeWidth={1.5} aria-hidden="true" /></button>
                  </div>
                ))}
              </div>
              <Button variant="tertiary" size="sm" icon={Plus} onClick={addField} className="mt-3">Add field</Button>
            </Card>
          </TabsContent>

          {/* ─────── Tab 3: Rules ─────── */}
          <TabsContent value="3" className="space-y-4">
            <Card title="Call limits">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input type="number" min={1} max={60} label="Max call duration (minutes)" value={c.max_duration_minutes}
                  onChange={(e) => patchConfig({ max_duration_minutes: Number(e.target.value) || 10 })} />
                <Input type="number" min={5} max={120} label="Silence timeout (seconds)" value={c.silence_timeout_seconds}
                  onChange={(e) => patchConfig({ silence_timeout_seconds: Number(e.target.value) || 15 })} />
              </div>
            </Card>

            <Card title="Detection">
              <div className="space-y-2">
                <Checkbox label="Voicemail detection — hang up and log as voicemail" checked={c.voicemail_detection} onChange={(e) => patchConfig({ voicemail_detection: e.target.checked })} />
                <Checkbox label="Answering Machine Detection" checked={c.amd_enabled} onChange={(e) => patchConfig({ amd_enabled: e.target.checked })} />
                <Checkbox label="Background noise suppression" checked={c.background_noise_suppression} onChange={(e) => patchConfig({ background_noise_suppression: e.target.checked })} />
                <Checkbox label="Record calls" checked={c.call_recording} onChange={(e) => patchConfig({ call_recording: e.target.checked })} />
              </div>
            </Card>

            <Card title="Human handoff">
              <Checkbox label="If the lead asks for a person, the agent offers to connect them" checked={c.human_handoff_enabled} onChange={(e) => patchConfig({ human_handoff_enabled: e.target.checked })} />
              {c.human_handoff_enabled && (
                <p style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginTop: 8 }}>
                  The agent will acknowledge the request in the conversation — this doesn't yet perform a real call transfer.
                </p>
              )}
            </Card>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
