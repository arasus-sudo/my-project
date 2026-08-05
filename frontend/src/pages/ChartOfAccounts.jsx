import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Plus, Trash2 } from "../icons";
import Table from "../components/composites/Table";
import { EmptyState } from "../components/composites/EmptyState";
import { Modal, ModalContent } from "../components/composites/Modal";
import Input from "../components/primitives/Input";
import Select from "../components/primitives/Select";
import Button from "../components/primitives/Button";

const TYPE_COLOR = {
  asset: "var(--color-primary)", liability: "var(--color-warning-text)", equity: "var(--text-secondary)",
  revenue: "var(--color-success-text)", expense: "var(--color-danger)",
};
const TYPE_OPTIONS = [
  { value: "asset", label: "Asset" }, { value: "liability", label: "Liability" }, { value: "equity", label: "Equity" },
  { value: "revenue", label: "Revenue" }, { value: "expense", label: "Expense" },
];

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

  const columns = [
    { key: "code", label: "Code", render: (a) => <span className="tnum" style={{ fontFamily: "var(--font-mono)" }}>{a.code}</span> },
    { key: "name", label: "Name", render: (a) => <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>{a.name}</span> },
    { key: "type", label: "Type", render: (a) => <span className="capitalize" style={{ color: TYPE_COLOR[a.account_type] || "var(--text-primary)" }}>{a.account_type}</span> },
    { key: "category", label: "Category", render: (a) => <span style={{ color: "var(--text-tertiary)" }}>{a.category}</span> },
    { key: "balance", label: "Balance", align: "right", render: (a) => <span className="tnum" style={{ fontFamily: "var(--font-mono)" }}>${a.balance?.toFixed(2)}</span> },
    {
      key: "actions", label: "", align: "right", render: (a) => (
        <button onClick={() => del(a.id)} style={{ color: "var(--text-tertiary)" }}>
          <Trash2 size={14} strokeWidth={1.5} aria-hidden="true" />
        </button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Chart of Accounts" subtitle="Your general ledger account structure."
        right={<Button variant="primary" icon={Plus} onClick={() => setModal(true)}>New account</Button>}
      />
      <div className="animate-fade-in px-6 sm:px-8 py-6">
        {items.length === 0 ? (
          <EmptyState title="No accounts yet" description="Set up your chart of accounts to begin tracking transactions."
            actionLabel="New account" onAction={() => setModal(true)} />
        ) : (
          <Table columns={columns} rows={items} rowKey={(a) => a.id} />
        )}
      </div>

      <Modal open={modal} onOpenChange={setModal}>
        <ModalContent size="sm" title="New Account"
          footer={
            <>
              <Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
              <Button variant="primary" type="submit" form="coa-form">Create</Button>
            </>
          }
        >
          <form id="coa-form" onSubmit={save} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input required label="Account code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
              <Input required label="Account name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <Select label="Type" value={form.account_type} onChange={(v) => setForm({ ...form, account_type: v })} options={TYPE_OPTIONS} />
            <Input label="Category" help="e.g. cash_and_bank, accounts_receivable" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            <Input as="textarea" rows={3} label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </form>
        </ModalContent>
      </Modal>
    </div>
  );
}
