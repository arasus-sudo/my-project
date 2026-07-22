import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, isCreditError } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import LeadListImportDrawer from "./LeadListImportDrawer";
import { toast } from "sonner";
import { Plus, Upload, Download, Phone, ArrowUpDown, ArrowDown, Tag, X, ChevronLeft, ChevronRight } from "lucide-react";
import { SkeletonTableRows } from "../components/ui/loading-states";

const BAND_STYLE = {
  hot: "bg-sanguine text-white",
  warm: "bg-warning/20 text-warning border border-warning/30",
  cool: "bg-neutral-100 text-ink-muted border border-line",
  cold: "bg-white text-ink-muted border border-line",
};

/** Intent replaces the old ICP column, which was fake in every write path
 *  (hardcoded 70 on import, `60 + len(company) % 40` elsewhere). An unenriched
 *  lead now says so instead of showing an invented number. */
function IntentCell({ lead }) {
  const intent = lead.intent;
  if (!intent) {
    return (
      <span className="text-tiny text-ink-muted font-mono" title="Not researched yet">
        not scored
      </span>
    );
  }
  return (
    <span
      title={(intent.reasons || []).join(" · ")}
      data-testid={`intent-${lead.id}`}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-tiny font-mono font-medium ${
        BAND_STYLE[intent.band] || BAND_STYLE.cold
      }`}
    >
      {intent.score}
      <span className="uppercase tracking-wider opacity-70">{intent.band}</span>
    </span>
  );
}

export default function Leads() {
  const [leads, setLeads] = useState([]);
  const [voiceAgents, setVoiceAgents] = useState([]);
  const [team, setTeam] = useState([]);
  const [lists, setLists] = useState([]);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [bandFilter, setBandFilter] = useState("");
  const [sortByIntent, setSortByIntent] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [modal, setModal] = useState(false);
  const [importer, setImporter] = useState(false);
  const [listPicker, setListPicker] = useState(false);
  const [tagPrompt, setTagPrompt] = useState(false);
  const [tagValue, setTagValue] = useState("");
  const [callLead, setCallLead] = useState(null);
  const [callAgentId, setCallAgentId] = useState("");
  const [calling, setCalling] = useState(false);
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "", company: "", title: "", phone: "" });
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const pageSize = 25;

  const load = (p) => api.get(`/leads?page=${p || page}&page_size=${pageSize}`).then((r) => {
    setLeads(r.data.items);
    setTotal(r.data.total);
    setPage(r.data.page);
    setLoading(false);
  });
  useEffect(() => {
    load(1);
    api.get("/voice-eq/agents").then((r) => setVoiceAgents(r.data)).catch(() => {});
    api.get("/team").then((r) => setTeam(r.data)).catch(() => {});
    api.get("/crm/lists").then((r) => setLists(r.data)).catch(() => {});
  }, []);

  const allTags = useMemo(() => {
    const s = new Set();
    leads.forEach((l) => (l.tags || []).forEach((t) => s.add(t)));
    return [...s].sort();
  }, [leads]);

  const openCall = (lead) => {
    setCallLead(lead);
    setCallAgentId(voiceAgents[0]?.id || "");
  };

  const placeCall = async () => {
    if (!callAgentId) { toast.error("Pick a voice agent first"); return; }
    setCalling(true);
    try {
      await api.post("/voice-eq/calls/click-to-call", { lead_id: callLead.id, agent_id: callAgentId });
      toast.success(`Calling ${callLead.first_name}…`);
      setCallLead(null);
    } catch (err) {
      if (!isCreditError(err)) toast.error(err?.response?.data?.detail || "Call failed");
    } finally { setCalling(false); }
  };

  const add = async (e) => {
    e.preventDefault();
    try {
      await api.post("/leads", form);
      toast.success("Lead added");
      setModal(false);
      setForm({ first_name: "", last_name: "", email: "", company: "", title: "", phone: "" });
      load();
    } catch (err) { toast.error(err?.response?.data?.detail || "Failed"); }
  };

  const remove = async (id) => {
    await api.delete(`/leads/${id}`);
    load();
  };
  const suppress = async (email) => {
    await api.post("/suppressions", { email });
    toast.success(`Suppressed ${email}`);
  };

  const exportCsv = async () => {
    const { data } = await api.get("/leads/export", { responseType: "blob" });
    const url = URL.createObjectURL(new Blob([data], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = "leads-export.csv";
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  const toggleSelect = (id) => {
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const filtered = leads
    .filter((l) => !q || `${l.first_name} ${l.last_name} ${l.email} ${l.company} ${l.title || ""}`.toLowerCase().includes(q.toLowerCase()))
    .filter((l) => !statusFilter || l.status === statusFilter)
    .filter((l) => !tagFilter || (l.tags || []).includes(tagFilter))
    .filter((l) => !ownerFilter || l.owner_id === ownerFilter)
    .filter((l) => !bandFilter || l.intent?.band === bandFilter)
    // Unscored leads sort last rather than as zero — "we haven't looked yet" is
    // not the same claim as "this lead is cold".
    .sort((a, b) => (sortByIntent
      ? (b.intent?.score ?? -1) - (a.intent?.score ?? -1)
      : 0));

  const selectAllVisible = () => {
    setSelected((s) => {
      const allVisible = filtered.every((l) => s.has(l.id));
      if (allVisible) return new Set();
      return new Set(filtered.map((l) => l.id));
    });
  };

  const bulkDelete = async () => {
    if (!window.confirm(`Delete ${selected.size} lead(s)?`)) return;
    try {
      await api.post("/leads/bulk-delete", { ids: [...selected] });
      toast.success(`${selected.size} lead(s) deleted`);
      setSelected(new Set());
      load();
    } catch (err) { toast.error(err?.response?.data?.detail || "Failed"); }
  };

  const bulkAddToList = async (listId) => {
    try {
      await api.post(`/crm/lists/${listId}/leads`, { lead_ids: [...selected] });
      toast.success(`Added ${selected.size} lead(s) to list`);
      setListPicker(false);
      setSelected(new Set());
    } catch (err) { toast.error(err?.response?.data?.detail || "Failed"); }
  };

  const bulkSetStatus = async (status) => {
    try {
      await api.post("/leads/bulk-update", { ids: [...selected], status });
      toast.success(`Status set on ${selected.size} lead(s)`);
      setSelected(new Set());
      load();
    } catch (err) { toast.error(err?.response?.data?.detail || "Failed"); }
  };

  const bulkAddTag = async () => {
    if (!tagValue.trim()) return;
    try {
      await api.post("/leads/bulk-update", { ids: [...selected], add_tag: tagValue.trim() });
      toast.success(`Tagged ${selected.size} lead(s)`);
      setTagPrompt(false); setTagValue("");
      setSelected(new Set());
      load();
    } catch (err) { toast.error(err?.response?.data?.detail || "Failed"); }
  };

  return (
    <div>
      <PageHeader
        title="Leads"
        subtitle={`${total} contacts in your workspace.`}
        right={
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setImporter(true)} data-testid="import-csv-btn" className="btn-secondary">
              <Upload size={14} /> Import
            </button>
            <button onClick={exportCsv} data-testid="export-leads-btn" className="btn-secondary">
              <Download size={14} /> Export
            </button>
            <button onClick={() => setModal(true)} data-testid="add-lead-btn" className="btn-primary"><Plus size={14} /> Add lead</button>
          </div>
        }
      />
      <div className="animate-fade-in px-6 sm:px-8">
        <div className="flex flex-wrap gap-2 mb-4 items-center">
          <input
            value={q} onChange={(e) => setQ(e.target.value)} data-testid="lead-search"
            placeholder="Search leads by name, email, company, title…"
            className="flex-1 min-w-[220px] border border-line px-3 py-2 rounded-sm focus:outline-none focus:border-ink"
          />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} data-testid="filter-status"
            className="border border-line px-2 py-2 rounded-sm text-input">
            <option value="">All statuses</option>
            {["new", "contacted", "qualified", "unqualified", "unresponsive"].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          {allTags.length > 0 && (
            <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} data-testid="filter-tag"
              className="border border-line px-2 py-2 rounded-sm text-input">
              <option value="">All tags</option>
              {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
          <select value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)} data-testid="filter-owner"
            className="border border-line px-2 py-2 rounded-sm text-input">
            <option value="">All owners</option>
            {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <select value={bandFilter} onChange={(e) => setBandFilter(e.target.value)} data-testid="filter-band"
            className="border border-line px-2 py-2 rounded-sm text-input">
            <option value="">All intent</option>
            {["hot", "warm", "cool", "cold"].map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>

        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-3 p-3 rounded-xl bg-ash border border-line" data-testid="bulk-action-bar">
            <span className="text-caption font-mono text-ink-tertiary mr-2">{selected.size} selected</span>
            <button onClick={() => setListPicker(true)} className="btn-secondary text-xs">Add to list</button>
            <button onClick={() => setTagPrompt(true)} className="btn-secondary text-xs"><Tag size={12} /> Add tag</button>
            <select onChange={(e) => e.target.value && bulkSetStatus(e.target.value)} defaultValue="" className="border border-line px-2 py-1.5 rounded-lg text-caption">
              <option value="" disabled>Set status…</option>
              {["new", "contacted", "qualified", "unqualified", "unresponsive"].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button onClick={bulkDelete} className="text-caption text-danger hover:underline ml-auto">Delete selected</button>
            <button onClick={() => setSelected(new Set())} className="text-caption text-ink-muted hover:text-ink">Clear</button>
          </div>
        )}

        {loading ? (
          <div className="card-floating p-4 border border-line bg-white overflow-hidden overflow-x-auto rounded-2xl">
            <table className="w-full text-table min-w-[900px]">
              <thead>
                <tr className="border-b border-line">
                  <th className="p-3 w-8"></th>
                  <th className="table-header text-left p-3">Name</th>
                  <th className="table-header text-left p-3">Email</th>
                  <th className="table-header text-left p-3">Company</th>
                  <th className="table-header text-left p-3">Tags</th>
                  <th className="table-header text-left p-3">Owner</th>
                  <th className="table-header text-left p-3">Phone</th>
                  <th className="table-header text-right p-3">Intent</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody><SkeletonTableRows rows={8} cols={9} /></tbody>
            </table>
          </div>
        ) : filtered.length === 0 ? (
          <div className="shadow-card p-10 text-center rounded-2xl">
            <div className="text-section font-display font-semibold">No leads yet</div>
            <p className="text-body text-ink-muted mt-2">Import a CSV/XLSX or add leads manually.</p>
          </div>
        ) : (
          <div className="card-floating p-4 border border-line bg-white overflow-hidden overflow-x-auto rounded-2xl">
            <table className="w-full text-table min-w-[900px]">
              <thead>
                <tr className="border-b border-line">
                  <th className="p-3 w-8">
                    <input type="checkbox" checked={filtered.length > 0 && filtered.every((l) => selected.has(l.id))}
                      onChange={selectAllVisible} data-testid="select-all-leads" />
                  </th>
                  <th className="table-header text-left p-3">Name</th>
                  <th className="table-header text-left p-3">Email</th>
                  <th className="table-header text-left p-3">Company</th>
                  <th className="table-header text-left p-3">Tags</th>
                  <th className="table-header text-left p-3">Owner</th>
                  <th className="table-header text-left p-3">Phone</th>
                  <th className="table-header text-right p-3">
                    <button onClick={() => setSortByIntent((s) => !s)} data-testid="sort-intent"
                      className={`inline-flex items-center gap-1 hover:text-ink ${sortByIntent ? "text-ink" : ""}`}>
                      Intent {sortByIntent ? <ArrowDown size={12} /> : <ArrowUpDown size={12} />}
                    </button>
                  </th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((l) => (
                  <tr key={l.id} className="border-b border-line hover:bg-surfacehover transition-colors duration-150">
                    <td className="p-3">
                      <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggleSelect(l.id)} data-testid={`select-${l.id}`} />
                    </td>
                    <td className="p-3 font-medium">
                      <Link to={`/app/crm/leads/${l.id}`} data-testid={`lead-row-${l.id}`} className="hover:text-sanguine">
                        {l.first_name} {l.last_name}
                      </Link>
                    </td>
                    <td className="p-3 font-mono text-ink-secondary">{l.email}</td>
                    <td className="p-3">{l.company}</td>
                    <td className="p-3">
                      {(l.tags?.length > 0) ? (
                        <div className="flex flex-wrap gap-1">
                          {l.tags.map((t) => (
                            <span key={t} className="inline-block text-tiny px-1.5 py-0.5 rounded-full bg-ash text-ink-tertiary font-mono">{t}</span>
                          ))}
                        </div>
                      ) : <span className="text-ink-disabled">—</span>}
                    </td>
                    <td className="p-3 text-ink-muted">{l.owner_name || <span className="text-ink-disabled">Unassigned</span>}</td>
                    <td className="p-3 font-mono text-ink-muted">{l.phone || "—"}</td>
                    <td className="p-3 text-right"><IntentCell lead={l} /></td>
                    <td className="p-3 text-right space-x-2 whitespace-nowrap">
                      <button
                        onClick={() => l.phone && openCall(l)}
                        disabled={!l.phone}
                        title={l.phone ? "Call with Voice EQ" : "Add a phone number to call this lead"}
                        data-testid={`call-${l.id}`}
                        className={`inline-flex items-center gap-1 text-caption ${l.phone ? "text-ink-muted hover:text-ink" : "text-ink-disabled cursor-not-allowed"}`}
                      >
                        <Phone size={12} /> call
                      </button>
                      <button onClick={() => suppress(l.email)} data-testid={`suppress-${l.id}`} className="text-caption text-ink-muted hover:text-ink">suppress</button>
                      <button onClick={() => remove(l.id)} data-testid={`delete-${l.id}`} className="text-caption text-danger hover:underline">delete</button>
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
                <button
                  disabled={page <= 1}
                  onClick={() => load(page - 1)}
                  className="btn-secondary text-xs px-2 py-1 disabled:opacity-30"
                ><ChevronLeft size={14} /></button>
                {Array.from({ length: Math.min(Math.ceil(total / pageSize), 5) }, (_, i) => {
                  const start = Math.max(1, Math.min(page - 2, Math.ceil(total / pageSize) - 4));
                  const n = start + i;
                  return (
                    <button key={n} onClick={() => load(n)}
                      className={`text-xs px-2 py-1 rounded-sm ${n === page ? 'bg-ink text-white' : 'hover:bg-ash'}`}>{n}</button>
                  );
                })}
                <button
                  disabled={page >= Math.ceil(total / pageSize)}
                  onClick={() => load(page + 1)}
                  className="btn-secondary text-xs px-2 py-1 disabled:opacity-30"
                ><ChevronRight size={14} /></button>
              </div>
            </div>
          </div>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50">
          <form onSubmit={add} className="bg-white border border-line p-6 rounded-2xl w-full max-w-md space-y-3">
            <div className="text-section font-display font-semibold">Add lead</div>
            <div className="grid grid-cols-2 gap-3">
              <input required placeholder="First name" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} data-testid="new-lead-fname" className="border border-line px-3 py-2 rounded-sm" />
              <input placeholder="Last name" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} data-testid="new-lead-lname" className="border border-line px-3 py-2 rounded-sm" />
            </div>
            <input required type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="new-lead-email" className="w-full border border-line px-3 py-2 rounded-sm" />
            <input placeholder="Company" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} data-testid="new-lead-company" className="w-full border border-line px-3 py-2 rounded-sm" />
            <input placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} data-testid="new-lead-title" className="w-full border border-line px-3 py-2 rounded-sm" />
            <input placeholder="Phone (E.164, e.g. +14155551234)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} data-testid="new-lead-phone" className="w-full border border-line px-3 py-2 rounded-sm" />
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setModal(false)} className="btn-secondary">Cancel</button>
              <button type="submit" data-testid="save-new-lead" className="btn-primary">Add lead</button>
            </div>
          </form>
        </div>
      )}

      {importer && (
        <LeadListImportDrawer mode="general" onClose={() => setImporter(false)} onDone={() => { setImporter(false); load(); }} />
      )}

      {listPicker && (
        <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50">
          <div className="bg-white border border-line p-6 rounded-2xl w-full max-w-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-card-title font-display font-semibold">Add to list</div>
              <button onClick={() => setListPicker(false)} className="text-ink-muted hover:text-ink"><X size={16} /></button>
            </div>
            {lists.length === 0 ? (
              <p className="text-body text-ink-muted">No lists yet — create one in Lead Lists first.</p>
            ) : (
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {lists.map((l) => (
                  <button key={l.id} onClick={() => bulkAddToList(l.id)}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-ash text-body">
                    {l.name} <span className="text-ink-muted text-caption">({l.lead_ids?.length || 0})</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tagPrompt && (
        <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50">
          <div className="bg-white border border-line p-6 rounded-2xl w-full max-w-sm space-y-3">
            <div className="text-card-title font-display font-semibold">Add tag</div>
            <input value={tagValue} onChange={(e) => setTagValue(e.target.value)} autoFocus
              placeholder="e.g. warm-intro" className="w-full border border-line px-3 py-2 rounded-sm" />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setTagPrompt(false); setTagValue(""); }} className="btn-secondary">Cancel</button>
              <button onClick={bulkAddTag} disabled={!tagValue.trim()} className="btn-primary disabled:opacity-50">Apply</button>
            </div>
          </div>
        </div>
      )}

      {callLead && (
        <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50">
          <div className="bg-white border border-line p-6 rounded-2xl w-full max-w-sm space-y-3">
            <div className="text-section font-display font-semibold">Call {callLead.first_name}</div>
            <p className="text-body text-ink-muted">{callLead.phone} · {callLead.company || "—"}</p>
            {voiceAgents.length === 0 ? (
              <p className="text-body text-ink-muted">No Voice EQ agents yet — create one in Voice EQ first.</p>
            ) : (
              <select
                value={callAgentId}
                onChange={(e) => setCallAgentId(e.target.value)}
                data-testid="call-agent-select"
                className="w-full border border-line px-3 py-2 rounded-sm"
              >
                {voiceAgents.map((a) => (
                  <option key={a.id} value={a.id}>{a.name} {a.status !== "synced" ? "(unsynced)" : ""}</option>
                ))}
              </select>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setCallLead(null)} className="btn-secondary">Cancel</button>
              <button
                onClick={placeCall}
                disabled={calling || !voiceAgents.length}
                data-testid="confirm-call-btn"
                className="btn-primary disabled:opacity-50"
              >
                {calling ? "Calling…" : "Call now"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
