import { useState, useCallback, useRef, useEffect } from "react";
import { Search, X, ChevronDown, ChevronUp, ArrowUpDown, Eye, EyeOff, Loader2, Mail, Phone, Linkedin, CheckSquare, Square, Download, MoreHorizontal, Columns, SlidersHorizontal } from "lucide-react";
import { api, isCreditError } from "../../lib/api";
import { toast } from "sonner";

const DEFAULT_COLUMNS = [
  { key: "full_name", label: "Name", width: 180, minWidth: 120, always: true },
  { key: "title", label: "Title", width: 200, minWidth: 120, default: true },
  { key: "company", label: "Company", width: 180, minWidth: 120, default: true },
  { key: "email", label: "Email", width: 220, minWidth: 140, default: true },
  { key: "phone", label: "Phone", width: 150, minWidth: 100 },
  { key: "location", label: "Location", width: 160, minWidth: 100, default: true },
  { key: "company_industry", label: "Industry", width: 140, minWidth: 100 },
  { key: "company_size", label: "Size", width: 80, minWidth: 60 },
  { key: "verified", label: "Email Status", width: 100, minWidth: 80, default: true },
  { key: "seniority", label: "Seniority", width: 100, minWidth: 80 },
  { key: "technologies", label: "Tech Stack", width: 160, minWidth: 100 },
  { key: "skills", label: "Skills", width: 140, minWidth: 100 },
  { key: "linkedin_url", label: "LinkedIn", width: 80, minWidth: 60 },
  { key: "source_provider", label: "Source", width: 80, minWidth: 60 },
];

function ColumnResizer({ onResize }) {
  const ref = useRef(null);
  const dragging = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handleMouseDown = (e) => {
      dragging.current = true;
      const startX = e.clientX;
      const startWidth = el.parentElement.getBoundingClientRect().width;
      const handleMouseMove = (e2) => {
        if (!dragging.current) return;
        const diff = e2.clientX - startX;
        onResize(Math.max(60, startWidth + diff));
      };
      const handleMouseUp = () => { dragging.current = false; document.removeEventListener("mousemove", handleMouseMove); document.removeEventListener("mouseup", handleMouseUp); };
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    };
    el.addEventListener("mousedown", handleMouseDown);
    return () => el.removeEventListener("mousedown", handleMouseDown);
  }, [onResize]);

  return <div ref={ref} className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-accent/50 group-hover:bg-accent/30 z-10" />;
}

function LeadRow({ lead, columns, visibleCols, selected, onToggle, onReveal, onSelect, revealing }) {
  const cell = (k) => {
    if (k === "full_name") return <span className="font-medium text-sm">{lead.full_name || "—"}</span>;
    if (k === "location") { const l = lead.location || {}; return <span className="text-sm text-ink-muted">{[l.city, l.state, l.country].filter(Boolean).join(", ") || "—"}</span>; }
    if (k === "verified") {
      const s = lead.email_status || lead.verification_status;
      if (s === "valid" || s === "verified" || s === "revealed") return <span className="text-xs bg-success/10 text-success px-2 py-0.5 rounded-full font-medium">Verified</span>;
      return <span className="text-xs bg-warning/10 text-warning px-2 py-0.5 rounded-full">Unverified</span>;
    }
    if (k === "linkedin_url") {
      if (!lead.linkedin_url) return <span className="text-ink-muted text-xs">—</span>;
      return <a href={lead.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline text-xs"><Linkedin size={13} /></a>;
    }
    if (k === "technologies") {
      const t = lead.company_technologies || lead.technologies || [];
      return Array.isArray(t) && t.length ? <span className="text-xs text-ink-muted">{t.slice(0, 2).join(", ")}{t.length > 2 ? ` +${t.length - 2}` : ""}</span> : <span className="text-ink-muted text-xs">—</span>;
    }
    if (k === "skills") {
      const s = lead.skills || [];
      return Array.isArray(s) && s.length ? <span className="text-xs text-ink-muted">{s.slice(0, 2).join(", ")}{s.length > 2 ? ` +${s.length - 2}` : ""}</span> : <span className="text-ink-muted text-xs">—</span>;
    }
    if (k === "email") {
      if (lead.email && lead.email !== "—" && !lead.email.includes("masked")) return <span className="text-xs font-mono">{lead.email}</span>;
      return <span className="text-xs text-ink-muted italic">Reveal</span>;
    }
    if (k === "phone") {
      if (lead.phone) return <span className="text-xs font-mono">{lead.phone}</span>;
      return <span className="text-xs text-ink-muted italic">Reveal</span>;
    }
    if (k === "company_size") {
      const s = lead.company_size;
      return s ? <span className="text-xs text-ink-muted">{s}</span> : <span className="text-ink-muted text-xs">—</span>;
    }
    if (k === "source_provider") return <span className="text-xs text-ink-muted uppercase">{lead.source_provider || "—"}</span>;
    const v = lead[k];
    return v != null && v !== "" ? <span className="text-sm">{String(v)}</span> : <span className="text-ink-muted text-xs">—</span>;
  };

  const lid = lead.id || lead.email || `${lead.first_name}_${lead.last_name}`;

  return (
    <tr className={`border-b border-line last:border-0 hover:bg-ash/40 transition-colors group cursor-pointer ${selected ? "bg-accent/5" : ""}`}
      onClick={() => onSelect(lead)}>
      <td className="p-3 w-10" onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" checked={!!selected} onChange={() => onToggle()}
          className="rounded border-line w-4 h-4 accent-accent" />
      </td>
      {visibleCols.map((c) => (
        <td key={c.key} className="p-3 truncate" style={{ maxWidth: c.width || 150 }}>
          {cell(c.key)}
        </td>
      ))}
      <td className="p-3 w-28" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {(!lead.email || lead.email === "—" || lead.email?.includes("masked")) && (
            <button onClick={() => onReveal(lead, "email")} disabled={revealing[lid + "_email"]}
              className="btn-ghost text-xs py-1 px-2" title="Reveal email">
              {revealing[lid + "_email"] ? <Loader2 size={11} className="animate-spin" /> : <Mail size={11} />}
            </button>
          )}
          {(!lead.phone || lead.phone === "—") && (
            <button onClick={() => onReveal(lead, "phone")} disabled={revealing[lid + "_phone"]}
              className="btn-ghost text-xs py-1 px-2" title="Reveal phone">
              {revealing[lid + "_phone"] ? <Loader2 size={11} className="animate-spin" /> : <Phone size={11} />}
            </button>
          )}
          <button onClick={() => window.open(lead.linkedin_url || `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(lead.first_name + " " + lead.last_name)}`, "_blank")}
            className="btn-ghost text-xs py-1 px-2" title="LinkedIn"><Linkedin size={11} /></button>
        </div>
      </td>
    </tr>
  );
}

function SkeletonRows({ count, columns }) {
  return Array.from({ length: count }).map((_, i) => (
    <tr key={i} className="border-b border-line">
      <td className="p-3"><div className="w-4 h-4 bg-gray-100 rounded" /></td>
      {columns.map((c) => (
        <td key={c.key} className="p-3">
          <div className="h-4 bg-gray-100 rounded animate-pulse" style={{ width: `${40 + Math.random() * 40}%` }} />
        </td>
      ))}
      <td className="p-3"><div className="w-16 h-4 bg-gray-100 rounded animate-pulse" /></td>
    </tr>
  ));
}

export default function LeadSearchTable({
  results, totalCount, page, pageSize, selected, onToggle, onToggleAll,
  onReveal, revealing, onSelect, loading, onPageChange, onPageSizeChange,
  hideReveal = false,
}) {
  const [columns, setColumns] = useState(DEFAULT_COLUMNS.filter((c) => c.always || c.default));
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const [colPicker, setColPicker] = useState(false);
  const [search, setSearch] = useState("");

  const visibleCols = columns;

  const handleSort = (key) => {
    if (sortCol === key) {
      if (sortDir === "asc") setSortDir("desc");
      else { setSortCol(null); setSortDir("asc"); }
    } else { setSortCol(key); setSortDir("asc"); }
  };

  const toggleCol = (c) => {
    if (c.always) return;
    setColumns((prev) => prev.find((x) => x.key === c.key) ? prev.filter((x) => x.key !== c.key) : [...prev, c]);
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="shrink-0 px-4 py-2.5 border-b border-line flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter in results…"
            className="w-full pl-8 pr-3 py-1.5 border border-line rounded-lg text-sm bg-ash/30 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent" />
        </div>
        <span className="text-sm text-ink-muted font-mono">{totalCount || results.length} results</span>
        <button onClick={() => {
          const cols = columns.length ? columns : DEFAULT_COLUMNS.filter(c => c.default || c.always);
          const headers = cols.map(c => c.label);
          const rows = results.map(r => cols.map(c => {
            if (c.key === "location") return [r.country, r.state, r.city].filter(Boolean).join(", ");
            if (c.key === "verified") return r.email_status || r.verification_status || "";
            if (c.key === "technologies" || c.key === "skills") return Array.isArray(r[c.key]) ? r[c.key].join("; ") : r[c.key] || "";
            return r[c.key] || "";
          }));
          const csv = [headers.join(","), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(","))].join("\n");
          const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
          const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "leads.csv"; a.click(); URL.revokeObjectURL(a.href);
        }} className="btn-secondary text-xs py-1.5">
          <Download size={12} /> Export
        </button>
        <div className="relative ml-auto">
          <button onClick={() => setColPicker(!colPicker)} className="btn-secondary text-xs py-1.5">
            <Eye size={12} /> Columns
          </button>
          {colPicker && (
            <div className="absolute right-0 top-full mt-2 bg-white border border-line rounded-xl shadow-card-lg z-30 p-3 w-56 max-h-72 overflow-y-auto">
              <div className="text-tiny font-mono uppercase tracking-wider text-ink-muted mb-2">Toggle Columns</div>
              {DEFAULT_COLUMNS.map((c) => (
                <label key={c.key} className="flex items-center gap-2 py-1.5 text-sm cursor-pointer hover:bg-ash rounded px-1">
                  <input type="checkbox" checked={columns.includes(c) || c.always} disabled={c.always}
                    onChange={() => toggleCol(c)} className="rounded border-line accent-accent" />
                  <span className="text-xs">{c.label}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-line bg-ash/80 backdrop-blur-sm">
              <th className="p-3 w-10">
                <input type="checkbox"
                  checked={results.length > 0 && results.every((_, i) => selected.has(i))}
                  onChange={(e) => onToggleAll(e.target.checked)}
                  className="rounded border-line accent-accent" />
              </th>
              {visibleCols.map((c) => (
                <th key={c.key}
                  className="p-3 text-left whitespace-nowrap select-none group/th"
                  style={{ width: c.width, minWidth: c.minWidth }}>
                  <button onClick={() => handleSort(c.key)}
                    className="ui-label inline-flex items-center gap-1 hover:text-ink transition-colors">
                    {c.label}
                    {sortCol === c.key ? (
                      sortDir === "asc" ? <ChevronUp size={11} /> : <ChevronDown size={11} />
                    ) : (
                      <ArrowUpDown size={10} className="opacity-0 group-hover/th:opacity-30" />
                    )}
                  </button>
                </th>
              ))}
              <th className="ui-label p-3 text-left w-28">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <SkeletonRows count={pageSize} columns={visibleCols} />
            ) : results.length === 0 ? (
              <tr>
                <td colSpan={visibleCols.length + 2} className="p-12 text-center">
                  <div className="text-ink-muted text-sm">No results found</div>
                </td>
              </tr>
            ) : (
              results.map((lead, i) => (
                <LeadRow key={lead.id || lead.email || i} lead={lead} columns={columns}
                  visibleCols={visibleCols} selected={selected.has(i)}
                  onToggle={() => onToggle(i)} onReveal={onReveal}
                  onSelect={onSelect} revealing={revealing} />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="shrink-0 px-4 py-2.5 border-t border-line flex items-center justify-between bg-white">
        <div className="flex items-center gap-2">
          <span className="text-xs text-ink-muted">Rows:</span>
          <select value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="border border-line rounded-lg px-2 py-1 text-xs bg-white">
            <option value={10}>10</option><option value={25}>25</option>
            <option value={50}>50</option><option value={100}>100</option>
          </select>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-ink-muted">
            Page {page} of {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <button onClick={() => onPageChange(1)} disabled={page <= 1}
              className="btn-ghost text-xs py-1 px-2 disabled:opacity-30 border border-line rounded-lg">{"<<"}</button>
            <button onClick={() => onPageChange(page - 1)} disabled={page <= 1}
              className="btn-ghost text-xs py-1 px-2 disabled:opacity-30 border border-line rounded-lg"><ChevronDown size={12} className="rotate-90" /></button>
            <span className="text-xs font-mono px-2">{page}</span>
            <button onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}
              className="btn-ghost text-xs py-1 px-2 disabled:opacity-30 border border-line rounded-lg"><ChevronDown size={12} className="-rotate-90" /></button>
            <button onClick={() => onPageChange(totalPages)} disabled={page >= totalPages}
              className="btn-ghost text-xs py-1 px-2 disabled:opacity-30 border border-line rounded-lg">{">>"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
