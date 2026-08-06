import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { api, isCreditError } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import {
  Trash2, Sparkles, ChevronLeft, ChevronRight, Wand2, Loader2, Check, LayoutGrid,
} from "lucide-react";
import { PALETTES, blankSlide } from "../lib/creqTemplates";
import PremiumCarouselWizard from "../components/creq/PremiumCarouselWizard";
import FormatPicker, { FORMATS } from "../components/creq/FormatPicker";

const AUDIENCES = [
  { id: "founders", label: "Founders & CEOs", tone: "confident, punchy" },
  { id: "marketers", label: "Marketing leaders", tone: "editorial, sharp" },
  { id: "sales", label: "Sales & RevOps", tone: "practical, data-led" },
  { id: "product", label: "Product managers", tone: "curious, clear" },
  { id: "developers", label: "Developers & engineers", tone: "direct, no-fluff" },
  { id: "designers", label: "Designers & creatives", tone: "aesthetic, playful" },
  { id: "generic", label: "General audience", tone: "confident, punchy" },
];

const TOPIC_STARTERS = [
  "Why cold outreach fails in 2026 (and the fix)",
  "5 hiring signals that outperform intent data",
  "The one email framework that 3x'd our reply rate",
  "How I stopped writing AI-slop cold emails",
  "The anatomy of a scroll-stopping LinkedIn hook",
];

/** Create EQ landing — three doors (blank canvas, standard AI, Premium AI),
 * then every previously created deck inline below them, closest analog in
 * this codebase to how Claude Design Labs lays out its own project picker.
 * The old template-gallery filmstrip is gone entirely — no template ever
 * gets forwarded into an LLM prompt now (it never did; that filmstrip just
 * seeded a palette client-side), and removing it keeps this page to exactly
 * the three creation paths the product wants surfaced. */
export default function CreateEQProjects() {
  const nav = useNavigate();
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [wizard, setWizard] = useState(null); // null | { step }
  const [showPremiumWizard, setShowPremiumWizard] = useState(false);
  const [showBlankDialog, setShowBlankDialog] = useState(false);

  const load = () => api.get("/carousel").then((r) => setItems(r.data)).finally(() => setLoaded(true));
  useEffect(() => { load(); }, []);

  const del = async (id) => {
    if (!confirm("Delete this project? This can't be undone.")) return;
    try {
      await api.delete(`/carousel/${id}`);
      toast.success("Project deleted");
      load();
    } catch { toast.error("Could not delete project"); }
  };

  return (
    <div>
      <PageHeader title="Create EQ" subtitle="Design scroll-stopping carousels and decks." />

      <div className="animate-fade-in px-6 sm:px-8 space-y-8 max-w-5xl">
        <div className="grid sm:grid-cols-3 gap-4">
          <OptionCard
            icon={LayoutGrid}
            title="Blank canvas"
            description="Start empty, design freehand."
            testId="option-blank"
            onClick={() => setShowBlankDialog(true)}
          />
          <OptionCard
            icon={Wand2}
            title="Create by AI"
            description="Describe a topic — a full deck, drafted and templated."
            testId="option-standard"
            onClick={() => setWizard({ step: 1 })}
          />
          <OptionCard
            icon={Sparkles}
            title="Premium AI Carousel"
            description="Per-slide creative direction + your brand, or AI-designed. Extra credits."
            badge="LLM Design"
            accent
            testId="option-premium"
            onClick={() => setShowPremiumWizard(true)}
          />
        </div>

        <section>
          <div className="flex items-baseline justify-between mb-3">
            <div className="font-display font-semibold text-body">Your projects{items.length > 0 ? ` · ${items.length}` : ""}</div>
          </div>
          {!loaded ? (
            <div className="text-neutral-400 text-body">Loading…</div>
          ) : items.length === 0 ? (
            <div className="text-neutral-400 text-body border border-dashed border-line rounded-2xl p-8 text-center">
              No carousels yet — pick one of the three options above to start.
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {items.map((p) => {
                const pal = PALETTES.find((pp) => pp.id === p.palette_id) || PALETTES[0];
                return (
                  <div key={p.id} className="group relative rounded-2xl border border-line bg-white overflow-hidden hover:border-ink hover:shadow-card-hover transition-colors">
                    <Link to={`/app/create-eq/${p.id}`} data-testid={`carousel-open-${p.id}`} className="block">
                      <div className="p-4 flex items-center gap-2.5" style={{ background: pal.bg2 || pal.bg }}>
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: pal.accent }} />
                        <span className="text-[10px] font-mono uppercase tracking-widest truncate" style={{ color: pal.text, opacity: 0.7 }}>
                          {p.design_mode === "premium" ? "Premium AI" : "Standard"}
                        </span>
                      </div>
                      <div className="p-4">
                        <div className="text-body font-medium truncate">{p.topic}</div>
                        <div className="text-caption text-neutral-400 mt-0.5">
                          {p.updated_at ? formatDistanceToNow(new Date(p.updated_at), { addSuffix: true }) : "—"} · {p.slides?.length || 0} slides
                        </div>
                      </div>
                    </Link>
                    <button onClick={() => del(p.id)} data-testid={`carousel-delete-${p.id}`}
                      className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg bg-white/90 text-neutral-400 hover:text-danger"
                      title="Delete project">
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {wizard && (
        <NewCarouselWizard
          onClose={() => setWizard(null)}
          onCreated={(id) => nav(`/app/create-eq/${id}`)}
        />
      )}

      {showBlankDialog && (
        <BlankCanvasDialog
          onClose={() => setShowBlankDialog(false)}
          onCreated={(id) => { setShowBlankDialog(false); nav(`/app/create-eq/${id}`); }}
        />
      )}

      {showPremiumWizard && (
        <PremiumCarouselWizard
          onClose={() => setShowPremiumWizard(false)}
          onCreated={(id) => { setShowPremiumWizard(false); nav(`/app/create-eq/${id}`); }}
        />
      )}
    </div>
  );
}

function OptionCard({ icon: Icon, title, description, badge, accent, onClick, testId }) {
  return (
    <button onClick={onClick} data-testid={testId}
      className="text-left rounded-2xl border p-5 transition-colors hover:shadow-card-hover"
      style={{
        borderColor: accent ? "var(--color-primary)" : "var(--border-default, #E5E5E5)",
        background: accent ? "var(--bg-surface)" : "white",
      }}>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
        style={{ background: accent ? "var(--color-primary)" : "#F4F4F5", color: accent ? "#fff" : "#141414" }}>
        <Icon size={18} strokeWidth={1.75} />
      </div>
      <div className="flex items-center gap-1.5">
        <div className="font-display font-semibold text-body">{title}</div>
        {badge && (
          <span className="text-[9px] font-mono uppercase tracking-wide px-1.5 py-0.5 rounded-full"
            style={{ background: "var(--color-primary)", color: "#fff" }}>{badge}</span>
        )}
      </div>
      <div className="text-caption text-neutral-400 mt-1">{description}</div>
    </button>
  );
}

/** Blank canvas still asks for format up front — "all necessary information"
 * per option, not just the two AI-driven paths — since the canvas size is
 * now a real, load-bearing property of the project (see CreateEQEditor.jsx's
 * per-project CANVAS), not something to silently default and never revisit. */
function BlankCanvasDialog({ onClose, onCreated }) {
  const [format, setFormat] = useState({ platform: "linkedin", customW: 1080, customH: 1350 });
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/carousel/generate", {
        topic: "Untitled", platform: format.platform, slide_count: 1, tone: "neutral",
        ...(format.platform === "custom" ? { custom_w: format.customW, custom_h: format.customH } : {}),
      });
      await api.put(`/carousel/${data.id}`, {
        slides: [blankSlide()], palette_id: "midnight", topic: "Untitled",
      });
      onCreated(data.id);
    } catch { toast.error("Could not create"); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-ink/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg p-4 sm:p-6" onClick={(e) => e.stopPropagation()} data-testid="blank-canvas-dialog">
        <h2 className="font-display font-semibold text-2xl mb-1">Blank canvas</h2>
        <p className="text-body text-neutral-400 mb-4">Pick a size — everything else is a blank slide you design freehand.</p>
        <FormatPicker value={format} onChange={setFormat} />
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={create} disabled={busy} data-testid="blank-canvas-create" className="btn-primary disabled:opacity-60">
            {busy ? <><Loader2 size={14} className="animate-spin" /> Creating…</> : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* --------------------------- Standard AI wizard --------------------------- */

function NewCarouselWizard({ onClose, onCreated }) {
  const [step, setStep] = useState(1); // 1 topic, 2 audience, 3 format+palette, 4 review
  const [form, setForm] = useState({
    topic: "",
    audience: "generic",
    format: { platform: "linkedin", customW: 1080, customH: 1350 },
    palette_id: "midnight",
    slide_count: 6,
    tone: "confident, punchy",
  });
  const [busy, setBusy] = useState(false);

  const audience = AUDIENCES.find((a) => a.id === form.audience) || AUDIENCES[0];
  const palette = PALETTES.find((p) => p.id === form.palette_id) || PALETTES[0];
  const formatLabel = form.format.platform === "custom"
    ? `Custom ${form.format.customW}×${form.format.customH}`
    : FORMATS.find((f) => f.id === form.format.platform)?.label || form.format.platform;

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
        platform: form.format.platform,
        slide_count: form.slide_count,
        tone: audience.tone,
        ...(form.format.platform === "custom" ? { custom_w: form.format.customW, custom_h: form.format.customH } : {}),
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
      if (!isCreditError(err)) toast.error("Generation failed — try again");
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-ink/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()} data-testid="carousel-wizard">
        {/* Header + step indicator */}
        <div className="px-4 sm:px-8 pt-6 pb-4">
          <div className="flex items-center gap-2 mb-3">
            <Wand2 size={16} className="text-ink" />
            <div className="text-[10px] font-mono uppercase tracking-widest text-neutral-400">Create with AI · Step {step} of 4</div>
            <button onClick={onClose} className="ml-auto text-neutral-400 hover:text-ink text-body">Cancel</button>
          </div>
          <div className="flex gap-1">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className={`h-1 flex-1 rounded-full ${n <= step ? "bg-ink" : "bg-neutral-200"}`} />
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-4 sm:py-6">
          {step === 1 && (
            <div className="space-y-4" data-testid="wizard-step-1">
              <h2 className="font-display font-bold text-2xl sm:text-3xl leading-tight">What&apos;s your carousel about?</h2>
              <p className="text-body text-neutral-400">One sentence is enough — we&apos;ll expand it into a full 6-slide deck.</p>
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
                <div className="text-[10px] font-mono uppercase tracking-widest text-neutral-400 mb-2">Or try a starter</div>
                <div className="flex flex-wrap gap-1.5">
                  {TOPIC_STARTERS.map((t, i) => (
                    <button key={i} onClick={() => setForm({ ...form, topic: t })} data-testid={`wizard-starter-${i}`}
                      className="text-caption px-3 py-1.5 rounded-xl border border-line hover:border-ink hover:bg-ash text-neutral-700">
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4" data-testid="wizard-step-2">
              <h2 className="font-display font-bold text-2xl sm:text-3xl leading-tight">Who&apos;s this for?</h2>
              <p className="text-body text-neutral-400">We&apos;ll tune the tone and vocabulary to fit.</p>
              <div className="grid grid-cols-2 gap-2">
                {AUDIENCES.map((a) => (
                  <button key={a.id} onClick={() => setForm({ ...form, audience: a.id, tone: a.tone })}
                    data-testid={`wizard-audience-${a.id}`}
                    className={`text-left p-4 rounded-2xl border transition-colors ${form.audience === a.id ? "border-ink bg-ash" : "border-line hover:border-neutral-400"}`}>
                    <div className="text-body font-medium">{a.label}</div>
                    <div className="text-[11px] text-neutral-400 mt-0.5">Tone: {a.tone}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6" data-testid="wizard-step-3">
              <div>
                <h2 className="font-display font-bold text-2xl sm:text-3xl leading-tight">Pick a format &amp; theme</h2>
                <p className="text-body text-neutral-400 mt-1">These are just starting points — everything is editable after.</p>
              </div>

              <FormatPicker value={form.format} onChange={(format) => setForm({ ...form, format })} />

              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-neutral-400 mb-2">Theme</div>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {PALETTES.map((p) => (
                    <button key={p.id} onClick={() => setForm({ ...form, palette_id: p.id })}
                      data-testid={`wizard-palette-${p.id}`}
                      className={`text-left p-2 rounded-2xl border ${form.palette_id === p.id ? "border-ink ring-2 ring-ink/20" : "border-line hover:border-neutral-400"}`}>
                      <div className="flex gap-0.5">
                        {[p.bg, p.bg2, p.accent, p.text].map((c, i) => <span key={`${c}-${i}`} className="w-3 h-3 rounded" style={{ background: c }} />)}
                      </div>
                      <div className="text-[10px] mt-1 truncate">{p.name}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-neutral-400 mb-2">Slide count</div>
                <div className="flex flex-wrap gap-1.5">
                  {[3, 5, 6, 7, 8, 10].map((n) => (
                    <button key={n} onClick={() => setForm({ ...form, slide_count: n })}
                      data-testid={`wizard-count-${n}`}
                      className={`px-4 py-2 rounded-xl text-body font-mono ${form.slide_count === n ? "bg-ink text-white" : "bg-neutral-100 hover:bg-neutral-200"}`}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-5" data-testid="wizard-step-4">
              <h2 className="font-display font-bold text-2xl sm:text-3xl leading-tight">Ready to draft?</h2>
              <p className="text-body text-neutral-400">Review your choices — you can adjust anything after generation.</p>

              <div className="rounded-2xl border border-line overflow-hidden">
                <div className="p-6 flex flex-col justify-between max-h-72"
                  style={{ background: palette.bg, color: palette.text, aspectRatio: `${form.format.platform === "custom" ? form.format.customW : (FORMATS.find(f => f.id === form.format.platform)?.w || 1080)} / ${form.format.platform === "custom" ? form.format.customH : (FORMATS.find(f => f.id === form.format.platform)?.h || 1350)}` }}>
                  <div className="text-[10px] font-mono uppercase tracking-widest opacity-70">{formatLabel}</div>
                  <div className="font-semibold text-2xl leading-tight" style={{ color: palette.accent }}>
                    {form.topic || "Your topic here"}
                  </div>
                  <div className="text-caption opacity-70">Theme: {palette.name} · {form.slide_count} slides</div>
                </div>
              </div>

              <ul className="space-y-2 text-body">
                <li className="flex items-start gap-2"><Check size={14} className="text-ink mt-0.5" /> <span><span className="font-medium">Topic:</span> {form.topic}</span></li>
                <li className="flex items-start gap-2"><Check size={14} className="text-ink mt-0.5" /> <span><span className="font-medium">Audience:</span> {audience.label} · {audience.tone}</span></li>
                <li className="flex items-start gap-2"><Check size={14} className="text-ink mt-0.5" /> <span><span className="font-medium">Format:</span> {formatLabel}</span></li>
                <li className="flex items-start gap-2"><Check size={14} className="text-ink mt-0.5" /> <span><span className="font-medium">Theme:</span> {palette.name} · {form.slide_count} slides</span></li>
              </ul>
            </div>
          )}
        </div>

        {/* Footer nav */}
        <div className="px-4 sm:px-8 py-4 border-t border-line flex items-center justify-between">
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
