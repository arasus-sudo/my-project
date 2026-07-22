import { useState, useEffect, useRef, useCallback } from "react";
import { api, isCreditError } from "../lib/api";
import { toast } from "sonner";
import { Search, Bot, X, ChevronLeft, ChevronRight, SlidersHorizontal, Loader2, Wallet, Lightbulb, List, Tags, Flag, Megaphone } from "lucide-react";
import { PageHeader } from "../components/AppLayout";
import LeadSearchFilters from "../components/lead-search/LeadSearchFilters";
import LeadSearchTable from "../components/lead-search/LeadSearchTable";
import LeadPreviewPanel from "../components/lead-search/LeadPreviewPanel";
import LeadListsPanel from "../components/lead-search/LeadListsPanel";
import AddToListDropdown from "../components/lead-search/AddToListDropdown";
import BulkActions from "../components/lead-search/BulkActions";

const AI_EXAMPLES = [
  "Find CTOs at SaaS companies in Berlin with 50-200 employees",
  "VP Sales at fintech startups in London with mobile numbers",
  "Marketing directors at e-commerce companies Series A funded",
  "Engineers in San Francisco who know Python and Rust",
];

function flatten(p) {
  return {
    id: p.id || "",
    first_name: p.person?.first_name || p.first_name || "",
    last_name: p.person?.last_name || p.last_name || "",
    full_name: p.person?.full_name || p.full_name || `${p.person?.first_name || ""} ${p.person?.last_name || ""}`.trim() || `${p.first_name || ""} ${p.last_name || ""}`.trim(),
    title: p.person?.title || p.title || "—",
    headline: p.person?.headline || p.headline || "",
    email: p.contact?.email || p.email || "",
    email_status: p.contact?.email_status || p.email_status || "",
    phone: p.contact?.phone || p.phone || "",
    phone_status: p.contact?.phone_status || p.phone_status || "",
    linkedin_url: p.contact?.linkedin_url || p.linkedin_url || "",
    company: p.company?.name || p.company_name || p.company || "—",
    company_domain: p.company?.domain || p.company_domain || "",
    company_industry: p.company?.industry || p.company_industry || "",
    company_size: String(p.company?.employee_range || p.company?.employee_count || p.company_size || ""),
    company_technologies: p.company?.technologies || p.technologies || [],
    location: p.person?.location || p.location || {},
    skills: p.person?.skills || p.skills || [],
    seniority: p.person?.seniority || p.seniority || "",
    source_provider: p.source_provider || "",
    verification_status: p.contact?.email_status || p.verification_status || p.email_status || "",
    crm_status: p.crm_status || "new",
    lead_score: p.lead_score,
  };
}

const EMPTY_FILTERS = {
  job_titles: [], seniority: [], departments: [], management_level: [],
  skills: "", years_experience: {}, full_name: "", has_verified_email: false,
  has_mobile: false, has_linkedin: false,
  company_name: "", company_domain: "", industry: [],
  employee_count: {}, revenue: {}, funding_stage: [], technologies: [],
  founded_year: {}, company_type: [],
  country: [], state: "", city: "",
  exclude_domains: "", exclude_industries: "", exclude_countries: "",
};

export default function LeadSearch() {
  const [query, setQuery] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [parsedFilters, setParsedFilters] = useState(null);

  const [filters, setFilters] = useState({ ...EMPTY_FILTERS });
  const [searchBusy, setSearchBusy] = useState(false);
  const [results, setResults] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selected, setSelected] = useState(new Set());
  const [revealing, setRevealing] = useState({});
  const [creditBalance, setCreditBalance] = useState(null);
  const [showAiExamples, setShowAiExamples] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [previewLead, setPreviewLead] = useState(null);
  const [savedSearches, setSavedSearches] = useState([]);
  const [leadLists, setLeadLists] = useState([]);
  const [activeListId, setActiveListId] = useState(null);

  useEffect(() => { loadCredits(); loadSearches(); }, []);

  const loadSearches = async () => {
    try { const { data } = await api.get("/lead-intelligence/searches"); setSavedSearches(data.searches || []); } catch {}
  };

  const saveSearch = async (name, filterState) => {
    try {
      await api.post("/lead-intelligence/searches", { name, filters: filterState });
      loadSearches();
    } catch { toast.error("Failed to save search"); }
  };

  const loadSearch = (saved) => {
    if (saved.filters) setFilters({ ...EMPTY_FILTERS, ...saved.filters });
  };

  const deleteSearch = async (id) => {
    try { await api.delete(`/lead-intelligence/searches/${id}`); loadSearches(); } catch { toast.error("Failed to delete"); }
  };

  const loadCredits = async () => {
    try { const { data } = await api.get("/lead-intelligence/credits"); setCreditBalance(data.balance); } catch {}
  };

  const loadList = async (lst) => {
    setActiveListId(lst.id);
    setSearchBusy(true); setResults([]); setSelected(new Set()); setParsedFilters(null);
    try {
      const { data } = await api.get(`/lead-intelligence/lists/${lst.id}?page=1&page_size=25`);
      const leads = (data.leads || []).map(flatten);
      setResults(leads);
      setTotalCount(data.total || leads.length);
    } catch { toast.error("Failed to load list"); }
    setSearchBusy(false);
  };

  // ── AI Search ──
  const aiSearch = useCallback(async () => {
    if (!query.trim()) { toast.error("Describe your ideal lead"); return; }
    setAiBusy(true); setParsedFilters(null); setResults([]); setSelected(new Set());
    try {
      const { data } = await api.post("/lead-intelligence/natural-search", { query });
      setParsedFilters(data.parsed_filters || null);
      if (data.leads?.length) {
        setResults(data.leads.map(flatten));
        setTotalCount(data.total_returned || data.total_estimated || data.leads.length);
        toast.success(`Found ${data.leads.length} leads`);
      } else {
        toast("No leads found — try different filters below");
      }
    } catch (err) { if (!isCreditError(err)) toast.error(err?.response?.data?.detail || "AI search failed"); }
    finally { setAiBusy(false); }
  }, [query]);

  // ── Manual Search ──
  const buildBody = useCallback(() => {
    const body = {};
    const f = filters;

    // Person filters
    if (f.job_titles?.length) body.job_titles = f.job_titles;
    if (f.seniority?.length) body.seniority = f.seniority;
    if (f.departments?.length) body.departments = f.departments;
    if (f.management_level?.length) body.management_level = f.management_level;
    if (f.skills?.trim()) body.skills = f.skills.split(",").map(s => s.trim()).filter(Boolean);
    if (f.years_experience?.min != null) body.years_experience_min = Number(f.years_experience.min);
    if (f.years_experience?.max != null) body.years_experience_max = Number(f.years_experience.max);
    if (f.full_name?.trim()) body.full_name = f.full_name.trim();
    if (f.has_verified_email) body.has_verified_email = true;
    if (f.has_mobile) body.has_mobile = true;
    if (f.has_linkedin) body.has_linkedin = true;

    // Company filters
    if (f.company_name?.trim()) body.company_name = f.company_name.trim();
    if (f.company_domain?.trim()) body.company_domain = f.company_domain.trim();
    if (f.industry?.length) body.industry = f.industry;
    if (f.employee_count?.min != null) body.employee_count_min = Number(f.employee_count.min);
    if (f.employee_count?.max != null) body.employee_count_max = Number(f.employee_count.max);
    if (f.revenue?.min != null) body.annual_revenue_min = Number(f.revenue.min);
    if (f.revenue?.max != null) body.annual_revenue_max = Number(f.revenue.max);
    if (f.funding_stage?.length) body.funding_stage = f.funding_stage;
    if (f.technologies?.length) body.technologies = f.technologies;
    if (f.founded_year?.min != null) body.founded_year_min = Number(f.founded_year.min);
    if (f.founded_year?.max != null) body.founded_year_max = Number(f.founded_year.max);
    if (f.company_type?.length) body.company_type = f.company_type;

    // Location filters
    if (f.country?.length) body.country = f.country;
    if (f.state?.trim()) body.state = [f.state.trim()];
    if (f.city?.trim()) body.city = [f.city.trim()];

    // Exclusions (pass-through, backend handles/ignores)
    if (f.exclude_domains?.trim()) body.exclude_domains = f.exclude_domains;
    if (f.exclude_industries?.trim()) body.exclude_industries = f.exclude_industries;
    if (f.exclude_countries?.trim()) body.exclude_countries = f.exclude_countries;

    body.page = page;
    body.page_size = pageSize;
    return body;
  }, [filters, page, pageSize]);

  const doSearch = useCallback(async (p = page) => {
    setSearchBusy(true); setPage(p); setResults([]); setSelected(new Set());
    try {
      const body = buildBody();
      const { data } = await api.post("/lead-intelligence/search", body);
      const leads = (data.leads || data.results || []).map(flatten);
      setResults(leads); setTotalCount(data.total_returned || data.total_estimated || leads.length);
      if (!leads.length) toast("No results — try different filters");
      else toast.success(`Found ${leads.length} leads`);
    } catch (err) { if (!isCreditError(err)) toast.error(err?.response?.data?.detail || "Search failed"); }
    finally { setSearchBusy(false); }
  }, [buildBody, page]);

  // ── Reveal ──
  const revealContact = useCallback(async (lead, type) => {
    const lid = lead.id || lead.email || `${lead.first_name}_${lead.last_name}`;
    const key = type === "email" ? "email" : "phone";
    try {
      const { data: est } = await api.post("/lead-intelligence/reveal/estimate", { lead_ids: [lid], reveal_fields: [key] });
      const cost = est?.total_credits || (type === "email" ? 1 : 8);
      if (!window.confirm(`Reveal ${key} for ${lead.first_name || ""} ${lead.last_name || ""}? Cost: ${cost} credit(s)`)) return;
      setRevealing((prev) => ({ ...prev, [lid + "_" + type]: true }));
      const { data } = await api.post("/lead-intelligence/reveal", { lead_ids: [lid], reveal_fields: [key] });
      const upd = data?.[0];
      if (upd) {
        const email = upd.contact?.email || upd.email;
        const phone = upd.contact?.phone || upd.phone;
        setResults((prev) => prev.map((r) => {
          if ((r.id || r.email) === lid) {
            if (type === "email" && email) return { ...r, email, email_status: "revealed" };
            if (type === "phone" && phone) return { ...r, phone, phone_status: "revealed" };
          }
          return r;
        }));
        toast.success(`${type === "email" ? "Email" : "Phone"} revealed`);
        loadCredits();
      }
    } catch (err) { if (!isCreditError(err)) toast.error(err?.response?.data?.detail || `Reveal failed`); }
    finally { setRevealing((prev) => ({ ...prev, [lid + "_" + type]: false })); }
  }, []);

  const importToCrm = useCallback(async () => {
    const sel = results.filter((_, i) => selected.has(i));
    if (!sel.length) { toast.error("Select leads first"); return; }
    try {
      const { data } = await api.post("/lead-intelligence/import", { leads: sel, merge_strategy: "skip" });
      toast.success(`Imported ${data.added || sel.length} · ${data.skipped || 0} skipped`);
    } catch { toast.error("Import failed"); }
  }, [results, selected]);

  const toggleSel = (idx) => { const n = new Set(selected); n.has(idx) ? n.delete(idx) : n.add(idx); setSelected(n); };
  const toggleAll = (v) => { if (v) setSelected(new Set(results.map((_, i) => i))); else setSelected(new Set()); };

  const selCount = results.filter((_, i) => selected.has(i)).length;
  const hasResults = results.length > 0;
  const isBusy = searchBusy || aiBusy;

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-bone">
      {/* Global header */}
      <div className="shrink-0 bg-white border-b border-line">
        <div className="px-5 py-3 flex items-center justify-between">
          <div>
            <h1 className="font-display font-semibold text-subheading">Lead Search</h1>
            <p className="text-caption text-ink-muted">Find and prospect leads across multiple data providers</p>
          </div>
          <div className="flex items-center gap-3">
            {creditBalance !== null && (
              <div className="flex items-center gap-1.5 text-caption text-ink-muted font-mono bg-ash rounded-full px-3 py-1.5 border border-line">
                <Wallet size={12} /> {creditBalance} credits
              </div>
            )}
            <button onClick={() => setSidebarOpen(!sidebarOpen)}
              className="btn-secondary text-caption py-1.5 px-3">
              <SlidersHorizontal size={14} /> {sidebarOpen ? "Hide Filters" : "Show Filters"}
            </button>
          </div>
        </div>

        {/* Global AI search bar */}
        <div className="px-5 pb-3">
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted flex items-center gap-1.5">
              <Bot size={16} className="text-accent" />
            </div>
            <input value={query} onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") aiSearch(); }}
              placeholder='AI Search — e.g. "CTOs at SaaS startups in Berlin, 50-200 employees, mobile numbers"'
              className="w-full pl-10 pr-36 py-3 border border-line rounded-xl text-input bg-ash/30 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent placeholder:text-ink-muted/50" />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1.5">
              <button onClick={() => setShowAiExamples(!showAiExamples)}
                className="btn-ghost text-caption py-1.5 px-2 text-ink-muted"><Lightbulb size={14} /></button>
              <button onClick={aiSearch} disabled={aiBusy || !query.trim()}
                className="btn-primary text-caption py-1.5 px-3 disabled:opacity-50 flex items-center gap-1.5">
                {aiBusy ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
                {aiBusy ? "Analyzing…" : "AI Search"}
              </button>
            </div>
          </div>
          {showAiExamples && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {AI_EXAMPLES.map((ex, i) => (
                <button key={i} onClick={() => { setQuery(ex); setShowAiExamples(false); }}
                  className="text-caption bg-white border border-line rounded-full px-2.5 py-1 hover:border-accent hover:text-accent transition-colors">
                  {ex}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Parsed AI filters banner */}
      {parsedFilters && (
        <div className="shrink-0 px-5 py-2 bg-blue-50/50 border-b border-blue-200 flex items-center gap-2">
          <SlidersHorizontal size={12} className="text-blue-500" />
          <span className="text-caption text-blue-700 font-medium">AI parsed your query — filters applied below</span>
          <button onClick={() => setParsedFilters(null)} className="ml-auto text-blue-400 hover:text-blue-600"><X size={12} /></button>
        </div>
      )}

      {/* Main 3-column layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Filter Sidebar */}
        <div className={`${sidebarOpen ? "w-72" : "w-0"} transition-all duration-200 overflow-hidden border-r border-line shrink-0`}>
          {sidebarOpen && (
            <div className="p-3 space-y-4 overflow-y-auto h-full">
              <LeadListsPanel onLoadList={loadList} activeListId={activeListId} />
              <div className="border-t border-line" />
              <LeadSearchFilters
                filters={filters}
                onChange={setFilters}
                onClear={() => setFilters({ ...EMPTY_FILTERS })}
                onSearch={() => doSearch(1)}
                activeCount={Object.entries(filters).filter(([, v]) => {
                  if (v === "" || v === null || v === undefined) return false;
                  if (typeof v === "boolean" && !v) return false;
                  if (Array.isArray(v) && !v.length) return false;
                  if (typeof v === "object" && !Array.isArray(v) && !v.min && !v.max) return false;
                  return true;
                }).length}
                searchBusy={searchBusy}
                providers={["Prospeo", "Icypeas"]}
                savedSearches={savedSearches}
                onSaveSearch={saveSearch}
                onLoadSearch={loadSearch}
                onDeleteSearch={deleteSearch}
              />
            </div>
          )}
        </div>

        {/* Center: Results */}
        <div className="flex-1 flex flex-col min-w-0 bg-white">
          {/* Bulk action bar */}
          {selCount > 0 && (
            <div className="shrink-0 px-4 py-2 border-b border-line bg-accent/5 flex items-center gap-3">
              <span className="text-body font-medium">{selCount} selected</span>
              <button onClick={importToCrm} className="btn-primary text-caption py-1.5">Import to CRM</button>
              <BulkActions
                leadIds={results.filter((_, i) => selected.has(i)).map((r) => r.id).filter(Boolean)}
                onDone={() => { loadCredits(); setSelected(new Set()); }} />
              <AddToListDropdown
                leadIds={results.filter((_, i) => selected.has(i)).map((r) => r.id || r.email).filter(Boolean)}
                onDone={() => setSelected(new Set())} />
              <button onClick={() => { results.filter((_, i) => selected.has(i)).forEach((l) => revealContact(l, "email")); }}
                className="btn-secondary text-caption py-1.5 flex items-center gap-1"><Mail size={12} /> Reveal Emails</button>
              <button onClick={() => { results.filter((_, i) => selected.has(i)).forEach((l) => revealContact(l, "phone")); }}
                className="btn-secondary text-caption py-1.5 flex items-center gap-1"><Phone size={12} /> Reveal Phones</button>
              <button onClick={() => setSelected(new Set())} className="btn-ghost text-caption py-1.5 ml-auto text-ink-muted">Clear</button>
            </div>
          )}

          {isBusy && !hasResults ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Loader2 size={24} className="animate-spin text-accent mx-auto mb-3" />
                <p className="text-caption text-ink-muted">{aiBusy ? "AI is analyzing your request…" : "Searching across providers…"}</p>
              </div>
            </div>
          ) : hasResults ? (
            <LeadSearchTable
              results={results} totalCount={totalCount} page={page} pageSize={pageSize}
              selected={selected} onToggle={toggleSel} onToggleAll={toggleAll}
              onReveal={revealContact} revealing={revealing}
              onSelect={(lead) => setPreviewLead(lead)}
              loading={searchBusy}
              onPageChange={(p) => doSearch(p)}
              onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center max-w-md">
                <div className="w-14 h-14 bg-ash rounded-2xl flex items-center justify-center mx-auto mb-4 border border-line">
                  <Search size={24} className="text-ink-muted" />
                </div>
                <h3 className="font-display font-semibold text-subheading mb-1">Find your next leads</h3>
                <p className="text-caption text-ink-muted">
                  Use the <strong>AI search</strong> bar above for natural language queries, or open the <strong>filters panel</strong> to build a precise search.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right: Preview Panel */}
        {previewLead && (
          <div className="w-80 shrink-0 border-l border-line">
            <LeadPreviewPanel
              lead={previewLead}
              onClose={() => setPreviewLead(null)}
              onReveal={revealContact}
              revealing={revealing}
              onAddToCrm={() => {
                const idx = results.findIndex((r) => (r.id || r.email) === (previewLead.id || previewLead.email));
                if (idx >= 0) { toggleSel(idx); importToCrm(); }
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function Mail({ size, className }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>;
}
function Phone({ size, className }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>;
}
