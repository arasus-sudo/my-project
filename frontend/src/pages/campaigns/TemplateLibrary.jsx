/**
 * TemplateLibrary — /campaigns/create/template/:category
 *
 * Shows subcategory tabs and contextual template cards for the selected category.
 * Clicking a template opens the detail/preview page.
 */
import { useState, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, Clock, Users, Layers, ChevronRight, Search,
} from "lucide-react";
import { CATEGORIES, TEMPLATES } from "./templateData";

export default function TemplateLibrary() {
  const { category } = useParams();
  const nav = useNavigate();
  const [activeSub, setActiveSub] = useState(null);
  const [search, setSearch] = useState("");

  const cat = CATEGORIES.find((c) => c.id === category);

  // Get all templates for this category
  const categoryTemplates = useMemo(() => {
    if (!cat) return [];
    const result = [];
    for (const sub of cat.subcategories) {
      const templates = TEMPLATES[sub.id] || [];
      for (const t of templates) {
        if (
          search &&
          !t.name.toLowerCase().includes(search.toLowerCase()) &&
          !t.description.toLowerCase().includes(search.toLowerCase())
        ) {
          continue;
        }
        if (activeSub && sub.id !== activeSub) continue;
        result.push({ ...t, subcategory: sub.id, subcategoryLabel: sub.label });
      }
    }
    return result;
  }, [cat, activeSub, search]);

  if (!cat) {
    return (
      <div style={{ padding: 48, textAlign: "center" }}>
        <p style={{ color: "var(--text-secondary)" }}>Category not found.</p>
        <button onClick={() => nav("/app/campaigns/create/template")} style={{ color: "var(--text-link)", marginTop: 8, border: "none", background: "none", cursor: "pointer" }}>
          Back to categories
        </button>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh" }}>
      {/* Header */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "var(--bg-canvas)",
          borderBottom: "1px solid var(--border-default)",
        }}
      >
        <div style={{ padding: "16px 32px", display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={() => nav("/app/campaigns/create/template")}
            style={{
              display: "flex", alignItems: "center", gap: 4,
              border: "none", background: "none", color: "var(--text-secondary)",
              cursor: "pointer", fontSize: 13, fontFamily: "var(--font-ui)",
            }}
          >
            <ArrowLeft size={14} /> Templates
          </button>
          <span style={{ color: "var(--text-tertiary)", fontSize: 13 }}>/</span>
          <span style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 500 }}>{cat.label}</span>
        </div>
      </div>

      <div style={{ padding: "32px", maxWidth: 1100, margin: "0 auto" }}>
        {/* Page title */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-display)", margin: "0 0 6px" }}>
              {cat.label} Templates
            </h1>
            <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: 0 }}>
              {cat.description}
            </p>
          </div>
          <div
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "7px 12px", border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-md)", background: "var(--bg-surface)",
              width: 260,
            }}
          >
            <Search size={14} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search templates…"
              style={{
                flex: 1, border: "none", outline: "none", background: "transparent",
                fontSize: 13, color: "var(--text-primary)", fontFamily: "var(--font-ui)",
              }}
            />
          </div>
        </div>

        {/* Subcategory tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 24, flexWrap: "wrap" }}>
          <button
            onClick={() => setActiveSub(null)}
            style={{
              padding: "6px 14px",
              borderRadius: "var(--radius-full)",
              border: "1px solid",
              borderColor: !activeSub ? "var(--color-primary)" : "var(--border-default)",
              background: !activeSub ? "var(--color-primary-subtle)" : "transparent",
              color: !activeSub ? "var(--color-primary)" : "var(--text-secondary)",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 500,
              fontFamily: "var(--font-ui)",
              transition: "all 150ms ease",
            }}
          >
            All
          </button>
          {cat.subcategories.map((sub) => (
            <button
              key={sub.id}
              onClick={() => setActiveSub(activeSub === sub.id ? null : sub.id)}
              style={{
                padding: "6px 14px",
                borderRadius: "var(--radius-full)",
                border: "1px solid",
                borderColor: activeSub === sub.id ? "var(--color-primary)" : "var(--border-default)",
                background: activeSub === sub.id ? "var(--color-primary-subtle)" : "transparent",
                color: activeSub === sub.id ? "var(--color-primary)" : "var(--text-secondary)",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 500,
                fontFamily: "var(--font-ui)",
                transition: "all 150ms ease",
              }}
            >
              {sub.label}
            </button>
          ))}
        </div>

        {/* Template Cards */}
        {categoryTemplates.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center", color: "var(--text-tertiary)", fontSize: 14 }}>
            No templates found.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }} className="template-card-grid">
            {categoryTemplates.map((t) => (
              <div
                key={t.id}
                onClick={() => nav(`/app/campaigns/create/template/${category}/${t.id}`)}
                style={{
                  padding: "20px",
                  borderRadius: "var(--radius-xl)",
                  border: "1px solid var(--border-default)",
                  background: "var(--bg-surface)",
                  cursor: "pointer",
                  transition: "all 200ms ease",
                  display: "flex",
                  flexDirection: "column",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "var(--color-primary)";
                  e.currentTarget.style.boxShadow = "var(--shadow-md)";
                  e.currentTarget.style.transform = "translateY(-2px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--border-default)";
                  e.currentTarget.style.boxShadow = "none";
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                {/* Subcategory badge */}
                <div style={{ marginBottom: 12 }}>
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: "var(--radius-full)",
                      background: "var(--color-primary-subtle)",
                      color: "var(--color-primary)",
                      fontSize: 10,
                      fontWeight: 500,
                      fontFamily: "var(--font-ui)",
                    }}
                  >
                    {t.subcategoryLabel}
                  </span>
                </div>

                {/* Template name */}
                <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-ui)", margin: "0 0 6px" }}>
                  {t.name}
                </h3>

                {/* Description */}
                <p style={{ fontSize: 12.5, color: "var(--text-secondary)", margin: "0 0 12px", lineHeight: "17px", flex: 1 }}>
                  {t.description}
                </p>

                {/* Mini sequence preview */}
                <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
                  {t.structure.map((step, i) => (
                    <div
                      key={i}
                      style={{
                        flex: 1,
                        height: 4,
                        borderRadius: 2,
                        background: i === 0 ? "var(--color-primary)" : "var(--border-default)",
                      }}
                      title={`Step ${i + 1}: ${step.label}`}
                    />
                  ))}
                </div>

                {/* Meta */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 11, color: "var(--text-tertiary)" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                    <Layers size={11} /> {t.steps} steps
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                    <Clock size={11} /> {t.readingTime}
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                    <Users size={11} /> {t.recommendedAudience}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        @media (max-width: 900px) {
          .template-card-grid {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
        @media (max-width: 600px) {
          .template-card-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
