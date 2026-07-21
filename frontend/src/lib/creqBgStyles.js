// Extended background types for Create EQ slides
// Each generator returns a CSS background value for a slide

import { resolveColor } from "./creqTemplates";

export function renderBackgroundExt(bg, palette) {
  if (!bg) return palette.bg;

  switch (bg.type) {
    case "solid":
      return resolveColor(bg.color || "bg", palette);

    case "gradient":
      return gradientBg(bg, palette);

    case "mesh":
      return meshBg(bg, palette);

    case "noise":
      return noiseBg(bg, palette);

    case "grid":
      return gridBg(bg, palette);

    case "dots":
      return dotsBg(bg, palette);

    case "glass":
      return glassBg(bg, palette);

    case "abstract":
      return abstractBg(bg, palette);

    case "radial":
      return radialBg(bg, palette);

    case "swiss":
      return swissBg(bg, palette);

    case "blueprint":
      return blueprintBg(bg, palette);
    case "halftone":
      return halftoneBg(bg, palette);

    default:
      return resolveColor(bg.color || "bg", palette);
  }
}

function gradientBg(bg, palette) {
  const c1 = resolveColor(bg.color, palette);
  const c2 = resolveColor(bg.color2 || "accent", palette);
  return `linear-gradient(${bg.angle || 145}deg, ${c1}, ${c2})`;
}

function meshBg(bg, palette) {
  const colors = (bg.colors || [bg.color || "bg", bg.color2 || "accent"]).map((c) => resolveColor(c, palette));
  const angle = bg.angle || 145;
  if (colors.length === 2) {
    return `linear-gradient(${angle}deg, ${colors[0]} 0%, ${colors[1]} 100%)`;
  }
  if (colors.length >= 3) {
    return [
      `linear-gradient(${angle}deg, ${colors[0]} 0%, ${colors[1]} 50%, ${colors[2]} 100%)`,
      `radial-gradient(circle at 20% 30%, ${colors[0]}33 0%, transparent 50%)`,
      `radial-gradient(circle at 80% 70%, ${colors[1]}22 0%, transparent 40%)`,
    ].join(", ");
  }
  return resolveColor(colors[0], palette);
}

function noiseBg(bg, palette) {
  const base = resolveColor(bg.base_color || "bg", palette);
  const noiseSvg = `data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='${bg.opacity ?? 0.04}'/%3E%3C/svg%3E`;
  return `${base} url("${noiseSvg}")`;
}

function gridBg(bg, palette) {
  const color = resolveColor(bg.color || "muted", palette);
  const size = bg.size || 40;
  const opacity = bg.opacity ?? 0.08;
  return `linear-gradient(to right, ${color}${Math.round(opacity * 255).toString(16).padStart(2, "0")} 1px, transparent 1px),
          linear-gradient(to bottom, ${color}${Math.round(opacity * 255).toString(16).padStart(2, "0")} 1px, transparent 1px)`;
}

function dotsBg(bg, palette) {
  const color = resolveColor(bg.color || "muted", palette);
  const spacing = bg.spacing || 24;
  const radius = bg.radius || 2;
  const opacity = bg.opacity ?? 0.12;
  const r = Math.round(radius);
  return `radial-gradient(circle, ${color}${Math.round(opacity * 255).toString(16).padStart(2, "0")} ${r}px, transparent ${r}px)`;
}

function glassBg(bg, palette) {
  const base = resolveColor(bg.color || "bg", palette);
  const blur = bg.blur || 16;
  const opacity = bg.opacity ?? 0.6;
  return base;
}

function abstractBg(bg, palette) {
  const base = resolveColor(bg.color || "bg", palette);
  const accent = resolveColor(bg.accent_color || "accent", palette);
  const shape = bg.shape || "blob-1";
  const opacity = bg.opacity ?? 0.12;
  const alpha = Math.round(opacity * 255).toString(16).padStart(2, "0");

  if (shape === "blob-1") {
    return [
      base,
      `radial-gradient(circle at 20% 20%, ${accent}${alpha} 0%, transparent 50%)`,
      `radial-gradient(circle at 80% 80%, ${accent}${alpha} 0%, transparent 50%)`,
    ].join(", ");
  }
  if (shape === "blob-2") {
    return [
      base,
      `radial-gradient(circle at 10% 90%, ${accent}${alpha} 0%, transparent 45%)`,
      `radial-gradient(circle at 90% 10%, ${accent}${alpha} 0%, transparent 45%)`,
    ].join(", ");
  }
  return [
    base,
    `radial-gradient(circle at 50% 0%, ${accent}${alpha} 0%, transparent 50%)`,
  ].join(", ");
}

function radialBg(bg, palette) {
  const c1 = resolveColor(bg.color || "bg", palette);
  const c2 = resolveColor(bg.color2 || "accent", palette);
  return `radial-gradient(${bg.shape || "ellipse"} at ${bg.x || "50%"} ${bg.y || "50%"}, ${c1}, ${c2})`;
}

function swissBg(bg, palette) {
  const base = resolveColor(bg.color || "bg", palette);
  const accent = resolveColor(bg.color2 || "accent", palette);
  const alpha = Math.round((bg.opacity ?? 0.04) * 255).toString(16).padStart(2, "0");
  return [
    base,
    `repeating-linear-gradient(0deg, transparent, transparent ${bg.stripe_size || 40}px, ${accent}${alpha} ${bg.stripe_size || 40}px, ${accent}${alpha} ${(bg.stripe_size || 40) + 1}px)`,
    `repeating-linear-gradient(90deg, transparent, transparent ${bg.stripe_size || 40}px, ${accent}${alpha} ${bg.stripe_size || 40}px, ${accent}${alpha} ${(bg.stripe_size || 40) + 1}px)`,
  ].join(", ");
}

function halftoneBg(bg, palette) {
  const dotColor = resolveColor(bg.color || "accent", palette);
  const spacing = bg.spacing || 20;
  const alpha = Math.round((bg.opacity ?? 0.08) * 255).toString(16).padStart(2, "0");
  const r = Math.max(1, (bg.radius || 3));
  return `radial-gradient(${dotColor}${alpha} ${r}px, transparent ${r}px)`;
}

function blueprintBg(bg, palette) {
  const base = resolveColor(bg.color || "#0A3D6B", palette);
  const line = resolveColor(bg.line_color || "#60A5FA", palette);
  const alpha = "18";
  return [
    base,
    `repeating-linear-gradient(0deg, transparent, transparent ${bg.size || 40}px, ${line}${alpha} ${bg.size || 40}px, ${line}${alpha} ${(bg.size || 40) + 1}px)`,
    `repeating-linear-gradient(90deg, transparent, transparent ${bg.size || 40}px, ${line}${alpha} ${bg.size || 40}px, ${line}${alpha} ${(bg.size || 40) + 1}px)`,
    `repeating-linear-gradient(0deg, transparent, transparent ${(bg.size || 40) * 4}px, ${line}${"30"} ${(bg.size || 40) * 4}px, ${line}${"30"} ${(bg.size || 40) * 4 + 2}px)`,
    `repeating-linear-gradient(90deg, transparent, transparent ${(bg.size || 40) * 4}px, ${line}${"30"} ${(bg.size || 40) * 4}px, ${line}${"30"} ${(bg.size || 40) * 4 + 2}px)`,
  ].join(", ");
}

export const BG_PRESETS = [
  { id: "solid-white", name: "White", bg: { type: "solid", color: "bg" }, palette_id: "mono" },
  { id: "solid-dark", name: "Dark", bg: { type: "solid", color: "bg" }, palette_id: "midnight" },
  { id: "gradient-warm", name: "Warm grad", bg: { type: "gradient", color: "bg", color2: "accent", angle: 145 } },
  { id: "gradient-cool", name: "Cool grad", bg: { type: "gradient", color: "#0A2540", color2: "#22D3EE", angle: 135 } },
  { id: "mesh-warm", name: "Mesh warm", bg: { type: "mesh", colors: ["#FEE2E2", "#FED7AA", "#FCD34D"], angle: 145 } },
  { id: "mesh-cool", name: "Mesh cool", bg: { type: "mesh", colors: ["#0A2540", "#0F766E", "#22D3EE"], angle: 145 } },
  { id: "noise-light", name: "Noise light", bg: { type: "noise", base_color: "bg", opacity: 0.04 } },
  { id: "noise-dark", name: "Noise dark", bg: { type: "noise", base_color: "bg", opacity: 0.08 } },
  { id: "grid-fine", name: "Fine grid", bg: { type: "grid", color: "muted", size: 24, opacity: 0.06 } },
  { id: "grid-bold", name: "Bold grid", bg: { type: "grid", color: "accent", size: 80, opacity: 0.1 } },
  { id: "dots-light", name: "Dots light", bg: { type: "dots", color: "muted", spacing: 24, radius: 2, opacity: 0.12 } },
  { id: "dots-heavy", name: "Dots heavy", bg: { type: "dots", color: "accent", spacing: 32, radius: 3, opacity: 0.2 } },
  { id: "swiss-light", name: "Swiss lines", bg: { type: "swiss", color: "bg", color2: "accent", stripe_size: 40, opacity: 0.04 } },
  { id: "abstract-blob", name: "Blob acccent", bg: { type: "abstract", shape: "blob-1", color: "bg", accent_color: "accent", opacity: 0.15 } },
  { id: "radial-glow", name: "Radial glow", bg: { type: "radial", color: "bg", color2: "accent", shape: "circle", x: "50%", y: "50%" } },
  { id: "radial-corner", name: "Radial corner", bg: { type: "radial", color: "bg", color2: "accent", shape: "ellipse", x: "0%", y: "0%" } },
  { id: "glass", name: "Glass", bg: { type: "glass", color: "bg", opacity: 0.5 } },
  { id: "corporate", name: "Corporate", bg: { type: "solid", color: "#FAFAFA" }, palette_id: "mono" },
  { id: "editorial-cream", name: "Cream", bg: { type: "solid", color: "#F5F1E8" }, palette_id: "paper" },
  /* --- New premium backgrounds --- */
  { id: "blueprint", name: "Blueprint", bg: { type: "blueprint", color: "#0A3D6B", line_color: "#60A5FA" } },
  { id: "halftone", name: "Halftone", bg: { type: "halftone", color: "accent", spacing: 20, radius: 3, opacity: 0.08 } },
  { id: "noise-heavy", name: "Heavy grain", bg: { type: "noise", base_color: "bg", opacity: 0.12 } },
  { id: "grid-finance", name: "Finance grid", bg: { type: "grid", color: "accent", size: 48, opacity: 0.06 } },
  { id: "dots-vertical", name: "Line dots", bg: { type: "dots", color: "muted", spacing: 16, radius: 1.5, opacity: 0.1 } },
  { id: "gradient-deep", name: "Deep ocean", bg: { type: "gradient", color: "#020617", color2: "#0F172A", angle: 180 } },
  { id: "mesh-sunset", name: "Sunset mesh", bg: { type: "mesh", colors: ["#7C2D12", "#DC2626", "#F97316"], angle: 120 } },
  { id: "mesh-forest", name: "Forest mesh", bg: { type: "mesh", colors: ["#064E3B", "#065F46", "#047857"], angle: 160 } },
  { id: "abstract-warm", name: "Warm abstract", bg: { type: "abstract", shape: "blob-2", color: "#FEF3C7", accent_color: "#F59E0B", opacity: 0.2 } },
  { id: "abstract-tech", name: "Tech abstract", bg: { type: "abstract", shape: "blob-3", color: "#0F172A", accent_color: "#3B82F6", opacity: 0.18 } },
  { id: "radial-spotlight", name: "Spotlight", bg: { type: "radial", color: "bg", color2: "accent", shape: "circle", x: "50%", y: "30%" } },
  { id: "swiss-heavy", name: "Swiss bold", bg: { type: "swiss", color: "bg", color2: "accent", stripe_size: 80, opacity: 0.1 } },
  { id: "elegant", name: "Elegant", bg: { type: "solid", color: "#1C1917" }, palette_id: "midnight" },
];

export const BG_PRESET_GROUPS = [
  { label: "Solid", presets: BG_PRESETS.filter((p) => p.bg.type === "solid") },
  { label: "Gradient", presets: BG_PRESETS.filter((p) => p.bg.type === "gradient" || p.bg.type === "mesh" || p.bg.type === "radial") },
  { label: "Texture", presets: BG_PRESETS.filter((p) => p.bg.type === "noise" || p.bg.type === "grid" || p.bg.type === "dots" || p.bg.type === "swiss") },
  { label: "Abstract", presets: BG_PRESETS.filter((p) => p.bg.type === "abstract" || p.bg.type === "glass") },
];
