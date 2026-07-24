import { useCallback, useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { api, isCreditError } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import {
  Mail, Phone, CalendarClock, FileText, Share2, ArrowLeft, Loader2,
  Newspaper, Github, Globe, Flame, ExternalLink, Search, Megaphone, Save, X,
  Edit2, Check, ListChecks, Tag, Plus, Trash2, StickyNote, CheckSquare, Square,
  ShieldOff, Linkedin, Building2,
} from "lucide-react";

const AGENT_ICON = { pitch: Mail, voice: Phone, scheduler: CalendarClock, proposal: FileText, social: Share2 };
const AGENT_LABEL = { pitch: "Pitch EQ", voice: "Voice EQ", scheduler: "Schedule EQ", proposal: "Proposal EQ", social: "Social EQ" };

const BAND_STYLE = {
  hot: "bg-sanguine text-white",
  warm: "bg-warning/20 text-warning border border-warning/30",
  cool: "bg-neutral-100 text-ink-muted border border-line",
  cold: "bg-white text-ink-muted border border-line",
};

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

  if (loading) return <div className="p-6 sm:p-8 text-ink-muted text-body">Loading…</div>;
  if (!lead) return <div className="p-6 sm:p-8 text-ink-muted text-body">Lead not found.</div>;

  const pack = research?.pack;
  const intent = research?.intent || lead.intent;

  return (
    <div>
      <PageHeader
        title={`${lead.first_name} ${lead.last_name || ""}`}
        subtitle={lead.company || lead.raw_company_name || lead.company_name || lead.email}
        right={
          <div className="flex items-center gap-2">
            <button onClick={startEdit} className="btn-secondary text-xs"><Edit2 size={14} /> Edit</button>
            <Link to="/app/crm/leads" data-testid="back-to-leads" className="btn-secondary">
              <ArrowLeft size={14} /> Leads
            </Link>
          </div>
        }
      />
      <div className="animate-fade-in px-6 sm:px-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-4">
          {/* Contact card with inline editing */}
          <div className="shadow-card p-4 space-y-2 rounded-2xl">
            <div className="ui-label">Contact</div>
            {editing ? (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input value={editForm.first_name} onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })}
                    className="w-1/2 border border-line px-2 py-1 rounded text-input" placeholder="First name" />
                  <input value={editForm.last_name} onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })}
                    className="w-1/2 border border-line px-2 py-1 rounded text-input" placeholder="Last name" />
                </div>
                <input value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="w-full border border-line px-2 py-1 rounded text-input font-mono" placeholder="Email" />
                <input value={editForm.phone || ""} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  className="w-full border border-line px-2 py-1 rounded text-input font-mono" placeholder="Phone" />
                <input value={editForm.company || ""} onChange={(e) => setEditForm({ ...editForm, company: e.target.value })}
                  className="w-full border border-line px-2 py-1 rounded text-input" placeholder="Company name" />
                <input value={editForm.title || ""} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  className="w-full border border-line px-2 py-1 rounded text-input" placeholder="Title" />
                <input value={editForm.linkedin_url || ""} onChange={(e) => setEditForm({ ...editForm, linkedin_url: e.target.value })}
                  className="w-full border border-line px-2 py-1 rounded text-input font-mono" placeholder="LinkedIn URL" />
                <input value={editForm.website || ""} onChange={(e) => setEditForm({ ...editForm, website: e.target.value })}
                  className="w-full border border-line px-2 py-1 rounded text-input font-mono" placeholder="Website URL" />
                <select value={editForm.company_id} onChange={(e) => setEditForm({ ...editForm, company_id: e.target.value })}
                  className="w-full border border-line px-2 py-1 rounded text-input">
                  <option value="">No company</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                  className="w-full border border-line px-2 py-1 rounded text-input">
                  {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <div className="flex gap-2 pt-1">
                  <button onClick={saveEdit} className="btn-primary text-xs flex items-center gap-1"><Save size={12} /> Save</button>
                  <button onClick={() => setEditing(false)} className="btn-secondary text-xs flex items-center gap-1"><X size={12} /> Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <div className="text-body font-mono text-ink-secondary">{lead.email}</div>
                {lead.phone && <div className="text-body font-mono text-ink-secondary">{lead.phone}</div>}
                {lead.title && <div className="text-body text-ink-muted">{lead.title}</div>}
                <div className="flex items-center gap-3 pt-1 flex-wrap text-caption">
                  {lead.linkedin_url && (
                    <a href={lead.linkedin_url.startsWith("http") ? lead.linkedin_url : `https://${lead.linkedin_url}`}
                      target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1 text-accent hover:underline">
                      <Linkedin size={12} /> LinkedIn
                    </a>
                  )}
                  {lead.website && (
                    <a href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`}
                      target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1 text-accent hover:underline">
                      <Globe size={12} /> Website
                    </a>
                  )}
                  {lead.company_id && companies.find((c) => c.id === lead.company_id) && (
                    <Link to={`/app/crm/companies/${lead.company_id}`}
                      className="inline-flex items-center gap-1 text-accent hover:underline">
                      <Building2 size={12} /> {companies.find((c) => c.id === lead.company_id)?.name}
                    </Link>
                  )}
                </div>
                <div className="flex items-center gap-2 pt-2 flex-wrap">
                  <span className="ui-label border border-line px-2 py-0.5 rounded-xl">{lead.status}</span>
                  {intent ? (
                    <span data-testid="lead-intent"
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-tiny font-mono font-medium ${BAND_STYLE[intent.band]}`}>
                      <Flame size={12} /> {intent.score} {intent.band}
                    </span>
                  ) : (
                    <span className="text-caption font-mono text-ink-muted">not scored yet</span>
                  )}
                  {lead.dnc && (
                    <span className="inline-flex items-center gap-1 text-tiny font-mono bg-danger/10 text-danger px-2 py-0.5 rounded-full">
                      <ShieldOff size={12} /> Do not contact
                    </span>
                  )}
                </div>
                <div className="pt-2 space-y-1.5">
                  <div className="ui-label">Owner</div>
                  <select value={lead.owner_id || ""} onChange={(e) => setOwner(e.target.value)} data-testid="lead-owner-select"
                    className="w-full border border-line px-2 py-1.5 rounded text-caption">
                    <option value="">Unassigned</option>
                    {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                  <button onClick={toggleDnc} data-testid="toggle-dnc"
                    className={`text-caption inline-flex items-center gap-1 mt-1 ${lead.dnc ? "text-danger" : "text-ink-muted hover:text-ink"}`}>
                    <ShieldOff size={12} /> {lead.dnc ? "Clear do-not-contact" : "Mark do not contact"}
                  </button>
                </div>
                <div className="pt-2">
                  {lead.deal ? (
                    <Link to="/app/crm/pipeline" data-testid="view-existing-deal" className="btn-secondary text-xs w-full justify-center">
                      View deal — {lead.deal.title}
                    </Link>
                  ) : (
                    <button onClick={convertLead} disabled={converting} data-testid="convert-to-deal"
                      className="btn-primary text-xs w-full justify-center disabled:opacity-50">
                      {converting ? <Loader2 size={12} className="animate-spin" /> : null}
                      Convert to Deal
                    </button>
                  )}
                </div>
                {customFieldDefs.length > 0 && (
                  <div className="pt-2 space-y-1.5 border-t border-line/50">
                    <div className="ui-label">Custom fields</div>
                    {customFieldDefs.map((f) => {
                      const value = (lead.custom_fields || {})[f.key] ?? "";
                      if (f.type === "select") {
                        return (
                          <div key={f.id}>
                            <label className="text-tiny text-ink-muted">{f.name}</label>
                            <select value={value} onChange={(e) => setCustomField(f.key, e.target.value)}
                              data-testid={`custom-field-${f.key}`}
                              className="w-full border border-line px-2 py-1.5 rounded text-caption">
                              <option value="">—</option>
                              {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                            </select>
                          </div>
                        );
                      }
                      return (
                        <div key={f.id}>
                          <label className="text-tiny text-ink-muted">{f.name}</label>
                          <input
                            type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                            defaultValue={value}
                            data-testid={`custom-field-${f.key}`}
                            onBlur={(e) => { if (e.target.value !== String(value)) setCustomField(f.key, e.target.value); }}
                            className="w-full border border-line px-2 py-1.5 rounded text-caption"
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
            {lead.campaign_names?.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1 border-t border-line/50">
                {lead.campaign_names.map((cn) => (
                  <span key={cn} className="inline-flex items-center gap-1 text-tiny font-mono bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                    <Megaphone size={12} /> {cn}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Tags */}
          <div className="shadow-card p-4 rounded-2xl">
            <div className="ui-label mb-2 flex items-center gap-1.5"><Tag size={12} /> Tags</div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {(lead.tags || []).length === 0 && <p className="text-caption text-ink-muted">No tags yet.</p>}
              {(lead.tags || []).map((t) => (
                <span key={t} className="inline-flex items-center gap-1 text-tiny font-mono bg-ash text-ink-tertiary px-2 py-0.5 rounded-full">
                  {t}
                  <button onClick={() => removeTag(t)} data-testid={`remove-tag-${t}`} className="hover:text-danger"><X size={12} /></button>
                </span>
              ))}
            </div>
            <div className="flex gap-1.5">
              <input value={tagInput} onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
                placeholder="Add a tag…" data-testid="add-tag-input"
                className="flex-1 border border-line px-2 py-1.5 rounded text-caption" />
              <button onClick={addTag} data-testid="add-tag-btn" className="btn-secondary text-xs"><Plus size={12} /></button>
            </div>
          </div>

          {/* Lead Lists membership */}
          <div className="shadow-card p-4 rounded-2xl">
            <div className="ui-label mb-2">Lead Lists</div>
            {lists.filter((l) => (l.lead_ids || []).includes(lead.id)).length === 0 ? (
              <p className="text-caption text-ink-muted">Not in any list.</p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {lists.filter((l) => (l.lead_ids || []).includes(lead.id)).map((l) => (
                  <Link key={l.id} to="/app/crm/lists"
                    className="inline-flex items-center gap-1 text-tiny font-mono bg-ash text-ink-tertiary px-2 py-0.5 rounded-full hover:bg-neutral-200">
                    <ListChecks size={12} /> {l.name}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Why this score */}
          {intent?.reasons?.length > 0 && (
            <div className="shadow-card p-4 rounded-2xl" data-testid="intent-reasons">
              <div className="ui-label mb-2">Why this score</div>
              <ul className="space-y-1.5 text-caption text-ink-secondary">
                {intent.reasons.map((r, i) => (
                  <li key={i} className="border-l-2 border-sanguine pl-2">{r}</li>
                ))}
              </ul>
            </div>
          )}

          {lead.deal && (
            <div className="shadow-card p-4 space-y-1 rounded-2xl">
              <div className="ui-label">Deal</div>
              <div className="text-body font-medium">{lead.deal.title}</div>
              <div className="flex justify-between items-center pt-1">
                <span className="font-mono text-body font-bold text-ink">${Number(lead.deal.value || 0).toLocaleString()}</span>
                <span className="ui-label border border-line px-2 py-0.5 rounded-xl">{lead.deal.stage}</span>
              </div>
            </div>
          )}

          {lead.phone && (
            <Link to={`/app/voice-eq/calls?lead_id=${lead.id}`} data-testid="view-call-history"
              className="btn-secondary w-full justify-center">
              <Phone size={14} /> Call history
            </Link>
          )}

          <Link to={`/app/proposal-eq/new?lead_id=${lead.id}`} data-testid="generate-proposal-link"
            className="btn-secondary w-full justify-center">
            <FileText size={14} /> Generate proposal
          </Link>
        </div>

        <div className="col-span-1 lg:col-span-2 space-y-6">
          {/* Voice EQ Calls */}
          {voiceCalls.length > 0 && (
            <div className="shadow-card p-4 sm:p-6 rounded-2xl">
              <div className="flex items-center gap-2 ui-label mb-3">
                <Phone size={14} /> Recent calls ({voiceCalls.length})
              </div>
              <div className="space-y-2">
                {voiceCalls.slice(0, 5).map((c) => (
                  <Link key={c.id} to="/app/voice-eq/calls"
                    className="flex items-center justify-between p-2 rounded-lg hover:bg-ash transition-colors text-caption">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${c.status === "ended" ? "bg-success" : c.status === "ongoing" ? "bg-info" : "bg-neutral-300"}`} />
                      <span className="font-mono text-ink-tertiary">{c.to_number}</span>
                    </div>
                    <div className="text-ink-muted">
                      {c.duration_seconds ? `${Math.round(c.duration_seconds / 6) / 10}m` : "—"}
                      {c.sentiment && <span className="ml-2">{c.sentiment}</span>}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Research */}
          <div className="shadow-card p-6 sm:p-8 rounded-2xl" data-testid="research-panel">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="ui-label">Research</div>
              <div className="flex items-center gap-3">
                {research?.researched_at && (
                  <span className="text-tiny text-ink-muted font-mono">
                    {formatDistanceToNow(new Date(research.researched_at), { addSuffix: true })}
                  </span>
                )}
                <button onClick={() => enrich(!!pack)} disabled={enriching}
                  data-testid="enrich-btn" className="btn-secondary text-xs disabled:opacity-50">
                  {enriching ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
                  {enriching ? "Researching…" : pack ? "Re-research" : "Research this lead"}
                </button>
              </div>
            </div>

            {!pack ? (
              <p className="text-caption text-ink-muted mt-3">
                Not researched yet. We'll check their site, recent news and public GitHub activity,
                then score how ready they are to hear from you.
              </p>
            ) : !pack.has_signal ? (
              <div className="mt-3 text-caption bg-warning/10 border border-warning/30 rounded-2xl px-3 py-2 text-warning">
                No public signals found for {pack.company || "this company"}. Any email we write will
                make no claims about them rather than inventing a reason to reach out.
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                {pack.perplexity?.summary && (
                  <div data-testid="perplexity-summary">
                    <div className="flex items-center gap-1.5 ui-label mb-1">
                      <Search size={12} /> Current research
                      <span className="text-ink-muted normal-case font-normal">
                        · {pack.perplexity.citations?.length || 0} cited sources
                      </span>
                    </div>
                    <p className="text-caption text-ink-secondary">{pack.perplexity.summary}</p>
                    {pack.perplexity.citations?.length > 0 && (
                      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
                        {pack.perplexity.citations.slice(0, 4).map((url, i) => (
                          <a key={i} href={url} target="_blank" rel="noreferrer"
                            className="text-tiny text-ink-muted hover:text-ink inline-flex items-center gap-0.5">
                            source {i + 1} <ExternalLink size={12} />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {pack.site_summary && (
                  <div>
                    <div className="flex items-center gap-1.5 ui-label mb-1">
                      <Globe size={12} /> What they do
                    </div>
                    <p className="text-caption text-ink-secondary line-clamp-3">{pack.site_summary}</p>
                  </div>
                )}

                {["funding", "hiring", "product"].some((k) => pack.signals?.[k]?.length > 0) && (
                  <div>
                    <div className="ui-label mb-1.5">Buying signals</div>
                    <div className="space-y-1.5">
                      {["funding", "hiring", "product"].flatMap((k) =>
                        (pack.signals[k] || []).map((s, i) => (
                          <div key={`${k}-${i}`} className="flex items-start gap-2 text-caption">
                            <span className="kbd shrink-0 uppercase">{k}</span>
                            <span className="text-ink-secondary">{s}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {pack.news?.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 ui-label mb-1.5">
                      <Newspaper size={12} /> Recent news
                    </div>
                    <ul className="space-y-1">
                      {pack.news.slice(0, 4).map((n, i) => (
                        <li key={i} className="text-caption">
                          <a href={n.url} target="_blank" rel="noreferrer"
                            className="text-ink-secondary hover:text-ink inline-flex items-start gap-1">
                            <span>{n.title}</span>
                            <ExternalLink size={12} className="mt-0.5 shrink-0 opacity-50" />
                          </a>
                          {n.published && <span className="text-ink-muted font-mono ml-1">{n.published}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {pack.github?.languages?.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 ui-label mb-1.5">
                      <Github size={12} /> Public tech stack
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {pack.github.languages.map((l) => <span key={l} className="kbd">{l}</span>)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Company intelligence */}
          {deriveDomain(lead) && (
            <div className="shadow-card p-6 sm:p-8 rounded-2xl" data-testid="company-intel-panel">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="ui-label flex items-center gap-1.5"><Building2 size={14} /> Company</div>
                {companyIntelStatus !== "loading" && (
                  <button onClick={crawlCompany} disabled={companyIntelStatus === "crawling"}
                    data-testid="company-research-btn" className="btn-secondary text-xs disabled:opacity-50">
                    {companyIntelStatus === "crawling" ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
                    {companyIntelStatus === "crawling" ? "Researching…" : companyIntel ? "Refresh" : "Research company"}
                  </button>
                )}
              </div>

              {companyIntelStatus === "loading" ? (
                <p className="text-caption text-ink-muted mt-3">Checking for an existing profile…</p>
              ) : !companyIntel?.profile || Object.keys(companyIntel.profile).length === 0 ? (
                <p className="text-caption text-ink-muted mt-3">
                  Not researched yet. We'll crawl {deriveDomain(lead)} and build an AI profile —
                  industry, pain points, competitors — so you have context before you reach out.
                </p>
              ) : (
                <div className="mt-4 space-y-4">
                  {companyIntel.profile.description && (
                    <p className="text-caption text-ink-secondary">{companyIntel.profile.description}</p>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {companyIntel.profile.industry && <span className="kbd">{companyIntel.profile.industry}</span>}
                    {companyIntel.profile.company_size && <span className="kbd">{companyIntel.profile.company_size}</span>}
                    {companyIntel.profile.buying_stage && <span className="kbd">{companyIntel.profile.buying_stage}</span>}
                  </div>
                  {companyIntel.profile.pain_points?.length > 0 && (
                    <div>
                      <div className="ui-label mb-1.5">Pain points</div>
                      <ul className="space-y-1">
                        {companyIntel.profile.pain_points.slice(0, 5).map((p, i) => (
                          <li key={i} className="text-caption text-ink-secondary">· {p}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {companyIntel.profile.competitors?.length > 0 && (
                    <div>
                      <div className="ui-label mb-1.5">Competitors</div>
                      <div className="flex flex-wrap gap-1">
                        {companyIntel.profile.competitors.slice(0, 6).map((c) => <span key={c} className="kbd">{c}</span>)}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Tasks */}
          <div className="shadow-card p-4 sm:p-6 rounded-2xl">
            <div className="ui-label mb-3 flex items-center gap-1.5"><CheckSquare size={14} /> Tasks</div>
            <div className="space-y-2 mb-3">
              {tasks.length === 0 && <p className="text-caption text-ink-muted">No tasks yet.</p>}
              {tasks.map((t) => {
                const overdue = t.status === "open" && t.due_at && new Date(t.due_at) < new Date();
                return (
                  <div key={t.id} data-testid={`task-${t.id}`} className="flex items-start gap-2 text-body">
                    <button onClick={() => toggleTask(t)} data-testid={`toggle-task-${t.id}`} className="mt-0.5 text-ink-muted hover:text-ink">
                      {t.status === "done" ? <CheckSquare size={16} className="text-success" /> : <Square size={16} />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className={t.status === "done" ? "line-through text-ink-muted" : ""}>{t.title}</div>
                      {t.due_at && (
                        <div className={`text-tiny font-mono ${overdue ? "text-danger" : "text-ink-muted"}`}>
                          Due {new Date(t.due_at).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                    <button onClick={() => deleteTask(t.id)} className="text-ink-disabled hover:text-danger"><Trash2 size={12} /></button>
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <input value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                placeholder="New task…" data-testid="new-task-title"
                className="flex-1 min-w-[140px] border border-line px-2 py-1.5 rounded text-caption" />
              <input type="date" value={taskForm.due_at} onChange={(e) => setTaskForm({ ...taskForm, due_at: e.target.value })}
                data-testid="new-task-due" className="border border-line px-2 py-1.5 rounded text-caption" />
              <select value={taskForm.assignee_id} onChange={(e) => setTaskForm({ ...taskForm, assignee_id: e.target.value })}
                data-testid="new-task-assignee" className="border border-line px-2 py-1.5 rounded text-caption">
                <option value="">Unassigned</option>
                {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <button onClick={addTask} disabled={!taskForm.title.trim()} data-testid="add-task-btn" className="btn-secondary text-xs disabled:opacity-50">
                <Plus size={12} /> Add
              </button>
            </div>
          </div>

          {/* Notes */}
          <div className="shadow-card p-4 sm:p-6 rounded-2xl">
            <div className="ui-label mb-3 flex items-center gap-1.5"><StickyNote size={14} /> Notes</div>
            <div className="flex gap-2 mb-3">
              <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={2}
                placeholder="Add a note…" data-testid="new-note-text"
                className="flex-1 border border-line px-2 py-1.5 rounded text-input" />
              <button onClick={addNote} disabled={!noteText.trim()} data-testid="add-note-btn"
                className="btn-secondary text-xs self-start disabled:opacity-50">Add</button>
            </div>
            <div className="space-y-3">
              {notes.length === 0 && <p className="text-caption text-ink-muted">No notes yet.</p>}
              {notes.map((n) => (
                <div key={n.id} data-testid={`note-${n.id}`} className="text-body border-l-2 border-line pl-3">
                  <div className="flex items-start justify-between gap-2">
                    <p>{n.body}</p>
                    <button onClick={() => deleteNote(n.id)} className="text-ink-disabled hover:text-danger shrink-0"><Trash2 size={12} /></button>
                  </div>
                  <div className="text-tiny text-ink-muted font-mono mt-0.5">
                    {n.author_name} · {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Activity timeline */}
          <div className="ui-label mb-3">Activity timeline</div>
          {timeline.length === 0 ? (
            <div className="shadow-card p-10 text-center text-body text-ink-muted rounded-2xl">
              No activity yet — an email, call, or booking will show up here.
            </div>
          ) : (
            <div className="space-y-0 border-l border-line ml-3">
              {timeline.map((a) => {
                const Icon = AGENT_ICON[a.agent] || FileText;
                return (
                  <div key={a.id} data-testid={`timeline-item-${a.id}`} className="pl-5 pb-5 relative">
                    <div className="absolute -left-[9px] top-0.5 w-4 h-4 rounded-full bg-white border border-line flex items-center justify-center">
                      <Icon size={12} />
                    </div>
                    <div className="text-caption text-ink-muted font-mono">
                      {AGENT_LABEL[a.agent] || a.agent} · {formatDistanceToNow(new Date(a.at), { addSuffix: true })}
                    </div>
                    <div className="text-body mt-0.5">{a.summary}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
