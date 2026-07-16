import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Link2, Unlink, Linkedin, Instagram, Youtube } from "lucide-react";

const PLATFORM_META = {
  linkedin: { label: "LinkedIn", icon: Linkedin },
  instagram: { label: "Instagram", icon: Instagram },
  youtube: { label: "YouTube", icon: Youtube },
};

export default function SocialSettings() {
  const [integrations, setIntegrations] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => api.get("/social-eq/integrations").then((r) => { setIntegrations(r.data); setLoading(false); });
  useEffect(() => { load(); }, []);

  const connect = async (provider) => {
    await api.post(`/social-eq/integrations/${provider}/connect`);
    toast.success(`${PLATFORM_META[provider].label} connected`);
    load();
  };
  const disconnect = async (provider) => {
    await api.post(`/social-eq/integrations/${provider}/disconnect`);
    toast.success("Disconnected");
    load();
  };

  if (loading) return <div className="animate-fade-in p-6 sm:p-8 text-neutral-400 text-sm">Loading…</div>;

  return (
    <div>
      <PageHeader title="Social EQ Settings" subtitle="Connect the platforms you publish to. Posts run in test mode until a platform is connected." />
      <div className="animate-fade-in px-6 sm:px-8 max-w-2xl space-y-4">
        {integrations.map((i) => {
          const meta = PLATFORM_META[i.provider];
          const Icon = meta.icon;
          return (
            <div key={i.provider} className="shadow-card p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl">
              <div className="flex items-center gap-3">
                <Icon size={20} />
                <div>
                  <div className="font-display font-semibold">{meta.label}</div>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    {i.connected ? `Connected as ${i.account_name}. Approved posts publish to this account.` : "Not connected."}
                  </p>
                </div>
              </div>
              {i.connected ? (
                <button onClick={() => disconnect(i.provider)} data-testid={`disconnect-${i.provider}`} className="btn-secondary"><Unlink size={14} /> Disconnect</button>
              ) : (
                <button onClick={() => connect(i.provider)} data-testid={`connect-${i.provider}`} className="btn-primary"><Link2 size={14} /> Connect</button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
