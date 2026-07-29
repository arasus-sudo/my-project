// Pure function: block schema + style -> email-safe HTML + plain text.
// Table-based layout, inline CSS only — the only markup subset every major
// mail client (Outlook's Word rendering engine included) reliably supports.
// Editor font choices are cosmetic; the exported HTML always maps through
// EMAIL_SAFE_STACKS so the signature actually renders as chosen everywhere,
// not just in browsers with the real font installed.

const EMAIL_SAFE_STACKS = {
  "Arial": "Arial, Helvetica, sans-serif",
  "Helvetica Neue": "'Helvetica Neue', Helvetica, Arial, sans-serif",
  "Segoe UI": "'Segoe UI', Arial, sans-serif",
  "Georgia": "Georgia, 'Times New Roman', serif",
  "Verdana": "Verdana, Geneva, sans-serif",
  "Tahoma": "Tahoma, Geneva, sans-serif",
  "Trebuchet MS": "'Trebuchet MS', Helvetica, sans-serif",
};

export const FONT_CHOICES = Object.keys(EMAIL_SAFE_STACKS);

export function emailFontStack(font) {
  return EMAIL_SAFE_STACKS[font] || EMAIL_SAFE_STACKS.Arial;
}

const esc = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const linkFor = (kind, value) => {
  const v = (value || "").trim();
  if (!v) return "";
  if (kind === "email") return `mailto:${v}`;
  if (kind === "phone" || kind === "mobile") return `tel:${v.replace(/[^\d+]/g, "")}`;
  if (kind === "whatsapp") return `https://wa.me/${v.replace(/[^\d]/g, "")}`;
  if (/^https?:\/\//i.test(v)) return v;
  if (kind === "website") return `https://${v}`;
  return v;
};

function renderPhoto(data, style) {
  if (!data.imageUrl) return "";
  const size = data.size || 80;
  // "contain" (wide logo): the image is uploaded as-is, unrocropped, so it's
  // shown at its own aspect ratio instead of forced into a square — width
  // caps at `size`, height follows naturally. "cover" (photo/headshot): the
  // shape (circle/rounded) is already baked into the uploaded PNG itself by
  // ImageCropModal's canvas clip, since Outlook's Word engine doesn't
  // reliably honor CSS border-radius on <img> — the radius here is just a
  // harmless fallback for clients that do.
  if (data.fit === "contain") {
    return `<td style="padding-right:16px;vertical-align:top;" valign="top"><img src="${esc(data.imageUrl)}" alt="" style="display:block;max-width:${size}px;height:auto;border:0;" /></td>`;
  }
  const radius = data.shape === "circle" ? "50%" : data.shape === "rounded" ? "10px" : "0";
  return `<td style="padding-right:16px;vertical-align:top;" valign="top"><img src="${esc(data.imageUrl)}" width="${size}" height="${size}" alt="" style="display:block;width:${size}px;height:${size}px;border-radius:${radius};object-fit:cover;border:0;" /></td>`;
}

function renderIdentity(data, style) {
  const rows = [];
  if (data.name) rows.push(`<div style="font-weight:bold;font-size:${style.fontSizeBase + 2}px;color:${style.primaryColor};">${esc(data.name)}</div>`);
  const line2 = [data.title, data.department].filter(Boolean).join(", ");
  if (line2) rows.push(`<div style="color:${style.secondaryColor};margin-top:2px;">${esc(line2)}</div>`);
  if (data.company) rows.push(`<div style="color:${style.primaryColor};font-weight:600;margin-top:2px;">${esc(data.company)}</div>`);
  return rows.join("");
}

function renderTagline(data, style) {
  if (!data.text) return "";
  return `<div style="color:${style.secondaryColor};margin-top:6px;font-style:italic;">${esc(data.text)}</div>`;
}

function renderContact(data, style) {
  const rows = (data.rows || []).filter((r) => r.value);
  if (!rows.length) return "";
  const items = rows.map((r) => {
    const href = r.link || linkFor(r.kind, r.value);
    const label = esc(r.label || r.value);
    return href
      ? `<a href="${esc(style.wrap(href))}" style="color:${style.accentColor};text-decoration:none;">${label}</a>`
      : `<span>${label}</span>`;
  });
  return `<div style="margin-top:8px;color:${style.secondaryColor};">${items.join(
    `<span style="color:${style.dividerColor || "#d1d5db"};margin:0 6px;">|</span>`
  )}</div>`;
}

function renderSocial(data, style) {
  const items = (data.items || []).filter((s) => s.url);
  if (!items.length) return "";
  const links = items.map((s) => {
    const label = s.network === "custom" ? (s.label || "Link") : s.network[0].toUpperCase() + s.network.slice(1);
    return `<a href="${esc(style.wrap(s.url))}" style="color:${style.accentColor};text-decoration:none;margin-right:12px;font-size:${style.fontSizeBase - 1}px;">${esc(label)}</a>`;
  });
  return `<div style="margin-top:8px;">${links.join("")}</div>`;
}

function renderDivider(data, style) {
  const dashed = data.style === "dashed";
  return `<div style="margin:10px 0;border-top:1px ${dashed ? "dashed" : "solid"} ${style.dividerColor || "#e5e7eb"};line-height:1px;font-size:1px;">&nbsp;</div>`;
}

function renderLegal(data, style) {
  if (!data.html) return "";
  return `<div style="margin-top:8px;font-size:${Math.max(10, style.fontSizeBase - 3)}px;color:${style.mutedColor || "#9ca3af"};line-height:1.4;">${data.html}</div>`;
}

function renderCta(data, style) {
  if (!data.label || !data.url) return "";
  const filled = data.style !== "outline";
  const btnStyle = filled
    ? `background:${style.accentColor};color:#ffffff;border:1px solid ${style.accentColor};`
    : `background:transparent;color:${style.accentColor};border:1px solid ${style.accentColor};`;
  return `<div style="margin-top:10px;"><a href="${esc(style.wrap(data.url))}" style="display:inline-block;padding:8px 16px;border-radius:6px;font-weight:600;text-decoration:none;${btnStyle}">${esc(data.label)}</a></div>`;
}

function renderQrCode(data) {
  if (!data.imageUrl) return "";
  return `<div style="margin-top:8px;"><img src="${esc(data.imageUrl)}" width="80" height="80" alt="QR code" style="display:block;border:0;" /></div>`;
}

// A date-ranged variant is active if today falls within [startDate, endDate]
// (either bound may be blank = open-ended). A variant with neither bound set
// is the fallback/default, used only when nothing date-specific matches.
export function activeBannerVariant(items, todayStr) {
  const today = todayStr || new Date().toISOString().slice(0, 10);
  const dated = (items || []).find((it) => (it.startDate || it.endDate) &&
    (!it.startDate || it.startDate <= today) && (!it.endDate || it.endDate >= today));
  if (dated) return dated;
  return (items || []).find((it) => !it.startDate && !it.endDate) || null;
}

function renderBannerVariant(item) {
  if (!item?.imageUrl) return "";
  const img = `<img src="${esc(item.imageUrl)}" alt="" style="display:block;max-width:100%;border:0;" />`;
  return item.link ? `<a href="${esc(item.link)}">${img}</a>` : img;
}

// Wrapped in HTML-comment markers so a lightweight server-side pass (the
// daily banner-refresh tick) can find and re-pick the active variant without
// re-implementing this whole renderer in Python — see backend/banner_tick.py.
function renderBanner(data, style, blockId) {
  const active = activeBannerVariant(data.items);
  const inner = renderBannerVariant(active);
  if (!inner) return "";
  return `<!--BANNER:${blockId}--><div style="margin-top:8px;">${inner}</div><!--/BANNER:${blockId}-->`;
}

const RENDERERS = {
  photo: null, // handled inline in main layout (occupies its own cell)
  identity: renderIdentity,
  tagline: renderTagline,
  qrcode: renderQrCode,
  contact: renderContact,
  social: renderSocial,
  divider: renderDivider,
  legal: renderLegal,
  cta: renderCta,
  banner: renderBanner,
};

// Wraps a link through the click-tracking redirect — only for http(s) URLs.
// mailto:/tel: links must never be wrapped: the tracking route only ever
// redirects to http(s) or falls back to FRONTEND_URL (an open-redirect guard
// on the backend), so wrapping a mailto: link would silently break it instead
// of opening the mail client.
function makeLinkWrapper(trackingApiBase, signatureId, enabled) {
  return (url) => {
    if (!enabled || !signatureId || !trackingApiBase || !/^https?:\/\//i.test(url || "")) return url;
    return `${trackingApiBase}/t/sig/${signatureId}?u=${encodeURIComponent(url)}`;
  };
}

export function renderSignature(blocks, style, opts = {}) {
  const s = {
    fontFamily: emailFontStack(style.font),
    fontSizeBase: style.fontSizeBase || 13,
    primaryColor: style.primaryColor || "#111111",
    secondaryColor: style.secondaryColor || "#6b7280",
    accentColor: style.accentColor || "#3B82F6",
    mutedColor: style.mutedColor || "#9ca3af",
    dividerColor: style.dividerColor || "#e5e7eb",
    wrap: makeLinkWrapper(opts.trackingApiBase, opts.signatureId, opts.clickTracking),
  };

  const visible = (blocks || []).filter((b) => b.visible !== false);
  const photoBlock = visible.find((b) => b.type === "photo" && b.data?.imageUrl);
  const bodyBlocks = visible.filter((b) => b.type !== "photo");

  const bodyHtml = bodyBlocks
    .map((b) => (RENDERERS[b.type] ? RENDERERS[b.type](b.data || {}, s, b.id) : ""))
    .filter(Boolean)
    .join("");

  const photoCell = photoBlock ? renderPhoto(photoBlock.data, s) : "";

  // Single-line output: this HTML is stored as-is and later run through the
  // signature list's legacy `\n` -> `<br>` conversion (kept for old plain-text
  // signatures) — any literal newline here would show up as a stray visible
  // line break in every rendered preview and sent email.
  const html = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="font-family:${s.fontFamily};font-size:${s.fontSizeBase}px;color:${s.primaryColor};"><tr>${photoCell}<td style="vertical-align:top;" valign="top">${bodyHtml}</td></tr></table>`;

  const textLines = [];
  bodyBlocks.forEach((b) => {
    if (b.type === "identity") {
      const d = b.data || {};
      textLines.push([d.name, [d.title, d.department].filter(Boolean).join(", "), d.company].filter(Boolean).join(" — "));
    } else if (b.type === "tagline" && b.data?.text) textLines.push(b.data.text);
    else if (b.type === "contact") (b.data?.rows || []).forEach((r) => r.value && textLines.push(`${r.label || r.kind}: ${r.value}`));
    else if (b.type === "cta" && b.data?.url) textLines.push(`${b.data.label || "Link"}: ${b.data.url}`);
  });
  const text = textLines.join("\n");

  return { html, text };
}
