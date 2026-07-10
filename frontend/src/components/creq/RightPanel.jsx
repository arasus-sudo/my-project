import {
  Copy, Trash2, Layers, Italic, AlignLeft, AlignCenter, AlignRight, Wand2, RotateCcw, Mountain,
} from "lucide-react";
import { PALETTES, FONTS, CANVAS } from "../../lib/creqTemplates";
import PanoramaLayer from "./PanoramaLayer";

/** Inspector panel — palette / bg / element props / panorama manual pan. */
export default function RightPanel({
  proj, palette, slide, selected,
  activeSlide,
  onPalette, onBg, onEditElement, onDelete, onDuplicate, onFront, onBack, onAiAssist,
  onPanoramaViewport, onPanoramaResetSlide, onPanoramaApplyAll,
}) {
  const showPanoManual = proj?.panorama?.mode === "manual";

  if (!selected) {
    return (
      <div className="p-4 space-y-5">
        <div>
          <div className="ui-label mb-2">Palette</div>
          <div className="grid grid-cols-2 gap-2">
            {PALETTES.map((p) => (
              <button key={p.id} onClick={() => onPalette(p.id)} data-testid={`palette-${p.id}`}
                className={`text-left p-2 rounded-lg border ${p.id === palette.id ? "border-ink" : "border-line"}`}>
                <div className="flex gap-1">
                  {[p.bg, p.bg2, p.accent, p.text].map((c, i) => <span key={`${c}-${i}`} className="w-4 h-4 rounded" style={{ background: c }} />)}
                </div>
                <div className="text-[11px] mt-1">{p.name}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="ui-label mb-2">Background</div>
          <div className="flex gap-2">
            {["solid", "gradient"].map((t) => (
              <button key={t} onClick={() => onBg({ ...slide.bg, type: t })}
                className={`flex-1 py-2 rounded-full text-xs border ${slide.bg?.type === t ? "border-ink bg-ink text-white" : "border-line hover:border-ink"}`}>
                {t}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-2 mt-3">
            {["bg", "bg2", "accent", "text", "muted"].map((k) => (
              <button key={k} onClick={() => onBg({ ...slide.bg, color: k })}
                className={`aspect-square rounded-md border ${slide.bg?.color === k ? "border-ink" : "border-line"}`}
                style={{ background: palette[k] }} title={k} />
            ))}
          </div>
          {slide.bg?.type === "gradient" && (
            <div className="mt-3">
              <div className="ui-label">Gradient stop 2</div>
              <div className="grid grid-cols-4 gap-2 mt-1">
                {["bg", "bg2", "accent", "text", "muted"].map((k) => (
                  <button key={k} onClick={() => onBg({ ...slide.bg, color2: k })}
                    className={`aspect-square rounded-md border ${slide.bg?.color2 === k ? "border-ink" : "border-line"}`}
                    style={{ background: palette[k] }} title={k} />
                ))}
              </div>
              <label className="block mt-2">
                <span className="ui-label">Angle</span>
                <input type="range" min={0} max={360} value={slide.bg?.angle || 145} onChange={(e) => onBg({ ...slide.bg, angle: Number(e.target.value) })} className="w-full" />
              </label>
            </div>
          )}
        </div>

        {showPanoManual && (
          <PanoramaManualControls
            proj={proj} palette={palette} activeSlide={activeSlide}
            onChange={onPanoramaViewport}
            onReset={onPanoramaResetSlide}
            onApplyAll={onPanoramaApplyAll}
          />
        )}

        <div className="text-xs text-neutral-500 pt-4 border-t border-line">Click an element on the canvas to edit it. Drag to move. Press <span className="kbd">Del</span> to remove.</div>
      </div>
    );
  }

  const el = selected;
  const isText = el.type === "text";
  const isShape = el.type === "shape";
  const isBadge = el.type === "badge";
  const isIcon = el.type === "icon";

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="ui-label">Element · {el.type}</div>
        <div className="flex gap-1">
          <button onClick={onFront} title="Bring to front" className="btn-ghost text-xs py-1"><Layers size={12} /></button>
          <button onClick={onDuplicate} title="Duplicate" className="btn-ghost text-xs py-1"><Copy size={12} /></button>
          <button onClick={onDelete} title="Delete" className="btn-ghost text-xs py-1 text-red-600"><Trash2 size={12} /></button>
        </div>
      </div>

      {isText && (
        <>
          <textarea value={el.text} onChange={(e) => onEditElement({ text: e.target.value })}
            rows={4} data-testid="el-text"
            className="w-full border border-line rounded-lg p-2 text-sm focus:outline-none focus:border-ink" />
          <label className="block">
            <span className="ui-label">Font</span>
            <select value={el.font} onChange={(e) => onEditElement({ font: e.target.value })} data-testid="el-font"
              className="mt-1 w-full border border-line rounded-full px-3 py-2 bg-white text-sm">
              {FONTS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block"><span className="ui-label">Size</span>
              <input type="number" min={10} max={400} value={el.size} onChange={(e) => onEditElement({ size: Number(e.target.value) })} className="mt-1 w-full border border-line rounded-full px-3 py-2 text-sm font-mono" /></label>
            <label className="block"><span className="ui-label">Weight</span>
              <select value={el.weight} onChange={(e) => onEditElement({ weight: Number(e.target.value) })} className="mt-1 w-full border border-line rounded-full px-3 py-2 bg-white text-sm">
                {[300,400,500,600,700,800,900].map((w) => <option key={w} value={w}>{w}</option>)}
              </select></label>
          </div>
          <div className="flex gap-1">
            <ToggleBtn active={el.italic} onClick={() => onEditElement({ italic: !el.italic })}><Italic size={13} /></ToggleBtn>
            <ToggleBtn active={el.uppercase} onClick={() => onEditElement({ uppercase: !el.uppercase })}>ABC</ToggleBtn>
            <ToggleBtn active={el.align === "left"} onClick={() => onEditElement({ align: "left" })}><AlignLeft size={13} /></ToggleBtn>
            <ToggleBtn active={el.align === "center"} onClick={() => onEditElement({ align: "center" })}><AlignCenter size={13} /></ToggleBtn>
            <ToggleBtn active={el.align === "right"} onClick={() => onEditElement({ align: "right" })}><AlignRight size={13} /></ToggleBtn>
          </div>
          <label className="block"><span className="ui-label">Letter spacing</span>
            <input type="range" min={-0.05} max={0.3} step={0.01} value={el.letter_spacing || 0} onChange={(e) => onEditElement({ letter_spacing: Number(e.target.value) })} className="w-full" />
          </label>
          <label className="block"><span className="ui-label">Line height</span>
            <input type="range" min={0.9} max={2} step={0.05} value={el.line_height || 1.2} onChange={(e) => onEditElement({ line_height: Number(e.target.value) })} className="w-full" />
          </label>
          <ColorPicker label="Color" palette={palette} value={el.color} onChange={(c) => onEditElement({ color: c })} />

          <details className="pt-2 border-t border-line">
            <summary className="ui-label cursor-pointer">Effects (shadow · stroke)</summary>
            <div className="mt-2 space-y-2">
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={!!el.shadow} onChange={(e) => onEditElement({ shadow: e.target.checked })} data-testid="el-shadow" />
                Drop shadow
              </label>
              {el.shadow && (
                <>
                  <label className="block text-xs"><span className="ui-label">Shadow blur</span>
                    <input type="range" min={0} max={40} value={el.shadow_blur ?? 12} onChange={(e) => onEditElement({ shadow_blur: Number(e.target.value) })} className="w-full" /></label>
                  <label className="block text-xs"><span className="ui-label">Shadow Y</span>
                    <input type="range" min={-20} max={40} value={el.shadow_y ?? 4} onChange={(e) => onEditElement({ shadow_y: Number(e.target.value) })} className="w-full" /></label>
                </>
              )}
              <label className="block text-xs"><span className="ui-label">Stroke width</span>
                <input type="range" min={0} max={8} value={el.stroke_w || 0} onChange={(e) => onEditElement({ stroke_w: Number(e.target.value) })} className="w-full" /></label>
              {el.stroke_w > 0 && <ColorPicker label="Stroke color" palette={palette} value={el.stroke_color || "bg"} onChange={(c) => onEditElement({ stroke_color: c })} />}
            </div>
          </details>

          {onAiAssist && (
            <div className="pt-3 border-t border-line">
              <div className="ui-label mb-2 flex items-center gap-1"><Wand2 size={11} /> AI copy assist</div>
              <div className="grid grid-cols-2 gap-1">
                {[["punchier","Punchier"],["shorter","Shorter"],["catchier","Hook it"],["formal","Formal"]].map(([k,l]) => (
                  <button key={k} onClick={() => onAiAssist(k)} data-testid={`ai-assist-${k}`}
                    className="text-xs py-1.5 rounded-md border border-line hover:border-ink hover:bg-neutral-50">{l}</button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {(isShape || isBadge) && (
        <>
          {isBadge && (
            <input value={el.text || ""} onChange={(e) => onEditElement({ text: e.target.value })} placeholder="Badge text"
              className="w-full border border-line rounded-full px-3 py-2 text-sm" />
          )}
          <ColorPicker label={isBadge ? "Background" : "Fill"} palette={palette} value={el.fill || el.bg} onChange={(c) => onEditElement(isBadge ? { bg: c } : { fill: c })} />
          {isBadge && <ColorPicker label="Text color" palette={palette} value={el.color} onChange={(c) => onEditElement({ color: c })} />}
          <label className="block"><span className="ui-label">Corner radius</span>
            <input type="range" min={0} max={200} value={el.radius || 0} onChange={(e) => onEditElement({ radius: Number(e.target.value) })} className="w-full" />
          </label>
          {isShape && (
            <label className="block"><span className="ui-label">Opacity</span>
              <input type="range" min={0.1} max={1} step={0.05} value={el.opacity ?? 1} onChange={(e) => onEditElement({ opacity: Number(e.target.value) })} className="w-full" />
            </label>
          )}
        </>
      )}

      {isIcon && (
        <>
          <ColorPicker label="Color" palette={palette} value={el.color} onChange={(c) => onEditElement({ color: c })} />
          <label className="block"><span className="ui-label">Size</span>
            <input type="number" min={20} max={400} value={el.w} onChange={(e) => onEditElement({ w: Number(e.target.value) })} className="mt-1 w-full border border-line rounded-full px-3 py-2 text-sm font-mono" /></label>
          <label className="block"><span className="ui-label">Stroke width</span>
            <input type="range" min={1} max={4} step={0.5} value={el.stroke || 2} onChange={(e) => onEditElement({ stroke: Number(e.target.value) })} className="w-full" />
          </label>
        </>
      )}

      {el.type === "image" && (
        <>
          <input value={el.src || ""} onChange={(e) => onEditElement({ src: e.target.value })} data-testid="el-image-src"
            placeholder="Image URL (PNG/JPG/SVG)"
            className="w-full border border-line rounded-full px-3 py-2 text-sm font-mono" />
          <label className="block"><span className="ui-label">Fit</span>
            <select value={el.fit || "cover"} onChange={(e) => onEditElement({ fit: e.target.value })} data-testid="el-image-fit"
              className="mt-1 w-full border border-line rounded-full px-3 py-2 bg-white text-sm">
              <option value="cover">Cover</option>
              <option value="contain">Contain</option>
              <option value="fill">Fill / stretch</option>
            </select>
          </label>
          <label className="block"><span className="ui-label">Corner radius</span>
            <input type="range" min={0} max={480} value={el.radius || 0} onChange={(e) => onEditElement({ radius: Number(e.target.value) })} className="w-full" />
          </label>
        </>
      )}

      <div className="pt-3 border-t border-line grid grid-cols-4 gap-1 text-[10px] text-neutral-500 font-mono">
        <label>X<input type="number" value={el.x || 0} onChange={(e) => onEditElement({ x: Number(e.target.value) })} className="w-full border border-line rounded px-1 py-0.5" /></label>
        <label>Y<input type="number" value={el.y || 0} onChange={(e) => onEditElement({ y: Number(e.target.value) })} className="w-full border border-line rounded px-1 py-0.5" /></label>
        <label>W<input type="number" value={el.w || 0} onChange={(e) => onEditElement({ w: Number(e.target.value) })} className="w-full border border-line rounded px-1 py-0.5" /></label>
        <label>H<input type="number" value={el.h || 0} onChange={(e) => onEditElement({ h: Number(e.target.value) })} className="w-full border border-line rounded px-1 py-0.5" /></label>
      </div>
    </div>
  );
}

function ToggleBtn({ children, active, onClick }) {
  return (
    <button onClick={onClick} className={`flex-1 py-1.5 rounded-md border text-xs ${active ? "bg-ink text-white border-ink" : "bg-white border-line hover:border-ink"}`}>
      {children}
    </button>
  );
}

function ColorPicker({ label, palette, value, onChange }) {
  const keys = ["bg", "bg2", "accent", "text", "muted"];
  return (
    <div>
      <div className="ui-label">{label}</div>
      <div className="grid grid-cols-5 gap-1 mt-1">
        {keys.map((k) => (
          <button key={k} onClick={() => onChange(k)}
            className={`aspect-square rounded-md border ${value === k ? "border-ink ring-2 ring-ink/30" : "border-line"}`}
            style={{ background: palette[k] }} title={k} />
        ))}
      </div>
      <input type="color" value={value?.startsWith?.("#") ? value : "#000000"} onChange={(e) => onChange(e.target.value)}
        className="w-full h-8 mt-2 border border-line rounded-md cursor-pointer" title="Or pick any hex" />
    </div>
  );
}

/* --- Manual-mode panorama pan controls ------------------------------------ */

function PanoramaManualControls({ proj, palette, activeSlide, onChange, onReset, onApplyAll }) {
  const vp = (proj.panorama?.viewports || [])[activeSlide] || { ox: 50, oy: 50, scale: 1 };

  return (
    <div className="border-t border-line pt-4 space-y-3" data-testid="panorama-manual-controls">
      <div className="flex items-center gap-2">
        <Mountain size={13} />
        <div className="ui-label m-0">Panorama · slide {activeSlide + 1}</div>
      </div>

      {/* live preview thumbnail (1/8 scale) */}
      <div className="relative w-full aspect-[4/5] rounded-md overflow-hidden border border-line bg-neutral-100">
        <div style={{ position: "absolute", inset: 0, transform: "scale(0.125)", transformOrigin: "top left", width: 1080, height: 1350 }}>
          <PanoramaLayer panorama={proj.panorama} slideIdx={activeSlide} totalSlides={proj.slides.length} />
        </div>
      </div>

      <label className="block">
        <div className="flex justify-between items-baseline">
          <span className="ui-label">Horizontal</span>
          <span className="text-[10px] font-mono text-neutral-500">{Math.round(vp.ox ?? 50)}%</span>
        </div>
        <input type="range" min={0} max={100} step={1} value={vp.ox ?? 50}
          data-testid="pano-ox"
          onChange={(e) => onChange({ ...vp, ox: Number(e.target.value) })}
          className="w-full" />
      </label>

      <label className="block">
        <div className="flex justify-between items-baseline">
          <span className="ui-label">Vertical</span>
          <span className="text-[10px] font-mono text-neutral-500">{Math.round(vp.oy ?? 50)}%</span>
        </div>
        <input type="range" min={0} max={100} step={1} value={vp.oy ?? 50}
          data-testid="pano-oy"
          onChange={(e) => onChange({ ...vp, oy: Number(e.target.value) })}
          className="w-full" />
      </label>

      <label className="block">
        <div className="flex justify-between items-baseline">
          <span className="ui-label">Zoom</span>
          <span className="text-[10px] font-mono text-neutral-500">{Math.round((vp.scale ?? 1) * 100)}%</span>
        </div>
        <input type="range" min={1} max={3} step={0.05} value={vp.scale ?? 1}
          data-testid="pano-scale"
          onChange={(e) => onChange({ ...vp, scale: Number(e.target.value) })}
          className="w-full" />
      </label>

      <div className="grid grid-cols-2 gap-2 pt-1">
        <button onClick={onReset} data-testid="pano-reset-slide"
          className="text-[11px] py-1.5 rounded-full border border-line hover:border-ink flex items-center justify-center gap-1">
          <RotateCcw size={11} /> Reset slide
        </button>
        <button onClick={onApplyAll} data-testid="pano-apply-all"
          className="text-[11px] py-1.5 rounded-full border border-ink bg-ink text-white hover:bg-neutral-800">
          Apply to all
        </button>
      </div>
      <div className="text-[10px] text-neutral-500 leading-relaxed">
        Tip: you can also drag directly on the canvas to reposition. Scroll on the canvas to zoom.
      </div>
    </div>
  );
}
