import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

export default function PricingCatalog() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ name: "", price: "", unit: "mo", description: "" });
  const [busy, setBusy] = useState(false);

  const load = () => api.get("/proposal-eq/pricing-catalog").then((r) => setItems(r.data));
  useEffect(() => { load(); }, []);

  const add = async (e) => {
    e.preventDefault();
    if (!form.name || !form.price) return;
    setBusy(true);
    try {
      await api.post("/proposal-eq/pricing-catalog", form);
      setForm({ name: "", price: "", unit: "mo", description: "" });
      toast.success("Added");
      load();
    } finally { setBusy(false); }
  };
  const remove = async (id) => {
    await api.delete(`/proposal-eq/pricing-catalog/${id}`);
    load();
  };

  return (
    <div>
      <PageHeader title="Pricing Catalog" subtitle="Line items Proposal EQ references when drafting a pricing slide." />
      <div className="p-6 max-w-2xl space-y-6">
        <div className="border border-line bg-white">
          {items.length === 0 ? (
            <div className="p-6 text-sm text-neutral-500 text-center">No pricing items yet.</div>
          ) : items.map((it) => (
            <div key={it.id} className="flex items-center justify-between p-3 border-b border-line last:border-0">
              <div>
                <div className="text-sm font-medium">{it.name}</div>
                <div className="text-xs text-neutral-500">{it.description}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm">{it.price}{it.unit ? `/${it.unit}` : ""}</span>
                <button onClick={() => remove(it.id)} data-testid={`delete-pricing-${it.id}`} className="text-neutral-400 hover:text-red-600"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>

        <form onSubmit={add} className="card-flat p-5 space-y-3">
          <div className="font-display font-semibold text-sm">Add a pricing item</div>
          <div className="grid grid-cols-2 gap-3">
            <input placeholder="Name (e.g. Growth plan)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              data-testid="pricing-name" className="border border-line px-3 py-2 rounded-sm" />
            <input placeholder="Price (e.g. $1,499)" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })}
              data-testid="pricing-price" className="border border-line px-3 py-2 rounded-sm" />
          </div>
          <input placeholder="Unit (e.g. mo, seat, project)" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}
            data-testid="pricing-unit" className="w-full border border-line px-3 py-2 rounded-sm" />
          <input placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
            data-testid="pricing-description" className="w-full border border-line px-3 py-2 rounded-sm" />
          <button type="submit" disabled={busy} data-testid="pricing-add-btn" className="btn-primary"><Plus size={14} /> Add</button>
        </form>
      </div>
    </div>
  );
}
