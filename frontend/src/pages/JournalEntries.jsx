import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Plus, X } from "../icons";
import Card from "../components/composites/Card";
import { TableFooter } from "../components/composites/Table";
import { EmptyState } from "../components/composites/EmptyState";
import { Modal, ModalContent } from "../components/composites/Modal";
import Input from "../components/primitives/Input";
import Select from "../components/primitives/Select";
import Button from "../components/primitives/Button";

export default function JournalEntries() {
  const [data, setData] = useState({ items: [], total: 0, page: 1 });
  const [accounts, setAccounts] = useState([]);
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(false);
  const [posting, setPosting] = useState(false);
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
    if (posting) return; // guards a fast double-click from posting the same entry twice
    setPosting(true);
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
    finally { setPosting(false); }
  };

  const totalPages = Math.ceil(data.total / 25);
  const accountOptions = [{ value: "", label: "Select account" }, ...accounts.map((a) => ({ value: a.id, label: `${a.code} - ${a.name}` }))];

  return (
    <div>
      <PageHeader title="Journal Entries" subtitle="Record financial transactions with enforced double-entry balance."
        right={<Button variant="primary" icon={Plus} onClick={() => setModal(true)}>New entry</Button>}
      />
      <div className="animate-fade-in px-6 sm:px-8 py-6 space-y-4">
        {data.items.length === 0 ? (
          <EmptyState title="No journal entries yet" description="Post a journal entry to start your ledger."
            actionLabel="New entry" onAction={() => setModal(true)} />
        ) : (
          <>
            {data.items.map((e) => (
              <Card key={e.id}>
                <div className="flex items-center justify-between">
                  <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>{e.memo || "Journal entry"}</div>
                  <div className="tnum" style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-primary)" }}>${e.total?.toFixed(2)}</div>
                </div>
                <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginTop: 4 }}>{e.date} {e.reference ? `· ${e.reference}` : ""}</div>
                <table className="w-full" style={{ marginTop: 12, fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", paddingBottom: 4, fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)" }}>Account</th>
                      <th style={{ textAlign: "right", paddingBottom: 4, fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)" }}>Debit</th>
                      <th style={{ textAlign: "right", paddingBottom: 4, fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)" }}>Credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {e.lines.map((l, i) => (
                      <tr key={i} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                        <td style={{ padding: "4px 0", color: "var(--text-primary)" }}>{l.account_name || l.account_code || l.account_id}</td>
                        <td className="tnum" style={{ padding: "4px 0", textAlign: "right", fontFamily: "var(--font-mono)" }}>{l.debit > 0 ? `$${l.debit.toFixed(2)}` : ""}</td>
                        <td className="tnum" style={{ padding: "4px 0", textAlign: "right", fontFamily: "var(--font-mono)" }}>{l.credit > 0 ? `$${l.credit.toFixed(2)}` : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            ))}
            {totalPages > 1 && (
              <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-xl)" }}>
                <TableFooter page={page} pageCount={totalPages} total={data.total} pageSize={25} onPageChange={setPage} />
              </div>
            )}
          </>
        )}
      </div>

      <Modal open={modal} onOpenChange={setModal}>
        <ModalContent size="lg" title="New Journal Entry"
          footer={
            <>
              <Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
              <Button variant="primary" type="submit" form="je-form" isLoading={posting}>{posting ? "Posting…" : "Post entry"}</Button>
            </>
          }
        >
          <form id="je-form" onSubmit={save} className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <Input required type="date" label="Date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              <Input label="Memo" value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} />
              <Input label="Reference" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>Lines (must balance)</span>
                <button type="button" onClick={addLine} style={{ fontSize: 12, color: "var(--text-link)" }}>+ Add line</button>
              </div>
              {form.lines.map((l, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <Select required value={l.account_id} onChange={(v) => updLine(i, "account_id", v)} options={accountOptions} className="flex-1" />
                  <Input type="number" step="0.01" placeholder="Debit" value={l.debit} onChange={(e) => updLine(i, "debit", e.target.value)} className="w-24" />
                  <Input type="number" step="0.01" placeholder="Credit" value={l.credit} onChange={(e) => updLine(i, "credit", e.target.value)} className="w-24" />
                  <Input placeholder="Memo" value={l.memo} onChange={(e) => updLine(i, "memo", e.target.value)} className="w-32" />
                  {form.lines.length > 1 && (
                    <button type="button" onClick={() => remLine(i)} style={{ color: "var(--color-danger)", marginTop: 10 }}>
                      <X size={14} strokeWidth={1.5} aria-hidden="true" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </form>
        </ModalContent>
      </Modal>
    </div>
  );
}
