/**
 * MarketingCampaignBuilder — /campaigns/create/marketing
 *
 * Simple HTML email campaign builder:
 *  1. Pick a template or describe what you want
 *  2. See live preview on the right
 *  3. Save → generate → review + approve + launch
 *
 * Clean two-column layout: controls left, live preview right.
 */
import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { toast } from "sonner";
import {
  ArrowLeft, Save, Users, Loader2, Play, Eye, Maximize2,
  Monitor, Smartphone, Moon, Megaphone, Sparkles, Variable, Code2,
} from "lucide-react";
import CampaignReview from "./CampaignReview";
import AudiencePicker from "./AudiencePicker";
import SignaturePicker from "./SignaturePicker";
import VariablePicker from "./VariablePicker";
import { revealEmailFragment } from "../../lib/emailPreview";

/* ── HTML Templates ──────────────────────────────────── */
const HTML_TEMPLATES = [
  {
    id: "product", name: "Product Announcement", color: "var(--color-primary)",
    bg: (f) => `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;background:#fff;">
  <div style="background:linear-gradient(135deg,${f.primary || '#4F46E5'},${f.primaryDark || '#3730A3'});border-radius:12px;padding:32px;text-align:center;margin-bottom:24px;">
    <h1 style="color:#fff;font-size:22px;margin:0 0 8px;">${f.headline || 'Introducing Our Latest Feature'}</h1>
    <p style="color:rgba(255,255,255,0.85);font-size:14px;margin:0;">${f.subheadline || 'A brief description of what makes this special'}</p>
  </div>
  <p style="font-size:15px;line-height:24px;color:#374151;">Hi ${f.firstName || '{{first_name}}'},</p>
  <p style="font-size:15px;line-height:24px;color:#374151;">${f.body || "We're excited to share something we've been working on."}</p>
  <div style="text-align:center;margin:28px 0;">
    <a href="${f.ctaUrl || '#'}" style="display:inline-block;padding:12px 28px;background:${f.primary || '#4F46E5'};color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">${f.ctaText || 'Learn More'}</a>
  </div>
  <hr style="border:none;border-top:1px solid #E5E7EB;margin:24px 0;" />
  <p style="font-size:11px;color:#9CA3AF;text-align:center;">${f.footer || 'You are receiving this because you signed up.'}</p>
</div>`,
  },
  {
    id: "newsletter", name: "Newsletter", color: "var(--color-success-text)",
    bg: (f) => `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;background:#FAFAFA;">
  <h1 style="font-size:20px;color:#111;margin:0 0 4px;">${f.headline || 'Your Weekly Update'}</h1>
  <p style="font-size:12px;color:#6B7280;margin:0 0 20px;">${f.date || 'August 2026'}</p>
  ${(f.articles || ['Article one', 'Article two', 'Article three']).map((a, i) => `
  <div style="background:#fff;border-radius:8px;padding:20px;margin-bottom:12px;border:1px solid #E5E7EB;">
    <h3 style="font-size:15px;color:#111;margin:0 0 6px;">${a}</h3>
    <p style="font-size:13px;color:#6B7280;margin:0;">${f.articleDesc?.[i] || 'Read more about this topic...'}</p>
  </div>`).join('')}
  <p style="font-size:15px;line-height:24px;color:#374151;margin-top:20px;">Hi ${f.firstName || '{{first_name}}'},</p>
  <p style="font-size:15px;line-height:24px;color:#374151;">${f.body || 'Here is what happened this week.'}</p>
  <hr style="border:none;border-top:1px solid #E5E7EB;margin:24px 0;" />
  <p style="font-size:11px;color:#9CA3AF;text-align:center;">${f.footer || 'Unsubscribe if you no longer wish to receive these emails.'}</p>
</div>`,
  },
  {
    id: "promo", name: "Promotional", color: "var(--color-risk)",
    bg: (f) => `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:600px;margin:0 auto;background:#111;border-radius:12px;overflow:hidden;">
  <div style="background:linear-gradient(135deg,#FF6B35,#F7C948);padding:40px 32px;text-align:center;">
    <p style="color:#fff;font-size:12px;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 8px;">Limited Time Offer</p>
    <h1 style="color:#fff;font-size:28px;margin:0 0 8px;">${f.headline || '50% Off Everything'}</h1>
    <p style="color:rgba(255,255,255,0.9);font-size:14px;margin:0;">${f.subheadline || 'Use code SAVE50 at checkout'}</p>
  </div>
  <div style="padding:32px;">
    <p style="font-size:15px;line-height:24px;color:#D1D5DB;margin:0 0 16px;">Hi ${f.firstName || '{{first_name}}'},</p>
    <p style="font-size:15px;line-height:24px;color:#D1D5DB;margin:0 0 24px;">${f.body || "Don't miss this exclusive offer."}</p>
    <div style="text-align:center;">
      <a href="${f.ctaUrl || '#'}" style="display:inline-block;padding:14px 32px;background:${f.primary || '#FF6B35'};color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:15px;">${f.ctaText || 'Shop Now'}</a>
    </div>
  </div>
</div>`,
  },
  {
    id: "event", name: "Event Invitation", color: "var(--color-intel)",
    bg: (f) => `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;background:#fff;">
  <div style="border:2px solid #E5E7EB;border-radius:12px;padding:32px;text-align:center;">
    <p style="font-size:12px;color:#6B7280;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 12px;">You're Invited</p>
    <h1 style="font-size:22px;color:#111;margin:0 0 8px;">${f.headline || 'Annual Industry Summit 2026'}</h1>
    <p style="font-size:14px;color:#6B7280;margin:0 0 4px;">${f.eventDate || 'September 15, 2026'}</p>
    <p style="font-size:14px;color:#6B7280;margin:0 0 24px;">${f.eventTime || '10:00 AM - 4:00 PM EST'}</p>
    <p style="font-size:15px;line-height:24px;color:#374151;text-align:left;margin:0 0 20px;">Hi ${f.firstName || '{{first_name}}'},</p>
    <p style="font-size:15px;line-height:24px;color:#374151;text-align:left;margin:0 0 24px;">${f.body || "We'd love to see you there."}</p>
    <a href="${f.ctaUrl || '#'}" style="display:inline-block;padding:12px 28px;background:#7C3AED;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">${f.ctaText || 'Register Now'}</a>
  </div>
</div>`,
  },
  {
    id: "onboard", name: "Onboarding", color: "var(--color-success-text)",
    bg: (f) => `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;background:#fff;">
  <h1 style="font-size:22px;color:#111;margin:0 0 16px;">Welcome aboard, ${f.firstName || '{{first_name}}'}! 🎉</h1>
  <p style="font-size:15px;line-height:24px;color:#374151;margin:0 0 20px;">${f.body || "We're thrilled to have you. Here's how to get started."}</p>
  ${(f.steps || ['Set up your profile', 'Connect your first account', 'Explore the dashboard']).map((s, i) => `
  <div style="display:flex;gap:14px;align-items:flex-start;margin-bottom:16px;">
    <div style="width:28px;height:28px;border-radius:50%;background:#EEF2FF;color:#4F46E5;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600;flex-shrink:0;">${i + 1}</div>
    <p style="font-size:14px;line-height:20px;color:#374151;margin:0;">${s}</p>
  </div>`).join('')}
  <div style="text-align:center;margin-top:28px;">
    <a href="${f.ctaUrl || '#'}" style="display:inline-block;padding:12px 28px;background:#10B981;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">${f.ctaText || 'Get Started'}</a>
  </div>
</div>`,
  },
  {
    id: "feedback", name: "Feedback Request", color: "var(--color-warning-text)",
    bg: (f) => `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;background:#FAFAFA;border-radius:12px;">
  <h1 style="font-size:22px;color:#111;margin:0 0 16px;">How are we doing?</h1>
  <p style="font-size:15px;line-height:24px;color:#374151;margin:0 0 20px;">Hi ${f.firstName || '{{first_name}}'},</p>
  <p style="font-size:15px;line-height:24px;color:#374151;margin:0 0 24px;">${f.body || 'Your feedback helps us improve. Would you take 2 minutes to share your thoughts?'}</p>
  <div style="display:flex;justify-content:center;gap:12px;margin-bottom:24px;">
    ${['😡','😐','🙂','😊','🤩'].map((e, i) => `
    <a href="${f.ctaUrl || '#'}?rating=${i + 1}" style="font-size:28px;text-decoration:none;padding:8px;border-radius:8px;background:#fff;border:1px solid #E5E7EB;">${e}</a>`).join('')}
  </div>
  <div style="text-align:center;">
    <a href="${f.ctaUrl || '#'}" style="font-size:13px;color:#4F46E5;text-decoration:underline;">Or leave a detailed review →</a>
  </div>
</div>`,
  },
];

/* ── Dark CSS filter for preview ─────────────────────── */
const DARK_FILTER = "brightness(0.85) saturate(1.1) invert(1) hue-rotate(180deg)";

/* ── Unsubscribe footer preview ────────────────────────
   Mirrors the email-safe footer the backend appends at send time
   (optout.append_unsubscribe_footer). Shown in the composed preview only —
   the real per-recipient unsubscribe link is issued at send. Using href="#"
   keeps the preview from navigating anywhere. */
const UNSUB_FOOTER_PREVIEW = `
<div style="max-width:600px;margin:0 auto;padding:0 24px;background:#fff;font-family:system-ui,-apple-system,sans-serif;">
  <div style="margin-top:16px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.6;color:#64748b;">
    You're receiving this because you previously connected with us. <a href="#" style="color:#64748b;text-decoration:underline;">Unsubscribe</a> from future marketing emails.
  </div>
</div>`;

export default function MarketingCampaignBuilder() {
  const { id } = useParams();
  const nav = useNavigate();
  const [phase, setPhase] = useState("compose");
  const [name, setName] = useState("Marketing campaign");
  const [subject, setSubject] = useState("");
  const [previewText, setPreviewText] = useState("");
  const [html, setHtml] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [generatingAi, setGeneratingAi] = useState(false);
  const [selectedLeads, setSelectedLeads] = useState([]);
  const [busy, setBusy] = useState(false);
  const [savedCampaignId, setSavedCampaignId] = useState(id || null);
  const [previewMode, setPreviewMode] = useState("desktop"); // desktop | mobile | auto
  const [darkPreview, setDarkPreview] = useState(false);
  const [showAudience, setShowAudience] = useState(false);
  const [signatureId, setSignatureId] = useState("");
  const [includeSignature, setIncludeSignature] = useState(true);
  const [showTemplates, setShowTemplates] = useState(!html);
  const [steps] = useState([{ _key: "s_marketing", channel: "email", day: 0, condition: "always" }]);
  const [showSubjectVars, setShowSubjectVars] = useState(false);
  const [composeMode, setComposeMode] = useState("template"); // template | ai | html
  const [reviewKey, setReviewKey] = useState(0);
  const [savingAudience, setSavingAudience] = useState(false);

  const persistAudience = async (leads) => {
    setSelectedLeads(leads);
    setShowAudience(false);
    if (!savedCampaignId) { setPhase("compose"); return; }
    setSavingAudience(true);
    try {
      await api.post(`/campaigns/${savedCampaignId}/leads/batch`, { lead_ids: leads });
      try { await api.post(`/campaigns/${savedCampaignId}/run-engine`); } catch (e) {
        toast.warning("Leads added — generation: " + (e?.response?.data?.detail || e.message));
      }
      setReviewKey((k) => k + 1);
      toast.success("Audience updated");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to update audience");
    }
    setSavingAudience(false);
  };

  useEffect(() => {

    if (id) {
      api.get(`/campaigns/${id}`).then((r) => {
        const c = r.data;
        setName(c.name);
        if (c.steps?.[0]) {
          setHtml(c.steps[0].body_html || "");
          setSubject(c.steps[0].subject || "");
          setPreviewText(c.steps[0].preview_text || "");
        }
        setSelectedLeads(c.lead_ids || []);
        // Editing an existing campaign: land in the composer so the saved HTML
        // is editable. Only auto-jump to review when leads already have
        // generated emails (matches PlainCampaignBuilder).
        if ((c.lead_ids?.length || 0) > 0 && (c.personalized_count || 0) > 0) {
          setPhase("review");
        } else {
          setPhase("compose");
        }
        // If the stored body is real HTML, open the HTML editor (not the
        // template grid) so the user sees exactly what they authored.
        if ((c.steps?.[0]?.body_html || "").trim()) {
          setComposeMode("html");
        }
      });
    }
  }, [id]);

  const applyTemplate = (tpl) => {
    setHtml(tpl.bg({ firstName: "{{first_name}}" }));
    setShowTemplates(false);
  };

  const generateWithAi = async () => {
    if (!aiPrompt.trim()) { toast.error("Describe what you want"); return; }
    setGeneratingAi(true);
    try {
      const { data } = await api.post("/ai/generate-email", {
        prompt: aiPrompt,
        template_type: "marketing",
      });
      if (data.html) setHtml(data.html);
      else if (data.body) setHtml(`<div style="font-family:system-ui;max-width:600px;margin:0 auto;padding:32px 24px;">${data.body}</div>`);
      toast.success("Email generated");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "AI generation failed");
    }
    setGeneratingAi(false);
  };

  const save = async () => {
    setBusy(true);
    try {
      const stepData = { ...steps[0], subject, body_html: html, body: html.replace(/<[^>]+>/g, "").trim() };
      const payload = {
        name, campaign_type: "marketing", steps: [stepData],
        lead_ids: selectedLeads,
        signature_id: includeSignature ? signatureId : null,
      };
      let cid = savedCampaignId;
      if (!cid) {
        const { data } = await api.post("/campaigns", payload);
        cid = data.id;
        setSavedCampaignId(cid);
        window.history.replaceState(null, "", `/app/campaigns/edit/marketing/${cid}`);
        toast.success("Campaign created");
      } else {
        await api.put(`/campaigns/${cid}`, payload);
        toast.success("Campaign saved");
      }
      // Auto-trigger email generation if leads are selected
      if (cid && selectedLeads.length > 0) {
        try {
          const engine = await api.post(`/campaigns/${cid}/run-engine`);
          if (engine.data.job_id) {
            toast.success(`Generating emails for ${engine.data.generating} leads`);
          } else {
            toast.success(`Emails ready for ${engine.data.generated || 0} leads`);
          }
        } catch (err) {
          toast.warning("Saved, but generation failed: " + (err?.response?.data?.detail || err.message));
        }
      }
      // Move to the review screen so preview / approve / add-leads / launch are
      // reachable in the same session — matches PlainCampaignBuilder.
      setPhase("review");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Save failed");
    }
    setBusy(false);
  };

  /* ── Review phase ── */
  if (phase === "review" && savedCampaignId) {
    return (
      <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 20px", borderBottom: "1px solid var(--border-default)",
          background: "var(--bg-surface)", flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={() => setPhase("compose")} style={{
              display: "flex", alignItems: "center", gap: 4, border: "none",
              background: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: 13,
            }}>
              <ArrowLeft size={14} /> Edit
            </button>
            <span style={{ color: "var(--text-tertiary)", fontSize: 13 }}>/</span>
            <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>{name}</span>
          </div>
          <button onClick={() => setShowAudience(true)} disabled={savingAudience} style={{
            display: "flex", alignItems: "center", gap: 5, padding: "6px 12px",
            borderRadius: "var(--radius-lg)", border: "1px solid var(--border-default)",
            background: selectedLeads.length > 0 ? "var(--color-primary-subtle)" : "var(--bg-surface)",
            color: selectedLeads.length > 0 ? "var(--color-primary)" : "var(--text-secondary)",
            fontSize: 12, fontWeight: 500, cursor: "pointer",
          }}>
            {savingAudience ? <Loader2 size={13} className="animate-spin" /> : <Users size={13} />}
            {selectedLeads.length > 0 ? `${selectedLeads.length} leads` : "Add leads"}
          </button>
        </div>
        <div style={{ flex: 1, overflow: "hidden" }}>
          <CampaignReview key={reviewKey} campaignId={savedCampaignId} />
        </div>
        {showAudience && (
          <AudiencePicker
            selectedLeads={selectedLeads}
            onSelect={persistAudience}
            onClose={() => setShowAudience(false)}
          />
        )}
      </div>
    );
  }

  /* ── Compose phase ── */
  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Top bar */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 20px", borderBottom: "1px solid var(--border-default)",
        background: "var(--bg-surface)", flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => nav("/app/campaigns")} style={{
            display: "flex", alignItems: "center", gap: 4, border: "none",
            background: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: 13,
          }}>
            <ArrowLeft size={14} /> Campaigns
          </button>
          <span style={{ color: "var(--text-tertiary)", fontSize: 13 }}>/</span>
          <input
            value={name} onChange={(e) => setName(e.target.value)}
            style={{
              border: "none", outline: "none", background: "transparent",
              fontSize: 15, fontWeight: 600, color: "var(--text-primary)",
              fontFamily: "var(--font-ui)", width: 200,
            }}
            placeholder="Campaign name"
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => setShowAudience(true)} style={{
            display: "flex", alignItems: "center", gap: 5, padding: "6px 12px",
            borderRadius: "var(--radius-lg)", border: "1px solid var(--border-default)",
            background: selectedLeads.length > 0 ? "var(--color-primary-subtle)" : "var(--bg-surface)",
            color: selectedLeads.length > 0 ? "var(--color-primary)" : "var(--text-secondary)",
            fontSize: 12, fontWeight: 500, cursor: "pointer",
          }}>
            <Users size={13} />
            {selectedLeads.length > 0 ? `${selectedLeads.length} leads` : "Pick audience"}
          </button>
          <button onClick={save} disabled={busy || !html} className="btn-primary" style={{
            padding: "6px 14px", fontSize: 12, display: "flex", alignItems: "center", gap: 5,
          }}>
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save & Generate
          </button>
        </div>
      </div>

      {/* Main: two columns */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* LEFT: Controls */}
        <div style={{
          width: 380, flexShrink: 0, borderRight: "1px solid var(--border-default)",
          display: "flex", flexDirection: "column", background: "var(--bg-surface)",
          overflow: "auto",
        }}>
          {/* Compose mode selector */}
          <div style={{ padding: 12, borderBottom: "1px solid var(--border-subtle)" }}>
            <div style={{
              display: "flex", gap: 4, padding: 3, borderRadius: "var(--radius-lg)",
              background: "var(--bg-surface-sunken)", border: "1px solid var(--border-subtle)",
            }}>
              {[
                { key: "template", label: "Templates" },
                { key: "ai", label: "AI Generate" },
                { key: "html", label: "HTML Code" },
              ].map((m) => (
                <button
                  key={m.key}
                  onClick={() => { setComposeMode(m.key); if (m.key === "template") setShowTemplates(true); }}
                  style={{
                    flex: 1, padding: "6px 8px", borderRadius: "var(--radius-md)",
                    border: "none", fontSize: 12, fontWeight: 500, cursor: "pointer",
                    background: composeMode === m.key ? "var(--bg-surface)" : "transparent",
                    color: composeMode === m.key ? "var(--color-primary)" : "var(--text-secondary)",
                    boxShadow: composeMode === m.key ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
                    transition: "all 150ms ease",
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Subject */}
          <div style={{ padding: 16, borderBottom: "1px solid var(--border-subtle)" }}>
            <label style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: 6 }}>
              Subject line
            </label>
            <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 6 }}>
              <input
                id="marketing-subject-input"
                value={subject} onChange={(e) => setSubject(e.target.value)}
                placeholder="Enter subject line — use {{variables}}"
                style={{
                  flex: 1, padding: "8px 12px", borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-default)", fontSize: 14, outline: "none",
                  fontWeight: 500, color: "var(--text-primary)",
                }}
              />
              <button
                onClick={() => setShowSubjectVars((v) => !v)}
                title="Insert variable"
                style={{
                  display: "flex", alignItems: "center", gap: 4, padding: "7px 10px",
                  borderRadius: "var(--radius-md)", border: "1px solid var(--border-default)",
                  background: showSubjectVars ? "var(--color-primary-subtle)" : "var(--bg-surface)",
                  color: showSubjectVars ? "var(--color-primary)" : "var(--text-secondary)",
                  cursor: "pointer", fontSize: 11, fontWeight: 500, flexShrink: 0,
                }}
              >
                <Variable size={11} /> {"{{}}"}
              </button>
              {showSubjectVars && (
                <div style={{ position: "absolute", top: "100%", right: 0, marginTop: 6, zIndex: 20 }}>
                  <VariablePicker
                    onSelect={(v) => {
                      const input = document.getElementById("marketing-subject-input");
                      const token = `{{${v.key}}}`;
                      const start = input?.selectionStart ?? subject.length;
                      const end = input?.selectionEnd ?? start;
                      const next = subject.slice(0, start) + token + subject.slice(end);
                      setSubject(next);
                      setShowSubjectVars(false);
                      setTimeout(() => { input?.focus(); const pos = start + token.length; input?.setSelectionRange(pos, pos); }, 0);
                    }}
                    onClose={() => setShowSubjectVars(false)}
                  />
                </div>
              )}
            </div>
            <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 4 }}>Supports {"{{first_name}}"}, {"{{company_name}}"} — click {"{{}}"}.</div>
            <label style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginTop: 10, marginBottom: 6 }}>
              Preview text
            </label>
            <input
              value={previewText} onChange={(e) => setPreviewText(e.target.value)}
              placeholder="Shows in inbox before email is opened"
              style={{
                width: "100%", padding: "8px 12px", borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-default)", fontSize: 12, outline: "none",
                color: "var(--text-secondary)",
              }}
            />
          </div>

          {/* AI Generate */}
          {composeMode === "ai" && (
          <div style={{ padding: 16, borderBottom: "1px solid var(--border-subtle)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <Sparkles size={13} style={{ color: "var(--color-intel)" }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>AI Generate</span>
            </div>
            <textarea
              value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="Describe the email you want... e.g. 'Product launch announcement for our new AI tool, targeting CTOs, emphasize time savings'"
              rows={3}
              style={{
                width: "100%", padding: "8px 12px", borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-default)", fontSize: 12, outline: "none",
                resize: "vertical", fontFamily: "var(--font-ui)", lineHeight: "18px",
                color: "var(--text-primary)",
              }}
            />
            <button onClick={generateWithAi} disabled={generatingAi} style={{
              width: "100%", marginTop: 8, padding: "7px 12px", borderRadius: "var(--radius-md)",
              border: "1px solid var(--color-intel-border)", background: "var(--color-intel-subtle)",
              color: "var(--color-intel-text)", fontSize: 12, fontWeight: 500, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
            }}>
              {generatingAi ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              {generatingAi ? "Generating..." : "Generate Email"}
            </button>
          </div>
          )}

          {/* HTML Code mode */}
          {composeMode === "html" && (
          <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
            <div style={{ padding: 16, borderBottom: "1px solid var(--border-subtle)", flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Code2 size={13} style={{ color: "var(--color-primary)" }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>Paste HTML Code</span>
                </div>
                <span style={{ fontSize: 10, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{html.length} chars</span>
              </div>
              <textarea
                id="marketing-html-input"
                value={html}
                onChange={(e) => setHtml(e.target.value)}
                placeholder={"<div style=\"font-family:system-ui;max-width:600px;margin:0 auto;padding:32px;\">\n  <h1>Your full HTML email here</h1>\n  <p>Supports {{first_name}}, {{company_name}} placeholders</p>\n</div>"}
                spellCheck={false}
                style={{
                  flex: 1, width: "100%", minHeight: 320, padding: "10px 12px",
                  borderRadius: "var(--radius-md)", border: "1px solid var(--border-default)",
                  fontSize: 12, outline: "none", resize: "none",
                  fontFamily: "var(--font-mono)", lineHeight: "18px",
                  color: "var(--text-primary)", background: "var(--bg-surface-sunken)",
                  whiteSpace: "pre", overflow: "auto",
                }}
              />
              <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 6, lineHeight: "15px" }}>
                Paste the full HTML of your email. It renders live in the preview on the right.
                Use <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-primary)" }}>{"{{first_name}}"}</span>,{" "}
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-primary)" }}>{"{{company_name}}"}</span> placeholders.
              </div>
            </div>
          </div>
          )}

          {/* Templates */}
          {composeMode === "template" && (
          <div style={{ padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", marginBottom: 10 }}>
              Templates
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {HTML_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  onClick={() => applyTemplate(tpl)}
                  style={{
                    padding: "10px 12px", borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-default)", background: "var(--bg-surface)",
                    cursor: "pointer", textAlign: "left", transition: "all 150ms ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = tpl.color;
                    e.currentTarget.style.boxShadow = `0 0 0 1px ${tpl.color}20`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--border-default)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-primary)" }}>{tpl.name}</div>
                </button>
              ))}
            </div>

            {/* Signature */}
            <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 12 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-primary)", display: "block", marginBottom: 8 }}>Signature</label>
              <SignaturePicker
                signatureId={signatureId}
                onSelect={setSignatureId}
                includeSignature={includeSignature}
                onToggleInclude={setIncludeSignature}
              />
            </div>
          </div>
          )}
        </div>

        {/* RIGHT: Live preview */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "var(--bg-surface-sunken)" }}>
          {/* Preview toolbar */}
          <div style={{
            display: "flex", alignItems: "center", gap: 6, padding: "8px 16px",
            borderBottom: "1px solid var(--border-subtle)", flexShrink: 0,
          }}>
            <Eye size={13} style={{ color: "var(--text-tertiary)" }} />
            <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", marginRight: 8 }}>Preview</span>
            {[
              { key: "desktop", icon: Monitor, label: "Desktop" },
              { key: "mobile", icon: Smartphone, label: "Mobile" },
              { key: "auto", icon: Maximize2, label: "Auto fit" },
            ].map((mode) => (
              <button
                key={mode.key}
                onClick={() => setPreviewMode(mode.key)}
                style={{
                  padding: "4px 10px", borderRadius: "var(--radius-sm)",
                  border: "1px solid", cursor: "pointer", fontSize: 11,
                  display: "flex", alignItems: "center", gap: 4,
                  borderColor: previewMode === mode.key ? "var(--color-primary)" : "var(--border-default)",
                  background: previewMode === mode.key ? "var(--color-primary-subtle)" : "transparent",
                  color: previewMode === mode.key ? "var(--color-primary)" : "var(--text-tertiary)",
                }}
              >
                <mode.icon size={11} /> {mode.label}
              </button>
            ))}
            <div style={{ marginLeft: "auto" }} />
            <button
              onClick={() => setDarkPreview(v => !v)}
              style={{
                padding: "4px 10px", borderRadius: "var(--radius-sm)",
                border: "1px solid", cursor: "pointer", fontSize: 11,
                display: "flex", alignItems: "center", gap: 4,
                borderColor: darkPreview ? "var(--color-primary)" : "var(--border-default)",
                background: darkPreview ? "var(--color-primary-subtle)" : "transparent",
                color: darkPreview ? "var(--color-primary)" : "var(--text-tertiary)",
              }}
            >
              <Moon size={11} /> Dark preview
            </button>
          </div>

          {/* Preview area */}
          <div style={{ flex: 1, overflow: "auto", padding: 20, display: "flex", justifyContent: "center", alignItems: "flex-start" }}>
            {html ? (
              <div style={{
                width: previewMode === "mobile" ? 375 : previewMode === "auto" ? "fit-content" : 600,
                minWidth: previewMode === "auto" ? "fit-content" : undefined,
                borderRadius: "var(--radius-xl)",
                border: "1px solid var(--border-default)",
                background: "#fff",
                overflow: "hidden",
                transition: "width 300ms ease",
                boxShadow: "var(--shadow-md)",
                ...(darkPreview ? { filter: DARK_FILTER } : {}),
              }}>
                {/* Inbox header */}
                <div style={{
                  padding: "10px 16px", borderBottom: "1px solid var(--border-subtle)",
                  background: "#fafafa",
                }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "#111" }}>{subject || "(no subject)"}</div>
                  <div style={{ fontSize: 11, color: "#6B7280" }}>{previewText || ""}</div>
                </div>
                {/* Email body */}
                <div
                  dangerouslySetInnerHTML={{ __html: revealEmailFragment(html) + UNSUB_FOOTER_PREVIEW }}
                  style={{ background: "#fff" }}
                />
              </div>
            ) : (
              <div style={{
                display: "flex", flexDirection: "column", alignItems: "center",
                justifyContent: "center", padding: 60, gap: 12,
              }}>
                <Megaphone size={32} style={{ color: "var(--text-disabled)" }} strokeWidth={1.5} />
                <p style={{ fontSize: 13, color: "var(--text-tertiary)", textAlign: "center" }}>
                  Pick a template or use AI to generate your email
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Audience picker */}
      {showAudience && (
        <AudiencePicker
          selectedLeads={selectedLeads}
          onSelect={setSelectedLeads}
          onClose={() => setShowAudience(false)}
        />
      )}
    </div>
  );
}
