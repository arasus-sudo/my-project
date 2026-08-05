import { useEffect, useState } from "react";
import { api, isCreditError } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Trash2, Copy, Globe, FileText, Bot, Check } from "../icons";
import Card from "../components/composites/Card";
import Input from "../components/primitives/Input";
import Select from "../components/primitives/Select";
import Button from "../components/primitives/Button";
import Checkbox from "../components/primitives/Checkbox";

export default function WhatsAppSettings() {
  const [settings, setSettings] = useState({});
  const [sources, setSources] = useState([]);
  const [eventTypes, setEventTypes] = useState([]);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [crawlUrl, setCrawlUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => {
    api.get("/whatsapp-eq/settings").then((r) => setSettings(r.data || {}));
    api.get("/whatsapp-eq/kb/sources").then((r) => setSources(r.data || [])).catch(() => {});
    api.get("/schedule-eq/event-types").then((r) => setEventTypes(r.data || [])).catch(() => {});
    api.get("/whatsapp-eq/settings/webhook-url").then((r) => setWebhookUrl(r.data.url)).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      await api.post("/whatsapp-eq/settings", settings);
      toast.success("Settings saved");
    } catch { toast.error("Save failed"); }
  };

  const addCrawlSource = async (e) => {
    e.preventDefault();
    if (!crawlUrl.trim()) return;
    setBusy(true);
    try {
      const { data } = await api.post("/whatsapp-eq/kb/sources/crawl", { url: crawlUrl.trim() });
      toast.success(data.status === "ready" ? `Crawled ${data.pages_crawled} pages, ${data.chunks_count} chunks indexed` : "Crawl failed — check the URL");
      setCrawlUrl("");
      load();
    } catch (err) { if (!isCreditError(err)) toast.error(err?.response?.data?.detail || "Crawl failed"); }
    finally { setBusy(false); }
  };

  const uploadSource = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const { data } = await api.post("/whatsapp-eq/kb/sources/upload", form, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success(data.status === "ready" ? `Indexed ${data.chunks_count} chunks from ${file.name}` : "Couldn't extract text from that file");
      load();
    } catch (err) { toast.error(err?.response?.data?.detail || "Upload failed"); }
    finally { setBusy(false); e.target.value = ""; }
  };

  const removeSource = async (sid) => {
    if (!window.confirm("Remove this knowledge base source?")) return;
    await api.delete(`/whatsapp-eq/kb/sources/${sid}`);
    load();
  };

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    toast.success("Webhook URL copied");
  };

  const sourceStatusColor = { ready: "var(--color-success)", error: "var(--color-danger)" };

  return (
    <div>
      <PageHeader title="WhatsApp EQ Settings" subtitle="Configure WhatsApp Business messaging preferences." />
      <div className="animate-fade-in px-6 sm:px-8 py-6 max-w-2xl space-y-4">
        <Card title="Configuration">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input label="Business name" value={settings.business_name || ""} onChange={(e) => setSettings({ ...settings, business_name: e.target.value })} />
              <Input type="number" label="Max sends per minute" value={settings.max_sends_per_minute ?? 30} onChange={(e) => setSettings({ ...settings, max_sends_per_minute: parseInt(e.target.value) || 30 })} />
            </div>
            <Input type="number" label="24-hour session expiry (hours)" value={settings.session_expiry_hours ?? 24} onChange={(e) => setSettings({ ...settings, session_expiry_hours: parseInt(e.target.value) || 24 })} />
            <div className="flex justify-end">
              <Button variant="primary" icon={Check} onClick={save}>Save</Button>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
            <div className="flex items-center gap-2" style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>
              <Bot size={16} strokeWidth={1.5} aria-hidden="true" /> Automated response agent
            </div>
            <Checkbox label="Enabled" checked={!!settings.automated_agent_enabled}
              onChange={(e) => setSettings({ ...settings, automated_agent_enabled: e.target.checked })}
              data-testid="wa-agent-enabled-toggle" />
          </div>
          <p style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginBottom: 16 }}>
            When enabled, inbound messages are answered from your knowledge base below — the agent
            can also book a meeting, capture a callback request, or share your purchase link. A
            human replying always pauses the bot on that conversation.
          </p>

          <div className="space-y-4">
            <Select label="Booking event type" value={settings.booking_event_type_slug || ""}
              onChange={(v) => setSettings({ ...settings, booking_event_type_slug: v || null })}
              data-testid="wa-booking-event-type-select"
              options={[{ value: "", label: "Not configured — booking requests hand off to a human" }, ...eventTypes.map((et) => ({ value: et.slug, label: et.name }))]} />

            <div>
              <Input label="Purchase link" placeholder="https://buy.stripe.com/..."
                value={settings.purchase_link || ""} onChange={(e) => setSettings({ ...settings, purchase_link: e.target.value })}
                data-testid="wa-purchase-link-input" />
              <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 6 }}>Shared when a customer asks how to buy or pay.</p>
            </div>
          </div>

          <div className="flex justify-end" style={{ marginTop: 16 }}>
            <Button variant="primary" icon={Check} onClick={save}>Save</Button>
          </div>

          {webhookUrl && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-tertiary)", marginBottom: 6 }}>Inbound webhook URL — paste into Twilio's WhatsApp Sender config</div>
              <div className="flex items-start gap-2" style={{ background: "var(--bg-surface-sunken)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-lg)", padding: 12, fontFamily: "var(--font-mono)", fontSize: 11, wordBreak: "break-all" }}>
                <span className="flex-1">{webhookUrl}</span>
                <button onClick={copyWebhookUrl} data-testid="copy-webhook-url-btn" className="shrink-0" style={{ color: "var(--text-tertiary)" }}>
                  <Copy size={14} strokeWidth={1.5} aria-hidden="true" />
                </button>
              </div>
            </div>
          )}
        </Card>

        <Card title="Knowledge base">
          <p style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginBottom: 16 }}>Crawl a URL or upload a document — the agent answers only from this content.</p>

          <form onSubmit={addCrawlSource} className="flex gap-2" style={{ marginBottom: 12 }}>
            <Input className="flex-1" placeholder="https://example.com" value={crawlUrl}
              onChange={(e) => setCrawlUrl(e.target.value)} data-testid="wa-kb-crawl-url-input" />
            <Button type="submit" variant="secondary" icon={Globe} isDisabled={busy} className="shrink-0">Crawl</Button>
          </form>

          <label className="inline-flex items-center gap-1.5 cursor-pointer w-fit" style={{
            height: 32, padding: "0 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-default)",
            fontSize: 13, fontWeight: 500, color: "var(--text-primary)", marginBottom: 16,
          }}>
            <FileText size={14} strokeWidth={1.5} aria-hidden="true" /> Upload document
            <input type="file" accept=".txt,.md,.pdf" onChange={uploadSource} disabled={busy} className="hidden" data-testid="wa-kb-upload-input" />
          </label>

          <div className="space-y-2">
            {sources.length === 0 && <div style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>No knowledge base sources yet.</div>}
            {sources.map((s) => (
              <div key={s.id} className="flex items-center justify-between" style={{ border: "1px solid var(--border-default)", borderRadius: "var(--radius-lg)", padding: "8px 12px" }}>
                <div className="min-w-0">
                  <div className="truncate" style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>{s.kind === "url" ? s.source_url : s.filename}</div>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                    <span style={{ color: sourceStatusColor[s.status] || "var(--color-warning)" }}>{s.status}</span>
                    {s.status === "ready" && ` · ${s.chunks_count} chunks`}
                    {s.error && ` · ${s.error}`}
                  </div>
                </div>
                <button onClick={() => removeSource(s.id)} data-testid={`wa-kb-remove-${s.id}`} className="shrink-0 ml-2" style={{ color: "var(--text-tertiary)" }}>
                  <Trash2 size={14} strokeWidth={1.5} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
