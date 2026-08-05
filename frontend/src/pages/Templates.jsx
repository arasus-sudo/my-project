import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Plus, Trash2, FileText } from "../icons";
import Card from "../components/composites/Card";
import { EmptyState } from "../components/composites/EmptyState";
import { Modal, ModalContent } from "../components/composites/Modal";
import Button from "../components/primitives/Button";
import Input from "../components/primitives/Input";
import Chip from "../components/primitives/Chip";

export default function Templates() {
  const [items, setItems] = useState([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: "", subject: "", body: "", tags: "" });

  const load = () => api.get("/templates").then((r) => setItems(r.data));
  useEffect(() => { load(); }, []);

  const save = async (e) => {
    e.preventDefault();
    try {
      await api.post("/templates", { ...form, tags: form.tags.split(",").map(t => t.trim()).filter(Boolean) });
      toast.success("Template saved");
      setModal(false); setForm({ name: "", subject: "", body: "", tags: "" });
      load();
    } catch { toast.error("Save failed"); }
  };
  const del = async (id) => {
    await api.delete(`/templates/${id}`); load();
  };

  return (
    <div>
      <PageHeader title="Templates" subtitle="Reusable email drafts scored by EQ."
        right={<Button variant="primary" icon={Plus} onClick={() => setModal(true)} data-testid="new-template-btn">New template</Button>}
      />
      <div className="animate-fade-in px-6 sm:px-8 py-6">
        {items.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No templates yet"
            description="Save your best-performing emails here to reuse and reference their EQ score."
            actionLabel="New template"
            onAction={() => setModal(true)}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((t) => (
              <Card key={t.id}>
                <div className="flex items-start justify-between gap-3">
                  <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>{t.name}</div>
                  <div className="tnum" style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>{t.eq_score}</div>
                </div>
                <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 4 }}>Subject: {t.subject}</div>
                <div className="line-clamp-4 whitespace-pre-wrap" style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 10, fontFamily: "var(--font-mono)" }}>{t.body}</div>
                {t.tags?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">{t.tags.map((tg) => <Chip key={tg} label={tg} />)}</div>
                )}
                <button onClick={() => del(t.id)} data-testid={`delete-template-${t.id}`}
                  className="mt-4 flex items-center gap-1"
                  style={{ fontSize: 12, color: "var(--color-danger)" }}>
                  <Trash2 size={12} strokeWidth={1.5} aria-hidden="true" /> Delete
                </button>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Modal open={modal} onOpenChange={setModal}>
        <ModalContent
          size="md"
          title="New template"
          footer={
            <>
              <Button type="button" variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
              <Button type="submit" form="new-template-form" variant="primary" data-testid="save-template">Save</Button>
            </>
          }
        >
          <form id="new-template-form" onSubmit={save} className="space-y-4">
            <Input required label="Template name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="template-name" />
            <Input required label="Subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} data-testid="template-subject" />
            <Input
              as="textarea" required rows={8} label="Body"
              help="Use {{first_name}}, {{company}} for personalization tokens."
              value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} data-testid="template-body"
              style={{ fontFamily: "var(--font-mono)" }}
            />
            <Input label="Tags" optional placeholder="Comma-separated" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
          </form>
        </ModalContent>
      </Modal>
    </div>
  );
}
