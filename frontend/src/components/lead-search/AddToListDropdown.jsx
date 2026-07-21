import { useState, useEffect, useRef } from "react";
import { api } from "../../lib/api";
import { toast } from "sonner";
import { List, Plus, Check, Loader2 } from "lucide-react";

export default function AddToListDropdown({ leadIds, onDone }) {
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState({});
  const [newName, setNewName] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api.get("/lead-intelligence/lists").then(({ data }) => {
      setLists(data.lists || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const addToList = async (listId) => {
    setAdding((p) => ({ ...p, [listId]: true }));
    try {
      await api.post(`/lead-intelligence/lists/${listId}/leads`, { lead_ids: leadIds });
      toast.success(`Added ${leadIds.length} lead(s) to list`);
      onDone?.();
    } catch { toast.error("Failed to add to list"); }
    setAdding((p) => ({ ...p, [listId]: false }));
  };

  const createAndAdd = async () => {
    if (!newName.trim()) return;
    try {
      const { data } = await api.post("/lead-intelligence/lists", { name: newName.trim() });
      await addToList(data.id);
      setNewName("");
      toast.success("List created and leads added");
    } catch { toast.error("Failed"); }
  };

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)}
        className="btn-secondary text-xs py-1.5 flex items-center gap-1">
        <List size={11} /> Add to List
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-56 bg-white border border-line rounded-xl shadow-lg z-50 p-2 max-h-64 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-4"><Loader2 size={14} className="animate-spin text-ink-muted" /></div>
          ) : (
            <>
              {lists.map((lst) => (
                <button key={lst.id} onClick={() => addToList(lst.id)} disabled={adding[lst.id]}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs hover:bg-ash transition-colors text-left disabled:opacity-50">
                  <List size={13} className="shrink-0 text-ink-muted" />
                  <span className="flex-1 truncate">{lst.name}</span>
                  <span className="text-ink-muted font-mono">{lst.lead_count || 0}</span>
                  {adding[lst.id] ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} className="opacity-0 group-hover:opacity-100" />}
                </button>
              ))}
              <div className="border-t border-line my-1.5 pt-1.5 flex gap-1">
                <input value={newName} onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") createAndAdd(); }}
                  placeholder="New list name…"
                  className="flex-1 border border-line rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent" />
                <button onClick={createAndAdd} disabled={!newName.trim()}
                  className="btn-primary text-xs py-1.5 px-2 disabled:opacity-50"><Plus size={12} /></button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
