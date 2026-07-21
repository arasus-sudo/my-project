import { useState, useEffect } from "react";
import { api } from "../../lib/api";
import { toast } from "sonner";
import { Plus, X, List, Trash2, Loader2, ChevronRight } from "lucide-react";

export default function LeadListsPanel({ onLoadList, activeListId }) {
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const loadLists = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/lead-intelligence/lists");
      setLists(data.lists || []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { loadLists(); }, []);

  const createList = async () => {
    if (!newName.trim()) return;
    try {
      await api.post("/lead-intelligence/lists", { name: newName.trim() });
      setNewName("");
      setCreating(false);
      loadLists();
      toast.success("List created");
    } catch { toast.error("Failed to create list"); }
  };

  const deleteList = async (id, name) => {
    if (!window.confirm(`Delete "${name}"?`)) return;
    try {
      await api.delete(`/lead-intelligence/lists/${id}`);
      loadLists();
      toast.success("List deleted");
    } catch { toast.error("Failed to delete"); }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-ink uppercase tracking-wider">Lead Lists</span>
        <button onClick={() => setCreating(!creating)}
          className="btn-ghost text-xs py-1 px-1.5 text-ink-muted hover:text-accent">
          <Plus size={13} />
        </button>
      </div>

      {creating && (
        <div className="flex gap-1.5">
          <input value={newName} onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") createList(); }}
            placeholder="List name…"
            className="flex-1 border border-line rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent" autoFocus />
          <button onClick={createList} disabled={!newName.trim()}
            className="btn-primary text-xs py-1.5 px-2 disabled:opacity-50">Save</button>
          <button onClick={() => { setCreating(false); setNewName(""); }}
            className="btn-ghost text-xs py-1.5 px-1.5 text-ink-muted"><X size={13} /></button>
        </div>
      )}

      <div className="space-y-0.5 max-h-48 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-4"><Loader2 size={14} className="animate-spin text-ink-muted" /></div>
        ) : lists.length === 0 ? (
          <p className="text-xs text-ink-muted py-2 text-center">No lists yet</p>
        ) : (
          lists.map((lst) => (
            <div key={lst.id}
              className={`group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-colors text-xs ${
                activeListId === lst.id
                  ? "bg-accent/10 text-accent font-medium"
                  : "hover:bg-ash text-ink"
              }`}
              onClick={() => onLoadList(lst)}>
              <List size={13} className="shrink-0 text-ink-muted" />
              <span className="flex-1 truncate">{lst.name}</span>
              <span className="text-ink-muted font-mono text-[11px]">{lst.lead_count || 0}</span>
              <button onClick={(e) => { e.stopPropagation(); deleteList(lst.id, lst.name); }}
                className="opacity-0 group-hover:opacity-100 text-ink-muted hover:text-red-500 transition-all p-0.5">
                <Trash2 size={11} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
