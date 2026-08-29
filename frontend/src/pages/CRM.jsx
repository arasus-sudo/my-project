import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import {
  Users, ListChecks, Kanban, BarChart3, Plus, Target, Activity, Phone, Mail,
  CalendarClock, FileText, MessageSquare, ArrowRight, Share2, Search,
  AlertTriangle, ChevronDown, ChevronRight, Building2, Trash2, RotateCcw, Copy,
  Loader2, ListChecks as ListOrdered, CheckCircle2,
} from "../icons";
import { SkeletonKpiGrid, SkeletonListRows } from "../components/ui/loading-states";
import MetricCard from "../components/composites/MetricCard";
import Card from "../components/composites/Card";
import { EmptyState } from "../components/composites/EmptyState";
import Table, { TableFooter } from "../components/composites/Table";
import IconSquare from "../components/primitives/IconSquare";
import Button from "../components/primitives/Button";
import Input from "../components/primitives/Input";

const RECYCLE_TYPE_LABEL = { lead: "Lead", company: "Company", list: "Lead list", company_list: "Company list" };

const QUARANTINE_REASON_LABEL = {
  invalid_syntax: "Invalid email — fix it on the lead",
  on_suppression_list: "On suppression list",
  do_not_contact: "Marked do-not-contact",
};

export default function CRM() {
  const nav = useNavigate();
  const [stats, setStats] = useState(null);
  const [recentActivity, setRecentActivity] = useState([]);
  const [lists, setLists] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [quarantine, setQuarantine] = useState([]);
  const [quarantineOpen, setQuarantineOpen] = useState(false);
  const [recycleBin, setRecycleBin] = useState({ rows: [], total: 0, page: 1 });
  const [recycleBinOpen, setRecycleBinOpen] = useState(false);
  const [recyclePage, setRecyclePage] = useState(1);
  const [recycleSelected, setRecycleSelected] = useState(new Set());
  const [recycleSelectN, setRecycleSelectN] = useState("");
  const [purging, setPurging] = useState(false);
  const [duplicates, setDuplicates] = useState([]);
  const [duplicatesOpen, setDuplicatesOpen] = useState(true);
  const [dedupeLoading, setDedupeLoading] = useState(false);
  const [dedupeResult, setDedupeResult] = useState(null);
  const [dedupeKeepFirst, setDedupeKeepFirst] = useState(true);

  const load = async () => {
    const [leadsRes, dealsRes, listsRes, activityRes, tasksRes, quarantineRes, companiesRes, recycleBinRes, duplicatesRes] = await Promise.all([
      api.get("/leads?page_size=1").catch(() => ({ data: { total: 0 } })),
      api.get("/deals").catch(() => ({ data: [] })),
      api.get("/crm/lists").catch(() => ({ data: [] })),
      api.get("/activities").catch(() => ({ data: [] })),
      api.get("/crm/tasks", { params: { status: "open" } }).catch(() => ({ data: [] })),
      api.get("/quarantine").catch(() => ({ data: [] })),
      api.get("/companies?page_size=1").catch(() => ({ data: { total: 0 } })),
      api.get("/crm/recycle-bin", { params: { page: recyclePage, per_page: 25 } }).catch(() => ({ data: { rows: [], total: 0 } })),
      api.get("/crm/duplicates").catch(() => ({ data: [] })),
    ]);
    const deals = dealsRes.data;
    setLists(listsRes.data);
    setRecentActivity((activityRes.data || []).slice(0, 10));
    setTasks((tasksRes.data || []).slice(0, 8));
    setQuarantine(quarantineRes.data || []);
    setRecycleBin(recycleBinRes.data || { rows: [], total: 0, page: 1 });
    setRecycleSelected(new Set());
    setDuplicates(duplicatesRes.data || []);
    setStats({
      totalLeads: leadsRes?.data?.total || 0,
      totalDeals: deals.length,
      pipelineValue: deals.reduce((s, d) => s + (d.value || 0), 0),
      dealsWon: deals.filter((d) => d.stage === "won").length,
      totalCompanies: companiesRes?.data?.total || 0,
    });
  };

  useEffect(() => { load(); }, [recyclePage]);

  const dismissQuarantine = async (qid) => {
    try {
      await api.delete(`/quarantine/${qid}`);
      setQuarantine((q) => q.filter((x) => x.id !== qid));
    } catch (err) { toast.error(err?.response?.data?.detail || "Failed"); }
  };

  const unsuppress = async (email, qid) => {
    try {
      await api.delete(`/suppressions/${encodeURIComponent(email)}`);
      toast.success(`Un-suppressed ${email}`);
      dismissQuarantine(qid);
    } catch (err) { toast.error(err?.response?.data?.detail || "Failed"); }
  };

  const restoreRecycled = async (item) => {
    try {
      await api.post(`/crm/recycle-bin/${item.type}/${item.id}/restore`);
      toast.success(`Restored ${item.name || RECYCLE_TYPE_LABEL[item.type]}`);
      load();
    } catch (err) { toast.error(err?.response?.data?.detail || "Restore failed"); }
  };

  const purgeRecycled = async (item) => {
    try {
      await api.delete(`/crm/recycle-bin/${item.type}/${item.id}`);
      toast.success("Deleted permanently");
      load();
    } catch (err) { toast.error(err?.response?.data?.detail || "Failed"); }
  };

  const purgeSelected = async () => {
    if (recycleSelected.size === 0) return;
    setPurging(true);
    try {
      const items = Array.from(recycleSelected).map((key) => {
        const [type, id] = key.split("::");
        return { type, id };
      });
      await api.post("/crm/recycle-bin/purge-batch", { items });
      toast.success(`Deleted ${recycleSelected.size} item(s) permanently`);
      load();
    } catch { toast.error("Purge failed"); }
    setPurging(false);
  };

  const toggleRecycleSelect = (key) => {
    setRecycleSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const selectAllRecycle = (checked) => {
    setRecycleSelected(checked ? new Set((recycleBin.rows || []).map((r) => `${r.type}::${r.id}`)) : new Set());
  };

  const selectFirstNRecycle = async () => {
    const n = parseInt(recycleSelectN, 10);
    if (!n || n < 1) return;
    try {
      const { data } = await api.get("/crm/recycle-bin/all-ids");
      setRecycleSelected(new Set(data.ids.slice(0, n)));
    } catch {
      const rows = recycleBin.rows || [];
      setRecycleSelected(new Set(rows.slice(0, n).map((r) => `${r.type}::${r.id}`)));
    }
  };

  const mergeDuplicate = async (candidate, survivorId) => {
    try {
      await api.post(`/crm/duplicates/${candidate.id}/merge`, { survivor_id: survivorId });
      toast.success("Merged");
      setDuplicates((d) => d.filter((x) => x.id !== candidate.id));
    } catch (err) { toast.error(err?.response?.data?.detail || "Merge failed"); }
  };

  const dismissDuplicate = async (candidateId) => {
    try {
      await api.post(`/crm/duplicates/${candidateId}/dismiss`);
      setDuplicates((d) => d.filter((x) => x.id !== candidateId));
    } catch (err) { toast.error(err?.response?.data?.detail || "Failed"); }
  };

  const deduplicateByEmail = async () => {
    setDedupeLoading(true);
    setDedupeResult(null);
    try {
      const { data } = await api.post("/crm/deduplicate-by-email", { keep_first: dedupeKeepFirst });
      setDedupeResult(data);
      if (data.merged > 0) {
        toast.success(`Merged ${data.merged} duplicate leads across ${data.groups_found} email groups`);
        load(); // Refresh all data
      } else {
        toast.info(data.message || "No duplicate emails found");
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Deduplication failed");
    } finally {
      setDedupeLoading(false);
    }
  };

  const ACTIVITY_ICON = {
    call: Phone, email: Mail, meeting: CalendarClock, booking: CalendarClock,
    proposal: FileText, note: MessageSquare, whatsapp: MessageSquare,
    post: Share2, lead: Users, research: Search, transfer: Phone,
  };
  const ACTIVITY_TONE = {
    call: "primary", email: "intel", meeting: "success",
    booking: "success", proposal: "warning", note: "neutral",
    whatsapp: "success", post: "intel", lead: "primary",
    research: "intel", transfer: "warning",
  };

  if (!stats) {
    return (
      <div>
        <PageHeader title="CRM" subtitle="Shared lead repository, lists, and activity timeline — accessible by every agent." />
        <div className="px-6 sm:px-8 py-6 space-y-8">
          <SkeletonKpiGrid count={4} />
          <SkeletonListRows rows={4} />
        </div>
      </div>
    );
  }

  const recycleColumns = [
    { key: "name", label: "Name", render: (item) => <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>{item.name || "(untitled)"}</span> },
    { key: "type", label: "Type", render: (item) => <span style={{ color: "var(--text-tertiary)" }}>{RECYCLE_TYPE_LABEL[item.type] || item.type}</span> },
    {
      key: "deleted_at", label: "Deleted",
      render: (item) => <span className="tnum" style={{ fontSize: 11.5, fontFamily: "var(--font-mono)", color: "var(--text-tertiary)" }}>{item.deleted_at ? new Date(item.deleted_at).toLocaleString() : "—"}</span>,
    },
    {
      key: "actions", label: "Actions", align: "right",
      render: (item) => (
        <div className="flex items-center gap-2 justify-end">
          <Button variant="secondary" size="xs" icon={RotateCcw} onClick={() => restoreRecycled(item)}>Restore</Button>
          <Button variant="ghost" size="xs" icon={Trash2} onClick={() => purgeRecycled(item)}>Delete permanently</Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="CRM"
        subtitle="Shared lead repository, lists, and activity timeline — accessible by every agent."
        right={
          <div className="flex items-center gap-2">
            <Button variant="secondary" icon={Users} onClick={() => nav("/app/crm/leads")}>Leads</Button>
            <Button variant="secondary" icon={ListChecks} onClick={() => nav("/app/crm/lists")}>Lists</Button>
            <Button variant="secondary" icon={Kanban} onClick={() => nav("/app/crm/pipeline")}>Pipeline</Button>
          </div>
        }
      />
      <div className="animate-fade-in px-6 sm:px-8 py-6 space-y-8">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <MetricCard label="Total leads" value={stats?.totalLeads} icon={Users} tone="primary" />
          <MetricCard label="Companies" value={stats?.totalCompanies} icon={Building2} tone="primary" />
          <MetricCard label="Deals" value={stats?.totalDeals} icon={Target} tone="primary" />
          <MetricCard label="Pipeline value" value={`$${(stats.pipelineValue || 0).toLocaleString()}`} icon={BarChart3} tone="success" />
          <MetricCard label="Deals won" value={stats?.dealsWon} icon={Activity} tone="warning" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Lead Lists */}
          <div className="lg:col-span-1">
            <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
              <h2 style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Lead lists</h2>
              <button onClick={() => nav("/app/crm/lists")} className="inline-flex items-center gap-1" style={{ fontSize: 12, color: "var(--text-link)" }}>
                <Plus size={12} strokeWidth={1.5} aria-hidden="true" /> New
              </button>
            </div>
            <div className="space-y-2">
              {lists.length === 0 && (
                <Card padding="compact"><span style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>No lead lists yet. Create one to organize leads for any agent.</span></Card>
              )}
              {lists.map((l) => (
                <Link key={l.id} to="/app/crm/lists">
                  <Card padding="compact" className="flex items-center justify-between transition-shadow">
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 500, color: "var(--text-primary)" }}>{l.name}</div>
                      <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{l.lead_ids?.length || 0} leads</div>
                    </div>
                    <ArrowRight size={14} strokeWidth={1.5} aria-hidden="true" style={{ color: "var(--text-tertiary)" }} />
                  </Card>
                </Link>
              ))}
            </div>
          </div>

          {/* Recent Activity */}
          <div className="lg:col-span-2">
            <h2 style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 12 }}>Recent activity</h2>
            <div className="space-y-1.5">
              {recentActivity.length === 0 && (
                <Card padding="compact"><span style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>No activity yet. Activities from Voice EQ calls, Pitch EQ emails, and other agents appear here.</span></Card>
              )}
              {recentActivity.map((a) => {
                const typeKey = Object.keys(ACTIVITY_ICON).find((k) => a.type.startsWith(k)) || "note";
                const Icon = ACTIVITY_ICON[typeKey] || Activity;
                const tone = ACTIVITY_TONE[typeKey] || "neutral";
                return (
                  <Card key={a.id} padding="compact" className="flex items-start gap-3">
                    <IconSquare icon={Icon} tone={tone} size={28} />
                    <div className="flex-1 min-w-0">
                      <div style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>{a.summary}</div>
                      <div className="tnum" style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", marginTop: 2 }}>
                        {a.agent ? `${a.agent.toUpperCase()} · ` : ""}{a.at ? new Date(a.at).toLocaleString() : ""}
                      </div>
                    </div>
                    {a.lead?.id && (
                      <Link to={`/app/crm/leads/${a.lead.id}`} className="tnum shrink-0" style={{ fontSize: 11, color: "var(--text-link)", fontFamily: "var(--font-mono)" }}>
                        {a.lead.first_name || "View"}
                      </Link>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>
        </div>

        {/* Open tasks */}
        <div>
          <h2 className="flex items-center gap-1.5" style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 12 }}>
            <ListChecks size={14} strokeWidth={1.5} aria-hidden="true" /> Open tasks
          </h2>
          {tasks.length === 0 ? (
            <Card padding="compact"><span style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>Nothing due — add a task from any lead's detail page.</span></Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {tasks.map((t) => {
                const overdue = t.due_at && new Date(t.due_at) < new Date();
                return (
                  <Link key={t.id} to={t.lead ? `/app/crm/leads/${t.lead.id}` : "/app/crm/leads"}>
                    <Card padding="compact" className="transition-shadow">
                      <div className="truncate" style={{ fontSize: 13.5, fontWeight: 500, color: "var(--text-primary)" }}>{t.title}</div>
                      <div className="truncate" style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 2 }}>
                        {t.lead ? `${t.lead.first_name} ${t.lead.last_name || ""}`.trim() : "—"}
                      </div>
                      {t.due_at && (
                        <div className="tnum" style={{ fontSize: 11, fontFamily: "var(--font-mono)", marginTop: 6, color: overdue ? "var(--color-danger)" : "var(--text-tertiary)" }}>
                          Due {new Date(t.due_at).toLocaleDateString()}
                        </div>
                      )}
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Possible duplicates */}
        <div>
          <button onClick={() => setDuplicatesOpen((o) => !o)} className="flex items-center gap-1.5 w-full"
            style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 12 }}>
            <Copy size={14} strokeWidth={1.5} aria-hidden="true" /> Possible duplicates ({duplicates.length})
            {duplicatesOpen ? <ChevronDown size={14} strokeWidth={1.5} aria-hidden="true" /> : <ChevronRight size={14} strokeWidth={1.5} aria-hidden="true" />}
          </button>
          {duplicatesOpen && (
            <div className="space-y-2">
              {/* Deduplicate by Email */}
              <Card padding="compact" className="bg-canvas/50 border-intel-border/30">
                <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-primary)" }}>Remove duplicates by email</span>
                    <span className="text-tiny text-intel">Finds leads sharing the same email address</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 text-tiny cursor-pointer">
                      <input type="checkbox" checked={dedupeKeepFirst} onChange={(e) => setDedupeKeepFirst(e.target.checked)} className="w-3 h-3" />
                      Keep oldest lead (uncheck to keep newest)
                    </label>
                    <Button variant="secondary" size="sm" icon={RotateCw} onClick={deduplicateByEmail} isLoading={dedupeLoading} isDisabled={dedupeLoading}>
                      {dedupeLoading ? <Loader2 size={10} className="animate-spin" /> : <RotateCw size={10} />} Deduplicate by email
                    </Button>
                  </div>
                </div>
                {dedupeResult && (
                  <div className="flex items-center gap-2 text-tiny">
                    <span className={dedupeResult.merged > 0 ? "text-success" : "text-fg-tertiary"}>
                      {dedupeResult.merged > 0 ? (
                        <>
                          <CheckCircle2 size={10} className="inline" /> Merged {dedupeResult.merged} leads across {dedupeResult.groups_found} email groups
                        </>
                      ) : (
                        <>
                          <Info size={10} className="inline" /> {dedupeResult.message || "No duplicate emails found"}
                        </>
                      )}
                    </span>
                    {dedupeResult.errors?.length > 0 && (
                      <span className="text-danger ml-2">
                        <AlertTriangle size={10} className="inline" /> {dedupeResult.errors.length} errors
                      </span>
                    )}
                  </div>
                )}
              </Card>
              
              {/* Existing fuzzy duplicates */}
              {duplicates.map((c) => (
                <Card key={c.id}>
                  <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
                    <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                      Matched on {c.match_reason?.replace("_", " + ")} · {Math.round((c.confidence || 0) * 100)}% confidence
                    </span>
                    <button onClick={() => dismissDuplicate(c.id)} style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Not a duplicate</button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {[c.lead_a, c.lead_b].map((l) => (
                      <div key={l.id} style={{ border: "1px solid var(--border-default)", borderRadius: "var(--radius-lg)", padding: 12 }}>
                        <div className="truncate" style={{ fontSize: 13.5, fontWeight: 500, color: "var(--text-primary)" }}>{l.first_name} {l.last_name}</div>
                        <div className="tnum truncate" style={{ fontSize: 11.5, fontFamily: "var(--font-mono)", color: "var(--text-tertiary)" }}>{l.email}</div>
                        {l.phone && <div className="tnum" style={{ fontSize: 11.5, fontFamily: "var(--font-mono)", color: "var(--text-tertiary)" }}>{l.phone}</div>}
                        {l.company && <div className="truncate" style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{l.company}</div>}
                        <Button variant="secondary" size="sm" onClick={() => mergeDuplicate(c, l.id)} className="w-full justify-center mt-2">Keep this one</Button>
                      </div>
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Quarantined leads */}
        {quarantine.length > 0 && (
          <div>
            <button onClick={() => setQuarantineOpen((o) => !o)} className="flex items-center gap-1.5 w-full"
              style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 12 }}>
              <AlertTriangle size={14} strokeWidth={1.5} aria-hidden="true" /> Quarantined leads ({quarantine.length})
              {quarantineOpen ? <ChevronDown size={14} strokeWidth={1.5} aria-hidden="true" /> : <ChevronRight size={14} strokeWidth={1.5} aria-hidden="true" />}
            </button>
            {quarantineOpen && (
              <div className="space-y-2">
                {quarantine.map((q) => (
                  <Card key={q.id} padding="compact" className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="tnum truncate" style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-primary)" }}>{q.email}</div>
                      <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{QUARANTINE_REASON_LABEL[q.reason] || q.reason}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {q.reason === "on_suppression_list" && <Button variant="secondary" size="sm" onClick={() => unsuppress(q.email, q.id)}>Un-suppress</Button>}
                      {(q.reason === "invalid_syntax" || q.reason === "do_not_contact") && q.lead_id && (
                        <Link to={`/app/crm/leads/${q.lead_id}`}><Button variant="secondary" size="sm">Fix on lead</Button></Link>
                      )}
                      <button onClick={() => dismissQuarantine(q.id)} style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Dismiss</button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Recycle bin */}
        {(recycleBin.total || 0) > 0 && (
          <div>
            <button onClick={() => setRecycleBinOpen((o) => !o)} className="flex items-center gap-1.5 w-full"
              style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 12 }}>
              <Trash2 size={14} strokeWidth={1.5} aria-hidden="true" /> Recycle bin ({recycleBin.total || 0})
              {recycleBinOpen ? <ChevronDown size={14} strokeWidth={1.5} aria-hidden="true" /> : <ChevronRight size={14} strokeWidth={1.5} aria-hidden="true" />}
            </button>
            {recycleBinOpen && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Input size="sm" value={recycleSelectN} onChange={(e) => setRecycleSelectN(e.target.value.replace(/\D/g, ""))} placeholder="N" className="w-16" />
                  <Button variant="tertiary" size="xs" icon={ListOrdered} onClick={selectFirstNRecycle} isDisabled={!recycleSelectN || parseInt(recycleSelectN, 10) < 1}>
                    Select {recycleSelectN || "N"}
                  </Button>
                  {recycleSelected.size > 0 && (
                    <Button variant="danger-subtle" size="xs" icon={Trash2} onClick={purgeSelected} isLoading={purging} className="ml-auto">
                      Delete {recycleSelected.size} permanently
                    </Button>
                  )}
                </div>
                <Table
                  columns={recycleColumns}
                  rows={recycleBin.rows || []}
                  rowKey={(item) => `${item.type}::${item.id}`}
                  selectable
                  selected={[...recycleSelected]}
                  onSelectRow={toggleRecycleSelect}
                  onSelectAll={selectAllRecycle}
                />
                <TableFooter
                  page={recyclePage}
                  pageCount={Math.max(1, Math.ceil((recycleBin.total || 0) / 25))}
                  total={recycleBin.total || 0}
                  pageSize={25}
                  onPageChange={setRecyclePage}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
