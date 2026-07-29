// Export/copy actions for the live-preview node — same html2canvas + jsPDF
// technique already used in CreateEQEditor.jsx's renderSlideToDataUrl, just
// pointed at an already-mounted DOM node instead of an off-screen React mount
// (the live preview is always visible, so there's nothing to render first).

export async function nodeToDataUrl(node, scale = 2) {
  const html2canvas = (await import("html2canvas")).default;
  const canvas = await html2canvas(node, {
    scale, useCORS: true, allowTaint: true, backgroundColor: "#ffffff", logging: false,
  });
  return canvas.toDataURL("image/png", 0.95);
}

export async function exportPng(node, filename = "signature.png") {
  const dataUrl = await nodeToDataUrl(node);
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

export async function exportPdf(node, filename = "signature.pdf") {
  const { jsPDF } = await import("jspdf");
  const dataUrl = await nodeToDataUrl(node);
  const img = new Image();
  await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = dataUrl; });
  const pdf = new jsPDF({ orientation: img.width >= img.height ? "landscape" : "portrait", unit: "px", format: [img.width, img.height], compress: true });
  pdf.addImage(dataUrl, "PNG", 0, 0, img.width, img.height);
  pdf.save(filename);
}

export async function copyHtml(html) {
  await navigator.clipboard.writeText(html);
}

export async function copyRich(html, text) {
  if (window.ClipboardItem) {
    const item = new window.ClipboardItem({
      "text/html": new Blob([html], { type: "text/html" }),
      "text/plain": new Blob([text || html], { type: "text/plain" }),
    });
    await navigator.clipboard.write([item]);
  } else {
    await navigator.clipboard.writeText(html);
  }
}
