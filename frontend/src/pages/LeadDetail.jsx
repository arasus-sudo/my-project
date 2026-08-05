import { useCallback, useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { api, isCreditError } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import {
  Mail, Phone, CalendarClock, FileText, Share2, ArrowLeft, Loader2,
  Globe, Flame, ExternalLink, Search, Send, Database,
  Pencil, Check, ListChecks, Plus, Trash2,
  Lock, Linkedin, Building2,
} from "../icons";
import Card from "../components/composites/Card";
import InlineAlert from "../components/composites/InlineAlert";
import { EmptyState } from "../components/composites/EmptyState";
import { TimelineRow } from "../components/domain/RecordHeader";
import Button from "../components/primitives/Button";
import Input from "../components/primitives/Input";
import Select from "../components/primitives/Select";
import Chip from "../components/primitives/Chip";
import StatusPill from "../components/primitives/StatusPill";

const AGENT_ICON = { pitch: Mail, voice: Phone, scheduler: CalendarClock, proposal: FileText, social: Share2 };
const AGENT_LABEL = { pitch: "Pitch EQ", voice: "Voice EQ", scheduler: "Schedule EQ", proposal: "Proposal EQ", social: "Social EQ" };
const BAND_TONE = { hot: "risk", warm: "warning", cool: "neutral", cold: "neutral" };
const STATUS_OPTIONS = ["new", "contacted", "qualified", "unqualified", "unresponsive"];

// Same derivation crm_adapters.py uses internally — prefer an explicit website,
// fall back to the lead's email domain.
function deriveDomain(lead) {
  if (lead?.website) {
    try { return new URL(lead.website.startsWith("http") ? lead.website : `https://${lead.website}`).hostname; }
    catch { return lead.website.replace(/^https?:\/\//, "").split("/")[0]; }
  }
  if (lead?.email && lead.email.includes("@")) return lead.email.split("@")[1];
  return null;
}

export default function LeadDetail() {
  const { id } = useParams();
  const [lead, setLead] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [research, setResearch] = useState(null);
  const [enriching, setEnriching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [lists, setLists] = useState([]);
  const [voiceCalls, setVoiceCalls] = useState([]);
  const [notes, setNotes] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [team, setTeam] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [noteText, setNoteText] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [taskForm, setTaskForm] = useState({ title: "", due_at: "", assignee_id: "" });
  const [companyIntel, setCompanyIntel] = useState(null);
  const [companyIntelStatus, setCompanyIntelStatus] = useState("idle"); // idle | loading | none | crawling
  const [customFieldDefs, setCustomFieldDefs] = useState([]);

  const load = useCallback(() => {
    Promise.all([
      api.get(`/leads/${id}`),
      api.get(`/leads/${id}/timeline`),
      api.get(`/pitch-eq/leads/${id}/research`).catch(() => ({ data: null })),
      api.get("/crm/lists").catch(() => ({ data: [] })),
      api.get("/voice-eq/calls", { params: { lead_id: id } }).catch(() => ({ data: [] })),
      api.get(`/leads/${id}/notes`).catch(() => ({ data: [] })),
      api.get(`/leads/${id}/tasks`).catch(() => ({ data: [] })),
      api.get("/team").catch(() => ({ data: [] })),
      api.get("/companies?page_size=500").catch(() => ({ data: { items: [] } })),
      api.get("/crm/custom-fields", { params: { entity: "lead" } }).catch(() => ({ data: [] })),
    ]).then(([l, t, r, ls, vc, nt, tk, tm, co, cf]) => {
      setLead(l.data); setTimeline(t.data); setResearch(r.data);
      setLists(ls.data); setVoiceCalls(vc.data || []);
      setNotes(nt.data || []); setTasks(tk.data || []); setTeam(tm.data || []);
      setCompanies(co.data?.items || []);
      setCustomFieldDefs((cf.data || []).filter((f) => !f.archived));
      setLoading(false);
    });
  }, [id]);

  useEffect(load, [load]);

  const addTag = async () => {
    const tag = tagInput.trim();
    if (!tag || (lead.tags || []).includes(tag)) { setTagInput(""); return; }
    const tags = [...(lead.tags || []), tag];
    try {
      const { data } = await api.put(`/leads/${id}`, { tags });
      setLead(data); setTagInput("");
    } catch (err) { toast.error(err?.response?.data?.detail || "Failed"); }
  };

  const removeTag = async (tag) => {
    const tags = (lead.tags || []).filter((t) => t !== tag);
    try {
      const { data } = await api.put(`/leads/${id}`, { tags });
      setLead(data);
    } catch (err) { toast.error(err?.response?.data?.detail || "Failed"); }
  };

  const setCustomField = async (key, value) => {
    try {
      const { data } = await api.put(`/leads/${id}`, { custom_fields: { [key]: value } });
      setLead(data);
    } catch (err) { toast.error(err?.response?.data?.detail || "Failed to save field"); }
  };

  const setOwner = async (ownerId) => {
    try {
      const { data } = await api.put(`/leads/${id}`, { owner_id: ownerId || null });
      setLead(data);
      toast.success(ownerId ? "Owner assigned" : "Owner cleared");
    } catch (err) { toast.error(err?.response?.data?.detail || "Failed"); }
  };

  const toggleDnc = async () => {
    try {
      const { data } = await api.put(`/leads/${id}`, { dnc: !lead.dnc });
      setLead(data);
      toast.success(data.dnc ? "Marked do-not-contact" : "Do-not-contact cleared");
    } catch (err) { toast.error(err?.response?.data?.detail || "Failed"); }
  };

  const addNote = async () => {
    if (!noteText.trim()) return;
    try {
      const { data } = await api.post(`/leads/${id}/notes`, { text: noteText.trim() });
      setNotes((n) => [data, ...n]);
      setNoteText("");
      load();
    } catch (err) { toast.error(err?.response?.data?.detail || "Failed"); }
  };

  const deleteNote = async (noteId) => {
    try {
      await api.delete(`/leads/${id}/notes/${noteId}`);
      setNotes((n) => n.filter((x) => x.id !== noteId));
    } catch (err) { toast.error(err?.response?.data?.detail || "Failed"); }
  };

  const addTask = async () => {
    if (!taskForm.title.trim()) return;
    try {
      const { data } = await api.post(`/leads/${id}/tasks`, {
        title: taskForm.title.trim(),
        due_at: taskForm.due_at ? new Date(taskForm.due_at).toISOString() : null,
        assignee_id: taskForm.assignee_id || null,
      });
      setTasks((t) => [...t, data].sort((a, b) => (a.due_at || "").localeCompare(b.due_at || "")));
      setTaskForm({ title: "", due_at: "", assignee_id: "" });
    } catch (err) { toast.error(err?.response?.data?.detail || "Failed"); }
  };

  const toggleTask = async (task) => {
    const status = task.status === "done" ? "open" : "done";
    try {
      const { data } = await api.put(`/tasks/${task.id}`, { status });
      setTasks((ts) => ts.map((t) => (t.id === task.id ? data : t)));
    } catch (err) { toast.error(err?.response?.data?.detail || "Failed"); }
  };

  const deleteTask = async (taskId) => {
    try {
      await api.delete(`/tasks/${taskId}`);
      setTasks((t) => t.filter((x) => x.id !== taskId));
    } catch (err) { toast.error(err?.response?.data?.detail || "Failed"); }
  };

  const enrich = async (force = false) => {
    setEnriching(true);
    try {
      await api.post(`/pitch-eq/leads/${id}/enrich`, null, { params: { force } });
      toast.success("Researched and scored");
      load();
    } catch (err) {
      if (!isCreditError(err)) toast.error("Research failed");
    } finally { setEnriching(false); }
  };

  const loadCompanyIntel = useCallback(async (domain) => {
    setCompanyIntelStatus("loading");
    try {
      const { data } = await api.get(`/company-intel/crawl/${domain}`);
      setCompanyIntel(data);
      setCompanyIntelStatus("done");
    } catch {
      setCompanyIntel(null);
      setCompanyIntelStatus("none");
    }
  }, []);

  useEffect(() => {
    const domain = deriveDomain(lead);
    if (domain) loadCompanyIntel(domain);
    else setCompanyIntelStatus("none");
  }, [lead, loadCompanyIntel]);

  const [converting, setConverting] = useState(false);
  const convertLead = async () => {
    setConverting(true);
    try {
      await api.post(`/leads/${id}/convert`, {});
      toast.success("Converted to deal");
      load();
    } catch (err) {
      if (err?.response?.data?.detail?.error === "deal_exists") {
        toast.error("This lead already has a deal");
      } else {
        toast.error("Convert failed");
      }
    } finally { setConverting(false); }
  };

  const crawlCompany = async () => {
    const domain = deriveDomain(lead);
    if (!domain) return;
    setCompanyIntelStatus("crawling");
    try {
      const { data } = await api.post("/company-intel/crawl", { url: domain });
      setCompanyIntel(data.data);
      setCompanyIntelStatus("done");
    } catch (err) {
      setCompanyIntelStatus("none");
      if (!isCreditError(err)) toast.error("Company research failed");
    }
  };

  const startEdit = () => {
    setEditForm({
      first_name: lead.first_name || "",
      last_name: lead.last_name || "",
      email: lead.email || "",
      phone: lead.phone || "",
      company: lead.company || "",
      title: lead.title || "",
      linkedin_url: lead.linkedin_url || "",
      website: lead.website || "",
      company_id: lead.company_id || "",
      status: lead.status || "new",
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    try {
      const { data } = await api.put(`/leads/${id}`, editForm);
      setLead(data);
      setEditing(false);
      toast.success("Lead updated");
    } catch (err) { toast.error(err?.response?.data?.detail || "Save failed"); }
  };

  if (loading) return <div className="p-6 sm:p-8" style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Loading…</div>;
  if (!lead) return <div className="p-6 sm:p-8" style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Lead not found.</div>;

  const pack = research?.pack;
  const intent = research?.intent || lead.intent;
  const label = { fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em" };
  const kbd = { fontFamily: "var(--font-mono)", fontSize: 11, background: "var(--bg-surface-sunken)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-xs)", padding: "2px 6px", color: "var(--text-secondary)" };

  return (
    <div>
      <PageHeader
        title={`${lead.first_name} ${lead.last_name || ""}`}
        subtitle={lead.company || lead.raw_company_name || lead.company_name || lead.email}
        right={
          <div className="flex items-center gap-2">
            <Button variant="secondary" icon={Pencil} onClick={startEdit}>Edit</Button>
            <Link to="/app/crm/leads" data-testid="back-to-leads"><Button variant="secondary" icon={ArrowLeft}>Leads</Button></Link>
          </div>
        }
      />
      <div className="animate-fade-in px-6 sm:px-8 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-4">
          {/* Contact card with inline editing */}
          <Card title="Contact">
            {editing ? (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input value={editForm.first_name} onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })} placeholder="First name" className="w-1/2" />
                  <Input value={editForm.last_name} onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })} placeholder="Last name" className="w-1/2" />
                </div>
                <Input value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} placeholder="Email" style={{ fontFamily: "var(--font-mono)" }} />
                <Input value={editForm.phone || ""} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} placeholder="Phone" style={{ fontFamily: "var(--font-mono)" }} />
                <Input value={editForm.company || ""} onChange={(e) => setEditForm({ ...editForm, company: e.target.value })} placeholder="Company name" />
                <Input value={editForm.title || ""} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} placeholder="Title" />
                <Input value={editForm.linkedin_url || ""} onChange={(e) => setEditForm({ ...editForm, linkedin_url: e.target.value })} placeholder="LinkedIn URL" style={{ fontFamily: "var(--font-mono)" }} />
                <Input value={editForm.website || ""} onChange={(e) => setEditForm({ ...editForm, website: e.target.value })} placeholder="Website URL" style={{ fontFamily: "var(--font-mono)" }} />
                <Select value={editForm.company_id} onChange={(v) => setEditForm({ ...editForm, company_id: v })} placeholder="No company"
                  options={[{ value: "", label: "No company" }, ...companies.map((c) => ({ value: c.id, label: c.name }))]} />
                <Select value={editForm.status} onChange={(v) => setEditForm({ ...editForm, status: v })}
                  options={STATUS_OPTIONS.map((s) => ({ value: s, label: s }))} />
                <div className="flex gap-2 pt-1">
                  <Button variant="primary" size="sm" icon={Check} onClick={saveEdit}>Save</Button>
                  <Button variant="secondary" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <>
                <div className="tnum" style={{ fontSize: 13, fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{lead.email}</div>
                {lead.phone && <div className="tnum" style={{ fontSize: 13, fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{lead.phone}</div>}
                {lead.title && <div style={{ fontSize: 13, color: "var(--text-tertiary)" }}>{lead.title}</div>}
                <div className="flex items-center gap-3 pt-1 flex-wrap">
                  {lead.linkedin_url && (
                    <a href={lead.linkedin_url.startsWith("http") ? lead.linkedin_url : `https://${lead.linkedin_url}`} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1" style={{ fontSize: 12.5, color: "var(--text-link)" }}>
                      <Linkedin size={12} strokeWidth={1.5} aria-hidden="true" /> LinkedIn
                    </a>
                  )}
                  {lead.website && (
                    <a href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1" style={{ fontSize: 12.5, color: "var(--text-link)" }}>
                      <Globe size={12} strokeWidth={1.5} aria-hidden="true" /> Website
                    </a>
                  )}
                  {lead.company_id && companies.find((c) => c.id === lead.company_id) && (
                    <Link to={`/app/crm/companies/${lead.company_id}`}
                      className="inline-flex items-center gap-1" style={{ fontSize: 12.5, color: "var(--text-link)" }}>
                      <Building2 size={12} strokeWidth={1.5} aria-hidden="true" /> {companies.find((c) => c.id === lead.company_id)?.name}
                    </Link>
                  )}
                </div>
                <div className="flex items-center gap-1.5 pt-2 flex-wrap">
                  <StatusPill status={lead.status} />
                  {intent ? (
                    <span data-testid="lead-intent"><StatusPill tone={BAND_TONE[intent.band]} icon={Flame} status={`${intent.score} ${intent.band}`} /></span>
                  ) : (
                    <span className="tnum" style={{ fontSize: 11.5, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>not scored yet</span>
                  )}
                  {lead.dnc && <StatusPill tone="danger" icon={Lock} status="Do not contact" />}
                </div>
                <div className="pt-2 space-y-1.5">
                  <div style={label}>Owner</div>
                  <Select size="sm" value={lead.owner_id || ""} onChange={setOwner} data-testid="lead-owner-select" placeholder="Unassigned"
                    options={[{ value: "", label: "Unassigned" }, ...team.map((m) => ({ value: m.id, label: m.name }))]} />
                  <button onClick={toggleDnc} data-testid="toggle-dnc" className="inline-flex items-center gap-1 mt-1" style={{ fontSize: 12, color: lead.dnc ? "var(--color-danger)" : "var(--text-tertiary)" }}>
                    <Lock size={12} strokeWidth={1.5} aria-hidden="true" /> {lead.dnc ? "Clear do-not-contact" : "Mark do not contact"}
                  </button>
                </div>
                <div className="pt-2">
                  {lead.deal ? (
                    <Link to="/app/crm/pipeline" data-testid="view-existing-deal"><Button variant="secondary" className="w-full justify-center">View deal — {lead.deal.title}</Button></Link>
                  ) : (
                    <Button variant="primary" className="w-full justify-center" onClick={convertLead} isLoading={converting} data-testid="convert-to-deal">Convert to deal</Button>
                  )}
                </div>
                {customFieldDefs.length > 0 && (
                  <div className="pt-2 space-y-1.5" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                    <div style={label}>Custom fields</div>
                    {customFieldDefs.map((f) => {
                      const value = (lead.custom_fields || {})[f.key] ?? "";
                      if (f.type === "select") {
                        return (
                          <Select key={f.id} label={f.name} size="sm" value={value} onChange={(v) => setCustomField(f.key, v)} data-testid={`custom-field-${f.key}`}
                            options={[{ value: "", label: "—" }, ...(f.options || []).map((o) => ({ value: o, label: o }))]} />
                        );
                      }
                      return (
                        <Input key={f.id} label={f.name} size="sm" type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                          defaultValue={value} data-testid={`custom-field-${f.key}`}
                          onBlur={(e) => { if (e.target.value !== String(value)) setCustomField(f.key, e.target.value); }} />
                      );
                    })}
                  </div>
                )}
              </>
            )}
            {lead.campaign_names?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-2" style={{ borderTop: "1px solid var(--border-subtle)", marginTop: 8 }}>
                {lead.campaign_names.map((cn) => <Chip key={cn} icon={Send} label={cn} />)}
              </div>
            )}
          </Card>

          {/* Tags */}
          <Card title="Tags">
            <div className="flex flex-wrap gap-1.5" style={{ marginBottom: 10 }}>
              {(lead.tags || []).length === 0 && <p style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>No tags yet.</p>}
              {(lead.tags || []).map((t) => <Chip key={t} label={t} onRemove={() => removeTag(t)} />)}
            </div>
            <div className="flex gap-1.5">
              <Input size="sm" value={tagInput} onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
                placeholder="Add a tag…" data-testid="add-tag-input" className="flex-1" />
              <Button variant="secondary" size="sm" icon={Plus} onClick={addTag} data-testid="add-tag-btn" iconOnly aria-label="Add tag" />
            </div>
          </Card>

          {/* Lead Lists membership */}
          <Card title="Lead lists">
            {lists.filter((l) => (l.lead_ids || []).includes(lead.id)).length === 0 ? (
              <p style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>Not in any list.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {lists.filter((l) => (l.lead_ids || []).includes(lead.id)).map((l) => (
                  <Link key={l.id} to="/app/crm/lists"><Chip icon={ListChecks} label={l.name} /></Link>
                ))}
              </div>
            )}
          </Card>

          {/* Why this score */}
          {intent?.reasons?.length > 0 && (
            <Card title="Why this score" data-testid="intent-reasons">
              <ul className="space-y-1.5">
                {intent.reasons.map((r, i) => (
                  <li key={i} style={{ fontSize: 12.5, color: "var(--text-secondary)", borderLeft: "2px solid var(--color-risk)", paddingLeft: 8 }}>{r}</li>
                ))}
              </ul>
            </Card>
          )}

          {lead.deal && (
            <Card title="Deal">
              <div style={{ fontSize: 13.5, fontWeight: 500, color: "var(--text-primary)" }}>{lead.deal.title}</div>
              <div className="flex justify-between items-center pt-1">
                <span className="tnum" style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>${Number(lead.deal.value || 0).toLocaleString()}</span>
                <StatusPill status={lead.deal.stage} />
              </div>
            </Card>
          )}

          {lead.phone && (
            <Link to={`/app/voice-eq/calls?lead_id=${lead.id}`} data-testid="view-call-history">
              <Button variant="secondary" icon={Phone} className="w-full justify-center">Call history</Button>
            </Link>
          )}

          <Link to={`/app/proposal-eq/new?lead_id=${lead.id}`} data-testid="generate-proposal-link">
            <Button variant="secondary" icon={FileText} className="w-full justify-center">Generate proposal</Button>
          </Link>
        </div>

        <div className="col-span-1 lg:col-span-2 space-y-4">
          {/* Voice EQ Calls */}
          {voiceCalls.length > 0 && (
            <Card title={`Recent calls (${voiceCalls.length})`}>
              <div className="space-y-1">
                {voiceCalls.slice(0, 5).map((c) => (
                  <Link key={c.id} to="/app/voice-eq/calls"
                    className="flex items-center justify-between transition-colors"
                    style={{ padding: "8px 10px", borderRadius: "var(--radius-md)", fontSize: 12.5 }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <div className="flex items-center gap-2">
                      <span style={{ width: 8, height: 8, borderRadius: "var(--radius-full)", background: c.status === "ended" ? "var(--color-success)" : c.status === "ongoing" ? "var(--color-primary)" : "var(--border-strong)" }} />
                      <span className="tnum" style={{ fontFamily: "var(--font-mono)", color: "var(--text-tertiary)" }}>{c.to_number}</span>
                    </div>
                    <div style={{ color: "var(--text-tertiary)" }}>
                      {c.duration_seconds ? `${Math.round(c.duration_seconds / 6) / 10}m` : "—"}
                      {c.sentiment && <span className="ml-2">{c.sentiment}</span>}
                    </div>
                  </Link>
                ))}
              </div>
            </Card>
          )}

          {/* Research */}
          <Card data-testid="research-panel">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div style={label}>Research</div>
              <div className="flex items-center gap-3">
                {research?.researched_at && (
                  <span className="tnum" style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
                    {formatDistanceToNow(new Date(research.researched_at), { addSuffix: true })}
                  </span>
                )}
                <Button variant="secondary" size="sm" icon={enriching ? undefined : Search} isLoading={enriching} onClick={() => enrich(!!pack)} data-testid="enrich-btn">
                  {enriching ? "Researching…" : pack ? "Re-research" : "Research this lead"}
                </Button>
              </div>
            </div>

            {!pack ? (
              <p style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginTop: 12 }}>
                Not researched yet. We'll check their site, recent news and public GitHub activity,
                then score how ready they are to hear from you.
              </p>
            ) : !pack.has_signal ? (
              <InlineAlert tone="warning" className="mt-3">
                No public signals found for {pack.company || "this company"}. Any email we write will
                make no claims about them rather than inventing a reason to reach out.
              </InlineAlert>
            ) : (
              <div className="mt-4 space-y-4">
                {pack.perplexity?.summary && (
                  <div data-testid="perplexity-summary">
                    <div className="flex items-center gap-1.5" style={{ ...label, marginBottom: 4 }}>
                      <Search size={12} strokeWidth={1.5} aria-hidden="true" /> Current research
                      <span style={{ color: "var(--text-tertiary)", textTransform: "none", fontWeight: 400 }}>
                        · {pack.perplexity.citations?.length || 0} cited sources
                      </span>
                    </div>
                    <p style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>{pack.perplexity.summary}</p>
                    {pack.perplexity.citations?.length > 0 && (
                      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
                        {pack.perplexity.citations.slice(0, 4).map((url, i) => (
                          <a key={i} href={url} target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-0.5" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                            source {i + 1} <ExternalLink size={12} strokeWidth={1.5} aria-hidden="true" />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {pack.site_summary && (
                  <div>
                    <div className="flex items-center gap-1.5" style={{ ...label, marginBottom: 4 }}>
                      <Globe size={12} strokeWidth={1.5} aria-hidden="true" /> What they do
                    </div>
                    <p className="line-clamp-3" style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>{pack.site_summary}</p>
                  </div>
                )}

                {["funding", "hiring", "product"].some((k) => pack.signals?.[k]?.length > 0) && (
                  <div>
                    <div style={{ ...label, marginBottom: 6 }}>Buying signals</div>
                    <div className="space-y-1.5">
                      {["funding", "hiring", "product"].flatMap((k) =>
                        (pack.signals[k] || []).map((s, i) => (
                          <div key={`${k}-${i}`} className="flex items-start gap-2" style={{ fontSize: 12.5 }}>
                            <span className="shrink-0 uppercase" style={kbd}>{k}</span>
                            <span style={{ color: "var(--text-secondary)" }}>{s}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {pack.news?.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5" style={{ ...label, marginBottom: 6 }}>
                      <FileText size={12} strokeWidth={1.5} aria-hidden="true" /> Recent news
                    </div>
                    <ul className="space-y-1">
                      {pack.news.slice(0, 4).map((n, i) => (
                        <li key={i} style={{ fontSize: 12.5 }}>
                          <a href={n.url} target="_blank" rel="noreferrer" className="inline-flex items-start gap-1" style={{ color: "var(--text-secondary)" }}>
                            <span>{n.title}</span>
                            <ExternalLink size={12} strokeWidth={1.5} aria-hidden="true" className="mt-0.5 shrink-0" style={{ opacity: 0.5 }} />
                          </a>
                          {n.published && <span className="tnum ml-1" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{n.published}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {pack.github?.languages?.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5" style={{ ...label, marginBottom: 6 }}>
                      <Database size={12} strokeWidth={1.5} aria-hidden="true" /> Public tech stack
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {pack.github.languages.map((l) => <span key={l} style={kbd}>{l}</span>)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* Company intelligence */}
          {deriveDomain(lead) && (
            <Card data-testid="company-intel-panel">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-1.5" style={label}><Building2 size={14} strokeWidth={1.5} aria-hidden="true" /> Company</div>
                {companyIntelStatus !== "loading" && (
                  <Button variant="secondary" size="sm" icon={companyIntelStatus === "crawling" ? undefined : Search} isLoading={companyIntelStatus === "crawling"} onClick={crawlCompany} data-testid="company-research-btn">
                    {companyIntelStatus === "crawling" ? "Researching…" : companyIntel ? "Refresh" : "Research company"}
                  </Button>
                )}
              </div>

              {companyIntelStatus === "loading" ? (
                <p style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginTop: 12 }}>Checking for an existing profile…</p>
              ) : !companyIntel?.profile || Object.keys(companyIntel.profile).length === 0 ? (
                <p style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginTop: 12 }}>
                  Not researched yet. We'll crawl {deriveDomain(lead)} and build an AI profile —
                  industry, pain points, competitors — so you have context before you reach out.
                </p>
              ) : (
                <div className="mt-4 space-y-4">
                  {companyIntel.profile.description && <p style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>{companyIntel.profile.description}</p>}
                  <div className="flex flex-wrap gap-1.5">
                    {companyIntel.profile.industry && <span style={kbd}>{companyIntel.profile.industry}</span>}
                    {companyIntel.profile.company_size && <span style={kbd}>{companyIntel.profile.company_size}</span>}
                    {companyIntel.profile.buying_stage && <span style={kbd}>{companyIntel.profile.buying_stage}</span>}
                  </div>
                  {companyIntel.profile.pain_points?.length > 0 && (
                    <div>
                      <div style={{ ...label, marginBottom: 6 }}>Pain points</div>
                      <ul className="space-y-1">
                        {companyIntel.profile.pain_points.slice(0, 5).map((p, i) => (
                          <li key={i} style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>· {p}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {companyIntel.profile.competitors?.length > 0 && (
                    <div>
                      <div style={{ ...label, marginBottom: 6 }}>Competitors</div>
                      <div className="flex flex-wrap gap-1">
                        {companyIntel.profile.competitors.slice(0, 6).map((c) => <span key={c} style={kbd}>{c}</span>)}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Card>
          )}

          {/* Tasks */}
          <Card title="Tasks">
            <div className="space-y-1.5" style={{ marginBottom: 12 }}>
              {tasks.length === 0 && <p style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>No tasks yet.</p>}
              {tasks.map((t) => {
                const overdue = t.status === "open" && t.due_at && new Date(t.due_at) < new Date();
                return (
                  <div key={t.id} data-testid={`task-${t.id}`} className="flex items-start gap-2">
                    <button onClick={() => toggleTask(t)} data-testid={`toggle-task-${t.id}`} className="mt-0.5" style={{ color: t.status === "done" ? "var(--color-success)" : "var(--text-tertiary)" }}>
                      <Check size={16} strokeWidth={1.5} aria-hidden="true" style={{ opacity: t.status === "done" ? 1 : 0.3 }} />
                    </button>
                    <div className="flex-1 min-w-0">
                      <div style={{ fontSize: 13, textDecoration: t.status === "done" ? "line-through" : "none", color: t.status === "done" ? "var(--text-tertiary)" : "var(--text-primary)" }}>{t.title}</div>
                      {t.due_at && (
                        <div className="tnum" style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: overdue ? "var(--color-danger)" : "var(--text-tertiary)" }}>
                          Due {new Date(t.due_at).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                    <button onClick={() => deleteTask(t.id)} style={{ color: "var(--text-tertiary)" }}><Trash2 size={12} strokeWidth={1.5} aria-hidden="true" /></button>
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Input size="sm" value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} placeholder="New task…" data-testid="new-task-title" className="flex-1 min-w-[140px]" />
              <Input size="sm" type="date" value={taskForm.due_at} onChange={(e) => setTaskForm({ ...taskForm, due_at: e.target.value })} data-testid="new-task-due" />
              <Select size="sm" value={taskForm.assignee_id} onChange={(v) => setTaskForm({ ...taskForm, assignee_id: v })} data-testid="new-task-assignee" placeholder="Unassigned"
                options={[{ value: "", label: "Unassigned" }, ...team.map((m) => ({ value: m.id, label: m.name }))]} className="w-36" />
              <Button variant="secondary" size="sm" icon={Plus} onClick={addTask} isDisabled={!taskForm.title.trim()} data-testid="add-task-btn">Add</Button>
            </div>
          </Card>

          {/* Notes */}
          <Card title="Notes">
            <div className="flex gap-2" style={{ marginBottom: 12 }}>
              <Input as="textarea" rows={2} value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Add a note…" data-testid="new-note-text" className="flex-1" />
              <Button variant="secondary" size="sm" onClick={addNote} isDisabled={!noteText.trim()} data-testid="add-note-btn" className="self-start">Add</Button>
            </div>
            <div className="space-y-3">
              {notes.length === 0 && <p style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>No notes yet.</p>}
              {notes.map((n) => (
                <div key={n.id} data-testid={`note-${n.id}`} style={{ borderLeft: "2px solid var(--border-default)", paddingLeft: 12 }}>
                  <div className="flex items-start justify-between gap-2">
                    <p style={{ fontSize: 13, color: "var(--text-primary)" }}>{n.body}</p>
                    <button onClick={() => deleteNote(n.id)} className="shrink-0" style={{ color: "var(--text-tertiary)" }}><Trash2 size={12} strokeWidth={1.5} aria-hidden="true" /></button>
                  </div>
                  <div className="tnum" style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", marginTop: 2 }}>
                    {n.author_name} · {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Activity timeline */}
          <div>
            <div style={{ ...label, marginBottom: 12 }}>Activity timeline</div>
            {timeline.length === 0 ? (
              <EmptyState title="No activity yet" description="An email, call, or booking will show up here." />
            ) : (
              <Card padding="compact" bodyClassName="-mx-5">
                {timeline.map((a) => (
                  <div key={a.id} data-testid={`timeline-item-${a.id}`} style={{ padding: "0 20px" }}>
                    <TimelineRow
                      icon={AGENT_ICON[a.agent] || FileText}
                      title={a.summary}
                      detail={AGENT_LABEL[a.agent] || a.agent}
                      timestamp={formatDistanceToNow(new Date(a.at), { addSuffix: true })}
                    />
                  </div>
                ))}
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
