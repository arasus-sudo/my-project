// Design token engine for Create EQ — combines backgrounds, typography, layout,
// image frames, decorations, and effects into one-click themes.

export const IMAGE_FRAMES = [
  // ── Basic shapes ──
  { id: "rounded", label: "Rounded rect", clip: null, radius: 24, category: "basic" },
  { id: "circle", label: "Circle", clip: "circle(50%)", radius: 0, category: "basic" },
  { id: "ellipse", label: "Ellipse", clip: "ellipse(50% 50%)", radius: 0, category: "basic" },
  { id: "squircle", label: "Squircle", clip: null, radius: 999, aspect: 1, category: "basic" },
  { id: "triangle", label: "Triangle", clip: "polygon(50% 0%, 0% 100%, 100% 100%)", radius: 0, category: "basic" },
  { id: "hexagon", label: "Hexagon", clip: "polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)", radius: 0, category: "basic" },
  { id: "octagon", label: "Octagon", clip: "polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)", radius: 0, category: "basic" },
  { id: "diamond", label: "Diamond", clip: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)", radius: 0, category: "basic" },
  { id: "pentagon", label: "Pentagon", clip: "polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)", radius: 0, category: "basic" },
  { id: "chevron", label: "Chevron", clip: "polygon(0% 0%, 80% 0%, 100% 50%, 80% 100%, 0% 100%, 20% 50%)", radius: 0, category: "basic" },
  { id: "arrow-up", label: "Arrow up", clip: "polygon(50% 0%, 100% 40%, 70% 40%, 70% 100%, 30% 100%, 30% 40%, 0% 40%)", radius: 0, category: "basic" },
  { id: "cross", label: "Cross", clip: "polygon(35% 0%, 65% 0%, 65% 35%, 100% 35%, 100% 65%, 65% 65%, 65% 100%, 35% 100%, 35% 65%, 0% 65%, 0% 35%, 35% 35%)", radius: 0, category: "basic" },

  // ── Rounded variants ──
  { id: "rrounded", label: "Rounded rect", clip: null, radius: 12, category: "rounded" },
  { id: "rpill", label: "Pill", clip: null, radius: 999, category: "rounded" },
  { id: "rhexagon", label: "Rounded hexagon", clip: "polygon(25% 2%, 75% 2%, 98% 50%, 75% 98%, 25% 98%, 2% 50%)", radius: 0, category: "rounded" },
  { id: "rdiamond", label: "Rounded diamond", clip: "polygon(50% 2%, 98% 50%, 50% 98%, 2% 50%)", radius: 0, category: "rounded" },
  { id: "rsquare", label: "Soft square", clip: null, radius: 8, category: "rounded" },
  { id: "rtriangle", label: "Rounded triangle", clip: "polygon(50% 2%, 2% 98%, 98% 98%)", radius: 0, category: "rounded" },

  // ── Decorative shapes ──
  { id: "star", label: "Star", clip: "path('M 50 2 L 63 38 L 100 38 L 70 62 L 80 100 L 50 76 L 20 100 L 30 62 L 0 38 L 37 38 Z')", radius: 0, category: "decorative" },
  { id: "star-4", label: "4-point star", clip: "path('M 50 0 L 55 45 L 100 50 L 55 55 L 50 100 L 45 55 L 0 50 L 45 45 Z')", radius: 0, category: "decorative" },
  { id: "star-6", label: "6-point star", clip: "path('M 50 0 L 55 22 L 80 10 L 66 33 L 100 50 L 66 66 L 80 90 L 55 78 L 50 100 L 45 78 L 20 90 L 33 66 L 0 50 L 33 33 L 20 10 L 45 22 Z')", radius: 0, category: "decorative" },
  { id: "heart", label: "Heart", clip: "path('M 12 21.35 L 10.55 20.03 C 5.4 15.36 2 12.27 2 8.5 C 2 5.41 4.42 3 7.5 3 C 9.24 3 10.91 3.81 12 5.08 C 13.09 3.81 14.76 3 16.5 3 C 19.58 3 22 5.41 22 8.5 C 22 12.27 18.6 15.36 13.45 20.03 L 12 21.35 Z')", radius: 0, category: "decorative" },
  { id: "cloud", label: "Cloud", clip: "path('M 30 80 A 20 20 0 1 1 30 40 A 25 25 0 1 1 70 35 A 22 22 0 1 1 75 75 A 18 18 0 1 1 75 80 Z')", radius: 0, category: "decorative" },
  { id: "bubble", label: "Speech bubble", clip: "path('M 10 10 L 90 10 C 95 10 100 15 100 20 L 100 70 C 100 75 95 80 90 80 L 50 80 L 30 95 L 35 80 L 10 80 C 5 80 0 75 0 70 L 0 20 C 0 15 5 10 10 10 Z')", radius: 0, category: "decorative" },
  { id: "drop", label: "Drop / teardrop", clip: "path('M 50,2 C 50,2 92,38 92,70 C 92,94 74,100 50,100 C 26,100 8,94 8,70 C 8,38 50,2 50,2 Z')", radius: 0, category: "decorative" },
  { id: "ribbon", label: "Ribbon", clip: "polygon(10% 0%, 90% 0%, 100% 50%, 90% 100%, 50% 85%, 10% 100%, 0% 50%)", radius: 0, category: "decorative" },
  { id: "flower", label: "Flower", clip: "path('M 50 0 C 50 25 75 30 50 50 C 75 30 100 40 100 60 C 80 70 65 65 70 85 C 50 75 50 100 50 100 C 50 100 50 75 30 85 C 35 65 20 70 0 60 C 0 40 25 30 50 50 C 25 30 50 25 50 0 Z')", radius: 0, category: "decorative" },
  { id: "leaf", label: "Leaf", clip: "path('M 50 100 C 20 80 5 50 10 15 C 30 5 60 10 80 30 C 95 50 90 80 50 100 Z')", radius: 0, category: "decorative" },

  // ── Organic blobs ──
  { id: "blob", label: "Blob 1", clip: "path('M 50,2 C 78,4 96,18 98,42 C 100,66 88,94 60,98 C 34,102 8,90 4,64 C 0,40 12,10 50,2 Z')", radius: 0, category: "blob" },
  { id: "blob2", label: "Blob 2", clip: "path('M 48 3 C 68 0 88 12 95 30 C 102 48 96 70 82 84 C 68 98 42 102 24 92 C 6 82 -2 58 2 36 C 6 14 28 6 48 3 Z')", radius: 0, category: "blob" },
  { id: "blob3", label: "Blob 3", clip: "path('M 52 5 C 72 8 90 20 94 40 C 98 60 88 82 70 92 C 52 102 28 98 14 80 C 0 62 2 36 18 18 C 34 0 42 3 52 5 Z')", radius: 0, category: "blob" },
  { id: "blob4", label: "Blob 4", clip: "path('M 50 8 C 70 2 90 15 96 35 C 102 55 92 75 75 90 C 58 105 30 100 14 82 C -2 64 0 35 18 18 C 30 5 40 10 50 8 Z')", radius: 0, category: "blob" },
  { id: "blob5", label: "Blob 5", clip: "path('M 45 6 C 65 2 85 10 93 28 C 101 46 95 68 78 84 C 61 100 32 102 15 86 C -2 70 0 38 16 20 C 28 8 35 8 45 6 Z')", radius: 0, category: "blob" },

  // ── Geometric ──
  { id: "parallelogram", label: "Parallelogram", clip: "polygon(20% 0%, 100% 0%, 80% 100%, 0% 100%)", radius: 0, category: "geometric" },
  { id: "trapezoid", label: "Trapezoid", clip: "polygon(15% 0%, 85% 0%, 100% 100%, 0% 100%)", radius: 0, category: "geometric" },
  { id: "arch", label: "Arch", clip: "polygon(0% 0%, 100% 0%, 100% 85%, 50% 100%, 0% 85%)", radius: 0, category: "geometric" },
  { id: "ring", label: "Ring", clip: "path('M 12 2 C 6.48 2 2 6.48 2 12 C 2 17.52 6.48 22 12 22 C 17.52 22 22 17.52 22 12 C 22 6.48 17.52 2 12 2 Z M 12 18 C 8.69 18 6 15.31 6 12 C 6 8.69 8.69 6 12 6 C 15.31 6 18 8.69 18 12 C 18 15.31 15.31 18 12 18 Z')", radius: 0, category: "geometric" },
  { id: "half-circle", label: "Half circle", clip: "polygon(0% 100%, 100% 100%, 100% 0%, 0% 0%)", clipExtra: "circle(50% at 50% 100%)", radius: 0, category: "geometric" },
  { id: "crescent", label: "Crescent", clip: "path('M 12 2 C 6.48 2 2 6.48 2 12 C 2 17.52 6.48 22 12 22 C 8 18 8 6 12 2 Z')", radius: 0, category: "geometric" },

  // ── Social / Media frames ──
  { id: "polaroid", label: "Polaroid", clip: null, radius: 0, mockup: "polaroid", category: "social" },
  { id: "filmstrip", label: "Film strip", clip: null, radius: 0, mockup: "filmstrip", category: "social" },
  { id: "instagram", label: "Instagram story", clip: null, radius: 12, category: "social", aspect: 9 / 16 },
  { id: "browser", label: "Browser window", clip: null, radius: 12, mockup: "browser", category: "social" },
  { id: "polaroid-mini", label: "Mini polaroid", clip: null, radius: 0, mockup: "polaroid", category: "social" },

  // ── Device frames ──
  { id: "phone", label: "Phone", clip: "path('M 8 0 L 16 0 C 18 0 20 2 20 4 L 20 20 C 20 22 18 24 16 24 L 8 24 C 6 24 4 22 4 20 L 4 4 C 4 2 6 0 8 0 Z')", radius: 0, category: "device" },
  { id: "tablet", label: "Tablet", clip: "path('M 6 0 L 18 0 C 20 0 22 2 22 4 L 22 20 C 22 22 20 24 18 24 L 6 24 C 4 24 2 22 2 20 L 2 4 C 2 2 4 0 6 0 Z')", radius: 0, category: "device" },
  { id: "laptop", label: "Laptop", clip: "path('M 2 2 L 22 2 C 23 2 24 3 24 4 L 24 16 L 0 16 L 0 4 C 0 3 1 2 2 2 Z')", radius: 0, category: "device" },
  { id: "watch", label: "Watch face", clip: "path('M 8 4 C 8 2 10 0 12 0 C 14 0 16 2 16 4 L 16 20 C 16 22 14 24 12 24 C 10 24 8 22 8 20 Z')", radius: 0, category: "device" },
];

export const FRAME_CATEGORIES = [
  { key: "basic", label: "Basic shapes", icon: "□" },
  { key: "rounded", label: "Rounded", icon: "⊡" },
  { key: "decorative", label: "Decorative", icon: "✦" },
  { key: "blob", label: "Organic blobs", icon: "◍" },
  { key: "geometric", label: "Geometric", icon: "◇" },
  { key: "social", label: "Social media", icon: "📱" },
  { key: "device", label: "Device", icon: "📲" },
];

export const DECORATIVE_CATEGORIES = [
  {
    label: "Stars",
    type: "star",
    shapes: [
      { index: 0 }, { index: 1 }, { index: 2 }, { index: 3 },
      { index: 4 }, { index: 5 }, { index: 6 }, { index: 7 },
    ],
  },
  {
    label: "Flowers",
    type: "flower",
    shapes: [
      { index: 0 }, { index: 1 }, { index: 2 }, { index: 3 },
      { index: 4 }, { index: 5 }, { index: 6 }, { index: 7 },
    ],
  },
  {
    label: "Ellipses",
    type: "ellipse",
    shapes: [
      { index: 0 }, { index: 1 }, { index: 2 }, { index: 3 },
    ],
  },
  {
    label: "Moons",
    type: "moon",
    shapes: [
      { index: 0 }, { index: 1 }, { index: 2 }, { index: 3 },
    ],
  },
  {
    label: "Wheels",
    type: "wheel",
    shapes: [
      { index: 0 }, { index: 1 }, { index: 2 },
    ],
  },
  {
    label: "Triangles",
    type: "triangle",
    shapes: [
      { index: 0 }, { index: 1 }, { index: 2 }, { index: 3 },
    ],
  },
  {
    label: "Polygons",
    type: "polygon",
    shapes: [
      { index: 0 }, { index: 1 }, { index: 2 }, { index: 3 },
    ],
  },
  {
    label: "Rectangles",
    type: "rectangle",
    shapes: [
      { index: 0 }, { index: 1 }, { index: 2 }, { index: 3 },
    ],
  },
  {
    label: "Numbers",
    type: "number",
    shapes: [
      { index: 0 }, { index: 1 }, { index: 2 },
    ],
  },
  {
    label: "Misc",
    type: "misc",
    shapes: [
      { index: 0 }, { index: 1 }, { index: 2 }, { index: 3 },
    ],
  },
];

// Quick decorative presets — recommended shapes for slide accents
export const DECORATIVE_PRESETS = [
  { name: "Sparkle", type: "star", index: 6, size: 180 },
  { name: "Sun", type: "star", index: 0, size: 240 },
  { name: "Star", type: "star", index: 1, size: 200 },
  { name: "Daisy", type: "flower", index: 0, size: 200 },
  { name: "Bloom", type: "flower", index: 3, size: 200 },
  { name: "Petal", type: "flower", index: 7, size: 160 },
  { name: "Circle", type: "ellipse", index: 0, size: 200 },
  { name: "Ring", type: "ellipse", index: 1, size: 200 },
  { name: "Crescent", type: "moon", index: 0, size: 220 },
  { name: "Moon", type: "moon", index: 1, size: 200 },
  { name: "Gear", type: "wheel", index: 0, size: 200 },
  { name: "Pinwheel", type: "wheel", index: 1, size: 200 },
  { name: "Triangle", type: "triangle", index: 0, size: 200 },
  { name: "Hexagon", type: "polygon", index: 0, size: 200 },
  { name: "Octagon", type: "polygon", index: 1, size: 200 },
  { name: "Frame", type: "rectangle", index: 0, size: 200 },
  { name: "Badge", type: "rectangle", index: 1, size: 200 },
  { name: "Number 1", type: "number", index: 0, size: 220 },
  { name: "Number 2", type: "number", index: 1, size: 220 },
  { name: "Splash", type: "misc", index: 0, size: 240 },
  { name: "Drop", type: "misc", index: 1, size: 200 },
  { name: "Bolt", type: "misc", index: 2, size: 200 },
  // Small accent shapes
  { name: "Tiny Star", type: "star", index: 2, size: 60 },
  { name: "Mini Sun", type: "star", index: 0, size: 80 },
  { name: "Dot", type: "ellipse", index: 0, size: 40 },
  { name: "Small Ring", type: "ellipse", index: 1, size: 70 },
  { name: "Tiny Moon", type: "moon", index: 1, size: 60 },
  { name: "Mini Gear", type: "wheel", index: 0, size: 70 },
  { name: "Tiny Hex", type: "polygon", index: 0, size: 50 },
  { name: "Mini Octa", type: "polygon", index: 1, size: 55 },
  { name: "Mini Tri", type: "triangle", index: 0, size: 50 },
  { name: "Tiny Cross", type: "misc", index: 2, size: 50 },
  { name: "Mini Petal", type: "flower", index: 1, size: 60 },
  { name: "Tiny Flower", type: "flower", index: 5, size: 70 },
  { name: "Mini Drop", type: "misc", index: 1, size: 55 },
  { name: "Tiny Badge", type: "rectangle", index: 1, size: 60 },
  { name: "Mini Frame", type: "rectangle", index: 0, size: 65 },
  { name: "Tiny Star 2", type: "star", index: 5, size: 45 },
  { name: "Mini Spark", type: "star", index: 7, size: 50 },
  { name: "Tiny Ring", type: "ellipse", index: 2, size: 55 },
  { name: "Mini Wheel", type: "wheel", index: 2, size: 60 },
  { name: "Tiny Splash", type: "misc", index: 0, size: 65 },
  { name: "Number 3", type: "number", index: 2, size: 80 },
];

export const ACCENT_ELEMENTS = [
  {
    name: "Gradient line",
    build: (idx) => ({ type: "shape", x: 80, y: 200 + idx * 200, w: 160, h: 4, fill: "accent", radius: 2, opacity: 0.6 }),
  },
  {
    name: "Corner accent TL",
    build: () => ({ type: "shape", x: 0, y: 0, w: 120, h: 120, fill: "accent", opacity: 0.08, radius: 0 }),
  },
  {
    name: "Corner accent BR",
    build: () => ({ type: "shape", x: 960, y: 1230, w: 120, h: 120, fill: "accent", opacity: 0.08, radius: 0 }),
  },
  {
    name: "Number badge",
    build: (idx) => ({ type: "badge", x: 80, y: 80, text: String(idx + 1), bg: "accent", color: "bg", radius: 999, size: 24 }),
  },
  {
    name: "Dots cluster",
    build: () => {
      const els = [];
      for (let i = 0; i < 5; i++) {
        els.push({ type: "shape", shape: "circle", x: 80 + i * 32, y: 80, w: 16, h: 16, fill: "accent", opacity: 0.3 - i * 0.05, radius: 999 });
      }
      return els;
    },
  },
  {
    name: "Gradient border",
    build: () => ({ type: "shape", x: 20, y: 20, w: 1040, h: 1310, fill: "muted", opacity: 0.03, radius: 24, stroke_w: 2, stroke_color: "accent", stroke_only: true }),
  },
];

// ── Premium composition helpers — one-click element clusters ──────────────

export const COMPOSITIONS = [
  {
    name: "Split with accent bar",
    build: (idx) => [
      { type: "shape", x: 0, y: 0, w: 1080, h: 1350, fill: "text", opacity: 0.04, radius: 0 },
      { type: "shape", x: 0, y: 0, w: 1080, h: 8, fill: "accent", radius: 0, opacity: 0.6 },
      { type: "shape", x: 480, y: 0, w: 8, h: 1350, fill: "accent", radius: 0, opacity: 0.1 },
    ],
  },
  {
    name: "Floating card",
    build: (idx) => [
      { type: "shape", x: 100, y: 200, w: 880, h: 600, fill: "bg", opacity: 0.9, radius: 32, shadow: true, shadow_blur: 40, shadow_color: "rgba(0,0,0,0.12)" },
    ],
  },
  {
    name: "Diagonal split",
    build: (idx) => [
      { type: "shape", x: 0, y: 0, w: 1080, h: 1350, fill: "accent", opacity: 0.06, clip: "polygon(0 0, 100% 0, 100% 40%, 0 100%)" },
    ],
  },
  {
    name: "Layered depth",
    build: (idx) => [
      { type: "shape", x: -40, y: -40, w: 1160, h: 1430, fill: "muted", opacity: 0.04, radius: 24 },
      { type: "shape", x: -20, y: -20, w: 1120, h: 1390, fill: "muted", opacity: 0.06, radius: 20 },
      { type: "shape", x: 0, y: 0, w: 1080, h: 1350, fill: "bg", opacity: 0.95, radius: 16, shadow: true, shadow_blur: 24, shadow_color: "rgba(0,0,0,0.08)" },
    ],
  },
  {
    name: "Corner frame",
    build: (idx) => [
      { type: "shape", x: 40, y: 40, w: 1000, h: 1270, fill: "muted", opacity: 0.0, radius: 0, stroke_only: true, border_color: "accent", border_w: 2 },
      { type: "shape", x: 40, y: 40, w: 80, h: 80, fill: "accent", opacity: 0.15, radius: 0 },
      { type: "shape", x: 960, y: 40, w: 80, h: 80, fill: "accent", opacity: 0.15, radius: 0 },
    ],
  },
  {
    name: "Glass overlay",
    build: (idx) => [
      { type: "shape", x: 80, y: 400, w: 920, h: 600, fill: "bg", opacity: 0.5, radius: 24, shadow: true, shadow_blur: 32, shadow_color: "rgba(0,0,0,0.1)" },
    ],
  },
  {
    name: "Centered spotlight",
    build: (idx) => [
      { type: "shape", x: 200, y: 300, w: 680, h: 750, fill: "accent", opacity: 0.04, radius: 999 },
      { type: "shape", x: 300, y: 400, w: 480, h: 550, fill: "accent", opacity: 0.06, radius: 999 },
    ],
  },
  {
    name: "Bottom bar",
    build: (idx) => [
      { type: "shape", x: 0, y: 1100, w: 1080, h: 250, fill: "accent", opacity: 1, radius: 0 },
      { type: "shape", x: 0, y: 1090, w: 1080, h: 10, fill: "accent", opacity: 0.3, radius: 0 },
    ],
  },
  {
    name: "Offset border",
    build: (idx) => [
      { type: "shape", x: 0, y: 0, w: 1080, h: 1350, fill: "muted", opacity: 0, stroke_only: true, border_color: "accent", border_w: 1 },
      { type: "shape", x: 12, y: 12, w: 1056, h: 1326, fill: "muted", opacity: 0, stroke_only: true, border_color: "text", border_w: 1, opacity: 0.08 },
    ],
  },
  {
    name: "Tagged container",
    build: (idx) => [
      { type: "badge", x: 80, y: 80, text: "FEATURED", bg: "accent", color: "bg", radius: 4, size: 16 },
      { type: "shape", x: 80, y: 110, w: 920, h: 800, fill: "muted", opacity: 0.04, radius: 16, stroke_only: true, border_color: "muted", border_w: 1 },
    ],
  },
];

// ── Theme presets: combine background, palette, frame, decoration, effects ──

export const DESIGN_THEMES = [
  {
    id: "corporate",
    name: "Corporate",
    desc: "Clean, professional, neutral palette",
    palette_id: "bone",
    bg: { type: "solid", color: "bg" },
    frame: "rounded",
    decoration: null,
    effects: { shadow: false, noise: false },
  },
  {
    id: "premium",
    name: "Premium",
    desc: "Dark background, elegant accents",
    palette_id: "midnight",
    bg: { type: "abstract", shape: "blob-1", color: "bg", accent_color: "accent", opacity: 0.12 },
    frame: "squircle",
    decoration: { type: "star", index: 6, size: 160, corner: "br" },
    effects: { shadow: true, noise: true },
  },
  {
    id: "editorial",
    name: "Editorial",
    desc: "Magazine-style, serif headlines, cream bg",
    palette_id: "paper",
    bg: { type: "solid", color: "bg" },
    frame: "arch",
    decoration: null,
    effects: { shadow: false, noise: true },
  },
  {
    id: "startup",
    name: "Startup",
    desc: "Bold accent, gradient bg, high energy",
    palette_id: "sunset",
    bg: { type: "gradient", color: "bg", color2: "accent", angle: 145 },
    frame: "pill",
    decoration: { type: "misc", index: 2, size: 200, corner: "tl" },
    effects: { shadow: false, noise: false },
  },
  {
    id: "swiss",
    name: "Swiss",
    desc: "Grid lines, monochrome, structured",
    palette_id: "mono",
    bg: { type: "swiss", color: "bg", color2: "accent", stripe_size: 40, opacity: 0.04 },
    frame: "rounded",
    decoration: null,
    effects: { shadow: false, noise: false },
  },
  {
    id: "luxury",
    name: "Luxury",
    desc: "Dark, gold accents, elegant",
    palette_id: "midnight",
    bg: { type: "noise", base_color: "bg", opacity: 0.06 },
    frame: "diamond",
    decoration: { type: "ellipse", index: 1, size: 240, corner: "tl" },
    effects: { shadow: true, noise: false },
  },
  {
    id: "cyberpunk",
    name: "Cyberpunk",
    desc: "Neon accents, dark grid, futuristic",
    palette_id: "cyber",
    bg: { type: "grid", color: "accent", size: 60, opacity: 0.08 },
    frame: "hexagon",
    decoration: { type: "polygon", index: 0, size: 200, corner: "br" },
    effects: { shadow: false, noise: true },
  },
  {
    id: "brutalist",
    name: "Brutalist",
    desc: "Bold blocks, heavy contrast, raw",
    palette_id: "midnight",
    bg: { type: "solid", color: "bg" },
    frame: "blob",
    decoration: { type: "rectangle", index: 0, size: 200, corner: "tl" },
    effects: { shadow: false, noise: false },
  },
  {
    id: "minimal",
    name: "Minimal",
    desc: "Whitespace, thin grid, clean",
    palette_id: "mono",
    bg: { type: "dots", color: "muted", spacing: 24, radius: 1, opacity: 0.08 },
    frame: "rounded",
    decoration: null,
    effects: { shadow: false, noise: false },
  },
  {
    id: "glassmorphism",
    name: "Glass",
    desc: "Frosted glass, soft blur, light",
    palette_id: "bone",
    bg: { type: "glass", color: "bg", opacity: 0.5 },
    frame: "squircle",
    decoration: { type: "ellipse", index: 0, size: 300, corner: "bl" },
    effects: { shadow: true, noise: false },
  },
  {
    id: "editorial-split",
    name: "Editorial Split",
    desc: "Split screen with image, serif text",
    palette_id: "bone",
    bg: { type: "solid", color: "bg" },
    frame: "rounded",
    decoration: null,
    effects: { shadow: false, noise: false },
  },
  {
    id: "ai-futuristic",
    name: "AI Futuristic",
    desc: "Gradient mesh, tech accents",
    palette_id: "ocean",
    bg: { type: "mesh", colors: ["#0A2540", "#0F766E", "#22D3EE"], angle: 145 },
    frame: "hexagon",
    decoration: { type: "misc", index: 0, size: 200, corner: "br" },
    effects: { shadow: true, noise: true },
  },
];
