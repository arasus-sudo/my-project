import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { X, UserX, Info } from "lucide-react";

const STATUS_COLOR = {
  confirmed: "text-green-700 border-green-700",
  cancelled: "text-neutral-500 border-neutral-300",
  no_show: "text-red-700 border-red-500",
  completed: "text-neutral-500 border-line",
};

export default function Bookings() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);

  const load = () => api.get("/schedule-eq/bookings").then((r) => { setItems(r.data); setLoading(false); });
  useEffect(() => { load(); }, []);

  const cancel = async (id) => {
    await api.post(`/schedule-eq/bookings/${id}/cancel`);
    toast.success("Cancelled");
    setDetail(null); load();
  };
  const markNoShow = async (id) => {
    await api.post(`/schedule-eq/bookings/${id}/mark-no-show`);
    toast.success("Marked as no-show");
    setDetail(null); load();
  };

  return (
    <div>
      <PageHeader title="Bookings" subtitle="Every meeting booked through Schedule EQ." />
      <div className="p-6">
        {loading ? <div className="text-neutral-500 text-sm">Loading…</div> : items.length === 0 ? (
          <div className="card-flat p-10 text-center text-sm text-neutral-500">No bookings yet.</div>
        ) : (
          <div className="border border-line bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-neutral-500">
                  <th className="ui-label text-left p-3">Guest</th>
                  <th className="ui-label text-left p-3">Event type</th>
                  <th className="ui-label text-left p-3">When</th>
                  <th className="ui-label text-left p-3">Status</th>
                  <th className="ui-label text-right p-3">No-show risk</th>
                </tr>
              </thead>
              <tbody>
                {items.map((b) => (
                  <tr key={b.id} onClick={() => setDetail(b)} data-testid={`booking-row-${b.id}`}
                    className="border-b border-line hover:bg-surfacehover cursor-pointer">
                    <td className="p-3 font-medium">{b.guest_name}</td>
                    <td className="p-3 text-neutral-600">{b.event_type?.name}</td>
                    <td className="p-3 text-xs text-neutral-500">{(b.start_at || "").slice(0, 16).replace("T", " ")}</td>
                    <td className="p-3"><span className={`ui-label inline-block px-2 py-0.5 border ${STATUS_COLOR[b.status] || STATUS_COLOR.confirmed}`}>{b.status}</span></td>
                    <td className="p-3 text-right font-mono text-xs">
                      {b.no_show_risk_score != null ? `${b.no_show_risk_score}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detail && (
        <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50" onClick={(e) => e.target === e.currentTarget && setDetail(null)}>
          <div className="bg-white border border-line p-6 rounded-sm w-full max-w-md space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-display font-bold text-xl">{detail.guest_name}</div>
                <div className="text-xs text-neutral-500 font-mono">{detail.guest_email}</div>
              </div>
              <button onClick={() => setDetail(null)} className="text-neutral-400 hover:text-ink"><X size={18} /></button>
            </div>
            <div className="text-sm text-neutral-600">{detail.event_type?.name} · {(detail.start_at || "").slice(0, 16).replace("T", " ")}</div>
            {detail.meet_link && <a href={detail.meet_link} target="_blank" rel="noreferrer" className="text-sm text-sanguine hover:underline block">Join video call</a>}
            {detail.prep_brief && (
              <div className="bg-surfacehover p-3 rounded-sm text-sm flex gap-2">
                <Info size={14} className="shrink-0 mt-0.5 text-neutral-500" />
                <span>{detail.prep_brief}</span>
              </div>
            )}
            {detail.status === "confirmed" && (
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => markNoShow(detail.id)} data-testid="mark-no-show-btn" className="btn-secondary text-xs"><UserX size={12} /> Mark no-show</button>
                <button onClick={() => cancel(detail.id)} data-testid="cancel-booking-btn" className="btn-secondary text-xs text-red-600">Cancel</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
