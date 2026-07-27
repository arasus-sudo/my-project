import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Link, useNavigate } from "react-router-dom";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Play, Pause, Plus, Workflow, Trash2, Copy, FileJson, LayoutTemplate, ChevronDown, X, Archive, CheckCircle, Folder, BarChart3, AlertTriangle, Check, Loader2, Users } from "lucide-react";
import { SkeletonTableRows } from "../components/ui/loading-states";

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
                <div className="shadow-card p-10 text-center rounded-2xl">
                  <div className="text-section font-display font-semibold">No campaigns yet</div>
                  <p className="text-body text-ink-muted mt-2">Create your first sequence to start booking meetings.</p>
                  <div className="flex items-center justify-center gap-3 mt-6">
                    <button onClick={() => nav("/app/campaigns/new")} className="btn-primary">Blank campaign</button>
                    <button onClick={openTemplatePicker} className="btn-secondary">From template</button>
                    <button onClick={() => nav("/app/campaigns/wizard")} className="btn-secondary">AI Wizard</button>
                  </div>
                </div>
              ) : (
                <div className="card-floating border border-line bg-white overflow-x-auto rounded-2xl">
                  <table className="w-full text-table min-w-[900px]">
                    <thead>
                      <tr className="border-b border-line bg-ash/50">
                        <th className="table-header text-left p-3">Campaign</th>
                        <th className="table-header text-left p-3">Status</th>
                        <th className="table-header text-right p-3">Leads</th>
                        <th className="table-header text-right p-3">Sent</th>
                        <th className="table-header text-right p-3">Open</th>
                        <th className="table-header text-right p-3">Reply</th>
                        <th className="table-header text-right p-3">Meetings</th>
                        <th className="p-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((c) => (
                        <tr key={c.id} className="border-b border-line hover:bg-surfacehover transition-colors duration-150">
                          <td className="p-3">
                            <Link to={`/app/campaigns/${c.id}`} data-testid={`campaign-row-${c.id}`}
                              className="font-medium text-body hover:text-accent">{c.name}</Link>
                            <div className="text-tiny text-ink-muted font-mono mt-0.5">
                              {c.step_count || 0} steps · {c.duration_days || 0}d
                              {c.tags?.length > 0 && c.tags.map((t) => <span key={t} className="ml-2 px-1.5 py-0.5 rounded-sm bg-ash text-ink-muted text-tiny">{t}</span>)}
                            </div>
                          </td>
                          <td className="p-3"><StatusBadge status={c.status} /></td>
                          <td className="p-3 text-right font-mono text-body">{c.lead_count || 0}</td>
                          <td className="p-3 text-right font-mono text-body">{c.stats?.sent || 0}</td>
                          <td className="p-3 text-right font-mono text-body">
                            {c.stats?.opened || 0}
                            {c.stats?.sent > 0 && <span className="text-ink-muted text-tiny ml-1">({c.stats?.open_rate || 0}%)</span>}
                          </td>
                          <td className="p-3 text-right font-mono text-body">
                            {c.stats?.replied || 0}
                            {c.stats?.sent > 0 && <span className="text-ink-muted text-tiny ml-1">({c.stats?.reply_rate || 0}%)</span>}
                          </td>
                          <td className="p-3 text-right font-mono text-body">{c.stats?.meetings || 0}</td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {c.status === "draft" && (
                                <button onClick={() => runPreflight(c.id)}
                                  className="p-1.5 text-ink-muted hover:text-ink rounded hover:bg-ash" title="Launch">
                                  <Play size={14} />
                                </button>
                              )}
                              {c.status === "active" && (
                                <button onClick={() => pause(c.id)}
                                  className="p-1.5 text-ink-muted hover:text-warning rounded hover:bg-ash" title="Pause">
                                  <Pause size={14} />
                                </button>
                              )}
                              {c.status === "paused" && (
                                <button onClick={() => runPreflight(c.id)}
                                  className="p-1.5 text-ink-muted hover:text-ink rounded hover:bg-ash" title="Resume">
                                  <Play size={14} />
                                </button>
                              )}
                              {c.status === "active" && (
                                <button onClick={() => complete(c.id)}
                                  className="p-1.5 text-ink-muted hover:text-ink rounded hover:bg-ash" title="Mark completed">
                                  <CheckCircle size={14} />
                                </button>
                              )}
                              {["draft", "paused", "completed"].includes(c.status) && (
                                <button onClick={() => archive(c.id)}
                                  className="p-1.5 text-ink-muted hover:text-ink rounded hover:bg-ash" title="Archive">
                                  <Archive size={14} />
                                </button>
                              )}
                              <button onClick={() => duplicate(c)}
                                className="p-1.5 text-ink-muted hover:text-ink rounded hover:bg-ash" title="Duplicate">
                                <Copy size={14} />
                              </button>
                              <button onClick={() => saveTemplate(c)}
                                className="p-1.5 text-ink-muted hover:text-ink rounded hover:bg-ash" title="Save as template">
                                <LayoutTemplate size={14} />
                              </button>
                              <button onClick={() => openContacts(c.id)}
                                className="p-1.5 text-ink-muted hover:text-ink rounded hover:bg-ash" title="Contact states">
                                <Users size={14} />
                              </button>
                              <button onClick={() => nav(`/app/campaigns/${c.id}/ab-test`)}
                                className="p-1.5 text-ink-muted hover:text-ink rounded hover:bg-ash" title="A/B test results">
                                <BarChart3 size={14} />
                              </button>
                              <button onClick={() => remove(c.id)}
                                className="p-1.5 text-ink-muted hover:text-danger rounded hover:bg-ash" title="Delete">
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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

function StatusBadge({ status }) {
  const map = {
    draft: "bg-neutral-100 text-ink-muted border-line",
    active: "bg-success/10 text-success border-success/30",
    paused: "bg-warning/10 text-warning border-warning/30",
    completed: "bg-ink/5 text-ink-muted border-line",
    archived: "bg-ink/5 text-ink-muted border-line opacity-60",
    quarantined: "bg-danger/10 text-danger border-danger/30",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-tiny font-medium border ${map[status] || map.draft}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${status === "active" ? "bg-success animate-pulse" : status === "paused" ? "bg-warning" : status === "quarantined" ? "bg-danger" : status === "completed" || status === "archived" ? "bg-ink-muted" : "bg-ink-muted"}`} />
      {status}
    </span>
  );
}
