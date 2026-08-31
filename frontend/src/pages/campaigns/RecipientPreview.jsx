/**
 * RecipientPreview — resolves {{variables}} against a sample recipient
 * so the user can see exactly what the email will look like.
 *
 * Provides a recipient selector dropdown and a toggle between
 * "Variable View" and "Recipient Preview".
 */
import { useState, useMemo } from "react";
import { SAMPLE_RECIPIENTS } from "./templateData";
import { Eye, Code, ChevronDown } from "lucide-react";

const VARIABLE_ALIAS = {
  company_name: "company", company: "company_name",
  job_title: "title", title: "job_title",
};

function getVar(recipient, key) {
  if (recipient[key] !== undefined && recipient[key] !== null) return recipient[key];
  const alias = VARIABLE_ALIAS[key];
  if (alias && recipient[alias] !== undefined && recipient[alias] !== null) return recipient[alias];
  return undefined;
}

/**
 * Resolves {{variable}} tokens in a string using the given recipient data.
 * Handles aliases: {{company}} ↔ {{company_name}}, {{title}} ↔ {{job_title}}
 */
export function resolveVariables(text, recipient) {
  if (!text || !recipient) return text || "";
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
    const val = getVar(recipient, key);
    return val !== undefined && val !== null ? String(val) : `{{${key}}}`;
  });
}

export default function RecipientPreview({ children, resolveFrom }) {
  const [mode, setMode] = useState("variable"); // "variable" | "preview"
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const recipient = SAMPLE_RECIPIENTS[selectedIdx];

  const resolvedText = useMemo(() => {
    if (!resolveFrom) return null;
    return resolveVariables(resolveFrom, mode === "preview" ? recipient : null);
  }, [resolveFrom, mode, selectedIdx]);

  const selectedRecipient = SAMPLE_RECIPIENTS[selectedIdx];

  return (
    <div>
      {/* Controls bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 0",
          gap: 8,
        }}
      >
        {/* Recipient selector */}
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 10px",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-md)",
              background: "var(--bg-surface)",
              cursor: "pointer",
              fontSize: 12,
              color: "var(--text-secondary)",
              fontFamily: "var(--font-ui)",
            }}
          >
            <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>
              {selectedRecipient.first_name} {selectedRecipient.last_name}
            </span>
            <span style={{ color: "var(--text-tertiary)" }}>—</span>
            <span>{selectedRecipient.job_title}</span>
            <span style={{ color: "var(--text-tertiary)" }}>—</span>
            <span>{selectedRecipient.company_name}</span>
            <ChevronDown size={12} style={{ color: "var(--text-tertiary)" }} />
          </button>
          {dropdownOpen && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                marginTop: 4,
                minWidth: 280,
                background: "var(--bg-surface-raised)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-lg)",
                boxShadow: "var(--shadow-md)",
                zIndex: "var(--z-dropdown)",
                padding: 4,
              }}
            >
              {SAMPLE_RECIPIENTS.map((r, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setSelectedIdx(i);
                    setDropdownOpen(false);
                  }}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 10px",
                    border: "none",
                    background: i === selectedIdx ? "var(--bg-selected)" : "transparent",
                    borderRadius: "var(--radius-sm)",
                    cursor: "pointer",
                    fontSize: 12,
                    color: "var(--text-primary)",
                    fontFamily: "var(--font-ui)",
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) => {
                    if (i !== selectedIdx) e.currentTarget.style.background = "var(--bg-hover)";
                  }}
                  onMouseLeave={(e) => {
                    if (i !== selectedIdx) e.currentTarget.style.background = "transparent";
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500 }}>{r.first_name} {r.last_name}</div>
                    <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                      {r.job_title} — {r.company_name}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Mode toggle */}
        <div
          style={{
            display: "flex",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-md)",
            overflow: "hidden",
          }}
        >
          <button
            onClick={() => setMode("variable")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "5px 10px",
              border: "none",
              background: mode === "variable" ? "var(--color-primary-subtle)" : "transparent",
              color: mode === "variable" ? "var(--color-primary)" : "var(--text-tertiary)",
              cursor: "pointer",
              fontSize: 11,
              fontWeight: 500,
              fontFamily: "var(--font-ui)",
              borderRight: "1px solid var(--border-default)",
            }}
          >
            <Code size={11} /> Variables
          </button>
          <button
            onClick={() => setMode("preview")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "5px 10px",
              border: "none",
              background: mode === "preview" ? "var(--color-primary-subtle)" : "transparent",
              color: mode === "preview" ? "var(--color-primary)" : "var(--text-tertiary)",
              cursor: "pointer",
              fontSize: 11,
              fontWeight: 500,
              fontFamily: "var(--font-ui)",
            }}
          >
            <Eye size={11} /> Preview
          </button>
        </div>
      </div>

      {/* Render children with resolved context */}
      {typeof children === "function"
        ? children({ mode, recipient, resolvedText })
        : children}
    </div>
  );
}
