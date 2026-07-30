import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { ChevronLeft, ChevronRight, Clock, CheckCircle, XCircle, Loader2, Send, Mail } from "lucide-react";
import { Link } from "react-router-dom";

const STATUS_META = {
  pending: { label: "Pending", icon: Clock, cls: "text-warning" },
  sending: { label: "Sending", icon: Loader2, cls: "text-accent" },
  sent: { label: "Sent", icon: CheckCircle, cls: "text-success" },
  failed: { label: "Failed", icon: XCircle, cls: "text-danger" },
  cancelled: { label: "Cancelled", icon: XCircle, cls: "text-ink-muted" },
};

export default function CampaignQueue() {
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const perPage = 20;

  const load = () => api.get(`/queue?page=${page}&per_page=${perPage}`).then((r) => setData(r.data));
  useEffect(() => { load(); }, [page]);

  const totalPages = data ? Math.ceil(data.total / perPage) : 0;

  return (
    <div className="animate-fade-in">
      <PageHeader title="Send Queue" subtitle="Emails scheduled to go out, listed chronologically." />
      <div className="px-6 sm:px-8 pb-6 space-y-4">
        {!data ? (
          <div className="text-center py-12 text-ink-muted text-tiny">Loading...</div>
        ) : data.rows.length === 0 ? (
          <div className="text-center py-12 text-ink-muted">
            <Send size={24} className="mx-auto mb-2 opacity-40" />
            <div className="text-tiny font-medium">No queued emails</div>
            <p className="text-tiny mt-1">Emails appear here once a campaign is launched.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div className="text-tiny text-ink-muted font-mono">{data.total} queued</div>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
                  className="btn-ghost text-[11px] px-1.5 py-0.5 disabled:opacity-30"><ChevronLeft size={12} /></button>
                <span className="text-[11px] font-mono text-ink-muted">{page}/{totalPages}</span>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                  className="btn-ghost text-[11px] px-1.5 py-0.5 disabled:opacity-30"><ChevronRight size={12} /></button>
              </div>
            </div>
            <div className="shadow-card rounded-lg bg-white overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-line text-[10.5px] font-mono text-ink-muted uppercase tracking-wider">
                    <th className="text-left px-3 py-2 font-normal">Lead</th>
                    <th className="text-left px-3 py-2 font-normal">Campaign</th>
                    <th className="text-left px-3 py-2 font-normal">Subject</th>
                    <th className="text-left px-3 py-2 font-normal">Status</th>
                    <th className="text-left px-3 py-2 font-normal">Scheduled</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => {
                    const meta = STATUS_META[r.status] || STATUS_META.pending;
                    const Icon = meta.icon;
                    return (
                      <tr key={r.id} className="border-b border-line hover:bg-surfacehover text-body">
                        <td className="px-3 py-2">
                          <Link to={`/app/campaigns/${r.campaign_id}`} className="hover:text-accent">
                            <span className="font-medium">{r.lead_name || r.lead_id?.slice(0, 8)}</span>
                            {r.lead_email && <div className="text-tiny text-ink-muted font-mono">{r.lead_email}</div>}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-ink-secondary">{r.campaign_name || "—"}</td>
                        <td className="px-3 py-2 text-ink-secondary max-w-[200px] truncate font-mono text-tiny">{r.subject || "—"}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center gap-1 text-tiny font-mono ${meta.cls}`}>
                            <Icon size={10} className={r.status === "sending" ? "animate-spin" : ""} /> {meta.label}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-tiny font-mono text-ink-muted">
                          {r.send_at ? new Date(r.send_at).toLocaleString() : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-tiny text-ink-muted font-mono">Page {page} of {totalPages}</div>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
                  className="btn-ghost text-[11px] px-1.5 py-0.5 disabled:opacity-30"><ChevronLeft size={12} /> Prev</button>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                  className="btn-ghost text-[11px] px-1.5 py-0.5 disabled:opacity-30">Next <ChevronRight size={12} /></button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
