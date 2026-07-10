import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Wand2 } from "lucide-react";
import { api } from "../../../lib/api";

const IMAGE_PROVIDERS = [
  { id: "nano-banana", label: "Gemini Nano Banana", hint: "Stylized, artistic, painterly" },
  { id: "gpt-image-1", label: "GPT Image 1", hint: "Photorealistic, clean, product" },
];

const PROMPT_PRESETS = [
  "Abstract flowing waves in deep blue and coral, minimalist editorial style, high contrast",
  "Soft cream paper texture with subtle grain, warm off-white background for text overlay",
  "Bold geometric shapes overlapping — magenta, mustard, black — Bauhaus poster energy",
  "Moody dark studio backdrop with a single warm rim light, cinematic",
  "Dreamy pastel gradient — peach into lavender — soft blurred bokeh",
  "Iso-3D floating platforms, mint and violet, gentle drop shadows, product-launch vibe",
];

export default function AiImageDrawer({ onClose, onAddAsElement, onAddAsBackground }) {
  const [prompt, setPrompt] = useState("");
  const [provider, setProvider] = useState("nano-banana");
  const [aspect, setAspect] = useState("portrait");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);

  const size = aspect === "square" ? "1080x1080" : aspect === "story" ? "1080x1920" : "1080x1350";

  const generate = async () => {
    if (!prompt.trim()) { toast.error("Describe the image you want"); return; }
    setBusy(true);
    setPreview(null);
    try {
      const { data } = await api.post("/carousel/ai-image", { prompt: prompt.trim(), provider, size, aspect });
      if (!data?.image_base64) throw new Error("no image");
      const dataUrl = `data:${data.mime_type || "image/png"};base64,${data.image_base64}`;
      setPreview({ dataUrl, provider: data.provider });
      toast.success(`Generated with ${data.provider}`);
    } catch (err) {
      const msg = err?.response?.data?.detail || err?.message || "Generation failed";
      toast.error(String(msg).slice(0, 200));
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-ink/40 z-50 flex justify-end" onClick={onClose}>
      <div className="w-full max-w-md bg-white h-full overflow-y-auto" onClick={(e) => e.stopPropagation()} data-testid="ai-image-drawer">
        <div className="sticky top-0 bg-white border-b border-line px-5 py-4 flex items-center gap-3 z-10">
          <Wand2 size={16} />
          <div className="font-display font-bold">AI Image</div>
          <button onClick={onClose} className="ml-auto btn-ghost text-xs">Close</button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <div className="ui-label mb-1.5">Provider</div>
            <div className="grid grid-cols-2 gap-2">
              {IMAGE_PROVIDERS.map((p) => (
                <button key={p.id} onClick={() => setProvider(p.id)}
                  data-testid={`ai-image-provider-${p.id}`}
                  className={`text-left p-3 rounded-lg border transition-colors ${provider === p.id ? "border-ink bg-neutral-50" : "border-line hover:border-ink"}`}>
                  <div className="text-xs font-medium">{p.label}</div>
                  <div className="text-[10px] text-neutral-500 mt-0.5 leading-tight">{p.hint}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="ui-label mb-1.5">Aspect</div>
            <div className="flex gap-1">
              {[["portrait", "4:5 · 1080×1350"], ["square", "1:1 · 1080×1080"], ["story", "9:16 · 1080×1920"]].map(([k, l]) => (
                <button key={k} onClick={() => setAspect(k)} data-testid={`ai-image-aspect-${k}`}
                  className={`flex-1 py-1.5 rounded-full text-[11px] border ${aspect === k ? "border-ink bg-ink text-white" : "border-line hover:border-ink"}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="ui-label mb-1.5">Describe the image</div>
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4}
              placeholder="e.g. Soft cream paper texture with subtle grain and coral confetti"
              data-testid="ai-image-prompt"
              className="w-full border border-line rounded-lg p-2 text-sm focus:outline-none focus:border-ink" />
            <div className="mt-2 flex flex-wrap gap-1">
              {PROMPT_PRESETS.slice(0, 4).map((p, i) => (
                <button key={i} onClick={() => setPrompt(p)}
                  className="text-[10px] px-2 py-1 rounded-full border border-line hover:border-ink text-neutral-600">
                  {p.split(",")[0].slice(0, 32)}…
                </button>
              ))}
            </div>
          </div>

          <button onClick={generate} disabled={busy} data-testid="ai-image-generate"
            className="w-full btn-primary justify-center">
            {busy ? <><Loader2 size={14} className="animate-spin" /> Generating (~30–60s)…</> : <><Wand2 size={14} /> Generate</>}
          </button>

          {preview && (
            <div className="pt-4 border-t border-line space-y-3">
              <div className="ui-label">Preview · {preview.provider}</div>
              <div className="rounded-lg overflow-hidden border border-line bg-neutral-100" style={{ aspectRatio: aspect === "square" ? "1 / 1" : aspect === "story" ? "9 / 16" : "4 / 5" }}>
                <img src={preview.dataUrl} alt="preview" className="w-full h-full object-cover" data-testid="ai-image-preview" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => onAddAsElement(preview.dataUrl)} data-testid="ai-image-add-element" className="btn-secondary text-xs justify-center">Add as element</button>
                <button onClick={() => onAddAsBackground(preview.dataUrl)} data-testid="ai-image-add-background" className="btn-primary text-xs justify-center">Set as background</button>
              </div>
            </div>
          )}

          <div className="text-[11px] text-neutral-500 pt-3 border-t border-line">
            Images are generated on-demand and embedded directly in your slide — nothing is uploaded anywhere.
          </div>
        </div>
      </div>
    </div>
  );
}
