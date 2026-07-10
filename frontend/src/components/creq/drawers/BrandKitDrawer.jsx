import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Sparkles } from "lucide-react";
import { api } from "../../../lib/api";
import { PALETTES, FONTS } from "../../../lib/creqTemplates";
import { newId } from "../utils";

const DEFAULT_COLORS = () => [
  { id: newId(), hex: "#212025" },
  { id: newId(), hex: "#E85D3A" },
  { id: newId(), hex: "#FDFDF9" },
];

export default function BrandKitDrawer({ onClose, kits, onSaved, onDeleted, onApply }) {
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: "", logo_url: "", colors: DEFAULT_COLORS(), fonts: ["Inter"], palette_id: "midnight",
  });

  const save = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...form, colors: form.colors.map((c) => c.hex) };
      const { data } = await api.post("/brandkits", payload);
      toast.success(`Brand kit saved: ${data.name}`);
      onSaved(data);
      setCreating(false);
      setForm({ name: "", logo_url: "", colors: DEFAULT_COLORS(), fonts: ["Inter"], palette_id: "midnight" });
    } catch { toast.error("Save failed"); }
  };

  const del = async (bid) => {
    if (!confirm("Delete brand kit?")) return;
    await api.delete(`/brandkits/${bid}`);
    onDeleted(bid);
  };

  return (
    <div className="fixed inset-0 bg-ink/40 z-50 flex justify-end" onClick={onClose}>
      <div className="w-full max-w-md bg-white h-full overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-line px-5 py-4 flex items-center gap-3 z-10">
          <Sparkles size={16} />
          <div className="font-display font-bold">Brand kits</div>
          <button onClick={() => setCreating(!creating)} data-testid="brandkit-new" className="ml-auto btn-ghost text-xs"><Plus size={12} /> New</button>
        </div>

        {creating && (
          <form onSubmit={save} className="p-4 border-b border-line space-y-3 bg-neutral-50">
            <input required placeholder="Kit name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="brandkit-name" className="w-full border border-line rounded-full px-3 py-2 text-sm" />
            <input placeholder="Logo URL (paste image link)" value={form.logo_url} onChange={(e) => setForm({ ...form, logo_url: e.target.value })} data-testid="brandkit-logo-url" className="w-full border border-line rounded-full px-3 py-2 text-sm font-mono" />
            <div>
              <div className="ui-label mb-1">Brand colors</div>
              <div className="grid grid-cols-6 gap-1">
                {form.colors.map((c) => (
                  <input key={c.id} type="color" value={c.hex}
                    onChange={(e) => setForm({ ...form, colors: form.colors.map((x) => x.id === c.id ? { ...x, hex: e.target.value } : x) })}
                    className="w-full h-10 border border-line rounded" />
                ))}
                {form.colors.length < 8 && (
                  <button type="button"
                    onClick={() => setForm({ ...form, colors: [...form.colors, { id: newId(), hex: "#000000" }] })}
                    className="border border-dashed border-line rounded text-neutral-500 text-lg">+</button>
                )}
              </div>
            </div>
            <div>
              <div className="ui-label mb-1">Default palette</div>
              <select value={form.palette_id} onChange={(e) => setForm({ ...form, palette_id: e.target.value })} className="w-full border border-line rounded-full px-3 py-2 bg-white text-sm">
                {PALETTES.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <div className="ui-label mb-1">Primary font</div>
              <select value={form.fonts[0] || "Inter"} onChange={(e) => setForm({ ...form, fonts: [e.target.value] })} className="w-full border border-line rounded-full px-3 py-2 bg-white text-sm">
                {FONTS.map((f) => <option key={f.id} value={f.id}>{f.id}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setCreating(false)} className="btn-secondary text-sm">Cancel</button>
              <button type="submit" data-testid="brandkit-save" className="btn-primary text-sm">Save</button>
            </div>
          </form>
        )}

        <div className="p-4 space-y-3">
          {kits.length === 0 && !creating && <div className="text-sm text-neutral-500">No brand kits yet. Create one, then apply it to auto-brand every slide.</div>}
          {kits.map((k) => (
            <div key={k.id} className="bg-white border border-line rounded-2xl p-4">
              <div className="flex items-start gap-3">
                {k.logo_url ? (
                  <img src={k.logo_url} alt="" className="w-14 h-14 object-contain border border-line rounded-md bg-white" onError={(e) => { e.currentTarget.style.opacity = 0.3; }} />
                ) : (
                  <div className="w-14 h-14 border border-line rounded-md bg-neutral-100 flex items-center justify-center text-neutral-400 text-xs">no logo</div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{k.name}</div>
                  <div className="flex gap-1 mt-1">{(k.colors || []).slice(0, 8).map((c, i) => <span key={`${c}-${i}`} className="w-4 h-4 rounded-full border border-line" style={{ background: c }} />)}</div>
                  <div className="text-[11px] text-neutral-500 mt-1 font-mono">Palette: {PALETTES.find(p => p.id === k.palette_id)?.name || "—"} · Font: {(k.fonts || [])[0] || "—"}</div>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button onClick={() => onApply(k)} data-testid={`brandkit-apply-${k.id}`} className="btn-primary text-xs py-1.5">Apply to this deck</button>
                <button onClick={() => del(k.id)} data-testid={`brandkit-delete-${k.id}`} className="btn-ghost text-xs py-1.5 text-red-600"><Trash2 size={11} /> Delete</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
