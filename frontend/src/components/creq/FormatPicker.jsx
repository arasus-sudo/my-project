import { useState } from "react";

/** Format/size picker shared by all three creation flows (blank canvas,
 * standard AI, Premium AI) — LinkedIn, Instagram Square, Instagram Story, or
 * a custom width/height. This actually determines the deck's authoring
 * canvas end to end now (backend/server.py resolves it into `canvas_dims`,
 * frontend/src/pages/CreateEQEditor.jsx and every export path read
 * `proj.canvas` instead of a fixed 1080x1350 constant) — previously
 * "platform" was inert metadata with no effect on the actual output size. */

export const FORMATS = [
  { id: "linkedin", label: "LinkedIn", ratio: "4:5", w: 1080, h: 1350 },
  { id: "square", label: "Instagram Square", ratio: "1:1", w: 1080, h: 1080 },
  { id: "instagram_story", label: "Instagram Story / Reel", ratio: "9:16", w: 1080, h: 1920 },
  { id: "twitter", label: "Twitter / X", ratio: "4:5", w: 1080, h: 1350 },
];

export default function FormatPicker({ value, onChange, className = "" }) {
  const [customW, setCustomW] = useState(value.customW || 1080);
  const [customH, setCustomH] = useState(value.customH || 1350);
  const isCustom = value.platform === "custom";

  const pick = (id) => onChange({ platform: id, customW, customH });
  const applyCustom = (w, h) => { setCustomW(w); setCustomH(h); onChange({ platform: "custom", customW: w, customH: h }); };

  return (
    <div className={className}>
      <span className="text-caption text-neutral-400 block mb-1.5">Format</span>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {FORMATS.map((f) => (
          <button key={f.id} type="button" onClick={() => pick(f.id)} data-testid={`format-${f.id}`}
            className={`text-left p-2.5 rounded-xl border transition-colors ${value.platform === f.id ? "border-ink bg-ash" : "border-line hover:border-neutral-400"}`}>
            <div className="text-caption font-medium">{f.label}</div>
            <div className="text-[10px] text-neutral-400 mt-0.5 font-mono">{f.ratio} · {f.w}×{f.h}</div>
          </button>
        ))}
        <button type="button" onClick={() => applyCustom(customW, customH)} data-testid="format-custom"
          className={`text-left p-2.5 rounded-xl border transition-colors ${isCustom ? "border-ink bg-ash" : "border-line hover:border-neutral-400"}`}>
          <div className="text-caption font-medium">Custom</div>
          <div className="text-[10px] text-neutral-400 mt-0.5 font-mono">{customW}×{customH}</div>
        </button>
      </div>

      {isCustom && (
        <div className="flex items-center gap-2 mt-2 animate-fade-in">
          <label className="flex items-center gap-1.5 text-caption text-neutral-500">
            W
            <input type="number" min={320} max={2160} value={customW} data-testid="format-custom-w"
              onChange={(e) => applyCustom(Number(e.target.value) || 1080, customH)}
              className="w-20 border border-line rounded-lg px-2 py-1 text-caption font-mono" />
          </label>
          <span className="text-neutral-300">×</span>
          <label className="flex items-center gap-1.5 text-caption text-neutral-500">
            H
            <input type="number" min={320} max={2160} value={customH} data-testid="format-custom-h"
              onChange={(e) => applyCustom(customW, Number(e.target.value) || 1350)}
              className="w-20 border border-line rounded-lg px-2 py-1 text-caption font-mono" />
          </label>
          <span className="text-[10px] text-neutral-400">px, 320–2160 each side</span>
        </div>
      )}
    </div>
  );
}
