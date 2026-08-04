import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { toast } from "sonner";
import { ArrowRight, Sparkles, Check, Loader2, X } from "../icons";
import Input from "../components/primitives/Input";
import Select from "../components/primitives/Select";
import Button from "../components/primitives/Button";

const PERSONA_TYPES = [
  { v: "individual", label: "Individual" },
  { v: "influencer", label: "Influencer / creator" },
  { v: "startup", label: "Startup" },
  { v: "solo_company", label: "Solo-founder company" },
  { v: "enterprise", label: "Enterprise" },
];
const PLATFORMS = ["linkedin", "instagram", "youtube"];
const TONE_OPTIONS = ["warm", "professional", "direct", "playful", "formal"].map((t) => ({ value: t, label: t[0].toUpperCase() + t.slice(1) }));

function SelectPill({ selected, onClick, className = "", children, ...rest }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`capitalize ${className}`}
      style={{
        height: 32, padding: "0 14px", borderRadius: "var(--radius-full)",
        border: `1px solid ${selected ? "var(--color-primary)" : "var(--border-default)"}`,
        background: selected ? "var(--text-primary)" : "var(--bg-surface)",
        color: selected ? "var(--bg-surface)" : "var(--text-primary)",
        fontSize: 13, fontWeight: 500, fontFamily: "var(--font-ui)",
        transition: "background 150ms, border-color 150ms",
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

function StepPanel({ children }) {
  return (
    <div className="animate-fade-in" style={{
      background: "var(--bg-surface)", border: "1px solid var(--border-default)",
      borderRadius: "var(--radius-2xl)", boxShadow: "var(--shadow-xs)", padding: "24px 24px",
    }}>
      {children}
    </div>
  );
}

export default function SocialSetup() {
  const nav = useNavigate();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);

  const [personaType, setPersonaType] = useState("");
  const [url, setUrl] = useState("");
  const [inputText, setInputText] = useState("");

  const [tone, setTone] = useState("warm");
  const [offer, setOffer] = useState("");
  const [icp, setIcp] = useState("");
  const [pillars, setPillars] = useState([]);
  const [pillarInput, setPillarInput] = useState("");

  const [brandKits, setBrandKits] = useState([]);
  const [brandKitId, setBrandKitId] = useState(null);
  const [daysPerWeek, setDaysPerWeek] = useState(3);
  const [platforms, setPlatforms] = useState([]);

  useEffect(() => {
    api.get("/brandkits").then((r) => setBrandKits(r.data || [])).catch(() => setBrandKits([]));
  }, []);

  const analyze = async () => {
    if (!personaType) { toast.error("Choose what best describes you"); return; }
    if (!url.trim() && !inputText.trim()) { toast.error("Add a website or a short description"); return; }
    setBusy(true);
    try {
      const { data } = await api.post("/social-eq/setup/analyze", {
        persona_type: personaType, url: url.trim(), input_text: inputText.trim(),
      });
      setTone(data.tone || "warm");
      setOffer(data.offer || "");
      setIcp(data.icp_description || "");
      setPillars(data.content_pillars || []);
      setStep(2);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not analyze — try a shorter description");
    } finally { setBusy(false); }
  };

  const addPillar = () => {
    const p = pillarInput.trim();
    if (!p || pillars.includes(p)) { setPillarInput(""); return; }
    setPillars([...pillars, p]);
    setPillarInput("");
  };
  const removePillar = (p) => setPillars(pillars.filter((x) => x !== p));

  const togglePlatform = (p) => setPlatforms((cur) => cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]);

  const finish = async () => {
    setBusy(true);
    try {
      const { data: current } = await api.get("/workspace/brand-voice");
      await api.put("/workspace/brand-voice", {
        ...current, tone, offer, icp_description: icp, content_pillars: pillars,
        persona_type: personaType, brand_kit_id: brandKitId,
        posting_cadence: { days_per_week: daysPerWeek, preferred_platforms: platforms },
      });
      toast.success("Brand set up — Social EQ will start drafting daily");
      nav("/app/social-eq");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Save failed");
    } finally { setBusy(false); }
  };

  const skip = () => nav("/app/social-eq?setup=skipped");

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-canvas)" }} className="p-6 sm:p-8 animate-fade-in">
      <div className="max-w-3xl mx-auto" style={{ paddingTop: 48, paddingBottom: 64 }}>
        <div className="flex items-center gap-3" style={{ marginBottom: 32 }}>
          <div className="flex items-center justify-center rounded-full" style={{
            width: 32, height: 32, background: "var(--text-primary)", color: "var(--bg-surface)",
            fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14,
          }}>S</div>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14, color: "var(--text-primary)" }}>
            Social EQ <span style={{ color: "var(--text-tertiary)" }}>/</span> <span style={{ color: "var(--text-tertiary)" }}>Set up your brand</span>
          </div>
          <button onClick={skip} data-testid="social-setup-skip" className="ml-auto" style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>Skip for now</button>
        </div>

        <div className="flex items-center gap-2" style={{ marginBottom: 40 }}>
          {[1, 2, 3].map((n) => (
            <div key={n} className="flex-1 rounded-full" style={{ height: 6, background: step >= n ? "var(--color-primary)" : "var(--border-default)" }} />
          ))}
        </div>

        {step === 1 && (
          <StepPanel>
            <div className="flex items-center gap-1" style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-tertiary)", marginBottom: 12 }}>
              <Sparkles size={12} strokeWidth={1.5} aria-hidden="true" /> Step 1 of 3
            </div>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 600, color: "var(--text-primary)" }}>Tell Social EQ who you are.</h1>
            <p style={{ marginTop: 12, fontSize: 14, color: "var(--text-secondary)" }}>
              This informs every post it drafts, checks, and schedules for you — the same positioning
              across every platform.
            </p>
            <div style={{ marginTop: 32 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>What best describes you?</label>
              <div className="flex flex-wrap gap-2" style={{ marginTop: 8 }}>
                {PERSONA_TYPES.map((p) => (
                  <SelectPill key={p.v} selected={personaType === p.v} onClick={() => setPersonaType(p.v)} data-testid={`persona-${p.v}`}>
                    {p.label}
                  </SelectPill>
                ))}
              </div>
            </div>
            <div style={{ marginTop: 24 }}>
              <Input label="Website or profile URL" hint="Optional" value={url} onChange={(e) => setUrl(e.target.value)} data-testid="social-setup-url" placeholder="https://yoursite.com" />
            </div>
            <div style={{ marginTop: 24 }}>
              <Input as="textarea" rows={3} label="Or describe what you do" hint="If no URL" value={inputText} onChange={(e) => setInputText(e.target.value)}
                data-testid="social-setup-text" placeholder="e.g. I'm a fitness coach helping busy professionals build sustainable habits." />
            </div>
            <Button variant="primary" trailingIcon={ArrowRight} onClick={analyze} isLoading={busy}
              data-testid="social-setup-analyze" style={{ marginTop: 24 }}>
              {busy ? "Analyzing…" : "Continue"}
            </Button>
          </StepPanel>
        )}

        {step === 2 && (
          <StepPanel>
            <div className="flex items-center gap-1" style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-tertiary)", marginBottom: 12 }}>
              <Check size={12} strokeWidth={1.5} aria-hidden="true" /> Step 2 of 3
            </div>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 600, color: "var(--text-primary)" }}>Here's your starting positioning.</h1>
            <p style={{ marginTop: 8, fontSize: 14, color: "var(--text-secondary)" }}>Edit anything — this is a first draft, not final.</p>

            <div style={{ marginTop: 24 }}>
              <Select label="Tone" value={tone} onChange={setTone} options={TONE_OPTIONS} data-testid="social-setup-tone" />
            </div>
            <div style={{ marginTop: 20 }}>
              <Input as="textarea" rows={2} label="What you offer" value={offer} onChange={(e) => setOffer(e.target.value)} data-testid="social-setup-offer" />
            </div>
            <div style={{ marginTop: 20 }}>
              <Input as="textarea" rows={2} label="Who you're speaking to" value={icp} onChange={(e) => setIcp(e.target.value)} data-testid="social-setup-icp" />
            </div>
            <div style={{ marginTop: 20 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--text-primary)", marginBottom: 8 }}>Content pillars — recurring topics</label>
              <div className="flex gap-2">
                <Input value={pillarInput} onChange={(e) => setPillarInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPillar(); } }}
                  data-testid="social-setup-pillar-input" placeholder="press Enter to add" className="flex-1" />
                <Button variant="secondary" onClick={addPillar} className="shrink-0">Add</Button>
              </div>
              {pillars.length > 0 && (
                <div className="flex flex-wrap gap-1.5" style={{ marginTop: 10 }}>
                  {pillars.map((p) => (
                    <span key={p} className="inline-flex items-center gap-1" style={{
                      height: 26, padding: "0 8px", borderRadius: "var(--radius-full)",
                      border: "1px solid var(--border-default)", background: "var(--bg-surface)",
                      fontSize: 12.5, fontWeight: 500, color: "var(--text-primary)",
                    }}>
                      {p}
                      <button onClick={() => removePillar(p)} style={{ color: "var(--text-tertiary)" }}>
                        <X size={12} strokeWidth={1.75} aria-hidden="true" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2" style={{ marginTop: 24 }}>
              <Button variant="secondary" onClick={() => setStep(1)}>Back</Button>
              <Button variant="primary" trailingIcon={ArrowRight} onClick={() => setStep(3)} isDisabled={pillars.length === 0} data-testid="social-setup-next">Continue</Button>
            </div>
          </StepPanel>
        )}

        {step === 3 && (
          <StepPanel>
            <div className="flex items-center gap-1" style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-tertiary)", marginBottom: 12 }}>
              <Check size={12} strokeWidth={1.5} aria-hidden="true" /> Step 3 of 3
            </div>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 600, color: "var(--text-primary)" }}>Brand look + posting rhythm.</h1>

            <div style={{ marginTop: 24 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
                Brand kit <span style={{ fontWeight: 400, color: "var(--text-tertiary)" }}>(colors/logo used in generated images)</span>
              </label>
              {brandKits.length === 0 ? (
                <p style={{ marginTop: 8, fontSize: 12.5, color: "var(--text-tertiary)" }}>
                  No brand kits yet — <Link to="/app/create-eq" style={{ color: "var(--text-link)" }}>create one in Create EQ</Link>, or skip this for now.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2" style={{ marginTop: 8 }}>
                  {brandKits.map((k) => (
                    <SelectPill key={k.id} selected={brandKitId === k.id} onClick={() => setBrandKitId(k.id)} data-testid={`brandkit-${k.id}`}>
                      {k.name}
                    </SelectPill>
                  ))}
                </div>
              )}
            </div>

            <div style={{ marginTop: 24 }}>
              <Input type="number" min={1} max={7} label="Posting days per week" value={daysPerWeek}
                onChange={(e) => setDaysPerWeek(Number(e.target.value) || 1)} data-testid="social-setup-days" className="w-24" />
            </div>
            <div style={{ marginTop: 20 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--text-primary)", marginBottom: 8 }}>Platforms</label>
              <div className="flex flex-wrap gap-2">
                {PLATFORMS.map((p) => (
                  <SelectPill key={p} selected={platforms.includes(p)} onClick={() => togglePlatform(p)} data-testid={`social-setup-platform-${p}`}>{p}</SelectPill>
                ))}
              </div>
            </div>

            <div className="flex gap-2" style={{ marginTop: 24 }}>
              <Button variant="secondary" onClick={() => setStep(2)}>Back</Button>
              <Button variant="primary" trailingIcon={ArrowRight} onClick={finish} isLoading={busy} isDisabled={platforms.length === 0} data-testid="social-setup-finish">
                {busy ? "Saving…" : "Save & start"}
              </Button>
            </div>
          </StepPanel>
        )}
      </div>
    </div>
  );
}
