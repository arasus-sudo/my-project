import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Plus, Trash2, Edit2, Check, X, Save, ArrowLeft, Upload, Download, ChevronDown, ChevronRight } from "lucide-react";
import LeadListImportDrawer from "./LeadListImportDrawer";
import { SkeletonTableRows } from "../components/ui/loading-states";

export default function LeadLists() {
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
            <Link to="/app/crm" className="btn-secondary text-caption"><ArrowLeft size={14} /> CRM</Link>
            <button onClick={() => setImporter({ mode: "new-list" })} data-testid="upload-leads-btn" className="btn-secondary text-caption">
              <Upload size={14} /> Upload leads
            </button>
            <button onClick={() => setCreating(true)} className="btn-primary text-caption">
              <Plus size={14} /> New List
            </button>
          </div>
        }
      />
      <div className="animate-fade-in px-6 sm:px-8 space-y-4">
        {creating && (
          <div className="shadow-card p-4 rounded-2xl bg-white space-y-3 border border-primary/20">
            <input value={newName} onChange={(e) => setNewName(e.target.value)}
              placeholder="List name" className="w-full border border-line px-3 py-2 rounded-lg text-input" autoFocus />
            <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Description (optional)" className="w-full border border-line px-3 py-2 rounded-lg text-input" />
            <div className="flex gap-2">
              <button onClick={create} disabled={!newName.trim()} className="btn-primary text-caption"><Save size={12} /> Save</button>
              <button onClick={() => setCreating(false)} className="btn-secondary text-caption">Cancel</button>
            </div>
          </div>
        )}

        {lists.length === 0 && !creating && (
          <div className="shadow-card p-10 text-center text-body text-ink-muted rounded-2xl bg-white">
            No lead lists yet. Create one to group leads for campaigns, voice calling, or anything else.
          </div>
        )}

        {lists.map((l) => {
          const isExpanded = expandedId === l.id;
          const totalPages = Math.ceil(listTotal / listPageSize);
          return (
            <div key={l.id} className="shadow-card rounded-2xl bg-white overflow-hidden">
              <div
                onClick={() => expand(l.id)}
                className="p-4 border-b border-line flex items-center justify-between cursor-pointer hover:bg-ash transition-colors"
              >
                {editingId === l.id ? (
                  <div className="flex-1 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <input value={editName} onChange={(e) => setEditName(e.target.value)}
                      className="border border-line px-2 py-1 rounded text-input flex-1" autoFocus />
                    <input value={editDesc} onChange={(e) => setEditDesc(e.target.value)}
                      className="border border-line px-2 py-1 rounded text-input flex-1" placeholder="Description" />
                    <button onClick={() => update(l.id)} className="text-success hover:text-success/80"><Check size={16} /></button>
                    <button onClick={() => setEditingId(null)} className="text-ink-muted hover:text-ink"><X size={16} /></button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      {isExpanded ? <ChevronDown size={16} className="text-ink-muted" /> : <ChevronRight size={16} className="text-ink-muted" />}
                      <div>
                        <div className="text-card-title font-display font-semibold">{l.name}</div>
                        {l.description && <div className="text-caption text-ink-muted">{l.description}</div>}
                        <div className="text-tiny text-ink-muted font-mono mt-1">{l.lead_ids?.length || 0} leads</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => setImporter({ mode: "existing-list", listId: l.id })} title="Upload leads into this list"
                        data-testid={`upload-into-list-${l.id}`}
                        className="p-2 text-ink-muted hover:text-ink rounded-lg hover:bg-ash"><Upload size={14} /></button>
                      <button onClick={() => exportList(l)} title="Export CSV" data-testid={`export-list-${l.id}`}
                        className="p-2 text-ink-muted hover:text-ink rounded-lg hover:bg-ash"><Download size={14} /></button>
                      <button onClick={() => { setEditingId(l.id); setEditName(l.name); setEditDesc(l.description || ""); }}
                        className="p-2 text-ink-muted hover:text-ink rounded-lg hover:bg-ash"><Edit2 size={14} /></button>
                      <button onClick={() => remove(l.id)}
                        className="p-2 text-ink-muted hover:text-danger rounded-lg hover:bg-ash"><Trash2 size={14} /></button>
                    </div>
                  </>
                )}
              </div>

              {isExpanded && (
                <div>
                  <div className="px-4 py-2 border-b border-line flex items-center gap-2 bg-ash/50">
                    <input value={listSearch} onChange={(e) => searchInList(l.id, e.target.value)}
                      placeholder="Search leads in this list…"
                      className="flex-1 border border-line px-2 py-1.5 rounded-sm text-caption focus:outline-none focus:border-ink" />
                    <select value={listPageSize} onChange={(e) => changeListPageSize(l.id, parseInt(e.target.value, 10))}
                      className="border border-line px-2 py-1.5 rounded-sm text-caption">
                      <option value="25">25 / page</option>
                      <option value="50">50 / page</option>
                      <option value="100">100 / page</option>
                    </select>
                  </div>
                  {listLoading ? (
                    <div className="p-2">
                      <table className="w-full text-table">
                        <thead><tr className="border-b border-line"><th className="table-header text-left p-2">Lead</th><th className="table-header text-left p-2">Company</th><th /></tr></thead>
                        <tbody><SkeletonTableRows rows={5} cols={3} /></tbody>
                      </table>
                    </div>
                  ) : listLeads.length === 0 ? (
                    <div className="p-6 text-center text-caption text-ink-muted">No leads in this list{listSearch ? " matching your search" : ""}.</div>
                  ) : (
                    <div>
                      {listLeads.map((lead) => {
                        const inList = true;
                        return (
                          <div key={lead.id}
                            className="flex items-center gap-2 px-4 py-2 hover:bg-ash border-b border-line/50 last:border-b-0 text-caption">
                            <input type="checkbox" checked={inList}
                              onChange={() => toggleLead(l.id, lead.id, inList)} />
                            <div className="flex-1 min-w-0">
                              <span className="font-medium">{lead.first_name} {lead.last_name}</span>
                              <span className="text-ink-muted ml-2">{lead.company || ""}</span>
                              <span className="text-ink-disabled ml-2 font-mono text-tiny">{lead.email}</span>
                            </div>
                            <Link to={`/app/crm/leads/${lead.id}`}
                              className="text-tiny text-primary hover:underline font-mono">View</Link>
                          </div>
                        );
                      })}
                      <div className="flex items-center justify-between px-4 py-2 border-t border-line">
                        <span className="text-tiny text-ink-muted">
                          {listTotal} lead{listTotal === 1 ? "" : "s"} · page {listPage} of {totalPages || 1}
                        </span>
                        <div className="flex items-center gap-1">
                          <button disabled={listPage <= 1}
                            onClick={() => changeListPage(l.id, listPage - 1)}
                            className="btn-secondary text-caption px-2 py-0.5 disabled:opacity-30">Prev</button>
                          <button disabled={listPage >= totalPages}
                            onClick={() => changeListPage(l.id, listPage + 1)}
                            className="btn-secondary text-caption px-2 py-0.5 disabled:opacity-30">Next</button>
                        </div>
                      </div>
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
