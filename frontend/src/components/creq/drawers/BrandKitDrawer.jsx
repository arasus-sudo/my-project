import { useRef, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Sparkles, Pencil, Image as ImageIcon } from "lucide-react";
import { api } from "../../../lib/api";
import { PALETTES, FONTS } from "../../../lib/creqTemplates";
import { newId } from "../utils";

const DEFAULT_COLORS = () => [
  { id: newId(), hex: "#212025" },
  { id: newId(), hex: "#E85D3A" },
  { id: newId(), hex: "#FDFDF9" },
];

const EMPTY_FORM = () => ({
  id: null,
  name: "",
  logo_url: "",
  colors: DEFAULT_COLORS(),
  fonts: ["Inter"],
  palette_id: "midnight",
});

export default function BrandKitDrawer({ onClose, kits, onSaved, onUpdated, onDeleted, onApply }) {
  const [editing, setEditing] = useState(null); // null | form
  const logoFileRef = useRef(null);

  const startCreate = () => setEditing(EMPTY_FORM());
  const startEdit = (k) => {
    setEditing({
      id: k.id,
      name: k.name || "",
      logo_url: k.logo_url || "",
      colors: (k.colors || []).map((hex) => ({ id: newId(), hex })).concat(
        (k.colors || []).length < 3
          ? DEFAULT_COLORS().slice((k.colors || []).length)
          : []
      ),
      fonts: k.fonts && k.fonts.length ? k.fonts : ["Inter"],
      palette_id: k.palette_id || "midnight",
    });
  };
  const cancel = () => setEditing(null);

  const submit = async (e) => {
    e.preventDefault();
    const form = editing;
    const payload = {
      name: form.name.trim(),
      logo_url: form.logo_url || "",
      colors: form.colors.map((c) => c.hex),
      fonts: form.fonts,
      palette_id: form.palette_id,
    };
    try {
      if (form.id) {
        const { data } = await api.put(`/brandkits/${form.id}`, payload);
        toast.success(`Updated: ${data.name}`);
        onUpdated?.(data);
      } else {
        const { data } = await api.post("/brandkits", payload);
        toast.success(`Saved: ${data.name}`);
        onSaved?.(data);
      }
      setEditing(null);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Save failed");
    }
  };

  const del = async (bid) => {
    if (!confirm("Delete brand kit?")) return;
    await api.delete(`/brandkits/${bid}`);
    onDeleted?.(bid);
  };

  const onLogoFile = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) { toast.error("Please pick an image file"); return; }
    if (f.size > 3 * 1024 * 1024) { toast.error("Logo too large (max ~3 MB)"); return; }
    const reader = new FileReader();
    reader.onload = () => setEditing((cur) => cur ? { ...cur, logo_url: String(reader.result || "") } : cur);
    reader.readAsDataURL(f);
  };

  return (
    <div className="fixed inset-0 bg-ink/40 z-50 flex justify-end" onClick={onClose}>
      <div className="w-full max-w-md bg-white h-full overflow-y-auto" onClick={(e) => e.stopPropagation()} data-testid="brandkit-drawer">
        <div className="sticky top-0 bg-white border-b border-line px-5 py-4 flex items-center gap-3 z-10">
          <Sparkles size={16} />
          <div className="font-display font-bold">Brand kits</div>
          {!editing && (
            <button onClick={startCreate} data-testid="brandkit-new"
              className="ml-auto btn-ghost text-xs"><Plus size={12} /> New</button>
          )}
          {editing && (
            <button onClick={cancel} className="ml-auto btn-ghost text-xs">Back</button>
          )}
        </div>

        <input ref={logoFileRef} type="file" accept="image/*" className="hidden"
          onChange={onLogoFile} data-testid="brandkit-logo-file" />

        {editing ? (
          <form onSubmit={submit} className="p-4 space-y-4">
            <div className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">
              {editing.id ? "Editing brand kit" : "New brand kit"}
            </div>

            <label className="block">
              <span className="ui-label">Name</span>
              <input required placeholder="e.g. Innoira Primary"
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                data-testid="brandkit-name"
                className="mt-1 w-full border border-line rounded-full px-3 py-2 text-sm" />
            </label>

            <div>
              <div className="ui-label mb-1.5">Logo</div>
              <div className="flex items-start gap-3">
                <div className="w-20 h-20 border border-line rounded-lg overflow-hidden bg-neutral-50 flex items-center justify-center flex-shrink-0">
                  {editing.logo_url ? (
                    <img src={editing.logo_url} alt="" className="w-full h-full object-contain"
                      onError={(e) => { e.currentTarget.style.opacity = 0.3; }} />
                  ) : (
                    <ImageIcon size={20} className="text-neutral-400" />
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <button type="button"
                    onClick={() => logoFileRef.current?.click()}
                    data-testid="brandkit-logo-upload"
                    className="w-full py-2 border border-dashed border-line rounded-lg text-xs text-neutral-700 hover:border-ink hover:bg-neutral-50">
                    Upload logo (PNG, SVG, JPG)
                  </button>
                  <input placeholder="or paste logo URL"
                    value={editing.logo_url.startsWith("data:") ? "(uploaded logo)" : editing.logo_url}
                    onChange={(e) => setEditing({ ...editing, logo_url: e.target.value })}
                    disabled={editing.logo_url.startsWith("data:")}
                    data-testid="brandkit-logo-url"
                    className="w-full border border-line rounded-full px-3 py-1.5 text-xs font-mono disabled:bg-neutral-50 disabled:text-neutral-500" />
                  {editing.logo_url && (
                    <button type="button" onClick={() => setEditing({ ...editing, logo_url: "" })}
                      className="text-[10px] text-neutral-500 hover:text-red-600">
                      Remove logo
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div>
              <div className="ui-label mb-1.5">Brand colors</div>
              <div className="grid grid-cols-6 gap-1">
                {editing.colors.map((c) => (
                  <div key={c.id} className="relative">
                    <input type="color" value={c.hex}
                      onChange={(e) => setEditing({
                        ...editing,
                        colors: editing.colors.map((x) => x.id === c.id ? { ...x, hex: e.target.value } : x),
                      })}
                      className="w-full h-10 border border-line rounded" />
                    {editing.colors.length > 1 && (
                      <button type="button"
                        onClick={() => setEditing({ ...editing, colors: editing.colors.filter((x) => x.id !== c.id) })}
                        className="absolute -top-1 -right-1 w-4 h-4 bg-white border border-line rounded-full text-[9px] hover:border-red-600 hover:text-red-600">
                        ×
                      </button>
                    )}
                  </div>
                ))}
                {editing.colors.length < 8 && (
                  <button type="button"
                    onClick={() => setEditing({ ...editing, colors: [...editing.colors, { id: newId(), hex: "#000000" }] })}
                    className="border border-dashed border-line rounded text-neutral-500 text-lg">+</button>
                )}
              </div>
            </div>

            <label className="block">
              <span className="ui-label">Default palette</span>
              <select value={editing.palette_id}
                onChange={(e) => setEditing({ ...editing, palette_id: e.target.value })}
                className="mt-1 w-full border border-line rounded-full px-3 py-2 bg-white text-sm">
                {PALETTES.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>

            <label className="block">
              <span className="ui-label">Primary font</span>
              <select value={editing.fonts[0] || "Inter"}
                onChange={(e) => setEditing({ ...editing, fonts: [e.target.value] })}
                className="mt-1 w-full border border-line rounded-full px-3 py-2 bg-white text-sm">
                {FONTS.map((f) => <option key={f.id} value={f.id}>{f.id}</option>)}
              </select>
            </label>

            <div className="flex justify-end gap-2 pt-2 border-t border-line">
              <button type="button" onClick={cancel} className="btn-secondary text-sm">Cancel</button>
              <button type="submit" data-testid="brandkit-save" className="btn-primary text-sm">
                {editing.id ? "Save changes" : "Create kit"}
              </button>
            </div>
          </form>
        ) : (
          <div className="p-4 space-y-3">
            {kits.length === 0 && (
              <div className="text-sm text-neutral-500 py-6 text-center">
                No brand kits yet. Create one, then apply it to auto-brand every slide.
              </div>
            )}
            {kits.map((k) => (
              <div key={k.id} className="bg-white border border-line rounded-2xl p-4">
                <div className="flex items-start gap-3">
                  {k.logo_url ? (
                    <img src={k.logo_url} alt="" className="w-14 h-14 object-contain border border-line rounded-md bg-white"
                      onError={(e) => { e.currentTarget.style.opacity = 0.3; }} />
                  ) : (
                    <div className="w-14 h-14 border border-line rounded-md bg-neutral-100 flex items-center justify-center text-neutral-400 text-xs">no logo</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{k.name}</div>
                    <div className="flex gap-1 mt-1">
                      {(k.colors || []).slice(0, 8).map((c, i) => (
                        <span key={`${c}-${i}`} className="w-4 h-4 rounded-full border border-line" style={{ background: c }} />
                      ))}
                    </div>
                    <div className="text-[11px] text-neutral-500 mt-1 font-mono">
                      Palette: {PALETTES.find(p => p.id === k.palette_id)?.name || "—"} · Font: {(k.fonts || [])[0] || "—"}
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex gap-1.5">
                  <button onClick={() => onApply(k)} data-testid={`brandkit-apply-${k.id}`}
                    className="btn-primary text-xs py-1.5 flex-1 justify-center">Apply to deck</button>
                  <button onClick={() => startEdit(k)} data-testid={`brandkit-edit-${k.id}`}
                    className="btn-ghost text-xs py-1.5"><Pencil size={11} /> Edit</button>
                  <button onClick={() => del(k.id)} data-testid={`brandkit-delete-${k.id}`}
                    className="btn-ghost text-xs py-1.5 text-red-600"><Trash2 size={11} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
