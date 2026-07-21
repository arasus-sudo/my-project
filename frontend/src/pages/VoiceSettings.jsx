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
      <PageHeader title="Voice EQ Settings" subtitle="Twilio + OpenAI connection, phone numbers, usage, and compliance." />
      <div className="animate-fade-in px-6 sm:px-8 max-w-3xl space-y-6">
        <div className="shadow-card rounded-2xl p-6 sm:p-8">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-card-title font-display font-semibold">Twilio + OpenAI Realtime</div>
              <p className="text-caption text-ink-muted mt-1">
                {usage?.mocked
                  ? "Test mode — calls run against a simulator. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, OPENAI_API_KEY, and a Twilio number to place live calls."
                  : "Live — calls are placed through your Twilio account, answered by an OpenAI Realtime voice."}
              </p>
            </div>
            <span className={`ui-label px-2 py-1 border ${usage?.mocked ? "text-warning border-warning" : "text-success border-success"}`}>
              {usage?.mocked ? "Test mode" : "Live"}
            </span>
          </div>
        </div>

        <div className="shadow-card rounded-2xl p-6 sm:p-8 space-y-3">
          <div className="text-card-title font-display font-semibold">Usage</div>
          {usage ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Stat label="Total calls" value={usage.total_calls} />
              <Stat label="Minutes used" value={usage.total_minutes} />
              <Stat label="Est. cost" value={`$${(usage.total_cost_cents / 100).toFixed(2)}`} />
            </div>
          ) : <div className="text-body text-ink-muted">Loading…</div>}
        </div>

        <div className="shadow-card rounded-2xl p-6 sm:p-8 space-y-3">
          <div className="text-card-title font-display font-semibold">Phone numbers</div>
          {numbers.length === 0 ? (
            <p className="text-body text-ink-muted">No numbers connected yet — import a number to place calls from your own caller ID.</p>
          ) : (
            <div className="space-y-1">
              {numbers.map((n) => (
                <div key={n.id} className="text-body font-mono flex items-center justify-between border-b border-line py-1.5 last:border-0">
                  <span>{n.phone_number}</span>
                  <span className="text-ink-muted">{n.nickname}</span>
                </div>
              ))}
            </div>
          )}
          <form onSubmit={importNumber} className="flex flex-col sm:flex-row gap-2">
            <input value={newNumber} onChange={(e) => setNewNumber(e.target.value)} placeholder="+14155551234"
              className="flex-1 border border-line px-3 py-2 rounded-sm text-input" />
            <button type="submit" disabled={busy} className="btn-secondary"><Plus size={14} /> Import</button>
          </form>
        </div>

        <div className="shadow-card rounded-2xl p-6 sm:p-8 space-y-3">
          <div className="flex items-center gap-2 text-card-title font-display font-semibold"><ShieldOff size={16} /> Do-not-call list</div>
          <p className="text-caption text-ink-muted mt-1">Numbers here are skipped by click-to-call and campaign launches.</p>
          <form onSubmit={addDnc} className="flex flex-col sm:flex-row gap-2">
            <input value={dncPhone} onChange={(e) => setDncPhone(e.target.value)} placeholder="+14155551234"
              className="flex-1 border border-line px-3 py-2 rounded-sm text-input" />
            <button type="submit" className="btn-secondary">Add</button>
          </form>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <div className="ui-label">{label}</div>
      <div className="text-page-title font-display font-semibold">{value}</div>
    </div>
  );
}
