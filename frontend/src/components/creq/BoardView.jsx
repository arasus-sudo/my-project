import { memo } from "react";
import { CANVAS as DEFAULT_CANVAS } from "../../lib/creqTemplates";
import { renderBackground } from "./utils";
import ElementRender from "./ElementRender";
import PanoramaLayer from "./PanoramaLayer";
import DeckOverlay from "./DeckOverlay";

function BoardView({ proj, palette, onFocus }) {
  // Per-project canvas, not the fixed authoring size — a Story (1080x1920) or
  // custom-format deck laid out in 1080x1350 boxes gets cropped at the bottom
  // and mis-scaled. DEFAULT_CANVAS keeps decks saved before per-project canvas
  // existed rendering exactly as they did.
  const CANVAS = proj?.canvas?.w && proj?.canvas?.h ? proj.canvas : DEFAULT_CANVAS;
  const n = proj.slides.length;
  const targetStripW = Math.max(900, Math.min(1800, 300 * n));
  const zoom = targetStripW / (n * CANVAS.w);
  return (
    <div className="min-h-[calc(100vh-90px)] bg-neutral-100 overflow-x-auto" data-testid="board-view">
      <div className="p-8 flex gap-0 items-start" style={{ minWidth: n * CANVAS.w * zoom + 80 }}>
        {proj.slides.map((s, i) => (
          <div key={s._k} className="relative flex-shrink-0" style={{ width: CANVAS.w * zoom, height: CANVAS.h * zoom }}>
            <div
              onClick={() => onFocus(i)}
              data-testid={`board-slide-${i}`}
              className="absolute inset-0 origin-top-left overflow-hidden ring-1 ring-line hover:ring-ink transition-all cursor-pointer"
              style={{
                width: CANVAS.w, height: CANVAS.h,
                transform: `scale(${zoom})`, transformOrigin: "top left",
                background: renderBackground(s.bg, palette),
              }}
            >
              <PanoramaLayer panorama={proj.panorama} slideIdx={i} totalSlides={n} canvas={CANVAS} />
              <div style={{ pointerEvents: "none", width: "100%", height: "100%", position: "absolute", inset: 0 }}>
                {s.elements.map((el) => (
                  <ElementRender key={el.id} el={el} palette={palette} selected={false} onPointerDown={() => {}} />
                ))}
              </div>
              <DeckOverlay proj={proj} slideIdx={i} palette={palette} />
            </div>
            <div className="absolute -top-6 left-0 text-[11px] font-mono text-neutral-500">Slide {i + 1}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default memo(BoardView);
