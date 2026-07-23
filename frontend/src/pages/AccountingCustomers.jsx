import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Plus } from "lucide-react";

export default function AccountingCustomers() {
  const [items, setItems] = useState([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", address: "", payment_terms: "net30", notes: "" });

  const load = () => api.get("/accounting-eq/customers").then((r) => setItems(r.data));
  useEffect(() => { load(); }, []);

  const save = async (e) => {
    e.preventDefault();
    try {
      await api.post("/accounting-eq/customers", form);
      toast.success("Customer added");
      setModal(false); setForm({ name: "", email: "", phone: "", address: "", payment_terms: "net30", notes: "" });
      load();
    } catch { toast.error("Save failed"); }
  };

  return (
    <div>
      <PageHeader title="Customers" subtitle="Manage your customer directory."
        right={<button onClick={() => setModal(true)} className="btn-primary"><Plus size={14} /> Add customer</button>}
      />
      <div className="animate-fade-in px-6 sm:px-8">
        {items.length === 0 && <div className="text-body text-ink-muted">No customers yet.</div>}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((c) => (
            <div key={c.id} className="bg-white border border-line rounded-2xl p-5">
              <div className="text-card-title font-display font-semibold">{c.name}</div>
              <div className="text-caption text-ink-muted mt-1">{c.email}</div>
              <div className="text-caption text-ink-muted">{c.phone}</div>
              <div className="mt-3 flex items-center justify-between text-body">
                <span>Balance: <span className="font-mono">${c.balance?.toFixed(2)}</span></span>
                <span className="text-tiny text-ink-muted">{c.payment_terms}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="text-card-title font-display font-semibold mb-4">Add Customer</div>
            <form onSubmit={save} className="space-y-4">
              <input className="inp w-full" placeholder="Customer name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              <input className="inp w-full" type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <input className="inp w-full" placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <textarea className="inp w-full h-20" placeholder="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              <select className="inp w-full" value={form.payment_terms} onChange={(e) => setForm({ ...form, payment_terms: e.target.value })}>
                <option value="net15">Net 15</option><option value="net30">Net 30</option><option value="net45">Net 45</option><option value="net60">Net 60</option><option value="due_on_receipt">Due on receipt</option>
              </select>
              <textarea className="inp w-full h-20" placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
