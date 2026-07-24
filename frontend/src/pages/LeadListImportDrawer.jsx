import { useRef, useState, useEffect } from "react";
import { api } from "../lib/api";
import { toast } from "sonner";
import { Download, Upload, Loader2, CheckCircle2, AlertTriangle, X, ChevronRight } from "lucide-react";

// Standard lead fields + all CSV columns stored as raw_* on the lead document
const LEAD_FIELDS = [
  { value: "email", label: "Email", required: true },
  { value: "first_name", label: "First Name" },
  { value: "last_name", label: "Last Name" },
  { value: "company", label: "Company" },
  { value: "phone", label: "Phone" },
  { value: "title", label: "Title / Job Title" },
  { value: "linkedin_url", label: "LinkedIn URL" },
  { value: "website", label: "Company Website" },
  { value: "tags", label: "Tags" },

  // Person details
  { value: "raw_full_name", label: "Full Name" },
  { value: "raw_person_linkedin_url", label: "Person LinkedIn URL" },
  { value: "raw_mobile", label: "Mobile" },
  { value: "raw_email_status", label: "Email Status" },
  { value: "raw_mobile_status", label: "Mobile Status" },
  { value: "raw_job_start_year", label: "Job Start Year" },
  { value: "raw_job_start_month", label: "Job Start Month" },
  { value: "raw_job_department", label: "Job Department" },
  { value: "raw_job_seniority", label: "Job Seniority" },
  { value: "raw_person_country", label: "Person Country" },
  { value: "raw_person_country_code", label: "Person Country Code" },
  { value: "raw_person_state", label: "Person State" },
  { value: "raw_person_city", label: "Person City" },
  { value: "raw_person_time_zone", label: "Person Time Zone" },
  { value: "raw_person_time_zone_offset", label: "Person Time Zone Offset" },
  { value: "raw_person_skills", label: "Person Skills" },
  { value: "raw_person_headline", label: "Person Headline" },
  { value: "raw_mobile_international", label: "Mobile International Format" },
  { value: "raw_mobile_national", label: "Mobile National Format" },
  { value: "raw_mobile_country", label: "Mobile Country" },
  { value: "raw_mobile_country_code", label: "Mobile Country Code" },

  // Company details
  { value: "raw_company_name", label: "Company Name" },
  { value: "raw_company_industry", label: "Company Industry" },
  { value: "raw_company_website", label: "Company Website" },
  { value: "raw_company_employee_range", label: "Company Employee Range" },
  { value: "raw_company_employee_count", label: "Company Employee Count" },
  { value: "raw_company_domain", label: "Company Domain" },
  { value: "raw_company_linkedin_url", label: "Company LinkedIn URL" },
  { value: "raw_company_facebook_url", label: "Company Facebook URL" },
  { value: "raw_company_twitter_url", label: "Company Twitter / X URL" },
  { value: "raw_company_instagram_url", label: "Company Instagram URL" },
  { value: "raw_company_youtube_url", label: "Company YouTube URL" },
  { value: "raw_company_crunchbase_url", label: "Company Crunchbase URL" },
  { value: "raw_company_type", label: "Company Type" },
  { value: "raw_company_hq_phone", label: "Company HQ Phone" },
  { value: "raw_company_country", label: "Company Country" },
  { value: "raw_company_country_code", label: "Company Country Code" },
  { value: "raw_company_state", label: "Company State" },
  { value: "raw_company_city", label: "Company City" },
  { value: "raw_company_time_zone", label: "Company Time Zone" },
  { value: "raw_company_time_zone_offset", label: "Company Time Zone Offset" },
  { value: "raw_company_raw_address", label: "Company Raw Address" },
  { value: "raw_company_keywords", label: "Company Keywords" },
  { value: "raw_company_technologies", label: "Company Technologies" },
  { value: "raw_company_funding_total", label: "Company Funding Total Amount" },
  { value: "raw_company_funding_rounds", label: "Company Funding Total Rounds" },
  { value: "raw_company_last_round_amount", label: "Company Last Round Amount" },
  { value: "raw_company_last_round_type", label: "Company Last Round Type" },
  { value: "raw_company_last_round_date", label: "Company Last Round Date" },
  { value: "raw_company_revenue_range", label: "Company Revenue Range" },
  { value: "raw_company_naics_codes", label: "Company NAICS Codes" },
  { value: "raw_company_sic_codes", label: "Company SIC Codes" },
  { value: "raw_company_description", label: "Company Description" },
  { value: "raw_company_founded", label: "Company Founded Year" },
  { value: "raw_company_logo_url", label: "Company Logo URL" },
  { value: "raw_company_intent", label: "Company Intent" },
  { value: "raw_company_email_domain", label: "Company Email Domain" },
  { value: "raw_company_email_pattern", label: "Company Main Email Pattern" },
  { value: "raw_company_mx_provider", label: "Company MX Provider" },
  { value: "raw_company_logo_url", label: "Company Logo URL" },

  // AI enrichment fields
  { value: "raw_ai_description", label: "AI Description" },
  { value: "raw_ai_one_liner", label: "AI One-Liner" },
  { value: "raw_value_proposition", label: "Value Proposition" },
  { value: "raw_company_subtype", label: "Company Subtype" },
  { value: "raw_business_model", label: "Business Model" },
  { value: "raw_products", label: "Products" },
  { value: "raw_service_tags", label: "Service Tags" },
  { value: "raw_integrations", label: "Integrations" },
  { value: "raw_competitors", label: "Competitors Mentioned" },
  { value: "raw_key_customers", label: "Key Customers" },
  { value: "raw_awards", label: "Awards & Recognitions" },
  { value: "raw_competitive_moat", label: "Competitive Moat Signals" },
  { value: "raw_differentiators", label: "Proclaimed Differentiators" },
  { value: "raw_icp_titles", label: "ICP Target Titles" },
  { value: "raw_icp_industries", label: "ICP Target Industries" },
  { value: "raw_icp_geo_markets", label: "ICP Geo Markets" },
  { value: "raw_icp_departments", label: "ICP Target Departments" },
  { value: "raw_icp_company_sizes", label: "ICP Company Sizes" },
  { value: "raw_revenue_model", label: "Revenue Model" },
  { value: "raw_pricing_details", label: "Pricing Details" },
  { value: "raw_lowest_price", label: "Lowest Price" },
  { value: "raw_contract_model", label: "Contract Model" },
  { value: "raw_free_trial_days", label: "Free Trial (Days)" },
  { value: "raw_discount_signals", label: "Discount Signals" },
  { value: "raw_has_api", label: "Has API" },
  { value: "raw_has_chrome_extension", label: "Has Chrome Extension" },
  { value: "raw_has_sso", label: "Has SSO" },
  { value: "raw_is_open_source", label: "Is Open Source" },
  { value: "raw_has_app_marketplace", label: "Has App Marketplace" },
  { value: "raw_has_blog", label: "Has Blog" },
  { value: "raw_has_podcast", label: "Has Podcast" },
  { value: "raw_has_community", label: "Has Community Forum" },
  { value: "raw_has_knowledge_base", label: "Has Knowledge Base" },
  { value: "raw_has_case_studies", label: "Has Case Studies" },
  { value: "raw_has_testimonials", label: "Has Testimonials" },
  { value: "raw_has_affiliate_program", label: "Has Affiliate Program" },
  { value: "raw_soc2", label: "SOC2 Certified" },
  { value: "raw_iso27001", label: "ISO 27001 Certified" },
  { value: "raw_gdpr", label: "GDPR Compliant" },
  { value: "raw_hipaa", label: "HIPAA Compliant" },
  { value: "raw_data_residency", label: "Data Residency" },
  { value: "raw_other_compliance", label: "Other Compliance" },
  { value: "raw_support_channels", label: "Support Channels" },
  { value: "raw_investors", label: "Investors" },
  { value: "raw_accelerator", label: "Accelerator / Incubator" },
  { value: "raw_venture_backed", label: "Venture Backed" },
  { value: "raw_publicly_traded", label: "Publicly Traded" },
  { value: "raw_ticker_symbol", label: "Ticker Symbol" },
  { value: "raw_customer_count", label: "Customer Count Hint" },
  { value: "raw_proclaimed_metrics", label: "Proclaimed Metrics" },
  { value: "raw_growth_signals", label: "Growth Signals" },
  { value: "raw_social_proof", label: "Social Proof Summary" },
  { value: "raw_operating_languages", label: "Operating Languages" },

  // Prospeo-specific
  { value: "raw_prospeo_person_id", label: "Prospeo Person ID" },
  { value: "raw_person_in_lists", label: "Person In Lists" },
  { value: "raw_prospeo_company_id", label: "Prospeo Company ID" },
  { value: "raw_person_saved_at", label: "Person Saved At" },
  { value: "raw_active_job_count", label: "Active Job Count" },
  { value: "raw_active_job_titles", label: "Active Job Titles" },
];

export default function LeadListImportDrawer({ mode = "general", listId = null, onClose, onDone }) {
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [listName, setListName] = useState("");
  const [listDescription, setListDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const [step, setStep] = useState("upload"); // "upload" → "mapping" → "done"
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [mapping, setMapping] = useState({});

  // Parse CSV headers as soon as a file is selected
  useEffect(() => {
    if (!file) { setCsvHeaders([]); setMapping({}); setStep("upload"); return; }
    const isXlsx = (file.name || "").toLowerCase().endsWith(".xlsx");
    if (isXlsx) {
      // XLSX can't be parsed as text on the frontend — skip mapping step
      setStep("upload");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      if (!text) return;
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length === 0) return;
      const raw = lines[0].split(",").map((h) => h.trim().replace(/^["']|["']$/g, ""));
      setCsvHeaders(raw);
      // Use lowercased header as mapping key — backend's _parse_rows lowercases all keys
      const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
      const auto = {};
      raw.forEach((h) => {
        const hc = norm(h);
        const match = LEAD_FIELDS.find((f) => norm(f.value) === hc || norm(f.label) === hc);
        if (match) auto[h.toLowerCase()] = match.value;
      });
      setMapping(auto);
      setStep("mapping");
    };
    reader.readAsText(file.slice(0, 65536));
  }, [file]);

  const downloadTemplate = async () => {
    const { data } = await api.get("/crm/lists/bulk-import/template", { responseType: "blob" });
    const url = URL.createObjectURL(new Blob([data], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = "crm-lead-import-template.csv";
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  const upload = async () => {
    if (!file) { toast.error("Choose a CSV or XLSX file first"); return; }
    if (mode === "new-list" && !listName.trim()) { toast.error("Give the list a name first"); return; }
    setBusy(true);
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const params = {};
      if (mode === "existing-list") params.list_id = listId;
      if (mode === "new-list") {
        params.list_name = listName.trim();
        params.list_description = listDescription.trim();
      }
      // Send column mapping as JSON string
      if (Object.keys(mapping).length > 0) {
        params.column_map = JSON.stringify(mapping);
      }
      const { data } = await api.post("/crm/lists/bulk-import", form, { params });
      setResult(data);
      setStep("done");
      const total = data.created + data.linked_existing;
      if (total > 0) {
        toast.success(`${data.created} new lead${data.created !== 1 ? "s" : ""} created, ${data.linked_existing} linked`);
      } else {
        toast.error("No leads were added — see the errors below");
      }
      onDone?.(data);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Import failed");
    } finally {
      setBusy(false);
    }
  };

  const hasEmailMapped = Object.values(mapping).includes("email");

  return (
    <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-line rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b border-line flex items-center justify-between">
          <div className="text-card-title font-display font-semibold">
            {mode === "new-list" ? "Upload leads into a new list" : mode === "existing-list" ? "Upload leads into this list" : "Import leads"}
          </div>
          <button onClick={onClose} className="text-ink-muted hover:text-ink"><X size={16} /></button>
        </div>

        <div className="p-5 space-y-4">
          {mode === "new-list" && (
            <div className="space-y-2">
              <input value={listName} onChange={(e) => setListName(e.target.value)} autoFocus
                placeholder="List name" data-testid="import-list-name"
                className="w-full border border-line px-3 py-2 rounded-lg text-input" />
              <input value={listDescription} onChange={(e) => setListDescription(e.target.value)}
                placeholder="Description (optional)" data-testid="import-list-description"
                className="w-full border border-line px-3 py-2 rounded-lg text-input" />
            </div>
          )}

          <div>
            <div className="ui-label mb-1">1. Get the template</div>
            <p className="text-caption text-ink-muted mb-2">
              Columns: <code className="font-mono">first_name, last_name, email, company, title, phone, tags</code>.
              Only <code className="font-mono">email</code> is required — existing leads with a matching email are
              linked into the list instead of duplicated. You can also use your own column names and map them below.
            </p>
            <button onClick={downloadTemplate} className="btn-secondary text-xs">
              <Download size={14} /> Download CSV template
            </button>
          </div>

          <div className="divider" />

          <div>
            <div className="ui-label mb-1">2. Upload your filled-in sheet</div>
            <input ref={fileRef} type="file" accept=".csv,.xlsx" data-testid="lead-import-file"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full text-input border border-line rounded-xl px-3 py-2 file:mr-3 file:btn-secondary file:border-0 file:cursor-pointer" />
            {file && <p className="text-caption text-ink-muted mt-1.5">{file.name}</p>}
          </div>

          {/* Column mapping step */}
          {step === "mapping" && csvHeaders.length > 0 && (
            <div className="shadow-card p-4 rounded-2xl border border-line space-y-3">
              <div className="flex items-center justify-between">
                <div className="ui-label">3. Match your columns</div>
                <span className="text-tiny text-ink-muted font-mono">{csvHeaders.length} columns found</span>
              </div>
              <p className="text-tiny text-ink-muted">
                Map each column from your file to a lead field. Only <strong>Email</strong> is required.
              </p>
              <div className="space-y-2 max-h-52 overflow-y-auto">
                {csvHeaders.map((header) => {
                  const key = header.toLowerCase();
                  return (
                  <div key={header} className="flex items-center gap-2">
                    <div className="flex-1 font-mono text-caption text-ink-secondary truncate bg-bone border border-line rounded-lg px-2 py-1.5">
                      {header}
                    </div>
                    <ChevronRight size={14} className="text-ink-muted shrink-0" />
                    <select
                      value={mapping[key] || ""}
                      onChange={(e) => setMapping({ ...mapping, [key]: e.target.value })}
                      className="flex-1 border border-line rounded-lg px-2 py-1.5 text-caption text-input">
                      <option value="">— Skip —</option>
                      {LEAD_FIELDS.map((f) => (
                        <option key={f.value} value={f.value} disabled={f.required && Object.values(mapping).filter((v) => v === f.value).length > 0 && mapping[key] !== f.value}>
                          {f.label}{f.required ? " *" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
              </div>
              {!hasEmailMapped && (
                <div className="flex items-center gap-1.5 text-tiny text-warning">
                  <AlertTriangle size={12} /> Map a column to <strong>Email</strong> — it's required.
                </div>
              )}
            </div>
          )}

          <button onClick={upload} disabled={busy || !file || !hasEmailMapped} data-testid="lead-import-submit"
            className="btn-primary w-full justify-center disabled:opacity-50">
            {busy ? <><Loader2 size={14} className="animate-spin" /> Importing…</> : <><Upload size={14} /> Import leads</>}
          </button>

          {result && (
            <div className="shadow-card p-4 rounded-2xl space-y-2" data-testid="lead-import-result">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-success" />
                <div className="text-body font-medium">
                  {result.created} created · {result.linked_existing} linked · {result.skipped} skipped
                </div>
              </div>
              {result.errors?.length > 0 && (
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {result.errors.map((e, i) => (
                    <div key={i} className="flex items-start gap-1.5 text-caption text-warning">
                      <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {e}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
