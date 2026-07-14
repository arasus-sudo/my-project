import { useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Mountain, Wand2 } from "lucide-react";
import { api } from "../../../lib/api";
import { CANVAS } from "../../../lib/creqTemplates";
import { panoramaSliceStyle } from "../PanoramaLayer";

export default function PanoramaDrawer({ onClose, panorama, slideCount, onApply }) {
  const [src, setSrc] = useState(panorama?.src || "");
  const [mode, setMode] = useState(panorama?.mode || "same");
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
      const isSplit = mode === "auto";
      const { data } = await api.post("/carousel/ai-image", {
        prompt: isSplit
          ? `${prompt}. Wide panoramic composition, seamless left-to-right flow, no visible seams.`
          : prompt,
        provider: "nano-banana",
        size: isSplit ? `${slideCount * 1080}x1350` : "1080x1350",
        aspect: isSplit ? "landscape" : "portrait",
      });
      setSrc(`data:${data.mime_type || "image/png"};base64,${data.image_base64}`);
      toast.success("Panorama generated");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Generation failed");
    } finally { setBusy(false); }
  };

  const preview = { src, mode, viewports: panorama?.viewports || [], baked_count: slideCount };

  return (
    <div className="fixed inset-0 bg-ink/40 z-50 flex justify-end" onClick={onClose}>
      <div className="w-full max-w-md bg-white h-full overflow-y-auto" onClick={(e) => e.stopPropagation()} data-testid="panorama-drawer">
        <div className="sticky top-0 bg-white border-b border-line px-5 py-4 flex items-center gap-3 z-10">
          <Mountain size={16} />
          <div className="font-display font-bold">Deck background</div>
          <button onClick={onClose} className="ml-auto btn-ghost text-xs">Close</button>
        </div>

        <div className="p-4 space-y-4">
          <div className="text-xs text-neutral-600 leading-relaxed bg-neutral-50 rounded-lg p-3 border border-line">
            One image applied to <strong>all {slideCount} slides</strong>. Pick a mode below to control how it appears.
          </div>

          <div>
            <div className="ui-label mb-1.5">Mode</div>
            <div className="grid grid-cols-3 gap-2">
              <ModeTile testid="pano-mode-same" active={mode === "same"} onClick={() => setMode("same")}
                label="Same on all" hint="Identical image on every slide (most common)" />
              <ModeTile testid="pano-mode-auto" active={mode === "auto"} onClick={() => setMode("auto")}
                label="Panoramic split" hint="One wide image sliced across slides" />
              <ModeTile testid="pano-mode-manual" active={mode === "manual"} onClick={() => setMode("manual")}
                label="Manual pan" hint="Position + zoom per slide" />
            </div>
          </div>

          <div>
            <div className="ui-label mb-1.5">Upload image</div>
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
              placeholder={mode === "auto" ? "e.g. Cinematic mountain range, ultra-wide seamless" : "e.g. Soft cream paper texture with subtle grain"}
              data-testid="pano-prompt"
              className="w-full border border-line rounded-lg p-2 text-sm focus:outline-none focus:border-ink" />
            <button onClick={generateWide} disabled={busy} data-testid="pano-generate"
              className="mt-2 w-full btn-secondary justify-center">
              {busy ? <><Loader2 size={14} className="animate-spin" /> Generating (~60s)…</> : <><Wand2 size={14} /> Generate image</>}
            </button>
          </div>

          {src && (
            <div className="border-t border-line pt-4 space-y-2">
              <div className="ui-label">Per-slide preview</div>
              <div className="grid grid-cols-4 gap-1.5">
                {Array.from({ length: slideCount }).map((_, i) => (
                  <div key={i} className="relative w-full aspect-[4/5] rounded-md overflow-hidden border border-line bg-neutral-100" data-testid={`pano-preview-slide-${i}`}>
                    <div style={{ position: "absolute", inset: 0, transform: "scale(0.11)", transformOrigin: "top left", width: CANVAS.w, height: CANVAS.h }}>
                      <PreviewSlice panorama={preview} slideIdx={i} totalSlides={slideCount} />
                    </div>
                    <div className="absolute bottom-0.5 right-1 text-[9px] font-mono text-white mix-blend-difference">{i + 1}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="border-t border-line pt-4 grid grid-cols-2 gap-2">
            <button onClick={() => onApply(null)} data-testid="pano-remove"
              className="text-xs py-2 rounded-full border border-line hover:border-red-600 text-red-600 justify-center">
              Remove background
            </button>
            <button onClick={() => onApply({ src, mode, viewports: panorama?.viewports || [], baked_count: slideCount })}
              disabled={!src}
              data-testid="pano-apply"
              className="btn-primary text-xs justify-center disabled:opacity-40">
              Apply to all {slideCount} slides
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModeTile({ testid, active, onClick, label, hint }) {
  return (
    <button onClick={onClick} data-testid={testid}
      className={`text-left p-2.5 rounded-lg border ${active ? "border-ink bg-neutral-50" : "border-line hover:border-ink"}`}>
      <div className="text-[11px] font-medium">{label}</div>
      <div className="text-[9px] text-neutral-500 mt-0.5 leading-tight">{hint}</div>
    </button>
  );
}

function PreviewSlice({ panorama, slideIdx, totalSlides }) {
  const style = panoramaSliceStyle(panorama, slideIdx, totalSlides);
  if (!style) return null;
  return <img src={panorama.src} alt="" style={{ ...style, pointerEvents: "none", userSelect: "none" }} draggable={false} />;
}
