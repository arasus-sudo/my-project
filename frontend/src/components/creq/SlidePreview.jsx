import { useCallback, useEffect, useState } from "react";
import { X, ChevronLeft, ChevronRight, Play, Pause } from "lucide-react";
import { CANVAS } from "../../lib/creqTemplates";
import { renderBackground } from "./utils";
import ElementRender from "./ElementRender";
import PanoramaLayer from "./PanoramaLayer";
import DeckOverlay from "./DeckOverlay";

const AUTOPLAY_MS = 3500;

/** Fullscreen slideshow preview — the deck exactly as an audience would see
 * it, no editor chrome. Reuses the same ElementRender/PanoramaLayer/
 * DeckOverlay pipeline the live canvas and the PNG/PDF export both use, so
 * what you preview is what actually gets exported — no separate rendering
 * path to drift out of sync. */
export default function SlidePreview({ proj, palette, startIndex = 0, onClose }) {
  const total = proj.slides.length;
  const [idx, setIdx] = useState(Math.min(Math.max(startIndex, 0), total - 1));
  const [playing, setPlaying] = useState(false);
  const [scale, setScale] = useState(0.5);

  const goTo = useCallback((i) => setIdx(((i % total) + total) % total), [total]);
  const next = useCallback(() => goTo(idx + 1), [idx, goTo]);
  const prev = useCallback(() => goTo(idx - 1), [idx, goTo]);

  // Autoplay — advances one slide every AUTOPLAY_MS while playing; stops
  // cleanly on the last slide rather than looping, so a deck reads as
  // "finished" rather than repeating unexpectedly.
  useEffect(() => {
    if (!playing) return undefined;
    if (idx >= total - 1) { setPlaying(false); return undefined; }
    const t = setTimeout(next, AUTOPLAY_MS);
    return () => clearTimeout(t);
  }, [playing, idx, total, next]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); next(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
      else if (e.key.toLowerCase() === "p") setPlaying((p) => !p);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, onClose]);

  // Fit the fixed 1080×1350 canvas to whatever viewport the preview opens in.
  useEffect(() => {
    const fit = () => {
      const availW = window.innerWidth - 140;
      const availH = window.innerHeight - 180;
      setScale(Math.min(availW / CANVAS.w, availH / CANVAS.h, 1));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  const slide = proj.slides[idx];
  if (!slide) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-ink flex flex-col items-center justify-center animate-fade-in" data-testid="slide-preview">
      <button onClick={onClose} data-testid="preview-close" title="Close (Esc)"
        className="absolute top-5 right-5 z-20 text-white/60 hover:text-white p-2.5 rounded-full hover:bg-white/10 transition-colors">
        <X size={20} />
      </button>

      <div className="absolute top-5 left-5 text-white/40 font-mono text-[11px] uppercase tracking-widest truncate max-w-[60%]">
        {proj.topic || "Untitled"} · {idx + 1} / {total}
      </div>

      <div className="relative flex items-center justify-center flex-1 w-full min-h-0">
        {total > 1 && (
          <button onClick={prev} data-testid="preview-prev" title="Previous (←)"
            className="absolute left-3 sm:left-8 z-10 p-3 rounded-full bg-white/5 hover:bg-white/15 text-white transition-colors">
            <ChevronLeft size={20} />
          </button>
        )}

        <div key={slide._k} className="relative rounded-lg overflow-hidden animate-scale-in shadow-[0_30px_100px_-20px_rgba(0,0,0,0.6)]"
          style={{ width: CANVAS.w * scale, height: CANVAS.h * scale }}
          onClick={next}>
          <div style={{
            width: CANVAS.w, height: CANVAS.h,
            transform: `scale(${scale})`, transformOrigin: "top left",
            background: renderBackground(slide.bg, palette),
          }}>
            <PanoramaLayer panorama={proj.panorama} slideIdx={idx} totalSlides={total} />
            {slide.elements.map((el) => (
              <ElementRender key={el.id} el={el} palette={palette} onPointerDown={() => {}} />
            ))}
            <DeckOverlay proj={proj} slideIdx={idx} palette={palette} />
          </div>
        </div>

        {total > 1 && (
          <button onClick={next} data-testid="preview-next" title="Next (→)"
            className="absolute right-3 sm:right-8 z-10 p-3 rounded-full bg-white/5 hover:bg-white/15 text-white transition-colors">
            <ChevronRight size={20} />
          </button>
        )}
      </div>

      {total > 1 && (
        <div className="flex flex-col items-center gap-3 pb-8 pt-2 w-full max-w-md px-6">
          <div className="flex items-center gap-1.5 w-full">
            {proj.slides.map((s, i) => (
              <button key={s._k} onClick={() => goTo(i)} data-testid={`preview-bar-${i}`}
                className="h-1 flex-1 rounded-full bg-white/20 overflow-hidden">
                <div
                  key={`${s._k}-${i === idx ? "active" : "done"}-${playing}`}
                  className="h-full bg-white rounded-full"
                  style={
                    i < idx ? { width: "100%" }
                      : i > idx ? { width: "0%" }
                        : playing ? { animation: `creq-preview-fill ${AUTOPLAY_MS}ms linear forwards` }
                          : { width: "0%" }
                  }
                />
              </button>
            ))}
          </div>
          <button onClick={() => setPlaying((p) => (idx >= total - 1 ? (goTo(0), true) : !p))} data-testid="preview-play-toggle"
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-colors">
            {playing ? <Pause size={14} /> : <Play size={14} />}
            {playing ? "Pause" : idx >= total - 1 ? "Replay" : "Play"}
          </button>
        </div>
      )}
    </div>
  );
}
