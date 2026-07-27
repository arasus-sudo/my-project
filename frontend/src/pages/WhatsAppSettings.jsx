import { useEffect, useState } from "react";
import { api, isCreditError } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Plus, RefreshCw, Trash2, Copy, Globe, FileText, Bot } from "lucide-react";

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

  return (
    <div>
      <PageHeader title="WhatsApp EQ Settings" subtitle="Configure WhatsApp Business messaging preferences." />
      <div className="animate-fade-in px-6 sm:px-8 max-w-2xl space-y-4">
        <div className="bg-white border border-line rounded-2xl p-6 space-y-4">
          <div className="text-card-title font-display font-semibold">Configuration</div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="ui-label">Business name</label>
              <input className="inp w-full" value={settings.business_name || ""} onChange={(e) => setSettings({ ...settings, business_name: e.target.value })} />
            </div>
            <div>
              <label className="ui-label">Max sends per minute</label>
              <input className="inp w-full" type="number" value={settings.max_sends_per_minute ?? 30} onChange={(e) => setSettings({ ...settings, max_sends_per_minute: parseInt(e.target.value) || 30 })} />
            </div>
          </div>
          <div>
            <label className="ui-label">24-hour session expiry (hours)</label>
            <input className="inp w-full" type="number" value={settings.session_expiry_hours ?? 24} onChange={(e) => setSettings({ ...settings, session_expiry_hours: parseInt(e.target.value) || 24 })} />
          </div>
          <div className="flex justify-end">
            <button onClick={save} className="btn-primary">Save</button>
          </div>
        </div>

        <div className="bg-white border border-line rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-card-title font-display font-semibold">
              <Bot size={16} /> Automated response agent
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={!!settings.automated_agent_enabled}
                onChange={(e) => setSettings({ ...settings, automated_agent_enabled: e.target.checked })}
                data-testid="wa-agent-enabled-toggle" className="w-4 h-4" />
              <span className="text-body">Enabled</span>
            </label>
          </div>
          <p className="text-caption text-ink-muted">
            When enabled, inbound messages are answered from your knowledge base below — the agent
            can also book a meeting, capture a callback request, or share your purchase link. A
            human replying always pauses the bot on that conversation.
          </p>

          <div>
            <label className="ui-label">Booking event type</label>
            <select className="inp w-full" value={settings.booking_event_type_slug || ""}
              onChange={(e) => setSettings({ ...settings, booking_event_type_slug: e.target.value || null })}
              data-testid="wa-booking-event-type-select">
              <option value="">Not configured — booking requests hand off to a human</option>
              {eventTypes.map((et) => (
                <option key={et.id} value={et.slug}>{et.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="ui-label">Purchase link</label>
            <input className="inp w-full" placeholder="https://buy.stripe.com/..."
              value={settings.purchase_link || ""} onChange={(e) => setSettings({ ...settings, purchase_link: e.target.value })}
              data-testid="wa-purchase-link-input" />
            <p className="text-tiny text-ink-muted mt-1">Shared when a customer asks how to buy or pay.</p>
          </div>

          <div className="flex justify-end">
            <button onClick={save} className="btn-primary">Save</button>
          </div>

          {webhookUrl && (
            <div>
              <div className="ui-label mb-1.5">Inbound webhook URL — paste into Twilio's WhatsApp Sender config</div>
              <div className="bg-ash border border-line rounded-xl p-3 font-mono text-tiny break-all flex items-start gap-2">
                <span className="flex-1">{webhookUrl}</span>
                <button onClick={copyWebhookUrl} data-testid="copy-webhook-url-btn" className="text-ink-muted hover:text-ink shrink-0"><Copy size={14} /></button>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white border border-line rounded-2xl p-6 space-y-4">
          <div className="text-card-title font-display font-semibold">Knowledge base</div>
          <p className="text-caption text-ink-muted">Crawl a URL or upload a document — the agent answers only from this content.</p>

          <form onSubmit={addCrawlSource} className="flex gap-2">
            <input className="inp flex-1" placeholder="https://example.com" value={crawlUrl}
              onChange={(e) => setCrawlUrl(e.target.value)} data-testid="wa-kb-crawl-url-input" />
            <button type="submit" disabled={busy} className="btn-secondary shrink-0">
              <Globe size={14} /> Crawl
            </button>
          </form>

          <label className="btn-secondary inline-flex cursor-pointer w-fit">
            <FileText size={14} /> Upload document
            <input type="file" accept=".txt,.md,.pdf" onChange={uploadSource} disabled={busy} className="hidden" data-testid="wa-kb-upload-input" />
          </label>

          <div className="space-y-2">
            {sources.length === 0 && <div className="text-caption text-ink-muted">No knowledge base sources yet.</div>}
            {sources.map((s) => (
              <div key={s.id} className="flex items-center justify-between border border-line rounded-xl px-3 py-2">
                <div className="min-w-0">
                  <div className="text-body font-medium truncate">{s.kind === "url" ? s.source_url : s.filename}</div>
                  <div className="text-tiny text-ink-muted">
                    <span className={s.status === "ready" ? "text-success" : s.status === "error" ? "text-danger" : "text-warning"}>{s.status}</span>
                    {s.status === "ready" && ` · ${s.chunks_count} chunks`}
                    {s.error && ` · ${s.error}`}
                  </div>
                </div>
                <button onClick={() => removeSource(s.id)} data-testid={`wa-kb-remove-${s.id}`} className="text-ink-muted hover:text-danger shrink-0 ml-2">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
