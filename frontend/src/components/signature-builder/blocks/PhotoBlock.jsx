import { useRef, useState } from "react";
import { Upload, Loader2, X } from "lucide-react";
import { api } from "../../../lib/api";
import { toast } from "sonner";

export default function PhotoBlock({ data, onChange }) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef(null);

  const pick = () => inputRef.current?.click();

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data: res } = await api.post("/upload-image", fd);
      onChange({ ...data, imageUrl: res.image_url });
    } catch {
      toast.error("Upload failed — check the file is a PNG/JPG/GIF/WebP under 5MB");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex items-center gap-4">
      <div
        onClick={pick}
        className="w-16 h-16 shrink-0 rounded-xl border border-dashed border-line bg-ash flex items-center justify-center cursor-pointer hover:border-ink/30 overflow-hidden relative"
      >
        {uploading ? (
          <Loader2 size={16} className="animate-spin text-ink-muted" />
        ) : data.imageUrl ? (
          <img src={data.imageUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <Upload size={16} className="text-ink-muted" />
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={onFile} />
      <div className="flex-1 space-y-2">
        <button onClick={pick} className="btn-secondary text-caption" data-testid="sig-photo-upload">
          <Upload size={12} /> {data.imageUrl ? "Replace image" : "Upload photo or logo"}
        </button>
        {data.imageUrl && (
          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-1.5 text-caption text-ink-muted">
              Shape
              <select value={data.shape || "circle"} onChange={(e) => onChange({ ...data, shape: e.target.value })}
                className="border border-line rounded-lg px-2 py-1 text-caption">
                <option value="circle">Circle</option>
                <option value="rounded">Rounded</option>
                <option value="square">Square</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-caption text-ink-muted">
              Size
              <select value={data.size || 80} onChange={(e) => onChange({ ...data, size: parseInt(e.target.value, 10) })}
                className="border border-line rounded-lg px-2 py-1 text-caption">
                <option value={56}>Small</option>
                <option value={80}>Medium</option>
                <option value={104}>Large</option>
              </select>
            </label>
            <button onClick={() => onChange({ ...data, imageUrl: "" })} className="text-caption text-ink-muted hover:text-danger inline-flex items-center gap-1">
              <X size={12} /> Remove
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
