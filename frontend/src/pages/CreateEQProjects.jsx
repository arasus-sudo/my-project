import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import {
  Plus, Trash2, ImageIcon, Sparkles, ChevronLeft, ChevronRight, Wand2, Loader2, Check,
} from "lucide-react";
import { TEMPLATES, PALETTES, slideFromTemplate, blankSlide } from "../lib/creqTemplates";

const AUDIENCES = [
  { id: "founders", label: "Founders & CEOs", tone: "confident, punchy" },
  { id: "marketers", label: "Marketing leaders", tone: "editorial, sharp" },
  { id: "sales", label: "Sales & RevOps", tone: "practical, data-led" },
  { id: "product", label: "Product managers", tone: "curious, clear" },
  { id: "developers", label: "Developers & engineers", tone: "direct, no-fluff" },
  { id: "designers", label: "Designers & creatives", tone: "aesthetic, playful" },
  { id: "generic", label: "General audience", tone: "confident, punchy" },
];

const PLATFORMS = [
  { id: "linkedin", label: "LinkedIn Deck", ratio: "4:5", w: 1080, h: 1350 },
  { id: "square", label: "Square Social", ratio: "1:1", w: 1080, h: 1080 },
  { id: "twitter", label: "Twitter / X Cheat Sheet", ratio: "4:5", w: 1080, h: 1350 },
];

const TOPIC_STARTERS = [
  "Why cold outreach fails in 2026 (and the fix)",
  "5 hiring signals that outperform intent data",
  "The one email framework that 3x'd our reply rate",
  "How I stopped writing AI-slop cold emails",
  "The anatomy of a scroll-stopping LinkedIn hook",
];

export default function CreateEQProjects() {
  const nav = useNavigate();
  const [items, setItems] = useState([]);
  const [wizard, setWizard] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () => api.get("/carousel").then((r) => setItems(r.data));
  useEffect(() => { load(); }, []);

  const startFromTemplate = async (tpl) => {
    setBusy(true);
    try {
      const { data } = await api.post("/carousel/generate", {
        topic: tpl.name, platform: "linkedin", slide_count: 1, tone: "editorial",
      });
      const slide = slideFromTemplate(tpl);
      await api.put(`/carousel/${data.id}`, {
        slides: [slide], palette_id: tpl.palette, platform: "linkedin", topic: tpl.name,
      });
      nav(`/app/create-eq/${data.id}`);
    } catch { toast.error("Could not start template"); }
    finally { setBusy(false); }
  };

  const startBlank = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/carousel/generate", {
        topic: "Untitled", platform: "linkedin", slide_count: 1, tone: "neutral",
      });
      await api.put(`/carousel/${data.id}`, {
        slides: [blankSlide()], palette_id: "midnight", platform: "linkedin", topic: "Untitled",
      });
      nav(`/app/create-eq/${data.id}`);
    } catch { toast.error("Could not create"); }
    finally { setBusy(false); }
  };

  const del = async (id) => {
    if (!confirm("Delete carousel?")) return;
    await api.delete(`/carousel/${id}`); load();
  };

  return (
    <div>
      <PageHeader
        title="Create EQ · Projects"
        subtitle="AI-drafted carousels or Canva-style editing from a template."
        badge="Beta"
        right={
          <div className="flex gap-2">
            <button onClick={startBlank} disabled={busy} data-testid="start-blank-btn" className="btn-secondary">Blank</button>
            <button onClick={() => setWizard(true)} data-testid="new-carousel-btn" className="btn-primary">
              <Wand2 size={14} /> Create with AI
            </button>
          </div>
        }
      />

      <div className="p-6 space-y-8">
        {/* Hero — Gamma-style CTA */}
        {items.length === 0 && (
          <section className="rounded-2xl border border-line bg-gradient-to-br from-neutral-50 to-white p-8 text-center">
            <div className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 mb-2">Get started</div>
            <h2 className="font-display font-bold text-3xl mb-2">Describe your idea. We&apos;ll design the carousel.</h2>
            <p className="text-sm text-neutral-600 max-w-lg mx-auto mb-4">
              Type a topic in one sentence, pick your audience &amp; theme, and we&apos;ll draft a scroll-stopping deck in under 30 seconds.
            </p>
            <button onClick={() => setWizard(true)} data-testid="hero-start" className="btn-primary">
              <Wand2 size={14} /> Start with AI
            </button>
          </section>
        )}

        {/* Templates gallery */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="ui-label">Start from a template</div>
              <div className="text-xs text-neutral-500 mt-0.5">Pre-designed slides — fully editable once opened.</div>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {TEMPLATES.map((t) => {
              const pal = PALETTES.find((p) => p.id === t.palette) || PALETTES[0];
              return (
                <button key={t.id} onClick={() => startFromTemplate(t)} disabled={busy} data-testid={`start-tpl-${t.id}`}
                  className="text-left group disabled:opacity-60">
                  <div className="aspect-[4/5] rounded-2xl overflow-hidden border border-line group-hover:border-ink transition-colors">
                    <div className="w-full h-full p-4 flex flex-col justify-between"
                      style={{ background: pal.bg, color: pal.text, fontFamily: "Inter" }}>
                      <div className="text-[9px] font-mono uppercase tracking-widest opacity-60">{t.tag}</div>
                      <div className="font-bold text-lg leading-tight" style={{ color: pal.accent }}>{t.name}</div>
                      <div className="flex gap-1">
                        {[pal.bg2, pal.accent, pal.text].map((c, i) => <span key={`${c}-${i}`} className="w-3 h-3 rounded-full" style={{ background: c }} />)}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 text-xs font-medium">{t.name}</div>
                  <div className="text-[10px] text-neutral-500">{t.tag}</div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Your projects */}
        <section>
          <div className="ui-label mb-3">Your projects</div>
          {items.length === 0 && <div className="text-neutral-500 text-sm">No carousels yet. Pick a template above or click Create with AI.</div>}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {items.map((p) => {
              const pal = PALETTES.find((pp) => pp.id === p.palette_id) || PALETTES[0];
              return (
                <div key={p.id} className="bg-white border border-line rounded-2xl overflow-hidden">
                  <Link to={`/app/create-eq/${p.id}`} data-testid={`carousel-open-${p.id}`}
                    className="block aspect-[4/5] p-6 flex flex-col justify-between"
                    style={{ background: pal.bg, color: pal.text }}>
                    <div className="text-[10px] opacity-70 font-mono uppercase tracking-wider">{p.platform}</div>
                    <div className="font-bold text-xl leading-tight" style={{ color: pal.accent }}>{p.topic}</div>
                    <div className="text-xs opacity-70 font-mono">{p.slides?.length || 0} slides</div>
                  </Link>
                  <div className="p-3 flex items-center justify-between border-t border-line">
                    <div className="text-xs text-neutral-500 truncate">{p.topic}</div>
                    <button onClick={() => del(p.id)} data-testid={`carousel-delete-${p.id}`} className="text-neutral-400 hover:text-red-600"><Trash2 size={12} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {wizard && (
        <NewCarouselWizard
          onClose={() => setWizard(false)}
          onCreated={(id) => nav(`/app/create-eq/${id}`)}
        />
      )}
    </div>
  );
}

/* --------------------------- Gamma-style wizard --------------------------- */

function NewCarouselWizard({ onClose, onCreated }) {
  const [step, setStep] = useState(1); // 1 = topic, 2 = audience, 3 = platform+palette, 4 = review
  const [form, setForm] = useState({
    topic: "",
    audience: "generic",
    platform: "linkedin",
    palette_id: "midnight",
    slide_count: 6,
    tone: "confident, punchy",
  });
  const [busy, setBusy] = useState(false);

  const audience = AUDIENCES.find((a) => a.id === form.audience) || AUDIENCES[0];
  const platform = PLATFORMS.find((p) => p.id === form.platform) || PLATFORMS[0];
  const palette = PALETTES.find((p) => p.id === form.palette_id) || PALETTES[0];

  const canNext = () => {
    if (step === 1) return form.topic.trim().length > 3;
    return true;
  };

  const goNext = () => setStep((s) => Math.min(4, s + 1));
  const goBack = () => setStep((s) => Math.max(1, s - 1));

  const generate = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/carousel/generate", {
        topic: form.topic.trim(),
        platform: form.platform,
        slide_count: form.slide_count,
        tone: audience.tone,
      });
      // Apply chosen palette immediately.
      if (form.palette_id && form.palette_id !== "midnight") {
        try {
          await api.put(`/carousel/${data.id}`, { palette_id: form.palette_id });
        } catch { /* not fatal */ }
      }
      toast.success("Draft ready — customise anything you want");
      onCreated(data.id);
    } catch (err) {
      toast.error("Generation failed — try again");
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-ink/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()} data-testid="carousel-wizard">
        {/* Header + step indicator */}
        <div className="px-8 pt-6 pb-4">
          <div className="flex items-center gap-2 mb-3">
            <Wand2 size={16} className="text-ink" />
            <div className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">Create with AI · Step {step} of 4</div>
            <button onClick={onClose} className="ml-auto text-neutral-400 hover:text-ink text-sm">Cancel</button>
          </div>
          <div className="flex gap-1">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className={`h-1 flex-1 rounded-full ${n <= step ? "bg-ink" : "bg-neutral-200"}`} />
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-6">
          {step === 1 && (
            <div className="space-y-4" data-testid="wizard-step-1">
              <h2 className="font-display font-bold text-3xl leading-tight">What&apos;s your carousel about?</h2>
              <p className="text-sm text-neutral-600">One sentence is enough — we&apos;ll expand it into a full 6-slide deck.</p>
              <textarea
                autoFocus
                value={form.topic}
                onChange={(e) => setForm({ ...form, topic: e.target.value })}
                data-testid="wizard-topic"
                rows={3}
                placeholder='e.g. "Why cold outreach fails in 2026 and how to fix it in one afternoon"'
                className="w-full border border-line rounded-lg px-4 py-3 text-base focus:outline-none focus:border-ink"
              />
              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 mb-2">Or try a starter</div>
                <div className="flex flex-wrap gap-1.5">
                  {TOPIC_STARTERS.map((t, i) => (
                    <button key={i} onClick={() => setForm({ ...form, topic: t })} data-testid={`wizard-starter-${i}`}
                      className="text-xs px-3 py-1.5 rounded-full border border-line hover:border-ink hover:bg-neutral-50 text-neutral-700">
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4" data-testid="wizard-step-2">
              <h2 className="font-display font-bold text-3xl leading-tight">Who&apos;s this for?</h2>
              <p className="text-sm text-neutral-600">We&apos;ll tune the tone and vocabulary to fit.</p>
              <div className="grid grid-cols-2 gap-2">
                {AUDIENCES.map((a) => (
                  <button key={a.id} onClick={() => setForm({ ...form, audience: a.id, tone: a.tone })}
                    data-testid={`wizard-audience-${a.id}`}
                    className={`text-left p-4 rounded-lg border transition-colors ${form.audience === a.id ? "border-ink bg-neutral-50" : "border-line hover:border-neutral-400"}`}>
                    <div className="text-sm font-medium">{a.label}</div>
                    <div className="text-[11px] text-neutral-500 mt-0.5">Tone: {a.tone}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6" data-testid="wizard-step-3">
              <div>
                <h2 className="font-display font-bold text-3xl leading-tight">Pick a platform &amp; theme</h2>
                <p className="text-sm text-neutral-600 mt-1">These are just starting points — everything is editable after.</p>
              </div>

              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 mb-2">Platform</div>
                <div className="grid grid-cols-3 gap-2">
                  {PLATFORMS.map((p) => (
                    <button key={p.id} onClick={() => setForm({ ...form, platform: p.id })}
                      data-testid={`wizard-platform-${p.id}`}
                      className={`text-left p-3 rounded-lg border ${form.platform === p.id ? "border-ink bg-neutral-50" : "border-line hover:border-neutral-400"}`}>
                      <div className="text-xs font-medium">{p.label}</div>
                      <div className="text-[10px] text-neutral-500 mt-0.5 font-mono">{p.ratio} · {p.w}×{p.h}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 mb-2">Theme</div>
                <div className="grid grid-cols-5 gap-2">
                  {PALETTES.map((p) => (
                    <button key={p.id} onClick={() => setForm({ ...form, palette_id: p.id })}
                      data-testid={`wizard-palette-${p.id}`}
                      className={`text-left p-2 rounded-lg border ${form.palette_id === p.id ? "border-ink ring-2 ring-ink/20" : "border-line hover:border-neutral-400"}`}>
                      <div className="flex gap-0.5">
                        {[p.bg, p.bg2, p.accent, p.text].map((c, i) => <span key={`${c}-${i}`} className="w-3 h-3 rounded" style={{ background: c }} />)}
                      </div>
                      <div className="text-[10px] mt-1 truncate">{p.name}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 mb-2">Slide count</div>
                <div className="flex gap-1.5">
                  {[3, 5, 6, 7, 8, 10].map((n) => (
                    <button key={n} onClick={() => setForm({ ...form, slide_count: n })}
                      data-testid={`wizard-count-${n}`}
                      className={`px-4 py-2 rounded-full text-sm font-mono ${form.slide_count === n ? "bg-ink text-white" : "bg-neutral-100 hover:bg-neutral-200"}`}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-5" data-testid="wizard-step-4">
              <h2 className="font-display font-bold text-3xl leading-tight">Ready to draft?</h2>
              <p className="text-sm text-neutral-600">Review your choices — you can adjust anything after generation.</p>

              <div className="rounded-xl border border-line overflow-hidden">
                <div className="aspect-[4/5] p-6 flex flex-col justify-between max-h-72"
                  style={{ background: palette.bg, color: palette.text }}>
                  <div className="text-[10px] font-mono uppercase tracking-widest opacity-70">{platform.label}</div>
                  <div className="font-bold text-2xl leading-tight" style={{ color: palette.accent }}>
                    {form.topic || "Your topic here"}
                  </div>
                  <div className="text-xs opacity-70">Theme: {palette.name} · {form.slide_count} slides</div>
                </div>
              </div>

              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2"><Check size={14} className="text-ink mt-0.5" /> <span><span className="font-medium">Topic:</span> {form.topic}</span></li>
                <li className="flex items-start gap-2"><Check size={14} className="text-ink mt-0.5" /> <span><span className="font-medium">Audience:</span> {audience.label} · {audience.tone}</span></li>
                <li className="flex items-start gap-2"><Check size={14} className="text-ink mt-0.5" /> <span><span className="font-medium">Platform:</span> {platform.label} ({platform.ratio})</span></li>
                <li className="flex items-start gap-2"><Check size={14} className="text-ink mt-0.5" /> <span><span className="font-medium">Theme:</span> {palette.name} · {form.slide_count} slides</span></li>
              </ul>
            </div>
          )}
        </div>

        {/* Footer nav */}
        <div className="px-8 py-4 border-t border-line flex items-center justify-between">
          <button onClick={goBack} disabled={step === 1} data-testid="wizard-back"
            className="btn-ghost disabled:opacity-40">
            <ChevronLeft size={14} /> Back
          </button>
          {step < 4 ? (
            <button onClick={goNext} disabled={!canNext()} data-testid="wizard-next"
              className="btn-primary disabled:opacity-40">
              Next <ChevronRight size={14} />
            </button>
          ) : (
            <button onClick={generate} disabled={busy} data-testid="wizard-generate"
              className="btn-primary disabled:opacity-60">
              {busy ? <><Loader2 size={14} className="animate-spin" /> Drafting…</> : <><Sparkles size={14} /> Generate carousel</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
