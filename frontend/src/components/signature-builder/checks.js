// Pure, client-side checks — no dependency needed for any of these.

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [0, 0, 0];
}

function relativeLuminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(hex1, hex2) {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// WCAG AA: 4.5:1 for normal text, 3:1 for large text (>=18px, or >=14px bold).
export function contrastChecks(style) {
  const bg = "#ffffff";
  return [
    { label: "Text on background", ratio: contrastRatio(style.primaryColor, bg), minAA: 4.5 },
    { label: "Muted text on background", ratio: contrastRatio(style.secondaryColor, bg), minAA: 4.5 },
    { label: "Links on background", ratio: contrastRatio(style.accentColor, bg), minAA: 3 },
  ].map((c) => ({ ...c, ratio: Math.round(c.ratio * 100) / 100, pass: c.ratio >= c.minAA }));
}

const SPAM_WORDS = [
  "free", "buy now", "click here", "guarantee", "guaranteed", "act now", "limited time",
  "winner", "cash bonus", "risk-free", "100% free", "cheap", "no obligation", "urgent",
];

function collectText(blocks) {
  const parts = [];
  (blocks || []).forEach((b) => {
    if (b.type === "tagline" && b.data?.text) parts.push(b.data.text);
    if (b.type === "legal" && b.data?.html) parts.push(b.data.html.replace(/<[^>]+>/g, " "));
    if (b.type === "cta" && b.data?.label) parts.push(b.data.label);
  });
  return parts.join(" ");
}

function collectLinks(blocks) {
  const urls = [];
  (blocks || []).forEach((b) => {
    if (b.type === "contact") (b.data?.rows || []).forEach((r) => {
      const v = r.link || r.value;
      if (v && /^https?:\/\//i.test(v)) urls.push(v);
    });
    if (b.type === "social") (b.data?.items || []).forEach((s) => s.url && urls.push(s.url));
    if (b.type === "cta" && b.data?.url) urls.push(b.data.url);
    if (b.type === "banner") (b.data?.items || []).forEach((it) => it.link && urls.push(it.link));
  });
  return [...new Set(urls)];
}

export function spamCheck(blocks) {
  const raw = collectText(blocks);
  const lower = raw.toLowerCase();
  const flags = [];
  let score = 0;

  SPAM_WORDS.forEach((w) => {
    if (lower.includes(w)) { score += 12; flags.push(`Contains "${w}"`); }
  });
  const capsRuns = raw.match(/\b[A-Z]{5,}\b/g) || [];
  if (capsRuns.length) { score += capsRuns.length * 8; flags.push(`${capsRuns.length} ALL-CAPS word(s)`); }
  const exclaimRuns = raw.match(/!{2,}/g) || [];
  if (exclaimRuns.length) { score += exclaimRuns.length * 8; flags.push("Excessive punctuation (!!)"); }

  const links = collectLinks(blocks);
  if (links.length > 5) { score += (links.length - 5) * 5; flags.push(`${links.length} links (5+ can trigger spam filters)`); }

  return { score: Math.min(100, score), flags, linkCount: links.length };
}

export function collectImageChecks(blocks) {
  // Returns [{ imageUrl, displaySize }] for images whose *display* size we
  // know — retina quality means the source pixel width should be >= 2x that.
  const out = [];
  (blocks || []).forEach((b) => {
    if (b.type === "photo" && b.data?.imageUrl) out.push({ imageUrl: b.data.imageUrl, displaySize: b.data.size || 80, label: "Photo/Logo" });
    if (b.type === "qrcode" && b.data?.imageUrl) out.push({ imageUrl: b.data.imageUrl, displaySize: 80, label: "QR code" });
  });
  return out;
}

export { collectLinks };
