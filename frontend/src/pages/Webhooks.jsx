import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import {
  Plus, Trash2, Copy, Loader2, Webhook, ChevronRight, CheckCircle2, XCircle, Clock,
} from "lucide-react";

const SOURCES = [
  {
    id: "airtable",
    label: "Airtable",
    hint: "Airtable Automations → 'Send webhook' action.",
    example: `{
  "fields": {
    "Topic": "Why cold email is broken",
    "Platform": "linkedin",
    "SlideCount": 6
  }
}`,
    field_map: { topic: "fields.Topic", platform: "fields.Platform", slide_count: "fields.SlideCount" },
  },
  {
    id: "notion",
    label: "Notion",
    hint: "Notion database automation → HTTP POST.",
    example: `{
  "properties": {
    "Topic": { "title": [{ "plain_text": "How to write better hooks" }] },
    "Platform": { "select": { "name": "linkedin" } }
  }
}`,
    field_map: { topic: "properties.Topic.title.0.plain_text", platform: "properties.Platform.select.name" },
  },
  {
    id: "generic",
    label: "Generic JSON",
    hint: "Any POST — Zapier, Make, curl, etc.",
    example: `{
  "topic": "5 subject-line rules",
  "platform": "linkedin",
  "slide_count": 5
}`,
    field_map: { topic: "topic", platform: "platform", slide_count: "slide_count" },
  },
];

export default function Webhooks() {
  const [hooks, setHooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [events, setEvents] = useState({}); // { [hook_id]: [event, ...] }

  const backend = process.env.REACT_APP_BACKEND_URL || "";

  const load = () => {
    setLoading(true);
    api.get("/webhooks").then((r) => setHooks(r.data)).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const del = async (id) => {
    if (!confirm("Delete this webhook? Its URL will stop working immediately.")) return;
    await api.delete(`/webhooks/${id}`);
    load();
  };

  const loadEvents = async (id) => {
    const { data } = await api.get(`/webhooks/${id}/events`);
    setEvents((cur) => ({ ...cur, [id]: data }));
  };

  const toggle = (id) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (!events[id]) loadEvents(id);
  };

  const copy = (text) => {
    navigator.clipboard.writeText(text).then(
      () => toast.success("Copied to clipboard"),
      () => toast.error("Copy failed"),
    );
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Webhooks"
        subtitle="Trigger Create EQ carousels from Airtable, Notion, or any HTTP POST."
        right={
          <button onClick={() => setModal(true)} data-testid="new-webhook-btn" className="btn-primary">
            <Plus size={14} /> New webhook
          </button>
        }
      />

      <div className="p-6 sm:p-8 space-y-6">
        {loading && <div className="text-ink-muted text-caption">Loading webhooks…</div>}
        {!loading && hooks.length === 0 && (
          <div className="rounded-2xl border border-line bg-white shadow-card p-8 text-center">
            <Webhook className="mx-auto mb-3 text-ink-muted" size={32} />
            <div className="font-display font-semibold text-section mb-1">No webhooks yet</div>
            <p className="text-body text-ink-muted max-w-md mx-auto mb-4">
              Automate carousel creation. Pick a source (Airtable / Notion / any HTTP), map the fields, and paste the URL into your automation tool.
            </p>
            <button onClick={() => setModal(true)} data-testid="empty-new-webhook" className="btn-primary">
              <Plus size={14} /> Create your first webhook
            </button>
          </div>
        )}

        <div className="space-y-3">
          {hooks.map((h) => {
            const url = `${backend}/api/hooks/carousel/${h.token}`;
            const isOpen = expanded === h.id;
            const evs = events[h.id] || [];
            return (
              <div key={h.id} className="bg-white border border-line rounded-2xl shadow-card hover:shadow-card-hover overflow-hidden" data-testid={`webhook-${h.id}`}>
                <div className="p-4 flex flex-wrap items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-ink/10 flex items-center justify-center">
                    <Webhook size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-body truncate">{h.name}</div>
                    <div className="text-tiny text-ink-muted font-mono uppercase tracking-wider">
                      {h.source} · {h.call_count || 0} calls
                      {h.last_called_at && ` · last ${new Date(h.last_called_at).toLocaleString()}`}
                    </div>
                  </div>
                  <button onClick={() => copy(url)} data-testid={`webhook-copy-${h.id}`} title="Copy URL"
                    className="btn-ghost text-caption">
                    <Copy size={12} /> URL
                  </button>
                  <button onClick={() => toggle(h.id)} data-testid={`webhook-toggle-${h.id}`}
                    className="btn-ghost text-caption">
                    {isOpen ? "Hide" : "Details"} <ChevronRight size={12} className={`transition-transform ${isOpen ? "rotate-90" : ""}`} />
                  </button>
                  <button onClick={() => del(h.id)} data-testid={`webhook-delete-${h.id}`}
                    className="btn-ghost text-caption text-danger">
                    <Trash2 size={12} />
                  </button>
                </div>
                {isOpen && (
                  <div className="border-t border-line px-4 py-4 bg-ash space-y-4 text-caption">
                    <div>
                      <div className="ui-label mb-1.5">Webhook URL</div>
                      <div className="bg-white border border-line rounded-lg p-3 font-mono text-tiny break-all select-all">{url}</div>
                    </div>
                    <div>
                      <div className="ui-label mb-1.5">Field mapping</div>
                      <div className="bg-white border border-line rounded-lg p-3 font-mono text-tiny">
                        {Object.entries(h.field_map || {}).map(([k, v]) => (
                          <div key={k}><span className="text-ink-muted">{k}</span> ← <span className="text-ink">{v || "(payload." + k + ")"}</span></div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="ui-label mb-1.5">Recent events</div>
                      {evs.length === 0 && <div className="text-ink-muted">No calls yet.</div>}
                      <div className="space-y-1.5">
                        {evs.map((e) => (
                          <div key={e.id} className="bg-white border border-line rounded-lg p-2 flex items-center gap-2">
                            {e.status === "ok" ? <CheckCircle2 size={12} className="text-success flex-shrink-0" /> : <XCircle size={12} className="text-danger flex-shrink-0" />}
                            <div className="flex-1 min-w-0 truncate">{e.topic || e.reason || "—"}</div>
                            <div className="text-ink-muted font-mono flex items-center gap-1"><Clock size={10} /> {new Date(e.at).toLocaleTimeString()}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {modal && (
        <NewWebhookModal
          onClose={() => setModal(false)}
          onCreated={(hook) => { setHooks((h) => [hook, ...h]); setModal(false); toast.success("Webhook created"); }}
        />
      )}
    </div>
  );
}

function NewWebhookModal({ onClose, onCreated }) {
  const [source, setSource] = useState("airtable");
  const [name, setName] = useState("");
  const [defaultPlatform, setDefaultPlatform] = useState("linkedin");
  const [defaultCount, setDefaultCount] = useState(6);
  const [busy, setBusy] = useState(false);
  const src = SOURCES.find((s) => s.id === source);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post("/webhooks", {
        name: name.trim() || `${src.label} → Carousel`,
        source,
        field_map: src.field_map,
        default_platform: defaultPlatform,
        default_slide_count: defaultCount,
      });
      onCreated(data);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Create failed");
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-ink/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <form onSubmit={submit} className="bg-white rounded-2xl shadow-card w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} data-testid="new-webhook-modal">
        <div className="p-4 sm:p-6 border-b border-line flex items-center gap-2">
          <Webhook size={16} />
          <div className="font-display font-semibold text-section">New webhook</div>
          <button type="button" onClick={onClose} className="ml-auto text-ink-muted hover:text-ink text-caption">Cancel</button>
        </div>
        <div className="p-4 sm:p-6 space-y-5">
          <div>
            <div className="ui-label mb-2">Source</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {SOURCES.map((s) => (
                <button key={s.id} type="button" onClick={() => setSource(s.id)}
                  data-testid={`wh-source-${s.id}`}
                  className={`text-left p-3 rounded-lg border ${source === s.id ? "border-ink bg-ash" : "border-line hover:border-neutral-400"}`}>
                  <div className="text-caption font-medium">{s.label}</div>
                  <div className="text-tiny text-ink-muted mt-0.5 leading-tight">{s.hint}</div>
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="form-label">Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)}
              data-testid="wh-name"
              placeholder={`${src.label} → Carousel`}
              className="input-premium mt-1 w-full" />
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="form-label">Default platform</span>
              <select value={defaultPlatform} onChange={(e) => setDefaultPlatform(e.target.value)}
                data-testid="wh-platform"
                className="input-premium mt-1 w-full bg-white">
                <option value="linkedin">LinkedIn Deck</option>
                <option value="square">Square Social</option>
                <option value="twitter">Twitter Cheat Sheet</option>
              </select>
            </label>
            <label className="block">
              <span className="form-label">Default slide count</span>
              <input type="number" min={2} max={12} value={defaultCount}
                onChange={(e) => setDefaultCount(Number(e.target.value))}
                data-testid="wh-count"
                className="input-premium mt-1 w-full font-mono" />
            </label>
          </div>

          <div className="border-t border-line pt-4">
            <div className="ui-label mb-2">Sample payload</div>
            <div className="text-tiny text-ink-muted mb-2">
              Your automation should POST JSON like this to the generated URL. Fields are auto-mapped.
            </div>
            <pre className="bg-neutral-900 text-neutral-100 rounded-lg p-3 text-tiny font-mono overflow-x-auto whitespace-pre">{src.example}</pre>
          </div>
        </div>

        <div className="p-4 sm:p-6 border-t border-line flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={busy} data-testid="wh-create-submit" className="btn-primary disabled:opacity-60">
            {busy ? <><Loader2 size={14} className="animate-spin" /> Creating…</> : <><Plus size={14} /> Create webhook</>}
          </button>
        </div>
      </form>
    </div>
  );
}
