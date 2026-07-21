// Slide Styles + Layout Patterns for Create EQ
// Each style is a content-preserving transform: text content, image src, element positions unchanged.

const uid = () => Math.random().toString(36).slice(2, 10);

function cloneSlide(slide) {
  return {
    _k: uid(),
    bg: JSON.parse(JSON.stringify(slide.bg || { type: "solid", color: "bg" })),
    elements: slide.elements.map((e) => JSON.parse(JSON.stringify(e))),
  };
}

// ── Style definitions ──────────────────────────────────────────────────

export const STYLES = [
  {
    id: "minimal",
    name: "Minimal",
    desc: "Clean, lots of whitespace, thin fonts",
    apply(slide) {
      const s = cloneSlide(slide);
      s.bg = { type: "solid", color: "bg" };
      for (const el of s.elements) {
        if (el.type === "text") {
          el.font = "Inter";
          el.size = Math.min(el.size, 80);
          el.weight = 400;
          el.italic = false;
          el.uppercase = false;
          el.letter_spacing = 0;
          el.line_height = 1.3;
          el.color = "text";
          el.shadow = undefined;
          el.highlight = undefined;
        }
        if (el.type === "shape") {
          el.fill = el.fill === "accent" ? "accent" : "muted";
          el.opacity = 0.12;
          el.radius = 0;
        }
      }
      return s;
    },
  },
  {
    id: "editorial",
    name: "Editorial",
    desc: "Serif headings, magazine-style",
    apply(slide) {
      const s = cloneSlide(slide);
      s.bg = { type: "solid", color: "bg" };
      for (const el of s.elements) {
        if (el.type === "text") {
          if (el.size >= 48) {
            el.font = "Playfair Display";
            el.weight = 700;
            el.italic = true;
          } else {
            el.font = "Inter";
            el.weight = 400;
          }
          el.color = el.color === "muted" || el.color === "accent" ? "text" : el.color;
          el.letter_spacing = -0.01;
          el.line_height = 1.15;
        }
        if (el.type === "shape" && el.fill === "accent") {
          el.fill = "text";
          el.opacity = 0.06;
          el.radius = 0;
        }
      }
      return s;
    },
  },
  {
    id: "bold-poster",
    name: "Bold Poster",
    desc: "Large bold text, high contrast",
    apply(slide) {
      const s = cloneSlide(slide);
      s.bg = { type: "solid", color: "bg" };
      for (const el of s.elements) {
        if (el.type === "text") {
          el.font = "Archivo Black";
          el.weight = 900;
          el.uppercase = true;
          el.letter_spacing = 0.02;
          el.line_height = 0.95;
          el.color = "accent";
        }
        if (el.type === "shape") {
          el.fill = "accent";
          el.opacity = 1;
          el.radius = 0;
        }
        if (el.type === "badge") {
          el.bg = "accent";
          el.color = "bg";
        }
      }
      return s;
    },
  },
  {
    id: "gradient",
    name: "Gradient",
    desc: "Gradient backgrounds, gradient text accents",
    apply(slide, palette) {
      const s = cloneSlide(slide);
      s.bg = {
        type: "gradient",
        color: palette?.bg2 || "#1F2937",
        color2: palette?.bg || "#0F1010",
        angle: 145,
      };
      for (const el of s.elements) {
        if (el.type === "text" && el.size >= 48) {
          el.color = "accent";
          el.letter_spacing = -0.02;
        } else if (el.type === "text") {
          el.color = "text";
        }
        if (el.type === "shape") {
          el.fill = "accent";
          el.opacity = 0.2;
          el.radius = 12;
        }
      }
      return s;
    },
  },
  {
    id: "outline",
    name: "Outline",
    desc: "Outlined/bordered elements, no fills",
    apply(slide) {
      const s = cloneSlide(slide);
      s.bg = { type: "solid", color: "bg" };
      for (const el of s.elements) {
        if (el.type === "text") {
          el.font = "JetBrains Mono";
          el.weight = 500;
          el.letter_spacing = 0.04;
          el.line_height = 1.2;
          el.color = "text";
        }
        if (el.type === "shape") {
          el.fill = el.fill === "accent" ? "muted" : "muted";
          el.opacity = 0.05;
          el.radius = 4;
          el.stroke_w = 2;
          el.stroke_color = "accent";
        }
      }
      return s;
    },
  },
  {
    id: "mono",
    name: "Mono",
    desc: "Monospace everywhere, technical feel",
    apply(slide) {
      const s = cloneSlide(slide);
      s.bg = { type: "solid", color: "bg" };
      for (const el of s.elements) {
        if (el.type === "text") {
          el.font = "JetBrains Mono";
          el.weight = 500;
          el.uppercase = el.size >= 48;
          el.letter_spacing = 0.06;
          el.line_height = 1.1;
          el.color = "text";
        }
        if (el.type === "shape") {
          el.fill = "accent";
          el.opacity = 0.1;
          el.radius = 2;
        }
      }
      return s;
    },
  },
  {
    id: "soft",
    name: "Soft",
    desc: "Rounded corners, pastels, friendly",
    apply(slide) {
      const s = cloneSlide(slide);
      s.bg = { type: "solid", color: "bg" };
      for (const el of s.elements) {
        if (el.type === "text") {
          el.font = "Manrope";
          el.weight = el.size >= 48 ? 800 : 600;
          el.letter_spacing = -0.02;
          el.line_height = 1.2;
          el.color = "text";
        }
        if (el.type === "shape") {
          el.fill = "accent";
          el.opacity = 0.15;
          el.radius = 24;
        }
        if (el.type === "badge") {
          el.radius = 12;
          el.size = 22;
        }
      }
      return s;
    },
  },
  {
    id: "noir",
    name: "Noir",
    desc: "Dark backgrounds, white text, dramatic",
    apply(slide, palette) {
      const s = cloneSlide(slide);
      s.bg = { type: "solid", color: "#0F1010" };
      for (const el of s.elements) {
        if (el.type === "text") {
          el.color = "#FAFAFA";
          el.font = el.size >= 48 ? "Archivo Black" : "Inter";
          el.weight = el.size >= 48 ? 900 : 500;
          el.letter_spacing = el.size >= 48 ? -0.02 : 0;
          el.line_height = 1.0;
        }
        if (el.type === "shape") {
          el.fill = "#FAFAFA";
          el.opacity = 0.08;
          el.radius = 0;
        }
        if (el.type === "badge") {
          el.bg = "#FAFAFA";
          el.color = "#0F1010";
        }
        if (el.type === "icon") {
          el.color = "#FAFAFA";
        }
      }
      return s;
    },
  },
  {
    id: "swiss",
    name: "Swiss",
    desc: "Grid-aligned, structured, precise",
    apply(slide) {
      const s = cloneSlide(slide);
      s.bg = { type: "solid", color: "bg" };
      for (const el of s.elements) {
        if (el.type === "text") {
          el.font = "Inter";
          el.weight = el.size >= 48 ? 700 : 500;
          el.letter_spacing = -0.02;
          el.line_height = 1.1;
          el.color = "text";
          el.align = "left";
        }
        if (el.type === "shape") {
          el.fill = "accent";
          el.opacity = 0.12;
          el.radius = 0;
        }
      }
      return s;
    },
  },
  {
    id: "corporate",
    name: "Corporate",
    desc: "Professional, neutral, trustworthy",
    apply(slide) {
      const s = cloneSlide(slide);
      s.bg = { type: "solid", color: "bg" };
      for (const el of s.elements) {
        if (el.type === "text") {
          el.font = "Inter";
          el.weight = el.size >= 64 ? 700 : 500;
          el.letter_spacing = -0.01;
          el.line_height = 1.15;
          el.color = "text";
          el.align = "left";
          el.uppercase = false;
        }
        if (el.type === "shape") {
          el.fill = el.fill === "accent" ? "accent" : "muted";
          el.opacity = 0.08;
          el.radius = 4;
        }
        if (el.type === "badge") {
          el.bg = "accent";
          el.color = "bg";
          el.radius = 4;
        }
      }
      return s;
    },
  },
  {
    id: "luxury",
    name: "Luxury",
    desc: "Dark, gold accents, refined",
    apply(slide, palette) {
      const s = cloneSlide(slide);
      s.bg = { type: "solid", color: palette?.bg || "#0F1010" };
      for (const el of s.elements) {
        if (el.type === "text") {
          el.font = el.size >= 48 ? "Playfair Display" : "Inter";
          el.weight = el.size >= 48 ? 700 : 400;
          el.italic = el.size >= 48;
          el.letter_spacing = el.size >= 48 ? -0.02 : 0.04;
          el.line_height = 1.1;
          el.color = el.size >= 48 ? "text" : "muted";
          el.uppercase = false;
        }
        if (el.type === "shape") {
          el.fill = "accent";
          el.opacity = 0.1;
          el.radius = 0;
        }
        if (el.type === "badge") {
          el.bg = "accent";
          el.color = "bg";
          el.radius = 0;
          el.size = 18;
        }
      }
      return s;
    },
  },
  {
    id: "editorial-serif",
    name: "Editorial",
    desc: "Serif headlines, magazine, elegant",
    apply(slide) {
      const s = cloneSlide(slide);
      s.bg = { type: "solid", color: "bg" };
      for (const el of s.elements) {
        if (el.type === "text") {
          if (el.size >= 56) {
            el.font = "DM Serif Display";
            el.weight = 700;
            el.italic = false;
          } else {
            el.font = "Inter";
            el.weight = 400;
          }
          el.letter_spacing = -0.01;
          el.line_height = 1.08;
          el.color = "text";
          el.uppercase = false;
        }
        if (el.type === "shape") {
          el.fill = el.fill === "accent" ? "accent" : "muted";
          el.opacity = 0.06;
          el.radius = 0;
        }
      }
      return s;
    },
  },
  {
    id: "cyberpunk",
    name: "Cyberpunk",
    desc: "Neon, dark, high energy",
    apply(slide, palette) {
      const s = cloneSlide(slide);
      s.bg = { type: "solid", color: palette?.bg2 || "#030712" };
      for (const el of s.elements) {
        if (el.type === "text") {
          el.font = "Space Grotesk";
          el.weight = el.size >= 48 ? 700 : 500;
          el.letter_spacing = el.size >= 48 ? -0.03 : 0.02;
          el.line_height = 0.95;
          el.color = el.size >= 100 ? "accent" : "text";
          el.uppercase = el.size < 32;
        }
        if (el.type === "shape") {
          el.fill = "accent";
          el.opacity = 0.15;
          el.radius = 0;
        }
        if (el.type === "badge") {
          el.bg = "accent";
          el.color = "bg";
          el.radius = 4;
          el.size = 18;
        }
      }
      return s;
    },
  },
  {
    id: "brutalist",
    name: "Brutalist",
    desc: "Bold, raw, heavy contrast",
    apply(slide) {
      const s = cloneSlide(slide);
      s.bg = { type: "solid", color: "bg" };
      for (const el of s.elements) {
        if (el.type === "text") {
          el.font = "Archivo Black";
          el.weight = 900;
          el.letter_spacing = 0;
          el.line_height = 0.9;
          el.color = "accent";
          el.uppercase = true;
        }
        if (el.type === "shape") {
          el.fill = "accent";
          el.opacity = 0.2;
          el.radius = 0;
        }
        if (el.type === "badge") {
          el.bg = "accent";
          el.color = "bg";
          el.radius = 0;
        }
      }
      return s;
    },
  },
  {
    id: "glassmorphism",
    name: "Glass",
    desc: "Frosted glass overlay feel",
    apply(slide, palette) {
      const s = cloneSlide(slide);
      s.bg = { type: "solid", color: palette?.bg || "#E8E9EB" };
      for (const el of s.elements) {
        if (el.type === "text") {
          el.font = "Inter";
          el.weight = el.size >= 48 ? 700 : 500;
          el.letter_spacing = -0.01;
          el.line_height = 1.15;
          el.color = "text";
        }
        if (el.type === "shape") {
          el.fill = el.fill === "accent" ? "accent" : "bg";
          el.opacity = 0.5;
          el.radius = 24;
          el.shadow = true;
          el.shadow_blur = 32;
          el.shadow_color = "rgba(0,0,0,0.1)";
        }
        if (el.type === "badge") {
          el.bg = "accent";
          el.color = "bg";
          el.radius = 12;
        }
      }
      return s;
    },
  },
  {
    id: "neumorphism",
    name: "Neumorphism",
    desc: "Soft emboss, subtle depth",
    apply(slide, palette) {
      const s = cloneSlide(slide);
      s.bg = { type: "solid", color: palette?.bg || "#E8E9EB" };
      for (const el of s.elements) {
        if (el.type === "text") {
          el.font = "Inter";
          el.weight = el.size >= 48 ? 600 : 400;
          el.letter_spacing = 0;
          el.line_height = 1.2;
          el.color = "text";
        }
        if (el.type === "shape") {
          el.fill = "bg";
          el.opacity = 1;
          el.radius = 24;
          el.shadow = true;
          el.shadow_x = 8;
          el.shadow_y = 8;
          el.shadow_blur = 24;
          el.shadow_color = "rgba(0,0,0,0.08)";
        }
      }
      return s;
    },
  },
  {
    id: "bauhaus",
    name: "Bauhaus",
    desc: "Primary shapes, bold geometry",
    apply(slide) {
      const s = cloneSlide(slide);
      s.bg = { type: "solid", color: "bg" };
      for (const el of s.elements) {
        if (el.type === "text") {
          el.font = "Archivo Black";
          el.weight = 900;
          el.uppercase = true;
          el.letter_spacing = 0.06;
          el.line_height = 0.9;
          el.color = "accent";
        }
        if (el.type === "shape") {
          el.fill = el.fill === "accent" ? "accent" : "bg";
          el.opacity = 1;
          el.radius = 0;
        }
        if (el.type === "badge") {
          el.bg = "accent";
          el.color = "bg";
          el.radius = 0;
        }
      }
      return s;
    },
  },
  {
    id: "y2k",
    name: "Y2K",
    desc: "Playful, early 2000s nostalgia",
    apply(slide) {
      const s = cloneSlide(slide);
      s.bg = { type: "solid", color: "bg" };
      for (const el of s.elements) {
        if (el.type === "text") {
          el.font = "Space Grotesk";
          el.weight = el.size >= 48 ? 800 : 600;
          el.letter_spacing = 0.02;
          el.line_height = 1.0;
          el.color = el.size >= 80 ? "accent" : "text";
          el.uppercase = true;
        }
        if (el.type === "shape") {
          el.fill = "accent";
          el.opacity = 0.15;
          el.radius = 999;
        }
        if (el.type === "badge") {
          el.bg = "accent";
          el.color = "bg";
          el.radius = 999;
        }
      }
      return s;
    },
  },
  {
    id: "dark-premium",
    name: "Dark Premium",
    desc: "Near-black, subtle texture, refined",
    apply(slide, palette) {
      const s = cloneSlide(slide);
      s.bg = { type: "noise", base_color: "bg", opacity: 0.06 };
      for (const el of s.elements) {
        if (el.type === "text") {
          el.font = el.size >= 48 ? "Archivo Black" : "Inter";
          el.weight = el.size >= 48 ? 900 : 500;
          el.letter_spacing = el.size >= 48 ? -0.02 : 0;
          el.line_height = 1.0;
          el.color = "text";
        }
        if (el.type === "shape") {
          el.fill = "muted";
          el.opacity = 0.06;
          el.radius = 4;
        }
        if (el.type === "badge") {
          el.bg = "accent";
          el.color = "bg";
          el.radius = 4;
        }
      }
      return s;
    },
  },
  {
    id: "saas",
    name: "SaaS",
    desc: "Clean, modern, UI-inspired",
    apply(slide) {
      const s = cloneSlide(slide);
      s.bg = { type: "solid", color: "bg" };
      for (const el of s.elements) {
        if (el.type === "text") {
          el.font = "Inter";
          el.weight = el.size >= 48 ? 700 : 500;
          el.letter_spacing = -0.01;
          el.line_height = 1.15;
          el.color = "text";
          el.align = "left";
        }
        if (el.type === "shape") {
          el.fill = "accent";
          el.opacity = 0.1;
          el.radius = 12;
        }
        if (el.type === "badge") {
          el.bg = "accent";
          el.color = "bg";
          el.radius = 6;
          el.size = 18;
        }
      }
      return s;
    },
  },
  {
    id: "memphis",
    name: "Memphis",
    desc: "Playful dots, squiggles, bold colors",
    apply(slide) {
      const s = cloneSlide(slide);
      s.bg = { type: "dots", color: "accent", spacing: 40, radius: 3, opacity: 0.1 };
      for (const el of s.elements) {
        if (el.type === "text") {
          el.font = "Space Grotesk";
          el.weight = 800;
          el.letter_spacing = 0;
          el.line_height = 1.0;
          el.color = "accent";
          el.uppercase = el.size >= 48;
        }
        if (el.type === "shape") {
          el.fill = "accent";
          el.opacity = 0.2;
          el.radius = 0;
        }
      }
      return s;
    },
  },
  {
    id: "hero-number",
    name: "Hero Number",
    desc: "Oversized number, bold headline",
    apply(slide) {
      const s = cloneSlide(slide);
      s.bg = { type: "solid", color: "bg" };
      for (const el of s.elements) {
        if (el.type === "text") {
          if (el.size >= 64) {
            el.font = "Bebas Neue";
            el.weight = 400;
            el.size = Math.min(el.size * 1.4, 360);
            el.letter_spacing = 0.04;
            el.color = "accent";
          } else {
            el.font = "Inter";
            el.weight = 500;
            el.color = "muted";
          }
          el.line_height = 0.9;
        }
        if (el.type === "shape") {
          el.fill = "accent";
          el.opacity = 0.08;
          el.radius = 4;
        }
      }
      return s;
    },
  },
];

function pickHeadline(elements) {
  let best = null;
  for (const el of elements) {
    if (el.type === "text" && (!best || el.size > best.size)) best = el;
  }
  return best;
}

function pickBodyTexts(elements) {
  return elements.filter((e) => e.type === "text" && (!e.role || e.role !== "logo"));
}

function pickImage(elements) {
  return elements.find((e) => e.type === "image" && e.role !== "logo");
}

function pickLogo(elements) {
  return elements.find((e) => e.type === "image" && e.role === "logo");
}

const CANVAS_W = 1080;
const CANVAS_H = 1350;

export const LAYOUTS = [
  {
    id: "big-number",
    name: "Big Number",
    desc: "One large number as visual anchor",
    apply(slide) {
      const s = cloneSlide(slide);
      const headline = pickHeadline(s.elements);
      const bodyTexts = pickBodyTexts(s.elements).filter((e) => e !== headline);
      const img = pickImage(s.elements);
      const logo = pickLogo(s.elements);

      s.elements = [];
      if (logo) s.elements.push({ ...logo, x: 80, y: CANVAS_H - 120, w: 120, h: 60 });

      if (headline) {
        s.elements.push({
          ...headline, x: 80, y: 120, w: 920, h: 160,
          size: 56, weight: 700, color: "muted", align: "left", uppercase: true,
          letter_spacing: 0.16,
        });
      }
      if (bodyTexts.length > 0) {
        const num = bodyTexts[0];
        s.elements.push({
          ...num, x: 80, y: 340, w: 920, h: 500,
          size: 320, weight: 900, color: "accent", align: "center", line_height: 0.9,
        });
      }
      if (bodyTexts.length > 1) {
        const desc = bodyTexts[1];
        s.elements.push({
          ...desc, x: 80, y: 900, w: 920, h: 200,
          size: 36, weight: 400, color: "text", align: "center", line_height: 1.3,
        });
      }
      return s;
    },
  },
  {
    id: "quote",
    name: "Quote",
    desc: "Large quote with attribution",
    apply(slide) {
      const s = cloneSlide(slide);
      const bodyTexts = pickBodyTexts(s.elements);
      const img = pickImage(s.elements);
      const logo = pickLogo(s.elements);

      s.elements = [];
      if (logo) s.elements.push({ ...logo, x: 80, y: CANVAS_H - 120, w: 120, h: 60 });

      const quoteText = bodyTexts.find((t) => t.text.length > 40) || bodyTexts[0] || { id: uid(), type: "text", text: "Quote here" };
      const attribution = bodyTexts.find((t) => t !== quoteText) || null;

      s.elements.push({
        id: uid(), type: "icon", x: 80, y: 160, w: 72, name: "Quote", color: "accent", stroke: 2,
      });
      s.elements.push({
        ...quoteText, x: 80, y: 280, w: 920, h: 600,
        size: 72, weight: 500, italic: true, color: "text",
        font: "Instrument Serif", line_height: 1.1, align: "left",
      });
      if (attribution) {
        s.elements.push({
          ...attribution, x: 80, y: 1000, w: 920, h: 60,
          size: 26, weight: 600, color: "muted", align: "left",
        });
      }
      if (img) s.elements.push({ ...img, x: 80, y: 1120, w: 140, h: 140, radius: 999, fit: "cover" });
      return s;
    },
  },
  {
    id: "checklist",
    name: "Checklist",
    desc: "Bulleted list with check icons",
    apply(slide) {
      const s = cloneSlide(slide);
      const headline = pickHeadline(s.elements);
      const bodyTexts = pickBodyTexts(s.elements).filter((e) => e !== headline);
      const logo = pickLogo(s.elements);

      s.elements = [];
      if (logo) s.elements.push({ ...logo, x: 80, y: CANVAS_H - 120, w: 120, h: 60 });
      if (headline) {
        s.elements.push({
          ...headline, x: 80, y: 100, w: 920, h: 120,
          size: 60, weight: 800, color: "text", line_height: 1,
        });
      }
      bodyTexts.forEach((t, i) => {
        const y = 300 + i * 140;
        s.elements.push({
          id: uid(), type: "shape", x: 80, y, w: 48, h: 48, fill: "accent", radius: 10,
        });
        s.elements.push({
          id: uid(), type: "text", x: 88, y: y + 6, w: 48, h: 36,
          text: "✓", font: "Inter", size: 28, weight: 800, color: "bg", align: "center",
        });
        s.elements.push({ ...t, x: 160, y: y + 6, w: 840, h: 42, size: 30, weight: 600, color: "text", align: "left" });
      });
      return s;
    },
  },
  {
    id: "image-left",
    name: "Image Left",
    desc: "Image on left, text on right",
    apply(slide) {
      const s = cloneSlide(slide);
      const headline = pickHeadline(s.elements);
      const bodyTexts = pickBodyTexts(s.elements).filter((e) => e !== headline);
      const img = pickImage(s.elements);
      const logo = pickLogo(s.elements);

      s.elements = [];
      if (logo) s.elements.push({ ...logo, x: 80, y: CANVAS_H - 120, w: 120, h: 60 });

      if (img) {
        s.elements.push({ ...img, x: 60, y: 80, w: 440, h: 1170, fit: "cover", radius: 24 });
      } else {
        s.elements.push({
          id: uid(), type: "shape", x: 60, y: 80, w: 440, h: 1170,
          fill: "accent", opacity: 0.1, radius: 24,
        });
      }

      if (headline) {
        s.elements.push({
          ...headline, x: 560, y: 200, w: 460, h: 200,
          size: 72, weight: 900, color: "text", align: "left", line_height: 1,
        });
      }
      bodyTexts.forEach((t, i) => {
        const y = 460 + i * 200;
        s.elements.push({ ...t, x: 560, y, w: 460, h: 160, size: 28, weight: 400, color: "muted", align: "left", line_height: 1.4 });
      });
      return s;
    },
  },
  {
    id: "image-right",
    name: "Image Right",
    desc: "Text on left, image on right",
    apply(slide) {
      const s = cloneSlide(slide);
      const headline = pickHeadline(s.elements);
      const bodyTexts = pickBodyTexts(s.elements).filter((e) => e !== headline);
      const img = pickImage(s.elements);
      const logo = pickLogo(s.elements);

      s.elements = [];
      if (logo) s.elements.push({ ...logo, x: 80, y: CANVAS_H - 120, w: 120, h: 60 });

      if (headline) {
        s.elements.push({
          ...headline, x: 80, y: 200, w: 460, h: 200,
          size: 72, weight: 900, color: "text", align: "left", line_height: 1,
        });
      }
      bodyTexts.forEach((t, i) => {
        const y = 460 + i * 200;
        s.elements.push({ ...t, x: 80, y, w: 460, h: 160, size: 28, weight: 400, color: "muted", align: "left", line_height: 1.4 });
      });

      if (img) {
        s.elements.push({ ...img, x: 580, y: 80, w: 440, h: 1170, fit: "cover", radius: 24 });
      } else {
        s.elements.push({
          id: uid(), type: "shape", x: 580, y: 80, w: 440, h: 1170,
          fill: "accent", opacity: 0.1, radius: 24,
        });
      }
      return s;
    },
  },
  {
    id: "timeline",
    name: "Timeline",
    desc: "Chronological layout with dots and line",
    apply(slide) {
      const s = cloneSlide(slide);
      const headline = pickHeadline(s.elements);
      const bodyTexts = pickBodyTexts(s.elements).filter((e) => e !== headline);
      const logo = pickLogo(s.elements);

      s.elements = [];
      if (logo) s.elements.push({ ...logo, x: 80, y: CANVAS_H - 120, w: 120, h: 60 });
      if (headline) {
        s.elements.push({
          ...headline, x: 80, y: 100, w: 920, h: 100,
          size: 64, weight: 800, color: "text", line_height: 1,
        });
      }
      s.elements.push({
        id: uid(), type: "shape", x: 116, y: 280, w: 4, h: 880,
        fill: "accent", radius: 2, opacity: 0.4,
      });
      bodyTexts.forEach((t, i) => {
        const y = 280 + i * 200;
        s.elements.push({
          id: uid(), type: "shape", x: 96, y: y + 6, w: 44, h: 44,
          fill: "accent", radius: 999,
        });
        s.elements.push({ ...t, x: 180, y, w: 820, h: 60, size: 34, weight: 700, color: "text", align: "left" });
      });
      return s;
    },
  },
  {
    id: "comparison",
    name: "Comparison",
    desc: "Side-by-side before/after",
    apply(slide) {
      const s = cloneSlide(slide);
      const headline = pickHeadline(s.elements);
      const bodyTexts = pickBodyTexts(s.elements).filter((e) => e !== headline);
      const logo = pickLogo(s.elements);

      s.elements = [];
      if (logo) s.elements.push({ ...logo, x: 80, y: CANVAS_H - 120, w: 120, h: 60 });
      if (headline) {
        s.elements.push({
          ...headline, x: 80, y: 96, w: 920, h: 100,
          size: 52, weight: 800, color: "text",
        });
      }

      const leftLabel = bodyTexts.length > 0 ? bodyTexts[0] : null;
      let rightLabel = bodyTexts.length > 1 ? bodyTexts[1] : null;
      let leftDetail = bodyTexts.length > 2 ? bodyTexts[2] : null;
      let rightDetail = bodyTexts.length > 3 ? bodyTexts[3] : null;

      if (leftLabel) {
        s.elements.push({
          ...leftLabel, x: 80, y: 260, w: 440, h: 200,
          size: leftLabel.text.length > 15 ? 36 : 48, weight: 700, color: "muted",
        });
      }
      if (leftDetail) {
        s.elements.push({
          ...leftDetail, x: 80, y: 520, w: 440, h: 400,
          size: 28, weight: 400, color: "muted", line_height: 1.4,
        });
      }
      if (rightLabel) {
        s.elements.push({
          ...rightLabel, x: 560, y: 260, w: 440, h: 200,
          size: rightLabel.text.length > 15 ? 36 : 48, weight: 700, color: "accent",
        });
      }
      if (rightDetail) {
        s.elements.push({
          ...rightDetail, x: 560, y: 520, w: 440, h: 400,
          size: 28, weight: 400, color: "text", line_height: 1.4,
        });
      }
      return s;
    },
  },
  {
    id: "hook",
    name: "Hook",
    desc: "Bold one-liner with subtitle",
    apply(slide) {
      const s = cloneSlide(slide);
      const headline = pickHeadline(s.elements);
      const bodyTexts = pickBodyTexts(s.elements).filter((e) => e !== headline);
      const img = pickImage(s.elements);
      const logo = pickLogo(s.elements);

      s.elements = [];
      if (logo) s.elements.push({ ...logo, x: 80, y: CANVAS_H - 120, w: 120, h: 60 });

      if (headline) {
        s.elements.push({
          ...headline, x: 80, y: 400, w: 920, h: 500,
          size: 120, weight: 900, color: "text", align: "center", line_height: 0.95,
        });
      }
      if (bodyTexts.length > 0) {
        s.elements.push({
          ...bodyTexts[0], x: 80, y: 960, w: 920, h: 140,
          size: 30, weight: 400, color: "muted", align: "center", line_height: 1.4,
        });
      }
      if (img) {
        s.elements.push({ ...img, x: 420, y: 80, w: 240, h: 240, radius: 999, fit: "cover" });
      }
      return s;
    },
  },
  {
    id: "cta",
    name: "CTA",
    desc: "Clear call to action, centered",
    apply(slide) {
      const s = cloneSlide(slide);
      const headline = pickHeadline(s.elements);
      const bodyTexts = pickBodyTexts(s.elements).filter((e) => e !== headline);
      const logo = pickLogo(s.elements);

      s.elements = [];
      if (logo) s.elements.push({ ...logo, x: 80, y: CANVAS_H - 120, w: 120, h: 60 });
      if (headline) {
        s.elements.push({
          ...headline, x: 80, y: 220, w: 920, h: 480,
          size: 120, weight: 900, color: "text", align: "center", line_height: 0.95,
        });
      }
      if (bodyTexts.length > 0) {
        s.elements.push({
          ...bodyTexts[0], x: 80, y: 780, w: 920, h: 160,
          size: 32, weight: 400, color: "muted", align: "center", line_height: 1.4,
        });
      }
      s.elements.push({
        id: uid(), type: "shape", x: 360, y: 1060, w: 360, h: 84,
        fill: "accent", radius: 999,
      });
      s.elements.push({
        id: uid(), type: "text", x: 360, y: 1082, w: 360, h: 40,
        text: "Get started →", font: "Inter", size: 26, weight: 700, color: "bg", align: "center",
      });
      return s;
    },
  },
];
