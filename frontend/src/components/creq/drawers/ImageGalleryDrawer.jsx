import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Loader2, Image, Trash2 } from "lucide-react";
import { api } from "../../../lib/api";

export default function ImageGalleryDrawer({ onClose, onAddAsElement, onAddAsBackground }) {
  const [images, setImages] = useState([]);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/carousel/images");
        setImages(Array.isArray(data) ? data : []);
      } catch {
        toast.error("Failed to load images");
      } finally {
        setBusy(false);
      }
    })();
  }, []);

  const del = async (imageId) => {
    try {
      await api.delete(`/carousel/image/${imageId}`);
      setImages((prev) => prev.filter((img) => img.id !== imageId));
      toast.success("Deleted");
    } catch {
      toast.error("Delete failed");
    }
  };

  return (
    <div className="fixed inset-0 bg-ink/40 z-50 flex justify-end" onClick={onClose}>
      <div className="w-full max-w-md bg-white h-full overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-line px-5 py-4 flex items-center gap-3 z-10">
          <Image size={16} />
          <div className="font-display font-semibold text-subheading">Generated images</div>
          <button onClick={onClose} className="ml-auto btn-ghost text-xs">Close</button>
        </div>

        <div className="p-4">
          {busy ? (
            <div className="flex items-center justify-center py-16"><Loader2 size={20} className="animate-spin text-ink-muted" /></div>
          ) : images.length === 0 ? (
            <div className="text-center py-16 text-ink-muted text-body">No images yet — generate one from the Generate image panel.</div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {images.map((img) => (
                <div key={img.id} className="group relative rounded-lg overflow-hidden border border-line bg-neutral-100">
                  <img src={img.image_url} alt="" className="w-full aspect-[4/5] object-cover" loading="lazy" />
                  <div className="absolute inset-0 bg-ink/0 group-hover:bg-ink/30 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                    <button onClick={() => onAddAsElement(img.image_url)} title="Add as element"
                      className="bg-white text-ink rounded-full px-3 py-1 text-caption font-medium hover:bg-neutral-100">Add element</button>
                    <button onClick={() => onAddAsBackground(img.image_url)} title="Set as background"
                      className="bg-white text-ink rounded-full px-3 py-1 text-caption font-medium hover:bg-neutral-100">Background</button>
                  </div>
                  <button onClick={() => del(img.id)} title="Delete"
                    className="absolute top-1.5 right-1.5 bg-white/80 hover:bg-danger hover:text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Trash2 size={12} />
                  </button>
                  <div className="px-2 py-1 text-tiny text-ink-muted truncate">{img.prompt}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}