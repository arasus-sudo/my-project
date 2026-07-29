import { useEffect, useState } from "react";
import { X, BarChart3, Loader2 } from "lucide-react";
import { api } from "../../../lib/api";

export default function AnalyticsPanel({ signatureId, clickTracking, onClose }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get(`/signatures/${signatureId}/click-analytics`).then((r) => setData(r.data)).catch(() => setData({ total_clicks: 0, by_url: [] }));
  }, [signatureId]);

  return (
    <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-card w-full max-w-md max-h-[70vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-line flex items-center justify-between">
          <div className="font-display font-semibold inline-flex items-center gap-2"><BarChart3 size={16} /> Click analytics</div>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={16} /></button>
        </div>
        <div className="overflow-y-auto p-4">
          {!clickTracking && (
            <p className="text-caption text-warning bg-warning/10 border border-warning/30 rounded-xl px-3 py-2 mb-3">
              Click tracking is off for this signature — enable it in the More menu to start collecting clicks.
            </p>
          )}
          {data === null ? (
            <div className="text-center py-8 text-ink-muted"><Loader2 size={16} className="animate-spin mx-auto" /></div>
          ) : (
            <>
              <div className="text-app-title font-display font-bold mb-3">{data.total_clicks}</div>
              {data.by_url.length === 0 ? (
                <p className="text-caption text-ink-muted">No clicks recorded yet.</p>
              ) : (
                <div className="divide-y divide-line">
                  {data.by_url.map((row) => (
                    <div key={row.url} className="flex items-center justify-between py-2 text-caption gap-2">
                      <span className="truncate">{row.url}</span>
                      <span className="font-mono shrink-0">{row.clicks}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
