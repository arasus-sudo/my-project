import { useState } from "react";
import { Loader2, FileText, Download } from "lucide-react";
import { CANVAS } from "../../../lib/creqTemplates";
import { renderBackground } from "../utils";
import ElementRender from "../ElementRender";
import PanoramaLayer from "../PanoramaLayer";

// scale = the html2canvas rasterization multiplier. Standard (2x) is today's
// existing behavior, kept as the default so nothing changes for anyone who
// doesn't touch this control. Print isn't literally 300 DPI (that depends on
// physical print size, which a social carousel doesn't have) — it's "as sharp
// as this pipeline can reasonably produce" for anyone printing or zooming in.
export const EXPORT_QUALITIES = [
  { id: "draft", label: "Draft", detail: "Fast, smaller file", scale: 1 },
  { id: "standard", label: "Standard", detail: "Recommended for social", scale: 2 },
  { id: "print", label: "Print", detail: "Maximum sharpness, slower", scale: 3 },
];

export default function PdfExportDialog({ proj, palette, onClose, busy, progress, onExport }) {
  const total = proj.slides.length;
  const [picked, setPicked] = useState(() => proj.slides.map((_, i) => i));
  const [quality, setQuality] = useState("standard");

  const toggle = (i) => setPicked((cur) => cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i].sort((a, b) => a - b));
  const selectAll = () => setPicked(proj.slides.map((_, i) => i));
  const selectNone = () => setPicked([]);

  return (
    <div className="fixed inset-0 bg-ink/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()} data-testid="pdf-picker-dialog">
        <div className="px-6 py-4 border-b border-line flex items-center gap-3">
          <FileText size={16} />
          <div className="font-display font-bold">Export PDF</div>
          <div className="text-xs text-neutral-500 ml-2">Choose which slides to include in a single PDF file.</div>
          <button onClick={onClose} className="ml-auto btn-ghost text-xs">Close</button>
        </div>

        <div className="px-6 py-3 flex items-center gap-2 border-b border-line bg-neutral-50">
          <button onClick={selectAll} data-testid="pdf-pick-all" className="btn-ghost text-xs">Select all ({total})</button>
          <button onClick={selectNone} data-testid="pdf-pick-none" className="btn-ghost text-xs">Clear</button>
          <div className="ml-auto text-xs font-mono text-neutral-500">
            {picked.length} of {total} selected
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {proj.slides.map((s, i) => {
              const on = picked.includes(i);
              const bg = renderBackground(s.bg, palette);
              return (
                <button key={s._k} onClick={() => toggle(i)} data-testid={`pdf-pick-${i}`}
                  className={`text-left rounded-xl overflow-hidden border-2 transition-all ${on ? "border-ink shadow-md" : "border-line hover:border-neutral-400"}`}>
                  <div className="relative w-full aspect-[4/5] overflow-hidden" style={{ background: bg }}>
                    <PanoramaLayer panorama={proj.panorama} slideIdx={i} totalSlides={total} />
                    <div style={{ position: "absolute", inset: 0, transform: `scale(${0.2})`, transformOrigin: "top left", width: CANVAS.w, height: CANVAS.h, pointerEvents: "none" }}>
                      {s.elements.map((el) => (
                        <ElementRender key={el.id} el={el} palette={palette} selected={false} onPointerDown={() => {}} />
                      ))}
                    </div>
                    <div className={`absolute top-2 right-2 w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold ${on ? "bg-ink text-white border-ink" : "bg-white border-neutral-300 text-transparent"}`}>
                      ✓
                    </div>
                  </div>
                  <div className="p-2 text-[11px] font-mono flex items-center justify-between bg-white">
                    <span>Slide {i + 1}</span>
                    <span className="text-neutral-500">{s.elements.length} el</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-line flex items-center justify-between gap-3">
          <div className="flex items-center gap-1" data-testid="pdf-quality-picker">
            {EXPORT_QUALITIES.map((q) => (
              <button key={q.id} type="button" onClick={() => setQuality(q.id)}
                disabled={busy} title={q.detail} data-testid={`pdf-quality-${q.id}`}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors disabled:opacity-50 ${
                  quality === q.id ? "bg-ink text-white border-ink" : "border-line text-neutral-600 hover:border-ink"
                }`}>
                {q.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            {busy && progress && (
              <span className="text-xs font-mono text-neutral-500" data-testid="pdf-export-progress">
                Rendering slide {progress.done} of {progress.total}…
              </span>
            )}
            <button onClick={onClose} className="btn-secondary text-sm">Cancel</button>
            <button onClick={() => onExport(picked, quality)} disabled={busy || !picked.length}
              data-testid="pdf-export-btn"
              className="btn-primary disabled:opacity-40">
              {busy ? <><Loader2 size={14} className="animate-spin" /> Rendering…</> : <><Download size={14} /> Export {picked.length} slide{picked.length === 1 ? "" : "s"}</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
