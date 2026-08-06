import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import {
  Plus, Pencil, Trash2, Copy, Archive, RefreshCw,
  Lightbulb, Zap,
} from "../icons";
import Card from "../components/composites/Card";
import { EmptyState } from "../components/composites/EmptyState";
import { Modal, ModalContent } from "../components/composites/Modal";
import Button from "../components/primitives/Button";
import Input from "../components/primitives/Input";
import Chip from "../components/primitives/Chip";
import SegmentedControl from "../components/primitives/SegmentedControl";
import { Skeleton } from "../components/primitives/Feedback";

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
      await api.post("/services/generate", {
        method: aiMethod,
        input_text: aiInput,
        industry: form.industry || null,
      });
      toast.success("Service created");
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
      await api.post(`/services/${id}/improve`, { competitor_urls: urls });
      toast.success("Service improved");
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
      <div className="space-y-1.5">
        <div style={{ fontSize: 10.5, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
        <div className="flex flex-wrap gap-1.5">
          {list.map((item, i) => <Chip key={i} label={item} />)}
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
            <Button variant="secondary" icon={Zap} onClick={() => setShowAiGen(true)}>Generate</Button>
            <Button variant="primary" icon={Plus} onClick={() => { setEditing(null); setForm({ ...EMPTY_FORM }); setShowForm(true); }}>Add service</Button>
          </div>
        }
      />

      <div className="px-6 sm:px-8 py-6 space-y-6">
        {loading ? (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => <Skeleton key={i} height={160} radius="var(--radius-xl)" />)}
          </div>
        ) : activeItems.length === 0 ? (
          <EmptyState
            icon={Lightbulb}
            title="No services defined yet"
            description="Define your services so campaigns can be targeted to each one. Generate a full service profile from a single sentence or your website."
            actionLabel="Add service"
            onAction={() => { setEditing(null); setForm({ ...EMPTY_FORM }); setShowForm(true); }}
          />
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {activeItems.map((item) => (
              <Card key={item.id} className="flex flex-col">
                <div className="flex items-start justify-between gap-2" style={{ marginBottom: 12 }}>
                  <div className="min-w-0 flex-1">
                    <div className="truncate" style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>{item.name}</div>
                    {item.industry && <div style={{ marginTop: 6 }}><Chip label={item.industry} /></div>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <IconButton icon={Pencil} title="Edit" onClick={() => editItem(item)} />
                    <IconButton icon={Copy} title="Duplicate" onClick={() => duplicate(item.id)} />
                    <IconButton icon={Archive} title="Archive" onClick={() => toggleArchive(item.id)} />
                    <IconButton icon={Trash2} title="Delete" onClick={() => deleteItem(item.id, item.name)} hoverColor="var(--color-danger)" />
                  </div>
                </div>

                {item.description && (
                  <p className="line-clamp-2" style={{ fontSize: 12.5, color: "var(--text-tertiary)", lineHeight: "18px", marginBottom: 12 }}>{item.description}</p>
                )}

                <div className="space-y-2.5 flex-1">
                  <TagDisplay label="Pain points" items={item.pain_points?.slice(0, 3)} />
                  <TagDisplay label="Use cases" items={item.use_cases?.slice(0, 2)} />
                  <TagDisplay label="Competitors" items={item.competitors?.slice(0, 3)} />
                  <TagDisplay label="Keywords" items={item.keywords?.slice(0, 4)} />
                </div>

                <div className="flex items-center justify-between" style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--border-subtle)" }}>
                  {item.cta && <span style={{ fontSize: 12.5, fontWeight: 500, color: "var(--text-primary)" }}>{item.cta}</span>}
                  <button onClick={() => setShowImprove(showImprove === item.id ? null : item.id)}
                    className="flex items-center gap-1 transition-colors ml-auto" style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                    <RefreshCw size={12} strokeWidth={1.5} aria-hidden="true" /> Improve
                  </button>
                </div>

                {showImprove === item.id && (
                  <div className="space-y-2 animate-fade-in" style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border-subtle)" }}>
                    <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>Add competitor URLs (one per line) for context:</div>
                    <Input as="textarea" rows={3} value={compUrls} onChange={(e) => setCompUrls(e.target.value)} placeholder={"https://competitor1.com\nhttps://competitor2.com"} />
                    <div className="flex gap-2">
                      <Button variant="primary" size="sm" icon={RefreshCw} onClick={() => aiImprove(item.id)} isLoading={busy}>Improve</Button>
                      <Button variant="ghost" size="sm" onClick={() => setShowImprove(null)}>Cancel</Button>
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}

        {archivedItems.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 10 }}>
              Archived ({archivedItems.length})
            </div>
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
              {archivedItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between"
                  style={{ padding: 16, borderRadius: "var(--radius-xl)", border: "1px solid var(--border-default)", opacity: 0.6 }}>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 500, color: "var(--text-primary)" }}>{item.name}</div>
                    <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{item.industry || "No industry"}</div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => toggleArchive(item.id)}>Restore</Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <Modal open={showForm} onOpenChange={setShowForm}>
        <ModalContent
          size="lg"
          title={editing ? "Edit service" : "New service"}
          footer={
            <>
              <Button variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button type="submit" form="service-form" variant="primary" isLoading={busy}>{editing ? "Update" : "Create"} service</Button>
            </>
          }
        >
          <form id="service-form" onSubmit={save} className="grid sm:grid-cols-2 gap-4">
            <Input required className="sm:col-span-2" label="Service name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. AI Automation Services" />
            <Input as="textarea" rows={3} className="sm:col-span-2" label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Describe the service…" />
            <Input label="Industry" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} placeholder="e.g. SaaS, Healthcare" />
            <Input label="Target persona" value={form.target_persona} onChange={(e) => setForm({ ...form, target_persona: e.target.value })} placeholder="e.g. VP of Sales, CTO" />
            <Input label="Primary offer" value={form.primary_offer} onChange={(e) => setForm({ ...form, primary_offer: e.target.value })} placeholder="What's the core offering?" />
            <Input label="CTA" value={form.cta} onChange={(e) => setForm({ ...form, cta: e.target.value })} placeholder="e.g. Book a demo" />
            <Input label="Pricing" optional value={form.pricing || ""} onChange={(e) => setForm({ ...form, pricing: e.target.value || null })} placeholder="e.g. $500/mo starting" />
          </form>
        </ModalContent>
      </Modal>

      <Modal open={showAiGen} onOpenChange={setShowAiGen}>
        <ModalContent
          size="md"
          title={<span className="flex items-center gap-2"><Zap size={16} strokeWidth={1.5} aria-hidden="true" style={{ color: "var(--color-intel)" }} /> Generate service</span>}
          subtitle="Describe your service in a sentence, paste a brochure, or enter a website URL."
          footer={
            <>
              <Button variant="secondary" onClick={() => setShowAiGen(false)}>Cancel</Button>
              <Button variant="primary" icon={Zap} onClick={aiGenerate} isLoading={busy} isDisabled={!aiInput.trim()}>Generate</Button>
            </>
          }
        >
          <div className="space-y-4">
            <SegmentedControl
              options={[{ value: "description", label: "Text description" }, { value: "website", label: "Website URL" }]}
              value={aiMethod} onChange={setAiMethod}
            />
            {aiMethod === "description" ? (
              <Input as="textarea" rows={4} value={aiInput} onChange={(e) => setAiInput(e.target.value)}
                placeholder={"Describe your service in one sentence…\ne.g. 'We build automation agents that handle repetitive business processes'"} />
            ) : (
              <Input value={aiInput} onChange={(e) => setAiInput(e.target.value)} placeholder="https://your-service-page.com" />
            )}
          </div>
        </ModalContent>
      </Modal>
    </div>
  );
}

function IconButton({ icon: Icon, title, onClick, hoverColor = "var(--text-primary)" }) {
  return (
    <button onClick={onClick} title={title}
      className="inline-grid place-items-center transition-colors"
      style={{ width: 28, height: 28, borderRadius: "var(--radius-md)", color: "var(--text-tertiary)" }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.color = hoverColor; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-tertiary)"; }}
    >
      <Icon size={14} strokeWidth={1.5} aria-hidden="true" />
    </button>
  );
}
