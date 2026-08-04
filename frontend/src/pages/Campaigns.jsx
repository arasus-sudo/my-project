import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Link, useNavigate } from "react-router-dom";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Play, Pause, Plus, Workflow, Trash2, Copy, FileJson, LayoutTemplate, ChevronDown, X, Archive, CheckCircle, Folder, BarChart3, AlertTriangle, Check, Loader2, Users, TrendingUp, Sparkles, Activity } from "lucide-react";
import { SkeletonTableRows } from "../components/ui/loading-states";
import Table from "../components/composites/Table";
import { EmptyState } from "../components/composites/EmptyState";
import StatusPill from "../components/primitives/StatusPill";

export default function Campaigns() {
  const nav = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [templatePicker, setTemplatePicker] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [folderFilter, setFolderFilter] = useState("");
  const [folders, setFolders] = useState([]);
  const [folderModal, setFolderModal] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [preflightOpen, setPreflightOpen] = useState(false);
  const [preflightData, setPreflightData] = useState(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [preflightCampaignId, setPreflightCampaignId] = useState(null);
  const [contactsModal, setContactsModal] = useState(false);
  const [contactsData, setContactsData] = useState(null);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [funnelModal, setFunnelModal] = useState(false);
  const [funnelData, setFunnelData] = useState(null);
  const [funnelLoading, setFunnelLoading] = useState(false);
  const [optimizeModal, setOptimizeModal] = useState(false);
  const [optimizeData, setOptimizeData] = useState(null);
  const [optimizeLoading, setOptimizeLoading] = useState(false);

  const load = () => api.get("/campaigns").then((r) => { setItems(r.data); setLoading(false); });
  useEffect(() => { load(); api.get("/campaign-folders").then((r) => setFolders(r.data)).catch(() => {}); }, []);

  const loadTemplates = async () => {
    const r = await api.get("/campaign-templates").catch(() => ({ data: [] }));
    setTemplates(r.data);
  };

  const runPreflight = async (id) => {
    setPreflightCampaignId(id);
    setPreflightLoading(true);
    setPreflightOpen(true);
    try {
      const r = await api.post(`/campaigns/${id}/preflight`);
      setPreflightData(r.data);
    } catch (err) {
      setPreflightData({ checks: [], all_passed: false, error: err?.response?.data?.detail || "Preflight check failed" });
    }
    setPreflightLoading(false);
  };

  const launchAfterPreflight = async (id, skipPending) => {
    setPreflightOpen(false);
    setPreflightData(null);
    if (skipPending === undefined) {
      try {
        await api.post(`/campaigns/${id}/launch`);
        toast.success("Campaign launched"); load();
      } catch (err) {
        if (err?.response?.status === 400 && err?.response?.data?.detail?.includes("Review incomplete")) {
          toast.info("Send approved leads only?", {
            description: "Some leads need review — send to only those already approved",
            action: { label: "Send approved", onClick: () => launchAfterPreflight(id, true) },
            duration: 10000,
          });
        } else {
          toast.error(err?.response?.data?.detail || "Launch failed");
        }
      }
      return;
    }
    try { await api.post(`/campaigns/${id}/launch?skip_pending=true`); toast.success("Campaign launched"); load(); }
    catch (err) { console.error("Launch error:", err); toast.error(err?.response?.data?.detail || err?.message || "Launch failed"); }
  };
  const pause = async (id) => {
    try { await api.post(`/campaigns/${id}/pause`); toast.success("Paused"); load(); }
    catch { toast.error("Pause failed"); }
  };
  const complete = async (id) => {
    try { await api.post(`/campaigns/${id}/complete`); toast.success("Completed"); load(); }
    catch { toast.error("Failed"); }
  };
  const archive = async (id) => {
    try { await api.post(`/campaigns/${id}/archive`); toast.success("Archived"); load(); }
    catch (err) { toast.error(err?.response?.data?.detail || "Archive failed"); }
  };
  const remove = async (id) => {
    if (!window.confirm("Delete this campaign? This cannot be undone.")) return;
    try { await api.delete(`/campaigns/${id}`); toast.success("Campaign deleted"); load(); }
    catch { toast.error("Delete failed"); }
  };
  const duplicate = async (c) => {
    try {
      const r = await api.post("/campaigns", { ...c, name: `${c.name} (copy)`, lead_ids: [] });
      toast.success("Campaign duplicated");
      nav(`/app/campaigns/${r.data.id}`);
    } catch (err) { toast.error(err?.response?.data?.detail || "Duplicate failed"); }
  };
  const saveTemplate = async (c) => {
    try {
      await api.post(`/campaigns/${c.id}/save-template`);
      toast.success("Saved as template");
    } catch (err) { toast.error(err?.response?.data?.detail || "Failed to save template"); }
  };
  const openTemplatePicker = () => { loadTemplates(); setTemplatePicker(true); };

  const openContacts = async (id) => {
    setContactsLoading(true);
    setContactsModal(true);
    try {
      const r = await api.get(`/campaigns/${id}/contact-states`);
      setContactsData(r.data);
    } catch (err) {
      setContactsData({ error: err?.response?.data?.detail || "Failed to load contacts" });
    }
    setContactsLoading(false);
  };

  const openFunnel = async (id) => {
    setFunnelLoading(true);
    setFunnelModal(true);
    try {
      const r = await api.get(`/campaigns/${id}/funnel`);
      setFunnelData(r.data);
    } catch (err) {
      setFunnelData({ error: err?.response?.data?.detail || "Failed to load funnel" });
    }
    setFunnelLoading(false);
  };

  const openOptimize = async (id) => {
    setOptimizeLoading(true);
    setOptimizeModal(true);
    try {
      const r = await api.post(`/campaigns/${id}/optimize`);
      setOptimizeData(r.data);
    } catch (err) {
      setOptimizeData({ error: err?.response?.data?.detail || "Need at least 5 sent emails" });
    }
    setOptimizeLoading(false);
  };

  const createFolder = async () => {
    if (!folderName.trim()) return;
    try { await api.post("/campaign-folders", { name: folderName.trim() }); toast.success("Folder created"); setFolderName(""); setFolderModal(false); const r = await api.get("/campaign-folders"); setFolders(r.data); } catch (err) { toast.error("Failed"); }
  };

  const filtered = items.filter((c) => {
    if (statusFilter && c.status !== statusFilter) return false;
    if (folderFilter && c.folder_id !== folderFilter) return false;
    return true;
  });

  return (
    <div>
      <PageHeader
        title="Campaigns"
        subtitle="Multi-step sequences with AI personalization and hard-stop on reply."
        right={
          <div className="flex items-center gap-2">
            <button onClick={() => nav("/app/campaigns/wizard")} data-testid="btn-ai-campaign" className="btn-secondary text-caption"><Workflow size={14} /> Wizard</button>
            <div className="relative">
              <button onClick={() => setCreateOpen((o) => !o)} data-testid="btn-new-campaign" className="btn-primary text-caption">
                <Plus size={14} /> Create
                <ChevronDown size={12} className="ml-1" />
              </button>
              {createOpen && (
                <div className="absolute right-0 top-full mt-1 bg-white border border-line rounded-xl shadow-card z-50 py-1 min-w-[180px]"
                  onMouseLeave={() => setCreateOpen(false)}>
                  <button onClick={() => { setCreateOpen(false); nav("/app/campaigns/new"); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-body hover:bg-ash text-left">
                    <FileJson size={14} /> Blank campaign
                  </button>
                  <button onClick={() => { setCreateOpen(false); openTemplatePicker(); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-body hover:bg-ash text-left">
                    <LayoutTemplate size={14} /> From template
                  </button>
                  <button onClick={() => { setCreateOpen(false); nav("/app/campaigns/wizard"); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-body hover:bg-ash text-left">
                    <Workflow size={14} /> AI Wizard
                  </button>
                </div>
              )}
            </div>
          </div>
        }
      />
      <div className="animate-fade-in px-6 sm:px-8">
        {loading ? (
          <div className="card-floating p-4 border border-line bg-white overflow-x-auto rounded-2xl">
            <table className="w-full text-table min-w-[900px]">
              <thead>
                <tr className="border-b border-line">
                  <th className="table-header text-left p-4">Campaign</th>
                  <th className="table-header text-left p-4">Status</th>
                  <th className="table-header text-right p-4">Leads</th>
                  <th className="table-header text-right p-4">Sent</th>
                  <th className="table-header text-right p-4">Open</th>
                  <th className="table-header text-right p-4">Reply</th>
                  <th className="table-header text-right p-4">Meetings</th>
                  <th className="p-4"></th>
                </tr>
              </thead>
              <tbody><SkeletonTableRows rows={5} cols={8} /></tbody>
            </table>
          </div>
        ) : (
          <div className="flex gap-6">
            <div className="w-48 shrink-0 space-y-1">
              <div className="flex items-center justify-between mb-2">
                <span className="ui-label">Folders</span>
                <button onClick={() => setFolderModal(true)} className="text-tiny text-primary hover:underline">+</button>
              </div>
              <button onClick={() => setFolderFilter("")}
                className={`w-full text-left px-2 py-1.5 rounded-sm text-caption transition-colors ${!folderFilter ? "bg-ink text-white" : "hover:bg-ash"}`}>
                All campaigns
              </button>
              {folders.map((f) => (
                <button key={f.id} onClick={() => setFolderFilter(f.id)}
                  className={`w-full text-left px-2 py-1.5 rounded-sm text-caption transition-colors flex items-center gap-2 ${folderFilter === f.id ? "bg-ink text-white" : "hover:bg-ash"}`}>
                  <Folder size={12} /> {f.name}
                </button>
              ))}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-4">
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
                  className="border border-line px-2 py-1.5 rounded-sm text-caption">
                  <option value="">All statuses</option>
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="completed">Completed</option>
                  <option value="archived">Archived</option>
                  <option value="quarantined">Quarantined</option>
                </select>
                <span className="text-tiny text-ink-muted font-mono">{filtered.length} campaign{filtered.length === 1 ? "" : "s"}</span>
              </div>

              {filtered.length === 0 ? (
                <EmptyState
                  icon={Workflow}
                  title="No campaigns yet"
                  description="Create your first sequence to start booking meetings."
                  actionLabel="Blank campaign"
                  onAction={() => nav("/app/campaigns/new")}
                />
              ) : (
                <Table
                  columns={campaignColumns({ nav, runPreflight, pause, complete, archive, duplicate, saveTemplate, openFunnel, openOptimize, openContacts, remove })}
                  rows={filtered}
                  rowKey={(c) => c.id}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {templatePicker && (
        <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50">
          <div className="bg-white border border-line p-6 rounded-2xl w-full max-w-lg space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-section font-display font-semibold">Create from template</div>
              <button onClick={() => setTemplatePicker(false)} className="text-ink-muted hover:text-ink"><X size={16} /></button>
            </div>
            {templates.length === 0 ? (
              <div className="text-body text-ink-muted py-6 text-center">
                No templates yet. Save a campaign as a template first.
              </div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {templates.map((t) => (
                  <div key={t.id} className="flex items-center justify-between p-3 rounded-xl border border-line hover:bg-ash">
                    <div>
                      <div className="text-body font-medium">{t.name}</div>
                      <div className="text-tiny text-ink-muted font-mono">{t.steps?.length || 0} steps · {t.description}</div>
                    </div>
                    <button onClick={async () => {
                      try {
                        const r = await api.post("/campaigns", {
                          name: `${t.name}`,
                          goal: t.goal || "Book meetings",
                          campaign_type: t.campaign_type || "ai",
                          steps: t.steps || [],
                          lead_ids: [],
                          send_window_start: t.send_window_start || "09:00",
                          send_window_end: t.send_window_end || "17:00",
                          timezone: t.timezone || "UTC",
                          batch_size: t.batch_size || 10,
                        });
                        toast.success("Created from template");
                        setTemplatePicker(false);
                        nav(`/app/campaigns/${r.data.id}`);
                      } catch (err) { toast.error(err?.response?.data?.detail || "Failed"); }
                    }}
                      className="btn-primary text-caption">Use</button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end pt-2">
              <button onClick={() => setTemplatePicker(false)} className="btn-secondary text-caption">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {preflightOpen && (
        <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50">
          <div className="bg-white border border-line p-6 rounded-2xl w-full max-w-lg space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-section font-display font-semibold">Launch Checklist</div>
              <button onClick={() => { setPreflightOpen(false); setPreflightData(null); }} className="text-ink-muted hover:text-ink"><X size={16} /></button>
            </div>
            {preflightLoading ? (
              <div className="flex items-center gap-3 py-8 justify-center">
                <Loader2 size={20} className="animate-spin text-ink-muted" />
                <span className="text-body text-ink-muted">Running pre-flight checks...</span>
              </div>
            ) : preflightData?.error ? (
              <div className="text-center py-6">
                <AlertTriangle size={32} className="mx-auto text-danger mb-2" />
                <div className="text-body text-danger">{preflightData.error}</div>
              </div>
            ) : preflightData && (
              <div className="space-y-2">
                {preflightData.checks.map((check) => (
                  <div key={check.id} className={`flex items-start gap-3 p-3 rounded-xl border ${
                    check.passed ? "border-success/30 bg-success/5" : check.warn ? "border-warning/30 bg-warning/5" : "border-danger/30 bg-danger/5"
                  }`}>
                    {check.passed ? (
                      <Check size={16} className="text-success mt-0.5 shrink-0" />
                    ) : check.warn ? (
                      <AlertTriangle size={16} className="text-warning mt-0.5 shrink-0" />
                    ) : (
                      <X size={16} className="text-danger mt-0.5 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-body font-medium text-body">{check.label}</div>
                      <div className="text-tiny text-ink-muted">{check.detail}</div>
                    </div>
                    <span className={`text-tiny font-mono px-1.5 py-0.5 rounded-sm ${
                      check.passed ? "text-success bg-success/10" : check.warn ? "text-warning bg-warning/10" : "text-danger bg-danger/10"
                    }`}>
                      {check.passed ? "PASS" : check.warn ? "WARN" : "FAIL"}
                    </span>
                  </div>
                ))}
                <div className="pt-3 flex items-center justify-between">
                  <span className={`text-caption font-medium ${preflightData.all_passed ? "text-success" : "text-warning"}`}>
                    {preflightData.all_passed ? "All checks passed" : `${preflightData.checks.filter(c => !c.passed).length} check(s) failed — review before launch`}
                  </span>
                  <div className="flex gap-2">
                    <button onClick={() => { setPreflightOpen(false); setPreflightData(null); }} className="btn-secondary text-caption">Cancel</button>
                    <button onClick={() => launchAfterPreflight(preflightCampaignId)}
                      className="btn-primary text-caption">
                      <Play size={12} /> Launch
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {funnelModal && (
        <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50">
          <div className="bg-white border border-line p-6 rounded-2xl w-full max-w-3xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="text-section font-display font-semibold">Funnel Analytics</div>
              <button onClick={() => { setFunnelModal(false); setFunnelData(null); }} className="text-ink-muted hover:text-ink"><X size={16} /></button>
            </div>
            {funnelLoading ? (
              <div className="flex items-center gap-3 py-8 justify-center">
                <Loader2 size={20} className="animate-spin text-ink-muted" />
                <span className="text-body text-ink-muted">Loading funnel...</span>
              </div>
            ) : funnelData?.error ? (
              <div className="text-center py-6">
                <AlertTriangle size={32} className="mx-auto text-danger mb-2" />
                <div className="text-body text-danger">{funnelData.error}</div>
              </div>
            ) : funnelData && (
              <>
                <div className="grid grid-cols-5 gap-3 text-center">
                  <div className="p-3 bg-bone rounded-xl border border-line"><div className="text-body font-bold text-2xl">{funnelData.overall?.sent || 0}</div><div className="text-tiny text-ink-muted">Sent</div></div>
                  <div className="p-3 bg-bone rounded-xl border border-line"><div className="text-body font-bold text-2xl">{funnelData.overall?.sent_to_open_pct || 0}%</div><div className="text-tiny text-ink-muted">→ Open</div></div>
                  <div className="p-3 bg-bone rounded-xl border border-line"><div className="text-body font-bold text-2xl">{funnelData.overall?.open_to_reply_pct || 0}%</div><div className="text-tiny text-ink-muted">Open→Reply</div></div>
                  <div className="p-3 bg-bone rounded-xl border border-line"><div className="text-body font-bold text-2xl">{funnelData.overall?.sent_to_meeting_pct || 0}%</div><div className="text-tiny text-ink-muted">→ Meeting</div></div>
                  <div className="p-3 bg-bone rounded-xl border border-line"><div className="text-body font-bold text-2xl">{funnelData.overall?.meetings || 0}</div><div className="text-tiny text-ink-muted">Meetings</div></div>
                </div>
                {funnelData.by_step?.length > 0 && (
                  <div>
                    <div className="ui-label mb-2">Per-Step Breakdown</div>
                    <div className="border border-line rounded-xl overflow-hidden">
                      <table className="w-full text-table">
                        <thead><tr className="border-b border-line bg-ash/50">
                          <th className="table-header text-left p-2 text-tiny">Step</th>
                          <th className="table-header text-left p-2 text-tiny">Subject</th>
                          <th className="table-header text-center p-2 text-tiny">Sent</th>
                          <th className="table-header text-center p-2 text-tiny">Opened</th>
                          <th className="table-header text-center p-2 text-tiny">Clicked</th>
                          <th className="table-header text-center p-2 text-tiny">Replied</th>
                          <th className="table-header text-center p-2 text-tiny">Bounced</th>
                          <th className="table-header text-center p-2 text-tiny">Open%</th>
                          <th className="table-header text-center p-2 text-tiny">Reply%</th>
                        </tr></thead>
                        <tbody>
                          {funnelData.by_step.map((s) => (
                            <tr key={s.step} className="border-b border-line last:border-0 hover:bg-surfacehover">
                              <td className="p-2 text-tiny font-mono">#{s.step}{s.condition !== "always" && <span className="text-ink-muted ml-1">({s.condition})</span>}</td>
                              <td className="p-2 text-tiny text-ink-muted max-w-[140px] truncate">{s.subject}</td>
                              <td className="p-2 text-center text-tiny font-mono">{s.sent}</td>
                              <td className="p-2 text-center text-tiny font-mono">{s.opened}</td>
                              <td className="p-2 text-center text-tiny font-mono">{s.clicked}</td>
                              <td className="p-2 text-center text-tiny font-mono">{s.replied}</td>
                              <td className="p-2 text-center text-tiny font-mono">{s.bounced}</td>
                              <td className="p-2 text-center text-tiny font-mono">{s.open_rate_pct}%</td>
                              <td className="p-2 text-center text-tiny font-mono">{s.reply_rate_pct}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {optimizeModal && (
        <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50">
          <div className="bg-white border border-line p-6 rounded-2xl w-full max-w-xl space-y-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="text-section font-display font-semibold">AI Campaign Optimizer</div>
              <button onClick={() => { setOptimizeModal(false); setOptimizeData(null); }} className="text-ink-muted hover:text-ink"><X size={16} /></button>
            </div>
            {optimizeLoading ? (
              <div className="flex items-center gap-3 py-8 justify-center">
                <Loader2 size={20} className="animate-spin text-primary" />
                <span className="text-body text-ink-muted">Analyzing campaign performance...</span>
              </div>
            ) : optimizeData?.error ? (
              <div className="text-center py-6">
                <AlertTriangle size={32} className="mx-auto text-warning mb-2" />
                <div className="text-body text-ink-muted">{optimizeData.error}</div>
              </div>
            ) : optimizeData && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-body text-ink-muted">{optimizeData.campaign_name} · {optimizeData.total_sent} sent</span>
                  <span className={`text-card-title font-bold font-mono ${
                    optimizeData.overall_score >= 70 ? "text-success" : optimizeData.overall_score >= 40 ? "text-warning" : "text-danger"
                  }`}>{optimizeData.overall_score}/100</span>
                </div>
                <div className="p-3 bg-primary/5 border border-primary/20 rounded-xl">
                  <div className="flex items-start gap-2">
                    <Activity size={16} className="text-primary mt-0.5 shrink-0" />
                    <div><div className="text-caption font-medium text-primary">Key Insight</div><div className="text-tiny text-ink">{optimizeData.key_insight}</div></div>
                  </div>
                </div>
                {optimizeData.subject_line_recommendations?.length > 0 && (
                  <div><div className="ui-label">Subject Line Recommendations</div>
                    <ul className="list-disc list-inside text-tiny text-ink space-y-0.5">
                      {optimizeData.subject_line_recommendations.map((r, i) => <li key={i}>{r}</li>)}
                    </ul>
                  </div>
                )}
                {optimizeData.best_send_times?.length > 0 && (
                  <div><div className="ui-label">Best Send Times</div>
                    <div className="flex flex-wrap gap-1">
                      {optimizeData.best_send_times.map((t, i) => <span key={i} className="px-2 py-0.5 bg-bone border border-line rounded-full text-tiny font-mono">{t}</span>)}
                    </div>
                  </div>
                )}
                {optimizeData.content_suggestions?.length > 0 && (
                  <div><div className="ui-label">Content Suggestions</div>
                    <ul className="list-disc list-inside text-tiny text-ink space-y-0.5">
                      {optimizeData.content_suggestions.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  </div>
                )}
                {optimizeData.step_sequence_advice?.length > 0 && (
                  <div><div className="ui-label">Step Sequence Advice</div>
                    <ul className="list-disc list-inside text-tiny text-ink space-y-0.5">
                      {optimizeData.step_sequence_advice.map((a, i) => <li key={i}>{a}</li>)}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {contactsModal && (
        <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50">
          <div className="bg-white border border-line p-6 rounded-2xl w-full max-w-2xl space-y-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="text-section font-display font-semibold">Contact States</div>
              <button onClick={() => { setContactsModal(false); setContactsData(null); }} className="text-ink-muted hover:text-ink"><X size={16} /></button>
            </div>
            {contactsLoading ? (
              <div className="flex items-center gap-3 py-8 justify-center">
                <Loader2 size={20} className="animate-spin text-ink-muted" />
                <span className="text-body text-ink-muted">Loading contact states...</span>
              </div>
            ) : contactsData?.error ? (
              <div className="text-center py-6">
                <AlertTriangle size={32} className="mx-auto text-danger mb-2" />
                <div className="text-body text-danger">{contactsData.error}</div>
              </div>
            ) : contactsData && (
              <>
                <div className="flex items-center gap-4 flex-wrap">
                  <span className="text-body font-medium">{contactsData.total_contacts} contacts · {contactsData.steps} steps</span>
                  <div className="flex items-center gap-2 flex-wrap">
                    {Object.entries(contactsData.summary || {}).map(([state, count]) => (
                      <span key={state} className={`text-tiny font-mono px-2 py-0.5 rounded-full ${
                        state === "replied" || state === "meeting_booked" ? "bg-success/10 text-success" :
                        state === "bounced" || state === "exited" ? "bg-danger/10 text-danger" :
                        state === "opened" || state === "clicked" ? "bg-primary/10 text-primary" :
                        state === "sent" ? "bg-warning/10 text-warning" :
                        "bg-neutral-100 text-ink-muted"
                      }`}>{state} {count}</span>
                    ))}
                  </div>
                </div>
                <div className="border border-line rounded-xl overflow-hidden">
                  <table className="w-full text-table">
                    <thead>
                      <tr className="border-b border-line bg-ash/50">
                        <th className="table-header text-left p-2 text-tiny">Name</th>
                        <th className="table-header text-left p-2 text-tiny">Email</th>
                        <th className="table-header text-left p-2 text-tiny">State</th>
                        <th className="table-header text-right p-2 text-tiny">Step</th>
                        <th className="table-header text-right p-2 text-tiny">Queue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contactsData.contacts?.map((ct) => (
                        <tr key={ct.lead_id} className="border-b border-line last:border-0 hover:bg-surfacehover transition-colors">
                          <td className="p-2 text-body font-medium">{ct.first_name} {ct.last_name}</td>
                          <td className="p-2 text-tiny font-mono text-ink-muted">{ct.email}</td>
                          <td className="p-2">
                            <span className={`text-tiny font-mono px-1.5 py-0.5 rounded-sm ${
                              ct.state === "replied" || ct.state === "meeting_booked" ? "bg-success/10 text-success" :
                              ct.state === "bounced" || ct.state === "exited" ? "bg-danger/10 text-danger" :
                              ct.state === "opened" || ct.state === "clicked" ? "bg-primary/10 text-primary" :
                              ct.state === "sent" ? "bg-warning/10 text-warning" :
                              "bg-neutral-100 text-ink-muted"
                            }`}>{ct.state}</span>
                          </td>
                          <td className="p-2 text-right text-tiny font-mono">{ct.current_step}</td>
                          <td className="p-2 text-right text-tiny font-mono text-ink-muted">{ct.queue_status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {folderModal && (
        <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50">
          <div className="bg-white border border-line p-6 rounded-2xl w-full max-w-sm space-y-3">
            <div className="text-section font-display font-semibold">New folder</div>
            <input value={folderName} onChange={(e) => setFolderName(e.target.value)} autoFocus
              placeholder="Folder name" className="w-full border border-line px-3 py-2 rounded-sm" />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setFolderModal(false); setFolderName(""); }} className="btn-secondary">Cancel</button>
              <button onClick={createFolder} disabled={!folderName.trim()} className="btn-primary">Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* Column set for the campaigns Table (docs/design-system.md §11) — a
 * factory rather than a module-level constant since the actions column
 * needs closures over this page's handlers (pause/archive/duplicate/etc). */
function campaignColumns({ nav, runPreflight, pause, complete, archive, duplicate, saveTemplate, openFunnel, openOptimize, openContacts, remove }) {
  return [
    {
      key: "name", label: "Campaign",
      render: (c) => (
        <div>
          <Link to={`/app/campaigns/${c.id}`} data-testid={`campaign-row-${c.id}`}
            style={{ fontWeight: 500, color: "var(--text-primary)" }}>
            {c.name}
          </Link>
          <div className="tnum" style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", marginTop: 2 }}>
            {c.step_count || 0} steps · {c.duration_days || 0}d
            {c.tags?.length > 0 && c.tags.map((t) => (
              <span key={t} className="ml-2" style={{ padding: "1px 6px", borderRadius: "var(--radius-sm)", background: "var(--bg-active)", color: "var(--text-tertiary)" }}>{t}</span>
            ))}
          </div>
        </div>
      ),
    },
    {
      key: "status", label: "Status",
      render: (c) => {
        const bounceHigh = (c.stats?.bounced || 0) > 0 && (c.stats.bounced / c.stats.sent) > 0.05;
        const openLow = (c.stats?.open_rate || 0) < 15;
        const healthTone = bounceHigh ? "var(--color-danger)" : openLow ? "var(--color-warning)" : "var(--color-success)";
        const healthTitle = bounceHigh ? "High bounce rate" : openLow ? "Low open rate" : "Healthy";
        return (
          <span className="flex items-center gap-1.5">
            <StatusPill status={c.status} />
            {c.stats?.sent > 0 && <span title={healthTitle} style={{ width: 6, height: 6, borderRadius: "var(--radius-full)", background: healthTone }} />}
          </span>
        );
      },
    },
    { key: "leads", label: "Leads", align: "right", numeric: true, render: (c) => c.lead_count || 0 },
    { key: "sent", label: "Sent", align: "right", numeric: true, render: (c) => c.stats?.sent || 0 },
    {
      key: "opened", label: "Open", align: "right", numeric: true,
      render: (c) => <>{c.stats?.opened || 0}{c.stats?.sent > 0 && <span style={{ color: "var(--text-tertiary)", fontSize: 11, marginLeft: 4 }}>({c.stats?.open_rate || 0}%)</span>}</>,
    },
    {
      key: "replied", label: "Reply", align: "right", numeric: true,
      render: (c) => <>{c.stats?.replied || 0}{c.stats?.sent > 0 && <span style={{ color: "var(--text-tertiary)", fontSize: 11, marginLeft: 4 }}>({c.stats?.reply_rate || 0}%)</span>}</>,
    },
    { key: "meetings", label: "Meetings", align: "right", numeric: true, render: (c) => c.stats?.meetings || 0 },
    {
      key: "actions", label: "", align: "right",
      render: (c) => (
        <div className="flex items-center justify-end gap-1 ds-row-action">
          {c.status === "draft" && <RowAction title="Launch" icon={Play} onClick={() => runPreflight(c.id)} />}
          {c.status === "active" && <RowAction title="Pause" icon={Pause} onClick={() => pause(c.id)} hoverColor="var(--color-warning)" />}
          {c.status === "paused" && <RowAction title="Resume" icon={Play} onClick={() => runPreflight(c.id)} />}
          {c.status === "active" && <RowAction title="Mark completed" icon={CheckCircle} onClick={() => complete(c.id)} />}
          {["draft", "paused", "completed"].includes(c.status) && <RowAction title="Archive" icon={Archive} onClick={() => archive(c.id)} />}
          <RowAction title="Duplicate" icon={Copy} onClick={() => duplicate(c)} />
          <RowAction title="Save as template" icon={LayoutTemplate} onClick={() => saveTemplate(c)} />
          <RowAction title="Funnel analytics" icon={TrendingUp} onClick={() => openFunnel(c.id)} />
          <RowAction title="AI Optimize" icon={Sparkles} onClick={() => openOptimize(c.id)} hoverColor="var(--color-primary)" />
          <RowAction title="Contact states" icon={Users} onClick={() => openContacts(c.id)} />
          <RowAction title="A/B test results" icon={BarChart3} onClick={() => nav(`/app/campaigns/${c.id}/ab-test`)} />
          <RowAction title="Delete" icon={Trash2} onClick={() => remove(c.id)} hoverColor="var(--color-danger)" />
        </div>
      ),
    },
  ];
}

function RowAction({ title, icon: Icon, onClick, hoverColor = "var(--text-primary)" }) {
  return (
    <button
      type="button" title={title} onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="inline-grid place-items-center transition-colors"
      style={{ width: 26, height: 26, borderRadius: "var(--radius-sm)", color: "var(--text-tertiary)" }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-active)"; e.currentTarget.style.color = hoverColor; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-tertiary)"; }}
    >
      <Icon size={14} strokeWidth={1.5} aria-hidden="true" />
    </button>
  );
}
