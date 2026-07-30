import { useEffect, useState } from "react";
import { X, History, RotateCcw, Loader2 } from "lucide-react";
import { api } from "../../../lib/api";
import { toast } from "sonner";

export default function HistoryPanel({ signatureId, onClose, onRestore }) {
  const [versions, setVersions] = useState(null);
  const [restoring, setRestoring] = useState(null);

  useEffect(() => {
    api.get(`/signatures/${signatureId}/versions`).then((r) => setVersions(r.data)).catch(() => setVersions([]));
  }, [signatureId]);

  const restore = async (vid) => {
    setRestoring(vid);
    try {
      const { data } = await api.post(`/signatures/${signatureId}/versions/${vid}/restore`);
      onRestore(data);
      toast.success("Version restored — remember to review before it autosaves");
      onClose();
    } catch {
      toast.error("Couldn't restore that version");
    } finally {
      setRestoring(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-card w-full max-w-md max-h-[70vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-line flex items-center justify-between">
          <div className="font-display font-semibold inline-flex items-center gap-2"><History size={16} /> Version history</div>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={16} /></button>
        </div>
        <div className="overflow-y-auto p-4">
          {versions === null ? (
            <div className="text-center py-8 text-ink-muted"><Loader2 size={16} className="animate-spin mx-auto" /></div>
          ) : versions.length === 0 ? (
            <p className="text-caption text-ink-muted text-center py-6">
              No earlier versions yet — a snapshot is kept automatically every few minutes while you edit.
            </p>
          ) : (
            <div className="space-y-2">
              {versions.map((v) => (
                <div key={v.id} className="flex items-center justify-between border border-line rounded-xl px-3 py-2">
                  <span className="text-caption">{new Date(v.at).toLocaleString()}</span>
                  <button onClick={() => restore(v.id)} disabled={restoring === v.id} className="btn-secondary text-tiny px-2 py-1">
                    {restoring === v.id ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />} Restore
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
