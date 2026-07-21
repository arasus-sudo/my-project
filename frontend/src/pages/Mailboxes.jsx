import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import {
  CheckCircle2, XCircle, Plus, RefreshCw, Link2, Trash2, AlertTriangle, ShieldCheck,
} from "lucide-react";

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
        right={<button onClick={() => setModal(true)} data-testid="add-mailbox-btn" className="btn-primary"><Plus size={14} /> Connect mailbox</button>}
      />

      <div className="animate-fade-in px-6 sm:px-8 pt-6">
        <div className="shadow-card p-4 flex items-start gap-2.5 text-caption text-ink-muted rounded-2xl">
          <ShieldCheck size={15} className="text-ink-muted mt-0.5 shrink-0" />
          <p>
            Outbound is sent through your connected Google or Microsoft mailbox, never a
            transactional provider — cold email through one of those violates their terms and gets
            your sending domain blocked. Warmup and per-mailbox daily caps are what keep you out of
            the spam folder.
          </p>
        </div>
      </div>

      <div className="px-6 sm:px-8 pb-6 grid md:grid-cols-2 gap-6">
        {items.length === 0 && (
          <div className="col-span-2 shadow-card p-10 text-center rounded-2xl">
            <div className="text-section font-display font-semibold">No mailboxes connected</div>
            <p className="text-body text-ink-muted mt-2">
              Campaigns can't launch without one — there'd be nothing to send from.
            </p>
          </div>
        )}

        {items.map((m) => {
          const connected = m.status === "connected";
          const mocked = m.mocked;
          const cap = m.daily_cap || 50;
          return (
            <div key={m.id} className="shadow-card p-6 rounded-2xl" data-testid={`mailbox-${m.id}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="ui-label">{m.provider}</div>
                  <div className="text-card-title font-display font-semibold mt-1 truncate">{m.email}</div>
                  <div className="text-tiny text-ink-muted font-mono mt-0.5">{m.display_name || "—"}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    data-testid={`mailbox-status-${m.id}`}
                    className={`ui-label px-2 py-1 rounded-xl border ${
                      !connected ? "text-danger border-danger/30 bg-danger/10"
                        : mocked ? "text-ink-muted border-line bg-bone"
                        : "text-success border-success/30 bg-success/10"
                    }`}
                  >
                    {!connected ? "not connected" : mocked ? "test mode" : "sending"}
                  </span>
                  <button onClick={() => deleteMailbox(m.id, m.email)} data-testid={`delete-${m.id}`}
                    className="p-1.5 text-ink-muted hover:text-danger hover:bg-danger/10 rounded-xl transition-colors" title="Remove mailbox">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {!connected && (
                <button onClick={() => connect(m.id)} data-testid={`connect-${m.id}`}
                  className="btn-primary text-xs w-full justify-center mt-4">
                  <Link2 size={13} /> Authorise sending
                </button>
              )}
              {connected && mocked && (
                <div className="mt-3 text-tiny text-ink-muted bg-bone border border-line rounded-lg px-2.5 py-1.5">
                  Queueing and drafting work, but no mail actually leaves the box until a Google or
                  Microsoft OAuth app is configured.
                </div>
              )}

              <div className="mt-6 ui-label mb-2">Domain authentication</div>
              {!m.dns?.checked ? (
                <div className="flex items-center gap-2 text-caption text-ink-muted border border-line rounded-2xl px-3 py-2">
                  <AlertTriangle size={13} className="text-warning" />
                  Not checked yet — we won't guess. Run a check to see the real records.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-caption">
                  {["spf", "dkim", "dmarc"].map((k) => (
                    <div key={k} title={DNS_HELP[k]}
                      data-testid={`dns-${k}-${m.id}`}
                      className={`border rounded-2xl p-2 text-center ${
                        m.dns?.[k] ? "border-success/30 bg-success/10 text-success"
                                    : "border-danger/30 bg-danger/10 text-danger"
                      }`}>
                      <div className="font-mono uppercase text-tiny">{k}</div>
                      {m.dns?.[k] ? <CheckCircle2 size={15} className="inline mt-1" />
                                   : <XCircle size={15} className="inline mt-1" />}
                    </div>
                  ))}
                </div>
              )}
              {m.dns?.dmarc_policy && (
                <div className="text-tiny text-ink-muted font-mono mt-1.5">
                  DMARC policy: p={m.dns.dmarc_policy}
                </div>
              )}
              <button onClick={() => dnsCheck(m.id)} data-testid={`dns-check-${m.id}`}
                className="btn-ghost text-xs mt-2">
                <RefreshCw size={12} /> {m.dns?.checked ? "Re-check DNS" : "Check DNS"}
              </button>

              <div className="mt-6 grid grid-cols-2 gap-4 border-t border-line pt-4">
                <div>
                  <div className="ui-label">Warmup</div>
                  <div className="font-mono text-lg font-bold">
                    {m.warmup_enabled ? `day ${m.warmup_day}` : "off"}
                  </div>
                  <button onClick={() => toggleWarmup(m.id)} data-testid={`warmup-${m.id}`}
                    className="text-tiny mt-1 text-ink hover:underline">
                    {m.warmup_enabled ? "pause" : "resume"}
                  </button>
                  {m.warmup_enabled && (
                    <div className="text-tiny text-ink-muted mt-1 leading-tight">
                      caps sends at {Math.min(cap, 5 + (m.warmup_day || 1) * 5)}/day while ramping
                    </div>
                  )}
                </div>
                <div>
                  <div className="ui-label">Sent today</div>
                  <div className="font-mono text-lg font-bold">{m.sent_today || 0}/{cap}</div>
                  <div className="h-1 mt-1.5 bg-neutral-100 rounded-full overflow-hidden">
                    <div className="h-full bg-accent rounded-full"
                      style={{ width: `${Math.min(100, ((m.sent_today || 0) / cap) * 100)}%` }} />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50 p-4"
          onClick={(e) => e.target === e.currentTarget && setModal(false)}>
          <form onSubmit={add} className="bg-white border border-line p-6 rounded-2xl w-full max-w-md space-y-3">
            <div className="text-section font-display font-semibold">Connect mailbox</div>
            <p className="text-caption text-ink-muted">
              You'll be sent to your provider to authorise sending. Nothing can go out until you do.
            </p>
            <label className="block">
              <span className="form-label">Provider</span>
              <select value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })}
                data-testid="mailbox-provider"
                className="mt-1 w-full border border-line px-3 py-2 rounded-xl">
                <option value="gmail">Google Workspace / Gmail</option>
                <option value="m365">Microsoft 365 / Outlook</option>
              </select>
            </label>
            <label className="block">
              <span className="form-label">Email</span>
              <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                data-testid="mailbox-email" className="mt-1 w-full border border-line px-3 py-2 rounded-xl" />
            </label>
            <label className="block">
              <span className="form-label">Display name</span>
              <input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                data-testid="mailbox-display" className="mt-1 w-full border border-line px-3 py-2 rounded-xl" />
            </label>
            <label className="block">
              <span className="form-label">Daily cap</span>
              <input type="number" min={10} max={500} value={form.daily_cap}
                onChange={(e) => setForm({ ...form, daily_cap: Number(e.target.value) })}
                data-testid="mailbox-cap" className="mt-1 w-full border border-line px-3 py-2 rounded-xl" />
              <span className="text-tiny text-ink-muted">
                50/day is a safe ceiling for a warmed mailbox. More than that and you're gambling.
              </span>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setModal(false)} className="btn-secondary">Cancel</button>
              <button type="submit" data-testid="save-mailbox" className="btn-primary">Continue</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
