import { useEffect, useRef } from "react";

const COLOR_FROM = [59, 130, 246]; // brand.from #3B82F6
const COLOR_TO = [139, 92, 246]; // brand.to #8B5CF6
const LINK_DIST = 130;
const MAX_DPR = 2;

/** Drifting constellation of dots in the brand blue→purple gradient, with
 *  faint links drawn between nearby particles — a lightweight stand-in for
 *  a GPU particle system. Canvas 2D on purpose: this mounts on the public
 *  landing page, so a Three.js/WebGL dependency and thousands of GPU
 *  particles would cost real first-load weight for a background flourish.
 *  Every buffer is preallocated once; the animation loop touches no objects
 *  per frame (typed arrays only) so it stays GC-free at 60fps. */
export default function ParticleField({ className = "", density = 9000, minCount = 36, maxCount = 110 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    let width = 0, height = 0, count = 0;
    let px, py, vx, vy; // preallocated Float32Arrays — no per-frame allocation
    let rafId = null;

    const seed = (w, h) => {
      count = Math.max(minCount, Math.min(maxCount, Math.round((w * h) / density)));
      px = new Float32Array(count);
      py = new Float32Array(count);
      vx = new Float32Array(count);
      vy = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        px[i] = Math.random() * w;
        py[i] = Math.random() * h;
        const a = Math.random() * Math.PI * 2;
        const s = 0.06 + Math.random() * 0.1;
        vx[i] = Math.cos(a) * s;
        vy[i] = Math.sin(a) * s;
      }
    };

    const resize = () => {
      const rect = canvas.parentElement.getBoundingClientRect();
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
      dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = width + "px";
      canvas.style.height = height + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed(width, height);
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);

      if (!reduceMotion) {
        for (let i = 0; i < count; i++) {
          let x = px[i] + vx[i], y = py[i] + vy[i];
          if (x < 0 || x > width) { vx[i] = -vx[i]; x = px[i] + vx[i]; }
          if (y < 0 || y > height) { vy[i] = -vy[i]; y = py[i] + vy[i]; }
          px[i] = x; py[i] = y;
        }
      }

      // links first, so dots render on top
      for (let i = 0; i < count; i++) {
        for (let j = i + 1; j < count; j++) {
          const dx = px[i] - px[j], dy = py[i] - py[j];
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < LINK_DIST) {
            const alpha = (1 - dist / LINK_DIST) * 0.16;
            ctx.strokeStyle = `rgba(99, 111, 246, ${alpha})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(px[i], py[i]);
            ctx.lineTo(px[j], py[j]);
            ctx.stroke();
          }
        }
      }

      for (let i = 0; i < count; i++) {
        const t = i / count;
        const r = COLOR_FROM[0] + (COLOR_TO[0] - COLOR_FROM[0]) * t;
        const g = COLOR_FROM[1] + (COLOR_TO[1] - COLOR_FROM[1]) * t;
        const b = COLOR_FROM[2] + (COLOR_TO[2] - COLOR_FROM[2]) * t;
        ctx.fillStyle = `rgba(${r | 0}, ${g | 0}, ${b | 0}, 0.55)`;
        ctx.beginPath();
        ctx.arc(px[i], py[i], 1.6, 0, Math.PI * 2);
        ctx.fill();
      }

      if (!reduceMotion) rafId = requestAnimationFrame(draw);
    };

    resize();
    draw();

    let resizeTimer = null;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (rafId) cancelAnimationFrame(rafId);
        resize();
        draw();
      }, 150);
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      clearTimeout(resizeTimer);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [density, minCount, maxCount]);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
