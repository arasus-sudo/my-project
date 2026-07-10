import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Plus, Trash2, ImageIcon, Sparkles } from "lucide-react";
import { TEMPLATES, PALETTES, slideFromTemplate, blankSlide } from "../lib/creqTemplates";

export default function CreateEQProjects() {
  const nav = useNavigate();
  const [items, setItems] = useState([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ topic: "", platform: "linkedin", slide_count: 6, tone: "confident, punchy" });
  const [busy, setBusy] = useState(false);

  const load = () => api.get("/carousel").then((r) => setItems(r.data));
  useEffect(() => { load(); }, []);

  const aiGenerate = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post("/carousel/generate", form);
      toast.success("AI carousel drafted");
      nav(`/app/create-eq/${data.id}`);
    } catch { toast.error("Generation failed"); }
    finally { setBusy(false); }
  };

  const startFromTemplate = async (tpl) => {
    setBusy(true);
    try {
      const { data } = await api.post("/carousel/generate", {
        topic: tpl.name, platform: "linkedin", slide_count: 1, tone: "editorial",
      });
      // Overwrite AI-generated content with the chosen template's rich slide.
      const slide = slideFromTemplate(tpl);
      await api.put(`/carousel/${data.id}`, {
        slides: [slide], palette_id: tpl.palette, platform: "linkedin", topic: tpl.name,
      });
      nav(`/app/create-eq/${data.id}`);
    } catch { toast.error("Could not start template"); }
    finally { setBusy(false); }
  };

  const startBlank = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/carousel/generate", {
        topic: "Untitled", platform: "linkedin", slide_count: 1, tone: "neutral",
      });
      await api.put(`/carousel/${data.id}`, {
        slides: [blankSlide()], palette_id: "midnight", platform: "linkedin", topic: "Untitled",
      });
      nav(`/app/create-eq/${data.id}`);
    } catch { toast.error("Could not create"); }
    finally { setBusy(false); }
  };

  const del = async (id) => {
    if (!confirm("Delete carousel?")) return;
    await api.delete(`/carousel/${id}`); load();
  };

  return (
    <div>
      <PageHeader
        title="Create EQ · Projects"
        subtitle="AI-drafted carousels or Canva-like editing from a template."
        badge="Beta"
        right={
          <div className="flex gap-2">
            <button onClick={startBlank} disabled={busy} data-testid="start-blank-btn" className="btn-secondary">Blank</button>
            <button onClick={() => setModal(true)} data-testid="new-carousel-btn" className="btn-primary"><Sparkles size={14} /> AI generate</button>
          </div>
        }
      />

      <div className="p-6 space-y-8">
        {/* Templates gallery */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="ui-label">Start from a template</div>
              <div className="text-xs text-neutral-500 mt-0.5">Pre-designed slides you can fully customise.</div>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {TEMPLATES.map((t) => {
              const pal = PALETTES.find((p) => p.id === t.palette) || PALETTES[0];
              return (
                <button key={t.id} onClick={() => startFromTemplate(t)} data-testid={`start-tpl-${t.id}`}
                  className="text-left group">
                  <div className="aspect-[4/5] rounded-2xl overflow-hidden border border-line hover:border-ink transition-colors">
                    <div className="w-full h-full p-4 flex flex-col justify-between"
                      style={{ background: pal.bg, color: pal.text, fontFamily: "Inter" }}>
                      <div className="text-[9px] font-mono uppercase tracking-widest opacity-60">{t.tag}</div>
                      <div className="font-bold text-lg leading-tight" style={{ color: pal.accent }}>{t.name}</div>
                      <div className="flex gap-1">
                        {[pal.bg2, pal.accent, pal.text].map((c) => <span key={c} className="w-3 h-3 rounded-full" style={{ background: c }} />)}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 text-xs font-medium">{t.name}</div>
                  <div className="text-[10px] text-neutral-500">{t.tag}</div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Your projects */}
        <section>
          <div className="ui-label mb-3">Your projects</div>
          {items.length === 0 && <div className="text-neutral-500 text-sm">No carousels yet. Pick a template above or click AI generate.</div>}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {items.map((p) => (
              <div key={p.id} className="bg-white border border-line rounded-2xl overflow-hidden">
                <Link to={`/app/create-eq/${p.id}`} data-testid={`carousel-open-${p.id}`}
                  className="block aspect-[4/5] p-6 flex flex-col justify-between"
                  style={{ background: (PALETTES.find(pp => pp.id === p.palette_id) || PALETTES[0]).bg, color: (PALETTES.find(pp => pp.id === p.palette_id) || PALETTES[0]).text }}>
                  <div className="text-[10px] opacity-70 font-mono uppercase tracking-wider">{p.platform}</div>
                  <div className="font-bold text-xl leading-tight" style={{ color: (PALETTES.find(pp => pp.id === p.palette_id) || PALETTES[0]).accent }}>{p.topic}</div>
                  <div className="text-xs opacity-70 font-mono">{p.slides?.length || 0} slides</div>
                </Link>
                <div className="p-3 flex items-center justify-between border-t border-line">
                  <div className="text-xs text-neutral-500 truncate">{p.topic}</div>
                  <button onClick={() => del(p.id)} data-testid={`carousel-delete-${p.id}`} className="text-neutral-400 hover:text-red-600"><Trash2 size={12} /></button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {modal && (
        <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50 p-4">
          <form onSubmit={aiGenerate} className="bg-white border border-line rounded-2xl p-6 w-full max-w-md space-y-3">
            <div className="flex items-center gap-2">
              <ImageIcon size={18} />
              <div className="font-display font-bold text-xl">New carousel · AI</div>
            </div>
            <label className="block">
              <span className="ui-label">Topic</span>
              <input required value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} data-testid="carousel-topic"
                placeholder='e.g. "Why cold email fails in 2026"'
                className="mt-1 w-full border border-line px-3 py-2 rounded-full" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="ui-label">Platform</span>
                <select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })} data-testid="carousel-platform"
                  className="mt-1 w-full border border-line px-3 py-2 rounded-full bg-white">
                  <option value="linkedin">LinkedIn Deck</option>
                  <option value="square">Square Social</option>
                  <option value="twitter">Twitter Cheat Sheet</option>
                </select>
              </label>
              <label className="block">
                <span className="ui-label">Slides</span>
                <input type="number" min={3} max={12} value={form.slide_count} onChange={(e) => setForm({ ...form, slide_count: Number(e.target.value) })}
                  data-testid="carousel-slide-count" className="mt-1 w-full border border-line px-3 py-2 rounded-full font-mono" />
              </label>
            </div>
            <label className="block">
              <span className="ui-label">Tone</span>
              <input value={form.tone} onChange={(e) => setForm({ ...form, tone: e.target.value })} data-testid="carousel-tone"
                className="mt-1 w-full border border-line px-3 py-2 rounded-full" />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setModal(false)} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={busy} data-testid="generate-carousel" className="btn-primary disabled:opacity-60">
                {busy ? "Generating…" : "Generate"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
