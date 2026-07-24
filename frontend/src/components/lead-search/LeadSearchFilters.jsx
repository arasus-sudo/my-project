import { useState, useMemo } from "react";
import { Search, X, ChevronDown, Plus, Clock, Star, Save, SlidersHorizontal, Users, Building2, MapPin, Shield, Cpu, Zap, Ban, Layers, Bookmark, Filter, Loader2 } from "lucide-react";

const FILTER_GROUPS = [
  {
    key: "saved", label: "Saved Searches", icon: Bookmark, defaultOpen: false,
    items: [],
  },
  {
    key: "people", label: "People", icon: Users, defaultOpen: true,
    items: [
      { key: "job_titles", label: "Job Titles", type: "multiselect_pills", placeholder: "CEO, CTO, VP Sales…", quickPills: ["CEO", "CTO", "VP Sales", "Director", "Founder", "Head of", "Manager", "Engineer"] },
      { key: "seniority", label: "Seniority", type: "multiselect", options: ["C-Suite", "Vice President", "Director", "Senior", "Mid-Level", "Entry", "Founder/Owner", "Partner"] },
      { key: "departments", label: "Department", type: "multiselect", options: ["Sales", "Marketing", "Engineering", "Finance", "HR", "Operations", "Product", "Legal", "Design", "Support"] },
      { key: "management_level", label: "Management Level", type: "multiselect", options: ["Executive", "Director", "Manager", "Individual Contributor", "Board", "Partner"] },
      { key: "skills", label: "Skills", type: "text", placeholder: "Python, React, SQL…" },
      { key: "years_experience", label: "Years of Experience", type: "range" },
      { key: "full_name", label: "Full Name", type: "text", placeholder: "John Smith" },
      { key: "has_verified_email", label: "Verified Email Only", type: "toggle" },
      { key: "has_mobile", label: "Has Mobile Number", type: "toggle" },
      { key: "has_linkedin", label: "Has LinkedIn Profile", type: "toggle" },
    ],
  },
  {
    key: "company", label: "Company", icon: Building2, defaultOpen: true,
    items: [
      { key: "company_name", label: "Company Name", type: "text", placeholder: "Search companies…" },
      { key: "company_domain", label: "Domain", type: "text", placeholder: "acme.com" },
      { key: "industry", label: "Industry", type: "multiselect_text", placeholder: "SaaS, Fintech, Healthcare…" },
      { key: "employee_count", label: "Company Size", type: "range_pills", quickPills: [
        { label: "1-10", min: 1, max: 10 }, { label: "11-50", min: 11, max: 50 },
        { label: "51-200", min: 51, max: 200 }, { label: "201-500", min: 201, max: 500 },
        { label: "501-1000", min: 501, max: 1000 }, { label: "1000+", min: 1001, max: null },
      ]},
      { key: "revenue", label: "Annual Revenue", type: "range_pills", quickPills: [
        { label: "<$1M", min: 0, max: 1000000 }, { label: "$1-10M", min: 1000000, max: 10000000 },
        { label: "$10-50M", min: 10000000, max: 50000000 }, { label: "$50-100M", min: 50000000, max: 100000000 },
        { label: "$100-500M", min: 100000000, max: 500000000 }, { label: "$500M-1B", min: 500000000, max: 1000000000 },
        { label: "$1B+", min: 1000000000, max: null },
      ]},
      { key: "funding_stage", label: "Funding Stage", type: "multiselect", options: ["Pre-Seed", "Seed", "Series A", "Series B", "Series C", "Series D", "Public", "Bootstrapped", "Acquired"] },
      { key: "technologies", label: "Technology Stack", type: "multiselect_text", placeholder: "Salesforce, HubSpot, AWS…" },
      { key: "founded_year", label: "Founded Year", type: "range" },
      { key: "company_type", label: "Company Type", type: "multiselect", options: ["Public", "Private", "Non-Profit", "Government"] },
    ],
  },
  {
    key: "location", label: "Location", icon: MapPin, defaultOpen: false,
    items: [
      { key: "country", label: "Country", type: "multiselect_text", placeholder: "US, UK, Germany…" },
      { key: "state", label: "State / Region", type: "text", placeholder: "California, Bavaria…" },
      { key: "city", label: "City", type: "text", placeholder: "San Francisco, London…" },
    ],
  },
  {
    key: "technology", label: "Technology", icon: Cpu, defaultOpen: false,
    items: [
      { key: "technologies", label: "Technologies Used", type: "multiselect_text", placeholder: "Search technologies…" },
      { key: "technology_categories", label: "Tech Category", type: "multiselect", options: ["CRM", "Marketing Automation", "Cloud", "ERP", "Analytics", "Payment", "Security", "AI/ML", "Database", "CMS", "E-commerce", "HR Tech"] },
    ],
  },
  {
    key: "signals", label: "Buying Signals", icon: Zap, defaultOpen: false,
    items: [
      { key: "recently_funded", label: "Recently Funded", type: "toggle" },
      { key: "hiring_status", label: "Actively Hiring", type: "toggle" },
      { key: "recently_founded", label: "Recently Founded", type: "toggle" },
    ],
  },
  {
    key: "contact", label: "Contact Availability", icon: Shield, defaultOpen: false,
    items: [
      { key: "has_verified_email", label: "Only Verified Emails", type: "toggle" },
      { key: "has_mobile", label: "Only Mobile Numbers", type: "toggle" },
      { key: "has_direct_dial", label: "Only Direct Dials", type: "toggle" },
      { key: "has_linkedin", label: "Only LinkedIn Profiles", type: "toggle" },
    ],
  },
  {
    key: "exclude", label: "Exclusions", icon: Ban, defaultOpen: false,
    items: [
      { key: "exclude_domains", label: "Exclude Domains", type: "text", placeholder: "competitor.com…" },
      { key: "exclude_industries", label: "Exclude Industries", type: "text", placeholder: "Government, Non-Profit…" },
      { key: "exclude_countries", label: "Exclude Countries", type: "text", placeholder: "Russia, North Korea…" },
    ],
  },
];

function FilterPill({ label, active, onClick }) {
  return (
    <button onClick={onClick}
      className={`text-tiny px-2 py-0.5 rounded-full border transition-colors ${active ? "bg-accent/10 border-accent text-accent font-medium" : "border-line text-ink-muted hover:border-accent/50 hover:text-ink"}`}>
      {label}
    </button>
  );
}

function FilterControl({ item, value, onChange }) {
  if (item.type === "text") {
    return (
      <input value={value || ""} onChange={(e) => onChange(e.target.value)}
        placeholder={item.placeholder}
        className="w-full border border-line rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent placeholder:text-ink-muted/50" />
    );
  }
  if (item.type === "toggle") {
    return (
      <label className="flex items-center gap-2.5 cursor-pointer py-0.5 select-none">
        <div className={`relative w-7 h-4 rounded-full transition-colors ${value ? "bg-accent" : "bg-gray-200"}`}>
          <div className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-transform ${value ? "translate-x-3" : ""}`} />
        </div>
        <span className="text-xs text-ink select-none">{item.label}</span>
      </label>
    );
  }
  if (item.type === "multiselect") {
    const arr = Array.isArray(value) ? value : [];
    return (
      <div className="space-y-1.5">
        <div className="flex flex-wrap gap-1.5">
          {(item.options || []).map((o) => (
            <FilterPill key={o} label={o} active={arr.includes(o)}
              onClick={() => onChange(arr.includes(o) ? arr.filter((s) => s !== o) : [...arr, o])} />
          ))}
        </div>
      </div>
    );
  }
  if (item.type === "multiselect_text") {
    const arr = Array.isArray(value) ? value : [];
    return (
      <div className="space-y-1.5">
        {arr.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {arr.map((v) => (
              <span key={v} className="inline-flex items-center gap-1 bg-accent/5 border border-accent/20 rounded-full px-2 py-0.5 text-xs text-accent">
                {v}
                <button onClick={() => onChange(arr.filter((s) => s !== v))}><X size={10} /></button>
              </span>
            ))}
          </div>
        )}
        <input value="" onChange={(e) => {
          const val = e.target.value;
          if (val.endsWith(",") || val.endsWith("\n")) {
            const item = val.replace(/[,\n]/g, "").trim();
            if (item && !arr.includes(item)) onChange([...arr, item]);
          }
        }} onKeyDown={(e) => {
          if (e.key === "Enter") {
            const input = e.target;
            const item = input.value.trim();
            if (item && !arr.includes(item)) { onChange([...arr, item]); }
            input.value = "";
          }
        }}
          placeholder={item.placeholder}
          className="w-full border border-line rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent placeholder:text-ink-muted/50" />
      </div>
    );
  }
  if (item.type === "multiselect_pills") {
    const arr = Array.isArray(value) ? value : [];
    return (
      <div className="space-y-1.5">
        <div className="flex flex-wrap gap-1.5">
          {(item.quickPills || []).map((p) => (
            <FilterPill key={p} label={p} active={arr.includes(p)}
              onClick={() => onChange(arr.includes(p) ? arr.filter((s) => s !== p) : [...arr, p])} />
          ))}
        </div>
        <input value="" onChange={(e) => {
          const val = e.target.value;
          if (val.endsWith(",") || val.endsWith("\n")) {
            const item = val.replace(/[,\n]/g, "").trim();
            if (item && !arr.includes(item)) onChange([...arr, item]);
          }
        }} onKeyDown={(e) => {
          if (e.key === "Enter") {
            const input = e.target;
            const item = input.value.trim();
            if (item && !arr.includes(item)) { onChange([...arr, item]); }
            input.value = "";
          }
        }}
          placeholder={item.placeholder}
          className="w-full border border-line rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent placeholder:text-ink-muted/50" />
      </div>
    );
  }
  if (item.type === "range") {
    return (
      <div className="flex gap-2 items-center">
        <input type="number" value={value?.min ?? ""} onChange={(e) => onChange({ ...(value || {}), min: e.target.value ? Number(e.target.value) : null })}
          placeholder="Min" className="w-full border border-line rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent" />
        <span className="text-ink-muted shrink-0 text-xs">—</span>
        <input type="number" value={value?.max ?? ""} onChange={(e) => onChange({ ...(value || {}), max: e.target.value ? Number(e.target.value) : null })}
          placeholder="Max" className="w-full border border-line rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent" />
      </div>
    );
  }
  if (item.type === "range_pills") {
    const v = value || {};
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {(item.quickPills || []).map((p) => {
            const active = v.min === p.min && v.max === p.max;
            return <FilterPill key={p.label} label={p.label} active={active} onClick={() => onChange(active ? {} : { min: p.min, max: p.max })} />;
          })}
        </div>
        <div className="flex gap-2 items-center">
          <input type="number" value={v.min ?? ""} onChange={(e) => onChange({ ...v, min: e.target.value ? Number(e.target.value) : null })}
            placeholder="Custom min" className="w-full border border-line rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent" />
          <span className="text-ink-muted shrink-0 text-xs">—</span>
          <input type="number" value={v.max ?? ""} onChange={(e) => onChange({ ...v, max: e.target.value ? Number(e.target.value) : null })}
            placeholder="Custom max" className="w-full border border-line rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent" />
        </div>
      </div>
    );
  }
  return null;
}

function ActiveFilterChip({ label, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1 bg-accent/5 border border-accent/20 rounded-full px-2 py-0.5 text-tiny text-accent font-medium">
      {label}
      <button onClick={onRemove} className="hover:bg-accent/10 rounded-full p-0.5"><X size={9} /></button>
    </span>
  );
}

export default function LeadSearchFilters({ filters, onChange, onClear, onSearch, activeCount, searchBusy, providers, savedSearches, onSaveSearch, onLoadSearch, onDeleteSearch }) {
  const [groupSearch, setGroupSearch] = useState("");
  const [saveName, setSaveName] = useState("");
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [openGroups, setOpenGroups] = useState(FILTER_GROUPS.reduce((acc, g) => ({ ...acc, [g.key]: g.defaultOpen }), {}));
  const [recentFilters] = useState(["job_titles", "industry", "country", "seniority"]);

  const toggleGroup = (key) => setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));

  const filteredGroups = useMemo(() => {
    if (!groupSearch.trim()) return FILTER_GROUPS;
    const q = groupSearch.toLowerCase();
    return FILTER_GROUPS.map((g) => ({
      ...g,
      items: g.items.filter((i) => i.label.toLowerCase().includes(q) || i.key.toLowerCase().includes(q)),
    })).filter((g) => g.items.length > 0);
  }, [groupSearch]);

  const activeFilters = Object.entries(filters).filter(([, v]) => {
    if (v === "" || v === null || v === undefined) return false;
    if (typeof v === "boolean" && !v) return false;
    if (Array.isArray(v) && !v.length) return false;
    if (typeof v === "object" && !Array.isArray(v) && !v.min && !v.max) return false;
    return true;
  });

  const handleChange = (key, val) => onChange({ ...filters, [key]: val });

  const handleClear = (key) => {
    const item = FILTER_GROUPS.flatMap((g) => g.items).find((i) => i.key === key);
    if (!item) return;
    const cleared = { ...filters };
    if (item.type === "toggle") cleared[key] = false;
    else if (item.type === "range" || item.type === "range_pills") cleared[key] = {};
    else if (item.type === "multiselect" || item.type === "multiselect_text" || item.type === "multiselect_pills") cleared[key] = [];
    else cleared[key] = "";
    onChange(cleared);
  };

  const handleSave = () => {
    if (!saveName.trim()) return;
    onSaveSearch(saveName.trim(), filters);
    setSaveName("");
    setShowSaveInput(false);
  };

  return (
    <div className="h-full flex flex-col bg-white border-r border-line">
      {/* Header */}
      <div className="shrink-0 px-4 py-2.5 border-b border-line">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <SlidersHorizontal size={15} className="text-ink" />
            <span className="font-display font-semibold text-sm">Filters</span>
            {activeFilters.length > 0 && (
              <span className="text-xs bg-accent/10 text-accent rounded-full px-2 py-0.5 font-mono">{activeFilters.length}</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {activeFilters.length > 0 && (
              <button onClick={() => setShowSaveInput(!showSaveInput)} className="text-xs text-ink-muted hover:text-accent flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-ash/50">
                <Save size={11} /> Save
              </button>
            )}
            {activeFilters.length > 0 && (
              <button onClick={onClear} className="text-xs text-ink-muted hover:text-ink flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-ash/50">
                <X size={11} /> Clear
              </button>
            )}
          </div>
        </div>
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input value={groupSearch} onChange={(e) => setGroupSearch(e.target.value)}
            placeholder="Search filters…"
            className="w-full pl-8 pr-3 py-2 border border-line rounded-lg text-sm bg-ash/50 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent placeholder:text-ink-muted/50" />
          {groupSearch && <button onClick={() => setGroupSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"><X size={12} /></button>}
        </div>
        {showSaveInput && (
          <div className="mt-2 flex gap-1.5">
            <input value={saveName} onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
              placeholder="Search name…"
              className="flex-1 border border-line rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent" />
            <button onClick={handleSave} className="btn-primary text-xs py-1 px-2">Save</button>
          </div>
        )}
      </div>

      {/* Active filter chips */}
      {activeFilters.length > 0 && (
        <div className="shrink-0 px-4 py-1.5 border-b border-line flex flex-wrap gap-1">
          {activeFilters.slice(0, 8).map(([key]) => {
            const item = FILTER_GROUPS.flatMap((g) => g.items).find((i) => i.key === key);
            return item ? <ActiveFilterChip key={key} label={item.label} onRemove={() => handleClear(key)} /> : null;
          })}
          {activeFilters.length > 8 && <span className="text-xs text-ink-muted py-0.5">+{activeFilters.length - 8} more</span>}
        </div>
      )}

      {/* Filter groups — scrollable */}
      <div className="flex-1 overflow-y-auto">
        {filteredGroups.map((group) => {
          const Icon = group.icon;
          const isOpen = openGroups[group.key];
          return (
            <div key={group.key} className="border-b border-line last:border-0">
              <button onClick={() => toggleGroup(group.key)}
                className="w-full flex items-center justify-between px-4 py-2 hover:bg-ash/30 transition-colors">
                <div className="flex items-center gap-1.5">
                  <Icon size={12} className="text-ink-muted" />
                  <span className="text-tiny font-semibold uppercase tracking-wider text-ink-muted">{group.label}</span>
                  {group.key === "saved" && savedSearches?.length > 0 && (
                    <span className="text-xs bg-accent/10 text-accent rounded-full px-1.5 py-0.5 font-mono">{savedSearches.length}</span>
                  )}
                </div>
                <ChevronDown size={13} className={`text-ink-muted transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </button>
              {isOpen && (
                <div className="px-4 pb-3 space-y-1.5">
                  {group.key === "saved" ? (
                    savedSearches?.length > 0 ? (
                      savedSearches.map((s) => (
                        <div key={s.id} className="flex items-center justify-between group hover:bg-ash/30 rounded-lg px-2 py-1 -mx-2">
                          <button onClick={() => onLoadSearch(s)}
                            className="text-xs text-left flex-1 truncate hover:text-accent transition-colors">
                            <span className="font-medium">{s.name}</span>
                          </button>
                          <button onClick={() => onDeleteSearch(s.id)}
                            className="opacity-0 group-hover:opacity-100 text-ink-muted hover:text-red-500 transition-all p-0.5">
                            <X size={11} />
                          </button>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-ink-muted italic">No saved searches yet</p>
                    )
                  ) : group.items.map((item) => (
                    <div key={item.key}>
                      {item.type !== "toggle" && (
                        <label className="text-tiny font-medium text-ink-muted block mb-0.5">{item.label}</label>
                      )}
                      <FilterControl item={item} value={filters[item.key]}
                        onChange={(val) => handleChange(item.key, val)} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer with search button */}
      <div className="shrink-0 px-4 py-2.5 border-t border-line bg-ash/30 space-y-1.5">
        <button onClick={onSearch} disabled={searchBusy}
          className="w-full btn-primary text-xs disabled:opacity-60 flex items-center justify-center gap-1.5">
          {searchBusy ? <><Loader2 size={12} className="animate-spin" /> Searching</>
            : <><Search size={12} /> Search</>}
        </button>
        <div className="flex items-center justify-between text-xs text-ink-muted">
          <span>{providers?.join(" + ") || "All providers"}</span>
          <span>{activeFilters.length} filter{activeFilters.length !== 1 ? "s" : ""} active</span>
        </div>
      </div>
    </div>
  );
}
