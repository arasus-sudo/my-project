import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Check, X } from "../icons";
import Card from "../components/composites/Card";
import Input from "../components/primitives/Input";
import Select from "../components/primitives/Select";
import Button from "../components/primitives/Button";

const CURRENCIES = ["USD", "EUR", "GBP", "INR"];
const SYM = { USD: "$", EUR: "€", GBP: "£", INR: "₹" };
const money = (n, cur = "USD") =>
  `${SYM[cur] || ""}${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const BLANK = { name: "", unit_price: "", currency: "USD", unit: "mo", description: "" };
const CURRENCY_OPTIONS = CURRENCIES.map((c) => ({ value: c, label: c }));

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
      <div className="animate-fade-in px-6 sm:px-8 py-6 max-w-2xl space-y-4">
        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-xl)", boxShadow: "var(--shadow-xs)", overflow: "hidden" }}>
          {items.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: "var(--text-tertiary)" }}>No pricing items yet.</div>
          ) : items.map((it, i) => (
            <div key={it.id} data-testid={`pricing-row-${it.id}`}
              style={{ padding: 12, borderBottom: i < items.length - 1 ? "1px solid var(--border-subtle)" : "none" }}>
              {editId === it.id ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <Input size="sm" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} placeholder="Name" />
                    <div className="flex gap-1">
                      <Input size="sm" type="number" value={editForm.unit_price} onChange={(e) => setEditForm({ ...editForm, unit_price: e.target.value })} placeholder="Price" className="flex-1" />
                      <Select size="sm" value={editForm.currency} onChange={(v) => setEditForm({ ...editForm, currency: v })} options={CURRENCY_OPTIONS} className="w-24" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <Input size="sm" value={editForm.unit} onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })} placeholder="Unit" />
                    <Input size="sm" value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} placeholder="Description" />
                  </div>
                  <div className="flex gap-2">
                    <Button variant="primary" size="sm" icon={Check} onClick={saveEdit} data-testid="save-edit">Save</Button>
                    <Button variant="tertiary" size="sm" icon={X} onClick={() => setEditId(null)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>{it.name}</div>
                    {it.description && <div className="truncate" style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{it.description}</div>}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="tnum" style={{ fontSize: 13, fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>
                      {money(it.unit_price, it.currency)}{it.unit ? <span style={{ color: "var(--text-tertiary)" }}>/{it.unit}</span> : ""}
                    </span>
                    <button onClick={() => startEdit(it)} data-testid={`edit-pricing-${it.id}`} style={{ color: "var(--text-tertiary)" }}>
                      <Pencil size={14} strokeWidth={1.5} aria-hidden="true" />
                    </button>
                    <button onClick={() => remove(it.id)} data-testid={`delete-pricing-${it.id}`} style={{ color: "var(--text-tertiary)" }}>
                      <Trash2 size={14} strokeWidth={1.5} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <Card title="Add a pricing item">
          <form onSubmit={add} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input placeholder="Name (e.g. Implementation)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="pricing-name" />
              <div className="flex gap-1">
                <Input type="number" min={0} step="0.01" placeholder="Price" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: e.target.value })}
                  data-testid="pricing-price" className="flex-1" />
                <Select value={form.currency} onChange={(v) => setForm({ ...form, currency: v })} options={CURRENCY_OPTIONS} data-testid="pricing-currency" className="w-24" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input placeholder="Unit (mo, seat, project)" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} data-testid="pricing-unit" />
              <Input placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} data-testid="pricing-description" />
            </div>
            <Button type="submit" variant="primary" icon={Plus} isLoading={busy} data-testid="pricing-add-btn">Add</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
