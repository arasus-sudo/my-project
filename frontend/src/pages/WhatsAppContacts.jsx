import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Plus } from "../icons";
import Card from "../components/composites/Card";
import { EmptyState } from "../components/composites/EmptyState";
import { Modal, ModalContent } from "../components/composites/Modal";
import Chip from "../components/primitives/Chip";
import Input from "../components/primitives/Input";
import Button from "../components/primitives/Button";

export default function WhatsAppContacts() {
  const [items, setItems] = useState([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", tags: "" });

  const load = () => api.get("/whatsapp-eq/contacts").then((r) => setItems(r.data.items || []));
  useEffect(() => { load(); }, []);

  const save = async (e) => {
    e.preventDefault();
    try {
      await api.post("/whatsapp-eq/contacts", { ...form, tags: form.tags.split(",").map(t => t.trim()).filter(Boolean) });
      toast.success("Contact added");
      setModal(false); setForm({ name: "", phone: "", tags: "" });
      load();
    } catch { toast.error("Save failed"); }
  };

  const toggleOptOut = async (id, optedOut) => {
    try {
      await api.put(`/whatsapp-eq/contacts/${id}`, { opted_out: !optedOut });
      toast.success(optedOut ? "Re-subscribed" : "Opted out");
      load();
    } catch { toast.error("Update failed"); }
  };

  return (
    <div>
      <PageHeader title="WhatsApp Contacts" subtitle="Manage your WhatsApp contact list."
        right={<Button variant="primary" icon={Plus} onClick={() => setModal(true)}>Add contact</Button>}
      />
      <div className="animate-fade-in px-6 sm:px-8 py-6">
        {items.length === 0 ? (
          <EmptyState title="No contacts yet" description="Add contacts to start sending WhatsApp broadcasts."
            actionLabel="Add contact" onAction={() => setModal(true)} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((c) => (
              <Card key={c.id}>
                <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>{c.name || c.phone}</div>
                <div className="tnum" style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginTop: 4 }}>{c.phone}</div>
                {c.opted_out && <div style={{ fontSize: 11, color: "var(--color-danger)", marginTop: 6 }}>Opted out</div>}
                {c.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5" style={{ marginTop: 10 }}>{c.tags.map((tg) => <Chip key={tg} label={tg} />)}</div>
                )}
                <button onClick={() => toggleOptOut(c.id, c.opted_out)} style={{ marginTop: 12, fontSize: 12, color: "var(--text-link)" }}>
                  {c.opted_out ? "Re-subscribe" : "Opt out"}
                </button>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Modal open={modal} onOpenChange={setModal}>
        <ModalContent size="sm" title="Add Contact"
          footer={
            <>
              <Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
              <Button variant="primary" type="submit" form="whatsapp-contact-form">Save</Button>
            </>
          }
        >
          <form id="whatsapp-contact-form" onSubmit={save} className="space-y-3">
            <Input label="Name" help="Optional" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input required label="Phone number" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <Input label="Tags" help="Comma-separated" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
          </form>
        </ModalContent>
      </Modal>
    </div>
  );
}
