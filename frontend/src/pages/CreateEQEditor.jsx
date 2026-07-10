import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import jsPDF from "jspdf";
import {
  Save, Download, Palette as PaletteIcon, ChevronLeft, Loader2, Plus, Trash2, Copy,
  Type, Square as SquareIcon, Circle as CircleIcon, Zap, Award, Star, Rocket, Sparkles,
  Layers, Bold, Italic, AlignLeft, AlignCenter, AlignRight, MessageSquare,
  Image as ImageIcon, Undo2, Redo2, Wand2, FileText,
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
  const [brandKits, setBrandKits] = useState([]);
  const [showBrandKit, setShowBrandKit] = useState(false);
  const [showAiImage, setShowAiImage] = useState(false);
  const canvasRef = useRef(null);
  const dragState = useRef(null);
  const historyRef = useRef({ past: [], future: [] });

  useEffect(() => {
    api.get(`/carousel/${id}`).then((r) => setProj(hydrate(r.data)));
    api.get("/brandkits").then((r) => setBrandKits(r.data)).catch(() => {});
  }, [id]);

  const palette = useMemo(
    () => PALETTES.find((p) => p.id === proj?.palette_id) || PALETTES[0],
    [proj?.palette_id]
  );

  const slide = proj?.slides?.[activeSlide];
  const selected = slide?.elements?.find((e) => e.id === selectedId);

  const pushHistory = useCallback((snapshot) => {
    historyRef.current.past.push(snapshot);
    if (historyRef.current.past.length > 50) historyRef.current.past.shift();
    historyRef.current.future = [];
  }, []);
  const undo = useCallback(() => {
    const h = historyRef.current;
    if (!h.past.length) return;
    setProj((cur) => {
      if (!cur) return cur;
      h.future.push(JSON.stringify(cur));
      return JSON.parse(h.past.pop());
    });
  }, []);
  const redo = useCallback(() => {
    const h = historyRef.current;
    if (!h.future.length) return;
    setProj((cur) => {
      if (!cur) return cur;
      h.past.push(JSON.stringify(cur));
      return JSON.parse(h.future.pop());
    });
  }, []);

  const mutate = useCallback((updater) => {
    setProj((cur) => {
      if (!cur) return cur;
      pushHistory(JSON.stringify(cur));
      const next = { ...cur, slides: cur.slides.map((s) => ({ ...s, elements: [...(s.elements || [])] })) };
      updater(next);
      return next;
    });
  }, [pushHistory]);

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

  // Keyboard: delete selected on Backspace/Delete, undo/redo shortcuts.
  useEffect(() => {
    const h = (e) => {
      if (e.target?.tagName === "INPUT" || e.target?.tagName === "TEXTAREA" || e.target?.isContentEditable) return;
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === "z" || e.key === "Z")) { e.preventDefault(); undo(); return; }
      if ((e.ctrlKey || e.metaKey) && ((e.shiftKey && (e.key === "z" || e.key === "Z")) || e.key === "y")) { e.preventDefault(); redo(); return; }
      if (!selectedId) return;
      if (e.key === "Backspace" || e.key === "Delete") { e.preventDefault(); deleteElement(selectedId); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [selectedId, undo, redo]);

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

  const renderSlideToDataUrl = (slideIdx) => new Promise((resolve, reject) => {
    // Build the SVG foreignObject payload directly from escaped element HTML — no live
    // DOM mount required, which also removes an XSS surface via innerHTML.
    const elsHtml = proj.slides[slideIdx].elements.map((el) => elementToStaticHtml(el, palette)).join("");
    const bg = renderBackground(proj.slides[slideIdx].bg, palette);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS.w}" height="${CANVAS.h}">
      <foreignObject width="100%" height="100%">
        <div xmlns="http://www.w3.org/1999/xhtml" style="width:${CANVAS.w}px;height:${CANVAS.h}px;background:${bg}">${elsHtml}</div>
      </foreignObject></svg>`;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = CANVAS.w; canvas.height = CANVAS.h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  });

  const exportPdf = async () => {
    if (!proj?.slides?.length) return;
    setBusy(true);
    try {
      const pdf = new jsPDF({
        orientation: CANVAS.h > CANVAS.w ? "portrait" : "landscape",
        unit: "px",
        format: [CANVAS.w, CANVAS.h],
        compress: true,
      });
      for (let i = 0; i < proj.slides.length; i++) {
        const dataUrl = await renderSlideToDataUrl(i);
        if (i > 0) pdf.addPage([CANVAS.w, CANVAS.h], CANVAS.h > CANVAS.w ? "portrait" : "landscape");
        pdf.addImage(dataUrl, "PNG", 0, 0, CANVAS.w, CANVAS.h);
      }
      pdf.save(`${(proj.topic || "carousel").slice(0, 40).replace(/\W+/g, "-")}.pdf`);
      toast.success(`Exported ${proj.slides.length}-page PDF`);
    } catch (err) {
      console.error(err);
      toast.error("PDF export failed");
    } finally { setBusy(false); }
  };

  const applyBrandKit = async (kit) => {
    if (!kit) return;
    mutate((n) => {
      if (kit.palette_id) n.palette_id = kit.palette_id;
      n.brand = { ...(n.brand || {}), logo_url: kit.logo_url, colors: kit.colors, fonts: kit.fonts };
      // Add logo image to every slide at bottom-left, if there isn't one already.
      if (kit.logo_url) {
        for (const s of n.slides) {
          const hasLogo = (s.elements || []).some((e) => e.type === "image" && e.role === "logo");
          if (!hasLogo) {
            s.elements.push({ id: newId(), type: "image", role: "logo", src: kit.logo_url, x: 80, y: CANVAS.h - 160, w: 160, h: 80, fit: "contain" });
          }
        }
      }
    });
    toast.success(`Applied brand kit "${kit.name}"`);
  };

  const aiAssistText = async (mode) => {
    if (!selected || selected.type !== "text" || !proj) return;
    setBusy(true);
    try {
      const instructionMap = {
        punchier: "Rewrite this text to be punchier and more direct. Same intent, half the words if possible.",
        shorter: "Rewrite this text at half the length while preserving the core idea.",
        catchier: "Rewrite this as a scroll-stopping hook for a LinkedIn / Instagram carousel.",
        formal: "Rewrite this in a formal, executive tone.",
      };
      const { data } = await api.post("/carousel/edit", {
        project_id: id,
        slide_index: activeSlide,
        instruction: `Rewrite ONLY the title field of the slide. ${instructionMap[mode]} Current text: "${selected.text}"`,
      });
      if (data?.slide?.title) {
        patchElement(selected.id, { text: data.slide.title });
        toast.success("Rewritten by AI");
      } else {
        toast.error("No rewrite returned");
      }
    } catch { toast.error("AI assist failed"); }
    finally { setBusy(false); }
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
            <button onClick={undo} title="Undo (Ctrl+Z)" data-testid="undo-btn" className="btn-ghost"><Undo2 size={14} /></button>
            <button onClick={redo} title="Redo (Ctrl+Shift+Z)" data-testid="redo-btn" className="btn-ghost"><Redo2 size={14} /></button>
            <button onClick={() => setShowAiImage(true)} data-testid="ai-image-open" className="btn-secondary"><Wand2 size={14} /> AI Image</button>
            <button onClick={() => setShowBrandKit(true)} data-testid="brand-kit-open" className="btn-secondary"><Sparkles size={14} /> Brand kit</button>
            <button onClick={exportSlidePng} data-testid="export-png-btn" className="btn-secondary"><Download size={14} /> PNG</button>
            <button onClick={exportPdf} disabled={busy} data-testid="export-pdf-btn" className="btn-secondary"><FileText size={14} /> PDF</button>
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
            onAddIcon={(name) => addElement({ type: "icon", x: 400, y: 500, w: 128, name, color: "accent", stroke: 2 })}
            onAddImage={() => {
              const url = prompt("Paste image URL (PNG/JPG/SVG)");
              if (url && url.trim()) addElement({ type: "image", src: url.trim(), x: 300, y: 400, w: 480, h: 480, fit: "cover", radius: 24 });
            }} />
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
            onAiAssist={aiAssistText}
          />
        </aside>
      </div>

      {showBrandKit && (
        <BrandKitDrawer
          onClose={() => setShowBrandKit(false)}
          kits={brandKits}
          onSaved={(kit) => { setBrandKits((k) => [kit, ...k]); }}
          onDeleted={(bid) => setBrandKits((k) => k.filter((x) => x.id !== bid))}
          onApply={(kit) => { applyBrandKit(kit); setShowBrandKit(false); }}
        />
      )}

      {showAiImage && (
        <AiImageDrawer
          onClose={() => setShowAiImage(false)}
          onAddAsElement={(dataUrl) => {
            addElement({
              type: "image", src: dataUrl,
              x: 120, y: 240, w: 840, h: 840,
              fit: "cover", radius: 24,
            });
            setShowAiImage(false);
            toast.success("Image added to slide");
          }}
          onAddAsBackground={(dataUrl) => {
            mutate((n) => {
              const s = n.slides[activeSlide];
              // Remove any existing bg-image element role
              s.elements = (s.elements || []).filter((el) => !(el.type === "image" && el.role === "background"));
              s.elements.unshift({
                id: newId(), type: "image", role: "background",
                src: dataUrl, x: 0, y: 0, w: CANVAS.w, h: CANVAS.h,
                fit: "cover", radius: 0,
              });
            });
            setShowAiImage(false);
            toast.success("Background applied");
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------- Panels ---------------------------------- */

function LeftPanel({ palette, onTemplate, onAddText, onAddShape, onAddBadge, onAddIcon, onAddImage }) {
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
          <ElementBtn onClick={() => onAddShape("rect")} title="Rectangle"><SquareIcon size={16} /></ElementBtn>
          <ElementBtn onClick={() => onAddShape("circle")} title="Circle"><CircleIcon size={16} /></ElementBtn>
          <ElementBtn onClick={onAddBadge} title="Badge">Bdg</ElementBtn>
          <ElementBtn onClick={onAddImage} title="Image"><ImageIcon size={16} /></ElementBtn>
          {Object.keys(ICONS).map((n) => {
            const IC = ICONS[n];
            return <ElementBtn key={n} onClick={() => onAddIcon(n)} title={n}><IC size={16} /></ElementBtn>;
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

function RightPanel({ proj, palette, slide, selected, onPalette, onBg, onEditElement, onDelete, onDuplicate, onFront, onBack, onAiAssist }) {
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

          {/* Text effects */}
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

          {/* AI Copy Assist */}
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
      <input type="color" value={value?.startsWith("#") ? value : "#000000"} onChange={(e) => onChange(e.target.value)}
        className="w-full h-8 mt-2 border border-line rounded-md cursor-pointer" title="Or pick any hex" />
    </div>
  );
}

/* --------------------------- Element rendering --------------------------- */

/** Convert an element to raw HTML for off-screen PDF rasterisation. */
function elementToStaticHtml(el, palette) {
  const style = (obj) => Object.entries(obj).map(([k, v]) => `${k.replace(/([A-Z])/g, "-$1").toLowerCase()}:${v}`).join(";");
  const base = { position: "absolute", left: `${el.x}px`, top: `${el.y}px`, width: `${el.w}px`, height: `${el.h}px` };
  if (el.type === "text") {
    const shadow = el.shadow ? `${el.shadow_x || 0}px ${el.shadow_y || 4}px ${el.shadow_blur || 12}px ${el.shadow_color || "rgba(0,0,0,0.35)"}` : "none";
    const stroke = el.stroke_w
      ? `-${el.stroke_w}px -${el.stroke_w}px 0 ${resolveColor(el.stroke_color || "bg", palette)}, ${el.stroke_w}px -${el.stroke_w}px 0 ${resolveColor(el.stroke_color || "bg", palette)}, -${el.stroke_w}px ${el.stroke_w}px 0 ${resolveColor(el.stroke_color || "bg", palette)}, ${el.stroke_w}px ${el.stroke_w}px 0 ${resolveColor(el.stroke_color || "bg", palette)}`
      : null;
    const s = {
      ...base,
      color: resolveColor(el.color, palette),
      "font-family": `"${el.font || "Inter"}", sans-serif`,
      "font-size": `${el.size}px`,
      "font-weight": el.weight,
      "font-style": el.italic ? "italic" : "normal",
      "text-transform": el.uppercase ? "uppercase" : "none",
      "letter-spacing": `${el.letter_spacing || 0}em`,
      "line-height": el.line_height || 1.2,
      "text-align": el.align || "left",
      "white-space": "pre-wrap",
      "word-break": "break-word",
      "text-shadow": stroke ? `${stroke}${el.shadow ? `, ${shadow}` : ""}` : shadow,
    };
    return `<div style="${style(s)}">${escapeHtml(el.text || "")}</div>`;
  }
  if (el.type === "image") {
    const s = { ...base, "border-radius": `${el.radius || 0}px`, overflow: "hidden" };
    const safeSrc = safeUrl(el.src);
    const fit = /^(cover|contain|fill|none|scale-down)$/.test(el.fit || "") ? el.fit : "cover";
    return `<div style="${style(s)}"><img src="${escapeAttr(safeSrc)}" style="width:100%;height:100%;object-fit:${fit};display:block" /></div>`;
  }
  if (el.type === "shape") {
    const s = { ...base, background: resolveColor(el.fill, palette), opacity: el.opacity ?? 1, "border-radius": `${el.shape === "circle" ? 9999 : (el.radius ?? 0)}px` };
    return `<div style="${style(s)}"></div>`;
  }
  if (el.type === "badge") {
    const s = { ...base, background: resolveColor(el.bg, palette), color: resolveColor(el.color, palette), "border-radius": `${el.radius ?? 999}px`, padding: "10px 20px", display: "inline-flex", "align-items": "center", "justify-content": "center", "font-family": `"JetBrains Mono", monospace`, "font-size": `${el.size || 20}px`, "letter-spacing": "0.14em", "text-transform": "uppercase", width: "auto", height: "auto" };
    return `<div style="${style(s)}">${escapeHtml(el.text || "")}</div>`;
  }
  if (el.type === "icon") {
    // Fallback: skip icons in PDF (Lucide is SVG-based; would need inline SVG). Render as label instead.
    const s = { ...base, color: resolveColor(el.color, palette), display: "flex", "align-items": "center", "justify-content": "center", "font-family": "monospace", "font-size": "14px" };
    return `<div style="${style(s)}">◇</div>`;
  }
  return "";
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

/** Escape a value for use inside a double-quoted HTML attribute. */
function escapeAttr(s) {
  return String(s || "").replace(/[&"<>]/g, (c) => ({ "&": "&amp;", '"': "&quot;", "<": "&lt;", ">": "&gt;" })[c]);
}

/** Restrict user-provided image URLs to safe protocols (blocks javascript:, data:text/html, etc). */
function safeUrl(u) {
  const v = String(u || "").trim();
  if (!v) return "";
  if (/^(https?:|data:image\/(png|jpe?g|gif|webp|svg\+xml);)/i.test(v)) return v;
  return "";
}

/* --------------------------- Brand Kit Drawer ---------------------------- */

function BrandKitDrawer({ onClose, kits, onSaved, onDeleted, onApply }) {
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: "",
    logo_url: "",
    colors: [
      { id: newId(), hex: "#212025" },
      { id: newId(), hex: "#E85D3A" },
      { id: newId(), hex: "#FDFDF9" },
    ],
    fonts: ["Inter"],
    palette_id: "midnight",
  });

  const save = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...form, colors: form.colors.map((c) => c.hex) };
      const { data } = await api.post("/brandkits", payload);
      toast.success(`Brand kit saved: ${data.name}`);
      onSaved(data);
      setCreating(false);
      setForm({
        name: "",
        logo_url: "",
        colors: [
          { id: newId(), hex: "#212025" },
          { id: newId(), hex: "#E85D3A" },
          { id: newId(), hex: "#FDFDF9" },
        ],
        fonts: ["Inter"],
        palette_id: "midnight",
      });
    } catch { toast.error("Save failed"); }
  };
  const del = async (bid) => {
    if (!confirm("Delete brand kit?")) return;
    await api.delete(`/brandkits/${bid}`);
    onDeleted(bid);
  };

  return (
    <div className="fixed inset-0 bg-ink/40 z-50 flex justify-end" onClick={onClose}>
      <div className="w-full max-w-md bg-white h-full overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-line px-5 py-4 flex items-center gap-3 z-10">
          <Sparkles size={16} />
          <div className="font-display font-bold">Brand kits</div>
          <button onClick={() => setCreating(!creating)} data-testid="brandkit-new" className="ml-auto btn-ghost text-xs"><Plus size={12} /> New</button>
        </div>

        {creating && (
          <form onSubmit={save} className="p-4 border-b border-line space-y-3 bg-neutral-50">
            <input required placeholder="Kit name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="brandkit-name" className="w-full border border-line rounded-full px-3 py-2 text-sm" />
            <input placeholder="Logo URL (paste image link)" value={form.logo_url} onChange={(e) => setForm({ ...form, logo_url: e.target.value })} data-testid="brandkit-logo-url" className="w-full border border-line rounded-full px-3 py-2 text-sm font-mono" />
            <div>
              <div className="ui-label mb-1">Brand colors</div>
              <div className="grid grid-cols-6 gap-1">
                {form.colors.map((c) => (
                  <input
                    key={c.id}
                    type="color"
                    value={c.hex}
                    onChange={(e) => setForm({
                      ...form,
                      colors: form.colors.map((x) => x.id === c.id ? { ...x, hex: e.target.value } : x),
                    })}
                    className="w-full h-10 border border-line rounded"
                  />
                ))}
                {form.colors.length < 8 && (
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, colors: [...form.colors, { id: newId(), hex: "#000000" }] })}
                    className="border border-dashed border-line rounded text-neutral-500 text-lg"
                  >+</button>
                )}
              </div>
            </div>
            <div>
              <div className="ui-label mb-1">Default palette</div>
              <select value={form.palette_id} onChange={(e) => setForm({ ...form, palette_id: e.target.value })} className="w-full border border-line rounded-full px-3 py-2 bg-white text-sm">
                {PALETTES.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <div className="ui-label mb-1">Primary font</div>
              <select value={form.fonts[0] || "Inter"} onChange={(e) => setForm({ ...form, fonts: [e.target.value] })} className="w-full border border-line rounded-full px-3 py-2 bg-white text-sm">
                {FONTS.map((f) => <option key={f.id} value={f.id}>{f.id}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setCreating(false)} className="btn-secondary text-sm">Cancel</button>
              <button type="submit" data-testid="brandkit-save" className="btn-primary text-sm">Save</button>
            </div>
          </form>
        )}

        <div className="p-4 space-y-3">
          {kits.length === 0 && !creating && <div className="text-sm text-neutral-500">No brand kits yet. Create one, then apply it to auto-brand every slide.</div>}
          {kits.map((k) => (
            <div key={k.id} className="bg-white border border-line rounded-2xl p-4">
              <div className="flex items-start gap-3">
                {k.logo_url ? (
                  <img src={k.logo_url} alt="" className="w-14 h-14 object-contain border border-line rounded-md bg-white" onError={(e) => { e.currentTarget.style.opacity = 0.3; }} />
                ) : (
                  <div className="w-14 h-14 border border-line rounded-md bg-neutral-100 flex items-center justify-center text-neutral-400 text-xs">no logo</div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{k.name}</div>
                  <div className="flex gap-1 mt-1">{(k.colors || []).slice(0, 8).map((c, i) => <span key={`${c}-${i}`} className="w-4 h-4 rounded-full border border-line" style={{ background: c }} />)}</div>
                  <div className="text-[11px] text-neutral-500 mt-1 font-mono">Palette: {PALETTES.find(p => p.id === k.palette_id)?.name || "—"} · Font: {(k.fonts || [])[0] || "—"}</div>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button onClick={() => onApply(k)} data-testid={`brandkit-apply-${k.id}`} className="btn-primary text-xs py-1.5">Apply to this deck</button>
                <button onClick={() => del(k.id)} data-testid={`brandkit-delete-${k.id}`} className="btn-ghost text-xs py-1.5 text-red-600"><Trash2 size={11} /> Delete</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


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
    const shadow = el.shadow ? `${el.shadow_x || 0}px ${el.shadow_y || 4}px ${el.shadow_blur || 12}px ${el.shadow_color || "rgba(0,0,0,0.35)"}` : "none";
    const stroke = el.stroke_w
      ? `-${el.stroke_w}px -${el.stroke_w}px 0 ${resolveColor(el.stroke_color || "bg", palette)}, ${el.stroke_w}px -${el.stroke_w}px 0 ${resolveColor(el.stroke_color || "bg", palette)}, -${el.stroke_w}px ${el.stroke_w}px 0 ${resolveColor(el.stroke_color || "bg", palette)}, ${el.stroke_w}px ${el.stroke_w}px 0 ${resolveColor(el.stroke_color || "bg", palette)}`
      : null;
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
        textShadow: stroke ? `${stroke}${el.shadow ? `, ${shadow}` : ""}` : shadow,
      }} onPointerDown={onPointerDown}>{el.text}</div>
    );
  }
  if (el.type === "image") {
    return (
      <div onPointerDown={onPointerDown} style={{ ...common, borderRadius: el.radius ?? 0, overflow: "hidden", background: "#00000010" }}>
        <img src={el.src} alt="" crossOrigin="anonymous"
          style={{ width: "100%", height: "100%", objectFit: el.fit || "cover", display: "block", pointerEvents: "none" }}
          onError={(e) => { e.currentTarget.style.opacity = 0.2; }} />
      </div>
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


/* --------------------------- AI Image Drawer ----------------------------- */

const IMAGE_PROVIDERS = [
  { id: "nano-banana", label: "Gemini Nano Banana", hint: "Stylized, artistic, painterly" },
  { id: "gpt-image-1", label: "GPT Image 1", hint: "Photorealistic, clean, product" },
];

const PROMPT_PRESETS = [
  "Abstract flowing waves in deep blue and coral, minimalist editorial style, high contrast",
  "Soft cream paper texture with subtle grain, warm off-white background for text overlay",
  "Bold geometric shapes overlapping — magenta, mustard, black — Bauhaus poster energy",
  "Moody dark studio backdrop with a single warm rim light, cinematic",
  "Dreamy pastel gradient — peach into lavender — soft blurred bokeh",
  "Iso-3D floating platforms, mint and violet, gentle drop shadows, product-launch vibe",
];

function AiImageDrawer({ onClose, onAddAsElement, onAddAsBackground }) {
  const [prompt, setPrompt] = useState("");
  const [provider, setProvider] = useState("nano-banana");
  const [aspect, setAspect] = useState("portrait");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null); // { dataUrl, provider }

  const size = aspect === "square" ? "1080x1080" : aspect === "story" ? "1080x1920" : "1080x1350";

  const generate = async () => {
    if (!prompt.trim()) { toast.error("Describe the image you want"); return; }
    setBusy(true);
    setPreview(null);
    try {
      const { data } = await api.post("/carousel/ai-image", {
        prompt: prompt.trim(), provider, size, aspect,
      });
      if (!data?.image_base64) throw new Error("no image");
      const dataUrl = `data:${data.mime_type || "image/png"};base64,${data.image_base64}`;
      setPreview({ dataUrl, provider: data.provider });
      toast.success(`Generated with ${data.provider}`);
    } catch (err) {
      const msg = err?.response?.data?.detail || err?.message || "Generation failed";
      toast.error(String(msg).slice(0, 200));
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-ink/40 z-50 flex justify-end" onClick={onClose}>
      <div className="w-full max-w-md bg-white h-full overflow-y-auto" onClick={(e) => e.stopPropagation()} data-testid="ai-image-drawer">
        <div className="sticky top-0 bg-white border-b border-line px-5 py-4 flex items-center gap-3 z-10">
          <Wand2 size={16} />
          <div className="font-display font-bold">AI Image</div>
          <button onClick={onClose} className="ml-auto btn-ghost text-xs">Close</button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <div className="ui-label mb-1.5">Provider</div>
            <div className="grid grid-cols-2 gap-2">
              {IMAGE_PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setProvider(p.id)}
                  data-testid={`ai-image-provider-${p.id}`}
                  className={`text-left p-3 rounded-lg border transition-colors ${provider === p.id ? "border-ink bg-neutral-50" : "border-line hover:border-ink"}`}
                >
                  <div className="text-xs font-medium">{p.label}</div>
                  <div className="text-[10px] text-neutral-500 mt-0.5 leading-tight">{p.hint}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="ui-label mb-1.5">Aspect</div>
            <div className="flex gap-1">
              {[
                ["portrait", "4:5 · 1080×1350"],
                ["square", "1:1 · 1080×1080"],
                ["story", "9:16 · 1080×1920"],
              ].map(([k, l]) => (
                <button
                  key={k}
                  onClick={() => setAspect(k)}
                  data-testid={`ai-image-aspect-${k}`}
                  className={`flex-1 py-1.5 rounded-full text-[11px] border ${aspect === k ? "border-ink bg-ink text-white" : "border-line hover:border-ink"}`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="ui-label mb-1.5">Describe the image</div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              placeholder="e.g. Soft cream paper texture with subtle grain and coral confetti"
              data-testid="ai-image-prompt"
              className="w-full border border-line rounded-lg p-2 text-sm focus:outline-none focus:border-ink"
            />
            <div className="mt-2 flex flex-wrap gap-1">
              {PROMPT_PRESETS.slice(0, 4).map((p, i) => (
                <button
                  key={i}
                  onClick={() => setPrompt(p)}
                  className="text-[10px] px-2 py-1 rounded-full border border-line hover:border-ink text-neutral-600"
                >
                  {p.split(",")[0].slice(0, 32)}…
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={generate}
            disabled={busy}
            data-testid="ai-image-generate"
            className="w-full btn-primary justify-center"
          >
            {busy ? <><Loader2 size={14} className="animate-spin" /> Generating (~30–60s)…</> : <><Wand2 size={14} /> Generate</>}
          </button>

          {preview && (
            <div className="pt-4 border-t border-line space-y-3">
              <div className="ui-label">Preview · {preview.provider}</div>
              <div className="rounded-lg overflow-hidden border border-line bg-neutral-100" style={{ aspectRatio: aspect === "square" ? "1 / 1" : aspect === "story" ? "9 / 16" : "4 / 5" }}>
                <img src={preview.dataUrl} alt="preview" className="w-full h-full object-cover" data-testid="ai-image-preview" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => onAddAsElement(preview.dataUrl)} data-testid="ai-image-add-element" className="btn-secondary text-xs justify-center">Add as element</button>
                <button onClick={() => onAddAsBackground(preview.dataUrl)} data-testid="ai-image-add-background" className="btn-primary text-xs justify-center">Set as background</button>
              </div>
            </div>
          )}

          <div className="text-[11px] text-neutral-500 pt-3 border-t border-line">
            Images are generated on-demand and embedded directly in your slide — nothing is uploaded anywhere.
          </div>
        </div>
      </div>
    </div>
  );
}
