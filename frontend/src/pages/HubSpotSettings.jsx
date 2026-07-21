import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Loader2, ArrowDownToLine, PowerOff, Link2, ShieldCheck } from "lucide-react";

export default function HubSpotSettings() {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [params] = useSearchParams();

  const load = () => api.get("/hubspot/status").then((r) => setStatus(r.data));
  useEffect(() => {
    load();
    if (params.get("connected")) toast.success("HubSpot connected");
    if (params.get("error")) toast.error("Could not connect HubSpot");
  }, [params]);

  const doConnect = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/hubspot/connect", {});
      if (data.url) { window.location.href = data.url; return; }  // real OAuth
      setStatus(data);
      toast.info("Connected in test mode — sample contacts and engagements are available, but nothing hits HubSpot.");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Connect failed");
    } finally { setBusy(false); }
  };

  const doDisconnect = async () => {
    setBusy(true);
    try {
      await api.post("/hubspot/disconnect");
      await load();
      toast.success("Disconnected");
    } finally { setBusy(false); }
  };

  const pull = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/hubspot/pull");
      toast.success(`Pulled ${data.pulled} new contact${data.pulled === 1 ? "" : "s"}`);
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Pull failed");
    } finally { setBusy(false); }
  };

  if (!status) return <div className="p-4 sm:p-10 text-body text-ink-muted">Loading HubSpot status…</div>;

  const connected = status.connected;
  const mocked = status.mocked;

  return (
    <div className="animate-fade-in">
      <PageHeader title="HubSpot"
        subtitle="Pull HubSpot contacts as leads, and their emails/notes/calls into proposal research." />

      <div className="p-6 sm:p-8 space-y-6 max-w-3xl">
        <div className="card-flat shadow-card p-4 flex items-start gap-2.5 text-caption text-ink-tertiary">
          <ShieldCheck size={15} className="text-ink-muted mt-0.5 shrink-0" />
          <p>
            {mocked
              ? <>No HubSpot app is configured, so this runs in <strong>test mode</strong>: connecting works and returns sample contacts and engagements, but nothing contacts hubapi.com. Add <span className="font-mono">HUBSPOT_CLIENT_ID/SECRET/REDIRECT_URI</span> to go live.</>
              : <>Live. Contacts you pull carry their HubSpot ID, so a proposal's Context Pack can include the emails, notes and calls logged against them in HubSpot.</>}
          </p>
        </div>

        {!connected ? (
          <div className="card-flat shadow-card p-4 sm:p-6 space-y-4" data-testid="hubspot-connect-card">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-ink/10 flex items-center justify-center"><Link2 size={16} /></div>
              <div>
                <div className="text-card-title font-display font-semibold">Connect HubSpot</div>
                <div className="text-caption text-ink-muted">
                  {mocked ? "Test mode — no redirect." : "You'll be sent to HubSpot to authorise read access."}
                </div>
              </div>
            </div>
            <button onClick={doConnect} disabled={busy} data-testid="hubspot-connect-btn" className="btn-primary disabled:opacity-60">
              {busy ? <><Loader2 size={14} className="animate-spin" /> Connecting…</> : <><Link2 size={14} /> Connect HubSpot</>}
            </button>
          </div>
        ) : (
          <>
            <div className="card-flat shadow-card p-4 sm:p-6 space-y-3" data-testid="hubspot-status-card">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-success/10 flex items-center justify-center">
                  <div className="w-2.5 h-2.5 rounded-full bg-success" />
                </div>
                <div className="flex-1">
                  <div className="text-card-title font-display font-semibold flex items-center gap-2">
                    Connected
                    {mocked && <span className="pill">test mode</span>}
                  </div>
                  {status.portal_id && <div className="text-caption text-ink-muted font-mono">Portal: {status.portal_id}</div>}
                </div>
                <button onClick={doDisconnect} disabled={busy} data-testid="hubspot-disconnect-btn" className="btn-ghost text-xs text-ink ml-auto shrink-0">
                  <PowerOff size={12} /> Disconnect
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-line">
                <Stat label="Contacts pulled" value={status.pulled_count || 0} />
                <Stat label="Last sync" value={status.last_sync_at ? new Date(status.last_sync_at).toLocaleString() : "—"} small />
              </div>
            </div>

            <button onClick={pull} disabled={busy} data-testid="hubspot-pull-contacts"
              className="text-left p-3 sm:p-4 rounded-2xl border border-line bg-white shadow-card hover:shadow-card-hover transition-colors disabled:opacity-50 w-full flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-ink/10 flex items-center justify-center shrink-0"><ArrowDownToLine size={16} /></div>
              <div>
                <div className="text-body font-medium">Pull contacts from HubSpot</div>
                <div className="text-caption text-ink-muted mt-1">
                  Import new HubSpot contacts as leads (deduped by email). Their engagements become available to Proposal EQ.
                </div>
              </div>
            </button>
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
      <div className={`mt-1 font-display font-bold ${small ? "text-caption font-mono font-normal text-ink-secondary" : "text-2xl"}`}>{value}</div>
    </div>
  );
}
