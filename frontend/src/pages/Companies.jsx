import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import {
  Plus, Building2, Globe, ExternalLink, Linkedin, MapPin, Users, X, Save,
  ChevronLeft, ChevronRight, Edit2, Trash2, Loader2,
} from "lucide-react";

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

  if (loading) return <div className="p-6 sm:p-8 text-ink-muted text-body">Loading…</div>;

  return (
    <div>
      <PageHeader
        title="Companies"
        subtitle={`${total} companies`}
        right={
          <button onClick={() => setModal(true)} className="btn-primary">
            <Plus size={14} /> Add company
          </button>
        }
      />
      <div className="animate-fade-in px-6 sm:px-8">
        {companies.length === 0 ? (
          <div className="shadow-card p-10 text-center rounded-2xl">
            <Building2 size={40} className="mx-auto text-ink-disabled mb-3" />
            <div className="text-section font-display font-semibold">No companies yet</div>
            <p className="text-body text-ink-muted mt-2">Create a company and link leads to it.</p>
          </div>
        ) : (
          <div className="card-floating p-4 border border-line bg-white overflow-hidden overflow-x-auto rounded-2xl">
            <table className="w-full text-table min-w-[700px]">
              <thead>
                <tr className="border-b border-line">
                  <th className="table-header text-left p-3">Name</th>
                  <th className="table-header text-left p-3">Domain</th>
                  <th className="table-header text-left p-3">Industry</th>
                  <th className="table-header text-center p-3">Leads</th>
                  <th className="table-header text-left p-3">Links</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {companies.map((c) => (
                  <tr key={c.id} className="border-b border-line hover:bg-surfacehover transition-colors duration-150">
                    <td className="p-3 font-medium">
                      <Link to={`/app/crm/companies/${c.id}`} className="hover:text-accent">
                        {c.name}
                      </Link>
                    </td>
                    <td className="p-3 font-mono text-ink-secondary text-caption">{c.domain || "—"}</td>
                    <td className="p-3 text-ink-muted text-caption">{c.industry || "—"}</td>
                    <td className="p-3 text-center">{c.lead_count || 0}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        {c.linkedin_url && (
                          <a href={c.linkedin_url} target="_blank" rel="noreferrer"
                            className="text-ink-muted hover:text-accent" title="LinkedIn">
                            <Linkedin size={14} />
                          </a>
                        )}
                        {c.website && (
                          <a href={c.website.startsWith("http") ? c.website : `https://${c.website}`}
                            target="_blank" rel="noreferrer"
                            className="text-ink-muted hover:text-accent" title="Website">
                            <Globe size={14} />
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-right">
                      <button onClick={async () => {
                        if (!window.confirm(`Delete ${c.name}?`)) return;
                        await api.delete(`/companies/${c.id}`);
                        toast.success("Company deleted");
                        load();
                      }} className="text-caption text-ink-muted hover:text-danger">delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center justify-between pt-3 pb-1">
              <span className="text-caption text-ink-muted">
                {total > 0 && `Page ${page} · ${Math.ceil(total / pageSize)} total`}
              </span>
              <div className="flex items-center gap-2">
                <button disabled={page <= 1} onClick={() => load(page - 1)}
                  className="btn-secondary text-xs px-2 py-1 disabled:opacity-30"><ChevronLeft size={14} /></button>
                <button disabled={page >= Math.ceil(total / pageSize)} onClick={() => load(page + 1)}
                  className="btn-secondary text-xs px-2 py-1 disabled:opacity-30"><ChevronRight size={14} /></button>
              </div>
            </div>
          </div>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50">
          <form onSubmit={add} className="bg-white border border-line p-6 rounded-2xl w-full max-w-md space-y-3">
            <div className="text-section font-display font-semibold">Add company</div>
            <input required placeholder="Company name" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full border border-line px-3 py-2 rounded-sm" />
            <input placeholder="Domain (e.g. acme.com)" value={form.domain}
              onChange={(e) => setForm({ ...form, domain: e.target.value })}
              className="w-full border border-line px-3 py-2 rounded-sm" />
            <input placeholder="Website URL" value={form.website}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
              className="w-full border border-line px-3 py-2 rounded-sm" />
            <input placeholder="LinkedIn URL" value={form.linkedin_url}
              onChange={(e) => setForm({ ...form, linkedin_url: e.target.value })}
              className="w-full border border-line px-3 py-2 rounded-sm" />
            <input placeholder="Industry" value={form.industry}
              onChange={(e) => setForm({ ...form, industry: e.target.value })}
              className="w-full border border-line px-3 py-2 rounded-sm" />
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setModal(false)} className="btn-secondary">Cancel</button>
              <button type="submit" className="btn-primary">Add</button>
            </div>
          </form>
        </div>
      )}
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

  if (loading) return <div className="p-6 sm:p-8 text-ink-muted text-body">Loading…</div>;
  if (!company) return <div className="p-6 sm:p-8 text-ink-muted text-body">Company not found.</div>;

  return (
    <div>
      <PageHeader
        title={company.name}
        subtitle={company.industry || company.domain || ""}
        right={
          <div className="flex items-center gap-2">
            <button onClick={() => {
              setEditForm({
                name: company.name, domain: company.domain || "",
                website: company.website || "", linkedin_url: company.linkedin_url || "",
                industry: company.industry || "", description: company.description || "",
                hq_location: company.hq_location || "",
              });
              setEditing(true);
            }} className="btn-secondary text-xs"><Edit2 size={14} /> Edit</button>
            <Link to="/app/crm/companies" className="btn-secondary"><ChevronLeft size={14} /> Companies</Link>
          </div>
        }
      />
      <div className="animate-fade-in px-6 sm:px-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-4">
          <div className="shadow-card p-4 space-y-2 rounded-2xl">
            <div className="ui-label">Company Info</div>
            {editing ? (
              <div className="space-y-2">
                <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full border border-line px-2 py-1 rounded text-input" placeholder="Name" />
                <input value={editForm.domain} onChange={(e) => setEditForm({ ...editForm, domain: e.target.value })}
                  className="w-full border border-line px-2 py-1 rounded text-input" placeholder="Domain" />
                <input value={editForm.website} onChange={(e) => setEditForm({ ...editForm, website: e.target.value })}
                  className="w-full border border-line px-2 py-1 rounded text-input" placeholder="Website" />
                <input value={editForm.linkedin_url} onChange={(e) => setEditForm({ ...editForm, linkedin_url: e.target.value })}
                  className="w-full border border-line px-2 py-1 rounded text-input" placeholder="LinkedIn URL" />
                <input value={editForm.industry} onChange={(e) => setEditForm({ ...editForm, industry: e.target.value })}
                  className="w-full border border-line px-2 py-1 rounded text-input" placeholder="Industry" />
                <input value={editForm.hq_location} onChange={(e) => setEditForm({ ...editForm, hq_location: e.target.value })}
                  className="w-full border border-line px-2 py-1 rounded text-input" placeholder="HQ Location" />
                <textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  className="w-full border border-line px-2 py-1 rounded text-input" placeholder="Description" rows={3} />
                <div className="flex gap-2 pt-1">
                  <button onClick={saveEdit} className="btn-primary text-xs flex items-center gap-1"><Save size={12} /> Save</button>
                  <button onClick={() => setEditing(false)} className="btn-secondary text-xs flex items-center gap-1"><X size={12} /> Cancel</button>
                </div>
              </div>
            ) : (
              <>
                {company.domain && <div className="text-caption font-mono text-ink-secondary">{company.domain}</div>}
                {company.hq_location && (
                  <div className="flex items-center gap-1.5 text-caption text-ink-muted">
                    <MapPin size={12} /> {company.hq_location}
                  </div>
                )}
                <div className="flex items-center gap-2 pt-1">
                  {company.linkedin_url && (
                    <a href={company.linkedin_url} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1 text-caption text-accent hover:underline">
                      <Linkedin size={12} /> LinkedIn
                    </a>
                  )}
                  {company.website && (
                    <a href={company.website.startsWith("http") ? company.website : `https://${company.website}`}
                      target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1 text-caption text-accent hover:underline">
                      <Globe size={12} /> Website
                    </a>
                  )}
                </div>
                {company.description && (
                  <p className="text-caption text-ink-muted pt-1">{company.description}</p>
                )}
                {company.employee_count && (
                  <div className="flex items-center gap-1.5 text-caption text-ink-muted">
                    <Users size={12} /> {company.employee_count.toLocaleString()} employees
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="col-span-1 lg:col-span-2">
          <div className="shadow-card p-4 sm:p-6 rounded-2xl">
            <div className="ui-label mb-3 flex items-center gap-1.5"><Users size={14} /> Leads ({company.lead_count || 0})</div>
            {(!company.leads || company.leads.length === 0) ? (
              <p className="text-caption text-ink-muted">No leads linked to this company.</p>
            ) : (
              <div className="space-y-2">
                {company.leads.map((l) => (
                  <Link key={l.id} to={`/app/crm/leads/${l.id}`}
                    className="flex items-center justify-between p-2 rounded-lg hover:bg-ash transition-colors">
                    <div>
                      <span className="font-medium">{l.first_name} {l.last_name || ""}</span>
                      <span className="text-ink-muted ml-2 font-mono text-caption">{l.email}</span>
                    </div>
                    <span className="text-caption text-ink-muted">{l.title || ""}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
