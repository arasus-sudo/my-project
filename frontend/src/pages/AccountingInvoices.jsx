import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Plus, X } from "../icons";
import Card from "../components/composites/Card";
import { TableFooter } from "../components/composites/Table";
import { EmptyState } from "../components/composites/EmptyState";
import { Modal, ModalContent } from "../components/composites/Modal";
import StatusPill from "../components/primitives/StatusPill";
import Input from "../components/primitives/Input";
import Select from "../components/primitives/Select";
import Button from "../components/primitives/Button";

const STATUS_TONE = { draft: "neutral", sent: "warning", paid: "success", overdue: "danger", partially_paid: "warning", cancelled: "neutral" };
const STATUS_META = { draft: "Draft", sent: "Sent", paid: "Paid", overdue: "Overdue", partially_paid: "Partial", cancelled: "Cancelled" };

export default function AccountingInvoices() {
  const [data, setData] = useState({ items: [], total: 0, page: 1 });
  const [customers, setCustomers] = useState([]);
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(false);
  const [payingId, setPayingId] = useState(null);
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
    if (payingId) return; // guards a fast double-click from double-posting the payment
    setPayingId(id);
    try {
      const inv = data.items.find(i => i.id === id);
      await api.put(`/accounting-eq/invoices/${id}`, { status: "paid", amount_paid: inv?.balance_due ?? 0 });
      toast.success("Payment recorded");
      load();
    } catch (err) { toast.error(err.response?.data?.detail || "Payment failed"); }
    finally { setPayingId(null); }
  };

  const totalPages = Math.ceil(data.total / 25);
  const customerOptions = [{ value: "", label: "Select customer" }, ...customers.map((c) => ({ value: c.id, label: c.name }))];

  return (
    <div>
      <PageHeader title="Invoices" subtitle="Create and manage AR invoices."
        right={<Button variant="primary" icon={Plus} onClick={() => setModal(true)}>New invoice</Button>}
      />
      <div className="animate-fade-in px-6 sm:px-8 py-6 space-y-3">
        {data.items.length === 0 ? (
          <EmptyState title="No invoices yet" description="Create an invoice to start billing customers."
            actionLabel="New invoice" onAction={() => setModal(true)} />
        ) : (
          <>
            {data.items.map((inv) => (
              <Card key={inv.id}>
                <div className="flex items-center justify-between">
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>{inv.invoice_number}</div>
                    <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginTop: 4 }}>{customers.find(c => c.id === inv.customer_id)?.name || "—"} · Total: ${inv.total?.toFixed(2)}</div>
                    <div style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>Due: {inv.due_date || "—"} · Paid: ${inv.amount_paid?.toFixed(2)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusPill status={STATUS_META[inv.status]} tone={STATUS_TONE[inv.status]} />
                    {inv.status === "draft" && <Button variant="secondary" onClick={() => sendInvoice(inv.id)}>Send</Button>}
                    {inv.status === "sent" && <Button variant="primary" onClick={() => recordPayment(inv.id)} isLoading={payingId === inv.id}>{payingId === inv.id ? "Recording…" : "Record payment"}</Button>}
                  </div>
                </div>
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
        <ModalContent size="lg" title="New Invoice"
          footer={
            <>
              <Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
              <Button variant="primary" type="submit" form="invoice-form">Create invoice</Button>
            </>
          }
        >
          <form id="invoice-form" onSubmit={save} className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <Select required value={form.customer_id} onChange={(v) => setForm({ ...form, customer_id: v })} options={customerOptions} />
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
            <div className="grid grid-cols-2 gap-3">
              <Input type="number" step="0.1" label="Tax rate %" value={form.tax_rate} onChange={(e) => setForm({ ...form, tax_rate: e.target.value })} />
              <Input label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </form>
        </ModalContent>
      </Modal>
    </div>
  );
}
