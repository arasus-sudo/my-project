import { useRef, useState, useEffect } from "react";
import { api } from "../lib/api";
import { toast } from "sonner";
import { Download, Upload, Loader2, CheckCircle2, AlertTriangle, X, ChevronRight } from "lucide-react";

const LEAD_FIELDS = [
  { value: "email", label: "Email", required: true },
  { value: "first_name", label: "First Name" },
  { value: "last_name", label: "Last Name" },
  { value: "company", label: "Company" },
  { value: "title", label: "Title" },
  { value: "phone", label: "Phone" },
  { value: "linkedin_url", label: "LinkedIn URL" },
  { value: "website", label: "Website" },
  { value: "tags", label: "Tags" },
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
      const auto = {};
      raw.forEach((h) => {
        const hc = h.toLowerCase().replace(/[^a-z0-9_]/g, "");
        const match = LEAD_FIELDS.find((f) => f.value === hc);
        if (match) auto[h] = match.value;
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
                {csvHeaders.map((header) => (
                  <div key={header} className="flex items-center gap-2">
                    <div className="flex-1 font-mono text-caption text-ink-secondary truncate bg-bone border border-line rounded-lg px-2 py-1.5">
                      {header}
                    </div>
                    <ChevronRight size={14} className="text-ink-muted shrink-0" />
                    <select
                      value={mapping[header] || ""}
                      onChange={(e) => setMapping({ ...mapping, [header]: e.target.value })}
                      className="flex-1 border border-line rounded-lg px-2 py-1.5 text-caption text-input">
                      <option value="">— Skip —</option>
                      {LEAD_FIELDS.map((f) => (
                        <option key={f.value} value={f.value} disabled={f.required && Object.values(mapping).filter((v) => v === f.value).length > 0 && mapping[header] !== f.value}>
                          {f.label}{f.required ? " *" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
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
