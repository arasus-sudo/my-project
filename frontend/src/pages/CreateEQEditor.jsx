import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Send, Save, Download, Palette, ChevronLeft, Loader2 } from "lucide-react";

const PLATFORMS = {
  linkedin: { w: 1080, h: 1350, label: "LinkedIn Deck" },
  square: { w: 1080, h: 1080, label: "Square Social" },
  twitter: { w: 1080, h: 1350, label: "Twitter Cheat Sheet" },
};

export default function CreateEQEditor() {
  const { id } = useParams();
  const nav = useNavigate();
  const [proj, setProj] = useState(null);
  const [active, setActive] = useState(0);
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [brandOpen, setBrandOpen] = useState(false);
  const [brandUrl, setBrandUrl] = useState("");
  const slideRef = useRef(null);

  useEffect(() => { api.get(`/carousel/${id}`).then((r) => setProj(r.data)); }, [id]);

  if (!proj) return <div className="p-10 text-neutral-500">Loading…</div>;
  const dim = PLATFORMS[proj.platform] || PLATFORMS.linkedin;
  const scale = 0.42; // preview scale
  const cur = proj.slides[active];

  const patch = (patchObj) => setProj({ ...proj, ...patchObj });
  const patchSlide = (patchObj) => {
    const next = [...proj.slides];
    next[active] = { ...next[active], ...patchObj };
    patch({ slides: next });
  };

  const save = async () => {
    setBusy(true);
    try {
      await api.put(`/carousel/${id}`, { slides: proj.slides, brand: proj.brand, platform: proj.platform, topic: proj.topic });
      toast.success("Saved");
    } catch { toast.error("Save failed"); }
    finally { setBusy(false); }
  };

  const editWithAI = async () => {
    if (!instruction.trim()) return;
    setBusy(true);
    try {
      const { data } = await api.post("/carousel/edit", { project_id: id, slide_index: active, instruction });
      patchSlide(data.slide);
      setInstruction("");
      toast.success("Slide updated");
    } catch { toast.error("Edit failed"); }
    finally { setBusy(false); }
  };

  const brandFromUrl = async () => {
    if (!brandUrl.trim()) return;
    setBusy(true);
    try {
      const { data } = await api.post("/carousel/brand-from-url", { url: brandUrl });
      patch({ brand: { ...proj.brand, ...data } });
      toast.success("Brand kit imported");
      setBrandOpen(false); setBrandUrl("");
    } catch { toast.error("Import failed"); }
    finally { setBusy(false); }
  };

  const exportPng = async () => {
    // Simple SVG-based export at native platform resolution
    const s = proj.slides[active];
    const svg = renderSvg(s, proj.brand, dim);
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = dim.w; canvas.height = dim.h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, dim.w, dim.h);
      canvas.toBlob((b) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(b);
        a.download = `${proj.topic.slice(0, 40).replace(/\W+/g, "-")}-slide-${active + 1}.png`;
        a.click();
      }, "image/png");
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  return (
    <div>
      <PageHeader
        title={proj.topic}
        subtitle={`${proj.slides.length} slides · ${dim.label} · ${dim.w}×${dim.h}`}
        right={
          <div className="flex gap-2">
            <button onClick={() => nav("/app/create-eq")} className="btn-ghost"><ChevronLeft size={14} /> Projects</button>
            <button onClick={() => setBrandOpen(true)} data-testid="brand-kit-btn" className="btn-secondary"><Palette size={14} /> Brand kit</button>
            <button onClick={exportPng} data-testid="export-png-btn" className="btn-secondary"><Download size={14} /> Export PNG</button>
            <button onClick={save} disabled={busy} data-testid="save-carousel-btn" className="btn-primary"><Save size={14} /> Save</button>
          </div>
        }
      />
      <div className="grid grid-cols-12 min-h-[calc(100vh-90px)]">
        {/* Canvas */}
        <div className="col-span-9 p-8 overflow-auto bg-neutral-100">
          <div className="flex gap-6 flex-wrap items-start">
            {proj.slides.map((s, i) => (
              <button key={i} onClick={() => setActive(i)} data-testid={`slide-thumb-${i}`}
                className={`relative rounded-2xl overflow-hidden transition-all shrink-0 ${i === active ? "ring-4 ring-ink" : "hover:ring-2 hover:ring-neutral-300"}`}
                style={{ width: dim.w * scale, height: dim.h * scale }}>
                <div ref={i === active ? slideRef : null} className="absolute inset-0 p-8 flex flex-col justify-between"
                  style={{ background: proj.brand?.bg || "#0F1010", color: proj.brand?.text || "#FFF", fontFamily: proj.brand?.font || "Inter" }}>
                  <div className="text-[10px] font-mono opacity-60 uppercase tracking-widest">
                    {s.kind === "hook" ? "01 · Hook" : s.kind === "cta" ? `${String(proj.slides.length).padStart(2,'0')} · CTA` : `${String(i+1).padStart(2,'0')}`}
                  </div>
                  <div>
                    <div className="font-display font-bold leading-tight" style={{ fontSize: 22, color: proj.brand?.accent || "#E85D3A" }}>
                      {s.title}
                    </div>
                    {s.subtitle && <div className="text-sm opacity-80 mt-1">{s.subtitle}</div>}
                    <div className="text-xs opacity-90 mt-3 leading-relaxed line-clamp-6">{s.body}</div>
                    {s.cta && <div className="mt-3 inline-block px-3 py-1 rounded-full text-[10px] font-mono uppercase tracking-widest" style={{ background: proj.brand?.accent, color: proj.brand?.bg }}>{s.cta}</div>}
                  </div>
                  {proj.brand?.logo_text && <div className="text-[10px] font-mono opacity-60">{proj.brand.logo_text}</div>}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Editor sidebar */}
        <aside className="col-span-3 border-l border-line bg-white p-6 overflow-y-auto">
          <div className="ui-label mb-2">Slide {active + 1}</div>
          <input value={cur.title || ""} onChange={(e) => patchSlide({ title: e.target.value })} data-testid="slide-title"
            className="w-full font-display font-bold text-lg border-0 border-b border-line focus:border-ink focus:outline-none py-2" />
          <input value={cur.subtitle || ""} onChange={(e) => patchSlide({ subtitle: e.target.value })} data-testid="slide-subtitle"
            placeholder="Subtitle"
            className="w-full text-sm border-0 border-b border-line focus:border-ink focus:outline-none py-2 mt-2" />
          <textarea value={cur.body || ""} onChange={(e) => patchSlide({ body: e.target.value })} data-testid="slide-body"
            rows={7} placeholder="Body"
            className="w-full mt-3 border border-line rounded-xl p-3 text-sm focus:outline-none focus:border-ink" />
          {cur.kind === "cta" && (
            <input value={cur.cta || ""} onChange={(e) => patchSlide({ cta: e.target.value })} data-testid="slide-cta"
              placeholder="CTA text"
              className="w-full mt-2 border border-line rounded-full px-3 py-2 text-sm focus:outline-none focus:border-ink" />
          )}

          <div className="mt-8 pt-6 border-t border-line">
            <div className="ui-label mb-2">Touch edit with AI</div>
            <textarea value={instruction} onChange={(e) => setInstruction(e.target.value)} data-testid="ai-instruction"
              rows={2} placeholder='e.g. "make the headline punchier"'
              className="w-full border border-line rounded-xl p-2 text-xs focus:outline-none focus:border-ink" />
            <button onClick={editWithAI} disabled={busy || !instruction.trim()} data-testid="ai-edit-slide"
              className="btn-primary text-xs w-full mt-2 disabled:opacity-60 py-2">
              {busy ? <><Loader2 size={12} className="animate-spin" /> Editing…</> : <><Send size={12} /> Apply AI edit</>}
            </button>
          </div>
        </aside>
      </div>

      {/* Brand kit modal */}
      {brandOpen && (
        <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-line rounded-2xl p-6 w-full max-w-md space-y-3">
            <div className="font-display font-bold text-xl">Brand kit</div>
            <div className="grid grid-cols-3 gap-3">
              {[["bg", "Background"], ["accent", "Accent"], ["text", "Text"]].map(([k, l]) => (
                <label key={k} className="block">
                  <span className="ui-label">{l}</span>
                  <input type="color" value={proj.brand?.[k] || "#000000"} onChange={(e) => patch({ brand: { ...proj.brand, [k]: e.target.value } })}
                    data-testid={`brand-${k}`} className="w-full h-10 border border-line rounded-lg mt-1" />
                </label>
              ))}
            </div>
            <label className="block">
              <span className="ui-label">Font</span>
              <select value={proj.brand?.font || "Inter"} onChange={(e) => patch({ brand: { ...proj.brand, font: e.target.value } })} data-testid="brand-font"
                className="mt-1 w-full border border-line rounded-full px-3 py-2 bg-white">
                {["Inter", "Manrope", "Poppins", "IBM Plex Sans", "Space Grotesk"].map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="ui-label">Watermark / logo text</span>
              <input value={proj.brand?.logo_text || ""} onChange={(e) => patch({ brand: { ...proj.brand, logo_text: e.target.value } })} data-testid="brand-logo-text"
                className="mt-1 w-full border border-line rounded-full px-3 py-2" />
            </label>
            <div className="pt-3 border-t border-line">
              <span className="ui-label">Or extract from URL</span>
              <div className="flex gap-2 mt-1">
                <input value={brandUrl} onChange={(e) => setBrandUrl(e.target.value)} data-testid="brand-url"
                  placeholder="https://yourbrand.com"
                  className="flex-1 border border-line rounded-full px-3 py-2 text-sm" />
                <button onClick={brandFromUrl} disabled={busy} data-testid="brand-from-url-btn" className="btn-primary text-sm px-4">Fetch</button>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setBrandOpen(false)} className="btn-secondary">Close</button>
              <button onClick={save} data-testid="brand-save" className="btn-primary">Save changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function esc(s) { return String(s || "").replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" })[c]); }

function renderSvg(s, brand, dim) {
  const bg = brand?.bg || "#0F1010";
  const accent = brand?.accent || "#E85D3A";
  const text = brand?.text || "#FFFFFF";
  const font = brand?.font || "Inter";
  const bodyLines = (s.body || "").split(" ").reduce((acc, w) => {
    const last = acc[acc.length - 1] || "";
    if ((last + " " + w).length > 42) acc.push(w); else acc[acc.length - 1] = last ? last + " " + w : w;
    return acc;
  }, [""]).filter(Boolean);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${dim.w}" height="${dim.h}" viewBox="0 0 ${dim.w} ${dim.h}">
    <rect width="100%" height="100%" fill="${bg}"/>
    <text x="80" y="120" font-family="${font}" font-size="24" fill="${text}" opacity="0.5" letter-spacing="4">${esc((s.kind || "").toUpperCase())}</text>
    <text x="80" y="${dim.h/2 - 60}" font-family="${font}" font-size="88" font-weight="800" fill="${accent}">${esc(s.title)}</text>
    <text x="80" y="${dim.h/2}" font-family="${font}" font-size="32" fill="${text}" opacity="0.85">${esc(s.subtitle)}</text>
    ${bodyLines.map((ln, i) => `<text x="80" y="${dim.h/2 + 60 + i*44}" font-family="${font}" font-size="30" fill="${text}" opacity="0.9">${esc(ln)}</text>`).join("")}
    ${s.cta ? `<rect x="80" y="${dim.h - 200}" width="${20 + s.cta.length * 22}" height="60" rx="30" fill="${accent}"/>
    <text x="${80 + (10 + s.cta.length * 11)}" y="${dim.h - 160}" font-family="${font}" font-size="24" font-weight="700" fill="${bg}" text-anchor="middle">${esc(s.cta)}</text>` : ""}
    ${brand?.logo_text ? `<text x="80" y="${dim.h - 60}" font-family="${font}" font-size="20" fill="${text}" opacity="0.6">${esc(brand.logo_text)}</text>` : ""}
  </svg>`;
}
