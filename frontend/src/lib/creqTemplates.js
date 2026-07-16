// Design system data for Create EQ — palettes, fonts, and preset templates.

export const PALETTES = [
  { id: "midnight", name: "Midnight",  bg: "#0F1010", bg2: "#1F2937", accent: "#E85D3A", text: "#FAFAFA", muted: "#9CA3AF" },
  { id: "bone",     name: "Bone",      bg: "#E8E9EB", bg2: "#F5F5F1", accent: "#212025", text: "#0F1010", muted: "#525252" },
  { id: "sunset",   name: "Sunset",    bg: "#FF6B4A", bg2: "#FBBF24", accent: "#0F172A", text: "#FFFFFF", muted: "#FCD34D" },
  { id: "ocean",    name: "Ocean",     bg: "#0A2540", bg2: "#0F766E", accent: "#22D3EE", text: "#F0F9FF", muted: "#7DD3FC" },
  { id: "forest",   name: "Forest",    bg: "#14532D", bg2: "#166534", accent: "#FCD34D", text: "#F0FDF4", muted: "#86EFAC" },
  { id: "rose",     name: "Rose",      bg: "#831843", bg2: "#BE185D", accent: "#F9A8D4", text: "#FFF1F2", muted: "#FBCFE8" },
  { id: "paper",    name: "Paper",     bg: "#F5F1E8", bg2: "#EED9B7", accent: "#B45309", text: "#1C1917", muted: "#78716C" },
  { id: "cyber",    name: "Cyber",     bg: "#030712", bg2: "#111827", accent: "#34D399", text: "#F9FAFB", muted: "#4ADE80" },
  { id: "coral",    name: "Coral",     bg: "#FEE2E2", bg2: "#FED7AA", accent: "#DC2626", text: "#7F1D1D", muted: "#F97316" },
  { id: "mono",     name: "Monochrome",bg: "#FFFFFF", bg2: "#F4F4F5", accent: "#000000", text: "#000000", muted: "#71717A" },
];

export const FONTS = [
  { id: "Inter",              cls: "font-inter",   label: "Inter (Sans, modern)" },
  { id: "Manrope",            cls: "font-manrope", label: "Manrope (Sans, geometric)" },
  { id: "Poppins",            cls: "font-poppins", label: "Poppins (Sans, rounded)" },
  { id: "Space Grotesk",      cls: "font-space",   label: "Space Grotesk (Sans, techy)" },
  { id: "Archivo Black",      cls: "font-archivo", label: "Archivo Black (Display, heavy)" },
  { id: "Bebas Neue",         cls: "font-bebas",   label: "Bebas Neue (Display, condensed)" },
  { id: "Playfair Display",   cls: "font-playfair",label: "Playfair Display (Serif, editorial)" },
  { id: "Instrument Serif",   cls: "font-instrument", label: "Instrument Serif (Serif, elegant)" },
  { id: "DM Serif Display",   cls: "font-dmserif", label: "DM Serif Display (Serif, punchy)" },
  { id: "JetBrains Mono",     cls: "font-mono",    label: "JetBrains Mono (Mono, code)" },
];

// Slide canvas is always authored at 1080×1350 (LinkedIn); other platforms rescale.
export const CANVAS = { w: 1080, h: 1350 };

const uid = () => Math.random().toString(36).slice(2, 10);

/** Helpers to build elements — always returns a fresh object with an id. */
const T = (over = {}) => ({
  id: uid(), type: "text", x: 80, y: 200, w: 920, h: 200,
  text: "Type here",
  font: "Inter", size: 96, weight: 800, italic: false, uppercase: false,
  color: "text", align: "left", letter_spacing: -0.03, line_height: 1.05,
  ...over,
});
const S = (over = {}) => ({ id: uid(), type: "shape", shape: "rect", x: 80, y: 80, w: 200, h: 200, fill: "accent", opacity: 1, radius: 24, ...over });
const B = (over = {}) => ({ id: uid(), type: "badge", x: 80, y: 80, text: "Innoira", bg: "accent", color: "bg", radius: 999, size: 20, ...over });
const I = (over = {}) => ({ id: uid(), type: "icon", x: 80, y: 80, w: 96, name: "Zap", color: "accent", stroke: 2, ...over });

/** Default palette applied when a template is dropped. */
export const DEFAULT_PALETTE = PALETTES[0];

export const TEMPLATES = [
  {
    id: "bold-quote",
    name: "Bold Quote",
    tag: "Editorial",
    palette: "midnight",
    thumb_bg: "#0F1010",
    thumb_accent: "#E85D3A",
    build: () => ({
      bg: { type: "solid", color: "bg" },
      elements: [
        B({ x: 80, y: 96, text: "PITCH EQ · 2026" }),
        T({ x: 80, y: 240, w: 920, h: 720, text: "The best cold emails don't feel cold. They feel like a person paid attention.",
            font: "Instrument Serif", size: 128, weight: 500, italic: true, color: "accent", line_height: 1.02 }),
        T({ x: 80, y: 1140, w: 920, h: 60, text: "— Innoira Agentic Suite",
            font: "Inter", size: 22, weight: 500, uppercase: true, letter_spacing: 0.12, color: "muted" }),
      ],
    }),
  },
  {
    id: "stat-card",
    name: "Statistic",
    tag: "Data",
    palette: "cyber",
    thumb_bg: "#030712",
    thumb_accent: "#34D399",
    build: () => ({
      bg: { type: "solid", color: "bg" },
      elements: [
        T({ x: 80, y: 140, w: 920, h: 60, text: "REPLY-RATE LIFT",
            font: "JetBrains Mono", size: 22, weight: 500, uppercase: true, letter_spacing: 0.24, color: "muted" }),
        T({ x: 80, y: 260, w: 920, h: 520, text: "3.7×",
            font: "Archivo Black", size: 420, weight: 900, color: "accent", line_height: 0.9 }),
        S({ x: 80, y: 820, w: 160, h: 8, fill: "accent", radius: 4 }),
        T({ x: 80, y: 880, w: 920, h: 240, text: "Teams switching to EQ-scored outbound see reply rates jump 3.7× on average within the first sprint.",
            font: "Inter", size: 44, weight: 500, color: "text", line_height: 1.2 }),
      ],
    }),
  },
  {
    id: "listicle",
    name: "Listicle · 3",
    tag: "Framework",
    palette: "bone",
    thumb_bg: "#E8E9EB",
    thumb_accent: "#212025",
    build: () => ({
      bg: { type: "solid", color: "bg" },
      elements: [
        T({ x: 80, y: 120, w: 920, h: 160, text: "Three cold-email fixes",
            font: "Space Grotesk", size: 96, weight: 700, color: "text", line_height: 1 }),
        S({ x: 80, y: 320, w: 60, h: 60, fill: "accent", radius: 999 }),
        T({ x: 88, y: 328, w: 60, h: 60, text: "1", font: "Space Grotesk", size: 32, weight: 700, color: "bg", align: "center" }),
        T({ x: 180, y: 320, w: 820, h: 60, text: "Score every draft on empathy", font: "Inter", size: 40, weight: 700, color: "text" }),
        T({ x: 180, y: 380, w: 820, h: 100, text: "The EQ Score catches robotic phrasing before you hit send.",
            font: "Inter", size: 26, weight: 400, color: "muted", line_height: 1.4 }),
        S({ x: 80, y: 560, w: 60, h: 60, fill: "accent", radius: 999 }),
        T({ x: 88, y: 568, w: 60, h: 60, text: "2", font: "Space Grotesk", size: 32, weight: 700, color: "bg", align: "center" }),
        T({ x: 180, y: 560, w: 820, h: 60, text: "Personalise on triggers, not merge fields", font: "Inter", size: 40, weight: 700, color: "text" }),
        T({ x: 180, y: 620, w: 820, h: 100, text: "Find funding, hiring or tech-stack shifts and lead with them.",
            font: "Inter", size: 26, weight: 400, color: "muted", line_height: 1.4 }),
        S({ x: 80, y: 800, w: 60, h: 60, fill: "accent", radius: 999 }),
        T({ x: 88, y: 808, w: 60, h: 60, text: "3", font: "Space Grotesk", size: 32, weight: 700, color: "bg", align: "center" }),
        T({ x: 180, y: 800, w: 820, h: 60, text: "One clear low-friction ask", font: "Inter", size: 40, weight: 700, color: "text" }),
        T({ x: 180, y: 860, w: 820, h: 100, text: "'Worth 15 minutes next week?' out-performs everything else.",
            font: "Inter", size: 26, weight: 400, color: "muted", line_height: 1.4 }),
      ],
    }),
  },
  {
    id: "hero",
    name: "Minimal Hero",
    tag: "Cover",
    palette: "ocean",
    thumb_bg: "#0A2540",
    thumb_accent: "#22D3EE",
    build: () => ({
      bg: { type: "gradient", color: "bg", color2: "bg2", angle: 145 },
      elements: [
        B({ x: 80, y: 96, text: "NEW · 2026" }),
        T({ x: 80, y: 480, w: 920, h: 380, text: "Cold email, warm intent.",
            font: "DM Serif Display", size: 156, weight: 700, italic: true, color: "text", line_height: 0.95 }),
        T({ x: 80, y: 900, w: 920, h: 120, text: "Pitch EQ scores every draft for empathy, clarity and spam risk — before you hit send.",
            font: "Inter", size: 30, weight: 400, color: "muted", line_height: 1.4 }),
        S({ x: 80, y: 1100, w: 260, h: 72, fill: "accent", radius: 999 }),
        T({ x: 80, y: 1120, w: 260, h: 32, text: "Get started →", font: "Inter", size: 22, weight: 600, color: "bg", align: "center" }),
      ],
    }),
  },
  {
    id: "cta",
    name: "CTA Card",
    tag: "Cover",
    palette: "sunset",
    thumb_bg: "#FF6B4A",
    thumb_accent: "#0F172A",
    build: () => ({
      bg: { type: "gradient", color: "bg", color2: "bg2", angle: 210 },
      elements: [
        T({ x: 80, y: 220, w: 920, h: 480, text: "Your outbound is\ntoo cold.",
            font: "Archivo Black", size: 176, weight: 900, color: "text", line_height: 0.95 }),
        T({ x: 80, y: 820, w: 920, h: 200, text: "Give it emotional intelligence in one afternoon.",
            font: "Inter", size: 34, weight: 500, color: "text", line_height: 1.3 }),
        S({ x: 80, y: 1100, w: 340, h: 84, fill: "accent", radius: 999 }),
        T({ x: 80, y: 1122, w: 340, h: 40, text: "Start free trial", font: "Inter", size: 26, weight: 700, color: "text", align: "center" }),
      ],
    }),
  },
  {
    id: "framework-2x2",
    name: "Framework 2×2",
    tag: "Framework",
    palette: "paper",
    thumb_bg: "#F5F1E8",
    thumb_accent: "#B45309",
    build: () => ({
      bg: { type: "solid", color: "bg" },
      elements: [
        T({ x: 80, y: 96, w: 920, h: 120, text: "The 2×2 of cold email",
            font: "Playfair Display", size: 80, weight: 700, italic: true, color: "text", line_height: 1 }),
        // grid lines
        S({ x: 80, y: 280, w: 920, h: 2, fill: "muted", radius: 0, opacity: 0.3 }),
        S({ x: 80, y: 800, w: 920, h: 2, fill: "muted", radius: 0, opacity: 0.3 }),
        S({ x: 538, y: 280, w: 2, h: 520, fill: "muted", radius: 0, opacity: 0.3 }),
        // labels
        T({ x: 100, y: 300, w: 420, h: 60, text: "HIGH EQ · RELEVANT", font: "JetBrains Mono", size: 20, weight: 500, uppercase: true, letter_spacing: 0.16, color: "accent" }),
        T({ x: 100, y: 360, w: 420, h: 400, text: "Reply. Meeting. Deal.", font: "Playfair Display", size: 56, weight: 700, italic: true, color: "text", line_height: 1 }),
        T({ x: 560, y: 300, w: 420, h: 60, text: "HIGH EQ · IRRELEVANT", font: "JetBrains Mono", size: 20, weight: 500, uppercase: true, letter_spacing: 0.16, color: "muted" }),
        T({ x: 560, y: 360, w: 420, h: 400, text: "Nice. Ignored.", font: "Playfair Display", size: 56, weight: 700, italic: true, color: "text", line_height: 1 }),
        T({ x: 100, y: 820, w: 420, h: 60, text: "LOW EQ · RELEVANT", font: "JetBrains Mono", size: 20, weight: 500, uppercase: true, letter_spacing: 0.16, color: "muted" }),
        T({ x: 100, y: 880, w: 420, h: 400, text: "Read. Not replied.", font: "Playfair Display", size: 56, weight: 700, italic: true, color: "text", line_height: 1 }),
        T({ x: 560, y: 820, w: 420, h: 60, text: "LOW EQ · IRRELEVANT", font: "JetBrains Mono", size: 20, weight: 500, uppercase: true, letter_spacing: 0.16, color: "muted" }),
        T({ x: 560, y: 880, w: 420, h: 400, text: "Spam folder.", font: "Playfair Display", size: 56, weight: 700, italic: true, color: "text", line_height: 1 }),
      ],
    }),
  },
  {
    id: "before-after",
    name: "Before / After",
    tag: "Compare",
    palette: "rose",
    thumb_bg: "#831843",
    thumb_accent: "#F9A8D4",
    build: () => ({
      bg: { type: "solid", color: "bg" },
      elements: [
        T({ x: 80, y: 96, w: 920, h: 100, text: "Before vs After Pitch EQ",
            font: "Inter", size: 56, weight: 800, color: "text" }),
        // Before
        S({ x: 80, y: 240, w: 440, h: 900, fill: "muted", radius: 32, opacity: 0.15 }),
        T({ x: 120, y: 280, w: 360, h: 40, text: "BEFORE", font: "JetBrains Mono", size: 20, weight: 500, uppercase: true, letter_spacing: 0.2, color: "muted" }),
        T({ x: 120, y: 340, w: 360, h: 720, text: "Hi {{first_name}}, hope this email finds you well! I'm reaching out because we help companies like yours grow…",
            font: "Inter", size: 24, weight: 400, color: "text", italic: true, line_height: 1.4 }),
        // After
        S({ x: 560, y: 240, w: 440, h: 900, fill: "accent", radius: 32 }),
        T({ x: 600, y: 280, w: 360, h: 40, text: "AFTER", font: "JetBrains Mono", size: 20, weight: 500, uppercase: true, letter_spacing: 0.2, color: "bg" }),
        T({ x: 600, y: 340, w: 360, h: 720, text: "Hey Alex — noticed Northloop just closed your Series B. Cold outreach usually stalls in that phase; worth 15 minutes?",
            font: "Inter", size: 24, weight: 500, color: "bg", line_height: 1.4 }),
      ],
    }),
  },
  {
    id: "big-num-list",
    name: "Big Number List",
    tag: "Data",
    palette: "forest",
    thumb_bg: "#14532D",
    thumb_accent: "#FCD34D",
    build: () => ({
      bg: { type: "solid", color: "bg" },
      elements: [
        T({ x: 80, y: 96, w: 920, h: 100, text: "Cold email in numbers",
            font: "Space Grotesk", size: 56, weight: 700, color: "text" }),
        T({ x: 80, y: 260, w: 220, h: 160, text: "8.5%", font: "Archivo Black", size: 128, weight: 900, color: "accent", line_height: 1 }),
        T({ x: 340, y: 290, w: 660, h: 120, text: "average reply rate for AI-slop outbound",
            font: "Inter", size: 32, weight: 500, color: "text", line_height: 1.3 }),
        T({ x: 80, y: 500, w: 220, h: 160, text: "23%", font: "Archivo Black", size: 128, weight: 900, color: "accent", line_height: 1 }),
        T({ x: 340, y: 530, w: 660, h: 120, text: "reply rate on EQ-scored 80+ emails",
            font: "Inter", size: 32, weight: 500, color: "text", line_height: 1.3 }),
        T({ x: 80, y: 740, w: 220, h: 160, text: "3.7×", font: "Archivo Black", size: 128, weight: 900, color: "accent", line_height: 1 }),
        T({ x: 340, y: 770, w: 660, h: 120, text: "lift when tone + relevance are both high",
            font: "Inter", size: 32, weight: 500, color: "text", line_height: 1.3 }),
        S({ x: 80, y: 1140, w: 920, h: 4, fill: "accent", radius: 0 }),
        T({ x: 80, y: 1170, w: 920, h: 60, text: "PITCH EQ · INNOIRA", font: "JetBrains Mono", size: 20, weight: 500, uppercase: true, letter_spacing: 0.24, color: "muted" }),
      ],
    }),
  },
  {
    id: "manifesto",
    name: "Manifesto",
    tag: "Editorial",
    palette: "paper",
    thumb_bg: "#F5F1E8",
    thumb_accent: "#B45309",
    build: () => ({
      bg: { type: "solid", color: "bg" },
      elements: [
        T({ x: 80, y: 120, w: 920, h: 60, text: "A NEW OUTBOUND MANIFESTO",
            font: "JetBrains Mono", size: 22, weight: 600, uppercase: true, letter_spacing: 0.24, color: "accent" }),
        T({ x: 80, y: 220, w: 920, h: 900, text: "We believe cold email should feel warm. That personalisation is more than a merge field. That empathy is measurable. That a great sales team is a great writing team.",
            font: "Playfair Display", size: 68, weight: 700, italic: true, color: "text", line_height: 1.15 }),
        T({ x: 80, y: 1180, w: 920, h: 40, text: "— Innoira", font: "Inter", size: 22, weight: 600, color: "muted" }),
      ],
    }),
  },
  {
    id: "step-guide",
    name: "5-Step Guide",
    tag: "Framework",
    palette: "coral",
    thumb_bg: "#FEE2E2",
    thumb_accent: "#DC2626",
    build: () => ({
      bg: { type: "solid", color: "bg" },
      elements: [
        T({ x: 80, y: 96, w: 920, h: 100, text: "5 steps to a better subject line",
            font: "Inter", size: 56, weight: 800, color: "text", line_height: 1 }),
        ...([1,2,3,4,5].flatMap((n, i) => {
          const y = 260 + i * 190;
          return [
            S({ x: 80, y, w: 80, h: 80, fill: "accent", radius: 999 }),
            T({ x: 80, y: y + 8, w: 80, h: 60, text: String(n), font: "Archivo Black", size: 44, weight: 900, color: "bg", align: "center" }),
            T({ x: 200, y, w: 800, h: 60, text: [
              "Lead with a trigger, not a template",
              "Reference their world, not yours",
              "Under 7 words, always",
              "No questions — questions get archived",
              "Human voice > professional voice",
            ][i], font: "Inter", size: 32, weight: 700, color: "text" }),
            T({ x: 200, y: y + 60, w: 800, h: 60, text: [
              "Funding, hiring or product-launch beats generic openers.",
              "'Your work on…' beats 'We help companies like yours…'",
              "Long subjects get truncated on mobile.",
              "State the benefit; let them ask the questions.",
              "Write like you'd text a colleague.",
            ][i], font: "Inter", size: 22, weight: 400, color: "muted", line_height: 1.35 }),
          ];
        })),
      ],
    }),
  },
  {
    id: "big-word",
    name: "Big Word",
    tag: "Cover",
    palette: "sunset",
    thumb_bg: "#FF6B4A",
    thumb_accent: "#0F172A",
    build: () => ({
      bg: { type: "gradient", color: "bg", color2: "bg2", angle: 45 },
      elements: [
        T({ x: 40, y: 400, w: 1000, h: 550, text: "REPLY",
            font: "Archivo Black", size: 380, weight: 900, color: "text", align: "center", line_height: 0.9 }),
        T({ x: 80, y: 1080, w: 920, h: 100, text: "Every cold email either earns one or dies trying.",
            font: "Inter", size: 32, weight: 500, italic: true, color: "text", align: "center" }),
      ],
    }),
  },
  {
    id: "vs",
    name: "This vs That",
    tag: "Compare",
    palette: "cyber",
    thumb_bg: "#030712",
    thumb_accent: "#34D399",
    build: () => ({
      bg: { type: "solid", color: "bg" },
      elements: [
        T({ x: 80, y: 96, w: 920, h: 80, text: "Merge fields vs Triggers",
            font: "Inter", size: 48, weight: 700, color: "text" }),
        S({ x: 80, y: 260, w: 440, h: 900, fill: "muted", radius: 32, opacity: 0.1 }),
        T({ x: 120, y: 300, w: 360, h: 40, text: "MERGE FIELDS", font: "JetBrains Mono", size: 20, weight: 600, uppercase: true, letter_spacing: 0.2, color: "muted" }),
        T({ x: 120, y: 380, w: 360, h: 400, text: "Hi {{first_name}},\n\nHope you're doing well!\n\nWe help {{industry}} companies like {{company}}…",
            font: "JetBrains Mono", size: 22, weight: 400, color: "text", line_height: 1.5 }),
        S({ x: 560, y: 260, w: 440, h: 900, fill: "accent", radius: 32, opacity: 0.12 }),
        T({ x: 600, y: 300, w: 360, h: 40, text: "TRIGGERS", font: "JetBrains Mono", size: 20, weight: 600, uppercase: true, letter_spacing: 0.2, color: "accent" }),
        T({ x: 600, y: 380, w: 360, h: 400, text: "Hey Alex — saw Northloop just closed the Series B. Congrats.\n\nOutbound usually stalls in this phase; happy to share what worked for our founder network.",
            font: "Inter", size: 22, weight: 500, italic: false, color: "text", line_height: 1.5 }),
      ],
    }),
  },
  {
    id: "checklist",
    name: "Checklist",
    tag: "Framework",
    palette: "ocean",
    thumb_bg: "#0A2540",
    thumb_accent: "#22D3EE",
    build: () => ({
      bg: { type: "solid", color: "bg" },
      elements: [
        T({ x: 80, y: 96, w: 920, h: 100, text: "The high-EQ email checklist",
            font: "Manrope", size: 60, weight: 800, color: "text", line_height: 1 }),
        ...(["A specific trigger from the last 30 days", "One sentence about their world before yours", "Under 120 words total", "One question — the ask", "No CTA button; a plain sentence", "Signature that reads like a human"].flatMap((line, i) => {
          const y = 300 + i * 130;
          return [
            S({ x: 80, y, w: 60, h: 60, fill: "accent", radius: 12 }),
            T({ x: 92, y: y + 8, w: 60, h: 60, text: "✓", font: "Inter", size: 40, weight: 800, color: "bg", align: "center" }),
            T({ x: 180, y: y + 10, w: 800, h: 50, text: line, font: "Manrope", size: 32, weight: 500, color: "text" }),
          ];
        })),
      ],
    }),
  },
  {
    id: "outro",
    name: "Follow / Outro",
    tag: "Cover",
    palette: "midnight",
    thumb_bg: "#0F1010",
    thumb_accent: "#E85D3A",
    build: () => ({
      bg: { type: "solid", color: "bg" },
      elements: [
        T({ x: 80, y: 300, w: 920, h: 200, text: "That's it.",
            font: "Instrument Serif", size: 220, weight: 400, italic: true, color: "accent", line_height: 1 }),
        T({ x: 80, y: 550, w: 920, h: 200, text: "Save this if it helped.\nFollow for more.",
            font: "Inter", size: 44, weight: 500, color: "text", line_height: 1.3 }),
        S({ x: 80, y: 1080, w: 300, h: 84, fill: "accent", radius: 999 }),
        T({ x: 80, y: 1102, w: 300, h: 40, text: "Follow @innoira", font: "Inter", size: 26, weight: 700, color: "bg", align: "center" }),
      ],
    }),
  },
  {
    id: "table",
    name: "Comparison Grid",
    tag: "Data",
    palette: "mono",
    thumb_bg: "#FFFFFF",
    thumb_accent: "#000000",
    build: () => ({
      bg: { type: "solid", color: "bg" },
      elements: [
        T({ x: 80, y: 96, w: 920, h: 100, text: "Old outbound vs. Pitch EQ",
            font: "Inter", size: 52, weight: 800, color: "text" }),
        // header row
        T({ x: 80, y: 260, w: 300, h: 40, text: "METRIC", font: "JetBrains Mono", size: 18, weight: 600, uppercase: true, letter_spacing: 0.2, color: "muted" }),
        T({ x: 400, y: 260, w: 300, h: 40, text: "TYPICAL", font: "JetBrains Mono", size: 18, weight: 600, uppercase: true, letter_spacing: 0.2, color: "muted" }),
        T({ x: 720, y: 260, w: 280, h: 40, text: "PITCH EQ", font: "JetBrains Mono", size: 18, weight: 600, uppercase: true, letter_spacing: 0.2, color: "accent" }),
        // rows
        ...([["Open rate", "42%", "68%"], ["Reply rate", "3%", "12%"], ["Booking rate", "0.4%", "2.1%"], ["Spam complaints", "0.6%", "0.05%"], ["Time per campaign", "6 hrs", "45 min"]].flatMap((row, i) => {
          const y = 340 + i * 130;
          return [
            S({ x: 80, y: y - 10, w: 920, h: 1, fill: "muted", radius: 0, opacity: 0.3 }),
            T({ x: 80, y, w: 300, h: 60, text: row[0], font: "Inter", size: 30, weight: 500, color: "text" }),
            T({ x: 400, y, w: 300, h: 60, text: row[1], font: "Inter", size: 30, weight: 400, color: "muted" }),
            T({ x: 720, y, w: 280, h: 60, text: row[2], font: "Archivo Black", size: 40, weight: 900, color: "accent" }),
          ];
        })),
      ],
    }),
  },
  {
    id: "timeline",
    name: "Timeline",
    tag: "Timeline",
    palette: "forest",
    thumb_bg: "#14532D",
    thumb_accent: "#FCD34D",
    build: () => ({
      bg: { type: "solid", color: "bg" },
      elements: [
        T({ x: 80, y: 100, w: 920, h: 100, text: "How we shipped it in 4 weeks",
            font: "Space Grotesk", size: 68, weight: 700, color: "text", line_height: 1.05 }),
        S({ x: 116, y: 280, w: 4, h: 900, fill: "accent", radius: 2, opacity: 0.5 }),
        ...(["Week 1 — Discovery & scoping", "Week 2 — Build & internal review",
             "Week 3 — Pilot with a real account", "Week 4 — Launch & measure"].flatMap((t, i) => {
          const y = 280 + i * 220;
          return [
            S({ x: 96, y: y + 6, w: 44, h: 44, fill: "accent", radius: 999 }),
            T({ x: 180, y, w: 780, h: 60, text: t, font: "Inter", size: 36, weight: 700, color: "text" }),
          ];
        })),
      ],
    }),
  },
  {
    id: "testimonial",
    name: "Testimonial",
    tag: "Testimonial",
    palette: "paper",
    thumb_bg: "#F5F1E8",
    thumb_accent: "#B45309",
    build: () => ({
      bg: { type: "solid", color: "bg" },
      elements: [
        I({ x: 80, y: 120, w: 72, name: "Quote", color: "accent", stroke: 2 }),
        T({ x: 80, y: 240, w: 920, h: 560, text: "We stopped guessing which draft would land. The score told us before we hit send — and reply rates followed.",
            font: "Instrument Serif", size: 68, weight: 500, italic: true, color: "text", line_height: 1.15 }),
        S({ x: 80, y: 900, w: 88, h: 88, fill: "muted", radius: 999, opacity: 0.25 }),
        T({ x: 188, y: 912, w: 700, h: 40, text: "Dana Rowe", font: "Inter", size: 30, weight: 700, color: "text" }),
        T({ x: 188, y: 954, w: 700, h: 40, text: "VP Sales, Northloop", font: "Inter", size: 24, weight: 400, color: "muted" }),
      ],
    }),
  },
  {
    id: "roadmap",
    name: "Roadmap",
    tag: "Roadmap",
    palette: "ocean",
    thumb_bg: "#0A2540",
    thumb_accent: "#22D3EE",
    build: () => ({
      bg: { type: "gradient", color: "bg", color2: "bg2", angle: 160 },
      elements: [
        T({ x: 80, y: 96, w: 920, h: 90, text: "What's next", font: "Archivo Black", size: 72, weight: 900, color: "text" }),
        ...(["NOW", "NEXT", "LATER"].flatMap((label, i) => {
          const y = 280 + i * 320;
          const items = [
            ["Live call transcripts", "Warm transfer to a human"],
            ["Meeting-mid-call booking", "Real-time objection tracking"],
            ["Timezone-aware compliance", "Multi-language agents"],
          ][i];
          return [
            B({ x: 80, y, text: label }),
            T({ x: 80, y: y + 60, w: 900, h: 60, text: items[0], font: "Inter", size: 38, weight: 700, color: "text" }),
            T({ x: 80, y: y + 118, w: 900, h: 60, text: items[1], font: "Inter", size: 38, weight: 700, color: "muted" }),
          ];
        })),
      ],
    }),
  },
  {
    id: "faq",
    name: "FAQ",
    tag: "FAQ",
    palette: "bone",
    thumb_bg: "#E8E9EB",
    thumb_accent: "#212025",
    build: () => ({
      bg: { type: "solid", color: "bg" },
      elements: [
        T({ x: 80, y: 100, w: 920, h: 90, text: "Is this too good to be true?",
            font: "Space Grotesk", size: 62, weight: 700, color: "text", line_height: 1.05 }),
        S({ x: 80, y: 280, w: 920, h: 2, fill: "muted", opacity: 0.3 }),
        T({ x: 80, y: 320, w: 920, h: 60, text: "“Does it actually improve reply rates?”",
            font: "Inter", size: 34, weight: 700, color: "accent" }),
        T({ x: 80, y: 390, w: 920, h: 140, text: "Teams see a 2–4× lift within the first two weeks — the score catches robotic phrasing before it ships.",
            font: "Inter", size: 28, weight: 400, color: "muted", line_height: 1.4 }),
        S({ x: 80, y: 580, w: 920, h: 2, fill: "muted", opacity: 0.3 }),
        T({ x: 80, y: 620, w: 920, h: 60, text: "“Do I need a data team to set it up?”",
            font: "Inter", size: 34, weight: 700, color: "accent" }),
        T({ x: 80, y: 690, w: 920, h: 140, text: "No — connect a mailbox and you're drafting inside ten minutes.",
            font: "Inter", size: 28, weight: 400, color: "muted", line_height: 1.4 }),
        S({ x: 80, y: 880, w: 920, h: 2, fill: "muted", opacity: 0.3 }),
        T({ x: 80, y: 920, w: 920, h: 60, text: "“What if my list is small?”",
            font: "Inter", size: 34, weight: 700, color: "accent" }),
        T({ x: 80, y: 990, w: 920, h: 140, text: "Quality beats volume here — a well-scored 50-send list often outperforms a cold 2,000.",
            font: "Inter", size: 28, weight: 400, color: "muted", line_height: 1.4 }),
      ],
    }),
  },
  {
    id: "bio-card",
    name: "Bio Card",
    tag: "Team",
    palette: "rose",
    thumb_bg: "#831843",
    thumb_accent: "#F9A8D4",
    build: () => ({
      bg: { type: "solid", color: "bg" },
      elements: [
        S({ x: 80, y: 120, w: 220, h: 220, fill: "accent", radius: 999, opacity: 0.3 }),
        T({ x: 80, y: 400, w: 920, h: 140, text: "Meet the founder", font: "Playfair Display", size: 72, weight: 700, italic: true, color: "text" }),
        T({ x: 80, y: 560, w: 920, h: 400, text: "Ten years building outbound systems for teams who were tired of guessing. Now doing it with agents instead of spreadsheets.",
            font: "Inter", size: 34, weight: 400, color: "muted", line_height: 1.4 }),
        B({ x: 80, y: 1040, text: "@founder · innoira.com" }),
      ],
    }),
  },
  {
    id: "product-showcase",
    name: "Product Showcase",
    tag: "Product",
    palette: "cyber",
    thumb_bg: "#030712",
    thumb_accent: "#34D399",
    build: () => ({
      bg: { type: "solid", color: "bg" },
      elements: [
        B({ x: 80, y: 96, text: "NOW LIVE" }),
        T({ x: 80, y: 220, w: 920, h: 260, text: "One suite.\nSix agents.",
            font: "Archivo Black", size: 128, weight: 900, color: "accent", line_height: 0.95 }),
        T({ x: 80, y: 560, w: 920, h: 140, text: "Outbound, calls, scheduling, proposals and social — sharing one CRM, one timeline.",
            font: "Inter", size: 32, weight: 400, color: "muted", line_height: 1.4 }),
        S({ x: 80, y: 780, w: 920, h: 320, fill: "muted", radius: 24, opacity: 0.08 }),
        I({ x: 130, y: 830, w: 80, name: "Zap", color: "accent", stroke: 2 }),
        T({ x: 130, y: 940, w: 820, h: 80, text: "Try it free — no card required", font: "Inter", size: 30, weight: 700, color: "text" }),
      ],
    }),
  },
  {
    id: "pricing-tiers",
    name: "Pricing Tiers",
    tag: "Pricing",
    palette: "mono",
    thumb_bg: "#FFFFFF",
    thumb_accent: "#000000",
    build: () => ({
      bg: { type: "solid", color: "bg" },
      elements: [
        T({ x: 80, y: 96, w: 920, h: 90, text: "Pick your plan", font: "Inter", size: 60, weight: 800, color: "text" }),
        ...(["Starter", "Growth", "Scale"].flatMap((name, i) => {
          const y = 260 + i * 320;
          const price = ["$79", "$249", "$749"][i];
          return [
            S({ x: 80, y, w: 920, h: 280, fill: i === 1 ? "accent" : "muted", radius: 24, opacity: i === 1 ? 1 : 0.08 }),
            T({ x: 120, y: y + 40, w: 400, h: 60, text: name, font: "Inter", size: 34, weight: 700, color: i === 1 ? "bg" : "text" }),
            T({ x: 120, y: y + 110, w: 400, h: 100, text: price, font: "Archivo Black", size: 72, weight: 900, color: i === 1 ? "bg" : "accent" }),
            I({ x: 800, y: y + 90, w: 60, name: "Check", color: i === 1 ? "bg" : "accent", stroke: 2 }),
          ];
        })),
      ],
    }),
  },
  {
    id: "case-study-metric",
    name: "Case Study Metric",
    tag: "Data",
    palette: "coral",
    thumb_bg: "#FEE2E2",
    thumb_accent: "#DC2626",
    build: () => ({
      bg: { type: "solid", color: "bg" },
      elements: [
        B({ x: 80, y: 96, text: "CASE STUDY" }),
        T({ x: 80, y: 220, w: 920, h: 80, text: "Northloop, 90 days in",
            font: "Inter", size: 46, weight: 700, color: "text" }),
        T({ x: 80, y: 360, w: 920, h: 480, text: "+184%",
            font: "Archivo Black", size: 320, weight: 900, color: "accent", line_height: 0.9 }),
        T({ x: 80, y: 900, w: 920, h: 60, text: "meetings booked, quarter over quarter",
            font: "Inter", size: 34, weight: 500, color: "muted" }),
      ],
    }),
  },
  {
    id: "myth-vs-fact",
    name: "Myth vs Fact",
    tag: "Framework",
    palette: "sunset",
    thumb_bg: "#FF6B4A",
    thumb_accent: "#0F172A",
    build: () => ({
      bg: { type: "solid", color: "bg" },
      elements: [
        T({ x: 80, y: 100, w: 920, h: 90, text: "Myth vs. reality", font: "Archivo Black", size: 68, weight: 900, color: "text" }),
        B({ x: 80, y: 280, text: "MYTH" }),
        T({ x: 80, y: 340, w: 920, h: 140, text: "“AI outreach always sounds robotic.”",
            font: "Inter", size: 38, weight: 700, color: "text", line_height: 1.25 }),
        B({ x: 80, y: 560, text: "FACT" }),
        T({ x: 80, y: 620, w: 920, h: 200, text: "Scored on empathy and clarity before it sends, most recipients can't tell — and reply rates prove it.",
            font: "Inter", size: 38, weight: 700, color: "accent", line_height: 1.3 }),
      ],
    }),
  },
  {
    id: "this-or-that",
    name: "This or That",
    tag: "Framework",
    palette: "ocean",
    thumb_bg: "#0A2540",
    thumb_accent: "#22D3EE",
    build: () => ({
      bg: { type: "solid", color: "bg" },
      elements: [
        T({ x: 80, y: 120, w: 920, h: 100, text: "Which one is you?",
            font: "Space Grotesk", size: 68, weight: 700, color: "text" }),
        S({ x: 80, y: 320, w: 430, h: 500, fill: "muted", radius: 24, opacity: 0.1 }),
        T({ x: 120, y: 360, w: 360, h: 200, text: "Sends 200 identical emails and hopes",
            font: "Inter", size: 34, weight: 600, color: "muted", line_height: 1.3 }),
        S({ x: 570, y: 320, w: 430, h: 500, fill: "accent", radius: 24 }),
        T({ x: 610, y: 360, w: 360, h: 200, text: "Sends 50 researched ones and books calls",
            font: "Inter", size: 34, weight: 700, color: "bg", line_height: 1.3 }),
        T({ x: 80, y: 880, w: 920, h: 60, text: "There's only one right answer.", font: "Inter", size: 28, weight: 500, color: "muted" }),
      ],
    }),
  },
  {
    id: "recap",
    name: "Weekly Recap",
    tag: "Announcement",
    palette: "forest",
    thumb_bg: "#14532D",
    thumb_accent: "#FCD34D",
    build: () => ({
      bg: { type: "solid", color: "bg" },
      elements: [
        B({ x: 80, y: 96, text: "WEEK 12 RECAP" }),
        T({ x: 80, y: 220, w: 920, h: 100, text: "Three things that worked",
            font: "Inter", size: 60, weight: 800, color: "text" }),
        ...(["Personalised subject lines (+22% opens)", "Follow-up on day 3, not day 1",
             "One clear ask, every time"].flatMap((t, i) => {
          const y = 400 + i * 200;
          return [
            I({ x: 80, y, w: 56, name: "Check", color: "accent", stroke: 2.5 }),
            T({ x: 160, y: y + 4, w: 840, h: 120, text: t, font: "Inter", size: 36, weight: 700, color: "text", line_height: 1.2 }),
          ];
        })),
      ],
    }),
  },
  {
    id: "announcement",
    name: "Announcement",
    tag: "Announcement",
    palette: "midnight",
    thumb_bg: "#0F1010",
    thumb_accent: "#E85D3A",
    build: () => ({
      bg: { type: "gradient", color: "bg", color2: "bg2", angle: 200 },
      elements: [
        B({ x: 80, y: 96, text: "JUST SHIPPED" }),
        T({ x: 80, y: 380, w: 920, h: 420, text: "Voice EQ now calls, qualifies, and books — in one conversation.",
            font: "Archivo Black", size: 100, weight: 900, color: "accent", line_height: 1 }),
        T({ x: 80, y: 900, w: 920, h: 100, text: "Live in your workspace today. No setup required.",
            font: "Inter", size: 32, weight: 400, color: "muted" }),
      ],
    }),
  },
  {
    id: "milestone-countdown",
    name: "Countdown",
    tag: "Announcement",
    palette: "rose",
    thumb_bg: "#831843",
    thumb_accent: "#F9A8D4",
    build: () => ({
      bg: { type: "solid", color: "bg" },
      elements: [
        T({ x: 80, y: 140, w: 920, h: 60, text: "DOORS CLOSE IN",
            font: "JetBrains Mono", size: 26, weight: 600, uppercase: true, letter_spacing: 0.2, color: "muted" }),
        T({ x: 80, y: 300, w: 920, h: 500, text: "3 DAYS",
            font: "Archivo Black", size: 260, weight: 900, color: "accent", line_height: 0.95 }),
        S({ x: 80, y: 900, w: 340, h: 84, fill: "accent", radius: 999 }),
        T({ x: 80, y: 924, w: 340, h: 40, text: "Save your seat", font: "Inter", size: 26, weight: 700, color: "bg", align: "center" }),
      ],
    }),
  },
  {
    id: "team-intro",
    name: "Team Intro",
    tag: "Team",
    palette: "paper",
    thumb_bg: "#F5F1E8",
    thumb_accent: "#B45309",
    build: () => ({
      bg: { type: "solid", color: "bg" },
      elements: [
        T({ x: 80, y: 100, w: 920, h: 90, text: "Who's behind this",
            font: "Playfair Display", size: 64, weight: 700, italic: true, color: "text" }),
        ...(["Dana Rowe — Product", "Sam Patel — Engineering", "Owen Bright — Sales"].flatMap((t, i) => {
          const y = 300 + i * 240;
          return [
            S({ x: 80, y, w: 140, h: 140, fill: "accent", radius: 999, opacity: 0.25 }),
            T({ x: 250, y: y + 40, w: 700, h: 60, text: t, font: "Inter", size: 38, weight: 700, color: "text" }),
          ];
        })),
      ],
    }),
  },
  {
    id: "problem-agitate",
    name: "Problem / Agitate",
    tag: "Framework",
    palette: "coral",
    thumb_bg: "#FEE2E2",
    thumb_accent: "#DC2626",
    build: () => ({
      bg: { type: "solid", color: "bg" },
      elements: [
        I({ x: 80, y: 100, w: 72, name: "Flame", color: "accent", stroke: 2 }),
        T({ x: 80, y: 220, w: 920, h: 260, text: "Your pipeline isn't thin. Your outbound is invisible.",
            font: "Archivo Black", size: 88, weight: 900, color: "text", line_height: 1.02 }),
        T({ x: 80, y: 560, w: 920, h: 300, text: "Same template, every prospect, every time. They can tell. That's why open rates fall and nobody replies — not because the offer is bad.",
            font: "Inter", size: 34, weight: 400, color: "muted", line_height: 1.4 }),
      ],
    }),
  },
  {
    id: "checklist-2col",
    name: "Do / Don't",
    tag: "Framework",
    palette: "bone",
    thumb_bg: "#E8E9EB",
    thumb_accent: "#212025",
    build: () => ({
      bg: { type: "solid", color: "bg" },
      elements: [
        T({ x: 80, y: 96, w: 920, h: 90, text: "Cold email: do / don't",
            font: "Space Grotesk", size: 58, weight: 700, color: "text" }),
        I({ x: 80, y: 260, w: 48, name: "Check", color: "accent", stroke: 2.5 }),
        T({ x: 150, y: 264, w: 850, h: 60, text: "One specific reason you're reaching out", font: "Inter", size: 32, weight: 600, color: "text" }),
        I({ x: 80, y: 360, w: 48, name: "Check", color: "accent", stroke: 2.5 }),
        T({ x: 150, y: 364, w: 850, h: 60, text: "A question they can answer in one line", font: "Inter", size: 32, weight: 600, color: "text" }),
        I({ x: 80, y: 460, w: 48, name: "Check", color: "accent", stroke: 2.5 }),
        T({ x: 150, y: 464, w: 850, h: 60, text: "Proof that's relevant to their situation", font: "Inter", size: 32, weight: 600, color: "text" }),
        I({ x: 80, y: 620, w: 48, name: "X", color: "muted", stroke: 2.5 }),
        T({ x: 150, y: 624, w: 850, h: 60, text: "“Hope you're doing well”", font: "Inter", size: 32, weight: 500, color: "muted" }),
        I({ x: 80, y: 720, w: 48, name: "X", color: "muted", stroke: 2.5 }),
        T({ x: 150, y: 724, w: 850, h: 60, text: "Attaching a deck before they've replied once", font: "Inter", size: 32, weight: 500, color: "muted" }),
        I({ x: 80, y: 820, w: 48, name: "X", color: "muted", stroke: 2.5 }),
        T({ x: 150, y: 824, w: 850, h: 60, text: "Three asks in one email", font: "Inter", size: 32, weight: 500, color: "muted" }),
      ],
    }),
  },
  {
    id: "quote-carousel-2",
    name: "Two Quotes",
    tag: "Testimonial",
    palette: "mono",
    thumb_bg: "#FFFFFF",
    thumb_accent: "#000000",
    build: () => ({
      bg: { type: "solid", color: "bg" },
      elements: [
        I({ x: 80, y: 100, w: 56, name: "Quote", color: "accent", stroke: 2 }),
        T({ x: 80, y: 190, w: 920, h: 260, text: "“The research alone would've taken my team a full day per lead.”",
            font: "Instrument Serif", size: 48, weight: 500, italic: true, color: "text", line_height: 1.2 }),
        T({ x: 80, y: 470, w: 900, h: 40, text: "— Nina Kaur, Head of Marketing", font: "Inter", size: 22, weight: 600, color: "muted" }),
        S({ x: 80, y: 580, w: 920, h: 2, fill: "muted", opacity: 0.3 }),
        I({ x: 80, y: 640, w: 56, name: "Quote", color: "accent", stroke: 2 }),
        T({ x: 80, y: 730, w: 920, h: 260, text: "“We finally know which draft to send before we send it.”",
            font: "Instrument Serif", size: 48, weight: 500, italic: true, color: "text", line_height: 1.2 }),
        T({ x: 80, y: 1010, w: 900, h: 40, text: "— Theo Marchetti, CTO", font: "Inter", size: 22, weight: 600, color: "muted" }),
      ],
    }),
  },
  {
    id: "before-numbers",
    name: "Before / After Numbers",
    tag: "Data",
    palette: "cyber",
    thumb_bg: "#030712",
    thumb_accent: "#34D399",
    build: () => ({
      bg: { type: "solid", color: "bg" },
      elements: [
        T({ x: 80, y: 100, w: 920, h: 90, text: "One quarter, one change",
            font: "Inter", size: 54, weight: 800, color: "text" }),
        T({ x: 80, y: 260, w: 440, h: 60, text: "BEFORE", font: "JetBrains Mono", size: 24, weight: 600, uppercase: true, letter_spacing: 0.2, color: "muted" }),
        T({ x: 80, y: 320, w: 440, h: 200, text: "3%", font: "Archivo Black", size: 160, weight: 900, color: "muted", line_height: 0.9 }),
        T({ x: 560, y: 260, w: 440, h: 60, text: "AFTER", font: "JetBrains Mono", size: 24, weight: 600, uppercase: true, letter_spacing: 0.2, color: "accent" }),
        T({ x: 560, y: 320, w: 440, h: 200, text: "12%", font: "Archivo Black", size: 160, weight: 900, color: "accent", line_height: 0.9 }),
        S({ x: 80, y: 620, w: 920, h: 2, fill: "muted", opacity: 0.3 }),
        T({ x: 80, y: 660, w: 920, h: 200, text: "reply rate, after switching to EQ-scored, research-backed outreach.",
            font: "Inter", size: 32, weight: 400, color: "muted", line_height: 1.4 }),
      ],
    }),
  },
  {
    id: "hot-take",
    name: "Hot Take",
    tag: "Editorial",
    palette: "sunset",
    thumb_bg: "#FF6B4A",
    thumb_accent: "#0F172A",
    build: () => ({
      bg: { type: "gradient", color: "bg", color2: "bg2", angle: 130 },
      elements: [
        B({ x: 80, y: 96, text: "UNPOPULAR OPINION" }),
        T({ x: 80, y: 300, w: 920, h: 500, text: "Personalisation isn't a merge field. It's proof you actually looked.",
            font: "Archivo Black", size: 96, weight: 900, color: "text", line_height: 1 }),
      ],
    }),
  },
  {
    id: "step-numbered-5",
    name: "5-Step Framework",
    tag: "Framework",
    palette: "ocean",
    thumb_bg: "#0A2540",
    thumb_accent: "#22D3EE",
    build: () => ({
      bg: { type: "solid", color: "bg" },
      elements: [
        T({ x: 80, y: 96, w: 920, h: 90, text: "The 5-step send checklist",
            font: "Space Grotesk", size: 56, weight: 700, color: "text" }),
        ...(["Research the trigger", "Pick one angle", "Write under 120 words",
             "Score for empathy & spam risk", "One ask, one CTA"].flatMap((t, i) => {
          const y = 250 + i * 165;
          return [
            T({ x: 80, y, w: 90, h: 90, text: String(i + 1).padStart(2, "0"),
                font: "JetBrains Mono", size: 40, weight: 700, color: "accent" }),
            T({ x: 200, y: y + 12, w: 800, h: 60, text: t, font: "Inter", size: 38, weight: 700, color: "text" }),
          ];
        })),
      ],
    }),
  },
  {
    id: "big-outcome",
    name: "Big Outcome",
    tag: "Cover",
    palette: "forest",
    thumb_bg: "#14532D",
    thumb_accent: "#FCD34D",
    build: () => ({
      bg: { type: "solid", color: "bg" },
      elements: [
        T({ x: 80, y: 260, w: 920, h: 500, text: "From cold list\nto booked calendar.",
            font: "DM Serif Display", size: 128, weight: 700, italic: true, color: "text", line_height: 1 }),
        T({ x: 80, y: 840, w: 920, h: 140, text: "One agent, start to finish — sourcing, research, drafting, sending, and follow-up.",
            font: "Inter", size: 32, weight: 400, color: "muted", line_height: 1.4 }),
      ],
    }),
  },
  {
    id: "poll-either",
    name: "Poll: Either/Or",
    tag: "Framework",
    palette: "coral",
    thumb_bg: "#FEE2E2",
    thumb_accent: "#DC2626",
    build: () => ({
      bg: { type: "solid", color: "bg" },
      elements: [
        T({ x: 80, y: 140, w: 920, h: 160, text: "Which mistake costs you more?",
            font: "Inter", size: 60, weight: 800, color: "text", line_height: 1.1 }),
        S({ x: 80, y: 400, w: 920, h: 180, fill: "accent", radius: 24 }),
        T({ x: 120, y: 460, w: 840, h: 60, text: "A. Sending too generic", font: "Inter", size: 38, weight: 700, color: "bg" }),
        S({ x: 80, y: 620, w: 920, h: 180, fill: "muted", radius: 24, opacity: 0.15 }),
        T({ x: 120, y: 680, w: 840, h: 60, text: "B. Not following up at all", font: "Inter", size: 38, weight: 700, color: "text" }),
        T({ x: 80, y: 860, w: 920, h: 60, text: "Vote below — we'll share the data next week.", font: "Inter", size: 26, weight: 400, color: "muted" }),
      ],
    }),
  },
  {
    id: "resource-list",
    name: "Resource List",
    tag: "Framework",
    palette: "paper",
    thumb_bg: "#F5F1E8",
    thumb_accent: "#B45309",
    build: () => ({
      bg: { type: "solid", color: "bg" },
      elements: [
        T({ x: 80, y: 100, w: 920, h: 90, text: "Bookmark these",
            font: "Playfair Display", size: 64, weight: 700, italic: true, color: "text" }),
        ...(["The EQ Score rubric", "Subject line swipe file", "Follow-up cadence template", "Objection-handling scripts"]
          .flatMap((t, i) => {
            const y = 280 + i * 190;
            return [
              I({ x: 80, y, w: 44, name: "ArrowUpRight", color: "accent", stroke: 2.5 }),
              T({ x: 150, y: y + 2, w: 850, h: 60, text: t, font: "Inter", size: 36, weight: 600, color: "text" }),
            ];
          })),
      ],
    }),
  },
  {
    id: "single-cta-minimal",
    name: "Minimal CTA",
    tag: "Cover",
    palette: "mono",
    thumb_bg: "#FFFFFF",
    thumb_accent: "#000000",
    build: () => ({
      bg: { type: "solid", color: "bg" },
      elements: [
        T({ x: 80, y: 500, w: 920, h: 300, text: "Worth 15 minutes?",
            font: "Archivo Black", size: 140, weight: 900, color: "text", line_height: 0.95, align: "center" }),
        S({ x: 380, y: 880, w: 320, h: 84, fill: "accent", radius: 999 }),
        T({ x: 380, y: 904, w: 320, h: 40, text: "Book a call", font: "Inter", size: 26, weight: 700, color: "bg", align: "center" }),
      ],
    }),
  },
  {
    id: "day-in-life",
    name: "Day in the Life",
    tag: "Editorial",
    palette: "rose",
    thumb_bg: "#831843",
    thumb_accent: "#F9A8D4",
    build: () => ({
      bg: { type: "solid", color: "bg" },
      elements: [
        T({ x: 80, y: 100, w: 920, h: 90, text: "A rep's morning, automated",
            font: "Space Grotesk", size: 58, weight: 700, color: "text" }),
        ...([["9:00", "Agent sourced 40 verified leads overnight"], ["9:15", "Research packs ready, no manual digging"],
             ["9:30", "First 12 drafts scored and queued"], ["9:45", "Rep is on the phone, not in a spreadsheet"]]
          .flatMap((row, i) => {
            const y = 280 + i * 200;
            return [
              T({ x: 80, y, w: 140, h: 60, text: row[0], font: "JetBrains Mono", size: 30, weight: 600, color: "accent" }),
              T({ x: 240, y: y - 4, w: 760, h: 100, text: row[1], font: "Inter", size: 32, weight: 500, color: "text", line_height: 1.3 }),
            ];
          })),
      ],
    }),
  },
  {
    id: "feature-grid-4",
    name: "Feature Grid",
    tag: "Product",
    palette: "cyber",
    thumb_bg: "#030712",
    thumb_accent: "#34D399",
    build: () => ({
      bg: { type: "solid", color: "bg" },
      elements: [
        T({ x: 80, y: 96, w: 920, h: 90, text: "Everything included",
            font: "Inter", size: 56, weight: 800, color: "text" }),
        ...([["Zap", "Instant drafts"], ["ShieldCheck", "Spam-safe scoring"], ["Users", "Shared CRM"], ["TrendingUp", "Live analytics"]]
          .flatMap(([icon, label], i) => {
            const x = 80 + (i % 2) * 480;
            const y = 260 + Math.floor(i / 2) * 340;
            return [
              S({ x, y, w: 420, h: 280, fill: "muted", radius: 24, opacity: 0.08 }),
              I({ x: x + 40, y: y + 40, w: 56, name: icon, color: "accent", stroke: 2 }),
              T({ x: x + 40, y: y + 180, w: 340, h: 60, text: label, font: "Inter", size: 30, weight: 700, color: "text" }),
            ];
          })),
      ],
    }),
  },
];

/** Resolve a semantic color name ('bg' | 'accent' | ...) against a palette hex.
 * Elements store color keys; renderer swaps them to hex per project palette. */
export function resolveColor(name, palette) {
  return palette?.[name] || name || "#000";
}

/** Build an initial project slide (blank canvas). */
export function blankSlide(palette) {
  return {
    _k: uid(),
    bg: { type: "solid", color: "bg" },
    elements: [],
  };
}

/** Given a template descriptor, materialise a slide + its intended palette id. */
export function slideFromTemplate(tpl) {
  return { _k: uid(), ...tpl.build() };
}
