import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { toast } from "sonner";
import { ArrowRight, Sparkles, Check, Loader2, X } from "lucide-react";

const PERSONA_TYPES = [
  { v: "individual", label: "Individual" },
  { v: "influencer", label: "Influencer / creator" },
  { v: "startup", label: "Startup" },
  { v: "solo_company", label: "Solo-founder company" },
  { v: "enterprise", label: "Enterprise" },
];
const PLATFORMS = ["linkedin", "instagram", "youtube"];

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
    <div className="min-h-screen bg-bone p-6 sm:p-8 animate-fade-in">
      <div className="max-w-3xl mx-auto pt-12 pb-16">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-8 h-8 bg-accent text-white flex items-center justify-center rounded-full font-display font-bold text-body">S</div>
          <div className="font-display font-semibold">Social EQ <span className="text-ink-muted">/</span> <span className="text-ink-muted">Set up your brand</span></div>
          <button onClick={skip} data-testid="social-setup-skip" className="ml-auto text-caption text-ink-muted hover:text-ink">Skip for now</button>
        </div>

        <div className="flex items-center gap-2 mb-10">
          {[1, 2, 3].map((n) => (
            <div key={n} className={`h-1.5 flex-1 rounded-full ${step >= n ? "bg-accent" : "bg-neutral-200"}`} />
          ))}
        </div>

        {step === 1 && (
          <div className="shadow-card bg-white border border-line rounded-3xl p-6 sm:p-10 animate-fade-in">
            <div className="ui-label mb-3"><Sparkles size={12} className="inline mr-1" /> Step 1 of 3</div>
            <h1 className="text-page-title font-display">Tell Social EQ who you are.</h1>
            <p className="mt-3 text-body text-ink-tertiary">
              This informs every post it drafts, checks, and schedules for you — the same positioning
              across every platform.
            </p>
            <div className="mt-8">
              <label className="form-label">What best describes you?</label>
              <div className="flex flex-wrap gap-2 mt-2">
                {PERSONA_TYPES.map((p) => (
                  <button key={p.v} onClick={() => setPersonaType(p.v)} data-testid={`persona-${p.v}`}
                    className={`pill ${personaType === p.v ? "bg-ink text-white" : ""}`}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-6">
              <label className="form-label">Website or profile URL <span className="text-ink-muted font-normal">(optional)</span></label>
              <input value={url} onChange={(e) => setUrl(e.target.value)} data-testid="social-setup-url"
                placeholder="https://yoursite.com" className="mt-2 w-full input-premium" />
            </div>
            <div className="mt-6">
              <label className="form-label">Or describe what you do <span className="text-ink-muted font-normal">(if no URL)</span></label>
              <textarea value={inputText} onChange={(e) => setInputText(e.target.value)} rows={3}
                data-testid="social-setup-text"
                placeholder="e.g. I'm a fitness coach helping busy professionals build sustainable habits."
                className="mt-2 w-full input-premium" />
            </div>
            <button onClick={analyze} disabled={busy} data-testid="social-setup-analyze"
              className="btn-primary mt-6 disabled:opacity-60">
              {busy ? <><Loader2 size={14} className="animate-spin" /> Analyzing…</> : <>Continue <ArrowRight size={14} /></>}
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="shadow-card bg-white border border-line rounded-3xl p-6 sm:p-10 animate-fade-in">
            <div className="ui-label mb-3"><Check size={12} className="inline mr-1" /> Step 2 of 3</div>
            <h1 className="text-page-title font-display">Here's your starting positioning.</h1>
            <p className="mt-2 text-body text-ink-tertiary">Edit anything — this is a first draft, not final.</p>

            <div className="mt-6">
              <label className="form-label">Tone</label>
              <select value={tone} onChange={(e) => setTone(e.target.value)} data-testid="social-setup-tone"
                className="mt-2 w-full input-premium capitalize">
                {["warm", "professional", "direct", "playful", "formal"].map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="mt-5">
              <label className="form-label">What you offer</label>
              <textarea value={offer} onChange={(e) => setOffer(e.target.value)} rows={2}
                data-testid="social-setup-offer" className="mt-2 w-full input-premium" />
            </div>
            <div className="mt-5">
              <label className="form-label">Who you're speaking to</label>
              <textarea value={icp} onChange={(e) => setIcp(e.target.value)} rows={2}
                data-testid="social-setup-icp" className="mt-2 w-full input-premium" />
            </div>
            <div className="mt-5">
              <label className="form-label">Content pillars — recurring topics</label>
              <div className="flex gap-2 mt-2">
                <input value={pillarInput} onChange={(e) => setPillarInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPillar(); } }}
                  data-testid="social-setup-pillar-input" placeholder="press Enter to add"
                  className="input-premium flex-1" />
                <button onClick={addPillar} className="btn-secondary shrink-0">Add</button>
              </div>
              {pillars.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {pillars.map((p) => (
                    <span key={p} className="pill flex items-center gap-1">
                      {p}<button onClick={() => removePillar(p)} className="hover:text-danger"><X size={12} /></button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-6 flex gap-2">
              <button onClick={() => setStep(1)} className="btn-secondary">Back</button>
              <button onClick={() => setStep(3)} disabled={pillars.length === 0} data-testid="social-setup-next"
                className="btn-primary disabled:opacity-60">Continue <ArrowRight size={14} /></button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="shadow-card bg-white border border-line rounded-3xl p-6 sm:p-10 animate-fade-in">
            <div className="ui-label mb-3"><Check size={12} className="inline mr-1" /> Step 3 of 3</div>
            <h1 className="text-page-title font-display">Brand look + posting rhythm.</h1>

            <div className="mt-6">
              <label className="form-label">Brand kit <span className="text-ink-muted font-normal">(colors/logo used in generated images)</span></label>
              {brandKits.length === 0 ? (
                <p className="mt-2 text-caption text-ink-muted">
                  No brand kits yet — <Link to="/app/create-eq" className="text-accent hover:underline">create one in Create EQ</Link>, or skip this for now.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2 mt-2">
                  {brandKits.map((k) => (
                    <button key={k.id} onClick={() => setBrandKitId(k.id)} data-testid={`brandkit-${k.id}`}
                      className={`pill ${brandKitId === k.id ? "bg-ink text-white" : ""}`}>
                      {k.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-6">
              <label className="form-label">Posting days per week</label>
              <input type="number" min={1} max={7} value={daysPerWeek}
                onChange={(e) => setDaysPerWeek(Number(e.target.value) || 1)}
                data-testid="social-setup-days" className="mt-2 w-24 input-premium" />
            </div>
            <div className="mt-5">
              <label className="form-label">Platforms</label>
              <div className="flex flex-wrap gap-2 mt-2">
                {PLATFORMS.map((p) => (
                  <button key={p} onClick={() => togglePlatform(p)} data-testid={`social-setup-platform-${p}`}
                    className={`pill capitalize ${platforms.includes(p) ? "bg-ink text-white" : ""}`}>{p}</button>
                ))}
              </div>
            </div>

            <div className="mt-6 flex gap-2">
              <button onClick={() => setStep(2)} className="btn-secondary">Back</button>
              <button onClick={finish} disabled={busy || platforms.length === 0} data-testid="social-setup-finish"
                className="btn-primary disabled:opacity-60">
                {busy ? "Saving…" : "Save & start"} <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
