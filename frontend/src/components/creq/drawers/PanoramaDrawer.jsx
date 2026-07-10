import { useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Mountain, Wand2 } from "lucide-react";
import { api } from "../../../lib/api";

export default function PanoramaDrawer({ onClose, panorama, slideCount, onApply }) {
  const [src, setSrc] = useState(panorama?.src || "");
  const [mode, setMode] = useState(panorama?.mode || "auto");
  const [busy, setBusy] = useState(false);
  const [prompt, setPrompt] = useState("");
  const fileRef = useRef(null);

  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) { toast.error("Please pick an image file"); return; }
    if (f.size > 12 * 1024 * 1024) { toast.error("Image too large (max ~12 MB)"); return; }
    const reader = new FileReader();
    reader.onload = () => setSrc(String(reader.result || ""));
    reader.readAsDataURL(f);
  };

  const generateWide = async () => {
    if (!prompt.trim()) { toast.error("Describe the panorama"); return; }
    setBusy(true);
    try {
      const { data } = await api.post("/carousel/ai-image", {
        prompt: `${prompt}. Wide panoramic composition, seamless left-to-right flow, no visible seams.`,
        provider: "nano-banana",
        size: `${slideCount * 1080}x1350`,
        aspect: "story",
      });
      setSrc(`data:${data.mime_type || "image/png"};base64,${data.image_base64}`);
      toast.success("Panorama generated");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Generation failed");
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-ink/40 z-50 flex justify-end" onClick={onClose}>
      <div className="w-full max-w-md bg-white h-full overflow-y-auto" onClick={(e) => e.stopPropagation()} data-testid="panorama-drawer">
        <div className="sticky top-0 bg-white border-b border-line px-5 py-4 flex items-center gap-3 z-10">
          <Mountain size={16} />
          <div className="font-display font-bold">Panorama background</div>
          <button onClick={onClose} className="ml-auto btn-ghost text-xs">Close</button>
        </div>

        <div className="p-4 space-y-4">
          <div className="text-xs text-neutral-600 leading-relaxed bg-neutral-50 rounded-lg p-3 border border-line">
            One image that flows across all {slideCount} slides — perfect for LinkedIn swipe carousels.
          </div>

          <div>
            <div className="ui-label mb-1.5">Mode</div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setMode("auto")} data-testid="pano-mode-auto"
                className={`text-left p-3 rounded-lg border ${mode === "auto" ? "border-ink bg-neutral-50" : "border-line hover:border-ink"}`}>
                <div className="text-xs font-medium">Auto-split</div>
                <div className="text-[10px] text-neutral-500 mt-0.5 leading-tight">Splits one wide image into equal slices</div>
              </button>
              <button onClick={() => setMode("manual")} data-testid="pano-mode-manual"
                className={`text-left p-3 rounded-lg border ${mode === "manual" ? "border-ink bg-neutral-50" : "border-line hover:border-ink"}`}>
                <div className="text-xs font-medium">Manual pan</div>
                <div className="text-[10px] text-neutral-500 mt-0.5 leading-tight">Position + zoom per slide</div>
              </button>
            </div>
          </div>

          <div>
            <div className="ui-label mb-1.5">Upload wide image</div>
            <input ref={fileRef} type="file" accept="image/*" onChange={onFile} className="hidden" data-testid="pano-file-input" />
            <button onClick={() => fileRef.current?.click()} data-testid="pano-file-pick"
              className="w-full py-4 border border-dashed border-line rounded-lg text-sm text-neutral-600 hover:border-ink hover:bg-neutral-50">
              Click to upload · JPG, PNG, WebP
            </button>
          </div>

          <div>
            <div className="ui-label mb-1.5">…or paste an image URL</div>
            <input value={src.startsWith("data:") ? "(uploaded image)" : src}
              onChange={(e) => setSrc(e.target.value)}
              disabled={src.startsWith("data:")}
              placeholder="https://…"
              data-testid="pano-src"
              className="w-full border border-line rounded-full px-3 py-2 text-sm font-mono disabled:bg-neutral-50 disabled:text-neutral-500" />
          </div>

          <div className="border-t border-line pt-4">
            <div className="ui-label mb-1.5">…or generate with AI</div>
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3}
              placeholder="e.g. Cinematic mountain range at golden hour, ultra-wide, seamless"
              data-testid="pano-prompt"
              className="w-full border border-line rounded-lg p-2 text-sm focus:outline-none focus:border-ink" />
            <button onClick={generateWide} disabled={busy} data-testid="pano-generate"
              className="mt-2 w-full btn-secondary justify-center">
              {busy ? <><Loader2 size={14} className="animate-spin" /> Generating (~60s)…</> : <><Wand2 size={14} /> Generate wide image</>}
            </button>
          </div>

          {src && (
            <div className="border-t border-line pt-4">
              <div className="ui-label mb-1.5">Preview</div>
              <div className="rounded-lg overflow-hidden border border-line bg-neutral-100">
                <img src={src} alt="pano" className="w-full block" data-testid="pano-preview" />
              </div>
            </div>
          )}

          <div className="border-t border-line pt-4 grid grid-cols-2 gap-2">
            <button onClick={() => onApply(null)} data-testid="pano-remove"
              className="text-xs py-2 rounded-full border border-line hover:border-red-600 text-red-600 justify-center">
              Remove panorama
            </button>
            <button onClick={() => onApply({ src, mode, viewports: panorama?.viewports || [] })}
              disabled={!src}
              data-testid="pano-apply"
              className="btn-primary text-xs justify-center disabled:opacity-40">
              Apply to deck
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
