import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, isCreditError } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import LeadListImportDrawer from "./LeadListImportDrawer";
import { toast } from "sonner";
import { Plus, Upload, Download, Phone, Tag, Linkedin, Globe } from "../icons";
import { SkeletonTableRows } from "../components/ui/loading-states";
import Table, { TableFooter } from "../components/composites/Table";
import { EmptyState } from "../components/composites/EmptyState";
import { Modal, ModalContent } from "../components/composites/Modal";
import Button from "../components/primitives/Button";
import Input from "../components/primitives/Input";
import Select from "../components/primitives/Select";
import Chip from "../components/primitives/Chip";
import StatusPill from "../components/primitives/StatusPill";

const BAND_TONE = { hot: "risk", warm: "warning", cool: "neutral", cold: "neutral" };
const STATUSES = ["new", "contacted", "qualified", "unqualified", "unresponsive"];
const BANDS = ["hot", "warm", "cool", "cold"];

/** Intent replaces the old ICP column, which was fake in every write path
 *  (hardcoded 70 on import, `60 + len(company) % 40` elsewhere). An unenriched
 *  lead now says so instead of showing an invented number. */
function IntentCell({ lead }) {
  const intent = lead.intent;
  if (!intent) {
    return <span className="tnum" style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }} title="Not researched yet">not scored</span>;
  }
  return (
    <span title={(intent.reasons || []).join(" · ")} data-testid={`intent-${lead.id}`}>
      <StatusPill tone={BAND_TONE[intent.band] || "neutral"} status={`${intent.score} ${intent.band}`} />
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
  const [selected, setSelected] = useState([]);
  const [selectAllFromAll, setSelectAllFromAll] = useState(false);
  const [selectN, setSelectN] = useState("");
  const [modal, setModal] = useState(false);
  const [importer, setImporter] = useState(false);
  const [listPicker, setListPicker] = useState(false);
  const [tagPrompt, setTagPrompt] = useState(false);
  const [tagValue, setTagValue] = useState("");
  const [callLead, setCallLead] = useState(null);
  const [callAgentId, setCallAgentId] = useState("");
  const [calling, setCalling] = useState(false);
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "", company: "", title: "", linkedin_url: "", website: "", phone: "", tags: "" });
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pageSize, setPageSize] = useState(25);

  const buildParams = (p, ps) => {
    const params = { page: p || page, page_size: ps || pageSize };
    if (q) params.search = q;
    if (statusFilter) params.status = statusFilter;
    if (tagFilter) params.tags = tagFilter;
    if (ownerFilter) params.owner_id = ownerFilter;
    if (bandFilter) params.band = bandFilter;
    if (sortByIntent) params.sort_by = "intent";
    return params;
  };

  const load = (p, ps) => api.get("/leads", { params: buildParams(p, ps) }).then((r) => {
    setLeads(r.data.items);
    setTotal(r.data.total);
    setPage(r.data.page);
    setPageSize(r.data.page_size);
    setLoading(false);
  });
  useEffect(() => {
    load(1);
    api.get("/voice-eq/agents").then((r) => setVoiceAgents(r.data)).catch(() => {});
    api.get("/team").then((r) => setTeam(r.data)).catch(() => {});
    api.get("/crm/lists").then((r) => setLists(r.data)).catch(() => {});
  }, []);

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
      const payload = { ...form, tags: form.tags ? form.tags.split(",").map((t) => t.trim()).filter(Boolean) : [] };
      await api.post("/leads", payload);
      toast.success("Lead added");
      setModal(false);
      setForm({ first_name: "", last_name: "", email: "", company: "", title: "", linkedin_url: "", website: "", phone: "", tags: "" });
      load();
    } catch (err) { toast.error(err?.response?.data?.detail || "Failed"); }
  };

  const remove = async (id) => { await api.delete(`/leads/${id}`); load(); };
  const suppress = async (email) => { await api.post("/suppressions", { email }); toast.success(`Suppressed ${email}`); };

  const exportCsv = async () => {
    const { data } = await api.get("/leads/export", { responseType: "blob" });
    const url = URL.createObjectURL(new Blob([data], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = "leads-export.csv";
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  const toggleSelect = (id) => setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  const selectAllVisible = (checked) => setSelected(checked ? leads.map((l) => l.id) : []);

  useEffect(() => { setPage(1); load(1); }, [q, statusFilter, tagFilter, ownerFilter, bandFilter, sortByIntent]);

  const selectFirstN = async () => {
    const n = parseInt(selectN, 10);
    if (!n || n < 1) return;
    if (!selectAllFromAll) { setSelected(leads.slice(0, n).map((l) => l.id)); return; }
    try {
      const params = {};
      if (q) params.search = q;
      if (statusFilter) params.status = statusFilter;
      if (tagFilter) params.tags = tagFilter;
      if (ownerFilter) params.owner_id = ownerFilter;
      if (bandFilter) params.band = bandFilter;
      const { data } = await api.get("/leads/all-ids", { params });
      setSelected((data.ids || []).slice(0, n));
    } catch { setSelected(leads.slice(0, n).map((l) => l.id)); }
  };

  const bulkDelete = async () => {
    if (!window.confirm(`Delete ${selected.length} lead(s)?`)) return;
    try {
      await api.post("/leads/bulk-delete", { ids: selected });
      toast.success(`${selected.length} lead(s) deleted`);
      setSelected([]);
      load();
    } catch (err) { toast.error(err?.response?.data?.detail || "Failed"); }
  };

  const bulkAddToList = async (listId) => {
    try {
      await api.post(`/crm/lists/${listId}/leads`, { lead_ids: selected });
      toast.success(`Added ${selected.length} lead(s) to list`);
      setListPicker(false);
      setSelected([]);
    } catch (err) { toast.error(err?.response?.data?.detail || "Failed"); }
  };

  const bulkSetStatus = async (status) => {
    try {
      await api.post("/leads/bulk-update", { ids: selected, status });
      toast.success(`Status set on ${selected.length} lead(s)`);
      setSelected([]);
      load();
    } catch (err) { toast.error(err?.response?.data?.detail || "Failed"); }
  };

  const bulkAddTag = async () => {
    if (!tagValue.trim()) return;
    try {
      await api.post("/leads/bulk-update", { ids: selected, add_tag: tagValue.trim() });
      toast.success(`Tagged ${selected.length} lead(s)`);
      setTagPrompt(false); setTagValue("");
      setSelected([]);
      load();
    } catch (err) { toast.error(err?.response?.data?.detail || "Failed"); }
  };

  const columns = [
    { key: "name", label: "Name", render: (l) => <Link to={`/app/crm/leads/${l.id}`} data-testid={`lead-row-${l.id}`} style={{ fontWeight: 500, color: "var(--text-primary)" }}>{l.first_name} {l.last_name}</Link> },
    { key: "email", label: "Email", render: (l) => <span className="tnum" style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-secondary)" }}>{l.email}</span> },
    { key: "company", label: "Company", render: (l) => l.company || l.raw_company_name || l.company_name || "—" },
    {
      key: "links", label: "Links",
      render: (l) => (
        <div className="flex items-center gap-2">
          {(l.linkedin_url || l.linkedin) && <a href={l.linkedin_url || l.linkedin} target="_blank" rel="noreferrer" title="LinkedIn profile" style={{ color: "var(--text-tertiary)" }}><Linkedin size={14} strokeWidth={1.5} aria-hidden="true" /></a>}
          {l.website && <a href={l.website.startsWith("http") ? l.website : `https://${l.website}`} target="_blank" rel="noreferrer" title="Website" style={{ color: "var(--text-tertiary)" }}><Globe size={14} strokeWidth={1.5} aria-hidden="true" /></a>}
          {!(l.linkedin_url || l.linkedin || l.website) && <span style={{ color: "var(--text-tertiary)" }}>—</span>}
        </div>
      ),
    },
    {
      key: "tags", label: "Tags",
      render: (l) => l.tags?.length > 0 ? (
        <div className="flex flex-wrap gap-1">{l.tags.map((t) => <Chip key={t} label={t} />)}</div>
      ) : <span style={{ color: "var(--text-tertiary)" }}>—</span>,
    },
    { key: "owner", label: "Owner", render: (l) => l.owner_name || <span style={{ color: "var(--text-tertiary)" }}>Unassigned</span> },
    { key: "phone", label: "Phone", render: (l) => <span className="tnum" style={{ fontFamily: "var(--font-mono)", color: "var(--text-tertiary)" }}>{l.phone || "—"}</span> },
    { key: "intent", label: "Intent", align: "right", render: (l) => <IntentCell lead={l} /> },
    {
      key: "actions", label: "", align: "right",
      render: (l) => (
        <div className="flex items-center justify-end gap-3 ds-row-action" style={{ fontSize: 12 }}>
          <button onClick={() => l.phone && openCall(l)} disabled={!l.phone} title={l.phone ? "Call with Voice EQ" : "Add a phone number to call this lead"} data-testid={`call-${l.id}`}
            className="inline-flex items-center gap-1" style={{ color: l.phone ? "var(--text-secondary)" : "var(--text-disabled)", cursor: l.phone ? "pointer" : "not-allowed" }}>
            <Phone size={12} strokeWidth={1.5} aria-hidden="true" /> Call
          </button>
          <button onClick={() => suppress(l.email)} data-testid={`suppress-${l.id}`} style={{ color: "var(--text-secondary)" }}>Suppress</button>
          <button onClick={() => remove(l.id)} data-testid={`delete-${l.id}`} style={{ color: "var(--color-danger)" }}>Delete</button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Leads"
        subtitle={`${total} contacts in your workspace.`}
        right={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={Upload} onClick={() => setImporter(true)} data-testid="import-csv-btn">Import</Button>
            <Button variant="secondary" icon={Download} onClick={exportCsv} data-testid="export-leads-btn">Export</Button>
            <Button variant="primary" icon={Plus} onClick={() => setModal(true)} data-testid="add-lead-btn">Add lead</Button>
          </div>
        }
      />
      <div className="animate-fade-in px-6 sm:px-8 py-6">
        <div className="flex flex-wrap gap-2 mb-3 items-center">
          <Input value={q} onChange={(e) => setQ(e.target.value)} data-testid="lead-search" placeholder="Search leads by name, email, company, title…" className="flex-1 min-w-[220px]" />
          <Select value={statusFilter} onChange={setStatusFilter} data-testid="filter-status" placeholder="All statuses" className="w-36"
            options={[{ value: "", label: "All statuses" }, ...STATUSES.map((s) => ({ value: s, label: s }))]} />
          <Input value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} data-testid="filter-tag" placeholder="Tag filter…" className="w-32" />
          <Select value={ownerFilter} onChange={setOwnerFilter} data-testid="filter-owner" placeholder="All owners" className="w-36"
            options={[{ value: "", label: "All owners" }, ...team.map((m) => ({ value: m.id, label: m.name }))]} />
          <Select value={bandFilter} onChange={setBandFilter} data-testid="filter-band" placeholder="All intent" className="w-32"
            options={[{ value: "", label: "All intent" }, ...BANDS.map((b) => ({ value: b, label: b }))]} />
        </div>

        <div className="flex items-center gap-2 mb-3" style={{ fontSize: 12 }}>
          <Input size="sm" type="number" min={1} placeholder="N" value={selectN} onChange={(e) => setSelectN(e.target.value)} className="w-16" />
          <Button variant="tertiary" size="xs" onClick={selectFirstN} isDisabled={!selectN}>Select first N</Button>
          <label className="flex items-center gap-1 cursor-pointer" style={{ color: "var(--text-tertiary)" }}>
            <input type="checkbox" checked={selectAllFromAll} onChange={(e) => setSelectAllFromAll(e.target.checked)} /> All matching
          </label>
        </div>

        {loading ? (
          <div style={{ padding: 16, borderRadius: "var(--radius-xl)", border: "1px solid var(--border-default)", background: "var(--bg-surface)" }}>
            <table className="w-full"><tbody><SkeletonTableRows rows={8} cols={10} /></tbody></table>
          </div>
        ) : leads.length === 0 ? (
          <EmptyState title="No leads yet" description="Import a CSV/XLSX or add leads manually." actionLabel="Add lead" onAction={() => setModal(true)} />
        ) : (
          <>
            <Table
              columns={columns}
              rows={leads}
              rowKey={(l) => l.id}
              selectable
              selected={selected}
              onSelectRow={toggleSelect}
              onSelectAll={selectAllVisible}
              bulkActions={
                <>
                  <Button variant="secondary" size="sm" onClick={() => setListPicker(true)}>Add to list</Button>
                  <Button variant="secondary" size="sm" icon={Tag} onClick={() => setTagPrompt(true)}>Add tag</Button>
                  <Select size="sm" value="" onChange={(v) => v && bulkSetStatus(v)} placeholder="Set status…" className="w-36"
                    options={STATUSES.map((s) => ({ value: s, label: s }))} />
                  <Button variant="danger-subtle" size="sm" onClick={bulkDelete}>Delete selected</Button>
                </>
              }
            />
            <TableFooter page={page} pageCount={Math.max(1, Math.ceil(total / pageSize))} total={total} pageSize={pageSize} onPageChange={load} />
          </>
        )}
      </div>

      <Modal open={modal} onOpenChange={setModal}>
        <ModalContent
          size="sm"
          title="Add lead"
          footer={<><Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button><Button type="submit" form="add-lead-form" variant="primary" data-testid="save-new-lead">Add lead</Button></>}
        >
          <form id="add-lead-form" onSubmit={add} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input required placeholder="First name" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} data-testid="new-lead-fname" />
              <Input placeholder="Last name" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} data-testid="new-lead-lname" />
            </div>
            <Input required type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="new-lead-email" />
            <Input placeholder="Company" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} data-testid="new-lead-company" />
            <Input placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} data-testid="new-lead-title" />
            <Input placeholder="LinkedIn URL" value={form.linkedin_url || ""} onChange={(e) => setForm({ ...form, linkedin_url: e.target.value })} />
            <Input placeholder="Website URL" value={form.website || ""} onChange={(e) => setForm({ ...form, website: e.target.value })} />
            <Input placeholder="Phone (E.164, e.g. +14155551234)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} data-testid="new-lead-phone" />
            <Input placeholder="Tags (comma-separated, e.g. warm, enterprise)" value={form.tags || ""} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
          </form>
        </ModalContent>
      </Modal>

      {importer && <LeadListImportDrawer mode="general" onClose={() => setImporter(false)} onDone={() => { setImporter(false); load(); }} />}

      <Modal open={listPicker} onOpenChange={setListPicker}>
        <ModalContent size="sm" title="Add to list">
          {lists.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>No lists yet — create one in Lead Lists first.</p>
          ) : (
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {lists.map((l) => (
                <button key={l.id} onClick={() => bulkAddToList(l.id)}
                  className="w-full text-left transition-colors"
                  style={{ padding: "10px 12px", borderRadius: "var(--radius-md)", fontSize: 13 }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  {l.name} <span style={{ color: "var(--text-tertiary)", fontSize: 12 }}>({l.lead_ids?.length || 0})</span>
                </button>
              ))}
            </div>
          )}
        </ModalContent>
      </Modal>

      <Modal open={tagPrompt} onOpenChange={setTagPrompt}>
        <ModalContent
          size="sm"
          title="Add tag"
          footer={<><Button variant="secondary" onClick={() => { setTagPrompt(false); setTagValue(""); }}>Cancel</Button><Button variant="primary" onClick={bulkAddTag} isDisabled={!tagValue.trim()}>Apply</Button></>}
        >
          <Input value={tagValue} onChange={(e) => setTagValue(e.target.value)} autoFocus placeholder="e.g. warm-intro" />
        </ModalContent>
      </Modal>

      <Modal open={!!callLead} onOpenChange={(o) => !o && setCallLead(null)}>
        {callLead && (
          <ModalContent
            size="sm"
            title={`Call ${callLead.first_name}`}
            subtitle={`${callLead.phone} · ${callLead.company || "—"}`}
            footer={
              <>
                <Button variant="secondary" onClick={() => setCallLead(null)}>Cancel</Button>
                <Button variant="primary" onClick={placeCall} isLoading={calling} isDisabled={!voiceAgents.length} data-testid="confirm-call-btn">Call now</Button>
              </>
            }
          >
            {voiceAgents.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>No Voice EQ agents yet — create one in Voice EQ first.</p>
            ) : (
              <Select
                value={callAgentId} onChange={setCallAgentId} data-testid="call-agent-select"
                options={voiceAgents.map((a) => ({ value: a.id, label: `${a.name}${a.status !== "synced" ? " (unsynced)" : ""}` }))}
              />
            )}
          </ModalContent>
        )}
      </Modal>
    </div>
  );
}
