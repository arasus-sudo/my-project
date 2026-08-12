import { useEffect, useMemo, useRef, useState, useCallback, Fragment } from "react";
import { createRoot } from "react-dom/client";
import { useParams, useNavigate } from "react-router-dom";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { toast } from "sonner";
import {
  Save, Download, ChevronLeft, Loader2, Plus, Trash2, Copy,
  Palette, Undo2, Redo2, PenSquare, ImagePlus, FileText, LayoutGrid, Maximize2, Mountain, Play, Image as ImageIcon, Search, Send,
} from "lucide-react";

import { api, isCreditError } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { useAuth } from "../lib/auth";
import { PALETTES, CANVAS as DEFAULT_CANVAS, blankSlide, slideFromTemplate } from "../lib/creqTemplates";
import { STYLES, LAYOUTS } from "../lib/creqStyles";
import { ACCENT_ELEMENTS, DESIGN_THEMES, COMPOSITIONS, IMAGE_FRAMES } from "../lib/creqDesignEngine";
import { ensureProjectFontsLoaded, waitForProjectFonts } from "../lib/googleFonts";
import { buildPremiumDeck, isPremiumSlide, recomposeSlide } from "../lib/creqPremiumEngine";
import { DEFAULT_FAMILY } from "../lib/creqClaudeDesign";

import LeftPanel from "../components/creq/LeftPanel";
import RightPanel from "../components/creq/RightPanel";
import BoardView from "../components/creq/BoardView";
import ElementRender from "../components/creq/ElementRender";
import SelectionChrome from "../components/creq/SelectionChrome";
import InlineTextEditor from "../components/creq/InlineTextEditor";
import SlidePreview from "../components/creq/SlidePreview";
import PanoramaLayer from "../components/creq/PanoramaLayer";
import DeckOverlay from "../components/creq/DeckOverlay";
import BrandKitDrawer from "../components/creq/drawers/BrandKitDrawer";
import AiImageDrawer from "../components/creq/drawers/AiImageDrawer";
import ImageGalleryDrawer from "../components/creq/drawers/ImageGalleryDrawer";
import StockPhotoDrawer from "../components/creq/drawers/StockPhotoDrawer";
import PanoramaDrawer from "../components/creq/drawers/PanoramaDrawer";
import PdfExportDialog, { EXPORT_QUALITIES } from "../components/creq/drawers/PdfExportDialog";
import PublishToLinkedInDialog from "../components/creq/drawers/PublishToLinkedInDialog";
import { newId, renderBackground, renderBackgroundImageCss, stripLocalKeys, elementBounds } from "../components/creq/utils";
import { makeFlow, fitToCanvas, contentBox, auditAndCorrect, rescaleSlideGeometry } from "../lib/creqLayoutFlow";

/** Resolve a project's actual authoring canvas — real per-project sizing
 * (LinkedIn/Instagram Square/Instagram Story/custom, see PLATFORM_DIMS in
 * backend/server.py) for decks created after this existed; the fixed
 * 1080x1350 default for every deck created before it, so old projects keep
 * opening exactly as authored. */
function canvasFor(project) {
  return project?.canvas?.w && project?.canvas?.h ? project.canvas : DEFAULT_CANVAS;
}

// Autosave cadence. This is a poll, not a debounce: the tick is cheap because
// it exits immediately unless the document is actually dirty, so an idle editor
// costs nothing while an active one is never more than this far from durable.
const AUTOSAVE_INTERVAL_MS = 5000;

/* ------------------------- Project load / hydrate ------------------------- */

/** Convert one backend/LLM-drafted slide `{title,subtitle,body,cta}` into the
 * editor's element-list shape. Shared by hydrate() (loading a project that
 * still has legacy-shape slides) and the in-editor "Generate content" action
 * (appending freshly-generated slides to an already-open deck). Uses the same
 * vertical-flow layout as the premium engine (creqLayoutFlow.js) so standard
 * mode can't overlap either, and scales to the deck's actual canvas instead
 * of a literal 1080x1350-only layout. */
function legacySlideToElements(s, canvas = DEFAULT_CANVAS) {
  const { pad, cw } = contentBox(canvas);
  const flow = makeFlow(pad, canvas.h * 0.09, cw);
  if (s.subtitle) {
    flow.addText(s.subtitle, {
      font: "JetBrains Mono", size: Math.round(canvas.w * 0.0222), weight: 500,
      uppercase: true, letterSpacing: 0.2, color: "muted", gap: canvas.h * 0.024,
    });
  }
  if (s.title) {
    flow.addText(s.title, {
      font: "Archivo Black", size: Math.round(canvas.w * 0.122), weight: 900,
      color: "accent", lineHeight: 0.95, gap: canvas.h * 0.03,
    });
  }
  if (s.body) {
    flow.addText(s.body, {
      font: "Inter", size: Math.round(canvas.w * 0.0296), weight: 400,
      color: "text", lineHeight: 1.4, gap: canvas.h * 0.027,
    });
  }
  if (s.cta) flow.addBadge(s.cta, { size: Math.round(canvas.w * 0.0204) });
  const audited = auditAndCorrect(fitToCanvas(flow, canvas), canvas);
  return { _k: newId(), bg: { type: "solid", color: "bg" }, elements: audited.elements };
}

function hydrate(project) {
  const p = { ...project };
  p.palette_id = p.palette_id || "midnight";
  p.canvas = canvasFor(project);
  const canvas = p.canvas;
  const raw = p.slides || [];
  // Premium decks compose at DECK level, not slide by slide: which slides go
  // dark, and where, is a property of the sequence (see planSurfaces()). A
  // per-slide loop physically cannot make that decision, which is why premium
  // decks used to render as one flat surface repeated N times.
  const unbuilt = raw.filter((s) => s && !s.elements && (s.title || s.body || s.subtitle));
  const premiumDeck = unbuilt.length > 0 && unbuilt.every(isPremiumSlide);
  const builtPremium = premiumDeck
    ? buildPremiumDeck(unbuilt, {
        canvas,
        familyId: project.palette_family || DEFAULT_FAMILY,
        brand: project.palette_family === "brand" ? project.brand : null,
      })
    : [];
  let premiumIdx = 0;
  p.slides = raw.map((s) => {
    if (s && !s.elements && (s.title || s.body || s.subtitle)) {
      return premiumDeck ? builtPremium[premiumIdx++] : legacySlideToElements(s, canvas);
    }
    return {
      _k: s._k || newId(),
      bg: s.bg || { type: "solid", color: "bg" },
      elements: (s.elements || []).map((e) => ({ ...e, id: e.id || newId() })),
      // Carried through, not dropped: these record how the slide was composed
      // and from what. Rebuilding this object without them silently downgraded
      // every reopened deck to rescale-only, because the engine had nothing
      // left to lay out again from.
      ...(s._premium ? { _premium: s._premium } : null),
      ...(s._source ? { _source: s._source } : null),
    };
  });
  if (!p.slides.length) p.slides.push(blankSlide());
  p.brand = normalizeBrand(p.brand);
  // Every carousel carries "Made with Innoira Agentic Suite" branding by
  // default — `??` (not `||`) so an explicit `false` a user already saved
  // (they turned it off) stays off, but a field that's simply missing
  // (every carousel created before this existed, or freshly generated by
  // the backend) defaults to on.
  p.show_branding = project.show_branding ?? true;
  return p;
}

/** The editor and the backend's carousel-generate step have historically
 * written two different `brand` shapes — the editor's own
 * `{logo_url, colors, fonts}` (see applyBrandKit below) and the generator's
 * legacy `{bg, accent, text, font, logo_text}`. Normalize to one shape on
 * load so the editor only ever has to read/write a single schema. */
function normalizeBrand(brand) {
  if (!brand) return { logo_url: null, colors: [], fonts: [] };
  if ("colors" in brand || "logo_url" in brand) {
    // Already the editor's shape.
    return { logo_url: brand.logo_url ?? null, colors: brand.colors || [], fonts: brand.fonts || [] };
  }
  // Legacy generator shape — carry over what maps cleanly, drop the rest.
  const colors = [brand.bg, brand.accent, brand.text].filter(Boolean);
  const fonts = brand.font ? [brand.font] : [];
  return { logo_url: null, colors, fonts };
}

/* ------------------------------- Editor ---------------------------------- */

/** Canva/Figma-style smart snapping. Given the element being dragged (its
 * proposed x/y + size) and the other elements on the slide, snap each of the
 * element's 3 vertical edges (left/center/right) and 3 horizontal edges
 * (top/middle/bottom) to the nearest matching edge of another element or of
 * the canvas itself, within a small threshold. Returns the adjusted x/y and
 * the guide lines to draw. */
function computeSnap(dragged, propX, propY, others, canvas, threshold = 7) {
  const w = dragged.w || 0, h = dragged.h || 0;
  // Candidate vertical lines (x positions) and horizontal lines (y positions).
  const vTargets = [0, canvas.w / 2, canvas.w];
  const hTargets = [0, canvas.h / 2, canvas.h];
  others.forEach((o) => {
    vTargets.push(o.x, o.x + (o.w || 0) / 2, o.x + (o.w || 0));
    hTargets.push(o.y, o.y + (o.h || 0) / 2, o.y + (o.h || 0));
  });

  let x = propX, y = propY;
  const guideLines = [];

  // Vertical snapping — element's left, center, right against each x target.
  const vEdges = [propX, propX + w / 2, propX + w];
  let bestV = null;
  vTargets.forEach((t) => {
    vEdges.forEach((edge, ei) => {
      const d = Math.abs(edge - t);
      if (d <= threshold && (!bestV || d < bestV.d)) bestV = { d, t, ei };
    });
  });
  if (bestV) {
    x = propX + (bestV.t - vEdges[bestV.ei]);
    guideLines.push({ o: "v", pos: bestV.t });
  }

  // Horizontal snapping — element's top, middle, bottom against each y target.
  const hEdges = [propY, propY + h / 2, propY + h];
  let bestH = null;
  hTargets.forEach((t) => {
    hEdges.forEach((edge, ei) => {
      const d = Math.abs(edge - t);
      if (d <= threshold && (!bestH || d < bestH.d)) bestH = { d, t, ei };
    });
  });
  if (bestH) {
    y = propY + (bestH.t - hEdges[bestH.ei]);
    guideLines.push({ o: "h", pos: bestH.t });
  }

  return { x: Math.round(x), y: Math.round(y), guides: guideLines };
}

export default function CreateEQEditor() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const [proj, setProj] = useState(null);
  // Shadows the fixed DEFAULT_CANVAS import for every render/export helper
  // below — a deck created at Instagram Story (1080x1920) or a custom size
  // now actually authors/exports at that size instead of always 1080x1350.
  const CANVAS = proj?.canvas?.w && proj?.canvas?.h ? proj.canvas : DEFAULT_CANVAS;
  const [activeSlide, setActiveSlide] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [marqueeRect, setMarqueeRect] = useState(null);
  const [guides, setGuides] = useState([]); // smart-snap alignment lines during drag
  const marqueeState = useRef(null);
  const selectSingle = useCallback((id) => {
    setSelectedId(id);
    setSelectedIds(id ? new Set([id]) : new Set());
  }, []);
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [autosaveFailed, setAutosaveFailed] = useState(false);
  const [zoom, setZoom] = useState(0.38);
  const [brandKits, setBrandKits] = useState([]);
  const [showBrandKit, setShowBrandKit] = useState(false);
  const [showAiImage, setShowAiImage] = useState(false);
  const [showImageGallery, setShowImageGallery] = useState(false);
  const [showStockPhotos, setShowStockPhotos] = useState(false);
  const [showPanorama, setShowPanorama] = useState(false);
  const [showPdfPicker, setShowPdfPicker] = useState(false);
  const [showPublish, setShowPublish] = useState(false);
  const [showGenerateContent, setShowGenerateContent] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [viewMode, setViewMode] = useState("focus");
  const [dropHint, setDropHint] = useState(false);
  const [customTemplates, setCustomTemplates] = useState(() => {
    try { return JSON.parse(localStorage.getItem("creq_custom_templates") || "[]"); } catch { return []; }
  });
  const canvasRef = useRef(null);
  const dragState = useRef(null);
  const resizeState = useRef(null);
  const rotateState = useRef(null);
  const groupResizeState = useRef(null);
  const panoDragState = useRef(null);
  const dropTargetRef = useRef(null);
  const [dropTargetElId, setDropTargetElId] = useState(null);
  const [repositionTargetId, setRepositionTargetId] = useState(null);
  const repositionState = useRef(null);
  const [ctxMenu, setCtxMenu] = useState(null);
  // Live manipulation readout for the HUD pill in SelectionChrome —
  // { mode: "drag"|"resize"|"rotate", label } while a gesture is in flight.
  const [interaction, setInteraction] = useState(null);
  // Badges auto-size to their text, so the chrome can't trust their stored
  // w/h — ElementRender reports real rendered bounds here (canvas px).
  // Kept in a ref (the map identity changes rarely) with a tick to re-render
  // the chrome when a measurement actually moves.
  const measuredRef = useRef({});
  const [, setMeasureTick] = useState(0);
  // Double-click inline text editing — id of the text element being edited.
  const [editingId, setEditingId] = useState(null);
  // The scrollable canvas section — ctrl-wheel zoom + fit-to-view need it.
  const sectionRef = useRef(null);
  const historyRef = useRef({ past: [], future: [] });
  const clipboardRef = useRef(null); // { el } — copied element for paste
  const imageFileRef = useRef(null);
  // Always-current project snapshot, so gesture helpers can read state without
  // being re-created (and re-subscribing) on every render.
  const projRef = useRef(null);
  // A "gesture" is one continuous burst of edits (a drag, a resize, a slider
  // sweep). We push a single history snapshot at its start, then update state
  // live without re-serialising the whole project on every frame.
  const gestureActive = useRef(false);
  const endGestureTimer = useRef(null);
  // Autosave bookkeeping. dirtyRef is set by every mutation and cleared only by
  // a completed save, so an untouched editor issues no requests; savingRef stops
  // a slow save from overlapping the next tick.
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);

  useEffect(() => {
    api.get(`/carousel/${id}`).then((r) => {
      const hydrated = hydrate(r.data);
      setProj(hydrated);
      // A saved deck can reference any of the ~1900 Google Fonts, not just the
      // 10 preloaded in index.html — without this, reopening a project would
      // silently render text in the browser's fallback font until each text
      // element happened to be selected (which re-triggers the picker's load).
      ensureProjectFontsLoaded(hydrated.slides);
    });
    api.get("/brandkits").then((r) => setBrandKits(r.data)).catch(() => {});
  }, [id]);

  useEffect(() => { projRef.current = proj; }, [proj]);

  // Refs mirroring hot state, so pointer handlers can be created ONCE instead
  // of on every zoom/selection/slide change — without this, every selection
  // click re-renders all memo'd ElementRenders through new callback props.
  const zoomRef = useRef(zoom);
  const activeSlideRef = useRef(activeSlide);
  const selectedIdsRef = useRef(selectedIds);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { activeSlideRef.current = activeSlide; }, [activeSlide]);
  useEffect(() => { selectedIdsRef.current = selectedIds; }, [selectedIds]);

  const onElementMeasure = useCallback((elId, size) => {
    const cur = measuredRef.current[elId];
    if (cur && Math.abs(cur.w - size.w) < 0.5 && Math.abs(cur.h - size.h) < 0.5) return;
    measuredRef.current = { ...measuredRef.current, [elId]: size };
    setMeasureTick((t) => t + 1);
  }, []);

  // "ai" isn't one of the 10 fixed PALETTES swatches — it's a bespoke 5-color
  // identity either invented by the Premium AI prompt (no brand supplied) or
  // built from the logo/colors the user provided in the Premium wizard. See
  // backend/server.py's carousel_generate deck_theme handling.
  const palette = useMemo(() => {
    if (proj?.palette_id === "ai" && proj?.ai_palette) {
      const ai = proj.ai_palette;
      return { id: "ai", name: "Generated", bg: ai.bg, bg2: ai.bg2, accent: ai.accent, text: ai.text, muted: ai.muted };
    }
    return PALETTES.find((p) => p.id === proj?.palette_id) || PALETTES[0];
  }, [proj?.palette_id, proj?.ai_palette]);

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
    // Undo/redo change the document too, so they must mark it dirty — otherwise
    // undoing back to an earlier state would never be persisted.
    dirtyRef.current = true;
    setProj((cur) => {
      if (!cur) return cur;
      h.future.push(JSON.stringify(cur));
      return JSON.parse(h.past.pop());
    });
  }, []);
  const redo = useCallback(() => {
    const h = historyRef.current;
    if (!h.future.length) return;
    dirtyRef.current = true;
    setProj((cur) => {
      if (!cur) return cur;
      h.past.push(JSON.stringify(cur));
      return JSON.parse(h.future.pop());
    });
  }, []);
  const mutate = useCallback((updater) => {
    dirtyRef.current = true;
    setProj((cur) => {
      if (!cur) return cur;
      pushHistory(JSON.stringify(cur));
      const next = { ...cur, slides: cur.slides.map((s) => ({ ...s, elements: [...(s.elements || [])] })) };
      updater(next);
      return next;
    });
  }, [pushHistory]);

  /** Same shape as mutate(), but never serialises the project — for use
   * inside an active gesture (drag/resize/slider-sweep/typing) where history
   * was already captured once by beginGesture(). */
  const mutateLive = useCallback((updater) => {
    dirtyRef.current = true;
    setProj((cur) => {
      if (!cur) return cur;
      const next = { ...cur, slides: cur.slides.map((s) => ({ ...s, elements: [...(s.elements || [])] })) };
      updater(next);
      return next;
    });
  }, []);

  /** Call at the start of a continuous interaction (pointerdown, focus,
   * mousedown on a slider) to push exactly one history snapshot for the
   * whole gesture. Safe to call repeatedly — only the first call in a
   * gesture actually pushes. Includes a self-healing timeout in case the
   * matching endGesture() is missed (e.g. picking an option from a native
   * <select> popup never fires a pointerup our container can see) — without
   * it, a missed end would leave every future edit silently skipping history
   * until some unrelated pointer event happened to reset it. */
  const beginGesture = useCallback(() => {
    if (endGestureTimer.current) clearTimeout(endGestureTimer.current);
    endGestureTimer.current = setTimeout(() => { gestureActive.current = false; }, 1500);
    if (gestureActive.current) return;
    gestureActive.current = true;
    if (projRef.current) pushHistory(JSON.stringify(projRef.current));
  }, [pushHistory]);

  /** Call at the end of a continuous interaction (pointerup, blur). */
  const endGesture = useCallback(() => {
    gestureActive.current = false;
    if (endGestureTimer.current) { clearTimeout(endGestureTimer.current); endGestureTimer.current = null; }
  }, []);

  /* --- Slide / element mutations --- */
  const patchSlide = useCallback((patch) => mutate((n) => Object.assign(n.slides[activeSlide], patch)), [mutate, activeSlide]);
  const patchElement = useCallback((elId, patch) => {
    const m = gestureActive.current ? mutateLive : mutate;
    m((n) => {
      const s = n.slides[activeSlideRef.current];
      s.elements = s.elements.map((e) => (e.id === elId ? { ...e, ...patch } : e));
    });
  }, [mutate, mutateLive]);
  const addElement = (el) => {
    const withId = { ...el, id: newId() };
    mutate((n) => n.slides[activeSlide].elements.push(withId));
    selectSingle(withId.id);
  };
  const deleteElement = (elId) => {
    mutate((n) => { n.slides[activeSlide].elements = n.slides[activeSlide].elements.filter((e) => e.id !== elId); });
    selectSingle(null);
  };
  const deleteSelectedElements = () => {
    if (selectedIds.size <= 1) { deleteElement(selectedId); return; }
    mutate((n) => { n.slides[activeSlide].elements = n.slides[activeSlide].elements.filter((e) => !selectedIds.has(e.id)); });
    selectSingle(null);
  };
  /** Nudge every selected element by (dx, dy) canvas px — arrow keys. */
  const nudgeSelected = (dx, dy) => {
    if (!selectedIds.size) return;
    mutate((n) => {
      n.slides[activeSlide].elements = n.slides[activeSlide].elements.map((e) =>
        selectedIds.has(e.id) ? { ...e, x: Math.round((e.x || 0) + dx), y: Math.round((e.y || 0) + dy) } : e);
    });
  };
  /** Align / distribute the selected elements against their common bounding
   * box (Canva-style). With a single element selected, "center"/"middle" align
   * it to the canvas instead, which is the more useful behaviour there. */
  const alignSelected = (mode) => {
    const els = slide.elements.filter((e) => selectedIds.has(e.id));
    if (!els.length) return;
    const single = els.length === 1;
    const minX = Math.min(...els.map((e) => e.x));
    const maxX = Math.max(...els.map((e) => e.x + (e.w || 0)));
    const minY = Math.min(...els.map((e) => e.y));
    const maxY = Math.max(...els.map((e) => e.y + (e.h || 0)));
    const cX = single ? CANVAS.w / 2 : (minX + maxX) / 2;
    const cY = single ? CANVAS.h / 2 : (minY + maxY) / 2;
    const patch = {};
    if (mode === "left") els.forEach((e) => { patch[e.id] = { x: Math.round(minX) }; });
    if (mode === "right") els.forEach((e) => { patch[e.id] = { x: Math.round(maxX - (e.w || 0)) }; });
    if (mode === "hcenter") els.forEach((e) => { patch[e.id] = { x: Math.round(cX - (e.w || 0) / 2) }; });
    if (mode === "top") els.forEach((e) => { patch[e.id] = { y: Math.round(minY) }; });
    if (mode === "bottom") els.forEach((e) => { patch[e.id] = { y: Math.round(maxY - (e.h || 0)) }; });
    if (mode === "vcenter") els.forEach((e) => { patch[e.id] = { y: Math.round(cY - (e.h || 0) / 2) }; });
    if (mode === "dist-h" && els.length > 2) {
      const sorted = [...els].sort((a, b) => a.x - b.x);
      const span = (sorted[sorted.length - 1].x) - sorted[0].x;
      const step = span / (sorted.length - 1);
      sorted.forEach((e, i) => { patch[e.id] = { x: Math.round(sorted[0].x + step * i) }; });
    }
    if (mode === "dist-v" && els.length > 2) {
      const sorted = [...els].sort((a, b) => a.y - b.y);
      const span = (sorted[sorted.length - 1].y) - sorted[0].y;
      const step = span / (sorted.length - 1);
      sorted.forEach((e, i) => { patch[e.id] = { y: Math.round(sorted[0].y + step * i) }; });
    }
    mutate((n) => {
      n.slides[activeSlide].elements = n.slides[activeSlide].elements.map((e) =>
        patch[e.id] ? { ...e, ...patch[e.id] } : e);
    });
  };
  const duplicateElement = (elId) => {
    const src = slide.elements.find((e) => e.id === elId);
    if (!src) return;
    const copy = { ...src, id: newId(), x: (src.x || 0) + 40, y: (src.y || 0) + 40 };
    mutate((n) => n.slides[activeSlide].elements.push(copy));
    selectSingle(copy.id);
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

  /* --- Element grouping --- */
  const groupElements = useCallback(() => {
    const ids = [...selectedIds];
    if (ids.length < 2) return;
    const groupId = newId();
    mutate((n) => {
      const s = n.slides[activeSlide];
      s.groups = s.groups || [];
      s.groups.push({ id: groupId, name: `Group ${s.groups.length + 1}`, elementIds: ids });
    });
    toast.success(`Grouped ${ids.length} elements`);
  }, [selectedIds, activeSlide, mutate]);
  const ungroupElements = useCallback(() => {
    // If a single element is selected and it belongs to a group, ungroup that group.
    const s = proj?.slides?.[activeSlide];
    if (!s || !s.groups) return;
    const id = selectedId;
    if (!id) return;
    const group = s.groups.find((g) => g.elementIds.includes(id));
    if (!group) return;
    mutate((n) => {
      n.slides[activeSlide].groups = (n.slides[activeSlide].groups || []).filter((g) => g.id !== group.id);
    });
    toast.success("Ungrouped");
  }, [selectedId, activeSlide, proj, mutate]);
  /** Get group ids for the active selection — used by drag to move all members. */
  const getGroupMemberIds = useCallback((ids) => {
    if (!ids || !ids.size) return ids;
    const s = proj?.slides?.[activeSlide];
    if (!s || !s.groups) return ids;
    const out = new Set(ids);
    for (const g of s.groups) {
      const hasAny = g.elementIds.some((eid) => ids.has(eid));
      if (hasAny) g.elementIds.forEach((eid) => out.add(eid));
    }
    return out;
  }, [proj, activeSlide]);

  /* --- Slides --- */
  const saveSlideAsTemplate = () => {
    const s = proj?.slides?.[activeSlide];
    if (!s) return;
    const tpl = {
      id: "custom-" + newId(),
      name: `Slide ${activeSlide + 1}`,
      tag: "Custom",
      palette: proj?.palette_id || "midnight",
      thumb_bg: "#E8E9EB",
      thumb_accent: "#212025",
      build: () => ({ bg: JSON.parse(JSON.stringify(s.bg)), elements: s.elements.map((e) => JSON.parse(JSON.stringify(e))) }),
    };
    const updated = [...customTemplates, tpl];
    setCustomTemplates(updated);
    localStorage.setItem("creq_custom_templates", JSON.stringify(updated));
    toast.success("Saved as custom template");
  };
  const addSlide = () => {
    mutate((n) => { n.slides.push(blankSlide()); });
    setActiveSlide(proj.slides.length);
    selectSingle(null);
  };
  /** Clicking a template in the LeftPanel restyles the currently active
   * slide with that template's layout — it does not add a new slide (that's
   * what the "+ Slide" button is for). */
  const applyTemplateToSlide = (tpl) => {
    const built = slideFromTemplate(tpl);
    mutate((n) => {
      const cur = n.slides[activeSlide];
      n.slides[activeSlide] = { ...built, _k: cur._k };
    });
    selectSingle(null);
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
    selectSingle(null);
  };

  /* --- Panorama manual controls --- */
  const setPanoViewport = useCallback((vp) => {
    const m = gestureActive.current ? mutateLive : mutate;
    m((n) => {
      n.panorama = n.panorama || {};
      n.panorama.viewports = n.panorama.viewports || [];
      n.panorama.viewports[activeSlide] = { ox: vp.ox ?? 50, oy: vp.oy ?? 50, scale: vp.scale ?? 1 };
    });
  }, [mutate, mutateLive, activeSlide]);
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
  const onCanvasDragOver = (e) => {
    if (e.dataTransfer?.types?.includes("Files")) {
      e.preventDefault();
      setDropHint(true);
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const cx = Math.round((e.clientX - rect.left) / zoom);
      const cy = Math.round((e.clientY - rect.top) / zoom);
      const els = slide?.elements || [];
      let found = null;
      for (let i = els.length - 1; i >= 0; i--) {
        const el = els[i];
        if (el.locked) continue;
        if (el.type === "image" && (el.frame || !el.src)) {
          if (cx >= el.x && cx <= el.x + el.w && cy >= el.y && cy <= el.y + el.h) {
            found = el.id; break;
          }
        }
      }
      if (found !== dropTargetRef.current) {
        dropTargetRef.current = found;
        setDropTargetElId(found);
      }
    }
  };
  const onCanvasDragLeave = () => { setDropHint(false); dropTargetRef.current = null; setDropTargetElId(null); };
  const onCanvasDrop = async (e) => {
    e.preventDefault();
    setDropHint(false);
    const targetId = dropTargetRef.current;
    dropTargetRef.current = null;
    setDropTargetElId(null);
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
    for (const f of files) {
      try {
        if (targetId) {
          const reader = new FileReader();
          await new Promise((resolve, reject) => {
            reader.onload = () => { patchElement(targetId, { src: String(reader.result || "") }); toast.success("Image placed in frame"); resolve(); };
            reader.onerror = () => reject();
            reader.readAsDataURL(f);
          });
          break;
        } else {
          await insertImageFile(f, { x: px, y: py });
          px += 40; py += 40;
        }
      } catch { /* skip */ }
    }
  };

  /* --- Pointer drag: move selected element(s) ---
   * Shift-click toggles an element in/out of the multi-selection (and never
   * starts a drag, matching Figma). Clicking a plain (non-shift) element that's
   * already part of a multi-selection keeps the whole group selected so it can
   * be dragged together; clicking a non-selected element replaces the
   * selection with just that one, as usual. */
  const onPointerDown = useCallback((e, el) => {
    e.stopPropagation();
    if (el.locked) return;
    if (repositionTargetId === el.id) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      repositionState.current = {
        startX: e.clientX, startY: e.clientY,
        origOffsetX: el.imgOffsetX || 0,
        origOffsetY: el.imgOffsetY || 0,
      };
      const onMove = (ev) => {
        const dx = (ev.clientX - repositionState.current.startX) / zoomRef.current;
        const dy = (ev.clientY - repositionState.current.startY) / zoomRef.current;
        const elW = el.w || 480, elH = el.h || 480;
        const pctX = Math.round((dx / elW) * 100);
        const pctY = Math.round((dy / elH) * 100);
        patchElement(el.id, {
          imgOffsetX: Math.max(-50, Math.min(50, repositionState.current.origOffsetX + pctX)),
          imgOffsetY: Math.max(-50, Math.min(50, repositionState.current.origOffsetY + pctY)),
        });
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        repositionState.current = null;
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      return;
    }
    if (e.shiftKey) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(el.id)) next.delete(el.id); else next.add(el.id);
        return next;
      });
      setSelectedId(el.id);
      return;
    }
    const prevIds = selectedIdsRef.current;
    let ids = (prevIds.has(el.id) && prevIds.size > 1) ? prevIds : new Set([el.id]);
    // Expand to entire group if this element is grouped
    const expandedIds = getGroupMemberIds(ids);
    if (expandedIds.size > ids.size) ids = expandedIds;
    if (ids !== prevIds) selectSingle(el.id);
    else setSelectedId(el.id);
    const slideNow = projRef.current?.slides?.[activeSlideRef.current];
    if (!slideNow) return;
    beginGesture();

    // Alt-drag = duplicate-and-drag (Figma/Canva): clone the selection inside
    // the already-open gesture (one undo removes both the copies and the move)
    // and drag the clones, leaving the originals in place.
    let dragEls = slideNow.elements.filter((e2) => ids.has(e2.id));
    let dragIds = ids;
    if (e.altKey) {
      const clones = dragEls.map((e2) => ({ ...JSON.parse(JSON.stringify(e2)), id: newId() }));
      mutateLive((n) => { n.slides[activeSlideRef.current].elements.push(...clones); });
      dragIds = new Set(clones.map((c) => c.id));
      setSelectedIds(dragIds);
      setSelectedId(clones[0]?.id ?? null);
      dragEls = clones;
    }

    const starts = {};
    dragEls.forEach((e2) => { starts[e2.id] = { x: e2.x, y: e2.y }; });
    // Snap targets = every element NOT being dragged. Single drags snap the
    // element itself; group drags snap the selection's union bounding box.
    const single = dragEls.length === 1 ? dragEls[0] : null;
    const others = slideNow.elements.filter((e2) => !dragIds.has(e2.id));
    let bbox = null;
    if (!single) {
      const bs = dragEls.map((e2) => elementBounds(e2, measuredRef.current));
      const minX = Math.min(...bs.map((b) => b.x)), minY = Math.min(...bs.map((b) => b.y));
      const maxX = Math.max(...bs.map((b) => b.x + b.w)), maxY = Math.max(...bs.map((b) => b.y + b.h));
      bbox = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }
    dragState.current = { ids: dragIds, starts, startX: e.clientX, startY: e.clientY, scale: zoomRef.current, single, others, bbox };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }, [beginGesture, selectSingle, mutateLive]); // eslint-disable-line react-hooks/exhaustive-deps
  const onPointerMove = useCallback((e) => {
    const ds = dragState.current;
    if (!ds) return;
    let dx = (e.clientX - ds.startX) / ds.scale;
    let dy = (e.clientY - ds.startY) / ds.scale;
    // Shift = constrain to the dominant axis (only once a real drag is in
    // flight, so shift-click selection toggling stays untouched).
    if (e.shiftKey && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
      if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0;
    }
    if (ds.single) {
      const start = ds.starts[ds.single.id];
      const snap = computeSnap(ds.single, start.x + dx, start.y + dy, ds.others, CANVAS);
      patchElement(ds.single.id, { x: snap.x, y: snap.y });
      setGuides(snap.guides);
      setInteraction({ mode: "drag", label: `${snap.x}, ${snap.y}` });
      return;
    }
    // Group drag: snap the union bbox, then apply the snapped delta to every member.
    const snap = computeSnap({ w: ds.bbox.w, h: ds.bbox.h }, ds.bbox.x + dx, ds.bbox.y + dy, ds.others, CANVAS);
    const sdx = snap.x - ds.bbox.x, sdy = snap.y - ds.bbox.y;
    ds.ids.forEach((id) => {
      const start = ds.starts[id];
      if (!start) return;
      patchElement(id, { x: Math.round(start.x + sdx), y: Math.round(start.y + sdy) });
    });
    setGuides(snap.guides);
    setInteraction({ mode: "drag", label: `${sdx >= 0 ? "+" : ""}${Math.round(sdx)}, ${sdy >= 0 ? "+" : ""}${Math.round(sdy)}` });
  }, [patchElement]);
  const onPointerUp = useCallback(() => {
    dragState.current = null;
    setGuides([]);
    setInteraction(null);
    endGesture();
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  }, [endGesture]); // eslint-disable-line react-hooks/exhaustive-deps

  /* --- Marquee select: drag on empty canvas to box-select elements --- */
  const onCanvasBgPointerDown = useCallback((e) => {
    if (repositionTargetId) { setRepositionTargetId(null); return; }
    if (e.target !== e.currentTarget || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const startX = (e.clientX - rect.left) / zoomRef.current;
    const startY = (e.clientY - rect.top) / zoomRef.current;
    if (!e.shiftKey) selectSingle(null);
    marqueeState.current = { startX, startY, x: startX, y: startY, w: 0, h: 0, shift: e.shiftKey };
    setMarqueeRect({ x: startX, y: startY, w: 0, h: 0 });
    window.addEventListener("pointermove", onMarqueeMove);
    window.addEventListener("pointerup", onMarqueeUp);
  }, [selectSingle]); // eslint-disable-line react-hooks/exhaustive-deps
  const onMarqueeMove = useCallback((e) => {
    const ms = marqueeState.current;
    if (!ms || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const curX = (e.clientX - rect.left) / zoomRef.current;
    const curY = (e.clientY - rect.top) / zoomRef.current;
    const x = Math.min(ms.startX, curX), y = Math.min(ms.startY, curY);
    const w = Math.abs(curX - ms.startX), h = Math.abs(curY - ms.startY);
    ms.x = x; ms.y = y; ms.w = w; ms.h = h;
    setMarqueeRect({ x, y, w, h });
  }, []);
  const onMarqueeUp = useCallback(() => {
    const ms = marqueeState.current;
    marqueeState.current = null;
    setMarqueeRect(null);
    window.removeEventListener("pointermove", onMarqueeMove);
    window.removeEventListener("pointerup", onMarqueeUp);
    if (!ms || (ms.w < 4 && ms.h < 4) || !slide) return;
    const hit = new Set();
    slide.elements.forEach((el2) => {
      const overlap = el2.x < ms.x + ms.w && el2.x + el2.w > ms.x && el2.y < ms.y + ms.h && el2.y + el2.h > ms.y;
      if (overlap) hit.add(el2.id);
    });
    if (!hit.size) return;
    setSelectedIds((prev) => {
      const next = ms.shift ? new Set(prev) : new Set();
      hit.forEach((id) => next.add(id));
      return next;
    });
    setSelectedId([...hit][0]);
  }, [slide]); // eslint-disable-line react-hooks/exhaustive-deps

  /* --- Right-click context menu --- */
  const onElementContextMenu = useCallback((e, el) => {
    e.preventDefault();
    e.stopPropagation();
    selectSingle(el.id);
    setCtxMenu({ x: e.clientX, y: e.clientY, elId: el.id, locked: !!el.locked });
  }, [selectSingle]);
  const onCanvasContextMenu = useCallback((e) => {
    e.preventDefault();
    if (!canvasRef.current || !slide) { setCtxMenu(null); return; }
    const rect = canvasRef.current.getBoundingClientRect();
    const cx = (e.clientX - rect.left) / zoom;
    const cy = (e.clientY - rect.top) / zoom;
    // Find topmost element containing this point
    const els = slide.elements;
    let found = null;
    for (let i = els.length - 1; i >= 0; i--) {
      const el = els[i];
      if (cx >= el.x && cx <= el.x + el.w && cy >= el.y && cy <= el.y + el.h) {
        found = el; break;
      }
    }
    if (found) { selectSingle(found.id); setCtxMenu({ x: e.clientX, y: e.clientY, elId: found.id, locked: !!found.locked }); }
    else { setCtxMenu(null); }
  }, [selectSingle, slide, zoom]);
  const dismissCtxMenu = useCallback(() => setCtxMenu(null), []);

  /* --- Resize handles (8-directional) --- */
  const onResizeStart = useCallback((e, el, pos) => {
    if (el.locked) return;
    e.stopPropagation();
    selectSingle(el.id);
    beginGesture();
    resizeState.current = {
      id: el.id, pos,
      startX: e.clientX, startY: e.clientY,
      ox: el.x, oy: el.y, ow: el.w, oh: el.h,
      keepAspect: el.type === "image" || el.type === "icon",
      scale: zoomRef.current,
    };
    window.addEventListener("pointermove", onResizeMove);
    window.addEventListener("pointerup", onResizeEnd);
  }, [beginGesture, selectSingle]); // eslint-disable-line react-hooks/exhaustive-deps
  const onResizeMove = useCallback((e) => {
    const rs = resizeState.current;
    if (!rs) return;
    const dx = (e.clientX - rs.startX) / rs.scale;
    const dy = (e.clientY - rs.startY) / rs.scale;
    let { ox, oy, ow, oh } = rs;
    let nx = ox, ny = oy, nw = ow, nh = oh;
    const min = 24;
    // Handle position → dimension deltas
    if (rs.pos.includes("e")) nw = Math.max(min, ow + dx);
    if (rs.pos.includes("s")) nh = Math.max(min, oh + dy);
    if (rs.pos.includes("w")) { nw = Math.max(min, ow - dx); nx = ox + (ow - nw); }
    if (rs.pos.includes("n")) { nh = Math.max(min, oh - dy); ny = oy + (oh - nh); }
    if (rs.keepAspect && rs.pos.length === 2) {
      const aspect = ow / oh;
      // choose the dominant axis change
      if (Math.abs(dx) > Math.abs(dy)) nh = nw / aspect;
      else nw = nh * aspect;
      // reapply anchor for w/n handles
      if (rs.pos.includes("w")) nx = ox + (ow - nw);
      if (rs.pos.includes("n")) ny = oy + (oh - nh);
    }
    patchElement(rs.id, {
      x: Math.round(nx), y: Math.round(ny),
      w: Math.round(nw), h: Math.round(nh),
    });
    setInteraction({ mode: "resize", label: `${Math.round(nw)} × ${Math.round(nh)}` });
  }, [patchElement]);
  const onResizeEnd = useCallback(() => {
    resizeState.current = null;
    setInteraction(null);
    endGesture();
    window.removeEventListener("pointermove", onResizeMove);
    window.removeEventListener("pointerup", onResizeEnd);
  }, [endGesture]); // eslint-disable-line react-hooks/exhaustive-deps

  /* --- Rotation handle (on-canvas, Figma-style) ---
   * Drags around the element's center; snaps to the eight 45° stops within 3°
   * unless Shift is held (free rotation). The HUD shows the live angle. */
  const onRotateMove = useCallback((e) => {
    const rs = rotateState.current;
    if (!rs) return;
    const pointerDeg = Math.atan2(e.clientY - rs.cy, e.clientX - rs.cx) * 180 / Math.PI;
    let next = rs.startRotate + (pointerDeg - rs.startPointerDeg);
    next = ((next + 180) % 360 + 360) % 360 - 180; // normalize to (-180, 180]
    if (!e.shiftKey) {
      for (const s of [-180, -135, -90, -45, 0, 45, 90, 135, 180]) {
        if (Math.abs(next - s) <= 3) { next = s; break; }
      }
    }
    next = Math.round(next);
    if (next === 180) next = -180;
    patchElement(rs.id, { rotate: next === 0 ? 0 : next });
    setInteraction({ mode: "rotate", label: `${next}°` });
  }, [patchElement]);
  const onRotateEnd = useCallback(() => {
    rotateState.current = null;
    setInteraction(null);
    endGesture();
    window.removeEventListener("pointermove", onRotateMove);
    window.removeEventListener("pointerup", onRotateEnd);
  }, [endGesture]); // eslint-disable-line react-hooks/exhaustive-deps
  const onRotateStart = useCallback((e, el) => {
    if (el.locked) return;
    e.stopPropagation();
    if (!canvasRef.current) return;
    selectSingle(el.id);
    beginGesture();
    const rect = canvasRef.current.getBoundingClientRect();
    const zoomNow = zoomRef.current;
    const b = elementBounds(el, measuredRef.current);
    const cx = rect.left + (b.x + b.w / 2) * zoomNow;
    const cy = rect.top + (b.y + b.h / 2) * zoomNow;
    rotateState.current = {
      id: el.id, cx, cy,
      startPointerDeg: Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI,
      startRotate: el.rotate || 0,
    };
    window.addEventListener("pointermove", onRotateMove);
    window.addEventListener("pointerup", onRotateEnd);
  }, [beginGesture, selectSingle]); // eslint-disable-line react-hooks/exhaustive-deps

  /* --- Group resize: uniform scale of a multi-selection from a corner of its
   * union bbox — positions, sizes, and text/badge font sizes all scale
   * together, anchored at the opposite corner (Canva behavior). --- */
  const onGroupResizeMove = useCallback((e) => {
    const gs = groupResizeState.current;
    if (!gs) return;
    const dx = (e.clientX - gs.startX) / gs.scale;
    const dy = (e.clientY - gs.startY) / gs.scale;
    const dirX = gs.pos.includes("e") ? 1 : -1;
    const dirY = gs.pos.includes("s") ? 1 : -1;
    const sW = (gs.bw + dirX * dx) / gs.bw;
    const sH = (gs.bh + dirY * dy) / gs.bh;
    // Dominant axis, normalized by bbox aspect so diagonal drags feel 1:1.
    let s = Math.abs(dx) * gs.bh > Math.abs(dy) * gs.bw ? sW : sH;
    s = Math.max(0.05, s);
    gs.members.forEach((m) => {
      const patch = {
        x: Math.round(gs.ax + (m.x - gs.ax) * s),
        y: Math.round(gs.ay + (m.y - gs.ay) * s),
        w: Math.max(2, Math.round(m.w * s)),
        h: Math.max(2, Math.round(m.h * s)),
      };
      if (m.size) patch.size = Math.max(6, Math.round(m.size * s));
      patchElement(m.id, patch);
    });
    setInteraction({ mode: "resize", label: `${Math.round(gs.bw * s)} × ${Math.round(gs.bh * s)}` });
  }, [patchElement]);
  const onGroupResizeEnd = useCallback(() => {
    groupResizeState.current = null;
    setInteraction(null);
    endGesture();
    window.removeEventListener("pointermove", onGroupResizeMove);
    window.removeEventListener("pointerup", onGroupResizeEnd);
  }, [endGesture]); // eslint-disable-line react-hooks/exhaustive-deps
  const onGroupResizeStart = useCallback((e, pos) => {
    e.stopPropagation();
    const slideNow = projRef.current?.slides?.[activeSlideRef.current];
    const ids = selectedIdsRef.current;
    if (!slideNow || ids.size < 2) return;
    const els = slideNow.elements.filter((el) => ids.has(el.id) && !el.locked);
    if (!els.length) return;
    beginGesture();
    const bs = els.map((el) => elementBounds(el, measuredRef.current));
    const minX = Math.min(...bs.map((b) => b.x)), minY = Math.min(...bs.map((b) => b.y));
    const maxX = Math.max(...bs.map((b) => b.x + b.w)), maxY = Math.max(...bs.map((b) => b.y + b.h));
    groupResizeState.current = {
      pos, startX: e.clientX, startY: e.clientY, scale: zoomRef.current,
      bw: Math.max(1, maxX - minX), bh: Math.max(1, maxY - minY),
      // Anchor = the corner opposite the handle being dragged.
      ax: pos.includes("w") ? maxX : minX,
      ay: pos.includes("n") ? maxY : minY,
      members: els.map((el, i) => ({ id: el.id, x: el.x, y: el.y, w: bs[i].w, h: bs[i].h, size: el.size })),
    };
    window.addEventListener("pointermove", onGroupResizeMove);
    window.addEventListener("pointerup", onGroupResizeEnd);
  }, [beginGesture]); // eslint-disable-line react-hooks/exhaustive-deps

  /* --- Ctrl/Cmd+wheel zoom, centered on the cursor ---
   * A native non-passive listener is required — React's synthetic onWheel
   * can't reliably preventDefault, so the browser would page-zoom instead.
   * Pinch-zoom trackpads emit ctrlKey wheel events, so pinch works too. */
  useEffect(() => {
    const sec = sectionRef.current;
    if (!sec) return undefined;
    const onWheel = (e) => {
      const target = repositionTargetId;
      if (target && !(e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        const el = projRef.current?.slides?.[activeSlideRef.current]?.elements.find((x) => x.id === target);
        if (!el) return;
        const oldScale = el.imgScale || 1;
        const delta = -e.deltaY * 0.002;
        const newScale = Math.max(1, Math.min(3, +(oldScale + delta).toFixed(2)));
        if (newScale !== oldScale) patchElement(el.id, { imgScale: newScale });
        return;
      }
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const oldZ = zoomRef.current;
      const nz = Math.min(1.5, Math.max(0.1, +(oldZ * Math.exp(-e.deltaY * 0.0015)).toFixed(3)));
      if (nz === oldZ) return;
      const rect = sec.getBoundingClientRect();
      const px = e.clientX - rect.left + sec.scrollLeft;
      const py = e.clientY - rect.top + sec.scrollTop;
      setZoom(nz);
      // Keep the content point under the cursor stationary through the zoom.
      requestAnimationFrame(() => {
        const s = nz / oldZ;
        sec.scrollLeft = px * s - (e.clientX - rect.left);
        sec.scrollTop = py * s - (e.clientY - rect.top);
      });
    };
    sec.addEventListener("wheel", onWheel, { passive: false });
    return () => sec.removeEventListener("wheel", onWheel);
    // The section only exists once the project has loaded (and only in focus
    // view) — re-run when either flips so the listener actually attaches.
  }, [!!proj, viewMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const zoomToFit = useCallback(() => {
    const sec = sectionRef.current;
    if (!sec) return;
    const fit = Math.min((sec.clientWidth - 64) / CANVAS.w, (sec.clientHeight - 150) / CANVAS.h);
    setZoom(Math.min(1.5, Math.max(0.1, +fit.toFixed(2))));
  }, []);

  /* --- Inline text editing (double-click a text element) --- */
  const onElementDoubleClick = useCallback((el) => {
    if (el.locked) return;
    if (el.type === "image") {
      if (el.frame && el.src) {
        setRepositionTargetId(el.id);
        selectSingle(el.id);
        toast.info("Drag to reposition · Scroll to zoom · Click canvas to finish", { duration: 3000 });
        return;
      }
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = () => {
        const f = input.files?.[0];
        if (!f) return;
        if (!f.type?.startsWith("image/")) { toast.error("Please pick an image file"); return; }
        if (f.size > 15 * 1024 * 1024) { toast.error("Image too large (max ~15 MB)"); return; }
        const reader = new FileReader();
        reader.onload = () => { patchElement(el.id, { src: String(reader.result || "") }); };
        reader.readAsDataURL(f);
      };
      input.click();
      return;
    }
    if (el.type !== "text") return;
    selectSingle(el.id);
    setEditingId(el.id);
  }, [selectSingle, patchElement]);
  const commitInlineText = useCallback((text) => {
    const elId = editingId;
    setEditingId(null);
    if (!elId) return;
    const cur = projRef.current?.slides?.[activeSlideRef.current]?.elements.find((e) => e.id === elId);
    // Unchanged text commits nothing — no junk undo step.
    if (!cur || cur.text === text) return;
    mutate((n) => {
      const s = n.slides[activeSlideRef.current];
      s.elements = s.elements.map((e) => (e.id === elId ? { ...e, text } : e));
    });
  }, [editingId, mutate]);

  /* --- Z-order: one-step forward/backward alongside the front/back jumps --- */
  const bringForward = (elId) => mutate((n) => {
    const s = n.slides[activeSlide];
    const i = s.elements.findIndex((e) => e.id === elId);
    if (i > -1 && i < s.elements.length - 1) { const [el] = s.elements.splice(i, 1); s.elements.splice(i + 1, 0, el); }
  });
  const sendBackward = (elId) => mutate((n) => {
    const s = n.slides[activeSlide];
    const i = s.elements.findIndex((e) => e.id === elId);
    if (i > 0) { const [el] = s.elements.splice(i, 1); s.elements.splice(i - 1, 0, el); }
  });

  /* --- Panorama direct-drag overlay (manual mode) --- */
  const panoManual = proj?.panorama?.mode === "manual" && proj?.panorama?.src && !selected;
  const onPanoDragStart = (e) => {
    e.stopPropagation();
    beginGesture();
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
    endGesture();
    window.removeEventListener("pointermove", onPanoDragMove);
    window.removeEventListener("pointerup", onPanoDragEnd);
  };
  const onPanoWheel = (e) => {
    if (!panoManual) return;
    e.preventDefault();
    // Wheel has no discrete start/end event — beginGesture()'s own idle
    // timeout re-arms on every tick, so a burst of wheel events is treated
    // as one gesture that ends shortly after the last tick.
    beginGesture();
    const vp = (proj.panorama.viewports || [])[activeSlide] || { ox: 50, oy: 50, scale: 1 };
    const nextScale = Math.max(1, Math.min(3, (vp.scale ?? 1) + (e.deltaY < 0 ? 0.1 : -0.1)));
    setPanoViewport({ ...vp, scale: nextScale });
  };

  /* --- Keyboard shortcuts --- */
  useEffect(() => {
    const h = (e) => {
      if (e.target?.tagName === "INPUT" || e.target?.tagName === "TEXTAREA" || e.target?.isContentEditable) return;
      const meta = e.ctrlKey || e.metaKey;
      if (meta && !e.shiftKey && (e.key === "z" || e.key === "Z")) { e.preventDefault(); undo(); return; }
      if (meta && ((e.shiftKey && (e.key === "z" || e.key === "Z")) || e.key === "y")) { e.preventDefault(); redo(); return; }
      // Copy selected element to internal clipboard.
      if (meta && (e.key === "c" || e.key === "C") && selectedId) {
        const el = slide?.elements?.find((x) => x.id === selectedId);
        if (el) {
          // Remember which slide it came from: pasting onto a DIFFERENT slide
          // must land at the identical position (that's how you keep a logo or
          // footer aligned across a deck), while pasting onto the same slide
          // needs an offset or the copy hides exactly behind the original.
          clipboardRef.current = { el: JSON.parse(JSON.stringify(el)), fromSlide: activeSlide };
          toast.success("Copied");
        }
        e.preventDefault();
        return;
      }
      // Paste from internal clipboard.
      if (meta && (e.key === "v" || e.key === "V") && clipboardRef.current) {
        e.preventDefault();
        const { el: src, fromSlide } = clipboardRef.current;
        const sameSlide = fromSlide === activeSlide;
        const copy = {
          ...src, id: newId(),
          x: (src.x || 0) + (sameSlide ? 40 : 0),
          y: (src.y || 0) + (sameSlide ? 40 : 0),
        };
        mutate((n) => n.slides[activeSlide].elements.push(copy));
        selectSingle(copy.id);
        toast.success(sameSlide ? "Pasted" : "Pasted in place");
        return;
      }
      // Bold the selected text element. Ctrl/Cmd+B is muscle memory in every
      // editor; the panel's Bold button advertises it, so it has to exist.
      // Remembers the previous weight so unbolding a 500 goes back to 500.
      if (meta && (e.key === "b" || e.key === "B") && selectedId) {
        const el = slide?.elements?.find((x) => x.id === selectedId);
        if (el && el.type === "text") {
          e.preventDefault();
          const bold = (el.weight || 400) >= 700;
          patchElement(el.id, bold
            ? { weight: el.weight_before_bold || 400, weight_before_bold: null }
            : { weight: 700, weight_before_bold: el.weight || 400 });
          return;
        }
      }
      // Duplicate selected in-place.
      if (meta && (e.key === "d" || e.key === "D") && selectedId) {
        e.preventDefault();
        duplicateElement(selectedId);
        return;
      }
      if (!selectedId && selectedIds.size === 0 && !repositionTargetId) return;
      if (e.key === "Escape" && repositionTargetId) { e.preventDefault(); setRepositionTargetId(null); return; }
      if (e.key === "Backspace" || e.key === "Delete") { e.preventDefault(); deleteSelectedElements(); return; }
      // Arrow-key nudge: 1px, or 10px with shift held.
      const step = e.shiftKey ? 10 : 1;
      if (e.key === "ArrowLeft") { e.preventDefault(); nudgeSelected(-step, 0); }
      else if (e.key === "ArrowRight") { e.preventDefault(); nudgeSelected(step, 0); }
      else if (e.key === "ArrowUp") { e.preventDefault(); nudgeSelected(0, -step); }
      else if (e.key === "ArrowDown") { e.preventDefault(); nudgeSelected(0, step); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [selectedId, selectedIds, undo, redo, slide, activeSlide, mutate]); // eslint-disable-line react-hooks/exhaustive-deps

  /* --- Insert your own headshot as an element on the current slide. --- */
  const insertHeadshot = () => {
    if (!user?.avatar_url) {
      toast.error("Upload your headshot in Settings → Profile first");
      return;
    }
    addElement({
      type: "image", role: "headshot", src: user.avatar_url,
      x: 720, y: CANVAS.h - 340,
      w: 260, h: 260,
      fit: "cover", radius: 999,
    });
  };

  /** Headshot + name + handle, added to every slide that doesn't already
   * have one (same idempotency pattern as the brand-kit logo apply below). */
  const insertAuthorBar = () => {
    if (!user?.avatar_url) {
      toast.error("Upload your headshot in Settings → Profile first");
      return;
    }
    mutate((n) => {
      for (const s of n.slides) {
        const has = (s.elements || []).some((e) => e.role === "author_name");
        if (has) continue;
        s.elements.push(
          { id: newId(), type: "image", role: "headshot", src: user.avatar_url, x: 80, y: CANVAS.h - 200, w: 120, h: 120, fit: "cover", radius: 999 },
          { id: newId(), type: "text", role: "author_name", text: user.name || "", x: 216, y: CANVAS.h - 196, w: 600, h: 50, font: "Inter", size: 32, weight: 700, color: "text", align: "left" },
          { id: newId(), type: "text", role: "author_handle", text: user.headline || "", x: 216, y: CANVAS.h - 146, w: 600, h: 40, font: "Inter", size: 22, weight: 400, color: "muted", align: "left" },
        );
      }
    });
    toast.success("Author bar added to every slide");
  };

  /* --- Deck-wide chrome toggles (slide numbers / progress dots / swipe hint) --- */
  const setDeckSetting = useCallback((key, value) => {
    mutate((n) => { n[key] = value; });
  }, [mutate]);

  /** Change the deck's canvas size and re-fit every slide to it.
   *
   * Resizing without re-fitting would leave a deck's content sitting at its old
   * coordinates on a canvas that is no longer that shape — clipped on a smaller
   * format, marooned in the corner on a larger one. rescaleElements() carries
   * the geometry across, preserving the type hierarchy and each slide's
   * original anchoring rather than centring everything. It runs through the
   * normal mutate(), so a resize is a single undo away. */
  const resizeCanvas = useCallback((next) => {
    if (!next?.w || !next?.h) return;
    const from = CANVAS;
    if (from.w === next.w && from.h === next.h) return;
    // Computed here rather than inside the mutate() updater. React defers
    // updaters and invokes them twice in development, so a counter incremented
    // in there is both stale when the toast reads it and double-counted when it
    // isn't — the resize itself was always correct, the report of it was not.
    const current = projRef.current;
    const source = current?.slides || [];
    let recomposed = 0;
    const nextSlides = source.map((s) => {
      // Prefer a real re-layout: slides that still carry the section they were
      // composed from, and that nobody has edited since, are rebuilt for the new
      // shape rather than stretched into it. recomposeSlide() returns null when
      // either is untrue, and rescaling is the honest fallback — it keeps
      // hand-made edits instead of silently throwing them away.
      const fresh = recomposeSlide(s, from, next, current?.brand);
      if (fresh) { recomposed += 1; return fresh; }
      // Rescales from the slide's remembered base, so returning to an earlier
      // format restores the original size instead of compounding each shrink.
      return rescaleSlideGeometry(s, from, next);
    });

    mutate((n) => {
      n.canvas = { w: next.w, h: next.h };
      n.slides = nextSlides;
    });

    const refitted = source.length - recomposed;
    toast.success(
      refitted === 0
        ? `Canvas resized to ${next.w}×${next.h} — every slide re-laid out`
        : `Canvas resized to ${next.w}×${next.h} — ${recomposed} re-laid out, ${refitted} re-fitted`,
    );
  }, [mutate, CANVAS]);

  /* --- Save / export --- */

  /** The actual PUT, shared by the Save button and the autosave loop. Kept
   * separate from save() so autosave never touches `busy` — that flag disables
   * the toolbar, and flickering it every few seconds would fight the user. */
  const persist = useCallback(async () => {
    if (!projRef.current || savingRef.current) return false;
    savingRef.current = true;
    try {
      const snapshot = projRef.current;
      const clean = stripLocalKeys(snapshot);
      await api.put(`/carousel/${id}`, {
        slides: clean.slides, brand: snapshot.brand, platform: snapshot.platform,
        // Canvas has to travel with the slides. Without it a resize saved
        // geometry laid out for the new size against the old stored size, so
        // reopening the deck rendered 1920-tall content on a 1350 canvas.
        canvas: snapshot.canvas || null,
        topic: snapshot.topic, palette_id: snapshot.palette_id, panorama: snapshot.panorama || null,
        show_slide_numbers: !!snapshot.show_slide_numbers,
        show_progress_dots: !!snapshot.show_progress_dots,
        show_swipe_hint: !!snapshot.show_swipe_hint,
        show_branding: !!snapshot.show_branding,
        branding_size: snapshot.branding_size ?? null,
        branding_color: snapshot.branding_color ?? null,
        branding_opacity: snapshot.branding_opacity ?? null,
      });
      // Only clear the dirty flag if nothing changed while the request was in
      // flight — otherwise an edit made mid-save would never be persisted.
      if (projRef.current === snapshot) dirtyRef.current = false;
      setSavedAt(Date.now());
      return true;
    } catch {
      return false;
    } finally {
      savingRef.current = false;
    }
  }, [id]);

  const save = async () => {
    setBusy(true);
    const okSave = await persist();
    if (okSave) toast.success("Saved");
    else toast.error("Save failed");
    setBusy(false);
  };

  /** Autosave. Fires on a 5s tick but only when there is something to save and
   * no save is already running, so an idle editor makes no requests at all.
   * Skipped mid-gesture: a drag or slider sweep mutates on every frame, and
   * persisting a half-finished drag just wastes a round-trip. */
  useEffect(() => {
    const t = setInterval(() => {
      if (!dirtyRef.current || savingRef.current || gestureActive.current) return;
      persist().then((okAuto) => {
        if (!okAuto) setAutosaveFailed(true);
        else setAutosaveFailed(false);
      });
    }, AUTOSAVE_INTERVAL_MS);
    return () => clearInterval(t);
  }, [persist]);

  // Last-chance guard: the 5s tick can still lose the final few seconds of work
  // if the tab is closed right after an edit.
  useEffect(() => {
    const warn = (e) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const renderSlideToDataUrl = (slideIdx, scale = 2) => new Promise((resolve, reject) => {
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
            {proj.slides[slideIdx].bg_img && <div style={renderBackgroundImageCss(proj.slides[slideIdx])} />}
            <PanoramaLayer panorama={proj.panorama} slideIdx={slideIdx} totalSlides={proj.slides.length} canvas={CANVAS} />
            {proj.slides[slideIdx].elements.map((el) => (
              <ElementRender key={el.id} el={el} palette={palette} onPointerDown={() => {}} isExport />
            ))}
            <DeckOverlay proj={proj} slideIdx={slideIdx} palette={palette} />
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
          scale, useCORS: true, allowTaint: true, backgroundColor: null, logging: false,
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
      // A saved deck can use fonts beyond the 10 preloaded at app start; make
      // sure they're actually fetched before html2canvas rasterizes, or it
      // silently falls back to a system font for that text.
      await waitForProjectFonts(proj.slides);
      const dataUrl = await renderSlideToDataUrl(activeSlide);
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${(proj.topic || "slide").slice(0, 40).replace(/\W+/g, "-")}-${activeSlide + 1}.png`;
      a.click();
      toast.success("PNG exported");
    } catch { toast.error("PNG export failed"); }
    finally { setBusy(false); }
  };

  const [exportProgress, setExportProgress] = useState(null);

  const exportPdfSlides = async (indices, qualityId = "standard") => {
    if (!proj?.slides?.length) return;
    const chosen = (indices?.length ? indices : proj.slides.map((_, i) => i))
      .filter((i) => i >= 0 && i < proj.slides.length)
      .sort((a, b) => a - b);
    if (!chosen.length) { toast.error("Pick at least one slide"); return; }
    const scale = EXPORT_QUALITIES.find((q) => q.id === qualityId)?.scale ?? 2;
    setBusy(true);
    setExportProgress({ done: 0, total: chosen.length });
    try {
      await waitForProjectFonts(proj.slides);
      const pdf = new jsPDF({
        orientation: CANVAS.h > CANVAS.w ? "portrait" : "landscape",
        unit: "px", format: [CANVAS.w, CANVAS.h], compress: true,
      });
      for (let k = 0; k < chosen.length; k++) {
        const dataUrl = await renderSlideToDataUrl(chosen[k], scale);
        if (k > 0) pdf.addPage([CANVAS.w, CANVAS.h], CANVAS.h > CANVAS.w ? "portrait" : "landscape");
        pdf.addImage(dataUrl, "PNG", 0, 0, CANVAS.w, CANVAS.h);
        // A silent multi-second wait reads as broken even when it isn't —
        // this is most of the fix for "export feels slow."
        setExportProgress({ done: k + 1, total: chosen.length });
      }
      pdf.save(`${(proj.topic || "carousel").slice(0, 40).replace(/\W+/g, "-")}-${chosen.length}-slides.pdf`);
      toast.success(`Exported ${chosen.length}-page PDF`);
    } catch (err) {
      console.error(err);
      toast.error("PDF export failed");
    } finally { setBusy(false); setExportProgress(null); }
  };

  /* --- Publish to LinkedIn (via Social EQ approval queue) --- */
  const publishToLinkedIn = async (mode, topic) => {
    if (!proj?.slides?.length) { toast.error("No slides to publish"); return; }
    if (!topic.trim()) { toast.error("Enter a topic so the caption & hashtags can be generated"); return; }
    setBusy(true);
    setExportProgress({ done: 0, total: mode === "carousel" ? proj.slides.length : 1 });
    try {
      await waitForProjectFonts(proj.slides);
      let fileBlob, contentType, filename;
      if (mode === "carousel") {
        const scale = EXPORT_QUALITIES.find((q) => q.id === "standard")?.scale ?? 2;
        const pdf = new jsPDF({
          orientation: CANVAS.h > CANVAS.w ? "portrait" : "landscape",
          unit: "px", format: [CANVAS.w, CANVAS.h], compress: true,
        });
        const indices = proj.slides.map((_, i) => i);
        for (let k = 0; k < indices.length; k++) {
          const dataUrl = await renderSlideToDataUrl(indices[k], scale);
          if (k > 0) pdf.addPage([CANVAS.w, CANVAS.h], CANVAS.h > CANVAS.w ? "portrait" : "landscape");
          pdf.addImage(dataUrl, "PNG", 0, 0, CANVAS.w, CANVAS.h);
          setExportProgress({ done: k + 1, total: indices.length });
        }
        fileBlob = pdf.output("blob");
        contentType = "carousel";
        filename = `${(proj.topic || "carousel").slice(0, 40).replace(/\W+/g, "-")}-${indices.length}-slides.pdf`;
      } else {
        const dataUrl = await renderSlideToDataUrl(activeSlide, 2);
        const res = await fetch(dataUrl);
        fileBlob = await res.blob();
        contentType = "static";
        filename = `${(proj.topic || "slide").slice(0, 40).replace(/\W+/g, "-")}-${activeSlide + 1}.png`;
        setExportProgress({ done: 1, total: 1 });
      }

      const form = new FormData();
      form.append("project_id", proj.id);
      form.append("topic", topic.trim());
      form.append("content_type", contentType);
      form.append("platform", "linkedin");
      form.append("file", fileBlob, filename);

      const { data } = await api.post("/social-eq/posts/from-create-eq", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success("Draft sent to approval queue");
      setShowPublish(false);
      nav("/app/social-eq/queue");
    } catch (err) {
      console.error(err);
      if (isCreditError(err)) toast.error(err.response?.data?.detail || "Not enough credits");
      else toast.error("Publish failed — try again");
    } finally { setBusy(false); setExportProgress(null); }
  };

  /* --- Styles & layouts --- */
  const handleApplyStyle = useCallback((styleId, allSlides) => {
    const style = STYLES.find((s) => s.id === styleId);
    if (!style || !proj) return;
    const palette = proj.palette_id === "ai" && proj.ai_palette
      ? { id: "ai", ...proj.ai_palette }
      : PALETTES.find((p) => p.id === proj.palette_id);
    mutate((n) => {
      n.slides = n.slides.map((slide, i) => {
        if (!allSlides && i !== activeSlide) return slide;
        const transformed = style.apply(slide, palette);
        return { ...slide, bg: transformed.bg, elements: transformed.elements };
      });
    });
    toast.success(`Applied "${style.name}" style${allSlides ? " to all slides" : ""}`);
  }, [proj, activeSlide, mutate]);

  const handleApplyLayout = useCallback((layoutId) => {
    const layout = LAYOUTS.find((l) => l.id === layoutId);
    if (!layout || !proj) return;
    mutate((n) => {
      const s = n.slides[activeSlide];
      const transformed = layout.apply(s);
      n.slides[activeSlide] = { ...s, bg: transformed.bg, elements: transformed.elements };
    });
    toast.success(`Applied "${layout.name}" layout`);
  }, [proj, activeSlide, mutate]);

  /* --- Brand kit apply / AI copy assist --- */
  const LOGO_POS = {
    tl: (d) => ({ x: 80, y: 80 }),
    tr: (d) => ({ x: CANVAS.w - 80 - d.w, y: 80 }),
    bl: (d) => ({ x: 80, y: CANVAS.h - 80 - d.h }),
    br: (d) => ({ x: CANVAS.w - 80 - d.w, y: CANVAS.h - 80 - d.h }),
  };
  // Doubled from the original 120/180/240/360 — the old sizes read as too
  // small against the 1080×1350 canvas. XL is now 720 wide (two thirds of the
  // canvas), so it is a deliberate full-bleed choice rather than a default.
  const LOGO_DIMS = { s: { w: 240, h: 120 }, m: { w: 360, h: 180 }, l: { w: 480, h: 240 }, xl: { w: 720, h: 360 } };
  const applyBrandKit = async (kit) => {
    if (!kit) return;
    const reapply = kit._reapply_logo;
    const sizeKey = kit.logo_size || "l";
    const posKey = kit.logo_position || "bl";
    const dims = LOGO_DIMS[sizeKey] || LOGO_DIMS.l;
    const pos = (LOGO_POS[posKey] || LOGO_POS.bl)(dims);
    mutate((n) => {
      if (kit.palette_id && !reapply) n.palette_id = kit.palette_id;
      n.brand = { ...(n.brand || {}), logo_url: kit.logo_url, colors: kit.colors, fonts: kit.fonts, logo_size: sizeKey, logo_position: posKey };
      if (kit.logo_url) {
        for (const s of n.slides) {
          const existing = (s.elements || []).find((e) => e.type === "image" && e.role === "logo");
          if (!existing) {
            s.elements.push({ id: newId(), type: "image", role: "logo", src: kit.logo_url, x: pos.x, y: pos.y, w: dims.w, h: dims.h, fit: "contain" });
          } else if (reapply) {
            Object.assign(existing, { src: kit.logo_url, x: pos.x, y: pos.y, w: dims.w, h: dims.h });
          }
        }
      }
    });
    toast.success(reapply ? `Logo re-applied to all slides (${sizeKey.toUpperCase()}, ${posKey})` : `Applied brand kit "${kit.name}"`);
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
        toast.success("Rewritten");
      } else {
        toast.error("No rewrite returned");
      }
    } catch (err) { if (!isCreditError(err)) toast.error("Assist failed"); }
    finally { setBusy(false); }
  };

  /** Draft a fresh batch of slides for a topic and append them to the deck —
   * the in-editor counterpart to the Projects-page wizard, for decks that
   * already exist and just need more (or their first real) content. */
  const generateContentForTopic = async (topic, slideCount) => {
    setBusy(true);
    try {
      const { data } = await api.post("/carousel/generate", {
        topic: topic.trim(), platform: proj.platform || "linkedin", slide_count: slideCount,
        tone: "confident, punchy",
      });
      const incoming = data.slides || [];
      const newSlides = incoming.length && incoming.every(isPremiumSlide)
        ? buildPremiumDeck(incoming, {
            canvas: CANVAS,
            familyId: proj.palette_family || DEFAULT_FAMILY,
            brand: proj.palette_family === "brand" ? proj.brand : null,
          })
        : incoming.map((s) => legacySlideToElements(s, CANVAS));
      if (!newSlides.length) { toast.error("No slides generated"); return; }
      mutate((n) => { n.slides.push(...newSlides); });
      setActiveSlide(proj.slides.length);
      setShowGenerateContent(false);
      toast.success(`Added ${newSlides.length} generated slide${newSlides.length === 1 ? "" : "s"}`);
    } catch (err) { if (!isCreditError(err)) toast.error("Generation failed — try again"); }
    finally { setBusy(false); }
  };

  if (!proj) return <div className="p-6 sm:p-8 text-ink-muted">Loading…</div>;

  return (
    // Fixed viewport shell. The editor is a three-pane app, not a scrolling
    // page: the header sizes itself and the panes take whatever is left. This
    // replaces a hardcoded h-[calc(100vh-90px)] on the grid below, which
    // assumed the header was always exactly 90px tall — the moment the toolbar
    // wrapped to a second row on a narrower screen, the panes overflowed the
    // viewport and the slide toolbar at the bottom was pushed off-screen.
    // AppLayout puts the nav in a left sidebar with no top bar, so the page
    // genuinely owns the full viewport height here.
    <div className="flex flex-col h-screen overflow-hidden">
      <div className="shrink-0">
      <PageHeader
        title={proj.topic}
        subtitle={`${proj.slides.length} slide${proj.slides.length === 1 ? "" : "s"} · ${palette.name} palette`}
        right={
          <div className="flex items-center gap-1.5 flex-nowrap overflow-x-auto max-w-full">
            <button onClick={() => nav("/app/create-eq")} className="btn-ghost btn-sm"><ChevronLeft size={14} /><span className="hidden 2xl:inline"> Projects</span></button>
            <button onClick={undo} title="Undo (Ctrl+Z)" data-testid="undo-btn" className="btn-ghost btn-sm"><Undo2 size={14} /></button>
            <button onClick={redo} title="Redo (Ctrl+Shift+Z)" data-testid="redo-btn" className="btn-ghost btn-sm"><Redo2 size={14} /></button>
            <button onClick={() => setViewMode(viewMode === "focus" ? "board" : "focus")} title="Switch between board and focus view" data-testid="view-mode-toggle" className="btn-ghost btn-sm">
              {viewMode === "focus" ? <><LayoutGrid size={14} /><span className="hidden 2xl:inline"> Board</span></> : <><Maximize2 size={14} /><span className="hidden 2xl:inline"> Focus</span></>}
            </button>
            <button onClick={() => setShowPreview(true)} title="Preview deck" data-testid="preview-open-btn" className="btn-secondary btn-sm"><Play size={14} /><span className="hidden 2xl:inline"> Preview</span></button>
            <button onClick={() => setShowGenerateContent(true)} title="Generate slide content" data-testid="generate-content-open" className="btn-secondary btn-sm"><PenSquare size={14} /><span className="hidden 2xl:inline"> Generate content</span></button>
            <button onClick={() => setShowPanorama(true)} title="Panorama background across slides" data-testid="panorama-open" className="btn-secondary btn-sm"><Mountain size={14} /><span className="hidden 2xl:inline"> Panorama</span></button>
            <button onClick={() => setShowAiImage(true)} title="Generate an image" data-testid="ai-image-open" className="btn-secondary btn-sm"><ImagePlus size={14} /><span className="hidden 2xl:inline"> Generate image</span></button>
            <button onClick={() => setShowStockPhotos(true)} title="Search stock photos" data-testid="stock-photos-open" className="btn-secondary btn-sm"><Search size={14} /><span className="hidden 2xl:inline"> Stock photos</span></button>
            <button onClick={() => setShowImageGallery(true)} title="Workspace image gallery" data-testid="image-gallery-open" className="btn-secondary btn-sm"><ImageIcon size={14} /><span className="hidden 2xl:inline"> Images</span></button>
            <button onClick={() => setShowBrandKit(true)} title="Apply a brand kit" data-testid="brand-kit-open" className="btn-secondary btn-sm"><Palette size={14} /><span className="hidden 2xl:inline"> Brand kit</span></button>
            <button onClick={exportSlidePng} title="Export current slide as PNG" data-testid="export-png-btn" className="btn-secondary btn-sm"><Download size={14} /><span className="hidden 2xl:inline"> PNG</span></button>
            <button onClick={() => setShowPdfPicker(true)} disabled={busy} title="Export deck as PDF" data-testid="export-pdf-btn" className="btn-secondary btn-sm"><FileText size={14} /><span className="hidden 2xl:inline"> PDF</span></button>
            <button onClick={() => setShowPublish(true)} disabled={busy} title="Publish to LinkedIn via Social EQ (approval queue)" data-testid="publish-linkedin-open" className="btn-secondary btn-sm"><Send size={14} /><span className="hidden 2xl:inline"> Publish</span></button>
            <span className="text-tiny text-ink-muted whitespace-nowrap" data-testid="autosave-status">
              {autosaveFailed
                ? <span className="text-warning">Autosave failed — use Save</span>
                : savedAt
                ? `Saved ${new Date(savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                : ""}
            </span>
            <button onClick={save} disabled={busy} title="Save (autosaves every 5s)" data-testid="save-carousel-btn" className="btn-primary btn-sm">
              {busy ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : <><Save size={14} /> Save</>}
            </button>
          </div>
        }
      />
      </div>

      {viewMode === "focus" ? (
        // Pane widths step with the viewport. The old fixed 2/7/3 gave the
        // properties panel ~277px on a 1366px laptop (the sidebar takes 256 of
        // it), which is too narrow for its own controls; below xl the side
        // panes take a larger share and the canvas gives way, since the canvas
        // is portrait and scales to height anyway.
        <div className="grid grid-cols-12 flex-1 min-h-0 bg-neutral-100 overflow-hidden">
          <aside className="col-span-3 lg:col-span-2 border-r border-line bg-white overflow-y-auto">
            <LeftPanel
              onTemplate={(tpl) => applyTemplateToSlide(tpl)}
              onStyle={(styleId, allSlides) => handleApplyStyle(styleId, allSlides)}
              onLayout={(layoutId) => handleApplyLayout(layoutId)}
              onAddText={(preset) => addElement(preset)}
              onAddShape={(shape) => addElement({ type: "shape", shape, x: 400, y: 500, w: 280, h: 280, fill: "accent", opacity: 1, radius: shape === "circle" ? 999 : shape === "rect" ? 24 : 0 })}
              onAddLine={(caps) => addElement({ type: "line", x: 80, y: 700, w: 920, h: caps ? 6 : 4, color: "text", ...(caps || {}) })}
              onAddBadge={() => addElement({ type: "badge", x: 80, y: 96, text: "NEW", bg: "accent", color: "bg", radius: 999, size: 20 })}
              onAddIcon={(name, set) => addElement({ type: "icon", x: 400, y: 500, w: 128, name, set, color: "accent", stroke: 2 })}
              onAddImage={() => imageFileRef.current?.click()}
              onAddImageUrl={() => {
                const url = prompt("Paste image URL (PNG/JPG/SVG)");
                if (url && url.trim()) addElement({ type: "image", src: url.trim(), x: 300, y: 400, w: 480, h: 480, fit: "cover", radius: 24 });
              }}
              onAddHeadshot={insertHeadshot}
              onAddAuthorBar={insertAuthorBar}
              hasHeadshot={!!user?.avatar_url}
              customTemplates={customTemplates}
              onAddCoolshape={(d) => addElement({
                type: "coolshape", shape_category: d.type, shape_index: d.index, size: d.size,
                x: 400, y: 500, w: d.size, h: d.size,
                color: "accent", opacity: 0.3, noise: true,
              })}
              onAddAccent={(idx) => {
                const accent = ACCENT_ELEMENTS[idx];
                if (!accent) return;
                const built = accent.build(proj.slides[activeSlide].elements.length);
                if (Array.isArray(built)) { built.forEach((el) => addElement(el)); }
                else { addElement(built); }
              }}
              onApplyTheme={(theme) => {
                if (theme.palette_id) { dirtyRef.current = true; setProj((p) => ({ ...p, palette_id: theme.palette_id })); }
                if (theme.bg) patchSlide({ bg: theme.bg });
                if (theme.decoration) {
                  const d = theme.decoration;
                  const cornerX = d.corner === "tl" ? 40 : d.corner === "tr" ? CANVAS.w - d.size - 40 : d.corner === "bl" ? 40 : CANVAS.w - d.size - 40;
                  const cornerY = d.corner === "tl" || d.corner === "tr" ? 40 : CANVAS.h - d.size - 40;
                  addElement({
                    type: "coolshape", shape_category: d.type, shape_index: d.index, size: d.size,
                    x: cornerX, y: cornerY, w: d.size, h: d.size,
                    color: "accent", opacity: 0.3, noise: true,
                  });
                }
                toast.success(`Applied "${theme.name}" theme`);
              }}
              onAddFrameImage={(frameId) => {
                const x = 200 + Math.random() * 80, y = 200 + Math.random() * 80;
                addElement({
                  type: "image", src: null, frame: frameId,
                  x, y, w: 400, h: 400, fit: "cover", radius: 0,
                });
                toast.success("Frame placed — double-click to add image");
              }}
              onAddBgPreset={(preset) => {
                patchSlide({ bg: preset.bg });
                if (preset.palette_id) { dirtyRef.current = true; setProj((p) => ({ ...p, palette_id: preset.palette_id })); }
              }}
              onAddChart={(preset) => {
                const el = { ...preset, x: 200, y: 300, color: "accent", id: newId() };
                delete el.name;
                addElement(el);
              }}
              onAddCard={(preset) => {
                const el = { ...preset, x: 200, y: 300, color: "accent", id: newId() };
                delete el.name;
                addElement(el);
              }}
              onAddComposition={(idx) => {
                const comp = COMPOSITIONS[idx];
                if (!comp) return;
                const els = comp.build(idx);
                els.forEach((el) => addElement({ ...el, id: newId() }));
              }}
            />
          </aside>

          <section ref={sectionRef} className="col-span-5 lg:col-span-6 xl:col-span-7 min-h-0 relative overflow-auto"
            onDragOver={onCanvasDragOver} onDragLeave={onCanvasDragLeave} onDrop={onCanvasDrop}
            onContextMenu={onCanvasContextMenu}>
            {dropHint && (
              <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
                <div className="bg-ink text-white px-4 py-2 rounded-full font-mono text-caption uppercase tracking-widest">Drop image to add</div>
              </div>
            )}
            {repositionTargetId && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 pointer-events-none">
                <div className="bg-indigo-600 text-white px-3 py-1.5 rounded-full font-mono text-tiny uppercase tracking-widest shadow-lg flex items-center gap-2">
                  <span>Reposition mode</span>
                  <span className="opacity-60">Drag to move · Scroll to zoom</span>
                </div>
              </div>
            )}
              <div className="p-4 sm:p-6 flex items-start justify-center">
              <div className="relative" style={{ width: CANVAS.w * zoom, height: CANVAS.h * zoom }}>
                <div
                  ref={canvasRef}
                  onPointerDown={onCanvasBgPointerDown}
                  className={`absolute inset-0 origin-top-left overflow-hidden shadow-[0_20px_80px_-30px_rgba(0,0,0,0.35)] rounded-md creq-canvas ${interaction || marqueeRect ? "creq-interacting" : ""} ${interaction?.mode === "drag" ? "creq-dragging" : ""} ${marqueeRect ? "creq-marqueeing" : ""} ${dropHint ? "ring-2 ring-ink" : ""}`}
                  style={{ width: CANVAS.w, height: CANVAS.h, transform: `scale(${zoom})`, transformOrigin: "top left", background: renderBackground(slide.bg, palette), "--inv-zoom": 1 / zoom }}
                >
                  {slide.bg_img && <div style={renderBackgroundImageCss(slide)} />}
                  <PanoramaLayer panorama={proj.panorama} slideIdx={activeSlide} totalSlides={proj.slides.length} canvas={CANVAS} />
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
                    <Fragment key={el.id}>
                      <ElementRender el={el} palette={palette}
                        onPointerDown={onPointerDown}
                        onContextMenu={onElementContextMenu}
                        onMeasure={onElementMeasure}
                        onDoubleClick={onElementDoubleClick}
                        editing={el.id === editingId}
                        isDropTarget={el.id === dropTargetElId}
                        isRepositioning={el.id === repositionTargetId}
                        onImageDrop={(srcId) => {
                          const srcEl = slide.elements.find((e) => e.id === srcId);
                          if (!srcEl || !srcEl.src) return;
                          if (el.id === srcId) return;
                          const mySrc = el.src;
                          patchElement(el.id, { src: srcEl.src });
                          patchElement(srcId, { src: mySrc || null });
                          toast.success("Image moved to frame");
                        }} />
                      {el.locked && (
                        <div style={{
                          position: "absolute", left: el.x, top: el.y,
                          width: el.w, height: el.h,
                          pointerEvents: "none", zIndex: 99999,
                          display: "flex", alignItems: "flex-start", justifyContent: "flex-end",
                          padding: "4px 6px 0 0",
                        }}>
                          <span style={{
                            fontSize: 11, background: "rgba(0,0,0,0.5)", color: "#fff",
                            borderRadius: 4, padding: "1px 5px", lineHeight: "16px",
                            fontFamily: "sans-serif",
                          }}>🔒</span>
                        </div>
                      )}
                    </Fragment>
                  ))}
                  <DeckOverlay proj={proj} slideIdx={activeSlide} palette={palette} />
                  <SelectionChrome
                    canvas={CANVAS}
                    els={slide.elements.filter((e2) => selectedIds.has(e2.id) && e2.id !== editingId)}
                    zoom={zoom}
                    measured={measuredRef.current}
                    interaction={interaction}
                    onResizeStart={onResizeStart}
                    onRotateStart={onRotateStart}
                    onGroupResizeStart={onGroupResizeStart}
                  />
                  {editingId && (() => {
                    const editingEl = slide.elements.find((e2) => e2.id === editingId);
                    return editingEl ? (
                      <InlineTextEditor el={editingEl} palette={palette} zoom={zoom}
                        onCommit={commitInlineText} onCancel={() => setEditingId(null)} />
                    ) : null;
                  })()}
                  {marqueeRect && (
                    <div data-testid="marquee-select" style={{
                      position: "absolute", left: marqueeRect.x, top: marqueeRect.y,
                      width: marqueeRect.w, height: marqueeRect.h,
                      border: `${1 / zoom}px solid #1D1D1F`, background: "rgba(29,29,31,0.06)",
                      pointerEvents: "none", zIndex: 30,
                    }} />
                  )}
                  {guides.map((g, i) => (
                    <div key={i} data-testid="snap-guide" style={{
                      position: "absolute", background: "#FF2D8A", pointerEvents: "none", zIndex: 40,
                      ...(g.o === "v"
                        ? { left: g.pos, top: 0, width: 1.5 / zoom, height: CANVAS.h }
                        : { top: g.pos, left: 0, height: 1.5 / zoom, width: CANVAS.w }),
                    }} />
                  ))}
                  {guides.some((g) => (g.o === "v" && g.pos === CANVAS.w / 2) || (g.o === "h" && g.pos === CANVAS.h / 2)) && (
                    <div style={{ position: "absolute", left: CANVAS.w / 2, top: CANVAS.h / 2, pointerEvents: "none", zIndex: 41 }} data-testid="center-cross">
                      <div style={{ position: "absolute", left: -9 / zoom, top: -1 / zoom, width: 18 / zoom, height: 2 / zoom, background: "#FF2D8A", borderRadius: 999 }} />
                      <div style={{ position: "absolute", left: -1 / zoom, top: -9 / zoom, width: 2 / zoom, height: 18 / zoom, background: "#FF2D8A", borderRadius: 999 }} />
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="sticky bottom-0 left-0 right-0 bg-white/90 backdrop-blur border-t border-line px-4 py-2 flex items-center gap-2 text-caption">
              <span className="ui-label">Zoom</span>
              <input type="range" min={0.1} max={1.5} step={0.02} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} data-testid="zoom-slider" className="w-32" />
              <span className="font-mono text-ink-muted w-10">{Math.round(zoom * 100)}%</span>
              <button onClick={zoomToFit} data-testid="zoom-fit" className="btn-ghost text-caption py-1 px-2" title="Fit slide to view (also: Ctrl+scroll to zoom)">Fit</button>
              <button onClick={() => setZoom(0.5)} data-testid="zoom-50" className="btn-ghost text-caption py-1 px-2">50%</button>
              <button onClick={() => setZoom(1)} data-testid="zoom-100" className="btn-ghost text-caption py-1 px-2">100%</button>
              <div className="ml-4 flex items-center gap-1 flex-wrap">
                {proj.slides.map((s, i) => (
                  <button key={s._k}
                    onClick={() => { setActiveSlide(i); selectSingle(null); }}
                    draggable
                    onDragStart={(e) => { e.dataTransfer.setData("text/plain", String(i)); e.currentTarget.style.opacity = "0.4"; }}
                    onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.opacity = "0.4"; }}
                    onDragLeave={(e) => { e.currentTarget.style.opacity = ""; }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.currentTarget.style.opacity = "";
                      const fromIdx = Number(e.dataTransfer.getData("text/plain"));
                      const toIdx = i;
                      if (fromIdx === toIdx) return;
                      dirtyRef.current = true; // reorder bypasses mutate()
                      setProj((prev) => {
                        const slides = [...prev.slides];
                        const [moved] = slides.splice(fromIdx, 1);
                        slides.splice(toIdx, 0, moved);
                        return { ...prev, slides };
                      });
                      setActiveSlide(toIdx);
                    }}
                    data-testid={`slide-thumb-${i}`}
                    className={`px-2.5 py-1 rounded-xl text-caption font-mono ${i === activeSlide ? "bg-accent text-white" : "bg-neutral-100 hover:bg-neutral-200"}`}>
                    {i + 1}
                  </button>
                ))}
                <button onClick={() => addSlide()} data-testid="add-slide" className="btn-ghost text-caption py-1"><Plus size={12} /> Slide</button>
                <button onClick={duplicateSlide} data-testid="dup-slide" className="btn-ghost text-caption py-1"><Copy size={12} /></button>
                <button onClick={saveSlideAsTemplate} data-testid="save-template" className="btn-ghost text-caption py-1" title="Save slide as template">📋</button>
                <button onClick={deleteSlide} data-testid="del-slide" className="btn-ghost text-caption py-1 text-danger"><Trash2 size={12} /></button>
              </div>
            </div>
          </section>

          <aside className="col-span-4 lg:col-span-4 xl:col-span-3 border-l border-line bg-white overflow-y-auto">
            <RightPanel
              proj={proj} palette={palette} slide={slide} selected={selected} activeSlide={activeSlide}
              selectedCount={selectedIds.size}
              onAlign={alignSelected}
              onPalette={(pid) => setProj({ ...proj, palette_id: pid })}
              onBg={(bg) => patchSlide({ bg })}
              onEditElement={(patch) => selected && patchElement(selected.id, patch)}
              onDelete={() => selected && deleteElement(selected.id)}
              onDeleteMulti={deleteSelectedElements}
              onDuplicate={() => selected && duplicateElement(selected.id)}
              onFront={() => selected && bringToFront(selected.id)}
              onBack={() => selected && sendToBack(selected.id)}
              onForward={() => selected && bringForward(selected.id)}
              onBackward={() => selected && sendBackward(selected.id)}
              onAiAssist={aiAssistText}
              onPanoramaViewport={setPanoViewport}
              onPanoramaResetSlide={resetPanoSlide}
              onPanoramaApplyAll={applyPanoToAll}
              onDeckSetting={setDeckSetting}
              onResizeCanvas={resizeCanvas}
              onGestureStart={beginGesture}
              onGestureEnd={endGesture}
              onGroup={groupElements}
              onUngroup={ungroupElements}
            />
          </aside>
        </div>
      ) : (
        <BoardView
          proj={proj} palette={palette}
          onFocus={(i) => { setActiveSlide(i); selectSingle(null); setViewMode("focus"); }}
        />
      )}

      {/* Right-click context menu */}
      {ctxMenu && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 99999 }} onClick={dismissCtxMenu} onContextMenu={(e) => { e.preventDefault(); dismissCtxMenu(); }}>
          <div style={{ position: "fixed", top: ctxMenu.y, left: ctxMenu.x, minWidth: 160, background: "#fff", borderRadius: 8, boxShadow: "0 8px 32px rgba(0,0,0,0.15)", border: "1px solid #e4e4e7", overflow: "hidden", fontSize: 13 }}
            onClick={(e) => e.stopPropagation()}>
            <CtxBtn onClick={() => { duplicateElement(ctxMenu.elId); dismissCtxMenu(); }}>Duplicate</CtxBtn>
            <CtxBtn onClick={() => { const el = slide?.elements.find((x) => x.id === ctxMenu.elId); if (el) { patchElement(el.id, { locked: !ctxMenu.locked }); } dismissCtxMenu(); }}>{ctxMenu.locked ? "Unlock" : "Lock"}</CtxBtn>
            <div className="border-t border-line" />
            <CtxBtn onClick={() => { bringToFront(ctxMenu.elId); dismissCtxMenu(); }}>Bring to front</CtxBtn>
            <CtxBtn onClick={() => { sendToBack(ctxMenu.elId); dismissCtxMenu(); }}>Send to back</CtxBtn>
            <div className="border-t border-line" />
            <CtxBtn onClick={() => { deleteSelectedElements(); dismissCtxMenu(); }} className="text-red-600">Delete</CtxBtn>
          </div>
        </div>
      )}

      {showBrandKit && (
        <BrandKitDrawer
          onClose={() => setShowBrandKit(false)} kits={brandKits}
          onSaved={(kit) => setBrandKits((k) => [kit, ...k])}
          onUpdated={(kit) => setBrandKits((k) => k.map((x) => x.id === kit.id ? kit : x))}
          onDeleted={(bid) => setBrandKits((k) => k.filter((x) => x.id !== bid))}
          onApply={(kit) => { applyBrandKit(kit); setShowBrandKit(false); }}
        />
      )}

      {showImageGallery && (
        <ImageGalleryDrawer
          onClose={() => setShowImageGallery(false)}
          onAddAsElement={(imageUrl) => {
            addElement({ type: "image", src: imageUrl, x: 120, y: 240, w: 840, h: 840, fit: "cover", radius: 24 });
            setShowImageGallery(false);
            toast.success("Image added to slide");
          }}
          onAddAsBackground={(imageUrl) => {
            mutate((n) => {
              const s = n.slides[activeSlide];
              s.elements = (s.elements || []).filter((el) => !(el.type === "image" && el.role === "background"));
              s.elements.unshift({ id: newId(), type: "image", role: "background", src: imageUrl, x: 0, y: 0, w: CANVAS.w, h: CANVAS.h, fit: "cover", radius: 0 });
            });
            setShowImageGallery(false);
            toast.success("Background applied");
          }}
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

      {showStockPhotos && (
        <StockPhotoDrawer
          onClose={() => setShowStockPhotos(false)}
          slideContent={{
            texts: (slide?.elements || []).filter((el) => el.type === "text" && el.text).map((el) => el.text),
          }}
          onAddAsElement={(imageUrl) => {
            addElement({ type: "image", src: imageUrl, x: 120, y: 240, w: 840, h: 840, fit: "cover", radius: 24 });
            setShowStockPhotos(false);
            toast.success("Image added to slide");
          }}
          onAddAsBackground={(imageUrl) => {
            mutate((n) => {
              const s = n.slides[activeSlide];
              s.elements = (s.elements || []).filter((el) => !(el.type === "image" && el.role === "background"));
              s.elements.unshift({ id: newId(), type: "image", role: "background", src: imageUrl, x: 0, y: 0, w: CANVAS.w, h: CANVAS.h, fit: "cover", radius: 0 });
            });
            setShowStockPhotos(false);
            toast.success("Background applied");
          }}
        />
      )}

      {showPanorama && (
        <PanoramaDrawer
          canvas={CANVAS}
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
          proj={proj} palette={palette} busy={busy} progress={exportProgress}
          onClose={() => setShowPdfPicker(false)}
          onExport={async (indices, quality) => {
            // Stay open through the render so the progress indicator is
            // actually visible — closing immediately (the old behavior) meant
            // "Rendering slide X of N" could never be seen, since the dialog
            // unmounted before the first slide even started.
            await exportPdfSlides(indices, quality);
            setShowPdfPicker(false);
          }}
        />
      )}

      {showPublish && (
        <PublishToLinkedInDialog
          proj={proj}
          busy={busy} progress={exportProgress}
          onClose={() => setShowPublish(false)}
          onPublish={publishToLinkedIn}
        />
      )}

      {showGenerateContent && (
        <GenerateContentDialog
          busy={busy}
          onClose={() => setShowGenerateContent(false)}
          onGenerate={generateContentForTopic}
        />
      )}

      {showPreview && (
        <SlidePreview
          proj={proj} palette={palette} startIndex={activeSlide}
          onClose={() => setShowPreview(false)}
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

/** In-editor counterpart to the Projects-page "start with AI" wizard — lets
 * you draft content for a topic straight into the deck you already have
 * open, appending the new slides rather than replacing what's there. */
function GenerateContentDialog({ busy, onClose, onGenerate }) {
  const [topic, setTopic] = useState("");
  const [slideCount, setSlideCount] = useState(3);

  return (
    <div className="fixed inset-0 bg-ink/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg p-4 sm:p-6" onClick={(e) => e.stopPropagation()} data-testid="generate-content-dialog">
        <h2 className="font-display font-semibold text-section mb-1">Generate content</h2>
        <p className="text-caption text-ink-muted mb-4">Describe a topic — we&apos;ll draft new slides and add them to the end of this deck.</p>
        <textarea
          autoFocus
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          rows={3}
          placeholder='e.g. "Why cold outreach fails in 2026 and how to fix it"'
          data-testid="generate-content-topic"
          className="w-full border border-line rounded-lg px-4 py-3 text-base focus:outline-none focus:border-ink"
        />
        <div className="flex items-center gap-2 mt-3">
          <span className="text-caption text-ink-muted">Slides to add:</span>
          {[1, 3, 5, 6].map((n) => (
            <button key={n} onClick={() => setSlideCount(n)} data-testid={`generate-content-count-${n}`}
              className={`px-3 py-1 rounded-xl text-caption font-mono ${slideCount === n ? "bg-accent text-white" : "bg-neutral-100 hover:bg-neutral-200"}`}>
              {n}
            </button>
          ))}
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={() => onGenerate(topic, slideCount)} disabled={busy || !topic.trim()} data-testid="generate-content-submit"
            className="btn-primary disabled:opacity-60">
            {busy ? <><Loader2 size={14} className="animate-spin" /> Drafting…</> : <><PenSquare size={14} /> Generate</>}
          </button>
        </div>
      </div>
    </div>
  );
}

function CtxBtn({ children, onClick, className }) {
  return (
    <button onClick={onClick} className={`w-full text-left px-3 py-2 hover:bg-neutral-50 text-body ${className || ""}`} style={{ whiteSpace: "nowrap" }}>
      {children}
    </button>
  );
}
