import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Plus } from "../icons";
import Card from "../components/composites/Card";
import { EmptyState } from "../components/composites/EmptyState";
import { Modal, ModalContent } from "../components/composites/Modal";
import Input from "../components/primitives/Input";
import Select from "../components/primitives/Select";
import Button from "../components/primitives/Button";

const PAYMENT_TERMS_OPTIONS = [
  { value: "net15", label: "Net 15" }, { value: "net30", label: "Net 30" }, { value: "net45", label: "Net 45" },
  { value: "net60", label: "Net 60" }, { value: "due_on_receipt", label: "Due on receipt" },
];

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
        right={<Button variant="primary" icon={Plus} onClick={() => setModal(true)}>Add customer</Button>}
      />
      <div className="animate-fade-in px-6 sm:px-8 py-6">
        {items.length === 0 ? (
          <EmptyState title="No customers yet" description="Add customers to start invoicing them."
            actionLabel="Add customer" onAction={() => setModal(true)} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((c) => (
              <Card key={c.id}>
                <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>{c.name}</div>
                <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginTop: 4 }}>{c.email}</div>
                <div style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>{c.phone}</div>
                <div className="flex items-center justify-between" style={{ marginTop: 12, fontSize: 13 }}>
                  <span style={{ color: "var(--text-secondary)" }}>Balance: <span className="tnum" style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>${c.balance?.toFixed(2)}</span></span>
                  <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{c.payment_terms}</span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Modal open={modal} onOpenChange={setModal}>
        <ModalContent size="sm" title="Add Customer"
          footer={
            <>
              <Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
              <Button variant="primary" type="submit" form="acct-customer-form">Save</Button>
            </>
          }
        >
          <form id="acct-customer-form" onSubmit={save} className="space-y-3">
            <Input required label="Customer name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input type="email" label="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <Input label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <Input as="textarea" rows={3} label="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            <Select label="Payment terms" value={form.payment_terms} onChange={(v) => setForm({ ...form, payment_terms: v })} options={PAYMENT_TERMS_OPTIONS} />
            <Input as="textarea" rows={3} label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </form>
        </ModalContent>
      </Modal>
    </div>
  );
}
