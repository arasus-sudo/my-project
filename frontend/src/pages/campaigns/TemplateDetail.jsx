/**
 * TemplateDetail — /campaigns/create/template/:category/:templateId
 *
 * Dedicated preview page for a single template.
 * Shows template structure, variables, and example sequence.
 * NOT an email editor — this is a focused preview experience.
 */
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, Layers, Clock, Users, Variable, Check, ChevronRight,
  Calendar, Mail, Loader2,
} from "lucide-react";
import { api } from "../../lib/api";
import { toast } from "sonner";
import { CATEGORIES, TEMPLATES, VARIABLE_CATEGORIES } from "./templateData";
import RecipientPreview, { resolveVariables } from "./RecipientPreview";

export default function TemplateDetail() {
  const { category, templateId } = useParams();
  const nav = useNavigate();
  const [creating, setCreating] = useState(false);

  const cat = CATEGORIES.find((c) => c.id === category);
  const template = useMemo(() => {
    if (!cat) return null;
    for (const sub of cat.subcategories) {
      const templates = TEMPLATES[sub.id] || [];
      const found = templates.find((t) => t.id === templateId);
      if (found) return { ...found, subcategoryLabel: sub.label };
    }
    return null;
  }, [cat, templateId]);

  const exampleSubject = template?.structure?.[0]?.subject || "";
  const exampleBody = `Hi {{first_name}},\n\nI noticed {{company_name}} has been making moves in the {{industry}} space. We've helped companies like {{similar_company}} tackle similar challenges with {{pain_point}}.\n\nWould you be open to a quick 15-minute conversation to explore how we might help {{company_name}} as well?\n\nBest,\n{{sender_name}}\n{{sender_role}}, {{sender_company}}`;

  const availableVars = useMemo(() => {
    if (!template) return [];
    const allVars = new Set();
    for (const v of template.variables || []) allVars.add(v);
    for (const step of template.structure) {
      const matches = (step.subject || "").match(/\{\{(\w+)\}\}/g) || [];
      for (const m of matches) allVars.add(m.replace(/[{}]/g, ""));
    }
    return [...allVars];
  }, [template]);

  const handleUseTemplate = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const steps = (template.structure || []).map((s, i) => ({
        channel: "email",
        day: s.day || 0,
        condition: "always",
        subject: s.subject || `Step ${i + 1}`,
        body: s.body || `Hi {{first_name}},\n\n${s.subject || 'Following up on our previous message.'}\n\nBest,\n{{sender_name}}`,
        body_html: s.body_html || "",
        body_text: s.body || "",
        label: s.label || `Step ${i + 1}`,
      }));
      const { data } = await api.post("/campaigns", {
        name: template.name,
        goal: template.description || "Email campaign",
        campaign_type: "template",
        steps,
        lead_ids: [],
      });
      toast.success(`Created "${template.name}" — now edit and add leads`);
      nav(`/app/campaigns/${data.id}`);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to create campaign");
      setCreating(false);
    }
  };

  if (!template) {
    return (
      <div style={{ padding: 48, textAlign: "center" }}>
        <p style={{ color: "var(--text-secondary)" }}>Template not found.</p>
        <button
          onClick={() => nav("/app/campaigns/create/template")}
          style={{ color: "var(--text-link)", marginTop: 8, border: "none", background: "none", cursor: "pointer" }}
        >
          Back to templates
        </button>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ position: "sticky", top: 0, zIndex: 10, background: "var(--bg-canvas)", borderBottom: "1px solid var(--border-default)" }}>
        <div style={{ padding: "16px 32px", display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={() => nav(`/app/campaigns/create/template/${category}`)}
            style={{ display: "flex", alignItems: "center", gap: 4, border: "none", background: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: 13, fontFamily: "var(--font-ui)" }}
          >
            <ArrowLeft size={14} /> {cat?.label || "Templates"}
          </button>
          <span style={{ color: "var(--text-tertiary)", fontSize: 13 }}>/</span>
          <span style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 500 }}>{template.name}</span>
        </div>
      </div>

      <div style={{ padding: 32, maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }} className="template-detail-grid">
          {/* LEFT — Template Preview */}
          <div>
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span style={{ padding: "3px 10px", borderRadius: "var(--radius-full)", background: "var(--color-primary-subtle)", color: "var(--color-primary)", fontSize: 11, fontWeight: 500 }}>
                  {template.subcategoryLabel}
                </span>
                <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                  {template.steps} steps · {template.readingTime} read
                </span>
              </div>
              <h1 style={{ fontSize: 24, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-display)", margin: "0 0 8px" }}>
                {template.name}
              </h1>
              <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: "20px", margin: 0 }}>
                {template.description}
              </p>
            </div>

            {/* Campaign Sequence Timeline */}
            <div style={{ marginBottom: 32 }}>
              <h2 style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", fontFamily: "var(--font-ui)", textTransform: "uppercase", letterSpacing: "0.04em", margin: "0 0 16px" }}>
                Campaign Sequence
              </h2>
              <div style={{ position: "relative" }}>
                {template.structure.map((step, i) => (
                  <div key={i} style={{ display: "flex", gap: 16 }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 24 }}>
                      <div style={{ width: 24, height: 24, borderRadius: "var(--radius-full)", background: "var(--color-primary)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, fontFamily: "var(--font-mono)", flexShrink: 0, zIndex: 1 }}>
                        {i + 1}
                      </div>
                      {i < template.structure.length - 1 && (
                        <div style={{ width: 1, flex: 1, background: "var(--border-default)", minHeight: 16 }} />
                      )}
                    </div>
                    <div style={{ flex: 1, paddingBottom: i < template.structure.length - 1 ? 20 : 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 11, fontWeight: 500, color: "var(--color-primary)", fontFamily: "var(--font-mono)" }}>
                          {step.day === 0 ? "Day 1" : `Day ${step.day + 1}`}
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-primary)" }}>{step.label}</span>
                      </div>
                      <div style={{ padding: "10px 14px", borderRadius: "var(--radius-lg)", background: "var(--bg-surface-sunken)", border: "1px solid var(--border-subtle)", fontSize: 12.5, color: "var(--text-secondary)" }}>
                        Subject: <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{step.subject}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recipient Preview */}
            <div>
              <h2 style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", fontFamily: "var(--font-ui)", textTransform: "uppercase", letterSpacing: "0.04em", margin: "0 0 8px" }}>
                Preview
              </h2>
              <RecipientPreview resolveFrom={exampleSubject}>
                {({ mode, recipient }) => (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ padding: "16px 20px", borderRadius: "var(--radius-xl)", border: "1px solid var(--border-default)", background: "var(--bg-surface)" }}>
                      <div style={{ fontSize: 10, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
                        Example Subject Line
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 500, color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
                        {mode === "preview" ? resolveVariables(exampleSubject, recipient) : exampleSubject}
                      </div>
                    </div>
                    <div style={{ marginTop: 8, padding: "16px 20px", borderRadius: "var(--radius-xl)", border: "1px solid var(--border-default)", background: "var(--bg-surface)", whiteSpace: "pre-wrap", fontSize: 13, lineHeight: "19px", color: "var(--text-secondary)" }}>
                      {mode === "preview" ? resolveVariables(exampleBody, recipient) : exampleBody}
                    </div>
                  </div>
                )}
              </RecipientPreview>
            </div>
          </div>

          {/* RIGHT — Template Info */}
          <div>
            <div style={{ padding: 24, borderRadius: "var(--radius-xl)", border: "1px solid var(--border-default)", background: "var(--bg-surface)", position: "sticky", top: 80 }}>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Best For</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-primary)" }}>
                  <Users size={14} style={{ color: "var(--text-tertiary)" }} />
                  {template.recommendedAudience}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
                <div style={{ padding: 12, borderRadius: "var(--radius-lg)", background: "var(--bg-surface-sunken)" }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>{template.steps}</div>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Steps</div>
                </div>
                <div style={{ padding: 12, borderRadius: "var(--radius-lg)", background: "var(--bg-surface-sunken)" }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
                    {template.structure[template.structure.length - 1]?.day || 0}d
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Duration</div>
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Variables</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {availableVars.map((v) => (
                    <span key={v} style={{ padding: "3px 8px", borderRadius: "var(--radius-sm)", background: "var(--color-primary-subtle)", border: "1px solid var(--color-primary-border)", color: "var(--color-primary)", fontSize: 11, fontWeight: 500, fontFamily: "var(--font-mono)" }}>
                      {`{{${v}}}`}
                    </span>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button
                  disabled={creating}
                  onClick={handleUseTemplate}
                  style={{ width: "100%", padding: "10px 16px", borderRadius: "var(--radius-lg)", border: "none", background: "var(--color-primary)", color: "#fff", fontSize: 13, fontWeight: 600, fontFamily: "var(--font-ui)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, transition: "all 150ms ease" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-primary-hover)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "var(--color-primary)")}
                >
                  {creating ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />} {creating ? "Creating..." : "Use This Template"}
                </button>
                <button
                  onClick={() => nav(`/app/campaigns/create/template/${category}`)}
                  style={{ width: "100%", padding: "10px 16px", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-default)", background: "transparent", color: "var(--text-secondary)", fontSize: 13, fontWeight: 500, fontFamily: "var(--font-ui)", cursor: "pointer" }}
                >
                  Back to {cat?.label || "templates"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .template-detail-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
