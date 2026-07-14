import { memo } from "react";
import {
  Copy, Trash2, Layers, Italic, AlignLeft, AlignCenter, AlignRight, Wand2, RotateCcw, Mountain,
  FlipHorizontal2, FlipVertical2,
  AlignStartVertical, AlignCenterVertical, AlignEndVertical,
  AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal,
  AlignHorizontalSpaceAround, AlignVerticalSpaceAround,
} from "lucide-react";
import { PALETTES, FONTS, CANVAS } from "../../lib/creqTemplates";
import PanoramaLayer from "./PanoramaLayer";
import { ICONS } from "./ElementRender";

/** Parse a number input's raw value, ignoring transient empty/invalid states
 * (e.g. while the user backspaces to type a new value) instead of committing
 * 0/NaN, which would collapse the element to zero size/position. */
function parseNumInput(raw) {
  if (raw === "") return undefined;
  const n = Number(raw);
  return Number.isNaN(n) ? undefined : n;
}

/** Inspector panel — palette / bg / element props / panorama manual pan. */
function RightPanel({
  proj, palette, slide, selected,
  activeSlide, selectedCount = 0,
  onAlign, onDeleteMulti,
  onPalette, onBg, onEditElement, onDelete, onDuplicate, onFront, onBack, onAiAssist,
  onPanoramaViewport, onPanoramaResetSlide, onPanoramaApplyAll,
  onDeckSetting,
  onGestureStart, onGestureEnd,
}) {
  const showPanoManual = proj?.panorama?.mode === "manual";
  // Bracket every edit made through this panel (slider drags, typing, and
  // discrete clicks alike) in one history "gesture" — see beginGesture() in
  // CreateEQEditor.jsx. Capture phase so it fires even for clicks on native
  // <select>/<input> children before their own handlers run.
  const gestureProps = {
    onPointerDownCapture: onGestureStart,
    onPointerUpCapture: onGestureEnd,
    onFocusCapture: onGestureStart,
    onBlurCapture: onGestureEnd,
  };

  // Multiple elements selected → alignment / distribute toolbar instead of the
  // single-element inspector (Canva/Figma behaviour).
  if (selectedCount > 1) {
    return (
      <div className="p-4 space-y-4" {...gestureProps}>
        <div className="flex items-center justify-between">
          <div className="ui-label">{selectedCount} selected</div>
          <button onClick={onDeleteMulti} title="Delete all" className="btn-ghost text-xs py-1 text-red-600"><Trash2 size={12} /></button>
        </div>
        <div>
          <div className="ui-label mb-2">Align</div>
          <div className="grid grid-cols-3 gap-1.5">
            <AlignBtn onClick={() => onAlign("left")} title="Align left" testid="align-left"><AlignStartVertical size={15} /></AlignBtn>
            <AlignBtn onClick={() => onAlign("hcenter")} title="Align center" testid="align-hcenter"><AlignCenterVertical size={15} /></AlignBtn>
            <AlignBtn onClick={() => onAlign("right")} title="Align right" testid="align-right"><AlignEndVertical size={15} /></AlignBtn>
            <AlignBtn onClick={() => onAlign("top")} title="Align top" testid="align-top"><AlignStartHorizontal size={15} /></AlignBtn>
            <AlignBtn onClick={() => onAlign("vcenter")} title="Align middle" testid="align-vcenter"><AlignCenterHorizontal size={15} /></AlignBtn>
            <AlignBtn onClick={() => onAlign("bottom")} title="Align bottom" testid="align-bottom"><AlignEndHorizontal size={15} /></AlignBtn>
          </div>
        </div>
        {selectedCount > 2 && (
          <div>
            <div className="ui-label mb-2">Distribute</div>
            <div className="grid grid-cols-2 gap-1.5">
              <AlignBtn onClick={() => onAlign("dist-h")} title="Distribute horizontally" testid="dist-h"><AlignHorizontalSpaceAround size={15} /></AlignBtn>
              <AlignBtn onClick={() => onAlign("dist-v")} title="Distribute vertically" testid="dist-v"><AlignVerticalSpaceAround size={15} /></AlignBtn>
            </div>
          </div>
        )}
        <div className="text-[11px] text-neutral-400 pt-2 border-t border-line leading-relaxed">
          Drag any selected element to move the group · arrow keys to nudge · shift-click to add or remove.
        </div>
      </div>
    );
  }

  if (!selected) {
    return (
      <div className="p-4 space-y-5" {...gestureProps}>
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

        <div className="border-t border-line pt-4">
          <div className="ui-label mb-2">Deck chrome</div>
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={!!proj?.show_slide_numbers} data-testid="deck-slide-numbers"
                onChange={(e) => onDeckSetting("show_slide_numbers", e.target.checked)} />
              Slide numbers (1/6)
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={!!proj?.show_progress_dots} data-testid="deck-progress-dots"
                onChange={(e) => onDeckSetting("show_progress_dots", e.target.checked)} />
              Progress dots
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={!!proj?.show_swipe_hint} data-testid="deck-swipe-hint"
                onChange={(e) => onDeckSetting("show_swipe_hint", e.target.checked)} />
              Swipe hint arrow
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={!!proj?.show_branding} data-testid="deck-branding"
                onChange={(e) => onDeckSetting("show_branding", e.target.checked)} />
              &quot;Made with Innoira Agentic Suite&quot;
            </label>
          </div>
        </div>

        <div className="text-xs text-neutral-500 pt-4 border-t border-line">Click an element on the canvas to edit it. Drag to move. Press <span className="kbd">Del</span> to remove.</div>
      </div>
    );
  }

  const el = selected;
  const isText = el.type === "text";
  const isShape = el.type === "shape";
  const isBadge = el.type === "badge";
  const isIcon = el.type === "icon";
  const isImage = el.type === "image";
  const isLine = el.type === "line";
  // Shadow controls apply the same way to shapes/images/badges; text has its
  // own richer effects block (shares the shadow fields, plus stroke).
  const hasBoxShadow = isShape || isImage || isBadge;

  return (
    <div className="p-4 space-y-4" {...gestureProps}>
      <div className="flex items-center justify-between">
        <div className="ui-label">Element · {el.type}</div>
        <div className="flex gap-1">
          <button onClick={onFront} title="Bring to front" className="btn-ghost text-xs py-1"><Layers size={12} /></button>
          <button onClick={onDuplicate} title="Duplicate" className="btn-ghost text-xs py-1"><Copy size={12} /></button>
          <button onClick={onDelete} title="Delete" className="btn-ghost text-xs py-1 text-red-600"><Trash2 size={12} /></button>
        </div>
      </div>

      {/* Precise position & size — matches every design tool's inspector. */}
      <div className="grid grid-cols-4 gap-1.5">
        <PosInput label="X" value={el.x} onChange={(v) => onEditElement({ x: v })} testid="el-pos-x" />
        <PosInput label="Y" value={el.y} onChange={(v) => onEditElement({ y: v })} testid="el-pos-y" />
        <PosInput label="W" value={el.w} onChange={(v) => onEditElement({ w: Math.max(4, v) })} testid="el-pos-w" disabled={isLine || isIcon} />
        <PosInput label="H" value={el.h} onChange={(v) => onEditElement({ h: Math.max(4, v) })} testid="el-pos-h" disabled={isLine || isIcon} />
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
              <input type="number" min={10} max={400} value={el.size} onChange={(e) => { const n = parseNumInput(e.target.value); if (n !== undefined) onEditElement({ size: n }); }} className="mt-1 w-full border border-line rounded-full px-3 py-2 text-sm font-mono" /></label>
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

          <label className="flex items-center gap-2 text-xs pt-1">
            <input type="checkbox" checked={!!el.highlight} data-testid="el-highlight-toggle"
              onChange={(e) => onEditElement({ highlight: e.target.checked ? (el.highlight || "accent") : null })} />
            Text highlight
          </label>
          {el.highlight && (
            <ColorPicker label="Highlight color" palette={palette} value={el.highlight} onChange={(c) => onEditElement({ highlight: c })} />
          )}

          <details className="pt-2 border-t border-line">
            <summary className="ui-label cursor-pointer">Effects (shadow · stroke)</summary>
            <div className="mt-2 space-y-2">
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={!!el.shadow} onChange={(e) => onEditElement({ shadow: e.target.checked })} data-testid="el-shadow" />
                Drop shadow
              </label>
              {el.shadow && (
                <>
                  <label className="block text-xs"><span className="ui-label">Shadow X</span>
                    <input type="range" min={-20} max={20} value={el.shadow_x || 0} onChange={(e) => onEditElement({ shadow_x: Number(e.target.value) })} className="w-full" /></label>
                  <label className="block text-xs"><span className="ui-label">Shadow Y</span>
                    <input type="range" min={-20} max={40} value={el.shadow_y ?? 4} onChange={(e) => onEditElement({ shadow_y: Number(e.target.value) })} className="w-full" /></label>
                  <label className="block text-xs"><span className="ui-label">Shadow blur</span>
                    <input type="range" min={0} max={40} value={el.shadow_blur ?? 12} onChange={(e) => onEditElement({ shadow_blur: Number(e.target.value) })} className="w-full" /></label>
                  <ColorPicker label="Shadow color" palette={palette} value={el.shadow_color || "text"} onChange={(c) => onEditElement({ shadow_color: c })} />
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

      {isLine && (
        <>
          <ColorPicker label="Color" palette={palette} value={el.color || "text"} onChange={(c) => onEditElement({ color: c })} />
          <label className="block"><span className="ui-label">Thickness</span>
            <input type="range" min={2} max={40} value={el.h || 4} onChange={(e) => onEditElement({ h: Number(e.target.value) })} className="w-full" />
          </label>
        </>
      )}

      {(isShape || isBadge) && (
        <>
          {isBadge && (
            <input value={el.text || ""} onChange={(e) => onEditElement({ text: e.target.value })} placeholder="Badge text"
              className="w-full border border-line rounded-full px-3 py-2 text-sm" />
          )}
          {isShape && (
            <div className="flex gap-2">
              {[["fill", "Filled"], ["outline", "Outline"]].map(([k, l]) => (
                <button key={k} onClick={() => onEditElement({ stroke_only: k === "outline" })}
                  className={`flex-1 py-2 rounded-full text-xs border ${(!!el.stroke_only) === (k === "outline") ? "border-ink bg-ink text-white" : "border-line hover:border-ink"}`}>
                  {l}
                </button>
              ))}
            </div>
          )}
          {(!isShape || !el.stroke_only) && (
            <ColorPicker label={isBadge ? "Background" : "Fill"} palette={palette} value={el.fill || el.bg} onChange={(c) => onEditElement(isBadge ? { bg: c } : { fill: c })} />
          )}
          {isBadge && <ColorPicker label="Text color" palette={palette} value={el.color} onChange={(c) => onEditElement({ color: c })} />}
          {isShape && el.stroke_only && (
            <>
              <ColorPicker label="Border color" palette={palette} value={el.border_color || el.fill || "text"} onChange={(c) => onEditElement({ border_color: c })} />
              <label className="block"><span className="ui-label">Border width</span>
                <input type="range" min={1} max={20} value={el.border_w || 3} onChange={(e) => onEditElement({ border_w: Number(e.target.value) })} className="w-full" />
              </label>
            </>
          )}
          <label className="block"><span className="ui-label">Corner radius</span>
            <input type="range" min={0} max={200} value={el.radius || 0} onChange={(e) => onEditElement({ radius: Number(e.target.value) })} className="w-full" />
          </label>
        </>
      )}

      {isIcon && (
        <>
          <ColorPicker label="Color" palette={palette} value={el.color} onChange={(c) => onEditElement({ color: c })} />
          <label className="block"><span className="ui-label">Size</span>
            <input type="number" min={20} max={400} value={el.w} onChange={(e) => { const n = parseNumInput(e.target.value); if (n !== undefined) onEditElement({ w: n }); }} className="mt-1 w-full border border-line rounded-full px-3 py-2 text-sm font-mono" /></label>
          <label className="block"><span className="ui-label">Stroke width</span>
            <input type="range" min={1} max={4} step={0.5} value={el.stroke || 2} onChange={(e) => onEditElement({ stroke: Number(e.target.value) })} className="w-full" />
          </label>
          <div>
            <div className="ui-label mb-1">Swap icon</div>
            <div className="grid grid-cols-6 gap-1">
              {Object.keys(ICONS).map((name) => {
                const IC = ICONS[name];
                return (
                  <button key={name} onClick={() => onEditElement({ name })} title={name}
                    className={`aspect-square rounded-md border flex items-center justify-center ${el.name === name ? "border-ink bg-neutral-50" : "border-line hover:border-ink"}`}>
                    <IC size={14} />
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {isImage && (
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
          <div className="flex gap-1">
            <ToggleBtn active={el.flip_h} onClick={() => onEditElement({ flip_h: !el.flip_h })}><FlipHorizontal2 size={13} /></ToggleBtn>
            <ToggleBtn active={el.flip_v} onClick={() => onEditElement({ flip_v: !el.flip_v })}><FlipVertical2 size={13} /></ToggleBtn>
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={el.role === "logo"} data-testid="el-treat-as-logo"
              onChange={(e) => onEditElement({ role: e.target.checked ? "logo" : null })} />
            Treat as logo (transparent background, no crop tint)
          </label>
        </>
      )}

      {hasBoxShadow && (
        <details className="pt-2 border-t border-line">
          <summary className="ui-label cursor-pointer">Shadow</summary>
          <div className="mt-2 space-y-2">
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={!!el.shadow} data-testid="el-box-shadow" onChange={(e) => onEditElement({ shadow: e.target.checked })} />
              Drop shadow
            </label>
            {el.shadow && (
              <>
                <label className="block text-xs"><span className="ui-label">Shadow X</span>
                  <input type="range" min={-20} max={20} value={el.shadow_x || 0} onChange={(e) => onEditElement({ shadow_x: Number(e.target.value) })} className="w-full" /></label>
                <label className="block text-xs"><span className="ui-label">Shadow Y</span>
                  <input type="range" min={-20} max={40} value={el.shadow_y ?? 4} onChange={(e) => onEditElement({ shadow_y: Number(e.target.value) })} className="w-full" /></label>
                <label className="block text-xs"><span className="ui-label">Shadow blur</span>
                  <input type="range" min={0} max={40} value={el.shadow_blur ?? 12} onChange={(e) => onEditElement({ shadow_blur: Number(e.target.value) })} className="w-full" /></label>
              </>
            )}
          </div>
        </details>
      )}

      <div className="pt-3 border-t border-line space-y-2">
        <label className="block"><span className="ui-label">Rotation</span>
          <input type="range" min={-180} max={180} value={el.rotate || 0} data-testid="el-rotate"
            onChange={(e) => onEditElement({ rotate: Number(e.target.value) })} className="w-full" />
        </label>
        <label className="block"><span className="ui-label">Opacity</span>
          <input type="range" min={0.05} max={1} step={0.05} value={el.opacity ?? 1} data-testid="el-opacity"
            onChange={(e) => onEditElement({ opacity: Number(e.target.value) })} className="w-full" />
        </label>
      </div>

      <div className="pt-3 border-t border-line grid grid-cols-4 gap-1 text-[10px] text-neutral-500 font-mono">
        <label>X<input type="number" value={el.x || 0} onChange={(e) => { const n = parseNumInput(e.target.value); if (n !== undefined) onEditElement({ x: n }); }} className="w-full border border-line rounded px-1 py-0.5" /></label>
        <label>Y<input type="number" value={el.y || 0} onChange={(e) => { const n = parseNumInput(e.target.value); if (n !== undefined) onEditElement({ y: n }); }} className="w-full border border-line rounded px-1 py-0.5" /></label>
        <label>W<input type="number" value={el.w || 0} onChange={(e) => { const n = parseNumInput(e.target.value); if (n !== undefined) onEditElement({ w: n }); }} className="w-full border border-line rounded px-1 py-0.5" /></label>
        <label>H<input type="number" value={el.h || 0} onChange={(e) => { const n = parseNumInput(e.target.value); if (n !== undefined) onEditElement({ h: n }); }} className="w-full border border-line rounded px-1 py-0.5" /></label>
      </div>
    </div>
  );
}

export default memo(RightPanel);

function ToggleBtn({ children, active, onClick }) {
  return (
    <button onClick={onClick} className={`flex-1 py-1.5 rounded-md border text-xs ${active ? "bg-ink text-white border-ink" : "bg-white border-line hover:border-ink"}`}>
      {children}
    </button>
  );
}

function AlignBtn({ children, onClick, title, testid }) {
  return (
    <button onClick={onClick} title={title} data-testid={testid}
      className="flex items-center justify-center py-2 rounded-md border border-line hover:border-ink hover:bg-neutral-50 text-neutral-700">
      {children}
    </button>
  );
}

function PosInput({ label, value, onChange, testid, disabled }) {
  return (
    <label className="block">
      <span className="text-[10px] font-mono text-neutral-400 block text-center">{label}</span>
      <input type="number" value={Math.round(value ?? 0)} disabled={disabled}
        onChange={(e) => { const n = parseNumInput(e.target.value); if (n !== undefined) onChange(n); }}
        data-testid={testid}
        className="mt-0.5 w-full border border-line rounded-md px-1.5 py-1.5 text-xs font-mono text-center disabled:bg-neutral-50 disabled:text-neutral-400" />
    </label>
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
