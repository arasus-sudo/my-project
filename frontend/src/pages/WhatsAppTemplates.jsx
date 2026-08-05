import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Plus, Trash2 } from "../icons";
import Card from "../components/composites/Card";
import { EmptyState } from "../components/composites/EmptyState";
import { Modal, ModalContent } from "../components/composites/Modal";
import StatusPill from "../components/primitives/StatusPill";
import Chip from "../components/primitives/Chip";
import Input from "../components/primitives/Input";
import Select from "../components/primitives/Select";
import Button from "../components/primitives/Button";

const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" }, { value: "es", label: "Spanish" },
  { value: "fr", label: "French" }, { value: "de", label: "German" },
];
const CATEGORY_OPTIONS = [
  { value: "marketing", label: "Marketing" }, { value: "utility", label: "Utility" }, { value: "authentication", label: "Authentication" },
];
const STATUS_TONE = { approved: "success", rejected: "danger", pending: "neutral" };

export default function WhatsAppTemplates() {
  const [items, setItems] = useState([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: "", body: "", language: "en", category: "marketing", tags: "" });

  const load = () => api.get("/whatsapp-eq/templates").then((r) => setItems(r.data));
  useEffect(() => { load(); }, []);

  const save = async (e) => {
    e.preventDefault();
    try {
      await api.post("/whatsapp-eq/templates", { ...form, tags: form.tags.split(",").map(t => t.trim()).filter(Boolean) });
      toast.success("Template saved for mock approval");
      setModal(false); setForm({ name: "", body: "", language: "en", category: "marketing", tags: "" });
      load();
    } catch { toast.error("Save failed"); }
  };
  const del = async (id) => { await api.delete(`/whatsapp-eq/templates/${id}`); load(); };

  return (
    <div>
      <PageHeader title="WhatsApp Templates" subtitle="Message templates submitted for WhatsApp approval."
        right={<Button variant="primary" icon={Plus} onClick={() => setModal(true)}>New template</Button>}
      />
      <div className="animate-fade-in px-6 sm:px-8 py-6">
        {items.length === 0 ? (
          <EmptyState title="No templates yet" description="Submit a template for WhatsApp approval before using it in a broadcast." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((t) => (
              <Card key={t.id}>
                <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>{t.name}</div>
                <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginTop: 4 }}>{t.language} · {t.category}</div>
                <div className="line-clamp-4 whitespace-pre-wrap" style={{ fontSize: 12, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", marginTop: 10 }}>{t.body}</div>
                {t.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5" style={{ marginTop: 12 }}>{t.tags.map((tg) => <Chip key={tg} label={tg} />)}</div>
                )}
                <div className="flex items-center gap-2" style={{ marginTop: 12 }}>
                  <StatusPill status={t.status} tone={STATUS_TONE[t.status] || "neutral"} />
                  <button onClick={() => del(t.id)} className="inline-flex items-center gap-1" style={{ fontSize: 12, color: "var(--color-danger)" }}>
                    <Trash2 size={12} strokeWidth={1.5} aria-hidden="true" /> Delete
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Modal open={modal} onOpenChange={setModal}>
        <ModalContent size="sm" title="New WhatsApp Template"
          footer={
            <>
              <Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
              <Button variant="primary" type="submit" form="whatsapp-template-form">Submit for approval</Button>
            </>
          }
        >
          <form id="whatsapp-template-form" onSubmit={save} className="space-y-3">
            <Input required label="Template name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input as="textarea" rows={4} required label="Message body" hint="Supports {{var}} placeholders" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <Select label="Language" value={form.language} onChange={(v) => setForm({ ...form, language: v })} options={LANGUAGE_OPTIONS} />
              <Select label="Category" value={form.category} onChange={(v) => setForm({ ...form, category: v })} options={CATEGORY_OPTIONS} />
            </div>
            <Input label="Tags" hint="Comma-separated" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
          </form>
        </ModalContent>
      </Modal>
    </div>
  );
}
