import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Check, X, ArrowLeft, Upload, Download, ChevronDown, ChevronRight } from "../icons";
import LeadListImportDrawer from "./LeadListImportDrawer";
import { SkeletonTableRows } from "../components/ui/loading-states";
import { EmptyState } from "../components/composites/EmptyState";
import { TableFooter } from "../components/composites/Table";
import Button from "../components/primitives/Button";
import Input from "../components/primitives/Input";
import Select from "../components/primitives/Select";

export default function LeadLists() {
  const nav = useNavigate();
  const [lists, setLists] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [importer, setImporter] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [listLeads, setListLeads] = useState([]);
  const [listTotal, setListTotal] = useState(0);
  const [listPage, setListPage] = useState(1);
  const [listPageSize, setListPageSize] = useState(25);
  const [listLoading, setListLoading] = useState(false);
  const [listSearch, setListSearch] = useState("");

  const load = async () => {
    const listsRes = await api.get("/crm/lists").catch(() => ({ data: [] }));
    setLists(listsRes.data);
  };

  useEffect(() => { load(); }, []);

  const loadListLeads = async (listId, page, pageSize, search) => {
    setListLoading(true);
    const params = { page: page || 1, page_size: pageSize || listPageSize };
    if (search) params.search = search;
    try {
      const r = await api.get(`/crm/lists/${listId}/leads`, { params });
      setListLeads(r.data.items);
      setListTotal(r.data.total);
      setListPage(r.data.page);
    } catch { setListLeads([]); setListTotal(0); }
    setListLoading(false);
  };

  const expand = (listId) => {
    if (expandedId === listId) {
      setExpandedId(null);
      setListLeads([]);
      setListSearch("");
      return;
    }
    setExpandedId(listId);
    setListPage(1);
    setListSearch("");
    loadListLeads(listId, 1, listPageSize, "");
  };

  const changeListPage = (listId, p) => {
    setListPage(p);
    loadListLeads(listId, p, listPageSize, listSearch);
  };

  const changeListPageSize = (listId, ps) => {
    setListPageSize(ps);
    setListPage(1);
    loadListLeads(listId, 1, ps, listSearch);
  };

  const searchInList = (listId, q) => {
    setListSearch(q);
    setListPage(1);
    loadListLeads(listId, 1, listPageSize, q);
  };

  const create = async () => {
    if (!newName.trim()) return;
    try {
      await api.post("/crm/lists", { name: newName.trim(), description: newDesc.trim() });
      toast.success("List created");
      setNewName(""); setNewDesc(""); setCreating(false);
      load();
    } catch (err) { toast.error(err?.response?.data?.detail || "Failed"); }
  };

  const update = async (id) => {
    try {
      await api.put(`/crm/lists/${id}`, { name: editName.trim(), description: editDesc.trim() });
      toast.success("Updated");
      setEditingId(null);
      load();
    } catch (err) { toast.error(err?.response?.data?.detail || "Failed"); }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this lead list?")) return;
    try {
      await api.delete(`/crm/lists/${id}`);
      toast.success("Deleted");
      load();
    } catch (err) { toast.error(err?.response?.data?.detail || "Failed"); }
  };

  const toggleLead = async (listId, leadId, inList) => {
    try {
      if (inList) {
        await api.delete(`/crm/lists/${listId}/leads/${leadId}`);
      } else {
        await api.post(`/crm/lists/${listId}/leads`, { lead_ids: [leadId] });
      }
      if (expandedId === listId) loadListLeads(listId, listPage, listPageSize, listSearch);
      load();
    } catch (err) { toast.error(err?.response?.data?.detail || "Failed"); }
  };

  const exportList = async (list) => {
    const { data } = await api.get(`/crm/lists/${list.id}/export`, { responseType: "blob" });
    const url = URL.createObjectURL(new Blob([data], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = `${list.name.replace(/\s+/g, "-").toLowerCase()}-export.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader
        title="Lead Lists"
        subtitle="Organize leads into lists that any agent can reference."
        right={
          <div className="flex items-center gap-2">
            <Button variant="secondary" icon={ArrowLeft} onClick={() => nav("/app/crm")}>CRM</Button>
            <Button variant="secondary" size="sm" icon={Upload} onClick={() => setImporter({ mode: "new-list" })} data-testid="upload-leads-btn">Upload leads</Button>
            <Button variant="primary" size="sm" icon={Plus} onClick={() => setCreating(true)}>New list</Button>
          </div>
        }
      />
      <div className="animate-fade-in px-6 sm:px-8 py-6 space-y-3">
        {creating && (
          <div className="space-y-2" style={{ padding: 16, borderRadius: "var(--radius-xl)", background: "var(--bg-surface)", border: "1px solid var(--color-primary-border)", boxShadow: "var(--shadow-xs)" }}>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="List name" autoFocus />
            <Input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Description (optional)" />
            <div className="flex gap-2">
              <Button variant="primary" size="sm" icon={Check} onClick={create} isDisabled={!newName.trim()}>Save</Button>
              <Button variant="secondary" size="sm" onClick={() => setCreating(false)}>Cancel</Button>
            </div>
          </div>
        )}

        {lists.length === 0 && !creating && (
          <EmptyState icon={Plus} title="No lead lists yet" description="Create one to group leads for campaigns, voice calling, or anything else." actionLabel="New list" onAction={() => setCreating(true)} />
        )}

        {lists.map((l) => {
          const isExpanded = expandedId === l.id;
          const totalPages = Math.max(1, Math.ceil(listTotal / listPageSize));
          return (
            <div key={l.id} style={{ borderRadius: "var(--radius-xl)", background: "var(--bg-surface)", border: "1px solid var(--border-default)", boxShadow: "var(--shadow-xs)", overflow: "hidden" }}>
              <div
                onClick={() => expand(l.id)}
                className="flex items-center justify-between cursor-pointer transition-colors"
                style={{ padding: "12px 16px", borderBottom: isExpanded ? "1px solid var(--border-default)" : "none" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                {editingId === l.id ? (
                  <div className="flex-1 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <Input size="sm" value={editName} onChange={(e) => setEditName(e.target.value)} className="flex-1" autoFocus />
                    <Input size="sm" value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="Description" className="flex-1" />
                    <button onClick={() => update(l.id)} style={{ color: "var(--color-success)" }}><Check size={16} strokeWidth={1.5} aria-hidden="true" /></button>
                    <button onClick={() => setEditingId(null)} style={{ color: "var(--text-tertiary)" }}><X size={16} strokeWidth={1.5} aria-hidden="true" /></button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      {isExpanded ? <ChevronDown size={14} strokeWidth={1.5} aria-hidden="true" style={{ color: "var(--text-tertiary)", flexShrink: 0 }} /> : <ChevronRight size={14} strokeWidth={1.5} aria-hidden="true" style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />}
                      <div>
                        <div style={{ fontSize: 13.5, fontWeight: 500, color: "var(--text-primary)" }}>{l.name}</div>
                        {l.description && <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{l.description}</div>}
                        <div className="tnum" style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{l.lead_ids?.length || 0} leads</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                      <IconAction icon={Upload} title="Upload leads into this list" onClick={() => setImporter({ mode: "existing-list", listId: l.id })} data-testid={`upload-into-list-${l.id}`} />
                      <IconAction icon={Download} title="Export CSV" onClick={() => exportList(l)} data-testid={`export-list-${l.id}`} />
                      <IconAction icon={Pencil} title="Rename" onClick={() => { setEditingId(l.id); setEditName(l.name); setEditDesc(l.description || ""); }} />
                      <IconAction icon={Trash2} title="Delete" onClick={() => remove(l.id)} hoverColor="var(--color-danger)" />
                    </div>
                  </>
                )}
              </div>

              {isExpanded && (
                <div>
                  <div className="flex items-center gap-2" style={{ padding: "8px 12px", borderBottom: "1px solid var(--border-default)", background: "var(--bg-surface-sunken)" }}>
                    <Input size="sm" value={listSearch} onChange={(e) => searchInList(l.id, e.target.value)} placeholder="Search leads in this list…" className="flex-1" />
                    <Select
                      size="sm" value={String(listPageSize)} onChange={(v) => changeListPageSize(l.id, parseInt(v, 10))}
                      options={[{ value: "25", label: "25 / page" }, { value: "50", label: "50 / page" }, { value: "100", label: "100 / page" }]}
                      className="w-28"
                    />
                  </div>
                  {listLoading ? (
                    <div style={{ padding: 8 }}>
                      <table className="w-full">
                        <thead><tr style={{ borderBottom: "1px solid var(--border-default)" }}><th className="table-header text-left" style={{ padding: 6, fontSize: 11 }}>Lead</th><th className="table-header text-left" style={{ padding: 6, fontSize: 11 }}>Company</th><th /></tr></thead>
                        <tbody><SkeletonTableRows rows={5} cols={3} /></tbody>
                      </table>
                    </div>
                  ) : listLeads.length === 0 ? (
                    <div className="text-center" style={{ padding: 16, fontSize: 12, color: "var(--text-tertiary)" }}>No leads in this list{listSearch ? " matching your search" : ""}.</div>
                  ) : (
                    <div>
                      {listLeads.map((lead) => (
                        <div key={lead.id}
                          className="flex items-center gap-2 transition-colors"
                          style={{ padding: "8px 16px", borderBottom: "1px solid var(--border-subtle)", fontSize: 12 }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        >
                          <input type="checkbox" checked onChange={() => toggleLead(l.id, lead.id, true)} />
                          <div className="flex-1 min-w-0 flex items-center gap-2">
                            <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>{lead.first_name} {lead.last_name}</span>
                            <span style={{ color: "var(--text-tertiary)" }}>{lead.company || ""}</span>
                            <span className="tnum" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{lead.email}</span>
                          </div>
                          <Link to={`/app/crm/leads/${lead.id}`} className="tnum" style={{ fontSize: 11.5, color: "var(--text-link)", fontFamily: "var(--font-mono)" }}>View</Link>
                        </div>
                      ))}
                      <TableFooter page={listPage} pageCount={totalPages} total={listTotal} pageSize={listPageSize} onPageChange={(p) => changeListPage(l.id, p)} />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {importer && (
        <LeadListImportDrawer
          mode={importer.mode}
          listId={importer.listId}
          onClose={() => setImporter(null)}
          onDone={() => { setImporter(null); load(); }}
        />
      )}
    </div>
  );
}

function IconAction({ icon: Icon, title, onClick, hoverColor = "var(--text-primary)", ...rest }) {
  return (
    <button onClick={onClick} title={title} {...rest}
      className="inline-grid place-items-center transition-colors"
      style={{ width: 26, height: 26, borderRadius: "var(--radius-sm)", color: "var(--text-tertiary)" }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-active)"; e.currentTarget.style.color = hoverColor; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-tertiary)"; }}
    >
      <Icon size={12} strokeWidth={1.5} aria-hidden="true" />
    </button>
  );
}
