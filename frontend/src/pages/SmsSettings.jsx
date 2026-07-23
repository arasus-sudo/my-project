import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";

export default function SmsSettings() {
  const [settings, setSettings] = useState({});

  useEffect(() => { api.get("/sms-eq/settings").then((r) => setSettings(r.data || {})); }, []);

  const save = async () => {
    try {
      await api.post("/sms-eq/settings", settings);
      toast.success("Settings saved");
    } catch { toast.error("Save failed"); }
  };

  return (
    <div>
      <PageHeader title="SMS EQ Settings" subtitle="Configure SMS sending preferences." />
      <div className="animate-fade-in px-6 sm:px-8 max-w-2xl space-y-4">
        <div className="bg-white border border-line rounded-2xl p-6 space-y-4">
          <div className="text-card-title font-display font-semibold">Configuration</div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="ui-label">Default sender name</label>
              <input className="inp w-full" value={settings.default_sender_name || ""} onChange={(e) => setSettings({ ...settings, default_sender_name: e.target.value })} />
            </div>
            <div>
              <label className="ui-label">Max sends per minute</label>
              <input className="inp w-full" type="number" value={settings.max_sends_per_minute ?? 30} onChange={(e) => setSettings({ ...settings, max_sends_per_minute: parseInt(e.target.value) || 30 })} />
            </div>
          </div>
          <div>
            <label className="ui-label">Auto-reply message (when STOP keywords are sent)</label>
            <textarea className="inp w-full h-20" value={settings.auto_reply_text || ""} onChange={(e) => setSettings({ ...settings, auto_reply_text: e.target.value })} />
          </div>
          <div className="flex justify-end">
            <button onClick={save} className="btn-primary">Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}
