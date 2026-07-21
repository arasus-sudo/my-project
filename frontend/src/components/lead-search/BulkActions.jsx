import { useState, useEffect, useRef } from "react";
import { api } from "../../lib/api";
import { toast } from "sonner";
import { Tags, Flag, Megaphone, Loader2, Check, X, ChevronDown } from "lucide-react";

const STATUS_OPTIONS = ["new", "contacted", "qualified", "disqualified", "converted"];

export default function BulkActions({ leadIds, onDone }) {
  const [activeDropdown, setActiveDropdown] = useState(null);
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState({});
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setActiveDropdown(null); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const loadCampaigns = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/lead-intelligence/bulk/campaigns");
      setCampaigns(data.campaigns || []);
    } catch {}
    setLoading(false);
  };

  const handleOpen = (name) => {
    if (activeDropdown === name) { setActiveDropdown(null); return; }
    setActiveDropdown(name);
    if (name === "campaign") loadCampaigns();
    if (name === "tags") setTags([]);
  };

  const doAction = async (endpoint, payload, label) => {
    const key = label + "_" + Date.now();
    setBusy((p) => ({ ...p, [key]: true }));
    try {
      await api.post(endpoint, { lead_ids: leadIds, ...payload });
      toast.success(`${label} applied to ${leadIds.length} lead(s)`);
      setActiveDropdown(null);
      onDone?.();
    } catch (err) {
      toast.error(err?.response?.data?.detail || `${label} failed`);
    }
    setBusy((p) => ({ ...p, [key]: false }));
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) setTags((p) => [...p, t]);
    setTagInput("");
  };

  return (
    <div ref={ref} className="relative flex items-center gap-2">
      {/* Tags */}
      <div className="relative">
        <button onClick={() => handleOpen("tags")}
          className="btn-secondary text-xs py-1.5 flex items-center gap-1">
          <Tags size={11} /> Tags <ChevronDown size={10} />
        </button>
        {activeDropdown === "tags" && (
          <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-line rounded-xl shadow-lg z-50 p-3">
            <div className="flex gap-1.5 mb-2">
              <input value={tagInput} onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addTag(); }}
                placeholder="Add tag…"
                className="flex-1 border border-line rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent" />
              <button onClick={addTag} disabled={!tagInput.trim()}
                className="btn-primary text-xs py-1.5 px-2 disabled:opacity-50"><PlusIcon size={12} /></button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {tags.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 bg-accent/5 border border-accent/20 rounded-full px-2 py-0.5 text-xs text-accent">
                    {t}
                    <button onClick={() => setTags((p) => p.filter((x) => x !== t))}><X size={10} /></button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-1.5">
              <button onClick={() => doAction("/lead-intelligence/bulk/tags", { tags, action: "add" }, "Add tags")}
                disabled={!tags.length || busy["add_tags"]}
                className="btn-primary text-xs py-1.5 flex-1 disabled:opacity-50">
                {busy["add_tags"] ? <Loader2 size={12} className="animate-spin" /> : <PlusIcon size={12} />} Add
              </button>
              <button onClick={() => doAction("/lead-intelligence/bulk/tags", { tags, action: "remove" }, "Remove tags")}
                disabled={!tags.length}
                className="btn-secondary text-xs py-1.5 flex-1">Remove</button>
            </div>
          </div>
        )}
      </div>

      {/* Status */}
      <div className="relative">
        <button onClick={() => handleOpen("status")}
          className="btn-secondary text-xs py-1.5 flex items-center gap-1">
          <Flag size={11} /> Status <ChevronDown size={10} />
        </button>
        {activeDropdown === "status" && (
          <div className="absolute top-full left-0 mt-1 w-44 bg-white border border-line rounded-xl shadow-lg z-50 p-1.5">
            {STATUS_OPTIONS.map((s) => (
              <button key={s} onClick={() => doAction("/lead-intelligence/bulk/status", { status: s }, `Set ${s}`)}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs hover:bg-ash transition-colors text-left capitalize">
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Campaign */}
      <div className="relative">
        <button onClick={() => handleOpen("campaign")}
          className="btn-secondary text-xs py-1.5 flex items-center gap-1">
          <Megaphone size={11} /> Campaign <ChevronDown size={10} />
        </button>
        {activeDropdown === "campaign" && (
          <div className="absolute top-full left-0 mt-1 w-56 bg-white border border-line rounded-xl shadow-lg z-50 p-1.5 max-h-48 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-4"><Loader2 size={14} className="animate-spin text-ink-muted" /></div>
            ) : campaigns.length === 0 ? (
              <p className="text-xs text-ink-muted text-center py-3">No campaigns yet</p>
            ) : (
              campaigns.map((c) => (
                <button key={c.id} onClick={() => doAction("/lead-intelligence/bulk/assign-campaign", { campaign_id: c.id }, `Assign to ${c.name}`)}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs hover:bg-ash transition-colors text-left">
                  <Megaphone size={13} className="shrink-0 text-ink-muted" />
                  <span className="flex-1 truncate">{c.name}</span>
                  <span className="text-ink-muted text-[11px] capitalize">{c.status}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PlusIcon({ size }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>;
}
