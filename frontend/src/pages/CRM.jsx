import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import {
  Users, ListChecks, Kanban, BarChart3, Plus, Target, Activity, Phone, Mail,
  CalendarClock, FileText, MessageSquare, ArrowRight, Share2, Search,
  CheckSquare, ShieldAlert, ChevronDown, ChevronUp, Building2, Trash2, RotateCcw, Copy,
} from "lucide-react";

const RECYCLE_TYPE_LABEL = { lead: "Lead", company: "Company", list: "Lead list", company_list: "Company list" };
import { SkeletonKpiGrid, SkeletonListRows } from "../components/ui/loading-states";

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
  const [recycleBin, setRecycleBin] = useState([]);
  const [recycleBinOpen, setRecycleBinOpen] = useState(false);
  const [duplicates, setDuplicates] = useState([]);
  const [duplicatesOpen, setDuplicatesOpen] = useState(true);

  const load = async () => {
    const [leadsRes, dealsRes, listsRes, activityRes, tasksRes, quarantineRes, companiesRes, recycleBinRes, duplicatesRes] = await Promise.all([
      api.get("/leads?page_size=2000").catch(() => ({ data: { items: [] } })),
      api.get("/deals").catch(() => ({ data: [] })),
      api.get("/crm/lists").catch(() => ({ data: [] })),
      api.get("/activities").catch(() => ({ data: [] })),
      api.get("/crm/tasks", { params: { status: "open" } }).catch(() => ({ data: [] })),
      api.get("/quarantine").catch(() => ({ data: [] })),
      api.get("/companies?page_size=1").catch(() => ({ data: { total: 0 } })),
      api.get("/crm/recycle-bin").catch(() => ({ data: [] })),
      api.get("/crm/duplicates").catch(() => ({ data: [] })),
    ]);
    const leads = leadsRes.data.items || leadsRes.data;
    const deals = dealsRes.data;
    setLists(listsRes.data);
    setRecentActivity((activityRes.data || []).slice(0, 10));
    setTasks((tasksRes.data || []).slice(0, 8));
    setQuarantine(quarantineRes.data || []);
    setRecycleBin(recycleBinRes.data || []);
    setDuplicates(duplicatesRes.data || []);
    setStats({
      totalLeads: leads.length,
      totalDeals: deals.length,
      pipelineValue: deals.reduce((s, d) => s + (d.value || 0), 0),
      dealsWon: deals.filter((d) => d.stage === "won").length,
      totalCompanies: companiesRes?.data?.total || 0,
    });
  };

  useEffect(() => { load(); }, []);

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
      setRecycleBin((r) => r.filter((x) => !(x.type === item.type && x.id === item.id)));
    } catch (err) { toast.error(err?.response?.data?.detail || "Restore failed"); }
  };

  const purgeRecycled = async (item) => {
    try {
      await api.delete(`/crm/recycle-bin/${item.type}/${item.id}`);
      toast.success("Deleted permanently");
      setRecycleBin((r) => r.filter((x) => !(x.type === item.type && x.id === item.id)));
    } catch (err) { toast.error(err?.response?.data?.detail || "Failed"); }
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

  const StatCard = ({ icon: Icon, label, value, to, color }) => (
    <Link to={to} className="shadow-card p-5 rounded-2xl hover:shadow-card-hover transition-all bg-white">
      <div className="flex items-center justify-between">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
          <Icon size={16} className="text-white" />
        </div>
        <ArrowRight size={14} className="text-neutral-300" />
      </div>
      <div className="text-page-title font-display font-semibold mt-3">{value ?? "—"}</div>
      <div className="text-caption text-ink-muted mt-1">{label}</div>
    </Link>
  );

  const ACTIVITY_ICON = {
    call: Phone, email: Mail, meeting: CalendarClock, booking: CalendarClock,
    proposal: FileText, note: MessageSquare, whatsapp: MessageSquare,
    post: Share2, lead: Users, research: Search, transfer: Phone,
  };
  const ACTIVITY_COLOR = {
    call: "bg-blue-500", email: "bg-purple-500", meeting: "bg-green-500",
    booking: "bg-green-500", proposal: "bg-amber-500", note: "bg-neutral-500",
    whatsapp: "bg-emerald-500", post: "bg-pink-500", lead: "bg-cyan-500",
    research: "bg-violet-500", transfer: "bg-orange-500",
  };

  if (!stats) {
    return (
      <div>
        <PageHeader title="CRM" subtitle="Shared lead repository, lists, and activity timeline — accessible by every agent." />
        <div className="px-6 sm:px-8 space-y-8">
          <SkeletonKpiGrid count={4} />
          <SkeletonListRows rows={4} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="CRM"
        subtitle="Shared lead repository, lists, and activity timeline — accessible by every agent."
        right={
          <div className="flex items-center gap-2">
            <Link to="/app/crm/leads" className="btn-secondary text-xs">
              <Users size={14} /> Leads
            </Link>
            <Link to="/app/crm/lists" className="btn-secondary text-xs">
              <ListChecks size={14} /> Lists
            </Link>
            <Link to="/app/crm/pipeline" className="btn-secondary text-xs">
              <Kanban size={14} /> Pipeline
            </Link>
          </div>
        }
      />
      <div className="animate-fade-in px-6 sm:px-8 space-y-8">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Users} label="Total Leads" value={stats?.totalLeads} to="/app/crm/leads" color="bg-accent" />
          <StatCard icon={Building2} label="Companies" value={stats?.totalCompanies} to="/app/crm/companies" color="bg-accent" />
          <StatCard icon={Target} label="Deals" value={stats?.totalDeals} to="/app/crm/pipeline" color="bg-blue-500" />
          <StatCard icon={BarChart3} label="Pipeline Value" value={stats ? `$${(stats.pipelineValue).toLocaleString()}` : "—"} to="/app/crm/pipeline" color="bg-emerald-500" />
          <StatCard icon={Activity} label="Deals Won" value={stats?.dealsWon} to="/app/crm/pipeline" color="bg-amber-500" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Lead Lists */}
          <div className="lg:col-span-1">
            <div className="flex items-center justify-between mb-3">
              <h2 className="ui-label">Lead Lists</h2>
              <button onClick={() => nav("/app/crm/lists")} className="text-caption text-primary hover:underline inline-flex items-center gap-1">
                <Plus size={12} /> New
              </button>
            </div>
            <div className="space-y-2">
              {lists.length === 0 && (
                <div className="shadow-card p-4 rounded-2xl text-caption text-ink-muted bg-white">
                  No lead lists yet. Create one to organize leads for any agent.
                </div>
              )}
              {lists.map((l) => (
                <Link key={l.id} to={`/app/crm/lists`}
                  className="shadow-card p-4 rounded-2xl flex items-center justify-between hover:shadow-card-hover transition-all bg-white">
                  <div>
                    <div className="text-body font-medium">{l.name}</div>
                    <div className="text-caption text-ink-muted">{l.lead_ids?.length || 0} leads</div>
                  </div>
                  <ArrowRight size={14} className="text-neutral-300" />
                </Link>
              ))}
            </div>
          </div>

          {/* Recent Activity */}
          <div className="lg:col-span-2">
            <h2 className="ui-label mb-3">Recent Activity</h2>
            <div className="space-y-1">
              {recentActivity.length === 0 && (
                <div className="shadow-card p-4 rounded-2xl text-caption text-ink-muted bg-white">
                  No activity yet. Activities from Voice EQ calls, Pitch EQ emails, and other agents appear here.
                </div>
              )}
              {recentActivity.map((a) => {
                const typeKey = Object.keys(ACTIVITY_ICON).find((k) => a.type.startsWith(k)) || "note";
                const Icon = ACTIVITY_ICON[typeKey] || Activity;
                const color = ACTIVITY_COLOR[typeKey] || "bg-neutral-500";
                return (
                  <div key={a.id} className="shadow-card p-3 rounded-xl flex items-start gap-3 bg-white">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
                      <Icon size={12} className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-caption text-ink-secondary">{a.summary}</div>
                      <div className="text-tiny text-ink-muted font-mono mt-0.5">
                        {a.agent ? `${a.agent.toUpperCase()} · ` : ""}{a.at ? new Date(a.at).toLocaleString() : ""}
                      </div>
                    </div>
                    {a.lead?.id && (
                      <Link to={`/app/crm/leads/${a.lead.id}`}
                        className="text-tiny text-primary hover:underline shrink-0 font-mono">
                        {a.lead.first_name || "View"}
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Open tasks */}
        <div>
          <h2 className="ui-label mb-3 flex items-center gap-1.5"><CheckSquare size={14} /> Open tasks</h2>
          {tasks.length === 0 ? (
            <div className="shadow-card p-4 rounded-2xl text-caption text-ink-muted bg-white">
              Nothing due — add a task from any lead's detail page.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {tasks.map((t) => {
                const overdue = t.due_at && new Date(t.due_at) < new Date();
                return (
                  <Link key={t.id} to={t.lead ? `/app/crm/leads/${t.lead.id}` : "/app/crm/leads"}
                    className="shadow-card p-3 rounded-xl hover:shadow-card-hover transition-all bg-white">
                    <div className="text-body font-medium truncate">{t.title}</div>
                    <div className="text-caption text-ink-muted truncate mt-0.5">
                      {t.lead ? `${t.lead.first_name} ${t.lead.last_name || ""}`.trim() : "—"}
                    </div>
                    {t.due_at && (
                      <div className={`text-tiny font-mono mt-1 ${overdue ? "text-danger" : "text-ink-muted"}`}>
                        Due {new Date(t.due_at).toLocaleDateString()}
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Possible duplicates */}
        {duplicates.length > 0 && (
          <div>
            <button onClick={() => setDuplicatesOpen((o) => !o)} className="ui-label mb-3 flex items-center gap-1.5 w-full">
              <Copy size={14} /> Possible duplicates ({duplicates.length})
              {duplicatesOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {duplicatesOpen && (
              <div className="space-y-2">
                {duplicates.map((c) => (
                  <div key={c.id} className="shadow-card p-4 rounded-2xl bg-white">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-caption text-ink-muted">
                        Matched on {c.match_reason?.replace("_", " + ")} · {Math.round((c.confidence || 0) * 100)}% confidence
                      </span>
                      <button onClick={() => dismissDuplicate(c.id)} className="text-caption text-ink-muted hover:text-ink">
                        Not a duplicate
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {[c.lead_a, c.lead_b].map((l) => (
                        <div key={l.id} className="border border-line rounded-xl p-3">
                          <div className="text-body font-medium truncate">{l.first_name} {l.last_name}</div>
                          <div className="text-caption text-ink-muted font-mono truncate">{l.email}</div>
                          {l.phone && <div className="text-caption text-ink-muted font-mono">{l.phone}</div>}
                          {l.company && <div className="text-caption text-ink-muted truncate">{l.company}</div>}
                          <button onClick={() => mergeDuplicate(c, l.id)}
                            className="btn-secondary text-xs w-full justify-center mt-2">
                            Keep this one
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Quarantined leads */}
        {quarantine.length > 0 && (
          <div>
            <button onClick={() => setQuarantineOpen((o) => !o)} className="ui-label mb-3 flex items-center gap-1.5 w-full">
              <ShieldAlert size={14} /> Quarantined leads ({quarantine.length})
              {quarantineOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {quarantineOpen && (
              <div className="space-y-2">
                {quarantine.map((q) => (
                  <div key={q.id} className="shadow-card p-3 rounded-xl flex items-center justify-between gap-3 bg-white">
                    <div className="min-w-0">
                      <div className="text-body font-mono truncate">{q.email}</div>
                      <div className="text-caption text-ink-muted">{QUARANTINE_REASON_LABEL[q.reason] || q.reason}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {q.reason === "on_suppression_list" && (
                        <button onClick={() => unsuppress(q.email, q.id)} className="btn-secondary text-xs">Un-suppress</button>
                      )}
                      {(q.reason === "invalid_syntax" || q.reason === "do_not_contact") && q.lead_id && (
                        <Link to={`/app/crm/leads/${q.lead_id}`} className="btn-secondary text-xs">Fix on lead</Link>
                      )}
                      <button onClick={() => dismissQuarantine(q.id)} className="text-caption text-ink-muted hover:text-ink">Dismiss</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Recycle bin */}
        {recycleBin.length > 0 && (
          <div>
            <button onClick={() => setRecycleBinOpen((o) => !o)} className="ui-label mb-3 flex items-center gap-1.5 w-full">
              <Trash2 size={14} /> Recycle bin ({recycleBin.length})
              {recycleBinOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {recycleBinOpen && (
              <div className="space-y-2">
                {recycleBin.map((item) => (
                  <div key={`${item.type}-${item.id}`} className="shadow-card p-3 rounded-xl flex items-center justify-between gap-3 bg-white">
                    <div className="min-w-0">
                      <div className="text-body truncate">{item.name || "(untitled)"}</div>
                      <div className="text-caption text-ink-muted">
                        {RECYCLE_TYPE_LABEL[item.type] || item.type}
                        {item.deleted_at && ` · deleted ${new Date(item.deleted_at).toLocaleDateString()}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => restoreRecycled(item)} className="btn-secondary text-xs">
                        <RotateCcw size={12} /> Restore
                      </button>
                      <button onClick={() => purgeRecycled(item)} className="text-caption text-ink-muted hover:text-danger">
                        Delete permanently
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
