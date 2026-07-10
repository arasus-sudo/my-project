import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Plus, Trash2, ImageIcon } from "lucide-react";

export default function CreateEQProjects() {
  const nav = useNavigate();
  const [items, setItems] = useState([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ topic: "", platform: "linkedin", slide_count: 6, tone: "confident, punchy" });
  const [busy, setBusy] = useState(false);

  const load = () => api.get("/carousel").then((r) => setItems(r.data));
  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post("/carousel/generate", form);
      toast.success("Carousel drafted");
      nav(`/app/create-eq/${data.id}`);
    } catch { toast.error("Generation failed"); }
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
        subtitle="Topic → multi-slide carousel with LLM-driven narrative."
        badge="Beta"
        right={<button onClick={() => setModal(true)} data-testid="new-carousel-btn" className="btn-primary"><Plus size={14} /> New carousel</button>}
      />
      <div className="p-6 grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.length === 0 && <div className="col-span-full text-neutral-500 text-sm">No carousels yet. Click New carousel.</div>}
        {items.map((p) => (
          <div key={p.id} className="bg-white border border-line rounded-2xl overflow-hidden">
            <Link to={`/app/create-eq/${p.id}`} data-testid={`carousel-open-${p.id}`}
              className="block aspect-[4/5] p-8 flex flex-col justify-between"
              style={{ background: p.brand?.bg || "#0F1010", color: p.brand?.text || "#FFF" }}>
              <div className="text-xs opacity-70 font-mono uppercase tracking-wider">{p.platform}</div>
              <div className="font-display font-bold text-2xl leading-tight" style={{ color: p.brand?.text || "#FFF" }}>{p.slides?.[0]?.title || p.topic}</div>
              <div className="text-xs opacity-70 font-mono">{p.slides?.length || 0} slides</div>
            </Link>
            <div className="p-3 flex items-center justify-between border-t border-line">
              <div className="text-xs text-neutral-500 truncate">{p.topic}</div>
              <button onClick={() => del(p.id)} data-testid={`carousel-delete-${p.id}`} className="text-neutral-400 hover:text-red-600"><Trash2 size={12} /></button>
            </div>
          </div>
        ))}
      </div>
      {modal && (
        <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50 p-4">
          <form onSubmit={create} className="bg-white border border-line rounded-2xl p-6 w-full max-w-md space-y-3">
            <div className="flex items-center gap-2">
              <ImageIcon size={18} />
              <div className="font-display font-bold text-xl">New carousel</div>
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
