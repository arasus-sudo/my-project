import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { useParams, useNavigate } from "react-router-dom";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { toast } from "sonner";
import {
  Save, Download, ChevronLeft, Loader2, Plus, Trash2, Copy,
  Sparkles, Undo2, Redo2, Wand2, FileText, LayoutGrid, Maximize2, Mountain,
} from "lucide-react";

import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { PALETTES, CANVAS, blankSlide, slideFromTemplate } from "../lib/creqTemplates";

import LeftPanel from "../components/creq/LeftPanel";
import RightPanel from "../components/creq/RightPanel";
import BoardView from "../components/creq/BoardView";
import ElementRender from "../components/creq/ElementRender";
import PanoramaLayer from "../components/creq/PanoramaLayer";
import BrandKitDrawer from "../components/creq/drawers/BrandKitDrawer";
import AiImageDrawer from "../components/creq/drawers/AiImageDrawer";
import PanoramaDrawer from "../components/creq/drawers/PanoramaDrawer";
import PdfExportDialog from "../components/creq/drawers/PdfExportDialog";
import { newId, renderBackground, stripLocalKeys } from "../components/creq/utils";

/* ------------------------- Project load / hydrate ------------------------- */

function hydrate(project) {
  const p = { ...project };
  p.palette_id = p.palette_id || "midnight";
  p.slides = (p.slides || []).map((s) => {
    if (s && !s.elements && (s.title || s.body || s.subtitle)) {
      // Legacy: {title,subtitle,body,cta} → element list.
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
    return {
      _k: s._k || newId(),
      bg: s.bg || { type: "solid", color: "bg" },
      elements: (s.elements || []).map((e) => ({ ...e, id: e.id || newId() })),
    };
  });
  if (!p.slides.length) p.slides.push(blankSlide());
  return p;
}

/* ------------------------------- Editor ---------------------------------- */

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
  const [showPanorama, setShowPanorama] = useState(false);
  const [showPdfPicker, setShowPdfPicker] = useState(false);
  const [viewMode, setViewMode] = useState("focus");
  const [dropHint, setDropHint] = useState(false);
  const canvasRef = useRef(null);
  const dragState = useRef(null);
  const panoDragState = useRef(null);
  const historyRef = useRef({ past: [], future: [] });
  const imageFileRef = useRef(null);

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

  /* --- History (undo/redo) --- */
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

  /* --- Slide / element mutations --- */
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

  /* --- Slides --- */
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

  /* --- Panorama manual controls --- */
  const setPanoViewport = (vp) => mutate((n) => {
    n.panorama = n.panorama || {};
    n.panorama.viewports = n.panorama.viewports || [];
    n.panorama.viewports[activeSlide] = { ox: vp.ox ?? 50, oy: vp.oy ?? 50, scale: vp.scale ?? 1 };
  });
  const resetPanoSlide = () => setPanoViewport({ ox: 50, oy: 50, scale: 1 });
  const applyPanoToAll = () => mutate((n) => {
    if (!n.panorama) return;
    const cur = (n.panorama.viewports || [])[activeSlide] || { ox: 50, oy: 50, scale: 1 };
    n.panorama.viewports = n.slides.map(() => ({ ...cur }));
  });

  /* --- Image upload + drag-drop --- */
  const insertImageFile = (file, position) => new Promise((resolve, reject) => {
    if (!file || !file.type?.startsWith("image/")) { toast.error("Please pick an image file"); reject(new Error("not_image")); return; }
    if (file.size > 15 * 1024 * 1024) { toast.error("Image too large (max ~15 MB)"); reject(new Error("too_large")); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      const x = position?.x ?? 300;
      const y = position?.y ?? 400;
      const probe = new window.Image();
      probe.onload = () => {
        const scale = probe.width > 720 ? 720 / probe.width : 1;
        addElement({ type: "image", src: dataUrl, x, y, w: Math.round(probe.width * scale), h: Math.round(probe.height * scale), fit: "cover", radius: 24 });
        toast.success("Image added");
        resolve();
      };
      probe.onerror = () => {
        addElement({ type: "image", src: dataUrl, x, y, w: 480, h: 480, fit: "cover", radius: 24 });
        resolve();
      };
      probe.src = dataUrl;
    };
    reader.onerror = () => { toast.error("Failed to read file"); reject(new Error("read_failed")); };
    reader.readAsDataURL(file);
  });
  const onImageFilesSelected = async (files) => {
    for (const f of Array.from(files || [])) { try { await insertImageFile(f); } catch { /* skip */ } }
  };
  const onCanvasDragOver = (e) => { if (e.dataTransfer?.types?.includes("Files")) { e.preventDefault(); setDropHint(true); } };
  const onCanvasDragLeave = () => setDropHint(false);
  const onCanvasDrop = async (e) => {
    e.preventDefault();
    setDropHint(false);
    const files = Array.from(e.dataTransfer?.files || []).filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    let px = 200, py = 200;
    if (rect) {
      px = Math.round((e.clientX - rect.left) / zoom) - 200;
      py = Math.round((e.clientY - rect.top) / zoom) - 200;
      px = Math.max(0, Math.min(CANVAS.w - 400, px));
      py = Math.max(0, Math.min(CANVAS.h - 400, py));
    }
    for (const f of files) { try { await insertImageFile(f, { x: px, y: py }); px += 40; py += 40; } catch { /* skip */ } }
  };

  /* --- Pointer drag: move selected element --- */
  const onPointerDown = (e, el) => {
    e.stopPropagation();
    setSelectedId(el.id);
    dragState.current = { id: el.id, startX: e.clientX, startY: e.clientY, ox: el.x, oy: el.y, scale: zoom };
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

  /* --- Panorama direct-drag overlay (manual mode) --- */
  const panoManual = proj?.panorama?.mode === "manual" && proj?.panorama?.src && !selected;
  const onPanoDragStart = (e) => {
    e.stopPropagation();
    const vp = (proj.panorama.viewports || [])[activeSlide] || { ox: 50, oy: 50, scale: 1 };
    panoDragState.current = { startX: e.clientX, startY: e.clientY, ox: vp.ox ?? 50, oy: vp.oy ?? 50, scale: vp.scale ?? 1 };
    window.addEventListener("pointermove", onPanoDragMove);
    window.addEventListener("pointerup", onPanoDragEnd);
  };
  const onPanoDragMove = (e) => {
    const ds = panoDragState.current;
    if (!ds) return;
    // Convert pixel drag to percentage — full pan = ~1 canvas width.
    const dxPct = ((e.clientX - ds.startX) / (CANVAS.w * zoom)) * -100;
    const dyPct = ((e.clientY - ds.startY) / (CANVAS.h * zoom)) * -100;
    const nextOx = Math.max(0, Math.min(100, ds.ox + dxPct));
    const nextOy = Math.max(0, Math.min(100, ds.oy + dyPct));
    setPanoViewport({ ox: nextOx, oy: nextOy, scale: ds.scale });
  };
  const onPanoDragEnd = () => {
    panoDragState.current = null;
    window.removeEventListener("pointermove", onPanoDragMove);
    window.removeEventListener("pointerup", onPanoDragEnd);
  };
  const onPanoWheel = (e) => {
    if (!panoManual) return;
    e.preventDefault();
    const vp = (proj.panorama.viewports || [])[activeSlide] || { ox: 50, oy: 50, scale: 1 };
    const nextScale = Math.max(1, Math.min(3, (vp.scale ?? 1) + (e.deltaY < 0 ? 0.1 : -0.1)));
    setPanoViewport({ ...vp, scale: nextScale });
  };

  /* --- Keyboard shortcuts --- */
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

  /* --- Save / export --- */
  const save = async () => {
    setBusy(true);
    try {
      const clean = stripLocalKeys(proj);
      await api.put(`/carousel/${id}`, {
        slides: clean.slides, brand: proj.brand, platform: proj.platform,
        topic: proj.topic, palette_id: proj.palette_id, panorama: proj.panorama || null,
      });
      toast.success("Saved");
    } catch { toast.error("Save failed"); }
    finally { setBusy(false); }
  };

  const renderSlideToDataUrl = (slideIdx) => new Promise((resolve, reject) => {
    // Live-render the slide off-screen via React, then rasterise with html2canvas.
    const host = document.createElement("div");
    host.style.cssText = [
      "position:fixed", "left:-99999px", "top:0",
      `width:${CANVAS.w}px`, `height:${CANVAS.h}px`,
      `background:${renderBackground(proj.slides[slideIdx].bg, palette)}`,
      "overflow:hidden", "pointer-events:none",
    ].join(";");
    document.body.appendChild(host);
    const root = createRoot(host);
    const cleanup = () => {
      try { root.unmount(); } catch { /* ignore */ }
      try { host.remove(); } catch { /* ignore */ }
    };
    (async () => {
      try {
        root.render(
          <>
            <PanoramaLayer panorama={proj.panorama} slideIdx={slideIdx} totalSlides={proj.slides.length} />
            {proj.slides[slideIdx].elements.map((el) => (
              <ElementRender key={el.id} el={el} palette={palette} selected={false} onPointerDown={() => {}} />
            ))}
          </>
        );
        await new Promise((r) => setTimeout(r, 150));
        const imgs = host.querySelectorAll("img");
        await Promise.all(Array.from(imgs).map((img) => new Promise((res) => {
          if (img.complete && img.naturalWidth) return res();
          img.onload = () => res();
          img.onerror = () => res();
          setTimeout(res, 3000);
        })));
        const canvas = await html2canvas(host, {
          width: CANVAS.w, height: CANVAS.h,
          windowWidth: CANVAS.w, windowHeight: CANVAS.h,
          scale: 2, useCORS: true, allowTaint: true, backgroundColor: null, logging: false,
        });
        const dataUrl = canvas.toDataURL("image/png", 0.92);
        cleanup(); resolve(dataUrl);
      } catch (err) {
        cleanup();
        console.error("[creq] slide", slideIdx, "render failed:", err);
        reject(err instanceof Error ? err : new Error(String(err?.message || err || "render_failed")));
      }
    })();
  });

  const exportSlidePng = async () => {
    setBusy(true);
    try {
      const dataUrl = await renderSlideToDataUrl(activeSlide);
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${(proj.topic || "slide").slice(0, 40).replace(/\W+/g, "-")}-${activeSlide + 1}.png`;
      a.click();
      toast.success("PNG exported");
    } catch { toast.error("PNG export failed"); }
    finally { setBusy(false); }
  };

  const exportPdfSlides = async (indices) => {
    if (!proj?.slides?.length) return;
    const chosen = (indices?.length ? indices : proj.slides.map((_, i) => i))
      .filter((i) => i >= 0 && i < proj.slides.length)
      .sort((a, b) => a - b);
    if (!chosen.length) { toast.error("Pick at least one slide"); return; }
    setBusy(true);
    try {
      const pdf = new jsPDF({
        orientation: CANVAS.h > CANVAS.w ? "portrait" : "landscape",
        unit: "px", format: [CANVAS.w, CANVAS.h], compress: true,
      });
      for (let k = 0; k < chosen.length; k++) {
        const dataUrl = await renderSlideToDataUrl(chosen[k]);
        if (k > 0) pdf.addPage([CANVAS.w, CANVAS.h], CANVAS.h > CANVAS.w ? "portrait" : "landscape");
        pdf.addImage(dataUrl, "PNG", 0, 0, CANVAS.w, CANVAS.h);
      }
      pdf.save(`${(proj.topic || "carousel").slice(0, 40).replace(/\W+/g, "-")}-${chosen.length}-slides.pdf`);
      toast.success(`Exported ${chosen.length}-page PDF`);
    } catch (err) {
      console.error(err);
      toast.error("PDF export failed");
    } finally { setBusy(false); }
  };

  /* --- Brand kit apply / AI copy assist --- */
  const applyBrandKit = async (kit) => {
    if (!kit) return;
    mutate((n) => {
      if (kit.palette_id) n.palette_id = kit.palette_id;
      n.brand = { ...(n.brand || {}), logo_url: kit.logo_url, colors: kit.colors, fonts: kit.fonts };
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
        project_id: id, slide_index: activeSlide,
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
            <button onClick={() => setViewMode(viewMode === "focus" ? "board" : "focus")} data-testid="view-mode-toggle" className="btn-ghost">
              {viewMode === "focus" ? <><LayoutGrid size={14} /> Board</> : <><Maximize2 size={14} /> Focus</>}
            </button>
            <button onClick={() => setShowPanorama(true)} data-testid="panorama-open" className="btn-secondary"><Mountain size={14} /> Panorama</button>
            <button onClick={() => setShowAiImage(true)} data-testid="ai-image-open" className="btn-secondary"><Wand2 size={14} /> AI Image</button>
            <button onClick={() => setShowBrandKit(true)} data-testid="brand-kit-open" className="btn-secondary"><Sparkles size={14} /> Brand kit</button>
            <button onClick={exportSlidePng} data-testid="export-png-btn" className="btn-secondary"><Download size={14} /> PNG</button>
            <button onClick={() => setShowPdfPicker(true)} disabled={busy} data-testid="export-pdf-btn" className="btn-secondary"><FileText size={14} /> PDF</button>
            <button onClick={save} disabled={busy} data-testid="save-carousel-btn" className="btn-primary">
              {busy ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : <><Save size={14} /> Save</>}
            </button>
          </div>
        }
      />

      {viewMode === "focus" ? (
        <div className="grid grid-cols-12 min-h-[calc(100vh-90px)] bg-neutral-100">
          <aside className="col-span-2 border-r border-line bg-white overflow-y-auto">
            <LeftPanel
              onTemplate={(tpl) => addSlide(tpl)}
              onAddText={(preset) => addElement(preset)}
              onAddShape={(shape) => addElement({ type: "shape", shape, x: 400, y: 500, w: 280, h: 280, fill: "accent", opacity: 1, radius: shape === "circle" ? 999 : 24 })}
              onAddBadge={() => addElement({ type: "badge", x: 80, y: 96, text: "NEW", bg: "accent", color: "bg", radius: 999, size: 20 })}
              onAddIcon={(name) => addElement({ type: "icon", x: 400, y: 500, w: 128, name, color: "accent", stroke: 2 })}
              onAddImage={() => imageFileRef.current?.click()}
              onAddImageUrl={() => {
                const url = prompt("Paste image URL (PNG/JPG/SVG)");
                if (url && url.trim()) addElement({ type: "image", src: url.trim(), x: 300, y: 400, w: 480, h: 480, fit: "cover", radius: 24 });
              }}
            />
          </aside>

          <section className="col-span-7 relative overflow-auto"
            onDragOver={onCanvasDragOver} onDragLeave={onCanvasDragLeave} onDrop={onCanvasDrop}>
            {dropHint && (
              <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
                <div className="bg-ink text-white px-4 py-2 rounded-full font-mono text-xs uppercase tracking-widest">Drop image to add</div>
              </div>
            )}
            <div className="p-6 flex items-start justify-center">
              <div className="relative" style={{ width: CANVAS.w * zoom, height: CANVAS.h * zoom }}>
                <div
                  ref={canvasRef}
                  onClick={() => setSelectedId(null)}
                  className={`absolute inset-0 origin-top-left overflow-hidden shadow-[0_20px_80px_-30px_rgba(0,0,0,0.35)] rounded-md ${dropHint ? "ring-2 ring-ink" : ""}`}
                  style={{ width: CANVAS.w, height: CANVAS.h, transform: `scale(${zoom})`, transformOrigin: "top left", background: renderBackground(slide.bg, palette) }}
                >
                  <PanoramaLayer panorama={proj.panorama} slideIdx={activeSlide} totalSlides={proj.slides.length} />
                  {panoManual && (
                    <div
                      onPointerDown={onPanoDragStart}
                      onWheel={onPanoWheel}
                      data-testid="pano-drag-overlay"
                      style={{ position: "absolute", inset: 0, cursor: "grab", background: "transparent", zIndex: 1 }}
                      title="Drag to pan · scroll to zoom"
                    />
                  )}
                  {slide.elements.map((el) => (
                    <ElementRender key={el.id} el={el} palette={palette} selected={selectedId === el.id}
                      onPointerDown={(e) => onPointerDown(e, el)} />
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

          <aside className="col-span-3 border-l border-line bg-white overflow-y-auto">
            <RightPanel
              proj={proj} palette={palette} slide={slide} selected={selected} activeSlide={activeSlide}
              onPalette={(pid) => setProj({ ...proj, palette_id: pid })}
              onBg={(bg) => patchSlide({ bg })}
              onEditElement={(patch) => selected && patchElement(selected.id, patch)}
              onDelete={() => selected && deleteElement(selected.id)}
              onDuplicate={() => selected && duplicateElement(selected.id)}
              onFront={() => selected && bringToFront(selected.id)}
              onBack={() => selected && sendToBack(selected.id)}
              onAiAssist={aiAssistText}
              onPanoramaViewport={setPanoViewport}
              onPanoramaResetSlide={resetPanoSlide}
              onPanoramaApplyAll={applyPanoToAll}
            />
          </aside>
        </div>
      ) : (
        <BoardView
          proj={proj} palette={palette}
          onFocus={(i) => { setActiveSlide(i); setSelectedId(null); setViewMode("focus"); }}
        />
      )}

      {showBrandKit && (
        <BrandKitDrawer
          onClose={() => setShowBrandKit(false)} kits={brandKits}
          onSaved={(kit) => setBrandKits((k) => [kit, ...k])}
          onDeleted={(bid) => setBrandKits((k) => k.filter((x) => x.id !== bid))}
          onApply={(kit) => { applyBrandKit(kit); setShowBrandKit(false); }}
        />
      )}

      {showAiImage && (
        <AiImageDrawer
          onClose={() => setShowAiImage(false)}
          onAddAsElement={(dataUrl) => {
            addElement({ type: "image", src: dataUrl, x: 120, y: 240, w: 840, h: 840, fit: "cover", radius: 24 });
            setShowAiImage(false);
            toast.success("Image added to slide");
          }}
          onAddAsBackground={(dataUrl) => {
            mutate((n) => {
              const s = n.slides[activeSlide];
              s.elements = (s.elements || []).filter((el) => !(el.type === "image" && el.role === "background"));
              s.elements.unshift({ id: newId(), type: "image", role: "background", src: dataUrl, x: 0, y: 0, w: CANVAS.w, h: CANVAS.h, fit: "cover", radius: 0 });
            });
            setShowAiImage(false);
            toast.success("Background applied");
          }}
        />
      )}

      {showPanorama && (
        <PanoramaDrawer
          onClose={() => setShowPanorama(false)}
          panorama={proj.panorama} slideCount={proj.slides.length}
          onApply={(pano) => {
            mutate((n) => { n.panorama = pano; });
            setShowPanorama(false);
            toast.success(pano ? "Panorama applied to deck" : "Panorama removed");
          }}
        />
      )}

      {showPdfPicker && (
        <PdfExportDialog
          proj={proj} palette={palette} busy={busy}
          onClose={() => setShowPdfPicker(false)}
          onExport={async (indices) => { setShowPdfPicker(false); await exportPdfSlides(indices); }}
        />
      )}

      <input
        ref={imageFileRef}
        type="file" accept="image/*" multiple className="hidden"
        data-testid="editor-image-upload"
        onChange={(e) => { onImageFilesSelected(e.target.files); e.target.value = ""; }}
      />
    </div>
  );
}
