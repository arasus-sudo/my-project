import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Download, Upload, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

export default function BulkImportDrawer() {
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const downloadTemplate = async () => {
    const { data } = await api.get("/social-eq/bulk-import/template", { responseType: "blob" });
    const url = URL.createObjectURL(new Blob([data], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = "social-eq-bulk-import-template.csv";
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  const upload = async () => {
    if (!file) { toast.error("Choose a CSV or XLSX file first"); return; }
    setBusy(true);
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const { data } = await api.post("/social-eq/bulk-import", form);
      setResult(data);
      if (data.created > 0) {
        toast.success(`${data.created} post${data.created > 1 ? "s" : ""} generated — check your email to approve`);
      } else {
        toast.error("No posts were created — see the errors below");
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Import failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title="Bulk Import" subtitle="Upload a CSV or Excel sheet of dated content briefs — one post is generated per row per platform." />
      <div className="animate-fade-in px-6 sm:px-8 max-w-xl space-y-4">
        <div className="shadow-card p-6 sm:p-8 rounded-2xl space-y-4">
          <div>
            <div className="ui-label mb-1">1. Get the template</div>
            <p className="text-caption text-ink-muted mb-2">
              Columns: <code className="font-mono">date, platforms, topic, content_type, tone, cta</code>.
              <code className="font-mono"> platforms</code> is comma-separated (e.g. <code className="font-mono">linkedin,instagram</code>);
              <code className="font-mono"> content_type</code> is <code className="font-mono">static</code> or <code className="font-mono">carousel</code>.
            </p>
            <button onClick={downloadTemplate} data-testid="download-template-btn" className="btn-secondary">
              <Download size={14} /> Download CSV template
            </button>
          </div>

          <div className="divider" />

          <div>
            <div className="ui-label mb-1">2. Upload your filled-in sheet</div>
            <input ref={fileRef} type="file" accept=".csv,.xlsx" data-testid="bulk-import-file"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full text-input border border-line rounded-xl px-3 py-2 file:mr-3 file:btn-secondary file:border-0 file:cursor-pointer" />
            {file && <p className="text-caption text-ink-muted mt-1.5">{file.name}</p>}
          </div>

          <button onClick={upload} disabled={busy || !file} data-testid="bulk-import-submit" className="btn-primary w-full justify-center disabled:opacity-50">
            {busy ? <><Loader2 size={14} className="animate-spin" /> Generating content…</> : <><Upload size={14} /> Import &amp; generate</>}
          </button>
          <p className="text-tiny text-ink-muted">
            Each row generates content per listed platform, then emails you one digest with an Approve/Reject
            link per post. Approved posts publish automatically at their scheduled time.
          </p>
        </div>

        {result && (
          <div className="shadow-card p-6 rounded-2xl space-y-3" data-testid="bulk-import-result">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-success" />
              <div className="text-card-title font-display font-semibold">{result.created} post{result.created !== 1 ? "s" : ""} created</div>
            </div>
            {result.skipped > 0 && <div className="text-caption text-ink-muted">{result.skipped} row(s) skipped.</div>}
            {result.errors?.length > 0 && (
              <div className="space-y-1">
                {result.errors.map((e, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-caption text-warning">
                    <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {e}
                  </div>
                ))}
              </div>
            )}
            <Link to="/app/social-eq/queue" className="btn-secondary w-full justify-center">Review in Queue</Link>
          </div>
        )}
      </div>
    </div>
  );
}
