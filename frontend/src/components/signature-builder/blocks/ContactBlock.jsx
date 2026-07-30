import { Mail, Phone, Smartphone, MessageCircle, Globe, Link2, Plus, Trash2, ChevronUp, ChevronDown } from "lucide-react";

export const CONTACT_KINDS = [
  { kind: "email", label: "Email", icon: Mail },
  { kind: "phone", label: "Phone", icon: Phone },
  { kind: "mobile", label: "Mobile", icon: Smartphone },
  { kind: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { kind: "website", label: "Website", icon: Globe },
  { kind: "custom", label: "Custom", icon: Link2 },
];

const iconFor = (kind) => (CONTACT_KINDS.find((k) => k.kind === kind) || CONTACT_KINDS[0]).icon;

export default function ContactBlock({ data, onChange }) {
  const rows = data.rows || [];

  const setRows = (next) => onChange({ ...data, rows: next });
  const updateRow = (id, patch) => setRows(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const removeRow = (id) => setRows(rows.filter((r) => r.id !== id));
  const addRow = () => setRows([...rows, { id: `c_${Date.now()}`, kind: "email", label: "", value: "", link: "" }]);
  const move = (idx, dir) => {
    const next = [...rows];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setRows(next);
  };

  return (
    <div className="space-y-2">
      {rows.map((r, idx) => {
        const Icon = iconFor(r.kind);
        return (
          <div key={r.id} className="flex items-center gap-1.5">
            <Icon size={14} className="text-ink-muted shrink-0" />
            <select value={r.kind} onChange={(e) => updateRow(r.id, { kind: e.target.value })}
              className="border border-line rounded-lg px-1.5 py-1.5 text-caption shrink-0">
              {CONTACT_KINDS.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}
            </select>
            <input value={r.value} onChange={(e) => updateRow(r.id, { value: e.target.value })}
              placeholder="Value (email, number, url…)" className="flex-1 min-w-0 border border-line rounded-lg px-2 py-1.5 text-caption" />
            {r.kind === "custom" && (
              <input value={r.link || ""} onChange={(e) => updateRow(r.id, { link: e.target.value })}
                placeholder="Link (optional)" className="w-28 border border-line rounded-lg px-2 py-1.5 text-caption" />
            )}
            <div className="flex items-center shrink-0">
              <button onClick={() => move(idx, -1)} disabled={idx === 0} className="p-1 text-ink-muted hover:text-ink disabled:opacity-20"><ChevronUp size={12} /></button>
              <button onClick={() => move(idx, 1)} disabled={idx === rows.length - 1} className="p-1 text-ink-muted hover:text-ink disabled:opacity-20"><ChevronDown size={12} /></button>
              <button onClick={() => removeRow(r.id)} className="p-1 text-ink-muted hover:text-danger"><Trash2 size={12} /></button>
            </div>
          </div>
        );
      })}
      <button onClick={addRow} className="btn-secondary text-caption" data-testid="sig-contact-add">
        <Plus size={12} /> Add contact row
      </button>
    </div>
  );
}
