import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Link, useNavigate } from "react-router-dom";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Play, Pause, Plus, Workflow, Trash2, Copy, FileJson, LayoutTemplate, ChevronDown, Archive, CheckCircle, Folder, BarChart3, AlertTriangle, Check, Loader2, Users, TrendingUp, Lightbulb, Activity } from "lucide-react";
import { SkeletonTableRows } from "../components/ui/loading-states";
import Table from "../components/composites/Table";
import { EmptyState } from "../components/composites/EmptyState";
import { Modal, ModalContent } from "../components/composites/Modal";
import InlineAlert from "../components/composites/InlineAlert";
import StatusPill from "../components/primitives/StatusPill";
import Select from "../components/primitives/Select";
import Input from "../components/primitives/Input";
import Button from "../components/primitives/Button";

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
        subtitle="Multi-step sequences with personalization and hard-stop on reply."
        right={
          <div className="flex items-center gap-2">
            <button onClick={() => nav("/app/campaigns/wizard")} data-testid="btn-ai-campaign" className="btn-secondary text-caption"><Workflow size={14} /> Wizard</button>
            <div className="relative">
              <button onClick={() => setCreateOpen((o) => !o)} data-testid="btn-new-campaign" className="btn-primary text-caption">
                <Plus size={14} /> Create
                <ChevronDown size={12} className="ml-1" />
              </button>
              {createOpen && (
                <div className="absolute right-0 top-full mt-1 z-50 py-1 min-w-[180px]"
                  style={{ background: "var(--bg-surface-raised)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-md)" }}
                  onMouseLeave={() => setCreateOpen(false)}>
                  <button onClick={() => { setCreateOpen(false); nav("/app/campaigns/new"); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-body hover:bg-ds-hover text-left">
                    <FileJson size={14} /> Blank campaign
                  </button>
                  <button onClick={() => { setCreateOpen(false); openTemplatePicker(); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-body hover:bg-ds-hover text-left">
                    <LayoutTemplate size={14} /> From template
                  </button>
                  <button onClick={() => { setCreateOpen(false); nav("/app/campaigns/wizard"); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-body hover:bg-ds-hover text-left">
                    <Workflow size={14} /> Wizard
                  </button>
                </div>
              )}
            </div>
          </div>
        }
      />
      <div className="animate-fade-in px-6 sm:px-8">
        {loading ? (
          <div className="card-floating p-4 overflow-x-auto rounded-2xl" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
            <table className="w-full text-table min-w-[900px]">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-default)" }}>
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
                <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", fontFamily: "var(--font-ui)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Folders</span>
                <button onClick={() => setFolderModal(true)} style={{ fontSize: 11, color: "var(--text-link)" }}>+</button>
              </div>
              <button onClick={() => setFolderFilter("")}
                className="w-full text-left px-2 py-1.5 text-caption transition-colors"
                style={{
                  borderRadius: "var(--radius-sm)",
                  background: !folderFilter ? "var(--color-primary)" : "transparent",
                  color: !folderFilter ? "#FFFFFF" : "var(--text-primary)",
                }}
                onMouseEnter={(e) => { if (folderFilter) e.currentTarget.style.background = "var(--bg-hover)"; }}
                onMouseLeave={(e) => { if (folderFilter) e.currentTarget.style.background = "transparent"; }}
              >
                All campaigns
              </button>
              {folders.map((f) => (
                <button key={f.id} onClick={() => setFolderFilter(f.id)}
                  className="w-full text-left px-2 py-1.5 text-caption transition-colors flex items-center gap-2"
                  style={{
                    borderRadius: "var(--radius-sm)",
                    background: folderFilter === f.id ? "var(--color-primary)" : "transparent",
                    color: folderFilter === f.id ? "#FFFFFF" : "var(--text-primary)",
                  }}
                  onMouseEnter={(e) => { if (folderFilter !== f.id) e.currentTarget.style.background = "var(--bg-hover)"; }}
                  onMouseLeave={(e) => { if (folderFilter !== f.id) e.currentTarget.style.background = "transparent"; }}
                >
                  <Folder size={12} /> {f.name}
                </button>
              ))}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-4">
                <Select
                  size="sm" value={statusFilter} onChange={setStatusFilter} placeholder="All statuses"
                  options={[
                    { value: "", label: "All statuses" },
                    { value: "draft", label: "Draft" },
                    { value: "active", label: "Active" },
                    { value: "paused", label: "Paused" },
                    { value: "completed", label: "Completed" },
                    { value: "archived", label: "Archived" },
                    { value: "quarantined", label: "Quarantined" },
                  ]}
                  className="w-40"
                />
                <span className="tnum" style={{ fontSize: 11.5, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{filtered.length} campaign{filtered.length === 1 ? "" : "s"}</span>
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

      <Modal open={templatePicker} onOpenChange={setTemplatePicker}>
        <ModalContent
          size="md"
          title="Create from template"
          footer={<Button variant="secondary" onClick={() => setTemplatePicker(false)}>Cancel</Button>}
        >
          {templates.length === 0 ? (
            <div className="text-center py-6" style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
              No templates yet. Save a campaign as a template first.
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {templates.map((t) => (
                <div key={t.id} className="flex items-center justify-between"
                  style={{ padding: 12, borderRadius: "var(--radius-lg)", border: "1px solid var(--border-default)" }}>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 500, color: "var(--text-primary)" }}>{t.name}</div>
                    <div className="tnum" style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{t.steps?.length || 0} steps · {t.description}</div>
                  </div>
                  <Button variant="primary" size="sm" onClick={async () => {
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
                  }}>Use</Button>
                </div>
              ))}
            </div>
          )}
        </ModalContent>
      </Modal>

      <Modal open={preflightOpen} onOpenChange={(o) => { setPreflightOpen(o); if (!o) setPreflightData(null); }}>
        <ModalContent
          size="md"
          title="Launch checklist"
          footer={
            !preflightLoading && !preflightData?.error && preflightData ? (
              <>
                <span className="flex-1" style={{ fontSize: 12.5, fontWeight: 500, color: preflightData.all_passed ? "var(--color-success-text)" : "var(--color-warning-text)" }}>
                  {preflightData.all_passed ? "All checks passed" : `${preflightData.checks.filter(c => !c.passed).length} check(s) failed — review before launch`}
                </span>
                <Button variant="secondary" onClick={() => { setPreflightOpen(false); setPreflightData(null); }}>Cancel</Button>
                <Button variant="primary" icon={Play} onClick={() => launchAfterPreflight(preflightCampaignId)}>Launch</Button>
              </>
            ) : (
              <Button variant="secondary" onClick={() => { setPreflightOpen(false); setPreflightData(null); }}>Cancel</Button>
            )
          }
        >
          {preflightLoading ? (
            <div className="flex items-center gap-3 py-8 justify-center">
              <Loader2 size={20} className="animate-spin" style={{ color: "var(--text-tertiary)" }} />
              <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Running pre-flight checks…</span>
            </div>
          ) : preflightData?.error ? (
            <InlineAlert tone="danger" title="Preflight failed">{preflightData.error}</InlineAlert>
          ) : preflightData && (
            <div className="space-y-2">
              {preflightData.checks.map((check) => {
                const tone = check.passed ? "success" : check.warn ? "warning" : "danger";
                const TONE_BG = { success: "var(--color-success-subtle)", warning: "var(--color-warning-subtle)", danger: "var(--color-danger-subtle)" };
                const TONE_BORDER = { success: "var(--color-success-border)", warning: "var(--color-warning-border)", danger: "var(--color-danger-border)" };
                const TONE_FG = { success: "var(--color-success)", warning: "var(--color-warning)", danger: "var(--color-danger)" };
                const TONE_TEXT = { success: "var(--color-success-text)", warning: "var(--color-warning-text)", danger: "var(--color-danger-text)" };
                const Icon = check.passed ? Check : AlertTriangle;
                return (
                  <div key={check.id} className="flex items-start gap-3"
                    style={{ padding: 12, borderRadius: "var(--radius-lg)", background: TONE_BG[tone], border: `1px solid ${TONE_BORDER[tone]}` }}>
                    <Icon size={16} strokeWidth={1.5} aria-hidden="true" style={{ color: TONE_FG[tone], marginTop: 2, flexShrink: 0 }} />
                    <div className="flex-1 min-w-0">
                      <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>{check.label}</div>
                      <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{check.detail}</div>
                    </div>
                    <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", padding: "2px 6px", borderRadius: "var(--radius-sm)", color: TONE_TEXT[tone], background: TONE_BG[tone] }}>
                      {check.passed ? "PASS" : check.warn ? "WARN" : "FAIL"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </ModalContent>
      </Modal>

      <Modal open={funnelModal} onOpenChange={(o) => { setFunnelModal(o); if (!o) setFunnelData(null); }}>
        <ModalContent size="lg" title="Funnel analytics">
          {funnelLoading ? (
            <div className="flex items-center gap-3 py-8 justify-center">
              <Loader2 size={20} className="animate-spin" style={{ color: "var(--text-tertiary)" }} />
              <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Loading funnel…</span>
            </div>
          ) : funnelData?.error ? (
            <InlineAlert tone="danger" title="Couldn't load funnel">{funnelData.error}</InlineAlert>
          ) : funnelData && (
            <>
              <div className="grid grid-cols-5 gap-3 text-center">
                {[
                  ["Sent", funnelData.overall?.sent || 0],
                  ["→ Open", `${funnelData.overall?.sent_to_open_pct || 0}%`],
                  ["Open→Reply", `${funnelData.overall?.open_to_reply_pct || 0}%`],
                  ["→ Meeting", `${funnelData.overall?.sent_to_meeting_pct || 0}%`],
                  ["Meetings", funnelData.overall?.meetings || 0],
                ].map(([label, value]) => (
                  <div key={label} style={{ padding: 12, borderRadius: "var(--radius-lg)", background: "var(--bg-surface-sunken)", border: "1px solid var(--border-default)" }}>
                    <div className="tnum" style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>{value}</div>
                    <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{label}</div>
                  </div>
                ))}
              </div>
              {funnelData.by_step?.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>Per-step breakdown</div>
                  {/* §2.7: plain table on tokens, not the Table composite — already
                      inside a Modal (--radius-xl), which would otherwise nest two
                      equal radii, same reasoning as Analytics.jsx's funnel rows. */}
                  <div className="overflow-x-auto" style={{ border: "1px solid var(--border-default)", borderRadius: "var(--radius-lg)" }}>
                    <table className="w-full" style={{ borderCollapse: "collapse", minWidth: 560 }}>
                      <thead>
                        <tr style={{ height: 32, background: "var(--bg-surface-sunken)", borderBottom: "1px solid var(--border-default)" }}>
                          {["Step", "Subject", "Sent", "Opened", "Clicked", "Replied", "Bounced", "Open%", "Reply%"].map((h, i) => (
                            <th key={h} style={{ padding: "0 8px", paddingLeft: i === 0 ? 12 : 8, textAlign: i > 1 ? "center" : "left", fontSize: 10.5, fontWeight: 500, color: "var(--text-secondary)" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {funnelData.by_step.map((s, i) => (
                          <tr key={s.step} className="ds-table-row" style={{ height: 32, borderBottom: i < funnelData.by_step.length - 1 ? "1px solid var(--border-subtle)" : "none" }}>
                            <td className="tnum" style={{ padding: "0 8px", paddingLeft: 12, fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>
                              #{s.step}{s.condition !== "always" && <span style={{ color: "var(--text-tertiary)", marginLeft: 4 }}>({s.condition})</span>}
                            </td>
                            <td className="truncate" style={{ padding: "0 8px", fontSize: 11, color: "var(--text-tertiary)", maxWidth: 140 }}>{s.subject}</td>
                            <td className="tnum" style={{ padding: "0 8px", textAlign: "center", fontSize: 11, color: "var(--text-primary)" }}>{s.sent}</td>
                            <td className="tnum" style={{ padding: "0 8px", textAlign: "center", fontSize: 11, color: "var(--text-primary)" }}>{s.opened}</td>
                            <td className="tnum" style={{ padding: "0 8px", textAlign: "center", fontSize: 11, color: "var(--text-primary)" }}>{s.clicked}</td>
                            <td className="tnum" style={{ padding: "0 8px", textAlign: "center", fontSize: 11, color: "var(--text-primary)" }}>{s.replied}</td>
                            <td className="tnum" style={{ padding: "0 8px", textAlign: "center", fontSize: 11, color: "var(--text-primary)" }}>{s.bounced}</td>
                            <td className="tnum" style={{ padding: "0 8px", textAlign: "center", fontSize: 11, color: "var(--text-primary)" }}>{s.open_rate_pct}%</td>
                            <td className="tnum" style={{ padding: "0 8px 0 8px", paddingRight: 12, textAlign: "center", fontSize: 11, color: "var(--text-primary)" }}>{s.reply_rate_pct}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </ModalContent>
      </Modal>

      <Modal open={optimizeModal} onOpenChange={(o) => { setOptimizeModal(o); if (!o) setOptimizeData(null); }}>
        <ModalContent size="md" title="Campaign optimizer">
          {optimizeLoading ? (
            <div className="flex items-center gap-3 py-8 justify-center">
              <Loader2 size={20} className="animate-spin" style={{ color: "var(--color-primary)" }} />
              <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Analyzing campaign performance…</span>
            </div>
          ) : optimizeData?.error ? (
            <InlineAlert tone="warning" title="Not enough data yet">{optimizeData.error}</InlineAlert>
          ) : optimizeData && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>{optimizeData.campaign_name} · {optimizeData.total_sent} sent</span>
                <span className="tnum" style={{
                  fontSize: 18, fontWeight: 700, fontFamily: "var(--font-mono)",
                  color: optimizeData.overall_score >= 70 ? "var(--color-success)" : optimizeData.overall_score >= 40 ? "var(--color-warning)" : "var(--color-danger)",
                }}>{optimizeData.overall_score}/100</span>
              </div>
              <div style={{ padding: 12, borderRadius: "var(--radius-lg)", background: "var(--color-primary-subtle)", border: "1px solid var(--color-primary-border)" }}>
                <div className="flex items-start gap-2">
                  <Activity size={16} strokeWidth={1.5} aria-hidden="true" style={{ color: "var(--color-primary)", marginTop: 2, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-primary)" }}>Key insight</div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{optimizeData.key_insight}</div>
                  </div>
                </div>
              </div>
              {[
                ["Subject line recommendations", optimizeData.subject_line_recommendations],
                ["Content suggestions", optimizeData.content_suggestions],
                ["Step sequence advice", optimizeData.step_sequence_advice],
              ].map(([label, items]) => items?.length > 0 && (
                <div key={label}>
                  <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
                  <ul className="list-disc list-inside space-y-1" style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    {items.map((it, i) => <li key={i}>{it}</li>)}
                  </ul>
                </div>
              ))}
              {optimizeData.best_send_times?.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>Best send times</div>
                  <div className="flex flex-wrap gap-1.5">
                    {optimizeData.best_send_times.map((t, i) => (
                      <span key={i} className="tnum" style={{ padding: "2px 10px", borderRadius: "var(--radius-full)", background: "var(--bg-surface-sunken)", border: "1px solid var(--border-default)", fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{t}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </ModalContent>
      </Modal>

      <Modal open={contactsModal} onOpenChange={(o) => { setContactsModal(o); if (!o) setContactsData(null); }}>
        <ModalContent size="lg" title="Contact states">
          {contactsLoading ? (
            <div className="flex items-center gap-3 py-8 justify-center">
              <Loader2 size={20} className="animate-spin" style={{ color: "var(--text-tertiary)" }} />
              <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Loading contact states…</span>
            </div>
          ) : contactsData?.error ? (
            <InlineAlert tone="danger" title="Couldn't load contacts">{contactsData.error}</InlineAlert>
          ) : contactsData && (
            <>
              <div className="flex items-center gap-4 flex-wrap" style={{ marginBottom: 16 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>{contactsData.total_contacts} contacts · {contactsData.steps} steps</span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {Object.entries(contactsData.summary || {}).map(([state, count]) => (
                    <StatusPill key={state} status={`${state} ${count}`} tone={toneForContactState(state)} />
                  ))}
                </div>
              </div>
              <div className="overflow-x-auto" style={{ border: "1px solid var(--border-default)", borderRadius: "var(--radius-lg)" }}>
                <table className="w-full" style={{ borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ height: 32, background: "var(--bg-surface-sunken)", borderBottom: "1px solid var(--border-default)" }}>
                      {["Name", "Email", "State", "Step", "Queue"].map((h, i) => (
                        <th key={h} style={{ padding: "0 10px", paddingLeft: i === 0 ? 12 : 10, textAlign: i >= 3 ? "right" : "left", fontSize: 10.5, fontWeight: 500, color: "var(--text-secondary)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {contactsData.contacts?.map((ct, i) => (
                      <tr key={ct.lead_id} className="ds-table-row" style={{ height: 36, borderBottom: i < contactsData.contacts.length - 1 ? "1px solid var(--border-subtle)" : "none" }}>
                        <td style={{ padding: "0 10px", paddingLeft: 12, fontSize: 12.5, fontWeight: 500, color: "var(--text-primary)" }}>{ct.first_name} {ct.last_name}</td>
                        <td className="tnum" style={{ padding: "0 10px", fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-tertiary)" }}>{ct.email}</td>
                        <td style={{ padding: "0 10px" }}><StatusPill status={ct.state} tone={toneForContactState(ct.state)} /></td>
                        <td className="tnum" style={{ padding: "0 10px", textAlign: "right", fontSize: 11, color: "var(--text-primary)" }}>{ct.current_step}</td>
                        <td className="tnum" style={{ padding: "0 10px", paddingRight: 12, textAlign: "right", fontSize: 11, color: "var(--text-tertiary)" }}>{ct.queue_status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </ModalContent>
      </Modal>

      <Modal open={folderModal} onOpenChange={setFolderModal}>
        <ModalContent
          size="sm"
          title="New folder"
          footer={
            <>
              <Button variant="secondary" onClick={() => { setFolderModal(false); setFolderName(""); }}>Cancel</Button>
              <Button variant="primary" onClick={createFolder} isDisabled={!folderName.trim()}>Create</Button>
            </>
          }
        >
          <Input value={folderName} onChange={(e) => setFolderName(e.target.value)} autoFocus placeholder="Folder name" />
        </ModalContent>
      </Modal>
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
          <RowAction title="Optimize" icon={Lightbulb} onClick={() => openOptimize(c.id)} hoverColor="var(--color-primary)" />
          <RowAction title="Contact states" icon={Users} onClick={() => openContacts(c.id)} />
          <RowAction title="A/B test results" icon={BarChart3} onClick={() => nav(`/app/campaigns/${c.id}/ab-test`)} />
          <RowAction title="Delete" icon={Trash2} onClick={() => remove(c.id)} hoverColor="var(--color-danger)" />
        </div>
      ),
    },
  ];
}

/* Contact-state tone mapping for the Contact States modal — distinct from
 * StatusPill's default §4.3 vocabulary since these are engagement states
 * (replied/bounced/opened), not the pipeline-stage vocabulary that maps to. */
function toneForContactState(state) {
  if (state === "replied" || state === "meeting_booked") return "success";
  if (state === "bounced" || state === "exited") return "danger";
  if (state === "opened" || state === "clicked") return "primary";
  if (state === "sent") return "warning";
  return "neutral";
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
