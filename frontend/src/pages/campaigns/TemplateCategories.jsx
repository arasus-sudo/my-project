/**
 * TemplateCategories — /campaigns/create/template
 *
 * Shows the four top-level campaign categories.
 * Clicking a category navigates to its subcategories.
 */
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Target, Megaphone, Users, UserPlus, ChevronRight,
} from "lucide-react";
import { CATEGORIES } from "./templateData";

const ICONS = {
  Target,
  Megaphone,
  Users,
  UserPlus,
};

const COLORS = [
  { color: "var(--color-primary)", bg: "var(--color-primary-subtle)" },
  { color: "var(--color-success-text)", bg: "var(--color-success-subtle)" },
  { color: "var(--color-intel)", bg: "var(--color-intel-subtle)" },
  { color: "var(--color-warning-text)", bg: "var(--color-warning-subtle)" },
];

export default function TemplateCategories() {
  const nav = useNavigate();

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
            onClick={() => nav("/app/campaigns")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              border: "none",
              background: "none",
              color: "var(--text-secondary)",
              cursor: "pointer",
              fontSize: 13,
              fontFamily: "var(--font-ui)",
            }}
          >
            <ArrowLeft size={14} /> Campaigns
          </button>
          <span style={{ color: "var(--text-tertiary)", fontSize: 13 }}>/</span>
          <span style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 500 }}>Choose a campaign type</span>
        </div>
      </div>

      <div style={{ padding: "32px", maxWidth: 900, margin: "0 auto" }}>
        {/* Page title */}
        <div style={{ marginBottom: 32 }}>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 600,
              color: "var(--text-primary)",
              fontFamily: "var(--font-display)",
              margin: "0 0 6px",
            }}
          >
            Choose a campaign type
          </h1>
          <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: 0, lineHeight: "20px" }}>
            Start with a proven campaign structure and customize it for your audience.
          </p>
        </div>

        {/* Category Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }} className="template-cat-grid">
          {CATEGORIES.map((cat, i) => {
            const Icon = ICONS[cat.icon] || Target;
            const { color, bg } = COLORS[i % COLORS.length];
            return (
              <div
                key={cat.id}
                onClick={() => nav(`/app/campaigns/create/template/${cat.id}`)}
                style={{
                  padding: "24px",
                  borderRadius: "var(--radius-xl)",
                  border: "1px solid var(--border-default)",
                  background: "var(--bg-surface)",
                  cursor: "pointer",
                  transition: "all 200ms ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = color;
                  e.currentTarget.style.boxShadow = "var(--shadow-md)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--border-default)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: "var(--radius-lg)",
                      background: bg,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Icon size={22} style={{ color }} strokeWidth={1.5} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <h3
                        style={{
                          fontSize: 15,
                          fontWeight: 600,
                          color: "var(--text-primary)",
                          fontFamily: "var(--font-ui)",
                          margin: 0,
                        }}
                      >
                        {cat.label}
                      </h3>
                      <ChevronRight size={16} style={{ color: "var(--text-tertiary)" }} />
                    </div>
                    <p
                      style={{
                        fontSize: 13,
                        color: "var(--text-secondary)",
                        margin: "4px 0 12px",
                        lineHeight: "18px",
                      }}
                    >
                      {cat.description}
                    </p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {cat.subcategories.map((sub) => (
                        <span
                          key={sub.id}
                          style={{
                            padding: "3px 8px",
                            borderRadius: "var(--radius-full)",
                            background: "var(--bg-surface-sunken)",
                            border: "1px solid var(--border-subtle)",
                            fontSize: 11,
                            color: "var(--text-secondary)",
                            fontFamily: "var(--font-ui)",
                          }}
                        >
                          {sub.label}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .template-cat-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
