import { CANVAS } from "../../lib/creqTemplates";

/** Compute inline style for the panorama slice image on a slide (auto or manual mode). */
export function panoramaSliceStyle(panorama, slideIdx, totalSlides) {
  if (!panorama || !panorama.src || totalSlides < 1) return null;
  const n = Math.max(1, totalSlides);
  if (panorama.mode === "manual") {
    const v = (panorama.viewports || [])[slideIdx] || { ox: 50, oy: 50, scale: 1 };
    const scale = Math.max(1, v.scale || 1);
    const imgW = CANVAS.w * scale;
    const imgH = CANVAS.h * scale;
    const left = -(imgW - CANVAS.w) * ((v.ox ?? 50) / 100);
    const top = -(imgH - CANVAS.h) * ((v.oy ?? 50) / 100);
    return { position: "absolute", left, top, width: imgW, height: imgH, objectFit: "cover" };
  }
  const imgW = n * CANVAS.w;
  return {
    position: "absolute", left: -slideIdx * CANVAS.w, top: 0,
    width: imgW, height: CANVAS.h, objectFit: "cover",
  };
}

/** React overlay for panorama — renders one <img> sized/positioned to show the current slice. */
export default function PanoramaLayer({ panorama, slideIdx, totalSlides }) {
  const style = panoramaSliceStyle(panorama, slideIdx, totalSlides);
  if (!style) return null;
  return (
    <img
      src={panorama.src}
      alt=""
      crossOrigin="anonymous"
      style={{ ...style, pointerEvents: "none", userSelect: "none" }}
      draggable={false}
    />
  );
}
