import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import {
  Plus, Edit3, Trash2, Copy, Archive, RefreshCw,
  Loader2, Lightbulb, Target, Users, Search, CheckCircle2,
  ChevronDown, ChevronUp, ExternalLink, X, Zap, Globe,
} from "lucide-react";

const EMPTY_FORM = {
  name: "", description: "", pain_points: [], target_persona: "",
  industry: "", keywords: [], cta: "", primary_offer: "", pricing: null,
  competitors: [], use_cases: [], case_studies: [], status: "active",
};

export default function ServiceLibrary() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [busy, setBusy] = useState(false);
  const [showAiGen, setShowAiGen] = useState(false);
  const [aiInput, setAiInput] = useState("");
  const [aiMethod, setAiMethod] = useState("description");
  const [expanded, setExpanded] = useState({});
  const [showImprove, setShowImprove] = useState(null);
  const [compUrls, setCompUrls] = useState("");

  const load = () => api.get("/services").then((r) => {
    setItems(r.data);
    setLoading(false);
  });

  useEffect(() => { load(); }, []);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (editing) {
        await api.put(`/services/${editing}`, form);
        toast.success("Service updated");
      } else {
        await api.post("/services", form);
        toast.success("Service created");
      }
      setShowForm(false);
      setEditing(null);
      setForm({ ...EMPTY_FORM });
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to save");
    } finally { setBusy(false); }
  };

  const editItem = (item) => {
    setForm({
      name: item.name || "",
      description: item.description || "",
      pain_points: item.pain_points || [],
      target_persona: item.target_persona || "",
      industry: item.industry || "",
      keywords: item.keywords || [],
      cta: item.cta || "",
      primary_offer: item.primary_offer || "",
      pricing: item.pricing || null,
      competitors: item.competitors || [],
      use_cases: item.use_cases || [],
      case_studies: item.case_studies || [],
      status: item.status || "active",
    });
    setEditing(item.id);
    setShowForm(true);
  };

  const deleteItem = async (id, name) => {
    if (!window.confirm(`Delete "${name}"?`)) return;
    try {
      await api.delete(`/services/${id}`);
      toast.success("Service deleted");
      load();
    } catch { toast.error("Failed to delete"); }
  };

  const duplicate = async (id) => {
    try {
      await api.post(`/services/${id}/duplicate`);
      toast.success("Duplicated");
      load();
    } catch { toast.error("Failed to duplicate"); }
  };

  const toggleArchive = async (id) => {
    try {
      const { data } = await api.post(`/services/${id}/archive`);
      toast.success(data.status === "archived" ? "Archived" : "Restored");
      load();
    } catch { toast.error("Failed to toggle archive"); }
  };

  const aiGenerate = async () => {
    if (!aiInput.trim()) return;
    setBusy(true);
    try {
      const { data } = await api.post("/services/generate", {
        method: aiMethod,
        input_text: aiInput,
        industry: form.industry || null,
      });
      toast.success("AI-generated service created");
      setShowAiGen(false);
      setAiInput("");
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "AI generation failed");
    } finally { setBusy(false); }
  };

  const aiImprove = async (id) => {
    setBusy(true);
    try {
      const urls = compUrls.split("\n").map((u) => u.trim()).filter(Boolean);
      const { data } = await api.post(`/services/${id}/improve`, { competitor_urls: urls });
      toast.success("Service improved with AI");
      setShowImprove(null);
      setCompUrls("");
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "AI improvement failed");
    } finally { setBusy(false); }
  };

  const activeItems = items.filter((i) => i.status !== "archived");
  const archivedItems = items.filter((i) => i.status === "archived");

  const TagDisplay = ({ label, items: list }) => (
    list?.length > 0 ? (
      <div className="space-y-1">
        <div className="ui-label">{label}</div>
        <div className="flex flex-wrap gap-1">
          {list.map((item, i) => (
            <span key={i} className="pill">{item}</span>
          ))}
        </div>
      </div>
    ) : null
  );

  return (
    <div>
      <PageHeader
        title="Service Library"
        subtitle="Define every service your company offers. Each service becomes a reusable campaign template with automatically generated positioning, messaging, and competitor insights."
        right={
          <div className="flex items-center gap-2">
            <button onClick={() => setShowAiGen(true)} className="btn-secondary text-sm">
              <Zap size={14} /> Generate
            </button>
            <button onClick={() => { setEditing(null); setForm({ ...EMPTY_FORM }); setShowForm(true); }}
              className="btn-primary text-sm">
              <Plus size={14} /> Add Service
            </button>
          </div>
        }
      />

      <div className="px-6 sm:px-8 pt-6 pb-8 space-y-6">
        {loading ? (
          <div className="space-y-3">
            {[1,2,3,4].map(i => <div key={i} className="skeleton h-32 rounded-2xl" />)}
          </div>
        ) : activeItems.length === 0 ? (
          <div className="card-floating p-12 text-center">
            <Lightbulb size={32} className="mx-auto text-ink-disabled mb-4" />
            <div className="text-section font-display font-semibold">No services defined yet</div>
            <p className="text-body text-ink-muted mt-2 max-w-md mx-auto">
              Define your services so campaigns can be targeted to each one. Generate a full service profile from a single sentence or your website.
            </p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {activeItems.map((item) => (
              <div key={item.id} className="card-floating p-5 flex flex-col">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-card-title font-display font-semibold truncate">{item.name}</div>
                    {item.industry && <div className="pill mt-1">{item.industry}</div>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => editItem(item)} className="p-1.5 text-ink-muted hover:text-ink rounded-lg transition-colors" title="Edit">
                      <Edit3 size={14} />
                    </button>
                    <button onClick={() => duplicate(item.id)} className="p-1.5 text-ink-muted hover:text-ink rounded-lg transition-colors" title="Duplicate">
                      <Copy size={14} />
                    </button>
                    <button onClick={() => toggleArchive(item.id)} className="p-1.5 text-ink-muted hover:text-ink rounded-lg transition-colors" title="Archive">
                      <Archive size={14} />
                    </button>
                    <button onClick={() => deleteItem(item.id, item.name)} className="p-1.5 text-ink-muted hover:text-danger rounded-lg transition-colors" title="Delete">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {item.description && (
                  <p className="text-caption text-ink-tertiary leading-relaxed line-clamp-2 mb-3">{item.description}</p>
                )}

                <div className="space-y-2 flex-1">
                  <TagDisplay label="Pain Points" items={item.pain_points?.slice(0, 3)} />
                  <TagDisplay label="Use Cases" items={item.use_cases?.slice(0, 2)} />
                  <TagDisplay label="Competitors" items={item.competitors?.slice(0, 3)} />
                  <TagDisplay label="Keywords" items={item.keywords?.slice(0, 4)} />
                </div>

                <div className="mt-4 pt-3 border-t border-line flex items-center justify-between">
                  {item.cta && <span className="text-caption font-medium text-ink">{item.cta}</span>}
                  <button onClick={() => setShowImprove(showImprove === item.id ? null : item.id)}
                    className="text-caption text-ink-muted hover:text-ink flex items-center gap-1 transition-colors">
                    <RefreshCw size={12} /> Improve
                  </button>
                </div>

                {showImprove === item.id && (
                  <div className="mt-3 pt-3 border-t border-line space-y-2 animate-fade-in">
                    <div className="text-caption text-ink-muted">Add competitor URLs (one per line) for context:</div>
                    <textarea value={compUrls} onChange={(e) => setCompUrls(e.target.value)}
                      placeholder="https://competitor1.com&#10;https://competitor2.com"
                      className="input-premium text-caption py-1.5 h-16" />
                    <div className="flex gap-2">
                      <button onClick={() => aiImprove(item.id)} disabled={busy}
                        className="btn-primary text-xs py-1 disabled:opacity-50">
                        {busy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                        Improve
                      </button>
                      <button onClick={() => setShowImprove(null)} className="btn-ghost text-xs py-1">Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {archivedItems.length > 0 && (
          <div>
            <div className="ui-label mb-3">Archived ({archivedItems.length})</div>
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
              {archivedItems.map((item) => (
                <div key={item.id} className="card-flat p-4 opacity-60 flex items-center justify-between">
                  <div>
                    <div className="text-body font-medium">{item.name}</div>
                    <div className="text-caption text-ink-muted">{item.industry || "No industry"}</div>
                  </div>
                  <button onClick={() => toggleArchive(item.id)} className="btn-ghost text-xs">Restore</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-ink/40 flex items-start justify-center z-50 p-4 pt-12 overflow-y-auto"
          onClick={(e) => e.target === e.currentTarget && setShowForm(false)}>
          <form onSubmit={save} className="bg-white border border-line p-6 rounded-2xl w-full max-w-2xl space-y-4 animate-scale-in my-8">
            <div className="flex items-center justify-between">
              <div className="text-section font-display font-semibold">{editing ? "Edit Service" : "New Service"}</div>
              <button type="button" onClick={() => setShowForm(false)} className="p-1 text-ink-muted hover:text-ink rounded-lg"><X size={16} /></button>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="sm:col-span-2 block">
                <span className="form-label">Service Name</span>
                <input required value={form.name} onChange={(e) => setForm({...form, name: e.target.value})}
                  className="input-premium mt-1" placeholder="e.g. AI Automation Services" />
              </label>
              <label className="sm:col-span-2 block">
                <span className="form-label">Description</span>
                <textarea value={form.description} onChange={(e) => setForm({...form, description: e.target.value})}
                  className="input-premium mt-1 h-20" placeholder="Describe the service..." />
              </label>
              <label className="block">
                <span className="form-label">Industry</span>
                <input value={form.industry} onChange={(e) => setForm({...form, industry: e.target.value})}
                  className="input-premium mt-1" placeholder="e.g. SaaS, Healthcare" />
              </label>
              <label className="block">
                <span className="form-label">Target Persona</span>
                <input value={form.target_persona} onChange={(e) => setForm({...form, target_persona: e.target.value})}
                  className="input-premium mt-1" placeholder="e.g. VP of Sales, CTO" />
              </label>
              <label className="block">
                <span className="form-label">Primary Offer</span>
                <input value={form.primary_offer} onChange={(e) => setForm({...form, primary_offer: e.target.value})}
                  className="input-premium mt-1" placeholder="What's the core offering?" />
              </label>
              <label className="block">
                <span className="form-label">CTA</span>
                <input value={form.cta} onChange={(e) => setForm({...form, cta: e.target.value})}
                  className="input-premium mt-1" placeholder="e.g. Book a demo" />
              </label>
              <label className="block">
                <span className="form-label">Pricing (optional)</span>
                <input value={form.pricing || ""} onChange={(e) => setForm({...form, pricing: e.target.value || null})}
                  className="input-premium mt-1" placeholder="e.g. $500/mo starting" />
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={busy} className="btn-primary">
                {busy ? <Loader2 size={14} className="animate-spin" /> : null}
                {editing ? "Update" : "Create"} Service
              </button>
            </div>
          </form>
        </div>
      )}

      {/* AI Generate Modal */}
      {showAiGen && (
        <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50 p-4"
          onClick={(e) => e.target === e.currentTarget && setShowAiGen(false)}>
          <div className="bg-white border border-line p-6 rounded-2xl w-full max-w-lg space-y-4 animate-scale-in">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-card-title font-display font-semibold flex items-center gap-2">
                  <Zap size={16} /> Generate Service
                </div>
                <p className="text-caption text-ink-muted mt-1">Describe your service in a sentence, paste a brochure, or enter a website URL.</p>
              </div>
              <button onClick={() => setShowAiGen(false)} className="p-1 text-ink-muted hover:text-ink rounded-lg"><X size={16} /></button>
            </div>
            <div className="flex gap-2 pb-2">
              {["description", "website"].map((m) => (
                <button key={m} onClick={() => setAiMethod(m)}
                  className={`px-3 py-1.5 text-xs rounded-xl border transition-all ${
                    aiMethod === m ? "border-transparent bg-accent text-white" : "border-line hover:border-ink/20"
                  }`}>
                  {m === "description" ? "Text Description" : "Website URL"}
                </button>
              ))}
            </div>
            {aiMethod === "description" ? (
              <textarea value={aiInput} onChange={(e) => setAiInput(e.target.value)}
                placeholder="Describe your service in one sentence...&#10;e.g. 'We build AI-powered automation agents that handle repetitive business processes'"
                className="input-premium h-24" />
            ) : (
              <input value={aiInput} onChange={(e) => setAiInput(e.target.value)}
                placeholder="https://your-service-page.com"
                className="input-premium" />
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowAiGen(false)} className="btn-secondary">Cancel</button>
              <button onClick={aiGenerate} disabled={busy || !aiInput.trim()} className="btn-primary">
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                Generate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
