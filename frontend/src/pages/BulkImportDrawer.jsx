import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Download, Upload, CheckCircle2, AlertTriangle } from "../icons";
import Card, { CardDivider } from "../components/composites/Card";
import Button from "../components/primitives/Button";

export default function BulkImportDrawer() {
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const nav = useNavigate();

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
      <div className="animate-fade-in px-6 sm:px-8 py-6 max-w-xl space-y-4">
        <Card>
          <div className="space-y-4">
            <div>
              <div style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-tertiary)", marginBottom: 6 }}>1. Get the template</div>
              <p style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginBottom: 10 }}>
                Columns: <code style={{ fontFamily: "var(--font-mono)" }}>date, platforms, topic, content_type, tone, cta</code>.
                <code style={{ fontFamily: "var(--font-mono)" }}> platforms</code> is comma-separated (e.g. <code style={{ fontFamily: "var(--font-mono)" }}>linkedin,instagram</code>);
                <code style={{ fontFamily: "var(--font-mono)" }}> content_type</code> is <code style={{ fontFamily: "var(--font-mono)" }}>static</code> or <code style={{ fontFamily: "var(--font-mono)" }}>carousel</code>.
              </p>
              <Button variant="secondary" icon={Download} onClick={downloadTemplate} data-testid="download-template-btn">Download CSV template</Button>
            </div>

            <CardDivider />

            <div>
              <div style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-tertiary)", marginBottom: 6 }}>2. Upload your filled-in sheet</div>
              <input ref={fileRef} type="file" accept=".csv,.xlsx" data-testid="bulk-import-file"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                style={{
                  width: "100%", fontSize: 13, border: "1px solid var(--border-default)", borderRadius: "var(--radius-lg)",
                  padding: "8px 12px", color: "var(--text-primary)", background: "var(--bg-surface)",
                }} />
              {file && <p style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginTop: 6 }}>{file.name}</p>}
            </div>

            <Button variant="primary" icon={Upload} onClick={upload} isLoading={busy} isDisabled={!file} data-testid="bulk-import-submit" className="w-full justify-center">
              {busy ? "Generating content…" : "Import & generate"}
            </Button>
            <p style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
              Each row generates content per listed platform, then emails you one digest with an Approve/Reject
              link per post. Approved posts publish automatically at their scheduled time.
            </p>
          </div>
        </Card>

        {result && (
          <Card data-testid="bulk-import-result">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} strokeWidth={1.5} aria-hidden="true" style={{ color: "var(--color-success)" }} />
                <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>{result.created} post{result.created !== 1 ? "s" : ""} created</div>
              </div>
              {result.skipped > 0 && <div style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>{result.skipped} row(s) skipped.</div>}
              {result.errors?.length > 0 && (
                <div className="space-y-1">
                  {result.errors.map((e, i) => (
                    <div key={i} className="flex items-start gap-1.5" style={{ fontSize: 12.5, color: "var(--color-warning-text)" }}>
                      <AlertTriangle size={12} strokeWidth={1.5} aria-hidden="true" className="mt-0.5 shrink-0" /> {e}
                    </div>
                  ))}
                </div>
              )}
              <Button variant="secondary" onClick={() => nav("/app/social-eq/queue")} className="w-full justify-center">Review in Queue</Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
