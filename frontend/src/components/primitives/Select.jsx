import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Check } from "../../icons";

/* Select — docs/design-system.md §7.3.
 * Trigger matches Input's geometry + a rotating chevron. Menu is
 * --bg-surface-raised / --shadow-md, 34px rows, type-ahead by first
 * character. Searchable variant switches on when there are >8 options,
 * per spec, rather than being a separate prop callers have to remember.
 */

export default function Select({
  label,
  help,
  error,
  options,           // [{ value, label }] or [{ group, options }]
  value,
  onChange,
  placeholder = "Select…",
  size = "md",
  disabled = false,
  className = "",
  id,
  ...rest
}) {
  const autoId = useId();
  const selectId = id || autoId;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef(null);
  const height = size === "sm" ? 34 : size === "lg" ? 44 : 38;
  const hasError = Boolean(error);

  const flat = options.flatMap((o) => (o.options ? o.options : [o]));
  const searchable = flat.length > 8;
  const visible = query
    ? flat.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;
  const current = flat.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={className} ref={rootRef}>
      {label && (
        <label htmlFor={selectId} style={{
          display: "block", fontSize: 13, fontWeight: 500, color: "var(--text-primary)",
          fontFamily: "var(--font-ui)", marginBottom: 6,
        }}>
          {label}
        </label>
      )}
      <div className="relative">
        <button
          type="button"
          id={selectId}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="w-full flex items-center justify-between ds-input"
          style={{
            height, padding: "0 12px",
            borderRadius: "var(--radius-md)",
            border: `1px solid ${hasError ? "var(--color-danger)" : "var(--border-default)"}`,
            background: disabled ? "var(--bg-disabled)" : "var(--bg-surface)",
            color: current ? "var(--text-primary)" : "var(--text-tertiary)",
            fontSize: 14, fontFamily: "var(--font-ui)", textAlign: "left",
            cursor: disabled ? "not-allowed" : "pointer",
          }}
          {...rest}
        >
          <span className="truncate">{current ? current.label : placeholder}</span>
          <ChevronDown
            size={16} strokeWidth={1.5} aria-hidden="true"
            style={{
              color: "var(--text-tertiary)", flexShrink: 0, marginLeft: 8,
              transform: open ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform var(--dur-fast) var(--ease-out)",
            }}
          />
        </button>

        {open && (
          <div
            role="listbox"
            className="absolute left-0 right-0"
            style={{
              top: height + 4, zIndex: "var(--z-dropdown)",
              background: "var(--bg-surface-raised)", boxShadow: "var(--shadow-md)",
              borderRadius: "var(--radius-lg)", padding: 4,
              maxHeight: 320, overflowY: "auto",
            }}
          >
            {searchable && (
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                className="w-full ds-input"
                style={{
                  height: 30, padding: "0 8px", marginBottom: 4, fontSize: 13,
                  border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)",
                  background: "var(--bg-surface)", color: "var(--text-primary)",
                }}
              />
            )}
            {visible.length === 0 && (
              <div style={{ padding: "8px 10px", fontSize: 12.5, color: "var(--text-tertiary)" }}>No matches</div>
            )}
            {visible.map((group) =>
              group.options ? (
                <div key={group.group}>
                  <div style={{
                    fontSize: 10.5, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase",
                    color: "var(--text-tertiary)", padding: "8px 10px 4px",
                  }}>
                    {group.group}
                  </div>
                  {group.options.map((opt) => (
                    <SelectRow key={opt.value} opt={opt} selected={opt.value === value}
                      onSelect={() => { onChange(opt.value); setOpen(false); setQuery(""); }} />
                  ))}
                </div>
              ) : (
                <SelectRow key={group.value} opt={group} selected={group.value === value}
                  onSelect={() => { onChange(group.value); setOpen(false); setQuery(""); }} />
              )
            )}
          </div>
        )}
      </div>
      {(help || error) && (
        <div style={{ marginTop: 6, fontSize: 11.5, color: hasError ? "var(--color-danger-text)" : "var(--text-tertiary)" }}>
          {hasError ? error : help}
        </div>
      )}
    </div>
  );
}

function SelectRow({ opt, selected, onSelect }) {
  return (
    <div
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className="flex items-center justify-between cursor-pointer"
      style={{
        height: 34, padding: "0 10px", borderRadius: "var(--radius-md)",
        fontSize: 13.5, fontFamily: "var(--font-ui)",
        background: selected ? "var(--bg-selected)" : "transparent",
        color: "var(--text-primary)",
      }}
      onMouseEnter={(e) => { if (!selected) e.currentTarget.style.background = "var(--bg-hover)"; }}
      onMouseLeave={(e) => { if (!selected) e.currentTarget.style.background = "transparent"; }}
    >
      <span className="truncate">{opt.label}</span>
      {selected && <Check size={16} strokeWidth={1.5} aria-hidden="true" style={{ color: "var(--color-primary)", flexShrink: 0 }} />}
    </div>
  );
}
