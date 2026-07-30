import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Loader2, ShieldAlert, Save, Trash2 } from "lucide-react";

const PROVIDERS = [
  {
    id: "google_workspace", label: "Google Workspace",
    requires: "your organization's Google Workspace admin console",
    fields: [
      { key: "client_id", label: "OAuth Client ID" },
      { key: "client_secret", label: "OAuth Client Secret", secret: true },
      { key: "admin_email", label: "Admin email (for domain-wide delegation)" },
      { key: "customer_id", label: "Google Customer ID" },
    ],
  },
  {
    id: "microsoft_365", label: "Microsoft 365",
    requires: "an Azure AD app registration with Directory.Read.All",
    fields: [
      { key: "tenant_id", label: "Tenant ID" },
      { key: "client_id", label: "Application (client) ID" },
      { key: "client_secret", label: "Client secret", secret: true },
    ],
  },
  {
    id: "azure_ad", label: "Azure AD (SSO)",
    requires: "an Azure AD app registration",
    fields: [
      { key: "tenant_id", label: "Tenant ID" },
      { key: "client_id", label: "Application (client) ID" },
      { key: "client_secret", label: "Client secret", secret: true },
    ],
  },
  {
    id: "saml", label: "SAML / SSO",
    requires: "your identity provider's SAML metadata",
    fields: [
      { key: "idp_entity_id", label: "IdP Entity ID" },
      { key: "idp_sso_url", label: "IdP SSO URL" },
      { key: "idp_metadata_url", label: "IdP metadata URL" },
      { key: "certificate", label: "X.509 certificate", secret: true },
    ],
  },
];

export default function DirectorySyncSettings() {
  const [active, setActive] = useState(PROVIDERS[0].id);
  const [statusByProvider, setStatusByProvider] = useState({});
  const [forms, setForms] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = () => {
    api.get("/directory-sync/status").then((r) => {
      const byId = {};
      (r.data || []).forEach((row) => { byId[row.provider] = row; });
      setStatusByProvider(byId);
      setLoading(false);
    }).catch(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const provider = PROVIDERS.find((p) => p.id === active);
  const status = statusByProvider[active];
  const form = forms[active] || {};

  const setField = (key, value) => setForms((f) => ({ ...f, [active]: { ...(f[active] || {}), [key]: value } }));

  const save = async () => {
    // Blank fields are omitted, not sent as empty strings — the backend
    // merges into stored config, so a blank secret field means "keep what's
    // already saved," not "clear it."
    const payload = Object.fromEntries(Object.entries(form).filter(([, v]) => v && v.trim()));
    setBusy(true);
    try {
      await api.put(`/directory-sync/${active}`, { config: payload });
      toast.success("Configuration saved — still not connected (this is storage only)");
      setForms((f) => ({ ...f, [active]: {} }));
      load();
    } catch (err) { toast.error(err?.response?.data?.detail || "Save failed"); }
    finally { setBusy(false); }
  };

  const clear = async () => {
    if (!confirm(`Clear stored ${provider.label} configuration?`)) return;
    await api.delete(`/directory-sync/${active}`);
    toast.success("Configuration cleared");
    load();
  };

  if (loading) return <div className="p-4 sm:p-10 text-body text-ink-muted">Loading…</div>;

  return (
    <div className="animate-fade-in">
      <PageHeader title="Directory Sync" subtitle="Org admin only — configuration scaffolding for future SSO/directory integrations." />

      <div className="p-6 sm:p-8 space-y-6 max-w-3xl">
        <div className="card-flat shadow-card p-4 flex items-start gap-2.5 text-caption text-ink-tertiary" data-testid="directory-sync-scaffold-notice">
          <ShieldAlert size={16} className="text-warning mt-0.5 shrink-0" />
          <p>
            <strong>Configuration-only — nothing here connects to a real directory yet.</strong> Fields you save are
            stored for when a live integration is built; no OAuth flow, SCIM sync, or SSO login is wired up.
          </p>
        </div>

        <div className="flex gap-1 border-b border-line overflow-x-auto">
          {PROVIDERS.map((p) => (
            <button key={p.id} onClick={() => setActive(p.id)} data-testid={`ds-tab-${p.id}`}
              className={`px-3 py-2 text-caption font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
                active === p.id ? "border-ink text-ink" : "border-transparent text-ink-muted hover:text-ink"}`}>
              {p.label}
            </button>
          ))}
        </div>

        <div className="card-flat shadow-card p-4 sm:p-6 space-y-4" data-testid={`ds-panel-${active}`}>
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-ink-disabled shrink-0" />
            <div className="flex-1">
              <div className="text-card-title font-display font-semibold">Not connected</div>
              <div className="text-caption text-ink-muted">Requires {provider.requires}.</div>
            </div>
            {status?.configured && <span className="pill">config saved</span>}
          </div>

          <div className="space-y-3 pt-3 border-t border-line">
            {provider.fields.map((f) => {
              const savedVal = status?.config?.[f.key];
              return (
                <label key={f.key} className="block">
                  <span className="text-caption text-ink-muted">{f.label}</span>
                  <input
                    type={f.secret ? "password" : "text"}
                    value={form[f.key] ?? ""}
                    onChange={(e) => setField(f.key, e.target.value)}
                    placeholder={savedVal ? `Saved (${savedVal}) — leave blank to keep` : ""}
                    data-testid={`ds-field-${active}-${f.key}`}
                    className="input-premium w-full mt-1 font-mono text-body"
                  />
                </label>
              );
            })}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            {status?.configured && (
              <button onClick={clear} className="btn-ghost text-caption text-danger" data-testid={`ds-clear-${active}`}>
                <Trash2 size={13} /> Clear
              </button>
            )}
            <button onClick={save} disabled={busy} data-testid={`ds-save-${active}`} className="btn-primary text-caption">
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save configuration
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
