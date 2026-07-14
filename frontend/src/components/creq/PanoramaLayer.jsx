import { memo } from "react";
import { CANVAS } from "../../lib/creqTemplates";

/** Compute inline style for the panorama slice image on a slide (auto / manual / same). */
export function panoramaSliceStyle(panorama, slideIdx, totalSlides) {
  if (!panorama || !panorama.src || totalSlides < 1) return null;
  const n = Math.max(1, totalSlides);
  // Tailwind's Preflight base styles apply `img { max-width: 100% }` globally,
  // which silently clamps these images to the width of their containing block
  // (1080px) no matter what `width` we set below — for "auto" split mode that
  // caps every image to a single slide's width, so shifting it left by
  // `-slideIdx*CANVAS.w` pushes it fully out of view on every slide but the
  // first. `maxWidth: "none"` overrides that reset for this element only.
  const noMaxWidth = { maxWidth: "none" };
  // "same" mode: identical full-cover image on every slide.
  if (panorama.mode === "same") {
    return {
      position: "absolute", left: 0, top: 0,
      width: CANVAS.w, height: CANVAS.h, objectFit: "cover", ...noMaxWidth,
    };
  }
  if (panorama.mode === "manual") {
    const v = (panorama.viewports || [])[slideIdx] || { ox: 50, oy: 50, scale: 1 };
    const scale = Math.max(1, v.scale || 1);
    const imgW = CANVAS.w * scale;
    const imgH = CANVAS.h * scale;
    const left = -(imgW - CANVAS.w) * ((v.ox ?? 50) / 100);
    const top = -(imgH - CANVAS.h) * ((v.oy ?? 50) / 100);
    return { position: "absolute", left, top, width: imgW, height: imgH, objectFit: "cover", ...noMaxWidth };
  }
  // "auto" (default panoramic split): image is n×CANVAS.w wide, this slide shows slice at -i×CANVAS.w.
  // `baked_count` is the slide count the source image was actually generated/sliced
  // for — using it (not the live, possibly-drifted `totalSlides`) keeps every
  // slice glued to its original seam even after slides are added or removed.
  const baked = Math.max(1, panorama.baked_count || n);
  const imgW = baked * CANVAS.w;
  return {
    position: "absolute", left: -slideIdx * CANVAS.w, top: 0,
    width: imgW, height: CANVAS.h, objectFit: "cover", ...noMaxWidth,
  };
}

/** React overlay for panorama — renders one <img> sized/positioned to show the current slice. */
function PanoramaLayer({ panorama, slideIdx, totalSlides }) {
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

export default memo(PanoramaLayer);
