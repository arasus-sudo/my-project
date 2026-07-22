import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Check, X } from "lucide-react";

const CURRENCIES = ["USD", "EUR", "GBP", "INR"];
const SYM = { USD: "$", EUR: "€", GBP: "£", INR: "₹" };
const money = (n, cur = "USD") =>
  `${SYM[cur] || ""}${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const BLANK = { name: "", unit_price: "", currency: "USD", unit: "mo", description: "" };

export default function PricingCatalog() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(BLANK);
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);

  const load = () => api.get("/proposal-eq/pricing-catalog").then((r) => setItems(r.data));
  useEffect(() => { load(); }, []);

  const add = async (e) => {
    e.preventDefault();
    if (!form.name || form.unit_price === "") return;
    setBusy(true);
    try {
      await api.post("/proposal-eq/pricing-catalog", { ...form, unit_price: Number(form.unit_price) });
      setForm(BLANK);
      toast.success("Added");
      load();
    } finally { setBusy(false); }
  };

  const startEdit = (it) => {
    setEditId(it.id);
    setEditForm({ name: it.name, unit_price: it.unit_price, currency: it.currency || "USD",
      unit: it.unit || "", description: it.description || "" });
  };
  const saveEdit = async () => {
    await api.put(`/proposal-eq/pricing-catalog/${editId}`, { ...editForm, unit_price: Number(editForm.unit_price) });
    setEditId(null);
    toast.success("Updated");
    load();
  };
  const remove = async (id) => { await api.delete(`/proposal-eq/pricing-catalog/${id}`); load(); };

  return (
    <div>
      <PageHeader title="Pricing Catalog"
        subtitle="Structured line items Proposal EQ selects from — totals are always computed from these, never typed in by hand." />
      <div className="animate-fade-in px-6 sm:px-8 max-w-2xl space-y-6">
        <div className="border border-line bg-white rounded-2xl overflow-hidden">
          {items.length === 0 ? (
            <div className="p-6 text-body text-ink-muted text-center">No pricing items yet.</div>
          ) : items.map((it) => (
            <div key={it.id} className="p-3 border-b border-line last:border-0" data-testid={`pricing-row-${it.id}`}>
              {editId === it.id ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      className="border border-line px-2 py-1.5 rounded-full text-input" placeholder="Name" />
                    <div className="flex gap-1">
                      <input type="number" value={editForm.unit_price} onChange={(e) => setEditForm({ ...editForm, unit_price: e.target.value })}
                        className="border border-line px-2 py-1.5 rounded-full text-input w-full" placeholder="Price" />
                      <select value={editForm.currency} onChange={(e) => setEditForm({ ...editForm, currency: e.target.value })}
                        className="border border-line px-1 py-1.5 rounded-full text-input">
                        {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input value={editForm.unit} onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })}
                      className="border border-line px-2 py-1.5 rounded-full text-input" placeholder="Unit" />
                    <input value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                      className="border border-line px-2 py-1.5 rounded-full text-input" placeholder="Description" />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={saveEdit} data-testid="save-edit" className="btn-primary text-xs"><Check size={12} /> Save</button>
                    <button onClick={() => setEditId(null)} className="btn-ghost text-xs"><X size={12} /> Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="text-body font-medium">{it.name}</div>
                    {it.description && <div className="text-caption text-ink-muted truncate">{it.description}</div>}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-mono text-body tabular-nums">
                      {money(it.unit_price, it.currency)}{it.unit ? <span className="text-ink-muted">/{it.unit}</span> : ""}
                    </span>
                    <button onClick={() => startEdit(it)} data-testid={`edit-pricing-${it.id}`} className="text-ink-muted hover:text-ink"><Pencil size={14} /></button>
                    <button onClick={() => remove(it.id)} data-testid={`delete-pricing-${it.id}`} className="text-ink-muted hover:text-danger"><Trash2 size={14} /></button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <form onSubmit={add} className="shadow-card rounded-2xl p-6 sm:p-8 space-y-3">
          <div className="text-card-title font-display font-semibold">Add a pricing item</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input placeholder="Name (e.g. Implementation)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              data-testid="pricing-name" className="border border-line px-3 py-2 rounded-full text-input" />
            <div className="flex gap-1">
              <input type="number" min={0} step="0.01" placeholder="Price" value={form.unit_price}
                onChange={(e) => setForm({ ...form, unit_price: e.target.value })}
                data-testid="pricing-price" className="border border-line px-3 py-2 rounded-full text-input w-full" />
              <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}
                data-testid="pricing-currency" className="border border-line px-2 py-2 rounded-full text-input">
                {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input placeholder="Unit (mo, seat, project)" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}
              data-testid="pricing-unit" className="border border-line px-3 py-2 rounded-full text-input" />
            <input placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              data-testid="pricing-description" className="border border-line px-3 py-2 rounded-full text-input" />
          </div>
          <button type="submit" disabled={busy} data-testid="pricing-add-btn" className="btn-primary"><Plus size={14} /> Add</button>
        </form>
      </div>
    </div>
  );
}
