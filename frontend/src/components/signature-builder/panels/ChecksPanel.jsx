import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Link2, Loader2, Image as ImageIcon } from "lucide-react";
import { api } from "../../../lib/api";
import { contrastChecks, spamCheck, collectImageChecks, collectLinks } from "../checks";

function loadImageSize(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export default function ChecksPanel({ blocks, style }) {
  const [imageChecks, setImageChecks] = useState([]);
  const [linkResults, setLinkResults] = useState(null);
  const [checkingLinks, setCheckingLinks] = useState(false);

  const contrast = contrastChecks(style);
  const spam = spamCheck(blocks);
  const links = collectLinks(blocks);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const targets = collectImageChecks(blocks);
      const results = await Promise.all(targets.map(async (t) => {
        const size = await loadImageSize(t.imageUrl);
        if (!size) return { ...t, status: "error" };
        const retina = size.w >= t.displaySize * 2;
        return { ...t, ...size, status: retina ? "ok" : "low-res" };
      }));
      if (!cancelled) setImageChecks(results);
    })();
    return () => { cancelled = true; };
  }, [blocks]);

  const runLinkCheck = async () => {
    setCheckingLinks(true);
    try {
      const { data } = await api.post("/signatures/check-links", { urls: links });
      setLinkResults(data.results);
    } finally {
      setCheckingLinks(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="text-tiny text-ink-muted mb-1.5">Contrast (WCAG AA)</div>
        <div className="space-y-1">
          {contrast.map((c) => (
            <div key={c.label} className="flex items-center justify-between text-caption">
              <span className="text-ink-muted">{c.label}</span>
              <span className={`inline-flex items-center gap-1 font-mono ${c.pass ? "text-success" : "text-danger"}`}>
                {c.pass ? <CheckCircle2 size={12} /> : <XCircle size={12} />} {c.ratio}:1
              </span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="text-tiny text-ink-muted mb-1.5">Spam score</div>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-neutral-100 overflow-hidden">
            <div className={`h-full rounded-full ${spam.score > 50 ? "bg-danger" : spam.score > 20 ? "bg-warning" : "bg-success"}`}
              style={{ width: `${spam.score}%` }} />
          </div>
          <span className="text-caption font-mono">{spam.score}/100</span>
        </div>
        {spam.flags.length > 0 && (
          <ul className="mt-1.5 space-y-0.5">
            {spam.flags.map((f) => <li key={f} className="text-tiny text-ink-muted">• {f}</li>)}
          </ul>
        )}
      </div>

      {imageChecks.length > 0 && (
        <div>
          <div className="text-tiny text-ink-muted mb-1.5">Image quality</div>
          <div className="space-y-1">
            {imageChecks.map((img) => (
              <div key={img.label} className="flex items-center justify-between text-caption">
                <span className="text-ink-muted inline-flex items-center gap-1"><ImageIcon size={11} /> {img.label}</span>
                <span className={`font-mono ${img.status === "ok" ? "text-success" : img.status === "low-res" ? "text-warning" : "text-ink-muted"}`}>
                  {img.status === "ok" ? "Retina-ready" : img.status === "low-res" ? `Low-res (${img.w}×${img.h})` : "Unknown"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-tiny text-ink-muted">Links ({links.length})</div>
          <button onClick={runLinkCheck} disabled={checkingLinks || links.length === 0} className="btn-secondary text-tiny px-2 py-0.5 disabled:opacity-40">
            {checkingLinks ? <Loader2 size={10} className="animate-spin" /> : <Link2 size={10} />} Check links
          </button>
        </div>
        {linkResults && (
          <div className="space-y-1">
            {linkResults.map((r) => (
              <div key={r.url} className="flex items-center justify-between text-caption gap-2">
                <span className="truncate text-ink-muted">{r.url}</span>
                <span className={`shrink-0 font-mono ${r.status === "ok" ? "text-success" : "text-danger"}`}>{r.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
