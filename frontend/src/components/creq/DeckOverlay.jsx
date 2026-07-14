import { memo } from "react";
import { ChevronRight } from "lucide-react";
import { resolveColor } from "../../lib/creqTemplates";

/** Deck-wide chrome (slide counter, progress dots, swipe hint) — rendered
 * identically in the live canvas, board view, and PNG/PDF export so what you
 * see while editing is exactly what gets exported. */
function DeckOverlay({ proj, slideIdx, palette }) {
  if (!proj) return null;
  const total = proj.slides?.length || 1;
  const showNum = !!proj.show_slide_numbers;
  const showDots = !!proj.show_progress_dots;
  const showSwipe = !!proj.show_swipe_hint && slideIdx < total - 1;
  const showBranding = !!proj.show_branding;
  if (!showNum && !showDots && !showSwipe && !showBranding) return null;

  const fg = resolveColor("text", palette);

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {showBranding && (
        <div style={{
          position: "absolute", left: 40, bottom: 40,
          fontFamily: '"Inter", sans-serif', fontSize: 16, fontWeight: 500,
          color: fg, opacity: 0.55, letterSpacing: "0.01em",
        }}>
          Made with Innoira Agentic Suite
        </div>
      )}
      {showNum && (
        <div style={{
          position: "absolute", right: 40, bottom: 40,
          fontFamily: '"JetBrains Mono", monospace', fontSize: 24, fontWeight: 600,
          color: fg, opacity: 0.85,
        }}>
          {slideIdx + 1}/{total}
        </div>
      )}
      {showDots && (
        <div style={{ position: "absolute", left: "50%", bottom: 40, transform: "translateX(-50%)", display: "flex", gap: 8 }}>
          {Array.from({ length: total }).map((_, i) => (
            <div key={i} style={{
              width: i === slideIdx ? 24 : 8, height: 8, borderRadius: 999,
              background: fg, opacity: i === slideIdx ? 1 : 0.35,
            }} />
          ))}
        </div>
      )}
      {showSwipe && (
        <div style={{ position: "absolute", right: 40, top: "50%", transform: "translateY(-50%)", color: fg, opacity: 0.7 }}>
          <ChevronRight size={32} />
        </div>
      )}
    </div>
  );
}

export default memo(DeckOverlay);
