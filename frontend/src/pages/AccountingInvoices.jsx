import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";

export default function AccountingInvoices() {
  const [data, setData] = useState({ items: [], total: 0, page: 1 });
  const [customers, setCustomers] = useState([]);
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ customer_id: "", date: new Date().toISOString().slice(0, 10), due_date: "", tax_rate: "0", notes: "", lines: [{ description: "", quantity: "1", unit_price: "" }] });

  const load = () => api.get(`/accounting-eq/invoices?page=${page}`).then((r) => setData(r.data));
  useEffect(() => { load(); api.get("/accounting-eq/customers").then((r) => setCustomers(r.data)); }, [page]);

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
      await api.post("/accounting-eq/invoices", {
        ...form,
        tax_rate: parseFloat(form.tax_rate) || 0,
        lines: form.lines.map(l => ({ description: l.description, quantity: parseFloat(l.quantity) || 1, unit_price: parseFloat(l.unit_price) || 0 })),
      });
      toast.success("Invoice created");
      setModal(false);
      setForm({ customer_id: "", date: new Date().toISOString().slice(0, 10), due_date: "", tax_rate: "0", notes: "", lines: [{ description: "", quantity: "1", unit_price: "" }] });
      load();
    } catch { toast.error("Create failed"); }
  };

  const sendInvoice = async (id) => {
    try {
      await api.put(`/accounting-eq/invoices/${id}`, { status: "sent" });
      toast.success("Invoice sent");
      load();
    } catch { toast.error("Send failed"); }
  };

  const recordPayment = async (id) => {
    try {
      await api.put(`/accounting-eq/invoices/${id}`, { status: "paid", amount_paid: 0 });
      const inv = data.items.find(i => i.id === id);
      if (inv) {
        await api.put(`/accounting-eq/invoices/${id}`, { status: "paid", amount_paid: inv.balance_due });
      }
      toast.success("Payment recorded");
      load();
    } catch { toast.error("Payment failed"); }
  };

  const STATUS_META = { draft: "Draft", sent: "Sent", paid: "Paid", overdue: "Overdue", partially_paid: "Partial", cancelled: "Cancelled" };

  const totalPages = Math.ceil(data.total / 25);

  return (
    <div>
      <PageHeader title="Invoices" subtitle="Create and manage AR invoices."
        right={<button onClick={() => setModal(true)} className="btn-primary"><Plus size={14} /> New invoice</button>}
      />
      <div className="animate-fade-in px-6 sm:px-8 space-y-4">
        {data.items.length === 0 && <div className="text-body text-ink-muted">No invoices yet.</div>}
        {data.items.map((inv) => (
          <div key={inv.id} className="bg-white border border-line rounded-2xl p-5 flex items-center justify-between">
            <div>
              <div className="text-card-title font-display font-semibold">{inv.invoice_number}</div>
              <div className="text-caption text-ink-muted">{customers.find(c => c.id === inv.customer_id)?.name || "—"} · Total: ${inv.total?.toFixed(2)}</div>
              <div className="text-caption text-ink-muted">Due: {inv.due_date || "—"} · Paid: ${inv.amount_paid?.toFixed(2)}</div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-tiny px-2 py-0.5 rounded-full border ${inv.status === "paid" ? "text-success border-success/30" : inv.status === "draft" ? "text-ink-muted border-line" : "text-warning border-warning"}`}>{STATUS_META[inv.status]}</span>
              {inv.status === "draft" && <button onClick={() => sendInvoice(inv.id)} className="btn-secondary">Send</button>}
              {inv.status === "sent" && <button onClick={() => recordPayment(inv.id)} className="btn-primary">Record payment</button>}
            </div>
          </div>
        ))}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn-secondary"><ChevronLeft size={14} /></button>
            <span className="text-body text-ink-muted">Page {page} of {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="btn-secondary"><ChevronRight size={14} /></button>
          </div>
        )}
      </div>
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 overflow-y-auto py-8" onClick={() => setModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-2xl mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="text-card-title font-display font-semibold mb-4">New Invoice</div>
            <form onSubmit={save} className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <select className="inp" value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value })} required>
                  <option value="">Select customer</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
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
              <div className="grid grid-cols-2 gap-4">
                <input className="inp" type="number" step="0.1" placeholder="Tax rate %" value={form.tax_rate} onChange={(e) => setForm({ ...form, tax_rate: e.target.value })} />
                <textarea className="inp" placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary">Create invoice</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
