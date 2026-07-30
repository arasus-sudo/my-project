import { useEffect, useState, useCallback } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { ChevronLeft, ChevronRight, Clock, CheckCircle, XCircle, Loader2, Send, Trash2, Search, X } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

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
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [deleting, setDeleting] = useState(false);
  const perPage = 20;

  const load = useCallback(() => {
    const params = new URLSearchParams({ page: String(page), per_page: String(perPage) });
    if (search) params.set("search", search);
    api.get(`/queue?${params}`).then((r) => {
      setData(r.data);
      setSelected(new Set());
    });
  }, [page, search]);

  useEffect(() => { load(); }, [load]);

  const totalPages = data ? Math.ceil(data.total / perPage) : 0;

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (!data) return;
    if (selected.size === data.rows.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(data.rows.map((r) => r.id)));
    }
  };

  const deleteSelected = async () => {
    if (selected.size === 0) return;
    setDeleting(true);
    try {
      await api.post("/queue/delete", { ids: Array.from(selected) });
      toast.success(`Deleted ${selected.size} queue item(s)`);
      load();
    } catch { toast.error("Delete failed"); }
    setDeleting(false);
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput);
  };

  return (
    <div className="animate-fade-in">
      <PageHeader title="Send Queue" subtitle="Emails scheduled to go out, listed chronologically." />
      <div className="px-6 sm:px-8 pb-6 space-y-4">
        <form onSubmit={handleSearch} className="flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by name, email, subject, campaign, or queue ID..."
              className="inp pl-7 text-tiny w-full" />
            {searchInput && (
              <button type="button" onClick={() => { setSearchInput(""); setSearch(""); setPage(1); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink">
                <X size={12} />
              </button>
            )}
          </div>
          <button type="submit" className="btn-secondary text-[11px]"><Search size={11} /> Search</button>
          {search && <span className="text-tiny text-ink-muted font-mono">Filtered: "{search}"</span>}
        </form>

        {!data ? (
          <div className="text-center py-12 text-ink-muted text-tiny">Loading...</div>
        ) : data.rows.length === 0 ? (
          <div className="text-center py-12 text-ink-muted">
            <Send size={24} className="mx-auto mb-2 opacity-40" />
            <div className="text-tiny font-medium">{search ? "No matching queued emails" : "No queued emails"}</div>
            <p className="text-tiny mt-1">{search ? "Try a different search term." : "Emails appear here once a campaign is launched."}</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <div className="text-tiny text-ink-muted font-mono">{data.total} queued</div>
                {selected.size > 0 && (
                  <button onClick={deleteSelected} disabled={deleting}
                    className="btn-ghost text-[11px] text-danger flex items-center gap-1">
                    {deleting ? <Loader2 size={10} className="animate-spin" /> : <Trash2 size={10} />}
                    Delete {selected.size}
                  </button>
                )}
              </div>
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
                    <th className="px-3 py-2 w-10">
                      <input type="checkbox" checked={data.rows.length > 0 && selected.size === data.rows.length}
                        onChange={selectAll} title="Select all on this page" />
                    </th>
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
                      <tr key={r.id} className={`border-b border-line text-body ${selected.has(r.id) ? "bg-accent-soft/30" : "hover:bg-surfacehover"}`}>
                        <td className="px-3 py-2">
                          <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)} />
                        </td>
                        <td className="px-3 py-2">
                          <Link to={`/app/campaigns/${r.campaign_id}`} className="hover:text-accent">
                            <span className="font-medium">{r.lead_name || r.lead_id?.slice(0, 8)}</span>
                            {r.lead_email && <div className="text-tiny text-ink-muted font-mono">{r.lead_email}</div>}
                            {r.lead_company && <div className="text-[10px] text-ink-muted">{r.lead_company}</div>}
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
