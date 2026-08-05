import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Check } from "../icons";
import Card from "../components/composites/Card";
import Input from "../components/primitives/Input";
import Button from "../components/primitives/Button";

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
      <div className="animate-fade-in px-6 sm:px-8 py-6 max-w-2xl space-y-4">
        <Card title="Configuration">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input label="Default sender name" value={settings.default_sender_name || ""} onChange={(e) => setSettings({ ...settings, default_sender_name: e.target.value })} />
              <Input type="number" label="Max sends per minute" value={settings.max_sends_per_minute ?? 30} onChange={(e) => setSettings({ ...settings, max_sends_per_minute: parseInt(e.target.value) || 30 })} />
            </div>
            <Input as="textarea" rows={3} label="Auto-reply message" hint="Sent when STOP keywords are received" value={settings.auto_reply_text || ""} onChange={(e) => setSettings({ ...settings, auto_reply_text: e.target.value })} />
            <div className="flex justify-end">
              <Button variant="primary" icon={Check} onClick={save}>Save</Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
