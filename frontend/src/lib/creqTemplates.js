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
