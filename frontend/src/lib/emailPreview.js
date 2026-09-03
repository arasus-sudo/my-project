/**
 * emailPreview — render an email HTML string faithfully as a browser fragment.
 *
 * Real email templates are often pasted as a *full document*: `<!DOCTYPE html>`,
 * `<html>` (sometimes carrying Outlook `xmlns:v`/`xmlns:o` namespaces), a
 * `<head>` with a `<style>` block (including `@media` rules) and a `<body>`.
 * When such a document is injected straight into a `<div>` (as the compose and
 * review previews do), the browser re-parents/nests the `<html>`/`<body>`
 * elements and the email can look nothing like the authored template.
 *
 * This strips the document wrapper but KEEPS the inner content and re-attaches
 * any `<style>` block at the top of the returned fragment, so the preview
 * renders the same building blocks (tables, inline + `<style>` rules) that a
 * real mail client would see — while remaining renderable inside a `<div>`.
 */

/** Convert a full HTML document into a renderable fragment. Safe for any input. */
export function revealEmailFragment(html = "") {
  if (!html) return html;
  // Keep the style blocks — they must survive to style tables/links in the
  // fragment exactly as in the sent email.
  const styles = [];
  const styleRe = /<style[\s\S]*?<\/style\s*>/gi;
  html = html.replace(styleRe, (m) => {
    styles.push(m);
    return "";
  });

  // Strip the document wrapper tags but preserve their inner content.
  // Note: an <html> with xmlns attributes would otherwise be ignored by the
  // parser when nested in a div, dropping the whole tree in some browsers.
  let fragment = html
    .replace(/<![^>]*>/g, "")                                // <!DOCTYPE ...>
    .replace(/<\/?(?:html|head|body)\b[^>]*>/gi, "")          // <html>/<head>/<body> open/close
    // Optional <meta> tags are harmless to keep; leave as-is.
    .replace(/^\s+/, "");

  return (styles.length ? styles.join("") + fragment : fragment).trim();
}

/** Plain-text fallback used when email_body_html is absent. */
export function emailBodyHtml(emailBodyHtml, emailBody, reveal) {
  const revealFn = reveal ?? revealEmailFragment;
  return (emailBodyHtml || "").trim()
    ? revealFn(emailBodyHtml)
    : (emailBody || "");
}
