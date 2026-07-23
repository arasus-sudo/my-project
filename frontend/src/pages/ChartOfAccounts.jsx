import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

const TYPE_COLORS = { asset: "text-blue-600", liability: "text-orange-600", equity: "text-purple-600", revenue: "text-green-600", expense: "text-red-600" };

export default function ChartOfAccounts() {
  const [items, setItems] = useState([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", account_type: "asset", category: "", description: "" });

  const load = () => api.get("/accounting-eq/accounts").then((r) => setItems(r.data));
  useEffect(() => { load(); }, []);

  const save = async (e) => {
    e.preventDefault();
    try {
      await api.post("/accounting-eq/accounts", form);
      toast.success("Account created");
      setModal(false); setForm({ code: "", name: "", account_type: "asset", category: "", description: "" });
      load();
    } catch { toast.error("Save failed"); }
  };
  const del = async (id) => {
    try {
      await api.delete(`/accounting-eq/accounts/${id}`);
      toast.success("Deleted"); load();
    } catch (err) { toast.error(err.response?.data?.detail || "Delete failed"); }
  };

  return (
    <div>
      <PageHeader title="Chart of Accounts" subtitle="Your general ledger account structure."
        right={<button onClick={() => setModal(true)} className="btn-primary"><Plus size={14} /> New account</button>}
      />
      <div className="animate-fade-in px-6 sm:px-8">
        {items.length === 0 && <div className="text-body text-ink-muted">No accounts yet.</div>}
        <div className="bg-white border border-line rounded-2xl overflow-hidden">
          <table className="w-full text-body">
            <thead><tr className="border-b border-line bg-ash text-left ui-label">
              <th className="p-3">Code</th><th className="p-3">Name</th><th className="p-3">Type</th><th className="p-3">Category</th><th className="p-3">Balance</th><th className="p-3"></th>
            </tr></thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id} className="border-b border-line last:border-0 hover:bg-ash/50">
                  <td className="p-3 font-mono">{a.code}</td>
                  <td className="p-3 font-medium">{a.name}</td>
                  <td className={`p-3 ${TYPE_COLORS[a.account_type] || ""}`}>{a.account_type}</td>
                  <td className="p-3 text-ink-muted">{a.category}</td>
                  <td className="p-3 font-mono">${a.balance?.toFixed(2)}</td>
                  <td className="p-3"><button onClick={() => del(a.id)} className="text-xs text-danger hover:underline"><Trash2 size={12} className="inline" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="text-card-title font-display font-semibold mb-4">New Account</div>
            <form onSubmit={save} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <input className="inp" placeholder="Account code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
                <input className="inp" placeholder="Account name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <select className="inp w-full" value={form.account_type} onChange={(e) => setForm({ ...form, account_type: e.target.value })}>
                <option value="asset">Asset</option><option value="liability">Liability</option><option value="equity">Equity</option><option value="revenue">Revenue</option><option value="expense">Expense</option>
              </select>
              <input className="inp w-full" placeholder="Category (e.g. cash_and_bank, accounts_receivable)" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
              <textarea className="inp w-full h-20" placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
