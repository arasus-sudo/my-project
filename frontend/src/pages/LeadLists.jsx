import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Plus, Trash2, Edit2, Users, Check, X, Save, ArrowLeft, Upload, Download } from "lucide-react";
import LeadListImportDrawer from "./LeadListImportDrawer";

export default function LeadLists() {
  const [lists, setLists] = useState([]);
  const [leads, setLeads] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [importer, setImporter] = useState(null); // { mode, listId } | null

  const load = async () => {
    const [listsRes, leadsRes] = await Promise.all([
      api.get("/crm/lists").catch(() => ({ data: [] })),
      api.get("/leads").catch(() => ({ data: [] })),
    ]);
    setLists(listsRes.data);
    setLeads(leadsRes.data);
  };

  useEffect(() => { load(); }, []);

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
            <Link to="/app/crm" className="btn-secondary text-xs"><ArrowLeft size={13} /> CRM</Link>
            <button onClick={() => setImporter({ mode: "new-list" })} data-testid="upload-leads-btn" className="btn-secondary text-xs">
              <Upload size={13} /> Upload leads
            </button>
            <button onClick={() => setCreating(true)} className="btn-primary text-xs">
              <Plus size={13} /> New List
            </button>
          </div>
        }
      />
      <div className="animate-fade-in px-6 sm:px-8 space-y-4">
        {/* Create form */}
        {creating && (
          <div className="shadow-card p-4 rounded-2xl bg-white space-y-3 border border-primary/20">
            <input value={newName} onChange={(e) => setNewName(e.target.value)}
              placeholder="List name" className="w-full border border-line px-3 py-2 rounded-lg text-input" autoFocus />
            <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Description (optional)" className="w-full border border-line px-3 py-2 rounded-lg text-input" />
            <div className="flex gap-2">
              <button onClick={create} disabled={!newName.trim()} className="btn-primary text-xs"><Save size={12} /> Save</button>
              <button onClick={() => setCreating(false)} className="btn-secondary text-xs">Cancel</button>
            </div>
          </div>
        )}

        {/* Lists */}
        {lists.length === 0 && !creating && (
          <div className="shadow-card p-10 text-center text-body text-ink-muted rounded-2xl bg-white">
            No lead lists yet. Create one to group leads for campaigns, voice calling, or anything else.
          </div>
        )}

        {lists.map((l) => (
          <div key={l.id} className="shadow-card rounded-2xl bg-white overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-line flex items-center justify-between">
              {editingId === l.id ? (
                <div className="flex-1 flex items-center gap-2">
                  <input value={editName} onChange={(e) => setEditName(e.target.value)}
                    className="border border-line px-2 py-1 rounded text-input flex-1" autoFocus />
                  <input value={editDesc} onChange={(e) => setEditDesc(e.target.value)}
                    className="border border-line px-2 py-1 rounded text-input flex-1" placeholder="Description" />
                  <button onClick={() => update(l.id)} className="text-success hover:text-success/80"><Check size={16} /></button>
                  <button onClick={() => setEditingId(null)} className="text-ink-muted hover:text-ink"><X size={16} /></button>
                </div>
              ) : (
                <>
                  <div>
                    <div className="text-card-title font-display font-semibold">{l.name}</div>
                    {l.description && <div className="text-caption text-ink-muted">{l.description}</div>}
                    <div className="text-tiny text-ink-muted font-mono mt-1">{l.lead_ids?.length || 0} leads</div>
                  </div>
                  <div className="flex items-center gap-1">
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
            {/* Lead selection */}
            <div className="max-h-48 overflow-y-auto">
              {leads.map((lead) => {
                const inList = (l.lead_ids || []).includes(lead.id);
                return (
                  <label key={lead.id}
                    className="flex items-center gap-2 px-4 py-2 hover:bg-ash cursor-pointer border-b border-line/50 last:border-b-0 text-caption">
                    <input type="checkbox" checked={inList}
                      onChange={() => toggleLead(l.id, lead.id, inList)} />
                    <div className="flex-1 min-w-0">
                      <span className="font-medium">{lead.first_name} {lead.last_name}</span>
                      <span className="text-ink-muted ml-2">{lead.company}</span>
                    </div>
                    <Link to={`/app/crm/leads/${lead.id}`}
                      className="text-tiny text-primary hover:underline font-mono">View</Link>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
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
