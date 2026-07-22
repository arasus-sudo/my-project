import { memo, useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  Copy, Trash2, Layers, Italic, AlignLeft, AlignCenter, AlignRight, PenLine, RotateCcw, Mountain,
  FlipHorizontal2, FlipVertical2,
  AlignStartVertical, AlignCenterVertical, AlignEndVertical,
  AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal,
  AlignHorizontalSpaceAround, AlignVerticalSpaceAround, Plus,
} from "lucide-react";
import { PALETTES, CANVAS, resolveColor } from "../../lib/creqTemplates";
import { IMAGE_FRAMES, FRAME_CATEGORIES, DECORATIVE_CATEGORIES } from "../../lib/creqDesignEngine";
import { IMAGE_EFFECTS } from "../../lib/creqCharts";
import PanoramaLayer from "./PanoramaLayer";
import { ICONS } from "./ElementRender";
import GoogleFontPicker from "./GoogleFontPicker";

/** Load custom palettes from localStorage, falling back to empty. */
function loadCustomPalettes() {
  try { return JSON.parse(localStorage.getItem("creq_custom_palettes") || "[]"); } catch { return []; }
}
function saveCustomPalettes(pals) {
  localStorage.setItem("creq_custom_palettes", JSON.stringify(pals));
}

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
  onPalette, onBg, onEditElement, onDelete, onDuplicate, onFront, onBack, onForward, onBackward, onAiAssist,
  onPanoramaViewport, onPanoramaResetSlide, onPanoramaApplyAll,
  onDeckSetting,
  onGestureStart, onGestureEnd, onGroup, onUngroup,
}) {
  const showPanoManual = proj?.panorama?.mode === "manual";
  const imageInputRef = useRef(null);
  const [customPalettes, setCustomPalettes] = useState(loadCustomPalettes);
  const [editingPalette, setEditingPalette] = useState(null);
  useEffect(() => { saveCustomPalettes(customPalettes); }, [customPalettes]);
  const allPalettes = [...PALETTES, ...customPalettes];
  const createCustomPalette = () => {
    const np = { id: `custom-${Date.now()}`, name: "Custom", bg: "#FFFFFF", bg2: "#F4F4F5", accent: "#000000", text: "#000000", muted: "#71717A" };
    setCustomPalettes((p) => [...p, np]);
    setEditingPalette(np.id);
  };
  const updateCustomPalette = (id, field, value) => {
    setCustomPalettes((pals) => pals.map((p) => p.id === id ? { ...p, [field]: value } : p));
  };
  const deleteCustomPalette = (id) => {
    setCustomPalettes((pals) => pals.filter((p) => p.id !== id));
  };
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
          <div className="flex gap-1">
            <button onClick={onGroup} title="Group elements" className="btn-ghost text-xs py-1"><Layers size={12} /></button>
            <button onClick={onUngroup} title="Ungroup" className="btn-ghost text-xs py-1"><Layers size={12} /></button>
            <button onClick={onDeleteMulti} title="Delete all" className="btn-ghost text-xs py-1 text-danger"><Trash2 size={12} /></button>
          </div>
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
        <div className="text-tiny text-ink-muted pt-2 border-t border-line leading-relaxed">
          Drag any selected element to move the group · arrow keys to nudge · shift-click to add or remove.
        </div>
      </div>
    );
  }

  if (!selected) {
    return (
      <div className="p-4 space-y-5" {...gestureProps}>
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="ui-label">Palette</span>
            <button onClick={createCustomPalette} title="Create custom palette"
              className="ml-auto btn-ghost text-xs py-0.5 px-1.5"><Plus size={10} /> New</button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {allPalettes.map((p) => (
              <div key={p.id} className={`relative rounded-lg border ${p.id === palette.id ? "border-ink" : "border-line"}`}>
                <button onClick={() => onPalette(p.id)} data-testid={`palette-${p.id}`}
                  className="w-full text-left p-2">
                  <div className="flex gap-1">
                    {[p.bg, p.bg2, p.accent, p.text].map((c, i) => <span key={`${c}-${i}`} className="w-4 h-4 rounded" style={{ background: c }} />)}
                  </div>
                  <div className="text-tiny text-ink-secondary mt-1">{p.name}</div>
                </button>
                {editingPalette === p.id && (
                  <div className="p-2 border-t border-line space-y-1.5">
                    <input value={p.name} onChange={(e) => updateCustomPalette(p.id, "name", e.target.value)}
                      placeholder="Name" className="w-full border border-line rounded px-2 py-1 text-tiny" />
                    {["bg", "bg2", "accent", "text", "muted"].map((k) => (
                      <div key={k} className="flex items-center gap-2">
                        <span className="text-tiny font-mono text-ink-muted w-10">{k}</span>
                        <input type="color" value={p[k] || "#000000"}
                          onChange={(e) => updateCustomPalette(p.id, k, e.target.value)}
                          className="w-8 h-6 rounded border border-line cursor-pointer" />
                        <input value={p[k] || ""}
                          onChange={(e) => updateCustomPalette(p.id, k, e.target.value)}
                          className="flex-1 border border-line rounded px-1 py-0.5 text-tiny font-mono" />
                      </div>
                    ))}
                    <button onClick={() => deleteCustomPalette(p.id)}
                      className="mt-1 text-tiny text-danger hover:underline">Delete palette</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="ui-label mb-2">Background</div>
          <div className="flex gap-2">
            {["solid", "gradient"].map((t) => (
              <button key={t} onClick={() => onBg({ ...slide.bg, type: t })}
                className={`flex-1 py-2 rounded-full text-caption border ${slide.bg?.type === t ? "border-ink bg-ink text-white" : "border-line hover:border-ink"}`}>
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
          <div className="mt-3 pt-2 border-t border-line">
            <div className="flex items-center gap-2 mb-1">
              <span className="ui-label">Background image</span>
              {slide.bg_img && (
                <button onClick={() => onBg({ ...slide.bg, bg_img: null, bg_img_opacity: undefined })}
                  className="ml-auto text-tiny text-danger hover:underline">Remove</button>
              )}
            </div>
            <input value={slide.bg_img || ""} onChange={(e) => onBg({ ...slide.bg, bg_img: e.target.value })}
              placeholder="Paste image URL for background"
              className="w-full border border-line rounded-full px-3 py-2 text-caption font-mono" />
            {slide.bg_img && (
              <div className="mt-2">
                <div className="flex justify-between items-baseline">
                  <span className="ui-label">Opacity</span>
                  <span className="text-tiny font-mono text-ink-muted">{Math.round((slide.bg_img_opacity ?? 0.3) * 100)}%</span>
                </div>
                <input type="range" min={0.05} max={1} step={0.05} value={slide.bg_img_opacity ?? 0.3}
                  onChange={(e) => onBg({ ...slide.bg, bg_img_opacity: Number(e.target.value) })}
                  className="w-full" />
              </div>
            )}
            <div className="text-tiny text-ink-muted mt-1">Images are layered over the background color</div>
          </div>

          {slide.bg?.type === "gradient" && (
            <div className="mt-3 space-y-2">
              <div className="ui-label">Gradient stops</div>
              <div className="flex gap-2 items-center">
                <div className="flex-1 grid grid-cols-4 gap-1">
                  {["bg", "bg2", "accent", "text", "muted"].map((k) => (
                    <button key={k} onClick={() => onBg({ ...slide.bg, color: k })}
                      className={`aspect-square rounded-md border ${slide.bg?.color === k ? "border-ink" : "border-line"}`}
                      style={{ background: palette[k] }} title={k} />
                  ))}
                </div>
                <input type="color" value={(() => { try { return resolveColor(slide.bg?.color || "bg", palette); } catch { return "#000000"; } })()}
                  onChange={(e) => onBg({ ...slide.bg, color: e.target.value })}
                  className="w-8 h-8 rounded border border-line cursor-pointer shrink-0" title="Custom hex" />
              </div>
              <div className="flex gap-2 items-center">
                <div className="flex-1 grid grid-cols-4 gap-1">
                  {["bg", "bg2", "accent", "text", "muted"].map((k) => (
                    <button key={k} onClick={() => onBg({ ...slide.bg, color2: k })}
                      className={`aspect-square rounded-md border ${slide.bg?.color2 === k ? "border-ink" : "border-line"}`}
                      style={{ background: palette[k] }} title={k} />
                  ))}
                </div>
                <input type="color" value={(() => { try { return resolveColor(slide.bg?.color2 || "accent", palette); } catch { return "#000000"; } })()}
                  onChange={(e) => onBg({ ...slide.bg, color2: e.target.value })}
                  className="w-8 h-8 rounded border border-line cursor-pointer shrink-0" title="Custom hex" />
              </div>
              <label className="block">
                <div className="flex items-center justify-between">
                  <span className="ui-label">Direction</span>
                  <span className="text-tiny font-mono text-ink-muted">{slide.bg?.angle || 145}°</span>
                </div>
                <div className="relative mt-1">
                  <div className="w-full h-6 rounded-md border border-line overflow-hidden"
                    style={{ background: `linear-gradient(${slide.bg?.angle || 145}deg, ${resolveColor(slide.bg?.color || "bg", palette)} 0%, ${resolveColor(slide.bg?.color2 || "accent", palette)} 100%)` }} />
                  <input type="range" min={0} max={360} value={slide.bg?.angle || 145}
                    onChange={(e) => onBg({ ...slide.bg, angle: Number(e.target.value) })}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                </div>
                <div className="flex gap-1 mt-1">
                  {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
                    <button key={a} onClick={() => onBg({ ...slide.bg, angle: a })}
                      className={`flex-1 text-tiny py-1 rounded border ${(slide.bg?.angle || 145) === a ? "border-ink bg-ink text-white" : "border-line hover:border-ink"}`}>
                      {a}°
                    </button>
                  ))}
                </div>
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
            <label className="flex items-center gap-2 form-label">
              <input type="checkbox" checked={!!proj?.show_slide_numbers} data-testid="deck-slide-numbers"
                onChange={(e) => onDeckSetting("show_slide_numbers", e.target.checked)} />
              Slide numbers (1/6)
            </label>
            <label className="flex items-center gap-2 form-label">
              <input type="checkbox" checked={!!proj?.show_progress_dots} data-testid="deck-progress-dots"
                onChange={(e) => onDeckSetting("show_progress_dots", e.target.checked)} />
              Progress dots
            </label>
            <label className="flex items-center gap-2 form-label">
              <input type="checkbox" checked={!!proj?.show_swipe_hint} data-testid="deck-swipe-hint"
                onChange={(e) => onDeckSetting("show_swipe_hint", e.target.checked)} />
              Swipe hint arrow
            </label>
            <label className="flex items-center gap-2 form-label">
              <input type="checkbox" checked={!!proj?.show_branding} data-testid="deck-branding"
                onChange={(e) => onDeckSetting("show_branding", e.target.checked)} />
              &quot;Made with Innoira Agentic Suite&quot;
            </label>
          </div>
        </div>

        <div className="text-caption text-ink-muted pt-4 border-t border-line">Click an element on the canvas to edit it. Drag to move. Press <span className="kbd">Del</span> to remove.</div>
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
          <button onClick={() => onEditElement({ locked: !el.locked })} title={el.locked ? "Unlock element" : "Lock element"}
            className={`btn-ghost text-xs py-1 ${el.locked ? "text-amber-600" : ""}`}>
            {el.locked ? "🔒" : "🔓"}
          </button>
          <button onClick={onDuplicate} title="Duplicate" className="btn-ghost text-xs py-1"><Copy size={12} /></button>
          <button onClick={onDelete} title="Delete" className="btn-ghost text-xs py-1 text-danger"><Trash2 size={12} /></button>
        </div>
      </div>

      {/* Z-order — jump-to plus one-step, Canva-style */}
      <div className="flex items-center gap-1" data-testid="z-order-group">
        <span className="ui-label mr-1"><Layers size={11} className="inline -mt-0.5" /> Layer</span>
        <button onClick={onBack} data-testid="z-back" title="Send to back" className="btn-ghost text-tiny py-0.5 px-2 border border-line rounded-lg">⇤ Back</button>
        <button onClick={onBackward} data-testid="z-backward" title="Send backward one step" className="btn-ghost text-tiny py-0.5 px-2 border border-line rounded-lg">←</button>
        <button onClick={onForward} data-testid="z-forward" title="Bring forward one step" className="btn-ghost text-tiny py-0.5 px-2 border border-line rounded-lg">→</button>
        <button onClick={onFront} data-testid="z-front" title="Bring to front" className="btn-ghost text-tiny py-0.5 px-2 border border-line rounded-lg">Front ⇥</button>
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
            <GoogleFontPicker value={el.font} onChange={(font) => onEditElement({ font })} testid="el-font" />
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

          <label className="flex items-center gap-2 form-label pt-1">
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
              <label className="flex items-center gap-2 form-label">
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
              <div className="ui-label mb-2 flex items-center gap-1"><PenLine size={11} /> Copy assist</div>
              <div className="grid grid-cols-2 gap-1">
                {[["punchier","Punchier"],["shorter","Shorter"],["catchier","Hook it"],["formal","Formal"]].map(([k,l]) => (
                  <button key={k} onClick={() => onAiAssist(k)} data-testid={`ai-assist-${k}`}
                    className="text-caption py-1.5 rounded-md border border-line hover:border-ink hover:bg-neutral-50">{l}</button>
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
          <div className="grid grid-cols-2 gap-2">
            <label className="block"><span className="ui-label">Start cap</span>
              <select value={el.cap_start || "none"} onChange={(e) => onEditElement({ cap_start: e.target.value })}
                data-testid="el-cap-start" className="mt-1 w-full border border-line rounded-full px-3 py-2 bg-white text-sm">
                <option value="none">None</option>
                <option value="arrow">Arrow</option>
                <option value="dot">Dot</option>
              </select></label>
            <label className="block"><span className="ui-label">End cap</span>
              <select value={el.cap_end || "none"} onChange={(e) => onEditElement({ cap_end: e.target.value })}
                data-testid="el-cap-end" className="mt-1 w-full border border-line rounded-full px-3 py-2 bg-white text-sm">
                <option value="none">None</option>
                <option value="arrow">Arrow</option>
                <option value="dot">Dot</option>
              </select></label>
          </div>
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
                  className={`flex-1 py-2 rounded-full text-caption border ${(!!el.stroke_only) === (k === "outline") ? "border-ink bg-ink text-white" : "border-line hover:border-ink"}`}>
                  {l}
                </button>
              ))}
            </div>
          )}
          {isShape && !el.stroke_only && (
            <div className="flex gap-2">
              {[["solid", "Solid"], ["gradient", "Gradient"]].map(([k, l]) => (
                <button key={k} onClick={() => onEditElement({ fill_type: k })}
                  data-testid={`el-fill-type-${k}`}
                  className={`flex-1 py-1.5 rounded-full text-tiny border ${(el.fill_type || "solid") === k ? "border-ink bg-ink text-white" : "border-line hover:border-ink"}`}>
                  {l}
                </button>
              ))}
            </div>
          )}
          {(!isShape || !el.stroke_only) && (
            <ColorPicker label={isBadge ? "Background" : (isShape && el.fill_type === "gradient" ? "Gradient stop 1" : "Fill")} palette={palette} value={el.fill || el.bg} onChange={(c) => onEditElement(isBadge ? { bg: c } : { fill: c })} />
          )}
          {isShape && !el.stroke_only && el.fill_type === "gradient" && (
            <>
              <ColorPicker label="Gradient stop 2" palette={palette} value={el.fill2 || "accent"} onChange={(c) => onEditElement({ fill2: c })} />
              <label className="block"><span className="ui-label">Angle</span>
                <input type="range" min={0} max={360} value={el.gradient_angle ?? 145} onChange={(e) => onEditElement({ gradient_angle: Number(e.target.value) })} className="w-full" />
              </label>
            </>
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
          <div className="flex gap-2">
            <input value={el.src || ""} onChange={(e) => onEditElement({ src: e.target.value })} data-testid="el-image-src"
              placeholder="Paste image URL"
              className="flex-1 border border-line rounded-full px-3 py-2 text-sm font-mono" />
            <button onClick={() => imageInputRef.current?.click()}
              className="shrink-0 px-3 py-2 rounded-full bg-accent text-white text-caption font-medium">
              Upload
            </button>
            <input ref={imageInputRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                if (!f.type?.startsWith("image/")) { toast.error("Please pick an image file"); return; }
                if (f.size > 15 * 1024 * 1024) { toast.error("Image too large (max ~15 MB)"); return; }
                const reader = new FileReader();
                reader.onload = () => onEditElement({ src: String(reader.result || "") });
                reader.readAsDataURL(f);
                e.target.value = "";
              }} />
          </div>
          <label className="block"><span className="ui-label">Image frame</span>
              <select value={el.frame || ""} onChange={(e) => onEditElement({ frame: e.target.value || null })}
                data-testid="el-image-frame"
                className="mt-1 w-full border border-line rounded-full px-3 py-2 bg-white text-sm">
                <option value="">Rectangle (no frame)</option>
                {FRAME_CATEGORIES.map((cat) => {
                  const frames = IMAGE_FRAMES.filter((f) => f.category === cat.key);
                  if (!frames.length) return null;
                  return (
                    <optgroup key={cat.key} label={cat.label}>
                      {frames.map((f) => (
                        <option key={f.id} value={f.id}>{f.label}</option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
          </label>
          <label className="block"><span className="ui-label">Image effect</span>
            <select value={el.effect || ""} onChange={(e) => onEditElement({ effect: e.target.value || null })}
              data-testid="el-image-effect"
              className="mt-1 w-full border border-line rounded-full px-3 py-2 bg-white text-sm">
              <option value="">No effect</option>
              {IMAGE_EFFECTS.filter((e) => e.id !== "none").map((eff) => (
                <option key={eff.id} value={eff.id}>{eff.label}</option>
              ))}
            </select>
          </label>
          <div className="border-t border-line my-1.5" />
          <span className="ui-label block mb-1">Adjust</span>
          <Slider label="Brightness" value={el.filters?.brightness ?? 100} min={0} max={200} step={1}
            onChange={(v) => onEditElement({ filters: { ...el.filters, brightness: v } })} suffix="%" />
          <Slider label="Contrast" value={el.filters?.contrast ?? 100} min={0} max={200} step={1}
            onChange={(v) => onEditElement({ filters: { ...el.filters, contrast: v } })} suffix="%" />
          <Slider label="Saturation" value={el.filters?.saturate ?? 100} min={0} max={200} step={1}
            onChange={(v) => onEditElement({ filters: { ...el.filters, saturate: v } })} suffix="%" />
          <Slider label="Blur" value={el.filters?.blur ?? 0} min={0} max={10} step={0.5}
            onChange={(v) => onEditElement({ filters: { ...el.filters, blur: v } })} suffix="px" />
          <div className="border-t border-line my-1.5" />
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
          <label className="flex items-center gap-2 form-label">
            <input type="checkbox" checked={el.role === "logo"} data-testid="el-treat-as-logo"
              onChange={(e) => onEditElement({ role: e.target.checked ? "logo" : null })} />
            Treat as logo (transparent background, no crop tint)
          </label>
        </>
      )}

      {el.type === "chart" && (
        <>
          <label className="block"><span className="ui-label">Chart type</span>
            <select value={el.chart_type || "bar"} onChange={(e) => onEditElement({ chart_type: e.target.value })}
              className="mt-1 w-full border border-line rounded-full px-3 py-2 bg-white text-sm">
              <option value="bar">Bar chart</option>
              <option value="pie">Pie chart</option>
              <option value="donut">Donut chart</option>
              <option value="line">Line chart</option>
              <option value="area">Area chart</option>
              <option value="stacked-bar">Stacked bar</option>
              <option value="hbar">Horizontal bar</option>
            </select>
          </label>
          <label className="block"><span className="ui-label">Data values (comma-separated)</span>
            <input value={(el.chart_data || []).join(", ")} onChange={(e) => {
              const nums = e.target.value.split(",").map((s) => Number(s.trim())).filter((n) => !isNaN(n));
              onEditElement({ chart_data: nums.length ? nums : [1] });
            }} className="mt-1 w-full border border-line rounded-full px-3 py-2 text-sm font-mono" />
          </label>
          <label className="block"><span className="ui-label">Labels (comma-separated)</span>
            <input value={(el.chart_labels || []).join(", ")} onChange={(e) => {
              const labels = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
              onEditElement({ chart_labels: labels });
            }} className="mt-1 w-full border border-line rounded-full px-3 py-2 text-sm font-mono" />
          </label>
        </>
      )}

      {el.type === "card" && (
        <>
          <label className="block"><span className="ui-label">Card style</span>
            <select value={el.card_style || "flat"} onChange={(e) => onEditElement({ card_style: e.target.value })}
              className="mt-1 w-full border border-line rounded-full px-3 py-2 bg-white text-sm">
              <option value="flat">Flat</option>
              <option value="elevated">Elevated</option>
              <option value="outlined">Outlined</option>
              <option value="glass">Glassmorphism</option>
              <option value="bento">Bento</option>
              <option value="dashboard">Dashboard</option>
              <option value="split">Split</option>
              <option value="timeline">Timeline</option>
            </select>
          </label>
          <input value={el.title || ""} onChange={(e) => onEditElement({ title: e.target.value })}
            placeholder="Card title" className="w-full border border-line rounded-full px-3 py-2 text-sm" />
          <textarea value={el.body || ""} onChange={(e) => onEditElement({ body: e.target.value })}
            placeholder="Card body text" rows={3}
            className="w-full border border-line rounded-lg px-3 py-2 text-sm" />
          {el.card_style === "dashboard" && (
            <>
              <input value={el.metric || ""} onChange={(e) => onEditElement({ metric: e.target.value })}
                placeholder="Metric value (e.g. 99.7%)" className="w-full border border-line rounded-full px-3 py-2 text-sm" />
              <input value={el.metric_label || ""} onChange={(e) => onEditElement({ metric_label: e.target.value })}
                placeholder="Metric label" className="w-full border border-line rounded-full px-3 py-2 text-sm" />
            </>
          )}
          {el.card_style === "timeline" && (
            <input value={el.badge || ""} onChange={(e) => onEditElement({ badge: e.target.value })}
              placeholder="Badge / date" className="w-full border border-line rounded-full px-3 py-2 text-sm" />
          )}
          {el.card_style === "bento" && (
            <label className="block"><span className="ui-label">Icon</span>
              <select value={el.icon_name || "Zap"} onChange={(e) => onEditElement({ icon_name: e.target.value })}
                className="mt-1 w-full border border-line rounded-full px-3 py-2 bg-white text-sm">
                {Object.keys(ICONS).map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          )}
        </>
      )}

      {el.type === "kpi" && (
        <>
          <input value={el.kpi_value || ""} onChange={(e) => onEditElement({ kpi_value: e.target.value })}
            placeholder="Value (e.g. 86%)" className="w-full border border-line rounded-full px-3 py-2 text-sm" />
          <input value={el.kpi_label || ""} onChange={(e) => onEditElement({ kpi_label: e.target.value })}
            placeholder="Label (e.g. Conversion Rate)" className="w-full border border-line rounded-full px-3 py-2 text-sm" />
          <input value={el.kpi_change || ""} onChange={(e) => onEditElement({ kpi_change: e.target.value })}
            placeholder="Change (e.g. +12%)" className="w-full border border-line rounded-full px-3 py-2 text-sm" />
          <label className="flex items-center gap-2 form-label">
            <input type="checkbox" checked={!!el.kpi_negative} onChange={(e) => onEditElement({ kpi_negative: e.target.checked })} />
            Negative trend (red)
          </label>
        </>
      )}

      {el.type === "funnel" && (
        <>
          <label className="block"><span className="ui-label">Stage values (comma-separated)</span>
            <input value={(el.chart_data || []).join(", ")} onChange={(e) => {
              const nums = e.target.value.split(",").map((s) => Number(s.trim())).filter((n) => !isNaN(n));
              onEditElement({ chart_data: nums.length ? nums : [1] });
            }} className="mt-1 w-full border border-line rounded-full px-3 py-2 text-sm font-mono" />
          </label>
          <label className="block"><span className="ui-label">Stage labels</span>
            <input value={(el.chart_labels || []).join(", ")} onChange={(e) => {
              const labels = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
              onEditElement({ chart_labels: labels });
            }} className="mt-1 w-full border border-line rounded-full px-3 py-2 text-sm font-mono" />
          </label>
        </>
      )}

      {el.type === "timeline" && (
        <>
          <div className="ui-label mb-1">Timeline items</div>
          <textarea value={JSON.stringify(el.timeline_items || [], null, 2)}
            onChange={(e) => {
              try { const parsed = JSON.parse(e.target.value); if (Array.isArray(parsed)) onEditElement({ timeline_items: parsed }); }
              catch { /* invalid JSON — ignore during typing */ }
            }}
            rows={6} className="w-full border border-line rounded-lg px-3 py-2 text-sm font-mono" />
          <div className="text-tiny text-ink-muted">Edit as JSON array of {`{date, title, desc}`} objects</div>
        </>
      )}

      {el.type === "progress" && (
        <>
          <input value={el.label || ""} onChange={(e) => onEditElement({ label: e.target.value })}
            placeholder="Label" className="w-full border border-line rounded-full px-3 py-2 text-sm" />
          <label className="block"><span className="ui-label">Progress</span>
            <input type="range" min={0} max={100} step={1} value={el.progress ?? 65}
              onChange={(e) => onEditElement({ progress: Number(e.target.value) })} className="w-full" />
            <span className="text-tiny font-mono text-ink-muted">{Math.round(el.progress ?? 65)}%</span>
          </label>
        </>
      )}

      {el.type === "coolshape" && (
        <>
          <label className="block"><span className="ui-label">Shape category</span>
            <select value={el.shape_category || "star"} onChange={(e) => onEditElement({ shape_category: e.target.value })}
              data-testid="el-cs-category"
              className="mt-1 w-full border border-line rounded-full px-3 py-2 bg-white text-sm">
              {DECORATIVE_CATEGORIES.map((cat) => (
                <option key={cat.type} value={cat.type}>{cat.label}</option>
              ))}
            </select>
          </label>
          <label className="block"><span className="ui-label">Shape index</span>
            <input type="range" min={0} max={7} value={el.shape_index || 0} onChange={(e) => onEditElement({ shape_index: Number(e.target.value) })}
              className="w-full" />
          </label>
          <label className="block"><span className="ui-label">Size</span>
            <input type="range" min={40} max={500} value={el.size || 200} onChange={(e) => onEditElement({ size: Number(e.target.value), w: Number(e.target.value), h: Number(e.target.value) })}
              className="w-full" />
          </label>
          <ColorPicker label="Color tint" palette={palette} value={el.color || "accent"} onChange={(c) => onEditElement({ color: c })} />
          <label className="block"><span className="ui-label">Opacity</span>
            <input type="range" min={0.05} max={1} step={0.05} value={el.opacity ?? 0.3} onChange={(e) => onEditElement({ opacity: Number(e.target.value) })}
              className="w-full" />
          </label>
          <label className="flex items-center gap-2 form-label">
            <input type="checkbox" checked={el.noise !== false} data-testid="el-cs-noise"
              onChange={(e) => onEditElement({ noise: e.target.checked })} />
            Grainy gradient effect
          </label>
        </>
      )}

      {hasBoxShadow && (
        <details className="pt-2 border-t border-line">
          <summary className="ui-label cursor-pointer">Shadow</summary>
          <div className="mt-2 space-y-2">
            <label className="flex items-center gap-2 form-label">
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

      <div className="pt-3 border-t border-line grid grid-cols-4 gap-1 text-tiny text-ink-muted font-mono">
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
    <button onClick={onClick} className={`flex-1 py-1.5 rounded-md border text-caption ${active ? "bg-ink text-white border-ink" : "bg-white border-line hover:border-ink"}`}>
      {children}
    </button>
  );
}

function Slider({ label, value, min, max, step, onChange, suffix }) {
  return (
    <label className="block mb-1.5">
      <div className="flex justify-between items-baseline mb-0.5">
        <span className="text-tiny font-mono text-ink-muted">{label}</span>
        <span className="text-tiny font-mono text-ink-muted">{value}{suffix || ""}</span>
      </div>
      <input type="range" min={min} max={max} step={step || 1} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-brand" />
    </label>
  );
}

function AlignBtn({ children, onClick, title, testid }) {
  return (
    <button onClick={onClick} title={title} data-testid={testid}
      className="flex items-center justify-center py-2 rounded-md border border-line hover:border-ink hover:bg-neutral-50 text-ink-secondary">
      {children}
    </button>
  );
}

function PosInput({ label, value, onChange, testid, disabled }) {
  return (
    <label className="block">
      <span className="text-tiny font-mono text-ink-muted block text-center">{label}</span>
      <input type="number" value={Math.round(value ?? 0)} disabled={disabled}
        onChange={(e) => { const n = parseNumInput(e.target.value); if (n !== undefined) onChange(n); }}
        data-testid={testid}
        className="mt-0.5 w-full border border-line rounded-md px-1.5 py-1.5 text-caption font-mono text-center disabled:bg-neutral-50 disabled:text-ink-disabled" />
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
          <span className="text-tiny font-mono text-ink-muted">{Math.round(vp.ox ?? 50)}%</span>
        </div>
        <input type="range" min={0} max={100} step={1} value={vp.ox ?? 50}
          data-testid="pano-ox"
          onChange={(e) => onChange({ ...vp, ox: Number(e.target.value) })}
          className="w-full" />
      </label>

      <label className="block">
        <div className="flex justify-between items-baseline">
          <span className="ui-label">Vertical</span>
          <span className="text-tiny font-mono text-ink-muted">{Math.round(vp.oy ?? 50)}%</span>
        </div>
        <input type="range" min={0} max={100} step={1} value={vp.oy ?? 50}
          data-testid="pano-oy"
          onChange={(e) => onChange({ ...vp, oy: Number(e.target.value) })}
          className="w-full" />
      </label>

      <label className="block">
        <div className="flex justify-between items-baseline">
          <span className="ui-label">Zoom</span>
          <span className="text-tiny font-mono text-ink-muted">{Math.round((vp.scale ?? 1) * 100)}%</span>
        </div>
        <input type="range" min={1} max={3} step={0.05} value={vp.scale ?? 1}
          data-testid="pano-scale"
          onChange={(e) => onChange({ ...vp, scale: Number(e.target.value) })}
          className="w-full" />
      </label>

      <div className="grid grid-cols-2 gap-2 pt-1">
        <button onClick={onReset} data-testid="pano-reset-slide"
          className="text-tiny py-1.5 rounded-full border border-line hover:border-ink flex items-center justify-center gap-1">
          <RotateCcw size={11} /> Reset slide
        </button>
        <button onClick={onApplyAll} data-testid="pano-apply-all"
          className="text-tiny py-1.5 rounded-full border border-ink bg-ink text-white hover:bg-neutral-800">
          Apply to all
        </button>
      </div>
      <div className="text-tiny text-ink-muted leading-relaxed">
        Tip: you can also drag directly on the canvas to reposition. Scroll on the canvas to zoom.
      </div>
    </div>
  );
}
