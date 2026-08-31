/**
 * CampaignLanding — the /campaigns experience.
 *
 * Design: Compact creation mode cards at top (always visible),
 * campaign list/table below. No "Create Campaign" toggle needed.
 *
 * 5 modes: Plain, Template, AI+Template, Full AI, Marketing (HTML)
 *
 * Based on 2026 trends:
 * - Thumb-first design (large tap targets, generous spacing)
 * - Glance design (message clear in first seconds)
 * - Dark mode-aware
 * - Compact cards that don't dominate the screen
 * - Progressive disclosure
 */
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { toast } from "sonner";
import {
  Plus, Search, FileText, LayoutTemplate, Sparkles, Zap,
  Play, Pause, Archive, Trash2, Copy, CheckCircle, AlertTriangle,
  Loader2, Mail, ArrowRight, Target, Megaphone,
} from "lucide-react";
import { SkeletonTableRows } from "../../components/ui/loading-states";
import { Modal, ModalContent } from "../../components/composites/Modal";
import InlineAlert from "../../components/composites/InlineAlert";
import StatusPill from "../../components/primitives/StatusPill";
import Select from "../../components/primitives/Select";
import Button from "../../components/primitives/Button";

/* ── Five Creation Modes — Compact Card Data ──────────────────── */

const CREATION_MODES = [
  {
    id: "plain",
    title: "Plain",
    subtitle: "From scratch",
    icon: FileText,
    color: "var(--color-primary)",
    bg: "var(--color-primary-subtle)",
    route: "/app/campaigns/create/plain",
  },
  {
    id: "template",
    title: "Template",
    subtitle: "Proven structures",
    icon: LayoutTemplate,
    color: "var(--color-success-text)",
    bg: "var(--color-success-subtle)",
    route: "/app/campaigns/create/template",
  },
  {
    id: "ai_template",
    title: "AI + Template",
    subtitle: "Structure + AI",
    icon: Sparkles,
    color: "var(--color-intel)",
    bg: "var(--color-intel-subtle)",
    route: "/app/campaigns/create/ai-template",
  },
  {
    id: "ai",
    title: "Full AI",
    subtitle: "Describe it",
    icon: Zap,
    color: "var(--color-warning-text)",
    bg: "var(--color-warning-subtle)",
    route: "/app/campaigns/create/ai",
  },
  {
    id: "marketing",
    title: "Marketing",
    subtitle: "HTML emails",
    icon: Megaphone,
    color: "var(--color-risk)",
    bg: "var(--color-risk-subtle)",
    route: "/app/campaigns/create/marketing",
  },
];

/* ── Main Component ──────────────────────────────────────────────── */

export default function CampaignLanding() {
  const nav = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [preflightOpen, setPreflightOpen] = useState(false);
  const [preflightData, setPreflightData] = useState(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [preflightCampaignId, setPreflightCampaignId] = useState(null);

  const load = useCallback(() => {
    api.get("/campaigns").then((r) => {
      setItems(r.data);
      setLoading(false);
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = items.filter((c) => {
    if (statusFilter && c.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return c.name?.toLowerCase().includes(q);
    }
    return true;
  });

  /* ── Campaign Actions ── */

  const runPreflight = async (id) => {
    setPreflightCampaignId(id);
    setPreflightLoading(true);
    setPreflightOpen(true);
    try {
      const r = await api.post(`/campaigns/${id}/preflight`);
      setPreflightData(r.data);
    } catch {
      setPreflightData({ checks: [], all_passed: false, error: "Preflight check failed" });
    }
    setPreflightLoading(false);
  };

  const launchAfterPreflight = async (id) => {
    setPreflightOpen(false);
    try {
      await api.post(`/campaigns/${id}/launch`);
      toast.success("Campaign launched");
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Launch failed");
    }
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
    catch { toast.error("Archive failed"); }
  };

  const duplicate = async (c) => {
    try {
      const r = await api.post("/campaigns", { ...c, name: `${c.name} (copy)`, lead_ids: [] });
      toast.success("Campaign duplicated");
      nav(`/app/campaigns/${r.data.id}`);
    } catch { toast.error("Duplicate failed"); }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this campaign? This cannot be undone.")) return;
    try { await api.delete(`/campaigns/${id}`); toast.success("Campaign deleted"); load(); }
    catch { toast.error("Delete failed"); }
  };

  /* ── Render ── */

  return (
    <div style={{ minHeight: "100vh" }}>
      {/* Page Header */}
      <div style={{
        position: "sticky", top: 0, zIndex: 10,
        background: "var(--bg-canvas)", borderBottom: "1px solid var(--border-default)",
      }}>
        <div style={{ padding: "14px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 style={{
              fontSize: 20, lineHeight: "26px", fontWeight: 600, letterSpacing: "-0.01em",
              color: "var(--text-primary)", fontFamily: "var(--font-ui)", margin: 0,
            }}>
              Campaigns
            </h1>
          </div>
        </div>
      </div>

      <div style={{ padding: "20px 32px 32px" }}>
        {/* ── Compact Creation Mode Cards ── */}
        <div style={{ marginBottom: 24 }}>
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10,
          }} className="campaign-mode-grid">
            {CREATION_MODES.map((mode) => (
              <div
                key={mode.id}
                onClick={() => nav(mode.route)}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "12px 14px", borderRadius: "var(--radius-xl)",
                  border: "1px solid var(--border-default)",
                  background: "var(--bg-surface)", cursor: "pointer",
                  transition: "all 180ms ease",
                  position: "relative", overflow: "hidden",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = mode.color;
                  e.currentTarget.style.boxShadow = `0 0 0 1px ${mode.color}20, var(--shadow-sm)`;
                  e.currentTarget.style.transform = "translateY(-1px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--border-default)";
                  e.currentTarget.style.boxShadow = "none";
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                {/* Icon */}
                <div style={{
                  width: 36, height: 36, borderRadius: "var(--radius-lg)",
                  background: mode.bg, display: "flex",
                  alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  <mode.icon size={16} style={{ color: mode.color }} strokeWidth={1.5} />
                </div>

                {/* Text */}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 600, color: "var(--text-primary)",
                    fontFamily: "var(--font-ui)", lineHeight: "16px",
                  }}>
                    {mode.title}
                  </div>
                  <div style={{
                    fontSize: 11, color: "var(--text-tertiary)",
                    fontFamily: "var(--font-ui)", lineHeight: "14px", marginTop: 1,
                  }}>
                    {mode.subtitle}
                  </div>
                </div>

                {/* Arrow */}
                <ArrowRight size={12} style={{
                  color: "var(--text-disabled)", flexShrink: 0,
                  transition: "all 150ms ease",
                }} />
              </div>
            ))}
          </div>
        </div>

        {/* ── Campaign List ── */}
        <div>
          {/* Filters bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 10px", border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-md)", background: "var(--bg-surface)",
              flex: 1, maxWidth: 260,
            }}>
              <Search size={14} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search campaigns…"
                style={{
                  flex: 1, border: "none", outline: "none", background: "transparent",
                  fontSize: 13, color: "var(--text-primary)", fontFamily: "var(--font-ui)",
                }}
              />
            </div>
            <Select
              size="sm" value={statusFilter} onChange={setStatusFilter}
              placeholder="All statuses"
              options={[
                { value: "", label: "All statuses" },
                { value: "draft", label: "Draft" },
                { value: "active", label: "Active" },
                { value: "paused", label: "Paused" },
                { value: "completed", label: "Completed" },
                { value: "archived", label: "Archived" },
              ]}
              className="w-40"
            />
            <span style={{
              fontSize: 11.5, color: "var(--text-tertiary)",
              fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums",
            }}>
              {filtered.length} campaign{filtered.length === 1 ? "" : "s"}
            </span>
          </div>

          {/* Loading / Empty / Table */}
          {loading ? (
            <div style={{
              padding: 16, borderRadius: "var(--radius-xl)",
              background: "var(--bg-surface)", border: "1px solid var(--border-default)",
            }}>
              <table style={{ width: "100%" }}>
                <tbody><SkeletonTableRows rows={5} cols={8} /></tbody>
              </table>
            </div>
          ) : (
            <div style={{
              borderRadius: "var(--radius-xl)", background: "var(--bg-surface)",
              border: "1px solid var(--border-default)", overflow: "hidden",
            }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border-default)" }}>
                    {[
                      { label: "Campaign", align: "left" },
                      { label: "Status", align: "left" },
                      { label: "Leads", align: "right" },
                      { label: "Sent", align: "right" },
                      { label: "Open", align: "right" },
                      { label: "Reply", align: "right" },
                      { label: "Meetings", align: "right" },
                      { label: "", align: "right" },
                    ].map((col) => (
                      <th key={col.label} style={{
                        padding: "10px 14px", textAlign: col.align,
                        fontSize: 10.5, fontWeight: 500, color: "var(--text-secondary)",
                        fontFamily: "var(--font-ui)", textTransform: "uppercase",
                        letterSpacing: "0.04em",
                      }}>
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c, i) => (
                    <tr
                      key={c.id}
                      style={{
                        borderBottom: i < filtered.length - 1 ? "1px solid var(--border-subtle)" : "none",
                        cursor: "pointer", transition: "background 100ms ease",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      onClick={() => nav(`/app/campaigns/${c.id}`)}
                    >
                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ fontWeight: 500, color: "var(--text-primary)", fontSize: 13.5 }}>{c.name}</div>
                        <div style={{
                          fontSize: 11, color: "var(--text-tertiary)",
                          fontFamily: "var(--font-mono)", marginTop: 2, fontVariantNumeric: "tabular-nums",
                        }}>
                          {c.step_count || 0} steps · {c.duration_days || 0}d
                        </div>
                      </td>
                      <td style={{ padding: "10px 14px" }}><StatusPill status={c.status} /></td>
                      <td style={{ padding: "10px 14px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 13, color: "var(--text-primary)" }}>
                        {c.lead_count || 0}
                      </td>
                      <td style={{ padding: "10px 14px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 13, color: "var(--text-primary)" }}>
                        {c.stats?.sent || 0}
                      </td>
                      <td style={{ padding: "10px 14px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 13 }}>
                        <span style={{ color: "var(--text-primary)" }}>{c.stats?.opened || 0}</span>
                        {c.stats?.sent > 0 && (
                          <span style={{ color: "var(--text-tertiary)", fontSize: 11, marginLeft: 4 }}>
                            ({c.stats?.open_rate || 0}%)
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "10px 14px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 13 }}>
                        <span style={{ color: "var(--text-primary)" }}>{c.stats?.replied || 0}</span>
                        {c.stats?.sent > 0 && (
                          <span style={{ color: "var(--text-tertiary)", fontSize: 11, marginLeft: 4 }}>
                            ({c.stats?.reply_rate || 0}%)
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "10px 14px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 13, color: "var(--text-primary)" }}>
                        {c.stats?.meetings || 0}
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 2 }}>
                          {c.status === "draft" && <RowAction title="Launch" icon={Play} onClick={() => runPreflight(c.id)} />}
                          {c.status === "active" && <RowAction title="Pause" icon={Pause} onClick={() => pause(c.id)} hoverColor="var(--color-warning)" />}
                          {c.status === "paused" && <RowAction title="Resume" icon={Play} onClick={() => runPreflight(c.id)} />}
                          {c.status === "active" && <RowAction title="Complete" icon={CheckCircle} onClick={() => complete(c.id)} />}
                          {["draft", "paused", "completed"].includes(c.status) && <RowAction title="Archive" icon={Archive} onClick={() => archive(c.id)} />}
                          <RowAction title="Duplicate" icon={Copy} onClick={() => duplicate(c)} />
                          <RowAction title="Delete" icon={Trash2} onClick={() => remove(c.id)} hoverColor="var(--color-danger)" />
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

      {/* ── Preflight Modal ── */}
      <Modal open={preflightOpen} onOpenChange={(o) => { setPreflightOpen(o); if (!o) setPreflightData(null); }}>
        <ModalContent
          size="md"
          title="Launch checklist"
          footer={
            !preflightLoading && preflightData && !preflightData.error ? (
              <>
                <span style={{
                  flex: 1, fontSize: 12.5, fontWeight: 500,
                  color: preflightData.all_passed ? "var(--color-success-text)" : "var(--color-warning-text)",
                }}>
                  {preflightData.all_passed ? "All checks passed" : `${preflightData.checks.filter((c) => !c.passed).length} check(s) failed`}
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
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "32px 0", justifyContent: "center" }}>
              <Loader2 size={20} className="animate-spin" style={{ color: "var(--text-tertiary)" }} />
              <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Running checks…</span>
            </div>
          ) : preflightData?.error ? (
            <InlineAlert tone="danger" title="Preflight failed">{preflightData.error}</InlineAlert>
          ) : preflightData && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {preflightData.checks.map((check) => {
                const tone = check.passed ? "success" : check.warn ? "warning" : "danger";
                const BG = { success: "var(--color-success-subtle)", warning: "var(--color-warning-subtle)", danger: "var(--color-danger-subtle)" };
                const BD = { success: "var(--color-success-border)", warning: "var(--color-warning-border)", danger: "var(--color-danger-border)" };
                const FG = { success: "var(--color-success)", warning: "var(--color-warning)", danger: "var(--color-danger)" };
                const Icon = check.passed ? CheckCircle : AlertTriangle;
                return (
                  <div key={check.id} style={{
                    display: "flex", alignItems: "flex-start", gap: 12, padding: 12,
                    borderRadius: "var(--radius-lg)", background: BG[tone], border: `1px solid ${BD[tone]}`,
                  }}>
                    <Icon size={16} strokeWidth={1.5} style={{ color: FG[tone], marginTop: 2, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>{check.label}</div>
                      <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{check.detail}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ModalContent>
      </Modal>

      {/* Responsive */}
      <style>{`
        @media (max-width: 900px) {
          .campaign-mode-grid { grid-template-columns: repeat(3, 1fr) !important; }
        }
        @media (max-width: 600px) {
          .campaign-mode-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
    </div>
  );
}

function RowAction({ title, icon: Icon, onClick, hoverColor = "var(--text-primary)" }) {
  return (
    <button
      type="button" title={title}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{
        display: "inline-grid", placeItems: "center", width: 26, height: 26,
        borderRadius: "var(--radius-sm)", border: "none", background: "transparent",
        color: "var(--text-tertiary)", cursor: "pointer", transition: "all 100ms ease",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-active)"; e.currentTarget.style.color = hoverColor; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-tertiary)"; }}
    >
      <Icon size={14} strokeWidth={1.5} aria-hidden="true" />
    </button>
  );
}
