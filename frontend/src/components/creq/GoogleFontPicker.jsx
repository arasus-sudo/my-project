import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";
import { loadFont } from "../../lib/googleFonts";
import { Search, Check, ChevronDown } from "lucide-react";

const CATEGORIES = ["Sans Serif", "Serif", "Display", "Handwriting", "Monospace"];

/** Real Google Fonts — search + category filter, each row rendered in its own
 *  actual typeface. Replaces the old fixed 10-font <select>. Backed by
 *  GET /api/fonts, which searches the live, keyless Google Fonts metadata feed
 *  server-side (see backend/fonts_catalog.py) so the client only ever gets a
 *  small page, never the ~1900-family catalog. */
export default function GoogleFontPicker({ value, onChange, testid }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // Debounced search — fires on open, on query change, and on category change.
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const t = setTimeout(() => {
      api.get("/fonts", { params: { q, category, limit: 60 } })
        .then((r) => {
          setResults(r.data.fonts);
          // Eagerly load every row on this page (capped at 60) so previews
          // render in their real typeface — normal browser workload, and far
          // better UX than a per-row scroll-triggered loader for a list this size.
          r.data.fonts.forEach((f) => loadFont(f.family, f.weights.slice(0, 2)));
        })
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [q, category, open]);

  const pick = (family, weights) => {
    loadFont(family, weights);
    onChange(family);
    setOpen(false);
  };

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid={testid || "font-picker-trigger"}
        className="mt-1 w-full border border-line rounded-full px-3 py-2 bg-white text-sm flex items-center justify-between"
      >
        <span style={{ fontFamily: `"${value}", sans-serif` }} className="truncate">{value || "Choose a font"}</span>
        <ChevronDown size={14} className="text-neutral-400 shrink-0" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[280px] bg-white border border-line rounded-2xl shadow-lg overflow-hidden"
          data-testid="font-picker-panel">
          <div className="p-2 border-b border-line">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search fonts…"
                data-testid="font-picker-search"
                className="w-full border border-line rounded-full pl-7 pr-3 py-1.5 text-sm focus:outline-none focus:border-ink"
              />
            </div>
            <div className="flex gap-1 mt-2 flex-wrap">
              <CategoryChip active={!category} onClick={() => setCategory("")}>All</CategoryChip>
              {CATEGORIES.map((c) => (
                <CategoryChip key={c} active={category === c} onClick={() => setCategory(c)}>{c}</CategoryChip>
              ))}
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto" data-testid="font-picker-results">
            {loading ? (
              <div className="p-4 text-xs text-neutral-400 text-center">Searching…</div>
            ) : results.length === 0 ? (
              <div className="p-4 text-xs text-neutral-400 text-center">No fonts match “{q}”.</div>
            ) : results.map((f) => (
              <button
                key={f.family}
                type="button"
                onClick={() => pick(f.family, f.weights)}
                data-testid={`font-option-${f.family}`}
                className="w-full text-left px-3 py-2 hover:bg-surfacehover flex items-center justify-between gap-2"
              >
                <span style={{ fontFamily: `"${f.family}", sans-serif` }} className="text-[15px] truncate">
                  {f.family}
                </span>
                {value === f.family && <Check size={13} className="text-sanguine shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CategoryChip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-[11px] px-2 py-1 rounded-full border transition-colors ${
        active ? "bg-ink text-white border-ink" : "border-line text-neutral-500 hover:border-ink"
      }`}
    >
      {children}
    </button>
  );
}
