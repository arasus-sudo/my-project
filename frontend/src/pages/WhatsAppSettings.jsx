import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";

export default function WhatsAppSettings() {
  const [settings, setSettings] = useState({});

  useEffect(() => { api.get("/whatsapp-eq/settings").then((r) => setSettings(r.data || {})); }, []);

  const save = async () => {
    try {
      await api.post("/whatsapp-eq/settings", settings);
      toast.success("Settings saved");
    } catch { toast.error("Save failed"); }
  };

  return (
    <div>
      <PageHeader title="WhatsApp EQ Settings" subtitle="Configure WhatsApp Business messaging preferences." />
      <div className="animate-fade-in px-6 sm:px-8 max-w-2xl space-y-4">
        <div className="bg-white border border-line rounded-2xl p-6 space-y-4">
          <div className="text-card-title font-display font-semibold">Configuration</div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="ui-label">Business name</label>
              <input className="inp w-full" value={settings.business_name || ""} onChange={(e) => setSettings({ ...settings, business_name: e.target.value })} />
            </div>
            <div>
              <label className="ui-label">Max sends per minute</label>
              <input className="inp w-full" type="number" value={settings.max_sends_per_minute ?? 30} onChange={(e) => setSettings({ ...settings, max_sends_per_minute: parseInt(e.target.value) || 30 })} />
            </div>
          </div>
          <div>
            <label className="ui-label">24-hour session expiry (hours)</label>
            <input className="inp w-full" type="number" value={settings.session_expiry_hours ?? 24} onChange={(e) => setSettings({ ...settings, session_expiry_hours: parseInt(e.target.value) || 24 })} />
          </div>
          <div className="flex justify-end">
            <button onClick={save} className="btn-primary">Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}
