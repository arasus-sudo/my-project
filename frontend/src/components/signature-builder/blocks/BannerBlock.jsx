import { useRef, useState } from "react";
import { Upload, Loader2, Trash2, Plus, CalendarClock } from "lucide-react";
import { api } from "../../../lib/api";
import { toast } from "sonner";
import { activeBannerVariant } from "../renderHtml";

function VariantRow({ item, onChange, onRemove }) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef(null);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/upload-image", fd);
      onChange({ ...item, imageUrl: data.image_url });
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const isDefault = !item.startDate && !item.endDate;

  return (
    <div className="border border-line rounded-xl p-3 space-y-2">
      <div className="flex items-center gap-2">
        <div onClick={() => inputRef.current?.click()}
          className="w-10 h-10 shrink-0 rounded-lg border border-dashed border-line bg-ash flex items-center justify-center cursor-pointer overflow-hidden">
          {uploading ? <Loader2 size={13} className="animate-spin" /> : item.imageUrl ? (
            <img src={item.imageUrl} alt="" className="w-full h-full object-cover" />
          ) : <Upload size={13} className="text-ink-muted" />}
        </div>
        <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={onFile} />
        <input value={item.link || ""} onChange={(e) => onChange({ ...item, link: e.target.value })}
          placeholder="Banner link (optional)" className="flex-1 border border-line rounded-lg px-2 py-1.5 text-caption" />
        <button onClick={onRemove} className="p-1 text-ink-muted hover:text-danger shrink-0"><Trash2 size={12} /></button>
      </div>
      <div className="flex items-center gap-2 text-caption">
        <CalendarClock size={12} className="text-ink-muted shrink-0" />
        <input type="date" value={item.startDate || ""} onChange={(e) => onChange({ ...item, startDate: e.target.value })}
          className="border border-line rounded-lg px-2 py-1 text-tiny" />
        <span className="text-ink-muted">to</span>
        <input type="date" value={item.endDate || ""} onChange={(e) => onChange({ ...item, endDate: e.target.value })}
          className="border border-line rounded-lg px-2 py-1 text-tiny" />
        {isDefault && <span className="text-tiny text-ink-muted">(default — shown when no dated variant matches)</span>}
      </div>
    </div>
  );
}

export default function BannerBlock({ data, onChange }) {
  const items = data.items || [];
  const setItems = (next) => onChange({ ...data, items: next });
  const addItem = () => setItems([...items, { id: `bn_${Date.now()}`, imageUrl: "", link: "", startDate: "", endDate: "" }]);
  const activeId = activeBannerVariant(items)?.id;

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.id} className={activeId === item.id ? "ring-1 ring-accent/40 rounded-xl" : ""}>
          <VariantRow item={item}
            onChange={(next) => setItems(items.map((i) => (i.id === item.id ? next : i)))}
            onRemove={() => setItems(items.filter((i) => i.id !== item.id))} />
        </div>
      ))}
      <button onClick={addItem} className="btn-secondary text-caption">
        <Plus size={12} /> Add banner variant
      </button>
      {items.length > 0 && (
        <p className="text-tiny text-ink-muted">
          {activeId ? "Highlighted variant is active today." : "No variant is active today — add a default (no dates) as a fallback."}
        </p>
      )}
    </div>
  );
}
