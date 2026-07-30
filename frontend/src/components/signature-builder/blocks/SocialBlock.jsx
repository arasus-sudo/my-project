import { Linkedin, Twitter, Facebook, Instagram, Youtube, Github, Link2, Trash2 } from "lucide-react";

export const SOCIAL_NETWORKS = {
  linkedin: { label: "LinkedIn", icon: Linkedin },
  twitter: { label: "X / Twitter", icon: Twitter },
  facebook: { label: "Facebook", icon: Facebook },
  instagram: { label: "Instagram", icon: Instagram },
  youtube: { label: "YouTube", icon: Youtube },
  github: { label: "GitHub", icon: Github },
  custom: { label: "Custom", icon: Link2 },
};

export default function SocialBlock({ data, onChange }) {
  const items = data.items || [];

  const setItems = (next) => onChange({ ...data, items: next });
  const has = (network) => items.some((i) => i.network === network);
  const toggle = (network) => {
    if (has(network)) setItems(items.filter((i) => i.network !== network));
    else setItems([...items, { id: `s_${Date.now()}`, network, url: "", label: "" }]);
  };
  const update = (id, patch) => setItems(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const remove = (id) => setItems(items.filter((i) => i.id !== id));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-7 gap-1.5">
        {Object.entries(SOCIAL_NETWORKS).map(([key, n]) => {
          const Icon = n.icon;
          const active = has(key);
          return (
            <button key={key} onClick={() => toggle(key)} title={n.label}
              className={`aspect-square rounded-lg border flex items-center justify-center transition-colors ${
                active ? "border-ink bg-ash" : "border-line hover:border-ink/40"
              }`}>
              <Icon size={14} />
            </button>
          );
        })}
      </div>
      {items.length > 0 && (
        <div className="space-y-1.5">
          {items.map((i) => {
            const Icon = SOCIAL_NETWORKS[i.network]?.icon || Link2;
            return (
              <div key={i.id} className="flex items-center gap-1.5">
                <Icon size={14} className="text-ink-muted shrink-0" />
                {i.network === "custom" && (
                  <input value={i.label || ""} onChange={(e) => update(i.id, { label: e.target.value })}
                    placeholder="Label" className="w-20 border border-line rounded-lg px-2 py-1.5 text-caption" />
                )}
                <input value={i.url} onChange={(e) => update(i.id, { url: e.target.value })}
                  placeholder={`${SOCIAL_NETWORKS[i.network]?.label || "Link"} URL`}
                  className="flex-1 border border-line rounded-lg px-2 py-1.5 text-caption" />
                <button onClick={() => remove(i.id)} className="p-1 text-ink-muted hover:text-danger shrink-0"><Trash2 size={12} /></button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
