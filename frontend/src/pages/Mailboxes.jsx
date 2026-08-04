import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import {
  CheckCircle2, XCircle, Plus, RefreshCw, Link2, Trash2, AlertTriangle, Mail,
} from "../icons";
import Card from "../components/composites/Card";
import { EmptyState } from "../components/composites/EmptyState";
import InlineAlert from "../components/composites/InlineAlert";
import ProgressBar from "../components/composites/ProgressBar";
import { Modal, ModalContent } from "../components/composites/Modal";
import Button from "../components/primitives/Button";
import Input from "../components/primitives/Input";
import Select from "../components/primitives/Select";
import StatusPill from "../components/primitives/StatusPill";

const DNS_HELP = {
  spf: "Authorises this server to send for your domain. Without it, most inboxes distrust you.",
  dkim: "Cryptographically signs your mail so it can't be spoofed or tampered with.",
  dmarc: "Tells inboxes what to do when SPF/DKIM fail. Required by Gmail and Yahoo for bulk senders.",
};

export default function Mailboxes() {
  const [items, setItems] = useState([]);
  const [modal, setModal] = useState(false);
  const [params] = useSearchParams();
  const [form, setForm] = useState({ email: "", provider: "gmail", display_name: "", daily_cap: 50 });

  const load = () => api.get("/mailboxes").then((r) => setItems(r.data));

  useEffect(() => {
    load();
    if (params.get("connected")) toast.success("Mailbox connected — it can now send");
    if (params.get("error")) toast.error("Could not connect that mailbox");
  }, [params]);

  const add = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post("/mailboxes", form);
      setModal(false);
      setForm({ email: "", provider: "gmail", display_name: "", daily_cap: 50 });
      await load();
      // Registering the address is only half of it — it can't send until OAuth
      // completes, so go straight there rather than claiming it's "connected".
      connect(data.id);
    } catch (err) { toast.error(err?.response?.data?.detail || "Failed"); }
  };

  const connect = async (id) => {
    try {
      const { data } = await api.get(`/mailboxes/${id}/oauth-url`);
      if (data.url) { window.location.href = data.url; return; }
      toast.info("Connected in test mode — drafts and queueing work, but no mail actually leaves the box.");
      load();
    } catch { toast.error("Could not start the connection"); }
  };

  const dnsCheck = async (id) => {
    try {
      const { data } = await api.post(`/mailboxes/${id}/dns-check`);
      const d = data.dns || {};
      const missing = ["spf", "dkim", "dmarc"].filter((k) => !d[k]);
      if (missing.length) toast.warning(`Missing: ${missing.join(", ").toUpperCase()}`);
      else toast.success("SPF, DKIM and DMARC all resolve");
      load();
    } catch { toast.error("DNS check failed"); }
  };

  const toggleWarmup = async (id) => { await api.post(`/mailboxes/${id}/warmup`); load(); };

  const deleteMailbox = async (id, email) => {
    if (!window.confirm(`Remove ${email}? Campaigns using this mailbox will stop sending. This can't be undone.`)) return;
    try {
      await api.delete(`/mailboxes/${id}`);
      toast.success("Mailbox removed");
      load();
    } catch { toast.error("Failed to remove mailbox"); }
  };

  return (
    <div>
      <PageHeader
        title="Mailboxes"
        subtitle="Cold email sends from your own mailbox — that's the only way it lands."
        right={<Button variant="primary" icon={Plus} onClick={() => setModal(true)} data-testid="add-mailbox-btn">Connect mailbox</Button>}
      />

      <div className="animate-fade-in px-6 sm:px-8 pt-6">
        <InlineAlert tone="info" title="Why your own mailbox">
          Outbound is sent through your connected Google or Microsoft mailbox, never a
          transactional provider — cold email through one of those violates their terms and gets
          your sending domain blocked. Warmup and per-mailbox daily caps are what keep you out of
          the spam folder.
        </InlineAlert>
      </div>

      <div className="px-6 sm:px-8 py-6 grid md:grid-cols-2 gap-6">
        {items.length === 0 && (
          <EmptyState
            className="col-span-2"
            icon={Mail}
            title="No mailboxes connected"
            description="Campaigns can't launch without one — there'd be nothing to send from."
            actionLabel="Connect mailbox"
            onAction={() => setModal(true)}
          />
        )}

        {items.map((m) => {
          const connected = m.status === "connected";
          const mocked = m.mocked;
          const cap = m.daily_cap || 50;
          const statusLabel = !connected ? "Not connected" : mocked ? "Test mode" : "Sending";
          const statusTone = !connected ? "danger" : mocked ? "neutral" : "success";
          return (
            <Card key={m.id} data-testid={`mailbox-${m.id}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", fontFamily: "var(--font-mono)" }}>{m.provider}</div>
                  <div className="truncate" style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-ui)", marginTop: 2 }}>{m.email}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", marginTop: 2 }}>{m.display_name || "—"}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusPill status={statusLabel} tone={statusTone} data-testid={`mailbox-status-${m.id}`} />
                  <button onClick={() => deleteMailbox(m.id, m.email)} data-testid={`delete-${m.id}`}
                    className="inline-grid place-items-center transition-colors" title="Remove mailbox"
                    style={{ width: 30, height: 30, borderRadius: "var(--radius-md)", color: "var(--text-tertiary)" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-danger-subtle)"; e.currentTarget.style.color = "var(--color-danger)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-tertiary)"; }}
                  >
                    <Trash2 size={14} strokeWidth={1.5} aria-hidden="true" />
                  </button>
                </div>
              </div>

              {!connected && (
                <Button variant="primary" size="md" icon={Link2} onClick={() => connect(m.id)} data-testid={`connect-${m.id}`} className="w-full justify-center mt-4">
                  Authorise sending
                </Button>
              )}
              {connected && mocked && (
                <div style={{ marginTop: 12, fontSize: 11.5, color: "var(--text-tertiary)", background: "var(--bg-surface-sunken)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", padding: "8px 10px" }}>
                  Queueing and drafting work, but no mail actually leaves the box until a Google or
                  Microsoft OAuth app is configured.
                </div>
              )}

              <div style={{ marginTop: 24, marginBottom: 8, fontSize: 11.5, fontWeight: 500, color: "var(--text-secondary)", fontFamily: "var(--font-ui)" }}>Domain authentication</div>
              {!m.dns?.checked ? (
                <div className="flex items-center gap-2" style={{ fontSize: 12.5, color: "var(--text-secondary)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-lg)", padding: "10px 12px" }}>
                  <AlertTriangle size={14} strokeWidth={1.5} aria-hidden="true" style={{ color: "var(--color-warning)" }} />
                  Not checked yet — we won't guess. Run a check to see the real records.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {["spf", "dkim", "dmarc"].map((k) => {
                    const ok = m.dns?.[k];
                    return (
                      <div key={k} title={DNS_HELP[k]} data-testid={`dns-${k}-${m.id}`}
                        className="text-center" style={{
                          border: `1px solid ${ok ? "var(--color-success-border)" : "var(--color-danger-border)"}`,
                          background: ok ? "var(--color-success-subtle)" : "var(--color-danger-subtle)",
                          color: ok ? "var(--color-success-text)" : "var(--color-danger-text)",
                          borderRadius: "var(--radius-lg)", padding: 10,
                        }}>
                        <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", textTransform: "uppercase" }}>{k}</div>
                        {ok ? <CheckCircle2 size={16} strokeWidth={1.5} aria-hidden="true" className="inline mt-1" /> : <XCircle size={16} strokeWidth={1.5} aria-hidden="true" className="inline mt-1" />}
                      </div>
                    );
                  })}
                </div>
              )}
              {m.dns?.dmarc_policy && (
                <div className="tnum" style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", marginTop: 6 }}>
                  DMARC policy: p={m.dns.dmarc_policy}
                </div>
              )}
              <Button variant="tertiary" size="xs" icon={RefreshCw} onClick={() => dnsCheck(m.id)} data-testid={`dns-check-${m.id}`} className="mt-2">
                {m.dns?.checked ? "Re-check DNS" : "Check DNS"}
              </Button>

              <div className="grid grid-cols-2 gap-4" style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--border-subtle)" }}>
                <div>
                  <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>Warmup</div>
                  <div className="tnum" style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
                    {m.warmup_enabled ? `Day ${m.warmup_day}` : "Off"}
                  </div>
                  <button onClick={() => toggleWarmup(m.id)} data-testid={`warmup-${m.id}`}
                    style={{ fontSize: 11.5, marginTop: 4, color: "var(--text-link)" }}>
                    {m.warmup_enabled ? "Pause" : "Resume"}
                  </button>
                  {m.warmup_enabled && (
                    <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4, lineHeight: "15px" }}>
                      caps sends at {Math.min(cap, 5 + (m.warmup_day || 1) * 5)}/day while ramping
                    </div>
                  )}
                </div>
                <div>
                  <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>Sent today</div>
                  <div className="tnum" style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
                    {m.sent_today || 0}/{cap}
                  </div>
                  <ProgressBar className="mt-1.5" segments={[{ value: m.sent_today || 0, color: "var(--color-primary)" }]} total={cap} />
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Modal open={modal} onOpenChange={setModal}>
        <ModalContent
          size="sm"
          title="Connect mailbox"
          subtitle="You'll be sent to your provider to authorise sending. Nothing can go out until you do."
          footer={
            <>
              <Button type="button" variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
              <Button type="submit" form="add-mailbox-form" variant="primary" data-testid="save-mailbox">Continue</Button>
            </>
          }
        >
          <form id="add-mailbox-form" onSubmit={add} className="space-y-4">
            <Select
              label="Provider" value={form.provider} onChange={(v) => setForm({ ...form, provider: v })}
              data-testid="mailbox-provider"
              options={[
                { value: "gmail", label: "Google Workspace / Gmail" },
                { value: "m365", label: "Microsoft 365 / Outlook" },
              ]}
            />
            <Input required type="email" label="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="mailbox-email" />
            <Input label="Display name" optional value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} data-testid="mailbox-display" />
            <Input
              type="number" min={10} max={500} label="Daily cap" value={form.daily_cap}
              onChange={(e) => setForm({ ...form, daily_cap: Number(e.target.value) })}
              data-testid="mailbox-cap"
              help="50/day is a safe ceiling for a warmed mailbox. More than that and you're gambling."
            />
          </form>
        </ModalContent>
      </Modal>
    </div>
  );
}
