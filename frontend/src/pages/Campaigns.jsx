import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Link, useNavigate } from "react-router-dom";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Play, Pause, Plus, Workflow, Trash2, Copy, FileJson, LayoutTemplate, ChevronDown, X, Archive, CheckCircle, Folder, BarChart3 } from "lucide-react";
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

  const load = () => api.get("/campaigns").then((r) => { setItems(r.data); setLoading(false); });
  useEffect(() => { load(); api.get("/campaign-folders").then((r) => setFolders(r.data)).catch(() => {}); }, []);

  const loadTemplates = async () => {
    const r = await api.get("/campaign-templates").catch(() => ({ data: [] }));
    setTemplates(r.data);
  };

  const launch = async (id, skipPending) => {
    if (skipPending === undefined) {
      try {
        await api.post(`/campaigns/${id}/launch`);
        toast.success("Campaign launched"); load();
      } catch (err) {
        if (err?.response?.status === 400 && err?.response?.data?.detail?.includes("Review incomplete")) {
          toast.info("Send approved leads only?", {
            description: "Some leads need review — send to only those already approved",
            action: { label: "Send approved", onClick: () => launch(id, true) },
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
            <button onClick={() => nav("/app/campaigns/wizard")} data-testid="btn-ai-campaign" className="btn-secondary text-xs"><Workflow size={14} /> Wizard</button>
            <div className="relative">
              <button onClick={() => setCreateOpen((o) => !o)} data-testid="btn-new-campaign" className="btn-primary text-xs">
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
                          <td className="p-3 text-right font-mono text-sm">{c.lead_count || 0}</td>
                          <td className="p-3 text-right font-mono text-sm">{c.stats?.sent || 0}</td>
                          <td className="p-3 text-right">
                            <div className="font-mono text-sm">{c.stats?.open_rate || 0}%</div>
                            <div className="text-tiny text-ink-muted">{c.stats?.opened || 0}</div>
                          </td>
                          <td className="p-3 text-right">
                            <div className="font-mono text-sm">{c.stats?.reply_rate || 0}%</div>
                            <div className="text-tiny text-ink-muted">{c.stats?.replied || 0}</div>
                          </td>
                          <td className="p-3 text-right font-mono text-sm">{c.stats?.meetings || 0}</td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {c.status === "draft" && (
                                <button onClick={() => launch(c.id)}
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
                                <button onClick={() => launch(c.id)}
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
                      className="btn-primary text-xs">Use</button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end pt-2">
              <button onClick={() => setTemplatePicker(false)} className="btn-secondary text-xs">Cancel</button>
            </div>
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
