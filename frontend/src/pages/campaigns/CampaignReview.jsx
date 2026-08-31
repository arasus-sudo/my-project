/**
 * CampaignReview — shared generate → preview → approve → launch component.
 * Used by all 4 creation modes after saving the campaign.
 *
 * Flow:
 *   1. Click "Generate Emails" → polls generation-status
 *   2. Browse generated emails one-by-one or in a list
 *   3. Approve / Reject each email
 *   4. Launch when ready
 */
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { api } from "../../lib/api";
import { toast } from "sonner";
import {
  Loader2, Play, Pause, Check, X, ChevronLeft, ChevronRight,
  Mail, Send, RefreshCw, Eye, CheckCircle, AlertTriangle,
  Trash2, Copy, ArrowRight,
} from "lucide-react";
import StatusPill from "../../components/primitives/StatusPill";

/* ── Helper ─────────────────────────────────────────────────── */
const sanitizeHtml = (html) => {
  if (!html) return "";
  return html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
};

export default function CampaignReview({ campaignId, onBack }) {
  const [campaignLeads, setCampaignLeads] = useState([]);
  const [campaign, setCampaign] = useState(null);
  const [activeStep, setActiveStep] = useState(0);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState(null);
  const [sendingTest, setSendingTest] = useState(false);
  const [busy, setBusy] = useState(false);
  const [previewStep, setPreviewStep] = useState(0);
  const [selectedReview, setSelectedReview] = useState([]);

  const loadCampaignLeads = useCallback((step) => {
    if (!campaignId) return;
    const s = step ?? previewStep;
    api.get(`/campaigns/${campaignId}/leads`, { params: { step: s } })
      .then((r) => setCampaignLeads(r.data.leads || []))
      .catch(() => {});
  }, [campaignId, previewStep]);

  const loadCampaign = useCallback(() => {
    if (!campaignId) return;
    api.get(`/campaigns/${campaignId}`).then((r) => setCampaign(r.data)).catch(() => {});
  }, [campaignId]);

  useEffect(() => {
    loadCampaign();
    loadCampaignLeads();
  }, [loadCampaign, loadCampaignLeads]);

  // Auto-trigger generation when campaign has leads but no personalized emails yet
  const autoTriggeredRef = useRef(false);
  useEffect(() => {
    if (!campaign || !campaign.lead_ids?.length || generating) return;
    if (campaign.personalized_emails?.length > 0) return;
    if (autoTriggeredRef.current) return;
    autoTriggeredRef.current = true;
    const t = setTimeout(() => runEngine(), 500);
    return () => clearTimeout(t);
  }, [campaign]);

  /* ── Generation ── */
  const runEngine = async () => {
    setGenerating(true);
    setGenProgress({ done: 0, total: 0 });
    try {
      const { data } = await api.post(`/campaigns/${campaignId}/run-engine`);
      if (data.job_id) {
        setGenProgress({ done: 0, total: data.generating || 0 });
        pollGeneration(campaignId, data.job_id, data.generating);
      } else {
        loadCampaignLeads();
        setGenerating(false);
        setGenProgress(null);
        toast.success("Emails ready");
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Generation failed");
      setGenerating(false);
      setGenProgress(null);
    }
  };

  const pollGeneration = (cid, jobId, total) => {
    const poll = setInterval(async () => {
      try {
        const st = await api.get(`/campaigns/${cid}/generation-status`);
        const jobs = Object.values(st.data.jobs || {});
        const running = jobs.find((j) => j.status === "running");
        const job = running || jobs[jobs.length - 1] || null;
        if (!job) {
          clearInterval(poll);
          setGenerating(false);
          setGenProgress(null);
          loadCampaignLeads();
          return;
        }
        setGenProgress({ done: job.done || 0, total: job.total || total || 0 });
        loadCampaignLeads();
        if (job.status === "complete") {
          clearInterval(poll);
          setGenerating(false);
          setGenProgress(null);
          loadCampaignLeads();
          toast.success(`Generated ${job.done} email${job.done === 1 ? "" : "s"}`);
        }
      } catch {
        clearInterval(poll);
        setGenerating(false);
        setGenProgress(null);
      }
    }, 3000);
  };

  const regenerateAll = async () => {
    setGenerating(true);
    try {
      const { data } = await api.post(`/campaigns/${campaignId}/leads/regenerate-all`);
      toast.success(`Regenerated ${data.generated} email(s)`);
      loadCampaignLeads();
    } catch {
      toast.error("Regeneration failed");
    }
    setGenerating(false);
  };

  /* ── Approve / Reject ── */
  const approveEmail = async (leadId) => {
    try {
      await api.post(`/campaigns/${campaignId}/leads/${leadId}/approve`);
      toast.success("Approved");
      loadCampaignLeads();
    } catch {
      toast.error("Failed");
    }
  };

  const rejectEmail = async (leadId) => {
    try {
      await api.post(`/campaigns/${campaignId}/leads/${leadId}/reject`);
      toast.success("Rejected");
      loadCampaignLeads();
    } catch {
      toast.error("Failed");
    }
  };

  const approveAll = async () => {
    try {
      const { data } = await api.post(`/campaigns/${campaignId}/leads/approve-all`);
      toast.success(`${data.approved} email(s) approved`);
      loadCampaignLeads();
    } catch {
      toast.error("Failed");
    }
  };

  const rejectAll = async () => {
    if (!campaignLeads.length) return;
    const allIds = campaignLeads.map((l) => l.id);
    try {
      await api.post(`/campaigns/${campaignId}/leads/bulk-status`, {
        lead_ids: allIds,
        status: "rejected",
      });
      toast.success("All rejected");
      loadCampaignLeads();
    } catch {
      toast.error("Failed");
    }
  };

  const sendTest = async (leadId) => {
    setSendingTest(true);
    try {
      const { data } = await api.post(`/campaigns/${campaignId}/leads/${leadId}/send-test`);
      toast.success(data.mocked ? "Test recorded (no mailbox)" : `Sent to ${data.sent_to}`);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Test failed");
    }
    setSendingTest(false);
  };

  const deleteEmail = async (leadId) => {
    try {
      await api.delete(`/campaigns/${campaignId}/leads/${leadId}/email`);
      toast.success("Removed");
      loadCampaignLeads();
    } catch {
      toast.error("Failed");
    }
  };

  /* ── Launch ── */
  const launch = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/campaigns/${campaignId}/launch`);
      toast.success(`Launched — ${data.queued} email(s) queued`);
      loadCampaign();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Launch failed");
    }
    setBusy(false);
  };

  const pause = async () => {
    try {
      await api.post(`/campaigns/${campaignId}/pause`);
      toast.success("Paused");
      loadCampaign();
    } catch {
      toast.error("Pause failed");
    }
  };

  /* ── Derived state ── */
  const stats = useMemo(() => {
    const total = campaignLeads.length;
    const approved = campaignLeads.filter((l) => l.email_status === "approved").length;
    const rejected = campaignLeads.filter((l) => l.email_status === "rejected").length;
    const draft = campaignLeads.filter((l) => l.personalized && l.email_status === "draft").length;
    return { total, approved, rejected, draft, reviewed: approved + rejected };
  }, [campaignLeads]);

  const steps = campaign?.steps || [];
  const currentLead = campaignLeads[reviewIndex];
  const hasLeads = (campaign?.lead_ids?.length || 0) > 0;
  const personalizedCount = campaign?.personalized_emails?.length || 0;
  const needsGeneration = hasLeads && personalizedCount === 0 && !generating;

  if (!campaign) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 60 }}>
        <Loader2 size={20} className="animate-spin" style={{ color: "var(--text-tertiary)" }} />
      </div>
    );
  }

  /* ── No leads assigned — prompt to add audience ── */
  if (!hasLeads && !generating) {
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", padding: "60px 20px", gap: 16,
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: "var(--radius-xl)",
          background: "var(--color-primary-subtle)", display: "flex",
          alignItems: "center", justifyContent: "center", marginBottom: 8,
        }}>
          <Mail size={24} style={{ color: "var(--color-primary)" }} strokeWidth={1.5} />
        </div>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-ui)", margin: 0 }}>
          No audience selected
        </h3>
        <p style={{ fontSize: 13, color: "var(--text-tertiary)", maxWidth: 360, textAlign: "center", lineHeight: "20px" }}>
          Go back and select leads to generate personalized emails for.
        </p>
      </div>
    );
  }

  /* ── Leads assigned but no emails yet — auto-generating ── */
  if (needsGeneration) {
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", padding: "60px 20px", gap: 16,
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: "var(--radius-xl)",
          background: "var(--color-primary-subtle)", display: "flex",
          alignItems: "center", justifyContent: "center", marginBottom: 8,
        }}>
          <Loader2 size={24} className="animate-spin" style={{ color: "var(--color-primary)" }} />
        </div>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-ui)", margin: 0 }}>
          Starting email generation...
        </h3>
        <p style={{ fontSize: 13, color: "var(--text-tertiary)", maxWidth: 360, textAlign: "center", lineHeight: "20px" }}>
          Generating personalized emails for {stats.total} lead{stats.total === 1 ? "" : "s"}.
        </p>
      </div>
    );
  }

  /* ── Generating progress ── */
  if (generating && genProgress) {
    const pct = genProgress.total > 0 ? Math.round((genProgress.done / genProgress.total) * 100) : 0;
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", padding: "60px 20px", gap: 16,
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: "var(--radius-xl)",
          background: "var(--color-primary-subtle)", display: "flex",
          alignItems: "center", justifyContent: "center", marginBottom: 8,
        }}>
          <Loader2 size={24} className="animate-spin" style={{ color: "var(--color-primary)" }} />
        </div>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-ui)", margin: 0 }}>
          Generating emails
        </h3>
        <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
          {genProgress.done} of {genProgress.total} ({pct}%)
        </p>
        <div style={{ width: 240, height: 6, borderRadius: "var(--radius-full)", background: "var(--bg-surface-sunken)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: "var(--color-primary)", borderRadius: "var(--radius-full)", transition: "width 500ms ease" }} />
        </div>
      </div>
    );
  }

  /* ── Review mode ── */
  return (
    <div style={{ display: "flex", height: "100%" }}>
      {/* LEFT: Lead list */}
      <div style={{
        width: 260, flexShrink: 0, borderRight: "1px solid var(--border-default)",
        display: "flex", flexDirection: "column", background: "var(--bg-surface)",
      }}>
        {/* Stats bar */}
        <div style={{
          padding: "10px 14px", borderBottom: "1px solid var(--border-subtle)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-primary)" }}>
            {stats.total} lead{stats.total === 1 ? "" : "s"}
          </span>
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={approveAll} title="Approve all" style={{
              padding: "3px 8px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-success-border)",
              background: "var(--color-success-subtle)", color: "var(--color-success-text)",
              fontSize: 10, fontWeight: 500, cursor: "pointer",
            }}>
              ✓ All
            </button>
            <button onClick={regenerateAll} title="Regenerate all" style={{
              padding: "3px 8px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-default)",
              background: "transparent", color: "var(--text-tertiary)",
              fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", gap: 3,
            }}>
              <RefreshCw size={10} /> All
            </button>
          </div>
        </div>

        {/* Lead list */}
        <div style={{ flex: 1, overflow: "auto" }}>
          {campaignLeads.map((lead, i) => {
            const statusColor = {
              approved: "var(--color-success-text)",
              rejected: "var(--color-danger-text)",
              draft: "var(--color-primary)",
            }[lead.email_status] || "var(--text-tertiary)";
            const isActive = i === reviewIndex;
            return (
              <div
                key={lead.id}
                onClick={() => setReviewIndex(i)}
                style={{
                  padding: "8px 14px", cursor: "pointer",
                  borderLeft: isActive ? `2px solid ${statusColor}` : "2px solid transparent",
                  background: isActive ? "var(--bg-active)" : "transparent",
                  transition: "all 100ms ease",
                }}
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "var(--bg-hover)"; }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{
                    width: 6, height: 6, borderRadius: "var(--radius-full)",
                    background: statusColor, flexShrink: 0,
                  }} />
                  <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {lead.first_name} {lead.last_name}
                  </div>
                </div>
                <div style={{ fontSize: 10, color: "var(--text-tertiary)", paddingLeft: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {lead.email}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* RIGHT: Email preview + actions */}
      {currentLead ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Toolbar */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 20px", borderBottom: "1px solid var(--border-subtle)",
            flexShrink: 0,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
                {currentLead.first_name} {currentLead.last_name}
              </span>
              <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                {currentLead.email}
              </span>
              <StatusPill status={currentLead.email_status === "approved" ? "active" : currentLead.email_status === "rejected" ? "archived" : "draft"} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
                {reviewIndex + 1} / {campaignLeads.length}
              </span>
              <button onClick={() => setReviewIndex(Math.max(0, reviewIndex - 1))} disabled={reviewIndex === 0} style={{
                padding: 4, border: "none", background: "none", cursor: reviewIndex === 0 ? "default" : "pointer",
                color: reviewIndex === 0 ? "var(--text-disabled)" : "var(--text-secondary)",
              }}>
                <ChevronLeft size={16} />
              </button>
              <button onClick={() => setReviewIndex(Math.min(campaignLeads.length - 1, reviewIndex + 1))} disabled={reviewIndex >= campaignLeads.length - 1} style={{
                padding: 4, border: "none", background: "none",
                cursor: reviewIndex >= campaignLeads.length - 1 ? "default" : "pointer",
                color: reviewIndex >= campaignLeads.length - 1 ? "var(--text-disabled)" : "var(--text-secondary)",
              }}>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* Email preview */}
          <div style={{ flex: 1, overflow: "auto", padding: 20, background: "var(--bg-surface-sunken)" }}>
            {currentLead.personalized ? (
              <div style={{ maxWidth: 600, margin: "0 auto" }}>
                <div style={{
                  padding: 16, borderRadius: "var(--radius-lg)",
                  background: "#fff", border: "1px solid var(--border-default)",
                  boxShadow: "var(--shadow-sm)",
                }}>
                  {/* Subject */}
                  <div style={{ marginBottom: 4, fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
                    Subject:
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: "#111", marginBottom: 16, fontFamily: "var(--font-display)" }}>
                    {currentLead.personalized.subject || "(no subject)"}
                  </div>
                  {/* Body */}
                  <div
                    style={{ fontSize: 14, lineHeight: "22px", color: "#333" }}
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(currentLead.personalized.body_html || currentLead.personalized.body || "") }}
                  />
                </div>
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: 40, color: "var(--text-tertiary)", fontSize: 13 }}>
                Email not generated for this lead yet.
              </div>
            )}
          </div>

          {/* Action bar */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            gap: 8, padding: "12px 20px", borderTop: "1px solid var(--border-subtle)",
            flexShrink: 0,
          }}>
            <button onClick={() => rejectEmail(currentLead.id)} style={{
              padding: "7px 16px", borderRadius: "var(--radius-lg)",
              border: "1px solid var(--color-danger-border)", background: "var(--color-danger-subtle)",
              color: "var(--color-danger-text)", fontSize: 12, fontWeight: 500,
              cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
            }}>
              <X size={13} /> Reject
            </button>
            <button onClick={() => sendTest(currentLead.id)} disabled={sendingTest} style={{
              padding: "7px 16px", borderRadius: "var(--radius-lg)",
              border: "1px solid var(--border-default)", background: "var(--bg-surface)",
              color: "var(--text-secondary)", fontSize: 12, fontWeight: 500,
              cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
            }}>
              {sendingTest ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Test
            </button>
            <button onClick={() => deleteEmail(currentLead.id)} style={{
              padding: "7px 16px", borderRadius: "var(--radius-lg)",
              border: "1px solid var(--border-default)", background: "var(--bg-surface)",
              color: "var(--text-tertiary)", fontSize: 12, fontWeight: 500,
              cursor: "pointer",
            }}>
              <Trash2 size={12} />
            </button>
            <button onClick={() => approveEmail(currentLead.id)} style={{
              padding: "7px 16px", borderRadius: "var(--radius-lg)",
              border: "none", background: "var(--color-success)", color: "#fff",
              fontSize: 12, fontWeight: 600, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 5,
            }}>
              <Check size={13} /> Approve
            </button>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-tertiary)", fontSize: 13 }}>
          Select a lead to preview their email
        </div>
      )}

      {/* BOTTOM: Launch bar */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        padding: "12px 20px", background: "var(--bg-surface)",
        borderTop: "1px solid var(--border-default)", zIndex: 20,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
            <span style={{ color: "var(--color-success-text)", fontWeight: 500 }}>{stats.approved}</span> approved
            {" · "}
            <span style={{ color: "var(--color-danger-text)", fontWeight: 500 }}>{stats.rejected}</span> rejected
            {" · "}
            <span>{stats.draft} pending</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={regenerateAll} disabled={generating} style={{
            padding: "7px 14px", borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border-default)", background: "var(--bg-surface)",
            color: "var(--text-secondary)", fontSize: 12, fontWeight: 500,
            cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
          }}>
            <RefreshCw size={12} /> Regenerate
          </button>
          {campaign.status === "active" ? (
            <button onClick={pause} style={{
              padding: "7px 16px", borderRadius: "var(--radius-lg)",
              border: "1px solid var(--color-warning-border)", background: "var(--color-warning-subtle)",
              color: "var(--color-warning-text)", fontSize: 12, fontWeight: 500,
              cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
            }}>
              <Pause size={12} /> Pause
            </button>
          ) : (
            <button onClick={launch} disabled={busy || stats.approved === 0} style={{
              padding: "7px 16px", borderRadius: "var(--radius-lg)",
              border: "none", background: stats.approved > 0 ? "var(--color-primary)" : "var(--bg-surface-sunken)",
              color: stats.approved > 0 ? "#fff" : "var(--text-disabled)",
              fontSize: 12, fontWeight: 600, cursor: stats.approved > 0 ? "pointer" : "default",
              display: "flex", alignItems: "center", gap: 5,
            }}>
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />} Launch
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
