import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import {
  Plus, Building2, Globe, Linkedin, MapPin, Users, Pencil, ArrowLeft, Check, X,
} from "../icons";
import Table, { TableFooter } from "../components/composites/Table";
import { EmptyState } from "../components/composites/EmptyState";
import Card from "../components/composites/Card";
import { Modal, ModalContent } from "../components/composites/Modal";
import Button from "../components/primitives/Button";
import Input from "../components/primitives/Input";

export function CompaniesList() {
  const [companies, setCompanies] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: "", domain: "", website: "", linkedin_url: "", industry: "" });
  const pageSize = 25;

  const load = (p) => api.get(`/companies?page=${p || page}&page_size=${pageSize}`).then((r) => {
    setCompanies(r.data.items);
    setTotal(r.data.total);
    setPage(r.data.page);
    setLoading(false);
  });

  useEffect(() => { load(1); }, []);

  const add = async (e) => {
    e.preventDefault();
    try {
      await api.post("/companies", form);
      toast.success("Company added");
      setModal(false);
      setForm({ name: "", domain: "", website: "", linkedin_url: "", industry: "" });
      load();
    } catch (err) { toast.error(err?.response?.data?.detail || "Failed"); }
  };

  const remove = async (c) => {
    if (!window.confirm(`Delete ${c.name}?`)) return;
    await api.delete(`/companies/${c.id}`);
    toast.success("Company deleted");
    load();
  };

  const columns = [
    { key: "name", label: "Name", render: (c) => <Link to={`/app/crm/companies/${c.id}`} style={{ fontWeight: 500, color: "var(--text-primary)" }}>{c.name}</Link> },
    { key: "domain", label: "Domain", render: (c) => <span className="tnum" style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-secondary)" }}>{c.domain || "—"}</span> },
    { key: "industry", label: "Industry", render: (c) => <span style={{ color: "var(--text-tertiary)" }}>{c.industry || "—"}</span> },
    { key: "leads", label: "Leads", align: "right", numeric: true, render: (c) => c.lead_count || 0 },
    {
      key: "links", label: "Links",
      render: (c) => (
        <div className="flex items-center gap-2">
          {c.linkedin_url && <a href={c.linkedin_url} target="_blank" rel="noreferrer" title="LinkedIn" style={{ color: "var(--text-tertiary)" }}><Linkedin size={14} strokeWidth={1.5} aria-hidden="true" /></a>}
          {c.website && <a href={c.website.startsWith("http") ? c.website : `https://${c.website}`} target="_blank" rel="noreferrer" title="Website" style={{ color: "var(--text-tertiary)" }}><Globe size={14} strokeWidth={1.5} aria-hidden="true" /></a>}
        </div>
      ),
    },
    {
      key: "actions", label: "", align: "right",
      render: (c) => (
        <button onClick={() => remove(c)} className="ds-row-action" style={{ fontSize: 12, color: "var(--color-danger)" }}>Delete</button>
      ),
    },
  ];

  if (loading) return <div className="p-6 sm:p-8" style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Loading…</div>;

  return (
    <div>
      <PageHeader
        title="Companies"
        subtitle={`${total} companies`}
        right={<Button variant="primary" icon={Plus} onClick={() => setModal(true)}>Add company</Button>}
      />
      <div className="animate-fade-in px-6 sm:px-8 py-6">
        {companies.length === 0 ? (
          <EmptyState icon={Building2} title="No companies yet" description="Create a company and link leads to it." actionLabel="Add company" onAction={() => setModal(true)} />
        ) : (
          <>
            <Table columns={columns} rows={companies} rowKey={(c) => c.id} />
            <TableFooter page={page} pageCount={Math.max(1, Math.ceil(total / pageSize))} total={total} pageSize={pageSize} onPageChange={load} />
          </>
        )}
      </div>

      <Modal open={modal} onOpenChange={setModal}>
        <ModalContent
          size="sm"
          title="Add company"
          footer={
            <>
              <Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
              <Button type="submit" form="add-company-form" variant="primary">Add</Button>
            </>
          }
        >
          <form id="add-company-form" onSubmit={add} className="space-y-3">
            <Input required placeholder="Company name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input placeholder="Domain (e.g. acme.com)" value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} />
            <Input placeholder="Website URL" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
            <Input placeholder="LinkedIn URL" value={form.linkedin_url} onChange={(e) => setForm({ ...form, linkedin_url: e.target.value })} />
            <Input placeholder="Industry" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} />
          </form>
        </ModalContent>
      </Modal>
    </div>
  );
}

export function CompanyDetail() {
  const { id } = useParams();
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});

  const load = () => api.get(`/companies/${id}`).then((r) => {
    setCompany(r.data);
    setLoading(false);
  });

  useEffect(() => { load(); }, [id]);

  const saveEdit = async () => {
    try {
      const { data } = await api.put(`/companies/${id}`, editForm);
      setCompany(data);
      setEditing(false);
      toast.success("Company updated");
    } catch (err) { toast.error(err?.response?.data?.detail || "Failed"); }
  };

  if (loading) return <div className="p-6 sm:p-8" style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Loading…</div>;
  if (!company) return <div className="p-6 sm:p-8" style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Company not found.</div>;

  return (
    <div>
      <PageHeader
        title={company.name}
        subtitle={company.industry || company.domain || ""}
        right={
          <div className="flex items-center gap-2">
            <Button variant="secondary" icon={Pencil} onClick={() => {
              setEditForm({
                name: company.name, domain: company.domain || "",
                website: company.website || "", linkedin_url: company.linkedin_url || "",
                industry: company.industry || "", description: company.description || "",
                hq_location: company.hq_location || "",
              });
              setEditing(true);
            }}>Edit</Button>
            <Link to="/app/crm/companies">
              <Button variant="secondary" icon={ArrowLeft}>Companies</Button>
            </Link>
          </div>
        }
      />
      <div className="animate-fade-in px-6 sm:px-8 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-4">
          <Card title="Company info">
            {editing ? (
              <div className="space-y-2">
                <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} placeholder="Name" />
                <Input value={editForm.domain} onChange={(e) => setEditForm({ ...editForm, domain: e.target.value })} placeholder="Domain" />
                <Input value={editForm.website} onChange={(e) => setEditForm({ ...editForm, website: e.target.value })} placeholder="Website" />
                <Input value={editForm.linkedin_url} onChange={(e) => setEditForm({ ...editForm, linkedin_url: e.target.value })} placeholder="LinkedIn URL" />
                <Input value={editForm.industry} onChange={(e) => setEditForm({ ...editForm, industry: e.target.value })} placeholder="Industry" />
                <Input value={editForm.hq_location} onChange={(e) => setEditForm({ ...editForm, hq_location: e.target.value })} placeholder="HQ location" />
                <Input as="textarea" rows={3} value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} placeholder="Description" />
                <div className="flex gap-2 pt-1">
                  <Button variant="primary" size="sm" icon={Check} onClick={saveEdit}>Save</Button>
                  <Button variant="secondary" size="sm" icon={X} onClick={() => setEditing(false)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {company.domain && <div className="tnum" style={{ fontSize: 12.5, fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{company.domain}</div>}
                {company.hq_location && (
                  <div className="flex items-center gap-1.5" style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>
                    <MapPin size={12} strokeWidth={1.5} aria-hidden="true" /> {company.hq_location}
                  </div>
                )}
                <div className="flex items-center gap-3">
                  {company.linkedin_url && (
                    <a href={company.linkedin_url} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1" style={{ fontSize: 12.5, color: "var(--text-link)" }}>
                      <Linkedin size={12} strokeWidth={1.5} aria-hidden="true" /> LinkedIn
                    </a>
                  )}
                  {company.website && (
                    <a href={company.website.startsWith("http") ? company.website : `https://${company.website}`}
                      target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1" style={{ fontSize: 12.5, color: "var(--text-link)" }}>
                      <Globe size={12} strokeWidth={1.5} aria-hidden="true" /> Website
                    </a>
                  )}
                </div>
                {company.description && <p style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>{company.description}</p>}
                {company.employee_count && (
                  <div className="flex items-center gap-1.5" style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>
                    <Users size={12} strokeWidth={1.5} aria-hidden="true" /> {company.employee_count.toLocaleString()} employees
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>

        <div className="col-span-1 lg:col-span-2">
          <Card title={`Leads (${company.lead_count || 0})`}>
            {(!company.leads || company.leads.length === 0) ? (
              <p style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>No leads linked to this company.</p>
            ) : (
              <div className="space-y-1">
                {company.leads.map((l) => (
                  <Link key={l.id} to={`/app/crm/leads/${l.id}`}
                    className="flex items-center justify-between transition-colors"
                    style={{ padding: "8px 10px", borderRadius: "var(--radius-md)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <div>
                      <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>{l.first_name} {l.last_name || ""}</span>
                      <span className="tnum" style={{ color: "var(--text-tertiary)", marginLeft: 8, fontFamily: "var(--font-mono)", fontSize: 12 }}>{l.email}</span>
                    </div>
                    <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{l.title || ""}</span>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
