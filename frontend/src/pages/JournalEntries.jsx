import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";

export default function JournalEntries() {
  const [data, setData] = useState({ items: [], total: 0, page: 1 });
  const [accounts, setAccounts] = useState([]);
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), memo: "", reference: "", lines: [{ account_id: "", debit: "", credit: "", memo: "" }] });

  const load = () => api.get(`/accounting-eq/journal-entries?page=${page}`).then((r) => setData(r.data));
  useEffect(() => { load(); api.get("/accounting-eq/accounts").then((r) => setAccounts(r.data)); }, [page]);

  const addLine = () => setForm({ ...form, lines: [...form.lines, { account_id: "", debit: "", credit: "", memo: "" }] });
  const updLine = (i, field, val) => {
    const lines = [...form.lines];
    lines[i][field] = val;
    setForm({ ...form, lines });
  };
  const remLine = (i) => setForm({ ...form, lines: form.lines.filter((_, idx) => idx !== i) });

  const save = async (e) => {
    e.preventDefault();
    try {
      await api.post("/accounting-eq/journal-entries", {
        ...form,
        lines: form.lines.map(l => ({ account_id: l.account_id, debit: parseFloat(l.debit) || 0, credit: parseFloat(l.credit) || 0, memo: l.memo })),
      });
      toast.success("Journal entry posted");
      setModal(false);
      setForm({ date: new Date().toISOString().slice(0, 10), memo: "", reference: "", lines: [{ account_id: "", debit: "", credit: "", memo: "" }] });
      load();
    } catch (err) { toast.error(err.response?.data?.detail || "Post failed"); }
  };

  const totalPages = Math.ceil(data.total / 25);

  return (
    <div>
      <PageHeader title="Journal Entries" subtitle="Record financial transactions with enforced double-entry balance."
        right={<button onClick={() => setModal(true)} className="btn-primary"><Plus size={14} /> New entry</button>}
      />
      <div className="animate-fade-in px-6 sm:px-8 space-y-4">
        {data.items.length === 0 && <div className="text-body text-ink-muted">No journal entries yet.</div>}
        {data.items.map((e) => (
          <div key={e.id} className="bg-white border border-line rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <div className="text-card-title font-display font-semibold">{e.memo || "Journal entry"}</div>
              <div className="font-mono font-bold">${e.total?.toFixed(2)}</div>
            </div>
            <div className="text-caption text-ink-muted mt-1">{e.date} {e.reference ? `· ${e.reference}` : ""}</div>
            <table className="w-full mt-3 text-body">
              <thead><tr className="text-left"><th className="table-header pb-1">Account</th><th className="table-header pb-1 text-right">Debit</th><th className="table-header pb-1 text-right">Credit</th></tr></thead>
              <tbody>
                {e.lines.map((l, i) => (
                  <tr key={i} className="border-t border-line">
                    <td className="py-1">{l.account_name || l.account_code || l.account_id}</td>
                    <td className="py-1 text-right font-mono">{l.debit > 0 ? `$${l.debit.toFixed(2)}` : ""}</td>
                    <td className="py-1 text-right font-mono">{l.credit > 0 ? `$${l.credit.toFixed(2)}` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
            <div className="text-card-title font-display font-semibold mb-4">New Journal Entry</div>
            <form onSubmit={save} className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <input className="inp" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
                <input className="inp" placeholder="Memo" value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} />
                <input className="inp" placeholder="Reference" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="ui-label">Lines (must balance)</span>
                  <button type="button" onClick={addLine} className="text-xs text-accent hover:underline">+ Add line</button>
                </div>
                {form.lines.map((l, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <select className="inp flex-1" value={l.account_id} onChange={(e) => updLine(i, "account_id", e.target.value)} required>
                      <option value="">Select account</option>
                      {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
                    </select>
                    <input className="inp w-24" type="number" step="0.01" placeholder="Debit" value={l.debit} onChange={(e) => updLine(i, "debit", e.target.value)} />
                    <input className="inp w-24" type="number" step="0.01" placeholder="Credit" value={l.credit} onChange={(e) => updLine(i, "credit", e.target.value)} />
                    <input className="inp w-32" placeholder="Memo" value={l.memo} onChange={(e) => updLine(i, "memo", e.target.value)} />
                    {form.lines.length > 1 && <button type="button" onClick={() => remLine(i)} className="text-danger text-xs mt-2">X</button>}
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary">Post entry</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
