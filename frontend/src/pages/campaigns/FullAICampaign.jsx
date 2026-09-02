/**
 * FullAICampaign — /campaigns/create/ai
 *
 * The most intelligent creation experience.
 * User describes what they want in natural language.
 * AI extracts strategy, proposes structure, generates everything.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api } from "../../lib/api";
import {
  ArrowLeft, Loader2, CheckCircle2, Sparkles, Target, Users,
  MapPin, MessageSquare, Calendar, Zap, ChevronRight, RotateCw, Pencil,
} from "lucide-react";
import CampaignReview from "./CampaignReview";

const SUGGESTED_PROMPTS = [
  "Create a cold outreach campaign targeting CIOs at mid-sized banks in the UAE. Introduce our AI automation services, focus on reducing manual operations and aim to book a discovery meeting. Keep the tone professional and consultative.",
  "Build a product launch campaign for our new analytics dashboard. Target existing customers and emphasize ease of use. 5-step sequence.",
  "Follow up with leads who haven't replied in 30+ days. Be friendly but direct. Offer a 15-minute call.",
  "Create a meeting-booking campaign for VP-level sales leaders at SaaS companies. Keep it short — 3 steps max.",
  "Build a customer re-engagement campaign for users who signed up but never completed onboarding. Be helpful and encouraging.",
];

const AI_GEN_STEPS = [
  "Analyzing your requirements",
  "Building campaign strategy",
  "Determining optimal sequence length",
  "Designing message flow",
  "Writing personalized content",
  "Optimizing subject lines",
  "Checking personalization variables",
  "Running quality checks",
];

export default function FullAICampaign() {
  const nav = useNavigate();
  const [input, setInput] = useState("");
  const [strategy, setStrategy] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [genStep, setGenStep] = useState(0);
  const [campaign, setCampaign] = useState(null);

  const extractStrategy = async () => {
    if (!input.trim()) return;
    setGenerating(true);
    setGenStep(0);
    const stepInterval = setInterval(() => {
      setGenStep((prev) => {
        if (prev >= AI_GEN_STEPS.length - 1) { clearInterval(stepInterval); return prev; }
        return prev + 1;
      });
    }, 1200);

    try {
      const { data } = await api.post("/campaign-engine/generate", {
        service_id: "",
        goal: "custom",
        target_audience: { industry: "", titles: "", company_size: "", location: "" },
        tone: "professional",
        channels: ["email"],
        campaign_type: "ai",
        custom_prompt: input,
      });
      setCampaign(data.campaign);
      setStrategy({
        objective: data.campaign?.strategy?.goal || "Book meetings",
        audience: data.campaign?.strategy?.target_personas?.[0] || "Decision makers",
        industry: data.campaign?.strategy?.campaign_type?.replace(/_/g, " ") || "General",
        tone: data.campaign?.tone || "Professional",
        steps: data.campaign?.email_sequence?.length || 5,
        cta: data.campaign?.email_sequence?.[data.campaign.email_sequence.length - 1]?.subject || "Book a call",
      });
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Strategy extraction failed");
    } finally {
      clearInterval(stepInterval);
      setGenerating(false);
    }
  };

  const generate = async () => {
    setGenerating(true);
    setGenStep(0);
    const stepInterval = setInterval(() => {
      setGenStep((prev) => {
        if (prev >= AI_GEN_STEPS.length - 1) { clearInterval(stepInterval); return prev; }
        return prev + 1;
      });
    }, 1200);

    try {
      const { data } = await api.post("/campaign-engine/generate", {
        service_id: "",
        goal: strategy?.objective || "Book meetings",
        target_audience: { industry: strategy?.industry || "", titles: strategy?.audience || "" },
        tone: strategy?.tone?.toLowerCase() || "professional",
        channels: ["email"],
        campaign_type: "ai",
        custom_prompt: input,
      });
      setCampaign(data.campaign);
      toast.success("Campaign generated!");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Generation failed");
    } finally {
      clearInterval(stepInterval);
      setGenerating(false);
    }
  };

  // Campaign review view — show summary then CampaignReview
  if (campaign) {
    return (
      <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "14px 32px", borderBottom: "1px solid var(--border-default)", background: "var(--bg-surface)", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <CheckCircle2 size={16} style={{ color: "var(--color-success)" }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-display)", margin: 0 }}>
            Campaign generated — {campaign.email_sequence?.length || 0} steps
          </span>
          <span style={{ fontSize: 12, color: "var(--text-tertiary)", marginLeft: 8 }}>
            {strategy?.objective || "Custom"} · {strategy?.tone || "Professional"}
          </span>
          <div style={{ flex: 1 }} />
          <button onClick={() => { setCampaign(null); setStrategy(null); setInput(""); }} style={{ padding: "5px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-default)", background: "var(--bg-surface)", color: "var(--text-secondary)", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
            <RotateCw size={12} /> Start Over
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
          {/* Ready banner */}
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <div style={{
              width: 72, height: 72, borderRadius: "var(--radius-full)",
              background: "var(--color-success-subtle)", display: "flex",
              alignItems: "center", justifyContent: "center", margin: "0 auto 16px",
            }}>
              <CheckCircle2 size={36} style={{ color: "var(--color-success)" }} />
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-display)", margin: "0 0 8px" }}>
              Your Campaign Is Ready
            </h1>
            <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: 0 }}>
              AI analyzed your request and built a {campaign.email_sequence?.length || 0}-step campaign.
            </p>
          </div>

          {/* Campaign overview cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 32 }}>
            {[
              { icon: Target, label: "Objective", value: strategy?.objective || "Book meetings" },
              { icon: Users, label: "Audience", value: strategy?.audience || "Decision makers" },
              { icon: Calendar, label: "Steps", value: `${campaign.email_sequence?.length || 0} messages` },
              { icon: MessageSquare, label: "Tone", value: strategy?.tone || "Professional" },
            ].map((item) => (
              <div key={item.label} style={{
                padding: 16, borderRadius: "var(--radius-lg)",
                background: "var(--bg-surface)", border: "1px solid var(--border-default)",
              }}>
                <item.icon size={16} style={{ color: "var(--text-tertiary)", marginBottom: 8 }} />
                <div style={{ fontSize: 10, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{item.label}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginTop: 4, textTransform: "capitalize" }}>{item.value}</div>
              </div>
            ))}
          </div>

          {/* Visual Sequence Timeline */}
          <div style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em", margin: "0 0 16px" }}>Campaign Sequence</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {(campaign.email_sequence || []).map((email, i) => (
                <div key={i} style={{ display: "flex", gap: 16 }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 24 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: "var(--radius-full)",
                      background: "var(--color-warning)", color: "#fff",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, fontWeight: 600, fontFamily: "var(--font-mono)", flexShrink: 0, zIndex: 1,
                    }}>
                      {i + 1}
                    </div>
                    {i < (campaign.email_sequence?.length || 0) - 1 && (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "4px 0" }}>
                        <div style={{ width: 1, height: 12, background: "var(--border-default)" }} />
                        <span style={{ fontSize: 9, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", padding: "2px 0" }}>
                          {email.day}d
                        </span>
                        <div style={{ width: 1, height: 12, background: "var(--border-default)" }} />
                      </div>
                    )}
                  </div>
                  <div style={{
                    flex: 1, padding: "14px 16px", borderRadius: "var(--radius-lg)",
                    border: "1px solid var(--border-default)", background: "var(--bg-surface)",
                    marginBottom: i < (campaign.email_sequence?.length || 0) - 1 ? 0 : 0,
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-primary)", marginBottom: 4 }}>
                      {email.subject}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: "17px" }}>
                      {email.body?.substring(0, 150)}…
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    );
  }

  // Generating state
  if (generating) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", maxWidth: 500 }}>
          <div style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-display)", marginBottom: 24 }}>
            {strategy ? "Generating your campaign" : "Analyzing your request"}
          </div>
          <div style={{ textAlign: "left" }}>
            {AI_GEN_STEPS.map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", opacity: i <= genStep ? 1 : 0.3, transition: "opacity 300ms ease" }}>
                {i < genStep ? (
                  <CheckCircle2 size={14} style={{ color: "var(--color-success)", flexShrink: 0 }} />
                ) : i === genStep ? (
                  <Loader2 size={14} className="animate-spin" style={{ color: "var(--color-warning)", flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 14, height: 14, borderRadius: "var(--radius-full)", border: "1.5px solid var(--border-default)", flexShrink: 0 }} />
                )}
                <span style={{ fontSize: 13, color: i <= genStep ? "var(--text-primary)" : "var(--text-tertiary)" }}>{s}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Strategy confirmation view
  if (strategy) {
    return (
      <div style={{ minHeight: "100vh" }}>
        <div style={{ position: "sticky", top: 0, zIndex: 10, background: "var(--bg-canvas)", borderBottom: "1px solid var(--border-default)" }}>
          <div style={{ padding: "16px 32px", display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={() => setStrategy(null)} style={{ display: "flex", alignItems: "center", gap: 4, border: "none", background: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: 13 }}>
              <ArrowLeft size={14} /> Back
            </button>
          </div>
        </div>
        <div style={{ padding: "32px", maxWidth: 700, margin: "0 auto" }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-display)", margin: "0 0 6px", textAlign: "center" }}>
            Campaign Strategy
          </h1>
          <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: "0 0 32px", textAlign: "center" }}>
            AI extracted this strategy from your description. Review and adjust before generating.
          </p>
          <div style={{
            padding: 24, borderRadius: "var(--radius-xl)",
            border: "1px solid var(--border-default)", background: "var(--bg-surface)",
          }}>
            {[
              ["Objective", strategy.objective],
              ["Audience", strategy.audience],
              ["Industry", strategy.industry],
              ["Region", "Any"],
              ["Tone", strategy.tone],
              ["Sequence", `${strategy.steps} messages`],
              ["Primary CTA", strategy.cta],
            ].map(([label, value]) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--border-subtle)" }}>
                <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{label}</span>
                <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)", textTransform: "capitalize" }}>{value}</span>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 24 }}>
            <button onClick={() => setStrategy(null)} className="btn-secondary">
              <Pencil size={14} /> Edit Strategy
            </button>
            <button onClick={generate} className="btn-primary">
              <Sparkles size={14} /> Generate Campaign
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Main input view
  return (
    <div style={{ minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ position: "sticky", top: 0, zIndex: 10, background: "var(--bg-canvas)", borderBottom: "1px solid var(--border-default)" }}>
        <div style={{ padding: "16px 32px", display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => nav("/app/campaigns")} style={{ display: "flex", alignItems: "center", gap: 4, border: "none", background: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: 13 }}>
            <ArrowLeft size={14} /> Campaigns
          </button>
          <span style={{ color: "var(--text-tertiary)", fontSize: 13 }}>/</span>
          <span style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
            <Zap size={14} style={{ color: "var(--color-warning)" }} /> Create with AI
          </span>
        </div>
      </div>

      <div style={{ padding: "48px 32px", maxWidth: 700, margin: "0 auto", textAlign: "center" }}>
        {/* Hero */}
        <div style={{ marginBottom: 40 }}>
          <div style={{
            width: 64, height: 64, borderRadius: "var(--radius-2xl)",
            background: "var(--color-warning-subtle)", display: "flex",
            alignItems: "center", justifyContent: "center", margin: "0 auto 20px",
          }}>
            <Zap size={28} style={{ color: "var(--color-warning)" }} />
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-display)", margin: "0 0 8px" }}>
            Create with AI
          </h1>
          <p style={{ fontSize: 15, color: "var(--text-secondary)", margin: 0, lineHeight: "22px" }}>
            Tell us what you want to achieve. AI will build the campaign.
          </p>
        </div>

        {/* Input area */}
        <div style={{
          padding: 24, borderRadius: "var(--radius-2xl)",
          border: "2px solid var(--border-default)", background: "var(--bg-surface)",
          textAlign: "left", marginBottom: 24, transition: "border-color 200ms ease",
        }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Create a 5-step outbound campaign targeting CIOs at mid-sized banks in the UAE. Introduce our AI automation services, focus on reducing manual operations and aim to book a discovery meeting. Keep the tone professional and consultative."
            rows={6}
            style={{
              width: "100%", border: "none", outline: "none", background: "transparent",
              fontSize: 15, lineHeight: "22px", color: "var(--text-primary)",
              fontFamily: "var(--font-ui)", resize: "none",
            }}
          />
        </div>

        <button
          onClick={extractStrategy}
          disabled={!input.trim()}
          className="btn-primary"
          style={{
            padding: "12px 32px", fontSize: 15, borderRadius: "var(--radius-lg)",
            opacity: !input.trim() ? 0.5 : 1,
          }}
        >
          <Sparkles size={16} /> Build Campaign
        </button>

        {/* Suggested prompts */}
        <div style={{ marginTop: 40, textAlign: "left" }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 12 }}>
            Try one of these
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {SUGGESTED_PROMPTS.map((prompt, i) => (
              <button
                key={i}
                onClick={() => setInput(prompt)}
                style={{
                  padding: "12px 16px", borderRadius: "var(--radius-lg)",
                  border: "1px solid var(--border-default)", background: "var(--bg-surface)",
                  cursor: "pointer", textAlign: "left", fontSize: 13,
                  color: "var(--text-secondary)", lineHeight: "18px",
                  transition: "all 150ms ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "var(--color-warning)";
                  e.currentTarget.style.background = "var(--color-warning-subtle)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--border-default)";
                  e.currentTarget.style.background = "var(--bg-surface)";
                }}
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>

      <style>{`
        @media (max-width: 768px) {
          .full-ai-grid { grid-template-columns: 1fr !important; }
          .hide-mobile { display: none !important; }
        }
      `}      </style>
      </div>
    </div>
  );
}
