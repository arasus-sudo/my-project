import { useEffect, useState, useMemo } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Plus, Check, X } from "../icons";
import Card from "../components/composites/Card";
import { EmptyState } from "../components/composites/EmptyState";
import { Modal, ModalContent } from "../components/composites/Modal";
import StatusPill from "../components/primitives/StatusPill";
import Input from "../components/primitives/Input";
import Select from "../components/primitives/Select";
import Button from "../components/primitives/Button";

const LEAVE_TYPE_OPTIONS = [
  { value: "vacation", label: "Vacation" }, { value: "sick", label: "Sick" },
  { value: "personal", label: "Personal" }, { value: "other", label: "Other" },
];
const STATUS_TONE = { pending: "warning", approved: "success", declined: "danger" };
const STATUS_META = { pending: "Pending", approved: "Approved", declined: "Declined" };

export default function HrmseqLeave() {
  const [requests, setRequests] = useState([]);
  const [balances, setBalances] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ employee_id: "", leave_type: "vacation", start_date: "", end_date: "", reason: "" });

  const empMap = useMemo(() => {
    const m = {};
    employees.forEach((e) => { m[e.id] = `${e.first_name || ""} ${e.last_name || ""}`.trim(); });
    return m;
  }, [employees]);

  const load = () => {
    api.get("/hrms-eq/leave-requests").then((r) => setRequests(r.data));
    api.get("/hrms-eq/leave-balances").then((r) => setBalances(r.data));
  };
  useEffect(() => { load(); api.get("/hrms-eq/employees").then((r) => setEmployees(r.data.items || r.data)); }, []);

  const save = async (e) => {
    e.preventDefault();
    try {
      await api.post("/hrms-eq/leave-requests", form);
      toast.success("Leave request submitted");
      setModal(false); setForm({ employee_id: "", leave_type: "vacation", start_date: "", end_date: "", reason: "" });
      load();
    } catch (err) { toast.error(err.response?.data?.detail || "Submit failed"); }
  };

  const review = async (id, status) => {
    try {
      await api.put(`/hrms-eq/leave-requests/${id}`, { status });
      toast.success(status === "approved" ? "Approved" : "Declined");
      load();
    } catch { toast.error("Review failed"); }
  };

  return (
    <div>
      <PageHeader title="Leave Management" subtitle="Track and manage leave requests."
        right={<Button variant="primary" icon={Plus} onClick={() => setModal(true)}>New request</Button>}
      />
      <div className="animate-fade-in px-6 sm:px-8 py-6 space-y-4">
        {balances.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {balances.map((b) => (
              <Card key={`${b.employee_id}-${b.leave_type}`} padding="compact">
                <div className="capitalize" style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{b.leave_type}</div>
                <div className="tnum" style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>{b.total_days - b.used_days}/{b.total_days}d</div>
              </Card>
            ))}
          </div>
        )}
        {requests.length === 0 ? (
          <EmptyState title="No leave requests yet" description="Leave requests submitted by employees will appear here."
            actionLabel="New request" onAction={() => setModal(true)} />
        ) : requests.map((r) => (
          <Card key={r.id}>
            <div className="flex items-center justify-between">
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>{empMap[r.employee_id] || r.employee_id}</div>
                <div className="capitalize" style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginTop: 2 }}>{r.leave_type} · {r.start_date} to {r.end_date}{r.reason ? ` · ${r.reason}` : ""}</div>
              </div>
              <div className="flex items-center gap-2">
                <StatusPill status={STATUS_META[r.status]} tone={STATUS_TONE[r.status]} />
                {r.status === "pending" && (
                  <>
                    <Button variant="secondary" size="sm" iconOnly icon={Check} onClick={() => review(r.id, "approved")} aria-label="Approve" />
                    <Button variant="danger-subtle" size="sm" iconOnly icon={X} onClick={() => review(r.id, "declined")} aria-label="Decline" />
                  </>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Modal open={modal} onOpenChange={setModal}>
        <ModalContent size="sm" title="New Leave Request"
          footer={
            <>
              <Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
              <Button variant="primary" type="submit" form="hrms-leave-form">Submit</Button>
            </>
          }
        >
          <form id="hrms-leave-form" onSubmit={save} className="space-y-3">
            <Select required label="Employee" value={form.employee_id} onChange={(v) => setForm({ ...form, employee_id: v })}
              options={[{ value: "", label: "Select employee" }, ...employees.map((e) => ({ value: e.id, label: `${e.first_name} ${e.last_name}` }))]} />
            <Select label="Leave type" value={form.leave_type} onChange={(v) => setForm({ ...form, leave_type: v })} options={LEAVE_TYPE_OPTIONS} />
            <div className="grid grid-cols-2 gap-3">
              <Input required type="date" label="Start date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
              <Input required type="date" label="End date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
            </div>
            <Input as="textarea" rows={3} label="Reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </form>
        </ModalContent>
      </Modal>
    </div>
  );
}
