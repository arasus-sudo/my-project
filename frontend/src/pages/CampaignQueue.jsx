import { useEffect, useState, useCallback } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { Clock, CheckCircle2, AlertCircle, RefreshCw, Send, Trash2, Search, ListChecks } from "../icons";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import Table, { TableFooter } from "../components/composites/Table";
import { EmptyState, EmptyFilteredState } from "../components/composites/EmptyState";
import Input from "../components/primitives/Input";
import Button from "../components/primitives/Button";
import StatusPill from "../components/primitives/StatusPill";

const STATUS_META = {
  pending: { icon: Clock, tone: "warning" },
  sending: { icon: RefreshCw, tone: "primary", spin: true },
  sent: { icon: CheckCircle2, tone: "success" },
  failed: { icon: AlertCircle, tone: "danger" },
  cancelled: { icon: AlertCircle, tone: "neutral" },
};

export default function CampaignQueue() {
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [selected, setSelected] = useState([]);
  const [deleting, setDeleting] = useState(false);
  const [selectN, setSelectN] = useState("");
  const perPage = 25;

  const load = useCallback(() => {
    const params = new URLSearchParams({ page: String(page), per_page: String(perPage) });
    if (search) params.set("search", search);
    api.get(`/queue?${params}`).then((r) => {
      setData(r.data);
      setSelected([]);
    });
  }, [page, search]);

  useEffect(() => { load(); }, [load]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / perPage)) : 1;

  const toggleSelect = (id) => {
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const selectAll = (checked) => {
    setSelected(checked && data ? data.rows.map((r) => r.id) : []);
  };

  const selectFirstN = async () => {
    const n = parseInt(selectN, 10);
    if (!n || n < 1 || !data) return;
    try {
      const params = {};
      if (search) params.search = search;
      const { data: allData } = await api.get("/queue/all-ids", { params });
      setSelected((allData.ids || []).slice(0, n));
    } catch {
      setSelected(data.rows.slice(0, n).map((r) => r.id));
    }
  };

  const deleteSelected = async () => {
    if (selected.length === 0) return;
    setDeleting(true);
    try {
      await api.post("/queue/delete", { ids: selected });
      toast.success(`Deleted ${selected.length} queue item(s)`);
      load();
    } catch {
      toast.error("Delete failed — check the server logs");
    }
    setDeleting(false);
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput);
  };

  const columns = [
    {
      key: "lead", label: "Lead",
      render: (r) => (
        <Link to={`/app/campaigns/${r.campaign_id}`}>
          <div style={{ fontWeight: 500, color: "var(--text-primary)" }}>{r.lead_name || r.lead_id?.slice(0, 8)}</div>
          {r.lead_email && <div className="tnum" style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{r.lead_email}</div>}
          {r.lead_company && <div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{r.lead_company}</div>}
        </Link>
      ),
    },
    { key: "campaign", label: "Campaign", render: (r) => <span style={{ color: "var(--text-secondary)" }}>{r.campaign_name || "—"}</span> },
    { key: "subject", label: "Subject", maxWidth: 200, render: (r) => r.subject || "—" },
    {
      key: "status", label: "Status",
      render: (r) => {
        const meta = STATUS_META[r.status] || STATUS_META.pending;
        return (
          <span className="inline-flex items-center gap-1.5">
            <meta.icon size={12} strokeWidth={1.5} aria-hidden="true" className={meta.spin ? "ds-spin" : undefined} style={{ color: `var(--color-${meta.tone === "neutral" ? "neutral-status" : meta.tone})` }} />
            <StatusPill status={r.status} tone={meta.tone} />
          </span>
        );
      },
    },
    {
      key: "scheduled", label: "Scheduled",
      render: (r) => <span className="tnum" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", fontSize: 11.5 }}>{r.send_at ? new Date(r.send_at).toLocaleString() : "—"}</span>,
    },
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader title="Send Queue" subtitle="Emails scheduled to go out, listed chronologically." />
      <div className="px-6 sm:px-8 py-6 space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <form onSubmit={handleSearch} className="flex items-center gap-2">
            <Input
              leadingIcon={Search} size="sm" value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by name, email, subject, campaign, or queue ID…"
              className="w-80"
            />
            <Button type="submit" variant="secondary" size="sm" icon={Search}>Search</Button>
            {search && <span className="tnum" style={{ fontSize: 11.5, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>Filtered: "{search}"</span>}
          </form>
          <div className="flex items-center gap-1.5 ml-auto">
            <Input size="sm" value={selectN} onChange={(e) => setSelectN(e.target.value.replace(/\D/g, ""))} placeholder="N" className="w-16" />
            <Button variant="tertiary" size="sm" icon={ListChecks} onClick={selectFirstN} isDisabled={!selectN || parseInt(selectN, 10) < 1}>
              Select {selectN || "N"}
            </Button>
          </div>
        </div>

        {!data ? (
          <div className="text-center py-12" style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Loading…</div>
        ) : data.rows.length === 0 ? (
          search ? (
            <EmptyFilteredState query={search} onClear={() => { setSearch(""); setSearchInput(""); setPage(1); }} />
          ) : (
            <EmptyState icon={Send} title="No queued emails" description="Emails appear here once a campaign is launched." />
          )
        ) : (
          <>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="tnum" style={{ fontSize: 11.5, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{data.total} queued</span>
                {selected.length > 0 && (
                  <Button variant="danger-subtle" size="xs" icon={Trash2} onClick={deleteSelected} isLoading={deleting}>
                    Delete {selected.length}
                  </Button>
                )}
              </div>
            </div>
            <Table
              columns={columns}
              rows={data.rows}
              rowKey={(r) => r.id}
              selectable
              selected={selected}
              onSelectRow={toggleSelect}
              onSelectAll={selectAll}
            />
            <TableFooter page={page} pageCount={totalPages} total={data.total} pageSize={perPage} onPageChange={setPage} />
          </>
        )}
      </div>
    </div>
  );
}
