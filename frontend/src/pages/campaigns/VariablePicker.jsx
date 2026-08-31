/**
 * VariablePicker — first-class UI for inserting merge variables.
 *
 * Opens a searchable categorized list. When a variable is clicked,
 * it's inserted as a visually distinct token/chip in the editor.
 */
import { useState, useRef, useEffect } from "react";
import { VARIABLE_CATEGORIES } from "./templateData";
import { ChevronDown, Search, X, Variable } from "lucide-react";

export default function VariablePicker({ onSelect, onClose }) {
  const [search, setSearch] = useState("");
  const [openCategory, setOpenCategory] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose?.();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const filtered = VARIABLE_CATEGORIES.map((cat) => ({
    ...cat,
    variables: cat.variables.filter(
      (v) =>
        !search ||
        v.label.toLowerCase().includes(search.toLowerCase()) ||
        v.key.toLowerCase().includes(search.toLowerCase())
    ),
  })).filter((cat) => cat.variables.length > 0);

  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        top: "100%",
        left: 0,
        marginTop: 4,
        width: 320,
        maxHeight: 400,
        overflow: "auto",
        background: "var(--bg-surface-raised)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-xl)",
        boxShadow: "var(--shadow-lg)",
        zIndex: "var(--z-dropdown)",
      }}
    >
      {/* Search */}
      <div
        style={{
          padding: "10px 12px",
          borderBottom: "1px solid var(--border-subtle)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Search size={14} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
        <input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search variables…"
          style={{
            flex: 1,
            border: "none",
            outline: "none",
            background: "transparent",
            fontSize: 13,
            color: "var(--text-primary)",
            fontFamily: "var(--font-ui)",
          }}
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--text-tertiary)" }}
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Categories */}
      <div style={{ padding: 4 }}>
        {filtered.map((cat) => (
          <div key={cat.label}>
            <button
              onClick={() => setOpenCategory(openCategory === cat.label ? null : cat.label)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 10px",
                border: "none",
                background: "transparent",
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 500,
                color: "var(--text-secondary)",
                fontFamily: "var(--font-ui)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              {cat.label}
              <ChevronDown
                size={12}
                style={{
                  color: "var(--text-tertiary)",
                  transform: openCategory === cat.label ? "rotate(180deg)" : "rotate(0)",
                  transition: "transform 150ms ease",
                }}
              />
            </button>
            {(openCategory === cat.label || search) &&
              cat.variables.map((v) => (
                <button
                  key={v.key}
                  onClick={() => {
                    onSelect?.(v);
                    onClose?.();
                  }}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "7px 10px 7px 24px",
                    border: "none",
                    background: "transparent",
                    borderRadius: "var(--radius-sm)",
                    cursor: "pointer",
                    fontSize: 13,
                    color: "var(--text-primary)",
                    fontFamily: "var(--font-ui)",
                    textAlign: "left",
                    transition: "background 100ms ease",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <Variable size={12} style={{ color: "var(--color-primary)", flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>{v.label}</span>
                  <span
                    style={{
                      fontSize: 11,
                      fontFamily: "var(--font-mono)",
                      color: "var(--text-tertiary)",
                      background: "var(--bg-surface-sunken)",
                      padding: "1px 6px",
                      borderRadius: "var(--radius-xs)",
                    }}
                  >
                    {`{{${v.key}}}`}
                  </span>
                </button>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * VariableToken — renders a variable as a visual chip/pill in the editor.
 */
export function VariableToken({ variable, onRemove }) {
  return (
    <span
      contentEditable={false}
      suppressContentEditableWarning
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        margin: "0 2px",
        borderRadius: "var(--radius-sm)",
        background: "var(--color-primary-subtle)",
        border: "1px solid var(--color-primary-border)",
        color: "var(--color-primary)",
        fontSize: 12,
        fontWeight: 500,
        fontFamily: "var(--font-mono)",
        lineHeight: "20px",
        verticalAlign: "baseline",
        whiteSpace: "nowrap",
        userSelect: "all",
      }}
    >
      {`{{${variable}}}`}
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 14,
            height: 14,
            borderRadius: "var(--radius-full)",
            background: "var(--color-primary)",
            border: "none",
            padding: 0,
            cursor: "pointer",
            color: "#fff",
            lineHeight: 1,
          }}
        >
          <X size={9} />
        </button>
      )}
    </span>
  );
}
