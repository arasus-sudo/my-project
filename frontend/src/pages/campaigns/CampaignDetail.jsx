/**
 * CampaignDetail — /campaigns/:id
 *
 * 3-tab campaign management page (like Lemlist):
 *   Sequence — edit email steps
 *   Leads    — add/remove leads, see selection
 *   Launch   — preview emails, approve/reject, test, launch
 *
 * Responsive: sidebar collapses on small screens, bottom bar is sticky not fixed.
 * Multi-channel: Email, Phone Call, SMS, WhatsApp, LinkedIn Connect, LinkedIn Message, LinkedIn Comment.
 */
import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { toast } from "sonner";
import {
  ArrowLeft, Edit2, Loader2, Mail, Users, Play, Settings,
  Plus, Trash2, ChevronDown, Check, X, Send, RefreshCw, Pause,
  Phone, MessageSquare, Linkedin, Smartphone, Bot,
} from "lucide-react";
import RichEmailEditor, { sanitizeEmailHtml } from "../../components/RichEmailEditor";
import AudiencePicker from "./AudiencePicker";
import SignaturePicker from "./SignaturePicker";
import CampaignReview from "./CampaignReview";

const stepKey = () => `s_${Math.random().toString(36).slice(2, 10)}`;

const CHANNELS = [
  { value: "email", label: "Email", icon: Mail },
  { value: "phone_call", label: "Phone Call", icon: Phone },
  { value: "sms", label: "SMS", icon: Smartphone },
  { value: "whatsapp", label: "WhatsApp", icon: MessageSquare },
  { value: "linkedin_connect", label: "LinkedIn Connect", icon: Linkedin },
  { value: "linkedin_message", label: "LinkedIn Message", icon: Linkedin },
  { value: "linkedin_comment", label: "LinkedIn Comment", icon: Linkedin },
];

const getChannelInfo = (ch) => CHANNELS.find((c) => c.value === ch) || CHANNELS[0];

export default function CampaignDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [campaign, setCampaign] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("sequence");
  const [steps, setSteps] = useState([]);
  const [activeStep, setActiveStep] = useState(0);
  const [name, setName] = useState("");
  const [selectedLeads, setSelectedLeads] = useState([]);
  const [showAudience, setShowAudience] = useState(false);
  const [signatureId, setSignatureId] = useState("");
  const [includeSignature, setIncludeSignature] = useState(true);
  const [busy, setBusy] = useState(false);
  const [signatures, setSignatures] = useState([]);
  const [sendWindowStart, setSendWindowStart] = useState("09:00");
  const [sendWindowEnd, setSendWindowEnd] = useState("17:00");
  const [timezone, setTimezone] = useState("UTC");
  const [leadDetails, setLeadDetails] = useState([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [leadMap, setLeadMap] = useState({});

  const loadCampaign = useCallback(() => {
    if (!id) return;
    api.get(`/campaigns/${id}`).then((r) => {
      const c = r.data;
      setCampaign(c);
      setName(c.name || "");
      setSteps(c.steps?.length ? c.steps.map((s) => ({
        ...s, _key: s._key || stepKey(),
        body_html: s.body_html || (s.body ? "<p>" + s.body.replace(/\n\n+/g, "</p><p>").replace(/\n/g, "<br/>") + "</p>" : ""),
      })) : [{ _key: stepKey(), channel: "email", day: 0, condition: "always", subject: "", body_html: "<p></p>", body: "" }]);
      setSelectedLeads(c.lead_ids || []);
      if (c.signature_id) { setSignatureId(c.signature_id); setIncludeSignature(true); }
      if (c.send_window_start) setSendWindowStart(c.send_window_start);
      if (c.send_window_end) setSendWindowEnd(c.send_window_end);
      if (c.timezone) setTimezone(c.timezone);
      setLoading(false);
      if (c.lead_ids?.length) {
        api.get(`/campaigns/${id}/leads`).then((r) => setLeadDetails(r.data.leads || [])).catch(() => {});
      }
    }).catch(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    loadCampaign();
    api.get("/signatures").then((r) => setSignatures(r.data || [])).catch(() => {});
  }, [loadCampaign]);

  // Fetch details for selected leads not yet in campaign (not yet saved) so the Lead tab shows names, not raw IDs like "21417da1..."
  useEffect(() => {
    const missing = selectedLeads.filter((lid) => !leadDetails.find((l) => l.id === lid) && !leadMap[lid]);
    if (missing.length === 0) return;
    Promise.all(missing.map((lid) => api.get(`/leads/${lid}`).then((r) => r.data).catch(() => null))).then((results) => {
      const map = {};
      results.forEach((r) => { if (r && r.id) map[r.id] = r; });
      if (Object.keys(map).length) setLeadMap((prev) => ({ ...prev, ...map }));
    });
  }, [selectedLeads, leadDetails, leadMap]);

  const updateStep = useCallback((idx, patch) => {
    setSteps((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }, []);

  const addStep = () => {
    const lastDay = steps[steps.length - 1]?.day || 0;
    setSteps([...steps, { _key: stepKey(), channel: "email", day: lastDay + 3, condition: "always", subject: "", body_html: "<p></p>", body: "" }]);
    setActiveStep(steps.length);
  };

  const removeStep = (idx) => {
    if (steps.length <= 1) return;
    setSteps(steps.filter((_, i) => i !== idx));
    setActiveStep(Math.min(activeStep, steps.length - 2));
  };

  const saveSteps = async () => {
    setBusy(true);
    try {
      const cleanSteps = steps.map(({ _key, ...rest }) => {
        try {
          return {
            ...rest,
            body_html: sanitizeEmailHtml(rest.body_html || rest.body || ""),
            body_text: (rest.body_html || "").replace(/<[^>]*>/g, "").trim() || rest.body || "",
          };
        } catch (e) {
          console.error("sanitize failed for step", rest, e);
          return { ...rest, body_html: rest.body_html || "", body_text: rest.body || "" };
        }
      });
      await api.put(`/campaigns/${id}`, {
        name, goal: campaign?.goal || "Book meetings",
        campaign_type: campaign?.campaign_type || "plain",
        steps: cleanSteps,
        lead_ids: selectedLeads,
        signature_id: includeSignature ? signatureId : null,
        send_window_start, send_window_end, timezone,
      });
      toast.success("Saved");
      loadCampaign();
      // Auto-generate preview emails if leads were added and none exist yet
      if (selectedLeads.length > 0) {
        try {
          const gen = await api.post(`/campaigns/${id}/run-engine`);
          if (gen.data?.generated || gen.data?.generating) {
            toast.success(gen.data.job_id ? `Generating ${gen.data.generating} emails` : `Emails ready for ${gen.data.generated} leads`);
          }
        } catch (genErr) {
          console.warn("auto run-engine failed", genErr?.response?.data || genErr.message);
        }
      }
    } catch (err) {
      console.error("saveSteps failed", err, err?.response?.data);
      toast.error(err?.response?.data?.detail || JSON.stringify(err?.response?.data) || "Save failed");
    }
    setBusy(false);
  };

  const htmlToText = (html) => {
    const el = document.createElement("div");
    el.innerHTML = sanitizeEmailHtml(html || "");
    el.querySelectorAll("p, li").forEach((n) => n.append("\n"));
    return (el.textContent || "").replace(/\n{4,}/g, "\n\n\n").trim();
  };

  const isNonEmailChannel = (ch) => ch !== "email";

  if (loading) {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 size={20} className="animate-spin" style={{ color: "var(--text-tertiary)" }} />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div style={{ height: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
        <p style={{ fontSize: 14, color: "var(--text-tertiary)" }}>Campaign not found</p>
        <button onClick={() => nav("/app/campaigns")} style={{ color: "var(--color-primary)", border: "none", background: "none", cursor: "pointer" }}>Back to Campaigns</button>
      </div>
    );
  }

  const TABS = [
    { id: "sequence", label: "Sequence", icon: Mail, desc: "Edit steps" },
    { id: "leads", label: "Leads", icon: Users, desc: `${selectedLeads.length} leads` },
    { id: "launch", label: "Launch", icon: Play, desc: "Preview & approve" },
  ];

  const currentStep = steps[activeStep];
  const currentChannel = getChannelInfo(currentStep?.channel);

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 20px", borderBottom: "1px solid var(--border-default)",
        background: "var(--bg-surface)", flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <button onClick={() => nav("/app/campaigns")} style={{
            display: "flex", alignItems: "center", gap: 4, border: "none",
            background: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: 13,
            flexShrink: 0,
          }}>
            <ArrowLeft size={14} /> <span className="hide-mobile">Campaigns</span>
          </button>
          <span style={{ color: "var(--text-tertiary)", fontSize: 13 }} className="hide-mobile">/</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{
              fontSize: 15, fontWeight: 600, color: "var(--text-primary)",
              border: "none", background: "none", outline: "none", padding: "2px 4px",
              borderRadius: "var(--radius-sm)", minWidth: 120, flex: 1, maxWidth: 300,
            }}

          />
          <span style={{
            fontSize: 10, padding: "2px 8px", borderRadius: "var(--radius-full)",
            background: "var(--bg-surface-sunken)", color: "var(--text-tertiary)",
            fontFamily: "var(--font-mono)", textTransform: "capitalize", flexShrink: 0,
          }}>
            {campaign.campaign_type?.replace("_", " ") || "plain"}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
            {steps.length} steps · {selectedLeads.length} leads
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        display: "flex", gap: 0, borderBottom: "1px solid var(--border-default)",
        background: "var(--bg-surface)", flexShrink: 0,
      }}>
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1, padding: "10px 12px", display: "flex", alignItems: "center",
                justifyContent: "center", gap: 6, border: "none", cursor: "pointer",
                background: "none", borderBottom: isActive ? "2px solid var(--color-primary)" : "2px solid transparent",
                color: isActive ? "var(--color-primary)" : "var(--text-secondary)",
                fontSize: 13, fontWeight: isActive ? 600 : 400,
                fontFamily: "var(--font-ui)", transition: "all 150ms ease",
              }}
            >
              <Icon size={14} />
              <span>{tab.label}</span>
              <span style={{ fontSize: 10, color: "var(--text-tertiary)", marginLeft: 4 }} className="hide-mobile">
                {tab.desc}
              </span>
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {/* ── SEQUENCE TAB ── */}
        {activeTab === "sequence" && (
          <div style={{ display: "flex", height: "100%" }}>
            {/* Step list sidebar */}
            <div className="cd-sidebar" style={{
              width: sidebarCollapsed ? 48 : 220, flexShrink: 0, borderRight: "1px solid var(--border-default)",
              display: "flex", flexDirection: "column", background: "var(--bg-surface)",
              transition: "width 200ms ease", overflow: "hidden",
            }}>
              <div style={{ padding: sidebarCollapsed ? "10px 6px" : "10px 14px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: sidebarCollapsed ? "center" : "space-between" }}>
                {!sidebarCollapsed && (
                  <button onClick={addStep} style={{
                    flex: 1, padding: "7px 12px", borderRadius: "var(--radius-lg)",
                    border: "1px dashed var(--border-default)", background: "none",
                    color: "var(--text-secondary)", fontSize: 12, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                  }}>
                    <Plus size={12} /> Add Step
                  </button>
                )}
                <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                  className="cd-collapse-toggle"
                  style={{
                    border: "none", background: "none", cursor: "pointer",
                    color: "var(--text-tertiary)", padding: 4, marginLeft: sidebarCollapsed ? 0 : 6,
                    flexShrink: 0,
                  }}>
                  <ChevronDown size={14} style={{ transform: sidebarCollapsed ? "rotate(-90deg)" : "rotate(90deg)", transition: "transform 200ms" }} />
                </button>
              </div>
              <div style={{ flex: 1, overflow: "auto" }}>
                {steps.map((step, i) => {
                  const chInfo = getChannelInfo(step.channel);
                  const ChIcon = chInfo.icon;
                  return (
                    <div
                      key={step._key}
                      onClick={() => setActiveStep(i)}
                      style={{
                        padding: sidebarCollapsed ? "8px 6px" : "8px 14px", cursor: "pointer",
                        borderLeft: i === activeStep ? "2px solid var(--color-primary)" : "2px solid transparent",
                        background: i === activeStep ? "var(--bg-active)" : "transparent",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                          <span style={{
                            width: 18, height: 18, borderRadius: "var(--radius-full)",
                            background: i === activeStep ? "var(--color-primary)" : "var(--bg-surface-sunken)",
                            color: i === activeStep ? "#fff" : "var(--text-tertiary)",
                            fontSize: 10, fontWeight: 600, display: "flex",
                            alignItems: "center", justifyContent: "center", flexShrink: 0,
                          }}>{i + 1}</span>
                          {!sidebarCollapsed && (
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {step.subject || `Step ${i + 1}`}
                              </div>
                              <div style={{ fontSize: 10, color: "var(--text-tertiary)", display: "flex", alignItems: "center", gap: 3, marginTop: 1 }}>
                                <ChIcon size={9} /> Day {step.day}
                              </div>
                            </div>
                          )}
                        </div>
                        {!sidebarCollapsed && steps.length > 1 && (
                          <button onClick={(e) => { e.stopPropagation(); removeStep(i); }}
                            style={{ padding: 2, border: "none", background: "none", cursor: "pointer", color: "var(--text-tertiary)", flexShrink: 0 }}>
                            <Trash2 size={11} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {sidebarCollapsed && (
                  <button onClick={addStep} style={{
                    width: "100%", padding: "8px 6px", border: "none", background: "none",
                    cursor: "pointer", color: "var(--text-tertiary)", display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Plus size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* Step editor */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              {currentStep && (
                <>
                  {/* Step settings bar — responsive */}
                  <div style={{
                    display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                    padding: "8px 20px", borderBottom: "1px solid var(--border-subtle)",
                    background: "var(--bg-surface)", flexShrink: 0,
                  }}>
                    <label style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Day</label>
                    <input
                      type="number" min={0}
                      value={currentStep.day || 0}
                      onChange={(e) => updateStep(activeStep, { day: parseInt(e.target.value) || 0 })}
                      style={{
                        width: 50, padding: "4px 8px", borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--border-default)", fontSize: 12,
                        fontFamily: "var(--font-mono)", textAlign: "center",
                      }}
                    />
                    <label style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Channel</label>
                    <select
                      value={currentStep.channel || "email"}
                      onChange={(e) => updateStep(activeStep, { channel: e.target.value })}
                      style={{
                        padding: "4px 8px", borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--border-default)", fontSize: 12,
                        fontFamily: "var(--font-ui)",
                      }}
                    >
                      {CHANNELS.map((ch) => (
                        <option key={ch.value} value={ch.value}>{ch.label}</option>
                      ))}
                    </select>
                    <label style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Condition</label>
                    <select
                      value={currentStep.condition || "always"}
                      onChange={(e) => updateStep(activeStep, { condition: e.target.value })}
                      style={{
                        padding: "4px 8px", borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--border-default)", fontSize: 12,
                      }}
                    >
                      <option value="always">Always send</option>
                      <option value="if_no_reply">If no reply</option>
                      <option value="if_no_open">If no open</option>
                      <option value="if_opened">If opened</option>
                      <option value="if_replied">If replied</option>
                    </select>
                  </div>

                  {/* Editor area — different for email vs other channels */}
                  <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
                    <div style={{ maxWidth: 600, margin: "0 auto" }}>
                      {isNonEmailChannel(currentStep.channel) ? (
                        /* ── Non-email channel: simple text editor ── */
                        <>
                          <div style={{
                            display: "flex", alignItems: "center", gap: 8, marginBottom: 16,
                            padding: "10px 14px", borderRadius: "var(--radius-lg)",
                            background: "var(--bg-surface-sunken)", border: "1px solid var(--border-subtle)",
                          }}>
                            <currentChannel.icon size={16} style={{ color: "var(--color-primary)" }} />
                            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{currentChannel.label}</span>
                            <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>— Day {currentStep.day}</span>
                          </div>
                          <div style={{ marginBottom: 16 }}>
                            <label style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: 6 }}>
                              Message
                            </label>
                            <textarea
                              value={currentStep.body || ""}
                              onChange={(e) => updateStep(activeStep, { body: e.target.value, body_html: e.target.value })}
                              placeholder={`Write your ${currentChannel.label.toLowerCase()} message — use {{first_name}}, {{company}} for personalization`}
                              rows={8}
                              style={{
                                width: "100%", padding: "12px 14px", borderRadius: "var(--radius-lg)",
                                border: "1px solid var(--border-default)", fontSize: 14,
                                fontFamily: "var(--font-ui)", outline: "none", resize: "vertical",
                                lineHeight: "22px", color: "var(--text-primary)",
                              }}
                            />
                            <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 4 }}>
                              Supports variables like {"{{first_name}}"}, {"{{company_name}}"}, {"{{title}}"}
                            </div>
                          </div>
                        </>
                      ) : (
                        /* ── Email channel: subject + rich editor ── */
                        <>
                          <div style={{ marginBottom: 16 }}>
                            <label style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: 6 }}>Subject</label>
                            <input
                              value={currentStep.subject || ""}
                              onChange={(e) => updateStep(activeStep, { subject: e.target.value })}
                              placeholder="Email subject line — use {{first_name}}, {{company}} for personalization"
                              style={{
                                width: "100%", padding: "10px 14px", borderRadius: "var(--radius-lg)",
                                border: "1px solid var(--border-default)", fontSize: 14,
                                fontFamily: "var(--font-ui)", outline: "none", fontWeight: 500,
                              }}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: 6 }}>Body</label>
                            <RichEmailEditor
                              value={currentStep.body_html || ""}
                              onChange={(html) => {
                                const text = htmlToText(html);
                                updateStep(activeStep, { body_html: html, body: text });
                              }}
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── LEADS TAB ── */}
        {activeTab === "leads" && (
          <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
            <div style={{
              padding: "16px 20px", borderBottom: "1px solid var(--border-subtle)",
              display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8,
            }}>
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
                  {selectedLeads.length} lead{selectedLeads.length === 1 ? "" : "s"} selected
                </h3>
                <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: "2px 0 0" }}>
                  Add leads from your CRM lists or import CSV
                </p>
              </div>
              <button onClick={() => setShowAudience(true)} style={{
                padding: "8px 16px", borderRadius: "var(--radius-lg)",
                border: "none", background: "var(--color-primary)", color: "#fff",
                fontSize: 12, fontWeight: 600, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 5,
              }}>
                <Users size={13} /> Pick Leads
              </button>
            </div>

            <div style={{ flex: 1, overflow: "auto", padding: 20 }}>
              {selectedLeads.length === 0 ? (
                <div style={{
                  display: "flex", flexDirection: "column", alignItems: "center",
                  justifyContent: "center", padding: "60px 20px", gap: 12,
                }}>
                  <Users size={32} style={{ color: "var(--text-tertiary)" }} />
                  <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
                    No leads selected yet. Click "Pick Leads" to choose your audience.
                  </p>
                </div>
              ) : (
                <div style={{
                  display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                  gap: 8,
                }}>
                  {selectedLeads.map((lid) => {
                    const detail = leadDetails.find((l) => l.id === lid) || leadMap[lid];
                    const name = detail ? `${detail.first_name || ""} ${detail.last_name || ""}`.trim() : "";
                    const email = detail?.email || "";
                    return (
                      <div key={lid} style={{
                        padding: "10px 14px", borderRadius: "var(--radius-lg)",
                        border: "1px solid var(--border-default)", background: "var(--bg-surface)",
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                      }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {name || email || lid}
                          </div>
                          {email && (
                            <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{email}</div>
                          )}
                          {!detail && !leadMap[lid] && (
                            <div style={{ fontSize: 10, color: "var(--color-warning)", marginTop: 1 }}>Loading…</div>
                          )}
                        </div>
                        <button onClick={() => setSelectedLeads((prev) => prev.filter((x) => x !== lid))}
                          style={{ padding: 2, border: "none", background: "none", cursor: "pointer", color: "var(--text-tertiary)", flexShrink: 0 }}>
                          <X size={12} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={{
              padding: "12px 20px", borderTop: "1px solid var(--border-subtle)",
              display: "flex", justifyContent: "flex-end",
            }}>
              <button onClick={saveSteps} disabled={busy} style={{
                padding: "8px 20px", borderRadius: "var(--radius-lg)",
                border: "none", background: "var(--color-primary)", color: "#fff",
                fontSize: 12, fontWeight: 600, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 5,
              }}>
                {busy ? <Loader2 size={12} className="animate-spin" /> : null} Save & Continue
              </button>
            </div>

            {showAudience && (
              <AudiencePicker
                selectedLeads={selectedLeads}
                onSelect={setSelectedLeads}
                onClose={() => setShowAudience(false)}
              />
            )}
          </div>
        )}

        {/* ── LAUNCH TAB ── */}
        {activeTab === "launch" && (
          <div style={{ height: "100%", overflow: "hidden" }}>
            <CampaignReview campaignId={id} />
          </div>
        )}
      </div>

      {/* Bottom bar — sticky, not fixed */}
      {activeTab === "sequence" && (
        <div style={{
          padding: "10px 20px", background: "var(--bg-surface)",
          borderTop: "1px solid var(--border-default)", flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, overflow: "auto" }}>
            <SignaturePicker
              signatureId={signatureId}
              onSelect={(id) => setSignatureId(id)}
              includeSignature={includeSignature}
              onToggleInclude={(v) => setIncludeSignature(v)}
            />
          </div>
          <button onClick={saveSteps} disabled={busy} style={{
            padding: "8px 20px", borderRadius: "var(--radius-lg)",
            border: "none", background: busy ? "var(--bg-surface-sunken)" : "var(--color-primary)",
            color: busy ? "var(--text-disabled)" : "#fff",
            fontSize: 12, fontWeight: 600, cursor: busy ? "default" : "pointer",
            display: "flex", alignItems: "center", gap: 5, flexShrink: 0,
          }}>
            {busy ? <Loader2 size={12} className="animate-spin" /> : null} Save Steps
          </button>
        </div>
      )}

      {/* Responsive CSS */}
      <style>{`
        @media (max-width: 768px) {
          .cd-sidebar { width: 48px !important; }
          .cd-sidebar .cd-collapse-toggle { display: none; }
          .hide-mobile { display: none !important; }
        }
        @media (min-width: 769px) and (max-width: 1024px) {
          .cd-sidebar { width: 160px !important; }
        }
      `}</style>
    </div>
  );
}
