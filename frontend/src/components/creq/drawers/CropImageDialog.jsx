import { useRef, useState, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { Crop, RotateCcw, Check } from "lucide-react";

/** Aspect-ratio presets for the crop box. "Free" allows any shape. */
const ASPECT_PRESETS = [
  { id: "free", label: "Free" },
  { id: "square", label: "1:1" },
  { id: "portrait", label: "4:5" },
  { id: "linkedin", label: "1.91:1" },
  { id: "wide", label: "16:9" },
  { id: "element", label: "Element" },
];

const MAX_OUTPUT = 2400; // longest side cap for the produced data URL

/**
 * Crop an element image. Renders the source image at display size, lets the
 * user draw/move/resize a crop rectangle (with optional aspect lock), then
 * writes the selected region back out of an offscreen canvas at (nearly)
 * natural resolution and hands the resulting data URL to `onApply`.
 *
 * Coordinate model: the crop rectangle lives in *container* coordinates; the
 * image is drawn inside the container with `object-fit: contain`, so the
 * visible image occupies the "contain rect". The crop is clamped to that rect
 * (no cropping into letterbox space) and mapped back to natural pixels via the
 * contain scale factor on Apply.
 */
export default function CropImageDialog({ src, elementRatio, onApply, onClose }) {
  const containerRef = useRef(null);
  const [img, setImg] = useState(null); // { naturalWidth, naturalHeight }
  const [contain, setContain] = useState(null); // { x, y, w, h } in container px
  const [crop, setCrop] = useState(null); // { x, y, w, h } in container px
  const [aspect, setAspect] = useState(elementRatio ? "element" : "free");
  const [interaction, setInteraction] = useState(null); // { mode, handle, startX, startY, orig }
  const [containerSize, setContainerSize] = useState(null);

  const aspectRatio = aspect === "free" ? null
    : aspect === "square" ? 1
    : aspect === "portrait" ? 4 / 5
    : aspect === "linkedin" ? 1.91
    : aspect === "wide" ? 16 / 9
    : elementRatio || null;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setContainerSize({ w: el.clientWidth, h: el.clientHeight });
    const probe = new window.Image();
    probe.onload = () => {
      setImg({ naturalWidth: probe.naturalWidth, naturalHeight: probe.naturalHeight, src });
      const cw = el.clientWidth, ch = el.clientHeight;
      const scale = Math.min(cw / probe.naturalWidth, ch / probe.naturalHeight);
      const dw = probe.naturalWidth * scale, dh = probe.naturalHeight * scale;
      const containRect = { x: (cw - dw) / 2, y: (ch - dh) / 2, w: dw, h: dh };
      setContain(containRect);
      setCrop({ ...containRect });
    };
    probe.crossOrigin = "anonymous";
    probe.src = src;
  }, [src]);

  const clampRect = useCallback((rect, containRect) => {
    const r = { ...rect };
    r.x = Math.max(containRect.x, Math.min(containRect.x + containRect.w - 8, r.x));
    r.y = Math.max(containRect.y, Math.min(containRect.y + containRect.h - 8, r.y));
    r.w = Math.max(8, Math.min(containRect.w - (r.x - containRect.x), r.w));
    r.h = Math.max(8, Math.min(containRect.h - (r.y - containRect.y), r.h));
    return r;
  }, []);

  const applyAspect = useCallback((rect, ratio) => {
    if (!ratio) return rect;
    // anchor the resize at the top-left: keep x/y, fit h to w (or w to h)
    let w = rect.w, h = w / ratio;
    if (h > rect.h) { h = rect.h; w = h * ratio; }
    return { x: rect.x, y: rect.y, w, h };
  }, []);

  const onPointerDown = (e, handle) => {
    const rect = containerRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const startX = interaction?.startX ?? px;
    const startY = interaction?.startY ?? py;
    const mode = handle ? "resize" : (crop && px >= crop.x && px <= crop.x + crop.w && py >= crop.y && py <= crop.y + crop.h ? "move" : "draw");
    const orig = mode === "draw" ? null : { ...crop };
    setInteraction({ mode, handle: handle || null, startX: startX, startY: startY, orig });
  };

  const onPointerMove = (e) => {
    if (!interaction || !contain) return;
    const rect = containerRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const dx = px - interaction.startX;
    const dy = py - interaction.startY;

    let next;
    if (interaction.mode === "draw") {
      const raw = { x: Math.min(interaction.startX, px), y: Math.min(interaction.startY, py), w: Math.abs(px - interaction.startX), h: Math.abs(py - interaction.startY) };
      next = applyAspect(raw, aspectRatio);
    } else if (interaction.mode === "move") {
      next = { ...interaction.orig, x: interaction.orig.x + dx, y: interaction.orig.y + dy };
    } else {
      // Resize via one of 8 handles. Keep the "opposite" edge/corner anchored,
      // like every image editor. With an aspect lock the free dimension is
      // driven by the handle's dominant axis, then the other axis follows.
      const o = interaction.orig;
      const h = interaction.handle;
      let x = o.x, y = o.y, w = o.w, hh = o.h;
      if (h.includes("e")) w = o.w + dx;
      if (h.includes("s")) hh = o.h + dy;
      if (h.includes("w")) { w = o.w - dx; x = o.x + dx; }
      if (h.includes("n")) { hh = o.h - dy; y = o.y + dy; }

      let next;
      const ratio = aspectRatio;
      if (ratio) {
        // Drive by the axis the handle changes, then recompute the other to
        // keep the ratio, anchoring on the fixed corner.
        if (h.includes("e") && h.includes("n")) {
          const rw = Math.max(8, w);
          const r = { x, y: y + hh - (rw / ratio), w: rw, h: rw / ratio };
          next = r;
        } else if (h.includes("w") && h.includes("s")) {
          const rh = Math.max(8, hh);
          next = { x: x + w - (rh * ratio), y, w: rh * ratio, h: rh };
        } else if (h.includes("w") && h.includes("n")) {
          const rh = Math.max(8, hh);
          next = { x: x + w - (rh * ratio), y: y + hh - rh, w: rh * ratio, h: rh };
        } else if (h === "e" || h.includes("ne") || h.includes("se")) {
          const rw = Math.max(8, w);
          next = { x, y, w: rw, h: rw / ratio };
        } else {
          // south / west / north — drive by height
          const rh = Math.max(8, hh);
          next = { w: rh * ratio, h: rh };
          if (h.includes("w")) next.x = x + w - (rh * ratio);
          else next.x = x;
          if (h === "n") next.y = y + hh - rh;
          else next.y = y;
        }
        // nudge a slightly-negative anchor back to the image
        if (h === "n" && ratio) {
          next.y = Math.max(next.y, contain.y);
        }
      } else {
        next = { x, y, w, h: hh };
      }
    }
    setCrop(clampRect(next, contain));
  };

  const onPointerUp = () => setInteraction(null);

  const resetCrop = () => { if (contain) setCrop({ ...contain }); };

  const apply = () => {
    if (!img || !contain || !crop) return;
    const scaleX = img.naturalWidth / contain.w;
    const scaleY = img.naturalHeight / contain.h;
    let sx = (crop.x - contain.x) * scaleX;
    let sy = (crop.y - contain.y) * scaleY;
    let sw = crop.w * scaleX;
    let sh = crop.h * scaleY;
    sx = Math.max(0, Math.min(img.naturalWidth - 1, sx));
    sy = Math.max(0, Math.min(img.naturalHeight - 1, sy));
    sw = Math.min(img.naturalWidth - sx, sw);
    sh = Math.min(img.naturalHeight - sy, sh);
    const longSide = Math.max(sw, sh);
    const outScale = longSide > MAX_OUTPUT ? MAX_OUTPUT / longSide : 1;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(sw * outScale);
    canvas.height = Math.round(sh * outScale);
    const ctx = canvas.getContext("2d");
    const probe = new window.Image();
    probe.crossOrigin = "anonymous";
    probe.onload = () => {
      ctx.drawImage(probe, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      try {
        onApply(canvas.toDataURL("image/png"));
      } catch (err) {
        toast.error("Could not read image pixels — the source is likely blocked by the host (CORS)");
      }
    };
    probe.onerror = () => toast.error("Could not load the source image");
    probe.src = src;
  };

  const handles = ["nw", "n", "ne", "w", "e", "sw", "s", "se"];
  const handleStyle = (h) => {
    if (!crop) return {};
    const base = {
      position: "absolute", width: 12, height: 12, background: "#fff",
      border: "1.5px solid #0f1729", borderRadius: 2, cursor: "grab",
    };
    const c = crop;
    if (h.includes("n")) base.top = c.y - 6;
    if (h.includes("s")) base.top = c.y + c.h - 6;
    if (h.includes("w")) base.left = c.x - 6;
    if (h.includes("e")) base.left = c.x + c.w - 6;
    if (h === "n" || h === "s") base.left = c.x + c.w / 2 - 6;
    if (h === "w" || h === "e") base.top = c.y + c.h / 2 - 6;
    return base;
  };

  return (
    <div className="fixed inset-0 bg-ink/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl flex flex-col" onClick={(e) => e.stopPropagation()} data-testid="crop-image-dialog">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-line">
          <Crop size={16} />
          <div className="font-display font-bold">Crop image</div>
          <button onClick={onClose} className="ml-auto btn-ghost text-caption" data-testid="crop-close">Close</button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex flex-wrap items-center gap-1.5">
            {ASPECT_PRESETS.map((p) => (
              <button key={p.id} onClick={() => setAspect(p.id)} data-testid={`crop-aspect-${p.id}`}
                className={`text-caption px-3 py-1.5 rounded-full border transition-colors ${aspect === p.id ? "bg-ink text-white border-ink" : "border-line hover:border-ink text-neutral-600"}`}>
                {p.label}
              </button>
            ))}
          </div>

          <div
            ref={containerRef}
            className="relative overflow-hidden rounded-xl bg-[repeating-conic-gradient(#f1f1f3_0%_25%,#ffffff_0%_50%)] bg-[length:20px_20px] select-none"
            style={{ height: 420, touchAction: "none" }}
            onPointerDown={(e) => onPointerDown(e, null)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
            data-testid="crop-canvas"
          >
            {img && (
              <img
                src={img.src} alt=""
                crossOrigin="anonymous"
                draggable={false}
                className="absolute pointer-events-none"
                style={{
                  left: contain?.x, top: contain?.y, width: contain?.w, height: contain?.h,
                  objectFit: "contain", userSelect: "none",
                }}
              />
            )}
            {crop && (
              <div className="absolute pointer-events-none" style={{
                left: crop.x, top: crop.y, width: crop.w, height: crop.h,
                border: "1.5px solid #3B82F6", boxShadow: "0 0 0 9999px rgba(15,23,41,0.35)",
              }}>
                <div className="absolute inset-0" style={{ backgroundImage: "linear-gradient(45deg, rgba(255,255,255,0.4) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.4) 75%), linear-gradient(45deg, rgba(255,255,255,0.4) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.4) 75%)", backgroundSize: "14px 14px", backgroundPosition: "0 0, 7px 7px" }} />
                {handles.map((h) => (
                  <div key={h} data-handle={h} className="absolute pointer-events-auto" style={{ ...handleStyle(h), zIndex: 5 }}
                    onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e, h); }} />
                ))}
              </div>
            )}
          </div>

          {img && (
            <div className="text-[11px] text-neutral-500">
              Source: {img.naturalWidth}×{img.naturalHeight}px
              {crop && contain ? ` · crop ~${Math.round(crop.w / contain.w * img.naturalWidth)}×${Math.round(crop.h / contain.h * img.naturalHeight)}px` : ""}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-line flex items-center justify-between">
          <button onClick={resetCrop} className="btn-ghost text-caption" data-testid="crop-reset"><RotateCcw size={13} /> Reset</button>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-ghost text-caption">Cancel</button>
            <button onClick={apply} data-testid="crop-apply" className="btn-primary text-caption px-4">
              <Check size={13} /> Apply crop
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
