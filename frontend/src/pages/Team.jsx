import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Plus, Trash2, UsersRound } from "../icons";
import Table from "../components/composites/Table";
import { EmptyState } from "../components/composites/EmptyState";
import { Modal, ModalContent } from "../components/composites/Modal";
import Button from "../components/primitives/Button";
import Input from "../components/primitives/Input";
import Select from "../components/primitives/Select";
import Chip from "../components/primitives/Chip";

const ROLES = [
  { k: "org_admin", t: "Org Admin" },
  { k: "campaign_manager", t: "Campaign Manager" },
  { k: "sdr", t: "SDR / Rep" },
  { k: "viewer", t: "Viewer" },
];

export default function Team() {
  const { user } = useAuth();
  const [members, setMembers] = useState([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", role: "campaign_manager", password: "", department: "" });
  const isOrgAdmin = user?.role === "org_admin" || user?.is_admin;

  const load = () => api.get("/team").then((r) => setMembers(r.data));
  useEffect(() => { load(); }, []);

  const invite = async (e) => {
    e.preventDefault();
    try {
      await api.post("/team/invite", form);
      toast.success(`Invited ${form.email}`);
      setModal(false); setForm({ name: "", email: "", role: "campaign_manager", password: "", department: "" });
      load();
    } catch (err) { toast.error(err?.response?.data?.detail || "Invite failed"); }
  };
  const remove = async (id) => {
    if (!window.confirm("Remove this member?")) return;
    try { await api.delete(`/team/${id}`); load(); }
    catch (err) { toast.error(err?.response?.data?.detail || "Failed"); }
  };
  const updateDepartment = async (id, department) => {
    try {
      await api.put(`/team/${id}`, { department });
      setMembers((prev) => prev.map((m) => m.id === id ? { ...m, department } : m));
    } catch (err) { toast.error(err?.response?.data?.detail || "Update failed"); }
  };

  const columns = [
    {
      key: "name", label: "Name",
      render: (m) => (
        <span className="flex items-center gap-1.5">
          <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>{m.name}</span>
          {m.id === user?.id && <Chip label="You" />}
        </span>
      ),
    },
    { key: "email", label: "Email", render: (m) => <span className="tnum" style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{m.email}</span> },
    { key: "role", label: "Role", render: (m) => ROLES.find((r) => r.k === m.role)?.t || m.role },
    {
      key: "department", label: "Department",
      render: (m) => isOrgAdmin ? (
        <input
          defaultValue={m.department || ""} placeholder="—"
          onBlur={(e) => { if (e.target.value !== (m.department || "")) updateDepartment(m.id, e.target.value.trim()); }}
          data-testid={`member-department-${m.id}`}
          style={{
            width: 112, background: "transparent", border: "none", borderBottom: "1px solid transparent",
            fontSize: 13, color: "var(--text-primary)", padding: "2px 0",
          }}
          onFocus={(e) => (e.currentTarget.style.borderBottomColor = "var(--border-focus)")}
          onMouseEnter={(e) => { if (document.activeElement !== e.currentTarget) e.currentTarget.style.borderBottomColor = "var(--border-default)"; }}
          onMouseLeave={(e) => { if (document.activeElement !== e.currentTarget) e.currentTarget.style.borderBottomColor = "transparent"; }}
        />
      ) : (m.department || "—"),
    },
    { key: "created_at", label: "Joined", render: (m) => <span style={{ color: "var(--text-tertiary)", fontSize: 12 }}>{m.created_at?.slice(0, 10)}</span> },
    {
      key: "actions", label: "", align: "right",
      render: (m) => m.id !== user?.id && (
        <button onClick={() => remove(m.id)} data-testid={`remove-member-${m.id}`}
          className="inline-flex items-center gap-1 ds-row-action" style={{ fontSize: 12, color: "var(--color-danger)" }}>
          <Trash2 size={12} strokeWidth={1.5} aria-hidden="true" /> Remove
        </button>
      ),
    },
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader title="Team" subtitle="Invite people to your workspace."
        right={<Button variant="primary" icon={Plus} onClick={() => setModal(true)} data-testid="invite-btn">Invite</Button>}
      />
      <div className="p-6 sm:p-8">
        {members.length === 0 ? (
          <EmptyState icon={UsersRound} title="No team members yet" description="Invite people to your workspace to collaborate." actionLabel="Invite" onAction={() => setModal(true)} />
        ) : (
          <Table columns={columns} rows={members} rowKey={(m) => m.id} />
        )}
      </div>

      <Modal open={modal} onOpenChange={setModal}>
        <ModalContent
          size="sm"
          title="Invite team member"
          footer={
            <>
              <Button type="button" variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
              <Button type="submit" form="invite-form" variant="primary" data-testid="save-invite">Invite</Button>
            </>
          }
        >
          <form id="invite-form" onSubmit={invite} className="space-y-3">
            <Input required label="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="invite-name" />
            <Input required type="email" label="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="invite-email" />
            <Input required minLength={6} label="Temporary password" help="Share this with them directly." value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} data-testid="invite-password" style={{ fontFamily: "var(--font-mono)" }} />
            <Select
              label="Role" value={form.role} onChange={(v) => setForm({ ...form, role: v })} data-testid="invite-role"
              options={ROLES.map((r) => ({ value: r.k, label: r.t }))}
            />
            <Input label="Department" optional placeholder="e.g. Sales" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} data-testid="invite-department" />
            <p style={{ fontSize: 12, color: "var(--text-tertiary)" }}>MVP note: no email sending yet — share the temporary password with them directly.</p>
          </form>
        </ModalContent>
      </Modal>
    </div>
  );
}
