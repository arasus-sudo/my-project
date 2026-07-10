import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import {
  Save, Download, Palette as PaletteIcon, ChevronLeft, Loader2, Plus, Trash2, Copy,
  Type, Square as SquareIcon, Circle as CircleIcon, Zap, Award, Star, Rocket, Sparkles,
  Layers, Bold, Italic, AlignLeft, AlignCenter, AlignRight, MessageSquare,
} from "lucide-react";
import {
  PALETTES, FONTS, TEMPLATES, CANVAS, resolveColor, blankSlide, slideFromTemplate,
} from "../lib/creqTemplates";

const ICONS = { Zap, Award, Star, Rocket, Sparkles };

function newId() { return Math.random().toString(36).slice(2, 10); }

/** Ensure every slide + element has a stable local key. */
function hydrate(project) {
  const p = { ...project };
  p.palette_id = p.palette_id || "midnight";
  p.slides = (p.slides || []).map((s) => {
    // legacy format: {title, subtitle, body, cta} → convert to element list
    if (s && !s.elements && (s.title || s.body || s.subtitle)) {
      const els = [];
      if (s.subtitle) els.push({ id: newId(), type: "text", x: 80, y: 120, w: 920, h: 60, text: s.subtitle,
        font: "JetBrains Mono", size: 24, weight: 500, uppercase: true, letter_spacing: 0.2, color: "muted", align: "left" });
      if (s.title) els.push({ id: newId(), type: "text", x: 80, y: 260, w: 920, h: 480, text: s.title,
        font: "Archivo Black", size: 132, weight: 900, color: "accent", line_height: 0.95, align: "left" });
      if (s.body) els.push({ id: newId(), type: "text", x: 80, y: 820, w: 920, h: 380, text: s.body,
        font: "Inter", size: 32, weight: 400, color: "text", line_height: 1.4, align: "left" });
      if (s.cta) els.push({ id: newId(), type: "badge", x: 80, y: 1180, text: s.cta, bg: "accent", color: "bg", radius: 999, size: 22 });
      return { _k: newId(), bg: { type: "solid", color: "bg" }, elements: els };
    }
    const s2 = { _k: s._k || newId(), bg: s.bg || { type: "solid", color: "bg" }, elements: (s.elements || []).map((e) => ({ ...e, id: e.id || newId() })) };
    return s2;
  });
  if (!p.slides.length) p.slides.push(blankSlide());
  return p;
}

function stripLocalKeys(project) {
  return {
    ...project,
    slides: project.slides.map(({ _k, ...s }) => ({ ...s, elements: (s.elements || []).map((e) => ({ ...e })) })),
  };
}

export default function CreateEQEditor() {
  const { id } = useParams();
  const nav = useNavigate();
  const [proj, setProj] = useState(null);
  const [activeSlide, setActiveSlide] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(0.38);
  const canvasRef = useRef(null);
  const dragState = useRef(null);

  useEffect(() => {
    api.get(`/carousel/${id}`).then((r) => setProj(hydrate(r.data)));
  }, [id]);

  const palette = useMemo(
    () => PALETTES.find((p) => p.id === proj?.palette_id) || PALETTES[0],
    [proj?.palette_id]
  );

  const slide = proj?.slides?.[activeSlide];
  const selected = slide?.elements?.find((e) => e.id === selectedId);

  const mutate = useCallback((updater) => {
    setProj((cur) => {
      if (!cur) return cur;
      const next = { ...cur, slides: cur.slides.map((s) => ({ ...s, elements: [...(s.elements || [])] })) };
      updater(next);
      return next;
    });
  }, []);

  const patchSlide = (patch) => mutate((n) => Object.assign(n.slides[activeSlide], patch));
  const patchElement = (elId, patch) => mutate((n) => {
    const s = n.slides[activeSlide];
    s.elements = s.elements.map((e) => (e.id === elId ? { ...e, ...patch } : e));
  });

  const addElement = (el) => {
    const withId = { ...el, id: newId() };
    mutate((n) => n.slides[activeSlide].elements.push(withId));
    setSelectedId(withId.id);
  };
  const deleteElement = (elId) => {
    mutate((n) => { n.slides[activeSlide].elements = n.slides[activeSlide].elements.filter((e) => e.id !== elId); });
    setSelectedId(null);
  };
  const duplicateElement = (elId) => {
    const src = slide.elements.find((e) => e.id === elId);
    if (!src) return;
    const copy = { ...src, id: newId(), x: (src.x || 0) + 40, y: (src.y || 0) + 40 };
    mutate((n) => n.slides[activeSlide].elements.push(copy));
    setSelectedId(copy.id);
  };
  const bringToFront = (elId) => mutate((n) => {
    const s = n.slides[activeSlide];
    const idx = s.elements.findIndex((e) => e.id === elId);
    if (idx > -1) { const [el] = s.elements.splice(idx, 1); s.elements.push(el); }
  });
  const sendToBack = (elId) => mutate((n) => {
    const s = n.slides[activeSlide];
    const idx = s.elements.findIndex((e) => e.id === elId);
    if (idx > -1) { const [el] = s.elements.splice(idx, 1); s.elements.unshift(el); }
  });

  const addSlide = (tpl) => {
    const newSlide = tpl ? slideFromTemplate(tpl) : blankSlide();
    mutate((n) => {
      if (tpl?.palette && !n.palette_id) n.palette_id = tpl.palette;
      n.slides.push(newSlide);
    });
    setActiveSlide(proj.slides.length);
    setSelectedId(null);
  };
  const duplicateSlide = () => {
    const src = slide;
    const copy = { ...src, _k: newId(), elements: src.elements.map((e) => ({ ...e, id: newId() })) };
    mutate((n) => n.slides.splice(activeSlide + 1, 0, copy));
    setActiveSlide(activeSlide + 1);
  };
  const deleteSlide = () => {
    if (proj.slides.length === 1) return;
    mutate((n) => n.slides.splice(activeSlide, 1));
    setActiveSlide(Math.max(0, activeSlide - 1));
    setSelectedId(null);
  };

  // Pointer drag: move selected element.
  const onPointerDown = (e, el) => {
    e.stopPropagation();
    setSelectedId(el.id);
    const scale = zoom;
    dragState.current = { id: el.id, startX: e.clientX, startY: e.clientY, ox: el.x, oy: el.y, scale };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };
  const onPointerMove = (e) => {
    const ds = dragState.current;
    if (!ds) return;
    const dx = (e.clientX - ds.startX) / ds.scale;
    const dy = (e.clientY - ds.startY) / ds.scale;
    patchElement(ds.id, { x: Math.round(ds.ox + dx), y: Math.round(ds.oy + dy) });
  };
  const onPointerUp = () => {
    dragState.current = null;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  };

  // Keyboard: delete selected on Backspace/Delete.
  useEffect(() => {
    const h = (e) => {
      if (!selectedId) return;
      if (e.target?.tagName === "INPUT" || e.target?.tagName === "TEXTAREA" || e.target?.isContentEditable) return;
      if (e.key === "Backspace" || e.key === "Delete") { e.preventDefault(); deleteElement(selectedId); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [selectedId]); // eslint-disable-line

  const save = async () => {
    setBusy(true);
    try {
      const clean = stripLocalKeys(proj);
      await api.put(`/carousel/${id}`, { slides: clean.slides, brand: proj.brand, platform: proj.platform, topic: proj.topic, palette_id: proj.palette_id });
      toast.success("Saved");
    } catch { toast.error("Save failed"); }
    finally { setBusy(false); }
  };

  const exportSlidePng = () => {
    // Use html-to-canvas via SVG foreignObject: reliable at native resolution.
    const node = canvasRef.current;
    if (!node) return;
    const clone = node.cloneNode(true);
    clone.style.transform = "";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS.w}" height="${CANVAS.h}">
      <foreignObject width="100%" height="100%">
        <div xmlns="http://www.w3.org/1999/xhtml" style="width:${CANVAS.w}px;height:${CANVAS.h}px">${clone.innerHTML}</div>
      </foreignObject></svg>`;
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = CANVAS.w; canvas.height = CANVAS.h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, CANVAS.w, CANVAS.h);
      canvas.toBlob((b) => {
        if (!b) { toast.error("Export failed. Try again."); return; }
        const a = document.createElement("a");
        a.href = URL.createObjectURL(b);
        a.download = `${(proj.topic || "slide").slice(0, 40).replace(/\W+/g, "-")}-${activeSlide + 1}.png`;
        a.click();
      }, "image/png");
      URL.revokeObjectURL(url);
    };
    img.onerror = () => toast.error("Export failed — try Save first.");
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  };

  if (!proj) return <div className="p-10 text-neutral-500">Loading…</div>;

  return (
    <div>
      <PageHeader
        title={proj.topic}
        subtitle={`${proj.slides.length} slide${proj.slides.length === 1 ? "" : "s"} · ${palette.name} palette`}
        right={
          <div className="flex gap-2">
            <button onClick={() => nav("/app/create-eq")} className="btn-ghost"><ChevronLeft size={14} /> Projects</button>
            <button onClick={exportSlidePng} data-testid="export-png-btn" className="btn-secondary"><Download size={14} /> Export PNG</button>
            <button onClick={save} disabled={busy} data-testid="save-carousel-btn" className="btn-primary">
              {busy ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : <><Save size={14} /> Save</>}
            </button>
          </div>
        }
      />
      <div className="grid grid-cols-12 min-h-[calc(100vh-90px)] bg-neutral-100">
        {/* LEFT: templates & elements */}
        <aside className="col-span-2 border-r border-line bg-white overflow-y-auto">
          <LeftPanel palette={palette}
            onTemplate={(tpl) => addSlide(tpl)}
            onAddText={(preset) => addElement(preset)}
            onAddShape={(shape) => addElement({ type: "shape", shape, x: 400, y: 500, w: 280, h: 280, fill: "accent", opacity: 1, radius: shape === "circle" ? 999 : 24 })}
            onAddBadge={() => addElement({ type: "badge", x: 80, y: 96, text: "NEW", bg: "accent", color: "bg", radius: 999, size: 20 })}
            onAddIcon={(name) => addElement({ type: "icon", x: 400, y: 500, w: 128, name, color: "accent", stroke: 2 })} />
        </aside>

        {/* CENTER: canvas */}
        <section className="col-span-7 relative overflow-auto">
          <div className="p-6 flex items-start justify-center">
            <div className="relative" style={{ width: CANVAS.w * zoom, height: CANVAS.h * zoom }}>
              <div
                ref={canvasRef}
                onClick={() => setSelectedId(null)}
                className="absolute inset-0 origin-top-left overflow-hidden shadow-[0_20px_80px_-30px_rgba(0,0,0,0.35)] rounded-md"
                style={{ width: CANVAS.w, height: CANVAS.h, transform: `scale(${zoom})`, transformOrigin: "top left", background: renderBackground(slide.bg, palette) }}
              >
                {slide.elements.map((el) => (
                  <ElementRender key={el.id} el={el} palette={palette} selected={selectedId === el.id}
                    onPointerDown={(e) => onPointerDown(e, el)}
                    onEdit={(patch) => patchElement(el.id, patch)} />
                ))}
              </div>
            </div>
          </div>
          <div className="sticky bottom-0 left-0 right-0 bg-white/90 backdrop-blur border-t border-line px-4 py-2 flex items-center gap-2 text-xs">
            <span className="ui-label">Zoom</span>
            <input type="range" min={0.15} max={0.7} step={0.02} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} data-testid="zoom-slider" className="w-32" />
            <span className="font-mono text-neutral-500">{Math.round(zoom * 100)}%</span>
            <div className="ml-4 flex items-center gap-1 flex-wrap">
              {proj.slides.map((s, i) => (
                <button key={s._k} onClick={() => { setActiveSlide(i); setSelectedId(null); }} data-testid={`slide-thumb-${i}`}
                  className={`px-2.5 py-1 rounded-full text-xs font-mono ${i === activeSlide ? "bg-ink text-white" : "bg-neutral-100 hover:bg-neutral-200"}`}>
                  {i + 1}
                </button>
              ))}
              <button onClick={() => addSlide()} data-testid="add-slide" className="btn-ghost text-xs py-1"><Plus size={12} /> Slide</button>
              <button onClick={duplicateSlide} data-testid="dup-slide" className="btn-ghost text-xs py-1"><Copy size={12} /></button>
              <button onClick={deleteSlide} data-testid="del-slide" className="btn-ghost text-xs py-1 text-red-600"><Trash2 size={12} /></button>
            </div>
          </div>
        </section>

        {/* RIGHT: inspector */}
        <aside className="col-span-3 border-l border-line bg-white overflow-y-auto">
          <RightPanel proj={proj} palette={palette} slide={slide} selected={selected}
            onPalette={(pid) => setProj({ ...proj, palette_id: pid })}
            onBg={(bg) => patchSlide({ bg })}
            onEditElement={(patch) => selected && patchElement(selected.id, patch)}
            onDelete={() => selected && deleteElement(selected.id)}
            onDuplicate={() => selected && duplicateElement(selected.id)}
            onFront={() => selected && bringToFront(selected.id)}
            onBack={() => selected && sendToBack(selected.id)}
          />
        </aside>
      </div>
    </div>
  );
}

/* ------------------------------- Panels ---------------------------------- */

function LeftPanel({ palette, onTemplate, onAddText, onAddShape, onAddBadge, onAddIcon }) {
  return (
    <div className="p-3 space-y-4">
      <div>
        <div className="ui-label mb-2 px-1">Templates</div>
        <div className="grid grid-cols-2 gap-2">
          {TEMPLATES.map((t) => (
            <button key={t.id} onClick={() => onTemplate(t)} data-testid={`tpl-${t.id}`}
              className="rounded-lg overflow-hidden border border-line hover:border-ink transition-colors">
              <div className="aspect-[4/5] p-2 flex flex-col justify-between text-left" style={{ background: t.thumb_bg, color: t.thumb_accent }}>
                <div className="text-[8px] font-mono uppercase tracking-widest opacity-70">{t.tag}</div>
                <div className="font-display font-bold text-[11px] leading-tight">{t.name}</div>
              </div>
              <div className="p-1.5 bg-white text-[10px] text-neutral-600 text-center truncate">{t.name}</div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="ui-label mb-2 px-1">Add text</div>
        <div className="space-y-1">
          <TextPreset label="Headline" onClick={() => onAddText({ type: "text", x: 80, y: 400, w: 920, h: 240, text: "Big idea here",
            font: "Archivo Black", size: 128, weight: 900, color: "text", line_height: 1, align: "left" })} sample="Aa" style={{ fontFamily: "Archivo Black", fontSize: 26 }} />
          <TextPreset label="Serif quote" onClick={() => onAddText({ type: "text", x: 80, y: 400, w: 920, h: 320, text: "Your sharp thought",
            font: "Instrument Serif", size: 96, weight: 400, italic: true, color: "accent", line_height: 1.05 })} sample="Aa" style={{ fontFamily: "Instrument Serif", fontSize: 26, fontStyle: "italic" }} />
          <TextPreset label="Subheadline" onClick={() => onAddText({ type: "text", x: 80, y: 400, w: 920, h: 100, text: "Supporting line",
            font: "Inter", size: 40, weight: 600, color: "text" })} sample="Aa" style={{ fontFamily: "Inter", fontSize: 22, fontWeight: 600 }} />
          <TextPreset label="Body" onClick={() => onAddText({ type: "text", x: 80, y: 400, w: 920, h: 240, text: "Long-form paragraph text with balanced line height for easy reading.",
            font: "Inter", size: 28, weight: 400, color: "text", line_height: 1.4 })} sample="Ag" style={{ fontFamily: "Inter", fontSize: 18 }} />
          <TextPreset label="Caption" onClick={() => onAddText({ type: "text", x: 80, y: 400, w: 920, h: 60, text: "SMALL CAPS",
            font: "JetBrains Mono", size: 20, weight: 500, uppercase: true, letter_spacing: 0.24, color: "muted" })} sample="AA" style={{ fontFamily: "JetBrains Mono", fontSize: 14 }} />
        </div>
      </div>

      <div>
        <div className="ui-label mb-2 px-1">Elements</div>
        <div className="grid grid-cols-3 gap-1">
          <ElementBtn onClick={() => onAddShape("rect")}><SquareIcon size={16} /></ElementBtn>
          <ElementBtn onClick={() => onAddShape("circle")}><CircleIcon size={16} /></ElementBtn>
          <ElementBtn onClick={onAddBadge}>Badge</ElementBtn>
          {Object.keys(ICONS).map((n) => {
            const IC = ICONS[n];
            return <ElementBtn key={n} onClick={() => onAddIcon(n)}><IC size={16} /></ElementBtn>;
          })}
        </div>
      </div>
    </div>
  );
}

function TextPreset({ label, onClick, sample, style }) {
  return (
    <button onClick={onClick} className="w-full text-left p-2 rounded-md border border-line hover:border-ink flex items-center gap-2">
      <span style={style} className="w-8 text-center">{sample}</span>
      <span className="text-xs text-neutral-700">{label}</span>
    </button>
  );
}
function ElementBtn({ children, onClick }) {
  return <button onClick={onClick} className="aspect-square rounded-md border border-line hover:border-ink flex items-center justify-center text-xs">{children}</button>;
}

function RightPanel({ proj, palette, slide, selected, onPalette, onBg, onEditElement, onDelete, onDuplicate, onFront, onBack }) {
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
                  {[p.bg, p.bg2, p.accent, p.text].map((c) => <span key={c} className="w-4 h-4 rounded" style={{ background: c }} />)}
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
      <input type="color" value={value?.startsWith("#") ? value : "#000000"} onChange={(e) => onChange(e.target.value)}
        className="w-full h-8 mt-2 border border-line rounded-md cursor-pointer" title="Or pick any hex" />
    </div>
  );
}

/* --------------------------- Element rendering --------------------------- */

function renderBackground(bg, palette) {
  if (!bg) return palette.bg;
  if (bg.type === "gradient") {
    const c1 = resolveColor(bg.color, palette);
    const c2 = resolveColor(bg.color2 || "accent", palette);
    return `linear-gradient(${bg.angle || 145}deg, ${c1}, ${c2})`;
  }
  return resolveColor(bg.color || "bg", palette);
}

function ElementRender({ el, palette, selected, onPointerDown, onEdit }) {
  const common = {
    position: "absolute",
    left: el.x, top: el.y, width: el.w, height: el.h,
    cursor: "move",
    userSelect: "none",
    outline: selected ? "3px solid rgba(0,0,0,0.9)" : "none",
    outlineOffset: 4,
  };
  if (el.type === "text") {
    return (
      <div style={{
        ...common,
        color: resolveColor(el.color, palette),
        fontFamily: `"${el.font || "Inter"}", sans-serif`,
        fontSize: el.size,
        fontWeight: el.weight,
        fontStyle: el.italic ? "italic" : "normal",
        textTransform: el.uppercase ? "uppercase" : "none",
        letterSpacing: `${el.letter_spacing || 0}em`,
        lineHeight: el.line_height || 1.2,
        textAlign: el.align || "left",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }} onPointerDown={onPointerDown}>{el.text}</div>
    );
  }
  if (el.type === "shape") {
    return (
      <div onPointerDown={onPointerDown} style={{
        ...common,
        background: resolveColor(el.fill, palette),
        opacity: el.opacity ?? 1,
        borderRadius: el.shape === "circle" ? 9999 : (el.radius ?? 0),
      }} />
    );
  }
  if (el.type === "badge") {
    return (
      <div onPointerDown={onPointerDown} style={{
        ...common,
        background: resolveColor(el.bg, palette),
        color: resolveColor(el.color, palette),
        borderRadius: el.radius ?? 999,
        padding: "10px 20px",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontFamily: `"JetBrains Mono", monospace`, fontSize: el.size || 20,
        letterSpacing: "0.14em", textTransform: "uppercase",
        width: "auto", height: "auto", minWidth: 0,
      }}>{el.text}</div>
    );
  }
  if (el.type === "icon") {
    const IC = ICONS[el.name] || Zap;
    return (
      <div onPointerDown={onPointerDown} style={{ ...common, width: el.w, height: el.w, color: resolveColor(el.color, palette) }}>
        <IC size={el.w} strokeWidth={el.stroke || 2} />
      </div>
    );
  }
  return null;
}
