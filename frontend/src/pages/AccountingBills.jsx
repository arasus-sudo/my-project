import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Plus, X } from "../icons";
import Card from "../components/composites/Card";
import { EmptyState } from "../components/composites/EmptyState";
import { Modal, ModalContent } from "../components/composites/Modal";
import StatusPill from "../components/primitives/StatusPill";
import Input from "../components/primitives/Input";
import Button from "../components/primitives/Button";

export default function AccountingBills() {
  const [items, setItems] = useState([]);
  const [modal, setModal] = useState(false);
  const [payingId, setPayingId] = useState(null);
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
    if (payingId) return; // guards a fast double-click from double-posting the payment
    setPayingId(id);
    try {
      await api.put(`/accounting-eq/bills/${id}`, { status: "paid" });
      toast.success("Bill paid");
      load();
    } catch (err) { toast.error(err.response?.data?.detail || "Payment failed"); }
    finally { setPayingId(null); }
  };

  return (
    <div>
      <PageHeader title="Bills (AP)" subtitle="Track and pay vendor bills."
        right={<Button variant="primary" icon={Plus} onClick={() => setModal(true)}>New bill</Button>}
      />
      <div className="animate-fade-in px-6 sm:px-8 py-6 space-y-3">
        {items.length === 0 ? (
          <EmptyState title="No bills yet" description="Create a bill to start tracking what you owe vendors."
            actionLabel="New bill" onAction={() => setModal(true)} />
        ) : items.map((b) => (
          <Card key={b.id}>
            <div className="flex items-center justify-between">
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>{b.vendor_name}</div>
                <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginTop: 4 }}>{b.bill_number} · Total: ${b.total?.toFixed(2)} · Due: {b.due_date || "—"}</div>
              </div>
              <div className="flex items-center gap-2">
                <StatusPill status={b.status} tone={b.status === "paid" ? "success" : "warning"} />
                {b.status === "unpaid" && <Button variant="primary" onClick={() => payBill(b.id)} isLoading={payingId === b.id}>{payingId === b.id ? "Paying…" : "Pay"}</Button>}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Modal open={modal} onOpenChange={setModal}>
        <ModalContent size="lg" title="New Bill"
          footer={
            <>
              <Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
              <Button variant="primary" type="submit" form="bill-form">Create bill</Button>
            </>
          }
        >
          <form id="bill-form" onSubmit={save} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input required label="Vendor name" value={form.vendor_name} onChange={(e) => setForm({ ...form, vendor_name: e.target.value })} />
              <Input type="email" label="Vendor email" value={form.vendor_email} onChange={(e) => setForm({ ...form, vendor_email: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input type="date" label="Date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              <Input type="date" label="Due date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>Line items</span>
                <button type="button" onClick={addLine} style={{ fontSize: 12, color: "var(--text-link)" }}>+ Add line</button>
              </div>
              {form.lines.map((l, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <Input required placeholder="Description" value={l.description} onChange={(e) => updLine(i, "description", e.target.value)} className="flex-[2]" />
                  <Input type="number" step="1" placeholder="Qty" value={l.quantity} onChange={(e) => updLine(i, "quantity", e.target.value)} className="w-20" />
                  <Input required type="number" step="0.01" placeholder="Unit price" value={l.unit_price} onChange={(e) => updLine(i, "unit_price", e.target.value)} className="w-28" />
                  {form.lines.length > 1 && (
                    <button type="button" onClick={() => remLine(i)} style={{ color: "var(--color-danger)", marginTop: 10 }}>
                      <X size={14} strokeWidth={1.5} aria-hidden="true" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <Input as="textarea" rows={3} label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </form>
        </ModalContent>
      </Modal>
    </div>
  );
}
