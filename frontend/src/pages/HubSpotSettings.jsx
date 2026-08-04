import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Loader2, Download, Zap, Link } from "../icons";
import Card from "../components/composites/Card";
import InlineAlert from "../components/composites/InlineAlert";
import IconSquare from "../components/primitives/IconSquare";
import Button from "../components/primitives/Button";
import Chip from "../components/primitives/Chip";

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

  if (!status) return <div className="p-6 sm:p-10" style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Loading HubSpot status…</div>;

  const connected = status.connected;
  const mocked = status.mocked;

  return (
    <div className="animate-fade-in">
      <PageHeader title="HubSpot"
        subtitle="Pull HubSpot contacts as leads, and their emails/notes/calls into proposal research." />

      <div className="p-6 sm:p-8 space-y-4 max-w-3xl">
        <InlineAlert tone={mocked ? "warning" : "success"} title={mocked ? "Test mode" : "Live"}>
          {mocked
            ? <>No HubSpot app is configured, so connecting works and returns sample contacts and engagements, but nothing contacts hubapi.com. Add <span style={{ fontFamily: "var(--font-mono)" }}>HUBSPOT_CLIENT_ID/SECRET/REDIRECT_URI</span> to go live.</>
            : <>Contacts you pull carry their HubSpot ID, so a proposal's Context Pack can include the emails, notes and calls logged against them in HubSpot.</>}
        </InlineAlert>

        {!connected ? (
          <Card data-testid="hubspot-connect-card">
            <div className="flex items-center gap-3" style={{ marginBottom: 16 }}>
              <IconSquare icon={Link} tone="primary" size={44} />
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>Connect HubSpot</div>
                <div style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>
                  {mocked ? "Test mode — no redirect." : "You'll be sent to HubSpot to authorise read access."}
                </div>
              </div>
            </div>
            <Button variant="primary" icon={Link} onClick={doConnect} isLoading={busy} data-testid="hubspot-connect-btn">
              Connect HubSpot
            </Button>
          </Card>
        ) : (
          <>
            <Card data-testid="hubspot-status-card">
              <div className="flex items-center gap-3">
                <IconSquare icon={Zap} tone="success" size={44} />
                <div className="flex-1">
                  <div className="flex items-center gap-2" style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>
                    Connected
                    {mocked && <Chip label="Test mode" />}
                  </div>
                  {status.portal_id && <div className="tnum" style={{ fontSize: 12, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>Portal: {status.portal_id}</div>}
                </div>
                <Button variant="tertiary" size="sm" onClick={doDisconnect} isLoading={busy} data-testid="hubspot-disconnect-btn" className="shrink-0">
                  Disconnect
                </Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border-subtle)" }}>
                <Stat label="Contacts pulled" value={status.pulled_count || 0} />
                <Stat label="Last sync" value={status.last_sync_at ? new Date(status.last_sync_at).toLocaleString() : "—"} small />
              </div>
            </Card>

            <button onClick={pull} disabled={busy} data-testid="hubspot-pull-contacts"
              className="text-left w-full flex items-start gap-3 transition-colors"
              style={{ padding: 20, borderRadius: "var(--radius-xl)", border: "1px solid var(--border-default)", background: "var(--bg-surface)", boxShadow: "var(--shadow-xs)", opacity: busy ? 0.6 : 1 }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "var(--bg-surface)")}
            >
              <IconSquare icon={Download} tone="primary" size={36} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>Pull contacts from HubSpot</div>
                <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginTop: 2 }}>
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
      <div style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
      <div className="tnum" style={{
        marginTop: 4, fontFamily: small ? "var(--font-mono)" : "var(--font-display)",
        fontWeight: small ? 400 : 700, fontSize: small ? 12.5 : 22,
        color: small ? "var(--text-secondary)" : "var(--text-primary)",
      }}>{value}</div>
    </div>
  );
}
