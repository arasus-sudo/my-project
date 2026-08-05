import { useEffect, useState, useMemo, useCallback } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Plus } from "../icons";
import Table, { TableFooter } from "../components/composites/Table";
import { EmptyState } from "../components/composites/EmptyState";
import { Modal, ModalContent } from "../components/composites/Modal";
import StatusPill from "../components/primitives/StatusPill";
import Input from "../components/primitives/Input";
import Select from "../components/primitives/Select";
import Button from "../components/primitives/Button";

const EMPLOYMENT_TYPE_OPTIONS = [
  { value: "full_time", label: "Full-time" }, { value: "part_time", label: "Part-time" },
  { value: "contractor", label: "Contractor" }, { value: "intern", label: "Intern" },
];

export default function HrmseqEmployees() {
  const [items, setItems] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "", phone: "", department_id: "", position: "", employment_type: "full_time", start_date: "" });

  const deptMap = useMemo(() => {
    const m = {};
    departments.forEach((d) => { m[d.id] = d.name; });
    return m;
  }, [departments]);

  const load = useCallback(() => api.get(`/hrms-eq/employees?page=${page}&page_size=25`).then((r) => { setItems(r.data.items); setTotal(r.data.total); }), [page]);
  useEffect(() => { const c = new AbortController(); load(); api.get("/hrms-eq/departments").then((r) => setDepartments(r.data)); return () => c.abort(); }, [page, load]);

  const save = async (e) => {
    e.preventDefault();
    try {
      await api.post("/hrms-eq/employees", form);
      toast.success("Employee added");
      setModal(false); setForm({ first_name: "", last_name: "", email: "", phone: "", department_id: "", position: "", employment_type: "full_time", start_date: "" });
      load();
    } catch (err) { toast.error(err.response?.data?.detail || "Save failed"); }
  };

  const totalPages = Math.ceil(total / 25);

  const columns = [
    { key: "name", label: "Name", render: (e) => <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>{e.first_name} {e.last_name}</span> },
    { key: "email", label: "Email", render: (e) => <span style={{ color: "var(--text-tertiary)" }}>{e.email}</span> },
    { key: "position", label: "Position", render: (e) => e.position },
    { key: "department", label: "Department", render: (e) => <span style={{ color: "var(--text-tertiary)" }}>{deptMap[e.department_id] || "—"}</span> },
    { key: "status", label: "Status", render: (e) => <StatusPill status={e.status} /> },
  ];

  return (
    <div>
      <PageHeader title="Employees" subtitle="Manage your workforce."
        right={<Button variant="primary" icon={Plus} onClick={() => setModal(true)}>Add employee</Button>}
      />
      <div className="animate-fade-in px-6 sm:px-8 py-6 space-y-4">
        {items.length === 0 ? (
          <EmptyState title="No employees yet" description="Add your first employee to start building your workforce."
            actionLabel="Add employee" onAction={() => setModal(true)} />
        ) : (
          <>
            <Table columns={columns} rows={items} rowKey={(e) => e.id} />
            {totalPages > 1 && <TableFooter page={page} pageCount={totalPages} total={total} pageSize={25} onPageChange={setPage} />}
          </>
        )}
      </div>

      <Modal open={modal} onOpenChange={setModal}>
        <ModalContent size="sm" title="Add Employee"
          footer={
            <>
              <Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
              <Button variant="primary" type="submit" form="hrms-employee-form">Save</Button>
            </>
          }
        >
          <form id="hrms-employee-form" onSubmit={save} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input required label="First name" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
              <Input required label="Last name" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
            </div>
            <Input required type="email" label="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <Input label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <Select label="Department" value={form.department_id} onChange={(v) => setForm({ ...form, department_id: v })}
                options={[{ value: "", label: "No department" }, ...departments.map((d) => ({ value: d.id, label: d.name }))]} />
              <Select label="Employment type" value={form.employment_type} onChange={(v) => setForm({ ...form, employment_type: v })} options={EMPLOYMENT_TYPE_OPTIONS} />
            </div>
            <Input label="Position" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} />
            <Input type="date" label="Start date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
          </form>
        </ModalContent>
      </Modal>
    </div>
  );
}
