import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import {
  Loader2, RefreshCw, ArrowDownToLine, ArrowUpToLine, PowerOff, Link2, AlertTriangle,
} from "lucide-react";

export default function HubSpotSettings() {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [portalIdInput, setPortalIdInput] = useState("");

  const load = () => api.get("/hubspot/status").then((r) => setStatus(r.data));
  useEffect(() => { load(); }, []);

  const doConnect = async () => {
    setConnecting(true);
    try {
      const { data } = await api.post("/hubspot/connect", { portal_id: portalIdInput.trim() || null });
      setStatus(data);
      toast.success("HubSpot connected (mocked)");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Connect failed");
    } finally { setConnecting(false); }
  };

  const doDisconnect = async () => {
    if (!confirm("Disconnect HubSpot? Existing synced IDs will remain on your leads.")) return;
    setBusy(true);
    try {
      await api.post("/hubspot/disconnect");
      await load();
      toast.success("Disconnected");
    } finally { setBusy(false); }
  };

  const doAction = async (path, label) => {
    setBusy(true);
    try {
      const { data } = await api.post(path);
      const summary = data.pushed ? `Pushed ${data.pushed} leads` :
        data.pulled ? `Pulled ${data.pulled} new contacts` :
        data.synced ? `Synced ${data.synced} deals` : "Done";
      toast.success(`${label}: ${summary}`);
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || `${label} failed`);
    } finally { setBusy(false); }
  };

  if (!status) return <div className="p-10 text-neutral-500 text-sm">Loading HubSpot status…</div>;

  const connected = status.connected;

  return (
    <div>
      <PageHeader
        title="HubSpot"
        subtitle="Two-way sync between Pitch EQ leads / deals and your HubSpot CRM."
        badge="Mocked"
      />

      <div className="p-6 space-y-6 max-w-3xl">
        {/* MOCKED banner */}
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
          <AlertTriangle size={16} className="text-amber-700 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900 leading-relaxed">
            <div className="font-medium mb-0.5">This integration is currently MOCKED.</div>
            All actions simulate HubSpot writes / reads without contacting HubSpot. To enable live sync,
            provide your HubSpot developer <span className="font-mono">Client ID</span>, <span className="font-mono">Client Secret</span>, and a <span className="font-mono">Private App token</span>.
            Get them at <a href="https://developers.hubspot.com/" target="_blank" rel="noreferrer" className="underline">developers.hubspot.com</a>.
          </div>
        </div>

        {!connected ? (
          <div className="rounded-2xl border border-line bg-white p-6 space-y-4" data-testid="hubspot-connect-card">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-ink/10 flex items-center justify-center">
                <Link2 size={16} />
              </div>
              <div>
                <div className="font-display font-bold text-lg">Connect HubSpot</div>
                <div className="text-xs text-neutral-500">Simulates the OAuth handshake. In live mode you&apos;d be redirected to hubspot.com.</div>
              </div>
            </div>

            <label className="block">
              <span className="ui-label">Portal ID <span className="text-neutral-400 font-normal">(optional — for display only)</span></span>
              <input value={portalIdInput} onChange={(e) => setPortalIdInput(e.target.value)}
                data-testid="hubspot-portal-id"
                placeholder="e.g. 144123"
                className="mt-1 w-full border border-line rounded-full px-3 py-2 text-sm font-mono" />
            </label>

            <button onClick={doConnect} disabled={connecting} data-testid="hubspot-connect-btn"
              className="btn-primary disabled:opacity-60">
              {connecting ? <><Loader2 size={14} className="animate-spin" /> Connecting…</> : <><Link2 size={14} /> Connect HubSpot</>}
            </button>
          </div>
        ) : (
          <>
            <div className="rounded-2xl border border-line bg-white p-6 space-y-3" data-testid="hubspot-status-card">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
                </div>
                <div className="flex-1">
                  <div className="font-display font-bold text-lg">Connected</div>
                  <div className="text-xs text-neutral-500 font-mono">Portal: {status.portal_id}</div>
                </div>
                <button onClick={doDisconnect} disabled={busy} data-testid="hubspot-disconnect-btn"
                  className="btn-ghost text-xs text-red-600">
                  <PowerOff size={12} /> Disconnect
                </button>
              </div>

              <div className="grid grid-cols-3 gap-3 pt-3 border-t border-line">
                <Stat label="Leads pushed" value={status.pushed_count || 0} />
                <Stat label="Contacts pulled" value={status.pulled_count || 0} />
                <Stat label="Last sync" value={status.last_sync_at ? new Date(status.last_sync_at).toLocaleString() : "—"} small />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <ActionCard
                icon={<ArrowUpToLine size={16} />}
                title="Push leads → HubSpot"
                desc="Send every Pitch EQ lead in this workspace to HubSpot as a Contact."
                testid="hubspot-push-leads"
                onClick={() => doAction("/hubspot/sync", "Push leads")}
                busy={busy}
              />
              <ActionCard
                icon={<ArrowDownToLine size={16} />}
                title="Pull contacts ← HubSpot"
                desc="Import new HubSpot contacts as Pitch EQ leads."
                testid="hubspot-pull-contacts"
                onClick={() => doAction("/hubspot/pull", "Pull contacts")}
                busy={busy}
              />
              <ActionCard
                icon={<RefreshCw size={16} />}
                title="Sync deals"
                desc="Push CRM Kanban deals to HubSpot Deals."
                testid="hubspot-sync-deals"
                onClick={() => doAction("/hubspot/deals/sync", "Sync deals")}
                busy={busy}
              />
              <ActionCard
                icon={<RefreshCw size={16} />}
                title="Full re-sync"
                desc="Push leads + deals in one go."
                testid="hubspot-full-sync"
                onClick={async () => { await doAction("/hubspot/sync", "Push leads"); await doAction("/hubspot/deals/sync", "Sync deals"); }}
                busy={busy}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, small }) {
  return (
    <div>
      <div className="ui-label">{label}</div>
      <div className={`mt-1 font-display font-bold ${small ? "text-xs font-mono font-normal text-neutral-700" : "text-2xl"}`}>{value}</div>
    </div>
  );
}

function ActionCard({ icon, title, desc, onClick, busy, testid }) {
  return (
    <button onClick={onClick} disabled={busy} data-testid={testid}
      className="text-left p-4 rounded-2xl border border-line bg-white hover:border-ink transition-colors disabled:opacity-50">
      <div className="w-9 h-9 rounded-full bg-ink/10 flex items-center justify-center mb-2">{icon}</div>
      <div className="text-sm font-medium">{title}</div>
      <div className="text-xs text-neutral-500 mt-1 leading-relaxed">{desc}</div>
    </button>
  );
}
