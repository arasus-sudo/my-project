import { useRef, useState } from "react";
import { toast } from "sonner";
import { Vibrant } from "node-vibrant/browser";
import { Palette, Check, Loader2, Image as ImageIcon, ArrowRight } from "lucide-react";
import { api, isCreditError } from "../../lib/api";
import { buildPremiumDeck, refineDeck, paletteForDeck } from "../../lib/creqPremiumEngine";
import { DEFAULT_FAMILY } from "../../lib/creqClaudeDesign";
import FormatPicker, { FORMATS } from "./FormatPicker";

/** Dedicated Premium AI entry point — deliberately a SEPARATE flow from
 * NewCarouselWizard's Standard path, not a toggle buried inside it. Premium
 * AI's whole point is that color/brand identity is either genuinely handed
 * to the model to design (like Claude Design proposing a palette for a
 * client with none) or genuinely locked to what the user supplies — not
 * quietly inherited from whatever swatch a human happened to click in a
 * generic theme picker. After generation, a refinement loop (deterministic
 * geometry audit on every slide + a conditional targeted copy rewrite on any
 * slide that still reads too sparse or too cramped) runs before the deck is
 * handed to the editor — see creqPremiumEngine.js's refineDeck(). */

export default function PremiumCarouselWizard({ onClose, onCreated }) {
  const [step, setStep] = useState(1); // 1 topic, 2 format, 3 brand question, 4 review
  const [topic, setTopic] = useState("");
  const [slideCount, setSlideCount] = useState(6);
  const [format, setFormat] = useState({ platform: "linkedin", customW: 1080, customH: 1350 });
  const [brandChoice, setBrandChoice] = useState(null); // null | "ai" | "provide"
  const [logoUrl, setLogoUrl] = useState("");
  const [bg, setBg] = useState("#141414");
  const [accent, setAccent] = useState("#E85D3A");
  const [text, setText] = useState("#FAFAFA");
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("Designing…");
  const logoFileRef = useRef(null);

  const extractLogoColors = async (dataUrl) => {
    try {
      const palette = await Vibrant.from(dataUrl).getPalette();
      if (palette.Vibrant?.hex) setAccent(palette.Vibrant.hex);
      if (palette.DarkMuted?.hex) setBg(palette.DarkMuted.hex);
      toast.success("Accent color auto-detected from logo — tweak any swatch below");
    } catch { /* non-fatal — manual pickers still work */ }
  };

  const onLogoFile = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) { toast.error("Please pick an image file"); return; }
    if (f.size > 3 * 1024 * 1024) { toast.error("Logo too large (max ~3 MB)"); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      setLogoUrl(dataUrl);
      extractLogoColors(dataUrl);
    };
    reader.readAsDataURL(f);
  };

  const canNext = () => {
    if (step === 1) return topic.trim().length > 3;
    if (step === 3) return brandChoice !== null;
    return true;
  };

  const generate = async () => {
    setBusy(true);
    setBusyLabel("Designing…");
    try {
      const providingBrand = brandChoice === "provide";
      const { data } = await api.post("/carousel/generate", {
        topic: topic.trim(), platform: format.platform, slide_count: slideCount,
        tone: "confident, punchy", design_mode: "premium",
        ...(format.platform === "custom" ? { custom_w: format.customW, custom_h: format.customH } : {}),
        // Omitted entirely when the user chose "let AI decide" — the backend
        // only asks the model to pick a palette_family when body.brand is
        // absent, so sending a default-valued brand here would silently lock
        // the deck to generic colours instead of a chosen design-system family.
        ...(providingBrand ? { brand: { bg, accent, text, font: "Geist", logo_text: "" } } : {}),
      });
      const canvas = data.canvas || { w: 1080, h: 1350 };
      const brandKit = providingBrand ? { bg, accent, text } : null;
      const familyId = providingBrand ? "brand" : (data.palette_family || DEFAULT_FAMILY);
      const buildOpts = { canvas, familyId, brand: brandKit };

      // Compose the whole deck at once — surface rhythm (which slides go dark,
      // and where) is a deck-level decision, not a per-slide one. The
      // deterministic geometry audit runs inside every slide build; refineDeck
      // adds the conditional targeted copy rewrite for any slide that still
      // scores poorly (too sparse or overrunning its slot).
      const built = buildPremiumDeck(data.slides || [], buildOpts);
      setBusyLabel("Refining slides…");
      const refined = await refineDeck(api, data.id, data.slides, built, buildOpts);

      // The deck's own palette is stored so the editor's swatches, deck chrome
      // and any hand-added element stay inside the system the deck was
      // composed against, instead of falling back to the generic Midnight.
      const updates = {
        slides: refined,
        palette_id: "ai",
        ai_palette: paletteForDeck(familyId, brandKit),
        palette_family: familyId,
      };
      try { await api.put(`/carousel/${data.id}`, updates); }
      catch { /* non-fatal — the deck still opens with its unrefined-but-generated slides */ }

      toast.success(providingBrand ? "Draft ready — designed around your brand" : "Draft ready — AI designed the full look");
      onCreated(data.id);
    } catch (err) { if (!isCreditError(err)) toast.error("Generation failed — try again"); }
    finally { setBusy(false); }
  };

  const formatLabel = format.platform === "custom"
    ? `Custom ${format.customW}×${format.customH}`
    : FORMATS.find((f) => f.id === format.platform)?.label || format.platform;

  return (
    <div className="fixed inset-0 bg-ink/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-xl max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()} data-testid="premium-carousel-wizard">
        <div className="px-4 sm:px-8 pt-6 pb-4">
          <div className="flex items-center gap-2 mb-3">
            <Palette size={16} className="text-accent" />
            <div className="text-[10px] font-mono uppercase tracking-widest text-neutral-400">Premium · Step {step} of 4</div>
            <button onClick={onClose} className="ml-auto text-neutral-400 hover:text-ink text-body">Cancel</button>
          </div>
          <div className="flex gap-1">
            {[1, 2, 3, 4].map((n) => <div key={n} className={`h-1 flex-1 rounded-full ${n <= step ? "bg-accent" : "bg-neutral-200"}`} />)}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-4 sm:py-6">
          {step === 1 && (
            <div className="space-y-4" data-testid="premium-step-1">
              <h2 className="font-display font-bold text-2xl sm:text-3xl leading-tight">What&apos;s your deck about?</h2>
              <p className="text-body text-neutral-400">Premium AI reasons about narrative, composition and typography per slide instead of filling one fixed template.</p>
              <textarea autoFocus value={topic} onChange={(e) => setTopic(e.target.value)} rows={3}
                placeholder='e.g. "Why cold outreach fails in 2026 and how to fix it"'
                data-testid="premium-topic-input"
                className="w-full border border-line rounded-lg px-4 py-3 text-base focus:outline-none focus:border-ink" />
              <div className="flex items-center gap-2">
                <span className="text-caption text-neutral-400">Slides:</span>
                {[4, 6, 8, 10].map((n) => (
                  <button key={n} onClick={() => setSlideCount(n)} data-testid={`premium-count-${n}`}
                    className={`px-3 py-1 rounded-xl text-caption font-mono ${slideCount === n ? "bg-ink text-white" : "bg-neutral-100 hover:bg-neutral-200"}`}>{n}</button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4" data-testid="premium-step-2">
              <h2 className="font-display font-bold text-2xl sm:text-3xl leading-tight">What size deck?</h2>
              <p className="text-body text-neutral-400">This is the actual canvas every slide is designed and exported at — pick where it&apos;s going.</p>
              <FormatPicker value={format} onChange={setFormat} />
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4" data-testid="premium-step-3">
              <h2 className="font-display font-bold text-2xl sm:text-3xl leading-tight">Who&apos;s designing the look?</h2>
              <p className="text-body text-neutral-400">Give the AI your brand to design around, or let it choose the palette for this deck — like handing a design studio a brief with or without existing brand assets.</p>

              <button onClick={() => setBrandChoice("ai")} data-testid="premium-brand-ai"
                className={`w-full text-left p-4 rounded-2xl border transition-colors ${brandChoice === "ai" ? "border-ink bg-ash" : "border-line hover:border-neutral-400"}`}>
                <div className="flex items-center gap-2">
                  {brandChoice === "ai" && <Check size={14} className="text-ink" />}
                  <div className="text-body font-medium">Let AI design the theme</div>
                </div>
                <div className="text-[11px] text-neutral-400 mt-0.5">AI picks the palette that suits your topic, then composes each slide against it — warm paper and ink, with one accent used sparingly.</div>
              </button>

              <button onClick={() => setBrandChoice("provide")} data-testid="premium-brand-provide"
                className={`w-full text-left p-4 rounded-2xl border transition-colors ${brandChoice === "provide" ? "border-ink bg-ash" : "border-line hover:border-neutral-400"}`}>
                <div className="flex items-center gap-2">
                  {brandChoice === "provide" && <Check size={14} className="text-ink" />}
                  <div className="text-body font-medium">Use my logo &amp; brand colors</div>
                </div>
                <div className="text-[11px] text-neutral-400 mt-0.5">AI designs every slide within your exact colors — treated as fixed brand guidelines, never overridden.</div>
              </button>

              {brandChoice === "provide" && (
                <div className="border border-line rounded-2xl p-4 space-y-3 animate-fade-in" data-testid="premium-brand-form">
                  <div className="flex items-start gap-3">
                    <div className="w-16 h-16 border border-line rounded-lg overflow-hidden bg-neutral-50 flex items-center justify-center flex-shrink-0">
                      {logoUrl ? <img src={logoUrl} alt="" className="w-full h-full object-contain" /> : <ImageIcon size={18} className="text-neutral-400" />}
                    </div>
                    <div className="flex-1">
                      <input ref={logoFileRef} type="file" accept="image/*" className="hidden" onChange={onLogoFile} data-testid="premium-logo-file" />
                      <button type="button" onClick={() => logoFileRef.current?.click()} data-testid="premium-logo-upload"
                        className="w-full py-2 border border-dashed border-line rounded-lg text-caption text-neutral-700 hover:border-ink hover:bg-neutral-50">
                        Upload logo <span className="text-neutral-400">(optional — auto-detects a color)</span>
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <label className="block">
                      <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-400">Background</span>
                      <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} data-testid="premium-color-bg" className="mt-1 w-full h-10 border border-line rounded" />
                    </label>
                    <label className="block">
                      <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-400">Accent</span>
                      <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} data-testid="premium-color-accent" className="mt-1 w-full h-10 border border-line rounded" />
                    </label>
                    <label className="block">
                      <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-400">Text</span>
                      <input type="color" value={text} onChange={(e) => setText(e.target.value)} data-testid="premium-color-text" className="mt-1 w-full h-10 border border-line rounded" />
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-5" data-testid="premium-step-4">
              <h2 className="font-display font-bold text-2xl sm:text-3xl leading-tight">Ready to design?</h2>
              <p className="text-body text-neutral-400">Every slide gets its own narrative, composition and typography reasoning, then a refinement pass checks alignment before it's handed to you.</p>
              <ul className="space-y-2 text-body">
                <li className="flex items-start gap-2"><Check size={14} className="text-ink mt-0.5" /> <span><span className="font-medium">Topic:</span> {topic}</span></li>
                <li className="flex items-start gap-2"><Check size={14} className="text-ink mt-0.5" /> <span><span className="font-medium">Slides:</span> {slideCount}</span></li>
                <li className="flex items-start gap-2"><Check size={14} className="text-ink mt-0.5" /> <span><span className="font-medium">Format:</span> {formatLabel}</span></li>
                <li className="flex items-start gap-2"><Check size={14} className="text-ink mt-0.5" />
                  <span><span className="font-medium">Design:</span> {brandChoice === "provide" ? "Your brand colors" : "Generated identity"}</span>
                </li>
              </ul>
              {brandChoice === "provide" && (
                <div className="flex gap-2">
                  {[bg, accent, text].map((c, i) => <span key={i} className="w-8 h-8 rounded-full border border-line" style={{ background: c }} />)}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-4 sm:px-8 py-4 border-t border-line flex justify-between">
          <button onClick={() => step === 1 ? onClose() : setStep((s) => s - 1)} className="btn-ghost">
            {step === 1 ? "Cancel" : "Back"}
          </button>
          {step < 4 ? (
            <button onClick={() => setStep((s) => s + 1)} disabled={!canNext()} data-testid="premium-wizard-next"
              className="btn-primary disabled:opacity-40">Continue <ArrowRight size={14} /></button>
          ) : (
            <button onClick={generate} disabled={busy} data-testid="premium-wizard-generate" className="btn-primary disabled:opacity-60">
              {busy ? <><Loader2 size={14} className="animate-spin" /> {busyLabel}</> : <><Palette size={14} /> Generate with Premium</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
