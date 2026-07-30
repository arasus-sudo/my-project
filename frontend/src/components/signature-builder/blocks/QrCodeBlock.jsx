import { useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { Upload, Loader2, X } from "lucide-react";
import { api } from "../../../lib/api";
import { toast } from "sonner";

export default function QrCodeBlock({ data, onChange }) {
  const canvasWrapRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const value = data.value || "";

  const attach = async () => {
    const canvas = canvasWrapRef.current?.querySelector("canvas");
    if (!canvas) return;
    setUploading(true);
    try {
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      const fd = new FormData();
      fd.append("file", blob, "qr-code.png");
      const { data: res } = await api.post("/upload-image", fd);
      onChange({ ...data, imageUrl: res.image_url });
      toast.success("QR code attached");
    } catch {
      toast.error("Couldn't generate the QR code image");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <input
        value={value}
        onChange={(e) => onChange({ ...data, value: e.target.value, imageUrl: "" })}
        placeholder="URL, vCard text, or Wi-Fi/booking link…"
        className="w-full border border-line rounded-lg px-3 py-2 text-input"
      />
      {value && (
        <div className="flex items-center gap-3">
          <div ref={canvasWrapRef} className="border border-line rounded-lg p-2 bg-white shrink-0">
            <QRCodeCanvas value={value} size={80} />
          </div>
          <div className="space-y-1.5">
            <button onClick={attach} disabled={uploading} className="btn-secondary text-caption">
              {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
              {data.imageUrl ? "Re-attach to signature" : "Attach to signature"}
            </button>
            {data.imageUrl && (
              <div className="flex items-center gap-1 text-tiny text-success">
                Attached
                <button onClick={() => onChange({ ...data, imageUrl: "" })} className="text-ink-muted hover:text-danger ml-1">
                  <X size={11} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
