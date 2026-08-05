import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Plus, Trash2 } from "../icons";
import Card from "../components/composites/Card";
import { EmptyState } from "../components/composites/EmptyState";
import { Modal, ModalContent } from "../components/composites/Modal";
import Chip from "../components/primitives/Chip";
import Input from "../components/primitives/Input";
import Button from "../components/primitives/Button";

export default function SmsTemplates() {
  const [items, setItems] = useState([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: "", body: "", tags: "" });

  const load = () => api.get("/sms-eq/templates").then((r) => setItems(r.data));
  useEffect(() => { load(); }, []);

  const save = async (e) => {
    e.preventDefault();
    try {
      await api.post("/sms-eq/templates", { ...form, tags: form.tags.split(",").map(t => t.trim()).filter(Boolean) });
      toast.success("Template saved");
      setModal(false); setForm({ name: "", body: "", tags: "" });
      load();
    } catch { toast.error("Save failed"); }
  };
  const del = async (id) => { await api.delete(`/sms-eq/templates/${id}`); load(); };

  return (
    <div>
      <PageHeader title="SMS Templates" subtitle="Reusable message templates for broadcasts."
        right={<Button variant="primary" icon={Plus} onClick={() => setModal(true)}>New template</Button>}
      />
      <div className="animate-fade-in px-6 sm:px-8 py-6">
        {items.length === 0 ? (
          <EmptyState title="No templates yet" description="Reusable templates you send from later, in a broadcast." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((t) => (
              <Card key={t.id}>
                <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>{t.name}</div>
                <div className="line-clamp-4 whitespace-pre-wrap" style={{ fontSize: 12, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", marginTop: 10 }}>{t.body}</div>
                {t.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5" style={{ marginTop: 12 }}>{t.tags.map((tg) => <Chip key={tg} label={tg} />)}</div>
                )}
                <button onClick={() => del(t.id)} style={{ marginTop: 16, fontSize: 12, color: "var(--color-danger)" }} className="inline-flex items-center gap-1">
                  <Trash2 size={12} strokeWidth={1.5} aria-hidden="true" /> Delete
                </button>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Modal open={modal} onOpenChange={setModal}>
        <ModalContent size="sm" title="New SMS Template"
          footer={
            <>
              <Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
              <Button variant="primary" type="submit" form="sms-template-form">Save</Button>
            </>
          }
        >
          <form id="sms-template-form" onSubmit={save} className="space-y-3">
            <Input required label="Template name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input as="textarea" rows={4} required label="Message body" help="Supports {{var}} placeholders" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
            <Input label="Tags" help="Comma-separated" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
          </form>
        </ModalContent>
      </Modal>
    </div>
  );
}
