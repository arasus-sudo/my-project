import { useRef, useState } from "react";
import { Upload, Loader2, X, Crop } from "lucide-react";
import { api } from "../../../lib/api";
import { toast } from "sonner";
import ImageCropModal from "../ImageCropModal";

export default function PhotoBlock({ data, onChange }) {
  const [uploading, setUploading] = useState(false);
  const [cropSrc, setCropSrc] = useState(null); // object URL of the file being cropped, or null
  const inputRef = useRef(null);
  const isLogoFit = data.fit === "contain";

  const pick = () => inputRef.current?.click();

  const onFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (isLogoFit) {
      uploadFile(file);
    } else {
      setCropSrc(URL.createObjectURL(file));
    }
  };

  const uploadFile = async (fileOrBlob) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", fileOrBlob, fileOrBlob.name || "logo.png");
      const { data: res } = await api.post("/upload-image", fd);
      onChange({ ...data, imageUrl: res.image_url });
    } catch {
      toast.error("Upload failed — check the file is a PNG/JPG/GIF/WebP under 5MB");
    } finally {
      setUploading(false);
    }
  };

  const onCropConfirm = async (blob) => {
    setCropSrc(null);
    await uploadFile(blob);
  };

  const editCrop = () => {
    if (data.imageUrl) setCropSrc(data.imageUrl);
  };

  return (
    <div className="flex items-center gap-4">
      <div
        onClick={isLogoFit ? pick : (data.imageUrl ? editCrop : pick)}
        className={`shrink-0 border border-dashed border-line bg-ash flex items-center justify-center cursor-pointer hover:border-ink/30 overflow-hidden relative ${isLogoFit ? "w-24 h-16 rounded-lg" : "w-16 h-16"}`}
        style={!isLogoFit ? { borderRadius: data.shape === "circle" ? "50%" : data.shape === "rounded" ? "12px" : "4px" } : undefined}
      >
        {uploading ? (
          <Loader2 size={16} className="animate-spin text-ink-muted" />
        ) : data.imageUrl ? (
          <img src={data.imageUrl} alt="" className={isLogoFit ? "max-w-full max-h-full object-contain" : "w-full h-full object-cover"} />
        ) : (
          <Upload size={16} className="text-ink-muted" />
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={onFile} />
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <button onClick={pick} className="btn-secondary text-caption" data-testid="sig-photo-upload">
            <Upload size={12} /> {data.imageUrl ? "Replace image" : "Upload photo or logo"}
          </button>
          {data.imageUrl && !isLogoFit && (
            <button onClick={editCrop} className="btn-secondary text-caption" data-testid="sig-photo-recrop">
              <Crop size={12} /> Adjust crop
            </button>
          )}
        </div>
        <label className="flex items-center gap-1.5 text-caption text-ink-muted">
          <input type="checkbox" checked={isLogoFit}
            onChange={(e) => onChange({ ...data, fit: e.target.checked ? "contain" : "cover" })} />
          Wide logo — show whole image, don't crop to a shape
        </label>
        {data.imageUrl && (
          <div className="flex items-center gap-3 flex-wrap">
            {!isLogoFit && (
              <label className="flex items-center gap-1.5 text-caption text-ink-muted">
                Shape
                <select value={data.shape || "circle"} onChange={(e) => onChange({ ...data, shape: e.target.value })}
                  className="border border-line rounded-lg px-2 py-1 text-caption">
                  <option value="circle">Circle</option>
                  <option value="rounded">Rounded</option>
                  <option value="square">Square</option>
                </select>
              </label>
            )}
            <label className="flex items-center gap-1.5 text-caption text-ink-muted">
              Size
              <select value={data.size || 80} onChange={(e) => onChange({ ...data, size: parseInt(e.target.value, 10) })}
                className="border border-line rounded-lg px-2 py-1 text-caption">
                <option value={56}>Small</option>
                <option value={80}>Medium</option>
                <option value={104}>Large</option>
                {isLogoFit && <option value={160}>X-Large</option>}
              </select>
            </label>
            <button onClick={() => onChange({ ...data, imageUrl: "" })} className="text-caption text-ink-muted hover:text-danger inline-flex items-center gap-1">
              <X size={12} /> Remove
            </button>
          </div>
        )}
      </div>
      {cropSrc && (
        <ImageCropModal
          imageSrc={cropSrc}
          shape={data.shape || "circle"}
          onCancel={() => setCropSrc(null)}
          onConfirm={onCropConfirm}
        />
      )}
    </div>
  );
}
