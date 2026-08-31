/**
 * PlainCampaignBuilder — /campaigns/create/plain
 *
 * Simple, focused campaign builder:
 *  1. Write your emails (steps with subject + body)
 *  2. Pick your audience
 *  3. Save → auto-generates → review + approve + launch
 *
 * No AI panels, no templates, no overwhelming tabs.
 */
import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { toast } from "sonner";
import {
  ArrowLeft, Save, Plus, Trash2, Mail, Users, Settings,
  Loader2, Play, Check, Eye, RotateCw, Send, Variable,
} from "lucide-react";
import RichEmailEditor, { sanitizeEmailHtml } from "../../components/RichEmailEditor";
import CampaignReview from "./CampaignReview";
import AudiencePicker from "./AudiencePicker";
import SignaturePicker from "./SignaturePicker";
import VariablePicker from "./VariablePicker";

const stepKey = () => `s_${Math.random().toString(36).slice(2, 10)}`;

const DEFAULT_STEP = () => ({
  _key: stepKey(), channel: "email", day: 0, condition: "always",
  subject: "", body_html: "<p></p>", body: "",
});

const TIMEZONES = [
  "UTC", "US/Eastern", "US/Central", "US/Mountain", "US/Pacific",
  "US/Alaska", "US/Hawaii", "Canada/Atlantic", "Canada/Newfoundland",
  "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Madrid",
  "Europe/Rome", "Europe/Amsterdam", "Europe/Stockholm", "Europe/Moscow",
  "Asia/Almaty", "Asia/Amman", "Asia/Aqtau", "Asia/Aqtobe", "Asia/Ashgabat",
  "Asia/Baghdad", "Asia/Bahrain", "Asia/Baku", "Asia/Bangkok", "Asia/Beirut",
  "Asia/Bishkek", "Asia/Colombo", "Asia/Damascus", "Asia/Dhaka", "Asia/Dili",
  "Asia/Dubai", "Asia/Dushanbe", "Asia/Ho_Chi_Minh", "Asia/Hong_Kong",
  "Asia/Irkutsk", "Asia/Jakarta", "Asia/Jayapura", "Asia/Jerusalem",
  "Asia/Kabul", "Asia/Kamchatka", "Asia/Karachi", "Asia/Kathmandu",
  "Asia/Kolkata", "Asia/Krasnoyarsk", "Asia/Kuala_Lumpur", "Asia/Kuwait",
  "Asia/Macau", "Asia/Magadan", "Asia/Makassar", "Asia/Manila",
  "Asia/Muscat", "Asia/Nicosia", "Asia/Novosibirsk", "Asia/Oral",
  "Asia/Phnom_Penh", "Asia/Pyongyang", "Asia/Qatar", "Asia/Riyadh",
  "Asia/Sakhalin", "Asia/Samarkand", "Asia/Seoul", "Asia/Shanghai",
  "Asia/Singapore", "Asia/Taipei", "Asia/Tashkent", "Asia/Tbilisi",
  "Asia/Tehran", "Asia/Thimphu", "Asia/Tokyo", "Asia/Ulaanbaatar",
  "Asia/Vientiane", "Asia/Vladivostok", "Asia/Yakutsk", "Asia/Yangon",
  "Asia/Yekaterinburg", "Asia/Yerevan",
  "Australia/Sydney", "Australia/Melbourne", "Australia/Perth",
  "Pacific/Auckland", "Pacific/Fiji", "America/Sao_Paulo",
  "America/Mexico_City", "America/Argentina/Buenos_Aires",
  "Africa/Cairo", "Africa/Lagos", "Africa/Johannesburg",
];

const htmlToText = (html) => {
  const el = document.createElement("div");
  el.innerHTML = sanitizeEmailHtml(html);
  el.querySelectorAll("p, li").forEach((n) => n.append("\n"));
  return (el.textContent || "").replace(/\n{4,}/g, "\n\n\n").trim();
};

export default function PlainCampaignBuilder() {
  const { id } = useParams();
  const nav = useNavigate();
  const [phase, setPhase] = useState(id ? "review" : "compose"); // compose | review
  const [name, setName] = useState("Untitled campaign");
  const [goal, setGoal] = useState("Book meetings");
  const [steps, setSteps] = useState([DEFAULT_STEP()]);
  const [activeStep, setActiveStep] = useState(0);
  const [selectedLeads, setSelectedLeads] = useState([]);
  const [signatureId, setSignatureId] = useState("");
  const [includeSignature, setIncludeSignature] = useState(true);
  const [sendWindowStart, setSendWindowStart] = useState("09:00");
  const [sendWindowEnd, setSendWindowEnd] = useState("17:00");
  const [timezone, setTimezone] = useState("UTC");
  const [busy, setBusy] = useState(false);
  const [savedCampaignId, setSavedCampaignId] = useState(id || null);
  const [showAudience, setShowAudience] = useState(false);
  const [showSubjectVars, setShowSubjectVars] = useState(false);

  useEffect(() => {
    if (id) {
      api.get(`/campaigns/${id}`).then((r) => {
        const c = r.data;
        setName(c.name);
        setGoal(c.goal || "");
        setSteps(c.steps?.length ? c.steps.map((s) => ({
          ...s, _key: s._key || stepKey(),
          body_html: s.body_html || (s.body ? "<p>" + s.body.replace(/\n\n+/g, "</p><p>").replace(/\n/g, "<br/>") + "</p>" : ""),
        })) : [DEFAULT_STEP()]);
        setSelectedLeads(c.lead_ids || []);
        if (c.signature_id) { setSignatureId(c.signature_id); setIncludeSignature(true); }
        if (c.send_window_start) setSendWindowStart(c.send_window_start);
        if (c.send_window_end) setSendWindowEnd(c.send_window_end);
        if (c.timezone) setTimezone(c.timezone);
      });
    }
  }, [id]);

  const updateStep = useCallback((idx, patch) => {
    setSteps((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }, []);

  const addStep = () => {
    const lastDay = steps[steps.length - 1]?.day || 0;
    setSteps([...steps, { ...DEFAULT_STEP(), day: lastDay + 3 }]);
    setActiveStep(steps.length);
  };

  const removeStep = (idx) => {
    if (steps.length <= 1) return;
    setSteps(steps.filter((_, i) => i !== idx));
    setActiveStep(Math.min(activeStep, steps.length - 2));
  };

  const save = async () => {
    setBusy(true);
    try {
      const cleanSteps = steps.map(({ _key, ...rest }) => ({
        ...rest,
        body_html: sanitizeEmailHtml(rest.body_html || rest.body || ""),
        body_text: htmlToText(rest.body_html || "") || rest.body || "",
      }));
      const payload = {
        name, goal, campaign_type: "blank", steps: cleanSteps,
        lead_ids: selectedLeads,
        signature_id: includeSignature ? signatureId : null,
        send_window_start: sendWindowStart, send_window_end: sendWindowEnd,
        timezone,
      };
      let cid = savedCampaignId;
      if (!cid) {
        const { data } = await api.post("/campaigns", payload);
        cid = data.id;
        setSavedCampaignId(cid);
        window.history.replaceState(null, "", `/app/campaigns/${cid}`);
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
      setPhase("review");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Save failed");
    }
    setBusy(false);
  };

  const currentStep = steps[activeStep] || steps[0];

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
          <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: "var(--radius-full)", background: "var(--bg-surface-sunken)", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
            {steps.length} steps
          </span>
        </div>
        <div style={{ flex: 1, overflow: "hidden" }}>
          <CampaignReview campaignId={savedCampaignId} />
        </div>
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
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{
              border: "none", outline: "none", background: "transparent",
              fontSize: 15, fontWeight: 600, color: "var(--text-primary)",
              fontFamily: "var(--font-ui)", width: 240,
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
          <button onClick={save} disabled={busy} className="btn-primary" style={{
            padding: "6px 14px", fontSize: 12, display: "flex", alignItems: "center", gap: 5,
          }}>
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save & Generate
          </button>
        </div>
      </div>

      {/* Main content — two columns */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* LEFT: Step list */}
        <div style={{
          width: 240, flexShrink: 0, borderRight: "1px solid var(--border-default)",
          display: "flex", flexDirection: "column", background: "var(--bg-surface)",
        }}>
          <div style={{ padding: "10px 14px 6px", fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Sequence ({steps.length} steps)
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: "0 10px 10px" }}>
            {steps.map((step, i) => (
              <div
                key={step._key}
                onClick={() => setActiveStep(i)}
                style={{
                  padding: "10px 12px", borderRadius: "var(--radius-md)", marginBottom: 4,
                  border: "1px solid", cursor: "pointer", transition: "all 100ms ease",
                  borderColor: i === activeStep ? "var(--color-primary)" : "transparent",
                  background: i === activeStep ? "var(--color-primary-subtle)" : "transparent",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: "var(--radius-full)",
                    background: i === activeStep ? "var(--color-primary)" : "var(--bg-surface-sunken)",
                    color: i === activeStep ? "#fff" : "var(--text-tertiary)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, fontWeight: 600, fontFamily: "var(--font-mono)", flexShrink: 0,
                  }}>
                    {i + 1}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {step.subject || `Step ${i + 1}`}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
                      Day {step.day}
                    </div>
                  </div>
                  {steps.length > 1 && (
                    <button onClick={(e) => { e.stopPropagation(); removeStep(i); }} style={{
                      border: "none", background: "none", padding: 3, cursor: "pointer",
                      color: "var(--text-disabled)", borderRadius: "var(--radius-sm)",
                    }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-danger)")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-disabled)")}
                    >
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>
              </div>
            ))}
            <button onClick={addStep} style={{
              width: "100%", padding: "8px 12px", borderRadius: "var(--radius-md)",
              border: "1px dashed var(--border-default)", background: "transparent",
              cursor: "pointer", fontSize: 12, color: "var(--text-secondary)",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              transition: "all 150ms ease",
            }}>
              <Plus size={12} /> Add step
            </button>
          </div>

          {/* Settings at bottom */}
          <div style={{ borderTop: "1px solid var(--border-subtle)", padding: 12, overflow: "auto" }}>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 10, fontWeight: 500, color: "var(--text-tertiary)", display: "block", marginBottom: 3 }}>Send window</label>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input type="time" value={sendWindowStart} onChange={(e) => setSendWindowStart(e.target.value)} style={{ padding: "4px 6px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-default)", fontSize: 11, fontFamily: "var(--font-mono)" }} />
                <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>to</span>
                <input type="time" value={sendWindowEnd} onChange={(e) => setSendWindowEnd(e.target.value)} style={{ padding: "4px 6px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-default)", fontSize: 11, fontFamily: "var(--font-mono)" }} />
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 10, fontWeight: 500, color: "var(--text-tertiary)", display: "block", marginBottom: 3 }}>Timezone</label>
              <select value={timezone} onChange={(e) => setTimezone(e.target.value)} style={{ width: "100%", padding: "4px 6px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-default)", fontSize: 11 }}>
                {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            </div>
            <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 10 }}>
              <label style={{ fontSize: 10, fontWeight: 500, color: "var(--text-tertiary)", display: "block", marginBottom: 6 }}>Signature</label>
              <SignaturePicker
                signatureId={signatureId}
                onSelect={setSignatureId}
                includeSignature={includeSignature}
                onToggleInclude={setIncludeSignature}
              />
            </div>
          </div>
        </div>

        {/* RIGHT: Email editor */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Step header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 20px", borderBottom: "1px solid var(--border-subtle)",
          }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)" }}>
              Step {activeStep + 1} of {steps.length}
            </span>
            <label style={{ fontSize: 11, color: "var(--text-tertiary)", display: "flex", alignItems: "center", gap: 4 }}>
              Day
              <input
                type="number" min={0}
                value={currentStep?.day || 0}
                onChange={(e) => updateStep(activeStep, { day: parseInt(e.target.value, 10) || 0 })}
                style={{ width: 50, padding: "3px 6px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-default)", fontSize: 11, fontFamily: "var(--font-mono)", textAlign: "center" }}
              />
            </label>
          </div>

          {/* Editor */}
          <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
            <div style={{ maxWidth: 600, margin: "0 auto" }}>
              {/* Subject */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: 6 }}>Subject</label>
                <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    id="plain-subject-input"
                    value={currentStep?.subject || ""}
                    onChange={(e) => updateStep(activeStep, { subject: e.target.value })}
                    placeholder="Enter subject line — use {{variables}}"
                    style={{
                      flex: 1, padding: "10px 14px", borderRadius: "var(--radius-lg)",
                      border: "1px solid var(--border-default)", background: "var(--bg-surface)",
                      fontSize: 15, fontWeight: 500, color: "var(--text-primary)",
                      fontFamily: "var(--font-display)", outline: "none",
                    }}
                  />
                  <button
                    onClick={() => setShowSubjectVars((v) => !v)}
                    title="Insert variable"
                    style={{
                      display: "flex", alignItems: "center", gap: 4, padding: "8px 10px",
                      borderRadius: "var(--radius-md)", border: "1px solid var(--border-default)",
                      background: showSubjectVars ? "var(--color-primary-subtle)" : "var(--bg-surface)",
                      color: showSubjectVars ? "var(--color-primary)" : "var(--text-secondary)",
                      cursor: "pointer", fontSize: 11, fontWeight: 500, flexShrink: 0,
                    }}
                  >
                    <Variable size={12} /> {"{{}}"}
                  </button>
                  {showSubjectVars && (
                    <div style={{ position: "absolute", top: "100%", right: 0, marginTop: 6, zIndex: 20 }}>
                      <VariablePicker
                        onSelect={(v) => {
                          const input = document.getElementById("plain-subject-input");
                          const token = `{{${v.key}}}`;
                          const start = input?.selectionStart ?? (currentStep?.subject || "").length;
                          const end = input?.selectionEnd ?? start;
                          const cur = currentStep?.subject || "";
                          const next = cur.slice(0, start) + token + cur.slice(end);
                          updateStep(activeStep, { subject: next });
                          setShowSubjectVars(false);
                          setTimeout(() => { input?.focus(); const pos = start + token.length; input?.setSelectionRange(pos, pos); }, 0);
                        }}
                        onClose={() => setShowSubjectVars(false)}
                      />
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 4 }}>Supports variables like {"{{first_name}}"}, {"{{company_name}}"} — click {"{{}}"} to insert.</div>
              </div>
              {/* Body */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: 6 }}>Body</label>
                <div style={{ borderRadius: "var(--radius-lg)", border: "1px solid var(--border-default)", overflow: "hidden", background: "var(--bg-surface)" }}>
                  <RichEmailEditor
                    value={currentStep?.body_html || ""}
                    onChange={(html) => {
                      const el = document.createElement("div");
                      el.innerHTML = sanitizeEmailHtml(html);
                      el.querySelectorAll("p, li").forEach((n) => n.append("\n"));
                      const text = (el.textContent || "").replace(/\n{4,}/g, "\n\n\n").trim();
                      updateStep(activeStep, { body_html: html, body: text });
                    }}
                  />
                </div>
              </div>
            </div>
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
