import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Plus, RefreshCw } from "lucide-react";

export default function Mailboxes() {
  const [items, setItems] = useState([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ email: "", provider: "gmail", display_name: "", daily_cap: 50 });

  const load = () => api.get("/mailboxes").then((r) => setItems(r.data));
  useEffect(() => { load(); }, []);

  const add = async (e) => {
    e.preventDefault();
    try {
      await api.post("/mailboxes", form);
      toast.success("Mailbox connected");
      setModal(false); setForm({ email: "", provider: "gmail", display_name: "", daily_cap: 50 });
      load();
    } catch (err) { toast.error(err?.response?.data?.detail || "Failed"); }
  };

  const dnsCheck = async (id) => {
    try { await api.post(`/mailboxes/${id}/dns-check`); toast.success("DNS re-checked"); load(); }
    catch { toast.error("DNS check failed"); }
  };
  const toggleWarmup = async (id) => {
    await api.post(`/mailboxes/${id}/warmup`);
    load();
  };

  return (
    <div>
      <PageHeader
        title="Mailboxes"
        subtitle="Deliverability starts here. Connect, warm up, and check auth."
        right={<button onClick={() => setModal(true)} data-testid="add-mailbox-btn" className="btn-primary"><Plus size={14} /> Connect mailbox</button>}
      />
      <div className="p-6 grid md:grid-cols-2 gap-6">
        {items.length === 0 && (
          <div className="col-span-2 card-flat p-10 text-center">
            <div className="font-display text-xl font-bold">No mailboxes connected</div>
            <p className="text-sm text-neutral-500 mt-2">Add a sending address. For MVP we simulate the OAuth flow.</p>
          </div>
        )}
        {items.map((m) => (
          <div key={m.id} className="card-flat p-6">
            <div className="flex items-start justify-between">
              <div>
                <div className="ui-label">{m.provider}</div>
                <div className="font-display font-bold text-lg mt-1">{m.email}</div>
                <div className="text-xs text-neutral-500 font-mono mt-0.5">{m.display_name || "—"}</div>
              </div>
              <span className={`ui-label px-2 py-1 border ${m.status === "connected" ? "text-green-700 border-green-700" : "text-red-700 border-red-700"}`}>
                {m.status}
              </span>
            </div>

            <div className="mt-6 ui-label mb-2">DNS auth</div>
            <div className="grid grid-cols-4 gap-2 text-xs">
              {["spf", "dkim", "dmarc", "tracking_domain"].map((k) => (
                <div key={k} className={`border p-2 text-center ${m.dns?.[k] ? "border-green-700 text-green-800" : "border-red-500 text-red-700"}`}>
                  <div className="font-mono uppercase text-[10px]">{k.replace("_", " ")}</div>
                  {m.dns?.[k] ? <CheckCircle2 size={16} className="inline mt-1" /> : <XCircle size={16} className="inline mt-1" />}
                </div>
              ))}
            </div>
            <button onClick={() => dnsCheck(m.id)} data-testid={`dns-check-${m.id}`} className="btn-ghost text-xs mt-2"><RefreshCw size={12} /> Re-check DNS</button>

            <div className="mt-6 grid grid-cols-3 gap-4 border-t border-line pt-4">
              <div>
                <div className="ui-label">Warmup</div>
                <div className="font-mono text-lg font-bold">{m.warmup_day}/{m.warmup_target}</div>
                <button onClick={() => toggleWarmup(m.id)} data-testid={`warmup-${m.id}`} className="text-[11px] mt-1 text-sanguine hover:underline">
                  {m.warmup_enabled ? "pause" : "resume"}
                </button>
              </div>
              <div>
                <div className="ui-label">Daily cap</div>
                <div className="font-mono text-lg font-bold">{m.sent_today}/{m.daily_cap}</div>
              </div>
              <div>
                <div className="ui-label">Bounce</div>
                <div className="font-mono text-lg font-bold">{m.bounce_rate}%</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50">
          <form onSubmit={add} className="bg-white border border-line p-6 rounded-sm w-full max-w-md space-y-3">
            <div className="font-display font-bold text-xl">Connect mailbox</div>
            <label className="block">
              <span className="ui-label">Provider</span>
              <select value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })}
                data-testid="mailbox-provider"
                className="mt-1 w-full border border-line px-3 py-2 rounded-sm">
                <option value="gmail">Google Workspace</option>
                <option value="m365">Microsoft 365</option>
                <option value="smtp">SMTP</option>
              </select>
            </label>
            <label className="block">
              <span className="ui-label">Email</span>
              <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                data-testid="mailbox-email" className="mt-1 w-full border border-line px-3 py-2 rounded-sm" />
            </label>
            <label className="block">
              <span className="ui-label">Display name</span>
              <input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                data-testid="mailbox-display" className="mt-1 w-full border border-line px-3 py-2 rounded-sm" />
            </label>
            <label className="block">
              <span className="ui-label">Daily cap</span>
              <input type="number" min={10} max={500} value={form.daily_cap} onChange={(e) => setForm({ ...form, daily_cap: Number(e.target.value) })}
                data-testid="mailbox-cap" className="mt-1 w-full border border-line px-3 py-2 rounded-sm" />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setModal(false)} className="btn-secondary">Cancel</button>
              <button type="submit" data-testid="save-mailbox" className="btn-primary">Connect</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
