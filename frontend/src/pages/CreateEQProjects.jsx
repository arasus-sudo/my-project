import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import {
  Plus, Trash2, ImageIcon, Sparkles, ChevronLeft, ChevronRight, Wand2, Loader2, Check, ArrowRight, History, X,
} from "lucide-react";
import { TEMPLATES, PALETTES, blankSlide } from "../lib/creqTemplates";

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
  const [loaded, setLoaded] = useState(false);
  const [wizard, setWizard] = useState(null); // null | { topic, step }
  const [busy, setBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [pendingTemplate, setPendingTemplate] = useState(null);
  const [heroTopic, setHeroTopic] = useState("");

  const load = () => api.get("/carousel").then((r) => setItems(r.data)).finally(() => setLoaded(true));
  useEffect(() => { load(); }, []);

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

  // Single AI entry point: whatever's typed in the hero is carried straight
  // into the wizard. A real sentence skips the topic step; an empty box opens
  // the wizard at step 1 so it still works as a plain "Create with AI" button.
  const launchWizard = () => {
    const topic = heroTopic.trim();
    setWizard({ topic, step: topic.length > 3 ? 2 : 1 });
  };

  const del = async (id) => {
    if (!confirm("Delete carousel?")) return;
    await api.delete(`/carousel/${id}`); load();
  };

  return (
    <div>
      <PageHeader
        title="Create EQ"
        subtitle="Design scroll-stopping carousels and decks."
        right={
          <button onClick={() => setShowHistory(true)} data-testid="history-open-btn" className="btn-secondary">
            <History size={14} /> Your projects{items.length > 0 ? ` · ${items.length}` : ""}
          </button>
        }
      />

      <div className="p-6 space-y-10 max-w-5xl">
        {/* Hero — the ONE AI entry point: type an idea, hit generate. */}
        <section
          className="relative overflow-hidden rounded-3xl border border-line p-8 sm:p-10"
          style={{ background: "radial-gradient(120% 140% at 0% 0%, rgba(232,93,58,0.10), transparent 55%), linear-gradient(180deg, #fafafa, #ffffff)" }}
        >
          <div className="relative">
            <div className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-sanguine mb-3">
              <Sparkles size={12} /> Create with AI
            </div>
            <h2 className="font-display font-bold text-3xl sm:text-4xl leading-[1.05] tracking-tight max-w-xl">
              Describe your idea.<br />We&apos;ll design the deck.
            </h2>
            <p className="text-sm text-neutral-500 mt-3 max-w-md">
              One sentence is enough. Pick an audience and theme next — a finished, editable carousel in under a minute.
            </p>

            <div className="mt-6 flex flex-col sm:flex-row gap-2 max-w-2xl">
              <textarea
                value={heroTopic}
                onChange={(e) => setHeroTopic(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); launchWizard(); } }}
                data-testid="hero-topic-input"
                rows={2}
                placeholder='e.g. "Why cold outreach fails in 2026 — and the 3-step fix"'
                className="flex-1 resize-none border border-line rounded-2xl px-4 py-3 text-base bg-white focus:outline-none focus:border-ink shadow-sm"
              />
              <button onClick={launchWizard} data-testid="hero-generate" className="btn-primary shrink-0 self-stretch sm:self-start sm:h-[52px] px-5">
                <Wand2 size={16} /> Generate
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 mt-4">
              <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-400 mr-1">Try</span>
              {TOPIC_STARTERS.slice(0, 4).map((t, i) => (
                <button key={i} onClick={() => setHeroTopic(t)} data-testid={`hero-starter-${i}`}
                  className="text-xs px-3 py-1.5 rounded-full border border-line bg-white/70 hover:border-ink hover:bg-white text-neutral-600 transition-colors">
                  {t}
                </button>
              ))}
            </div>

            <div className="text-xs text-neutral-400 mt-5">
              or <button onClick={startBlank} disabled={busy} data-testid="start-blank-btn" className="underline underline-offset-2 hover:text-ink disabled:opacity-50">start from a blank canvas</button>
            </div>
          </div>
        </section>

        {/* Templates gallery */}
        <section>
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <div className="font-display font-bold text-lg">Start from a template</div>
              <div className="text-xs text-neutral-500 mt-0.5">Pre-designed layouts — add your topic, edit anything.</div>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {TEMPLATES.map((t) => {
              const pal = PALETTES.find((p) => p.id === t.palette) || PALETTES[0];
              return (
                <button key={t.id} onClick={() => setPendingTemplate(t)} data-testid={`start-tpl-${t.id}`}
                  className="group rounded-2xl overflow-hidden border border-line hover:border-ink hover:shadow-lg hover:-translate-y-0.5 transition-all text-left">
                  <div className="aspect-[4/5] p-4 flex flex-col justify-between relative"
                    style={{ background: pal.bg, color: pal.text, fontFamily: "Inter" }}>
                    <div className="text-[9px] font-mono uppercase tracking-widest opacity-60">{t.tag}</div>
                    <div className="font-bold text-base leading-tight" style={{ color: pal.accent }}>{t.name}</div>
                    <div className="absolute inset-x-0 bottom-0 h-10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-[11px] font-medium"
                      style={{ background: `linear-gradient(transparent, ${pal.bg})`, color: pal.text }}>
                      Use this template →
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      {wizard && (
        <NewCarouselWizard
          initialTopic={wizard.topic}
          initialStep={wizard.step}
          onClose={() => setWizard(null)}
          onCreated={(id) => nav(`/app/create-eq/${id}`)}
        />
      )}

      {showHistory && (
        <HistoryDrawer items={items} onClose={() => setShowHistory(false)} onDelete={del} />
      )}

      {pendingTemplate && (
        <TemplateStartDialog
          template={pendingTemplate}
          onClose={() => setPendingTemplate(null)}
          onCreated={(id) => { setPendingTemplate(null); nav(`/app/create-eq/${id}`); }}
        />
      )}
    </div>
  );
}

/** Asks for a topic before creating a carousel from a template — the
 * template's own hand-authored slide is a fixed layout with placeholder
 * text; instead of using that verbatim (or silently discarding a wasted AI
 * call the way this used to work), we generate a real multi-slide deck for
 * the given topic and carry over just the template's palette. */
function TemplateStartDialog({ template, onClose, onCreated }) {
  const [topic, setTopic] = useState("");
  const [slideCount, setSlideCount] = useState(6);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!topic.trim()) { toast.error("Describe what this deck is about"); return; }
    setBusy(true);
    try {
      const { data } = await api.post("/carousel/generate", {
        topic: topic.trim(), platform: "linkedin", slide_count: slideCount, tone: "confident, punchy",
      });
      if (template.palette) {
        try { await api.put(`/carousel/${data.id}`, { palette_id: template.palette }); } catch { /* not fatal */ }
      }
      toast.success("Draft ready — customise anything you want");
      onCreated(data.id);
    } catch { toast.error("Generation failed — try again"); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-ink/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()} data-testid="template-start-dialog">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-5 h-5 rounded-md shrink-0" style={{ background: template.thumb_bg }} />
          <div className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">{template.tag} · {template.name}</div>
        </div>
        <h2 className="font-display font-bold text-2xl mt-2 mb-1">What&apos;s this deck about?</h2>
        <p className="text-sm text-neutral-600 mb-4">We&apos;ll draft real content in this template&apos;s theme — one sentence is enough.</p>
        <textarea
          autoFocus
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          rows={3}
          placeholder='e.g. "Why cold outreach fails in 2026 and how to fix it"'
          data-testid="template-topic-input"
          className="w-full border border-line rounded-lg px-4 py-3 text-base focus:outline-none focus:border-ink"
        />
        <div className="flex items-center gap-2 mt-3">
          <span className="text-xs text-neutral-500">Slides:</span>
          {[3, 5, 6, 8].map((n) => (
            <button key={n} onClick={() => setSlideCount(n)} data-testid={`template-count-${n}`}
              className={`px-3 py-1 rounded-full text-xs font-mono ${slideCount === n ? "bg-ink text-white" : "bg-neutral-100 hover:bg-neutral-200"}`}>
              {n}
            </button>
          ))}
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={submit} disabled={busy} data-testid="template-start-generate" className="btn-primary disabled:opacity-60">
            {busy ? <><Loader2 size={14} className="animate-spin" /> Drafting…</> : <><Wand2 size={14} /> Generate carousel</>}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Collapsible side panel holding "continue where you left off" + the full
 * projects list, so the main page stays focused on the header and templates
 * instead of a wall of project cards. Opened via the "Your projects" button
 * in the page header. */
function HistoryDrawer({ items, onClose, onDelete }) {
  return (
    <div className="fixed inset-0 bg-ink/40 z-50 flex justify-end" onClick={onClose}>
      <div className="w-full max-w-md bg-white h-full overflow-y-auto" onClick={(e) => e.stopPropagation()} data-testid="history-drawer">
        <div className="sticky top-0 bg-white border-b border-line px-5 py-4 flex items-center gap-3 z-10">
          <History size={16} />
          <div className="font-display font-bold">Your projects</div>
          <button onClick={onClose} data-testid="history-close-btn" className="ml-auto btn-ghost text-xs"><X size={14} /></button>
        </div>

        <div className="p-4 space-y-6">
          {items.length === 0 ? (
            <div className="text-neutral-500 text-sm">No carousels yet. Pick a template or click Create with AI.</div>
          ) : (
            <>
              <div>
                <div className="ui-label mb-2">Continue where you left off</div>
                <ContinueCard project={items[0]} onNavigate={onClose} />
              </div>

              <div>
                <div className="ui-label mb-1">All projects</div>
                <div className="divide-y divide-line border-t border-line">
                  {items.map((p) => {
                    const pal = PALETTES.find((pp) => pp.id === p.palette_id) || PALETTES[0];
                    return (
                      <div key={p.id} className="group flex items-center gap-2.5 py-2.5">
                        <Link to={`/app/create-eq/${p.id}`} onClick={onClose} data-testid={`carousel-open-${p.id}`}
                          className="flex-1 flex items-center gap-2.5 min-w-0">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: pal.bg }} />
                          <span className="text-sm font-medium truncate">{p.topic}</span>
                          <span className="text-xs text-neutral-400 shrink-0 ml-auto pl-2">
                            {p.updated_at ? formatDistanceToNow(new Date(p.updated_at), { addSuffix: true }) : `${p.slides?.length || 0} slides`}
                          </span>
                        </Link>
                        <button onClick={() => onDelete(p.id)} data-testid={`carousel-delete-${p.id}`}
                          className="text-neutral-300 hover:text-red-600 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={13} /></button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Prominent "resume where you left off" card for the single most recently
 * edited project — `items` is already sorted by updated_at desc by the API. */
function ContinueCard({ project: p, onNavigate }) {
  const pal = PALETTES.find((pp) => pp.id === p.palette_id) || PALETTES[0];
  const edited = p.updated_at ? formatDistanceToNow(new Date(p.updated_at), { addSuffix: true }) : null;
  return (
    <Link to={`/app/create-eq/${p.id}`} onClick={onNavigate} data-testid="continue-card"
      className="group flex items-center gap-2.5 rounded-lg border border-line bg-white px-3 py-2.5 hover:border-ink transition-colors">
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: pal.bg }} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{p.topic}</div>
        {edited && <div className="text-xs text-neutral-500">{edited} · {p.slides?.length || 0} slides</div>}
      </div>
      <ArrowRight size={14} className="shrink-0 text-neutral-400 group-hover:text-ink" />
    </Link>
  );
}

/* --------------------------- Gamma-style wizard --------------------------- */

function NewCarouselWizard({ onClose, onCreated, initialTopic = "", initialStep = 1 }) {
  const [step, setStep] = useState(initialStep); // 1 = topic, 2 = audience, 3 = platform+palette, 4 = review
  const [form, setForm] = useState({
    topic: initialTopic,
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
