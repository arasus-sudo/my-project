/**
 * AITemplateWorkflow — /campaigns/create/ai-template
 *
 * Combines template structure with AI-generated content.
 * Steps: Objective → Category → Template → Context → Generate
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api } from "../../lib/api";
import {
  ArrowLeft, ArrowRight, Loader2, CheckCircle2, Target, Sparkles,
  LayoutTemplate, FileText, Zap, Calendar, MessageSquare, Package,
  Sprout, RotateCw, RefreshCw, ChevronRight,
} from "lucide-react";
import { CATEGORIES, TEMPLATES, AI_OBJECTIVES, AI_TONES } from "./templateData";
import CampaignReview from "./CampaignReview";

const OBJ_ICONS = { Calendar, MessageSquare, Package, Sprout, RotateCw, RefreshCw };

const STEPS = ["Objective", "Category", "Template", "Context", "Generate"];

const AI_GEN_STEPS = [
  "Understanding campaign objective",
  "Analyzing audience and template structure",
  "Creating messaging strategy",
  "Personalizing campaign structure",
  "Writing email sequence",
  "Checking variables",
  "Optimizing CTAs",
  "Preparing campaign",
];

export default function AITemplateWorkflow() {
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [objective, setObjective] = useState("");
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedSub, setSelectedSub] = useState(null);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [context, setContext] = useState({
    product: "",
    audience: "",
    industry: "",
    pain_point: "",
    value_proposition: "",
    offer: "",
    cta: "",
    tone: "professional",
    language: "English",
    campaign_length: "medium",
  });
  const [generating, setGenerating] = useState(false);
  const [genStep, setGenStep] = useState(0);
  const [campaign, setCampaign] = useState(null);

  const set = (field) => (e) => setContext({ ...context, [field]: e.target.value });

  const getTemplatesForCategory = () => {
    if (!selectedCategory || !selectedSub) return [];
    return TEMPLATES[selectedSub] || [];
  };

  const generate = async () => {
    setGenerating(true);
    setGenStep(0);
    // Animate through generation steps
    const stepInterval = setInterval(() => {
      setGenStep((prev) => {
        if (prev >= AI_GEN_STEPS.length - 1) {
          clearInterval(stepInterval);
          return prev;
        }
        return prev + 1;
      });
    }, 1500);

    try {
      const payload = {
        service_id: "",
        goal: objective,
        target_audience: {
          industry: context.industry,
          titles: context.audience,
          company_size: "",
          location: "",
        },
        tone: context.tone,
        channels: ["email"],
        campaign_type: "ai",
        custom_prompt: `Template: ${selectedTemplate?.name}\nTemplate Structure: ${JSON.stringify(selectedTemplate?.structure)}\n\nProduct: ${context.product}\nAudience: ${context.audience}\nIndustry: ${context.industry}\nPain Point: ${context.pain_point}\nValue Proposition: ${context.value_proposition}\nOffer: ${context.offer}\nCTA: ${context.cta}\nLanguage: ${context.language}\nCampaign Length: ${context.campaign_length}`,
      };
      const { data } = await api.post("/campaign-engine/generate", payload);
      setCampaign(data.campaign);
      toast.success("Campaign generated!");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Generation failed");
    } finally {
      clearInterval(stepInterval);
      setGenerating(false);
    }
  };

  // If campaign is generated, show review + CampaignReview
  if (campaign) {
    return (
      <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
        {/* Summary header */}
        <div style={{ padding: "14px 32px", borderBottom: "1px solid var(--border-default)", background: "var(--bg-surface)", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <CheckCircle2 size={16} style={{ color: "var(--color-success)" }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-display)", margin: 0 }}>
            Campaign generated — {campaign.email_sequence?.length || 0} steps
          </span>
          <span style={{ fontSize: 12, color: "var(--text-tertiary)", marginLeft: 8 }}>
            Objective: {objective.replace(/_/g, ' ')} · Tone: {context.tone}
          </span>
          <div style={{ flex: 1 }} />
          <button onClick={() => setCampaign(null)} style={{ padding: "5px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-default)", background: "var(--bg-surface)", color: "var(--text-secondary)", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
            <RotateCw size={12} /> Regenerate
          </button>
          <button onClick={() => nav("/app/campaigns")} style={{ padding: "5px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-default)", background: "var(--bg-surface)", color: "var(--text-secondary)", fontSize: 12, cursor: "pointer" }}>
            Back to Campaigns
          </button>
        </div>
        <div style={{ flex: 1, overflow: "hidden" }}>
          {campaign.campaign_id ? (
            <CampaignReview campaignId={campaign.campaign_id} />
          ) : (
            <div style={{ padding: "32px", textAlign: "center" }}>
              <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginBottom: 16 }}>Campaign generated but not saved yet.</p>
              <button onClick={() => nav("/app/campaigns")} className="btn-secondary">Back to Campaigns</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ position: "sticky", top: 0, zIndex: 10, background: "var(--bg-canvas)", borderBottom: "1px solid var(--border-default)" }}>
        <div style={{ padding: "16px 32px", display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => nav("/app/campaigns")} style={{ display: "flex", alignItems: "center", gap: 4, border: "none", background: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: 13, fontFamily: "var(--font-ui)" }}>
            <ArrowLeft size={14} /> Campaigns
          </button>
          <span style={{ color: "var(--text-tertiary)", fontSize: 13 }}>/</span>
          <span style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
            <Sparkles size={14} style={{ color: "var(--color-intel)" }} /> AI + Template
          </span>
        </div>
      </div>

      <div style={{ padding: "32px", maxWidth: 800, margin: "0 auto" }}>
        {/* Steps indicator */}
        <div style={{ display: "flex", alignItems: "center", marginBottom: 40 }}>
          {STEPS.map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", flex: 1, last: { flex: "none" } }}>
              <div
                style={{
                  width: 32, height: 32, borderRadius: "var(--radius-full)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontWeight: 500, fontFamily: "var(--font-mono)",
                  background: i === step ? "var(--color-intel)" : i < step ? "var(--color-success)" : "var(--bg-surface-sunken)",
                  color: i <= step ? "#fff" : "var(--text-tertiary)",
                  transition: "all 200ms ease",
                }}
              >
                {i < step ? <CheckCircle2 size={14} /> : i + 1}
              </div>
              <span style={{ marginLeft: 8, fontSize: 12, color: i === step ? "var(--text-primary)" : "var(--text-tertiary)", fontWeight: i === step ? 500 : 400 }}>{s}</span>
              {i < STEPS.length - 1 && <div style={{ flex: 1, height: 1, background: "var(--border-default)", margin: "0 12px" }} />}
            </div>
          ))}
        </div>

        {/* Generation Progress */}
        {generating && (
          <div style={{ padding: 40, textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-display)", marginBottom: 24 }}>
              Building your campaign
            </div>
            <div style={{ maxWidth: 400, margin: "0 auto", textAlign: "left" }}>
              {AI_GEN_STEPS.map((s, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", opacity: i <= genStep ? 1 : 0.3, transition: "opacity 300ms ease" }}>
                  {i < genStep ? (
                    <CheckCircle2 size={14} style={{ color: "var(--color-success)", flexShrink: 0 }} />
                  ) : i === genStep ? (
                    <Loader2 size={14} className="animate-spin" style={{ color: "var(--color-intel)", flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 14, height: 14, borderRadius: "var(--radius-full)", border: "1.5px solid var(--border-default)", flexShrink: 0 }} />
                  )}
                  <span style={{ fontSize: 13, color: i <= genStep ? "var(--text-primary)" : "var(--text-tertiary)" }}>{s}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 0: Objective */}
        {!generating && step === 0 && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-display)", margin: "0 0 6px" }}>What's your objective?</h2>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 20px" }}>Select the primary goal of this campaign.</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
              {AI_OBJECTIVES.map((obj) => {
                const Icon = OBJ_ICONS[obj.icon] || Target;
                return (
                  <button key={obj.value} onClick={() => setObjective(obj.value)} style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "14px 16px",
                    borderRadius: "var(--radius-lg)", border: "1px solid",
                    borderColor: objective === obj.value ? "var(--color-intel)" : "var(--border-default)",
                    background: objective === obj.value ? "var(--color-intel-subtle)" : "var(--bg-surface)",
                    cursor: "pointer", textAlign: "left", transition: "all 150ms ease",
                  }}>
                    <div style={{ width: 36, height: 36, borderRadius: "var(--radius-md)", background: objective === obj.value ? "var(--color-intel)" : "var(--bg-surface-sunken)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Icon size={16} style={{ color: objective === obj.value ? "#fff" : "var(--text-tertiary)" }} />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>{obj.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 1: Category */}
        {!generating && step === 1 && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-display)", margin: "0 0 6px" }}>Choose campaign category</h2>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 20px" }}>This helps AI understand the right approach.</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
              {CATEGORIES.map((cat) => (
                <button key={cat.id} onClick={() => setSelectedCategory(cat)} style={{
                  padding: "14px 16px", borderRadius: "var(--radius-lg)", border: "1px solid",
                  borderColor: selectedCategory?.id === cat.id ? "var(--color-intel)" : "var(--border-default)",
                  background: selectedCategory?.id === cat.id ? "var(--color-intel-subtle)" : "var(--bg-surface)",
                  cursor: "pointer", textAlign: "left", transition: "all 150ms ease",
                }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{cat.label}</div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{cat.description}</div>
                </button>
              ))}
            </div>
            {selectedCategory && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 8 }}>Subcategory</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {selectedCategory.subcategories.map((sub) => (
                    <button key={sub.id} onClick={() => setSelectedSub(sub.id)} style={{
                      padding: "6px 14px", borderRadius: "var(--radius-full)", border: "1px solid",
                      borderColor: selectedSub === sub.id ? "var(--color-intel)" : "var(--border-default)",
                      background: selectedSub === sub.id ? "var(--color-intel-subtle)" : "transparent",
                      color: selectedSub === sub.id ? "var(--color-intel)" : "var(--text-secondary)",
                      cursor: "pointer", fontSize: 12, fontWeight: 500, transition: "all 150ms ease",
                    }}>
                      {sub.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Template */}
        {!generating && step === 2 && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-display)", margin: "0 0 6px" }}>Choose a template structure</h2>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 20px" }}>AI will generate content inside this structure.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {getTemplatesForCategory().map((t) => (
                <button key={t.id} onClick={() => setSelectedTemplate(t)} style={{
                  padding: "16px 20px", borderRadius: "var(--radius-lg)", border: "1px solid",
                  borderColor: selectedTemplate?.id === t.id ? "var(--color-intel)" : "var(--border-default)",
                  background: selectedTemplate?.id === t.id ? "var(--color-intel-subtle)" : "var(--bg-surface)",
                  cursor: "pointer", textAlign: "left", transition: "all 150ms ease", display: "flex", alignItems: "center", gap: 16,
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{t.name}</div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{t.description}</div>
                    <div style={{ display: "flex", gap: 8, marginTop: 8, fontSize: 11, color: "var(--text-tertiary)" }}>
                      <span>{t.steps} steps</span>
                      <span>·</span>
                      <span>{t.readingTime} read</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 3 }}>
                    {t.structure.map((_, i) => (
                      <div key={i} style={{ width: 20, height: 4, borderRadius: 2, background: i === 0 ? "var(--color-intel)" : "var(--border-default)" }} />
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Context */}
        {!generating && step === 3 && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-display)", margin: "0 0 6px" }}>Campaign context</h2>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 20px" }}>Help AI understand what to write about.</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {[
                { key: "product", label: "Product / Service", placeholder: "e.g. AI-powered CRM platform", required: true },
                { key: "audience", label: "Target audience", placeholder: "e.g. CIOs at mid-sized banks" },
                { key: "industry", label: "Industry", placeholder: "e.g. Banking, SaaS, Healthcare" },
                { key: "pain_point", label: "Pain point", placeholder: "e.g. Manual operations eating into productivity" },
                { key: "value_proposition", label: "Value proposition", placeholder: "e.g. Reduce manual work by 60%", colSpan: true },
                { key: "offer", label: "Offer", placeholder: "e.g. Free 30-day trial" },
                { key: "cta", label: "CTA", placeholder: "e.g. Book a discovery call" },
              ].map((field) => (
                <label key={field.key} style={{ gridColumn: field.colSpan ? "span 2" : undefined }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                    {field.label} {field.required && <span style={{ color: "var(--color-danger)" }}>*</span>}
                  </span>
                  <input
                    value={context[field.key]}
                    onChange={set(field.key)}
                    placeholder={field.placeholder}
                    style={{
                      width: "100%", padding: "8px 12px", borderRadius: "var(--radius-md)",
                      border: "1px solid var(--border-default)", background: "var(--bg-surface)",
                      fontSize: 13, color: "var(--text-primary)", fontFamily: "var(--font-ui)",
                      outline: "none",
                    }}
                  />
                </label>
              ))}
              <label>
                <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Tone</span>
                <select value={context.tone} onChange={set("tone")} style={{
                  width: "100%", padding: "8px 12px", borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-default)", background: "var(--bg-surface)",
                  fontSize: 13, color: "var(--text-primary)", fontFamily: "var(--font-ui)",
                }}>
                  {AI_TONES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </label>
            </div>
          </div>
        )}

        {/* Step 4: Generate */}
        {!generating && step === 4 && (
          <div style={{ textAlign: "center" }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-display)", margin: "0 0 6px" }}>Ready to generate</h2>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 24px" }}>
              AI will create content inside the <strong>{selectedTemplate?.name}</strong> structure.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 400, margin: "0 auto", textAlign: "left", marginBottom: 24 }}>
              {[
                ["Objective", objective.replace(/_/g, " ")],
                ["Template", selectedTemplate?.name],
                ["Product", context.product],
                ["Tone", context.tone],
              ].map(([label, value]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border-subtle)" }}>
                  <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{label}</span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-primary)", textTransform: "capitalize" }}>{value}</span>
                </div>
              ))}
            </div>
            <button onClick={generate} className="btn-primary" style={{ padding: "10px 24px", fontSize: 14 }}>
              <Sparkles size={16} /> Generate Campaign
            </button>
          </div>
        )}

        {/* Navigation */}
        {!generating && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 40 }}>
            <button onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0} className="btn-ghost" style={{ opacity: step === 0 ? 0.3 : 1 }}>
              <ArrowLeft size={14} /> Back
            </button>
            <span style={{ fontSize: 12, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
              Step {step + 1} of {STEPS.length}
            </span>
            {step < STEPS.length - 1 && (
              <button
                onClick={() => setStep(step + 1)}
                disabled={
                  (step === 0 && !objective) ||
                  (step === 1 && (!selectedCategory || !selectedSub)) ||
                  (step === 2 && !selectedTemplate)
                }
                className="btn-primary"
                style={{ opacity: (
                  (step === 0 && !objective) ||
                  (step === 1 && (!selectedCategory || !selectedSub)) ||
                  (step === 2 && !selectedTemplate)
                ) ? 0.5 : 1 }}
              >
                Continue <ArrowRight size={14} />
              </button>
            )}
          </div>
        )}
      </div>

      <style>{`
        @media (max-width: 768px) {
          .ai-wiz-grid { grid-template-columns: 1fr !important; }
          .hide-mobile { display: none !important; }
        }
      `}</style>
    </div>
  );
}
