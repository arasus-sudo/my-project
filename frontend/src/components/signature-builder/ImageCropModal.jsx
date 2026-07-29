import { useEffect, useRef, useState } from "react";
import { Check, X, ZoomIn } from "lucide-react";

const FRAME = 280; // on-screen preview crop frame, px
const OUTPUT = 480; // exported image resolution, px — plenty sharp for a signature

/** Drag-to-pan, slider-to-zoom crop tool. Bakes the crop (and, for circle/
 * rounded shapes, an actual alpha-masked edge) into the exported PNG via
 * canvas — rather than leaning on CSS border-radius + object-fit, which
 * Outlook desktop's Word rendering engine doesn't reliably honor on <img>.
 * That's also why this exists at all: object-fit:cover with no way to pick
 * *which* part of the image shows was the original bug — a wide logo or an
 * off-center headshot just got auto-cropped with no control. */
export default function ImageCropModal({ imageSrc, shape = "circle", onCancel, onConfirm }) {
  const [img, setImg] = useState(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const dragRef = useRef(null);

  useEffect(() => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => setImg(image);
    image.src = imageSrc;
  }, [imageSrc]);

  if (!img) {
    return (
      <div className="fixed inset-0 bg-ink/50 z-[60] flex items-center justify-center">
        <div className="bg-white rounded-2xl p-6 text-body text-ink-muted">Loading image…</div>
      </div>
    );
  }

  const baseScale = Math.max(FRAME / img.naturalWidth, FRAME / img.naturalHeight);
  const effScale = baseScale * scale;
  const dispW = img.naturalWidth * effScale;
  const dispH = img.naturalHeight * effScale;
  const maxX = Math.max(0, (dispW - FRAME) / 2);
  const maxY = Math.max(0, (dispH - FRAME) / 2);
  const clamp = (v, m) => Math.max(-m, Math.min(m, v));

  const onPointerDown = (e) => {
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: offset.x, origY: offset.y };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };
  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    setOffset({
      x: clamp(d.origX + (e.clientX - d.startX), maxX),
      y: clamp(d.origY + (e.clientY - d.startY), maxY),
    });
  };
  const onPointerUp = () => {
    dragRef.current = null;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  };

  const onZoom = (e) => {
    const next = parseFloat(e.target.value);
    // Re-clamp the existing offset for the new scale so the image can't
    // suddenly show blank space when zooming back out.
    const nextBaseScale = Math.max(FRAME / img.naturalWidth, FRAME / img.naturalHeight) * next;
    const nw = img.naturalWidth * nextBaseScale, nh = img.naturalHeight * nextBaseScale;
    const nmx = Math.max(0, (nw - FRAME) / 2), nmy = Math.max(0, (nh - FRAME) / 2);
    setScale(next);
    setOffset((o) => ({ x: clamp(o.x, nmx), y: clamp(o.y, nmy) }));
  };

  const confirm = async () => {
    setBusy(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT;
      canvas.height = OUTPUT;
      const ctx = canvas.getContext("2d");
      const k = OUTPUT / FRAME;

      if (shape === "circle") {
        ctx.beginPath();
        ctx.arc(OUTPUT / 2, OUTPUT / 2, OUTPUT / 2, 0, Math.PI * 2);
        ctx.clip();
      } else if (shape === "rounded") {
        const r = OUTPUT * 0.15;
        ctx.beginPath();
        ctx.moveTo(r, 0);
        ctx.arcTo(OUTPUT, 0, OUTPUT, OUTPUT, r);
        ctx.arcTo(OUTPUT, OUTPUT, 0, OUTPUT, r);
        ctx.arcTo(0, OUTPUT, 0, 0, r);
        ctx.arcTo(0, 0, OUTPUT, 0, r);
        ctx.closePath();
        ctx.clip();
      }

      const outScale = effScale * k;
      const dw = img.naturalWidth * outScale, dh = img.naturalHeight * outScale;
      const dx = OUTPUT / 2 - dw / 2 + offset.x * k;
      const dy = OUTPUT / 2 - dh / 2 + offset.y * k;
      ctx.drawImage(img, dx, dy, dw, dh);

      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      await onConfirm(blob);
    } finally {
      setBusy(false);
    }
  };

  const maskClip = shape === "circle" ? "50%" : shape === "rounded" ? "15%" : "0";

  return (
    <div className="fixed inset-0 bg-ink/50 z-[60] flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl p-5 space-y-4 w-full max-w-sm" onClick={(e) => e.stopPropagation()} data-testid="image-crop-modal">
        <div className="flex items-center justify-between">
          <div className="font-display font-semibold text-body">Adjust image</div>
          <button onClick={onCancel} className="btn-ghost text-caption p-1"><X size={14} /></button>
        </div>

        <div
          onPointerDown={onPointerDown}
          className="relative mx-auto overflow-hidden bg-ash cursor-move select-none"
          style={{ width: FRAME, height: FRAME, borderRadius: maskClip }}
          data-testid="image-crop-frame"
        >
          <img
            src={imageSrc}
            alt=""
            draggable={false}
            className="absolute pointer-events-none"
            style={{
              width: dispW, height: dispH,
              left: FRAME / 2 - dispW / 2 + offset.x,
              top: FRAME / 2 - dispH / 2 + offset.y,
            }}
          />
        </div>

        <label className="flex items-center gap-2 text-caption text-ink-muted">
          <ZoomIn size={13} />
          <input type="range" min="1" max="3" step="0.01" value={scale} onChange={onZoom} className="flex-1" data-testid="image-crop-zoom" />
        </label>
        <p className="text-tiny text-ink-tertiary text-center">Drag to reposition · scroll the slider to zoom</p>

        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="btn-secondary text-caption">Cancel</button>
          <button onClick={confirm} disabled={busy} data-testid="image-crop-confirm" className="btn-primary text-caption">
            {busy ? "Saving…" : <><Check size={13} /> Apply crop</>}
          </button>
        </div>
      </div>
    </div>
  );
}
