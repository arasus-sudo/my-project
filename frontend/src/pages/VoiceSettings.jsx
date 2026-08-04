import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Plus, Lock } from "../icons";
import Card from "../components/composites/Card";
import Button from "../components/primitives/Button";
import Input from "../components/primitives/Input";
import StatusPill from "../components/primitives/StatusPill";

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
      <div className="animate-fade-in px-6 sm:px-8 py-6 max-w-3xl space-y-4">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>Twilio + OpenAI Realtime</div>
              <p style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginTop: 4 }}>
                {usage?.mocked
                  ? "Test mode — calls run against a simulator. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, OPENAI_API_KEY, and a Twilio number to place live calls."
                  : "Live — calls are placed through your Twilio account, answered by an OpenAI Realtime voice."}
              </p>
            </div>
            <StatusPill status={usage?.mocked ? "Test mode" : "Live"} tone={usage?.mocked ? "warning" : "success"} />
          </div>
        </Card>

        <Card title="Usage">
          {usage ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Stat label="Total calls" value={usage.total_calls} />
              <Stat label="Minutes used" value={usage.total_minutes} />
              <Stat label="Est. cost" value={`$${(usage.total_cost_cents / 100).toFixed(2)}`} />
            </div>
          ) : <div style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Loading…</div>}
        </Card>

        <Card title="Phone numbers">
          {numbers.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>No numbers connected yet — import a number to place calls from your own caller ID.</p>
          ) : (
            <div className="space-y-0">
              {numbers.map((n, i) => (
                <div key={n.id} className="tnum flex items-center justify-between"
                  style={{ padding: "8px 0", borderTop: i > 0 ? "1px solid var(--border-subtle)" : "none", fontSize: 13, fontFamily: "var(--font-mono)" }}>
                  <span style={{ color: "var(--text-primary)" }}>{n.phone_number}</span>
                  <span style={{ color: "var(--text-tertiary)" }}>{n.nickname}</span>
                </div>
              ))}
            </div>
          )}
          <form onSubmit={importNumber} className="flex flex-col sm:flex-row gap-2" style={{ marginTop: 12 }}>
            <Input value={newNumber} onChange={(e) => setNewNumber(e.target.value)} placeholder="+14155551234" className="flex-1" />
            <Button type="submit" variant="secondary" icon={Plus} isLoading={busy}>Import</Button>
          </form>
        </Card>

        <Card>
          <div className="flex items-center gap-2" style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>
            <Lock size={16} strokeWidth={1.5} aria-hidden="true" /> Do-not-call list
          </div>
          <p style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginTop: 4, marginBottom: 12 }}>Numbers here are skipped by click-to-call and campaign launches.</p>
          <form onSubmit={addDnc} className="flex flex-col sm:flex-row gap-2">
            <Input value={dncPhone} onChange={(e) => setDncPhone(e.target.value)} placeholder="+14155551234" className="flex-1" />
            <Button type="submit" variant="secondary">Add</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
      <div className="tnum" style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-display)", marginTop: 4 }}>{value}</div>
    </div>
  );
}
