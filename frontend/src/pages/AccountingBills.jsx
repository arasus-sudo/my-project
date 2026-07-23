import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Plus } from "lucide-react";

export default function AccountingBills() {
  const [items, setItems] = useState([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ vendor_name: "", vendor_email: "", date: new Date().toISOString().slice(0, 10), due_date: "", notes: "", lines: [{ description: "", quantity: "1", unit_price: "" }] });

  const load = () => api.get("/accounting-eq/bills").then((r) => setItems(r.data));
  useEffect(() => { load(); }, []);

  const addLine = () => setForm({ ...form, lines: [...form.lines, { description: "", quantity: "1", unit_price: "" }] });
  const updLine = (i, field, val) => {
    const lines = [...form.lines];
    lines[i][field] = val;
    setForm({ ...form, lines });
  };
  const remLine = (i) => setForm({ ...form, lines: form.lines.filter((_, idx) => idx !== i) });

  const save = async (e) => {
    e.preventDefault();
    try {
      await api.post("/accounting-eq/bills", {
        ...form,
        lines: form.lines.map(l => ({ description: l.description, quantity: parseFloat(l.quantity) || 1, unit_price: parseFloat(l.unit_price) || 0 })),
      });
      toast.success("Bill created");
      setModal(false);
      setForm({ vendor_name: "", vendor_email: "", date: new Date().toISOString().slice(0, 10), due_date: "", notes: "", lines: [{ description: "", quantity: "1", unit_price: "" }] });
      load();
    } catch { toast.error("Create failed"); }
  };

  const payBill = async (id) => {
    try {
      await api.put(`/accounting-eq/bills/${id}`, { status: "paid" });
      toast.success("Bill paid");
      load();
    } catch { toast.error("Payment failed"); }
  };

  return (
    <div>
      <PageHeader title="Bills (AP)" subtitle="Track and pay vendor bills."
        right={<button onClick={() => setModal(true)} className="btn-primary"><Plus size={14} /> New bill</button>}
      />
      <div className="animate-fade-in px-6 sm:px-8 space-y-4">
        {items.length === 0 && <div className="text-body text-ink-muted">No bills yet.</div>}
        {items.map((b) => (
          <div key={b.id} className="bg-white border border-line rounded-2xl p-5 flex items-center justify-between">
            <div>
              <div className="text-card-title font-display font-semibold">{b.vendor_name}</div>
              <div className="text-caption text-ink-muted">{b.bill_number} · Total: ${b.total?.toFixed(2)} · Due: {b.due_date || "—"}</div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-tiny px-2 py-0.5 rounded-full border ${b.status === "paid" ? "text-success border-success/30" : "text-warning border-warning"}`}>{b.status}</span>
              {b.status === "unpaid" && <button onClick={() => payBill(b.id)} className="btn-primary">Pay</button>}
            </div>
          </div>
        ))}
      </div>
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 overflow-y-auto py-8" onClick={() => setModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-2xl mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="text-card-title font-display font-semibold mb-4">New Bill</div>
            <form onSubmit={save} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <input className="inp" placeholder="Vendor name" value={form.vendor_name} onChange={(e) => setForm({ ...form, vendor_name: e.target.value })} required />
                <input className="inp" type="email" placeholder="Vendor email" value={form.vendor_email} onChange={(e) => setForm({ ...form, vendor_email: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <input className="inp" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                <input className="inp" type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="ui-label">Line items</span>
                  <button type="button" onClick={addLine} className="text-xs text-accent hover:underline">+ Add line</button>
                </div>
                {form.lines.map((l, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <input className="inp flex-[2]" placeholder="Description" value={l.description} onChange={(e) => updLine(i, "description", e.target.value)} required />
                    <input className="inp w-20" type="number" step="1" placeholder="Qty" value={l.quantity} onChange={(e) => updLine(i, "quantity", e.target.value)} />
                    <input className="inp w-28" type="number" step="0.01" placeholder="Unit price" value={l.unit_price} onChange={(e) => updLine(i, "unit_price", e.target.value)} required />
                    {form.lines.length > 1 && <button type="button" onClick={() => remLine(i)} className="text-danger text-xs mt-2">X</button>}
                  </div>
                ))}
              </div>
              <textarea className="inp w-full h-20" placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary">Create bill</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
