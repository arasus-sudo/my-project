import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Plus, ShieldOff } from "lucide-react";

export default function VoiceSettings() {
  const [usage, setUsage] = useState(null);
  const [numbers, setNumbers] = useState([]);
  const [newNumber, setNewNumber] = useState("");
  const [dncPhone, setDncPhone] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => {
    api.get("/voice-eq/analytics/usage").then((r) => setUsage(r.data));
    api.get("/voice-eq/numbers").then((r) => setNumbers(r.data));
  };
  useEffect(() => { load(); }, []);

  const importNumber = async (e) => {
    e.preventDefault();
    if (!newNumber.trim()) return;
    setBusy(true);
    try {
      await api.post("/voice-eq/numbers/import", { phone_number: newNumber.trim() });
      toast.success("Number imported");
      setNewNumber(""); load();
    } catch (err) { toast.error(err?.response?.data?.detail || "Import failed"); }
    finally { setBusy(false); }
  };

  const addDnc = async (e) => {
    e.preventDefault();
    if (!dncPhone.trim()) return;
    try {
      await api.post("/voice-eq/dnc", { phone: dncPhone.trim() });
      toast.success("Added to do-not-call list");
      setDncPhone("");
    } catch { toast.error("Failed to add"); }
  };

  return (
    <div>
      <PageHeader title="Voice EQ Settings" subtitle="Retell connection, phone numbers, usage, and compliance." />
      <div className="p-6 max-w-3xl space-y-6">
        <div className="card-flat p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-display font-semibold">Retell connection</div>
              <p className="text-xs text-neutral-500 mt-1">
                {usage?.mocked
                  ? "Test mode — calls run against a simulator. Connect your Retell account and a phone number to place live calls."
                  : "Connected — calls are placed through your Retell account."}
              </p>
            </div>
            <span className={`ui-label px-2 py-1 border ${usage?.mocked ? "text-amber-700 border-amber-500" : "text-green-700 border-green-700"}`}>
              {usage?.mocked ? "Test mode" : "Live"}
            </span>
          </div>
        </div>

        <div className="card-flat p-5 space-y-3">
          <div className="font-display font-semibold">Usage</div>
          {usage ? (
            <div className="grid grid-cols-3 gap-4">
              <Stat label="Total calls" value={usage.total_calls} />
              <Stat label="Minutes used" value={usage.total_minutes} />
              <Stat label="Est. cost" value={`$${(usage.total_cost_cents / 100).toFixed(2)}`} />
            </div>
          ) : <div className="text-sm text-neutral-500">Loading…</div>}
        </div>

        <div className="card-flat p-5 space-y-3">
          <div className="font-display font-semibold">Phone numbers</div>
          {numbers.length === 0 ? (
            <p className="text-sm text-neutral-500">No numbers connected yet — import a number to place calls from your own caller ID.</p>
          ) : (
            <div className="space-y-1">
              {numbers.map((n) => (
                <div key={n.id} className="text-sm font-mono flex justify-between border-b border-line py-1.5 last:border-0">
                  <span>{n.phone_number}</span>
                  <span className="text-neutral-400">{n.nickname}</span>
                </div>
              ))}
            </div>
          )}
          <form onSubmit={importNumber} className="flex gap-2">
            <input value={newNumber} onChange={(e) => setNewNumber(e.target.value)} placeholder="+14155551234"
              data-testid="import-number-input" className="flex-1 border border-line px-3 py-2 rounded-sm text-sm" />
            <button type="submit" disabled={busy} data-testid="import-number-btn" className="btn-secondary"><Plus size={14} /> Import</button>
          </form>
        </div>

        <div className="card-flat p-5 space-y-3">
          <div className="flex items-center gap-2 font-display font-semibold"><ShieldOff size={16} /> Do-not-call list</div>
          <p className="text-xs text-neutral-500">Numbers here are skipped by click-to-call and campaign launches.</p>
          <form onSubmit={addDnc} className="flex gap-2">
            <input value={dncPhone} onChange={(e) => setDncPhone(e.target.value)} placeholder="+14155551234"
              data-testid="dnc-phone-input" className="flex-1 border border-line px-3 py-2 rounded-sm text-sm" />
            <button type="submit" data-testid="dnc-add-btn" className="btn-secondary">Add</button>
          </form>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <div className="ui-label text-neutral-500">{label}</div>
      <div className="font-display text-xl font-bold">{value}</div>
    </div>
  );
}
