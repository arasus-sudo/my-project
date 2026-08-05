import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Plus, Play, Pause } from "../icons";
import Card from "../components/composites/Card";
import { EmptyState } from "../components/composites/EmptyState";
import { Modal, ModalContent } from "../components/composites/Modal";
import StatusPill from "../components/primitives/StatusPill";
import Input from "../components/primitives/Input";
import Select from "../components/primitives/Select";
import Button from "../components/primitives/Button";

const STATUS_TONE = { draft: "neutral", scheduled: "primary", sending: "primary", sent: "success", paused: "warning", cancelled: "danger" };
const STATUS_META = { draft: "Draft", scheduled: "Scheduled", sending: "Sending", sent: "Sent", paused: "Paused", cancelled: "Cancelled" };

export default function WhatsAppBroadcasts() {
  const [items, setItems] = useState([]);
  const [modal, setModal] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [form, setForm] = useState({ name: "", template_id: "", contact_ids: "", scheduled_at: "" });

  const load = () => api.get("/whatsapp-eq/broadcasts").then((r) => setItems(r.data));
  useEffect(() => { load(); api.get("/whatsapp-eq/templates").then((r) => setTemplates(r.data.filter(t => t.status === "approved"))); }, []);

  const save = async (e) => {
    e.preventDefault();
    try {
      await api.post("/whatsapp-eq/broadcasts", {
        ...form,
        contact_ids: form.contact_ids.split(",").map(s => s.trim()).filter(Boolean),
      });
      toast.success("Broadcast created");
      setModal(false); setForm({ name: "", template_id: "", contact_ids: "", scheduled_at: "" });
      load();
    } catch { toast.error("Create failed"); }
  };

  const toggleLaunch = async (id, status) => {
    try {
      await api.post(`/whatsapp-eq/broadcasts/${id}/${status === "paused" ? "launch" : "pause"}`);
      toast.success(status === "paused" ? "Broadcast launched" : "Broadcast paused");
      load();
    } catch { toast.error("Action failed"); }
  };

  return (
    <div>
      <PageHeader title="WhatsApp Broadcasts" subtitle="Send bulk WhatsApp messages using approved templates."
        right={<Button variant="primary" icon={Plus} onClick={() => setModal(true)} isDisabled={templates.length === 0}>New broadcast</Button>}
      />
      <div className="animate-fade-in px-6 sm:px-8 py-6 space-y-3">
        {items.length === 0 ? (
          <EmptyState title="No broadcasts yet" description="You need at least one approved template before you can send a broadcast." />
        ) : items.map((b) => (
          <Card key={b.id}>
            <div className="flex items-center justify-between">
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>{b.name}</div>
                <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginTop: 4 }}>Template: {b.template_name || "—"} · Sent: {b.sent_count ?? 0}/{b.total_count ?? 0}</div>
                <div style={{ marginTop: 6 }}><StatusPill status={STATUS_META[b.status] || b.status} tone={STATUS_TONE[b.status]} /></div>
              </div>
              <div className="flex gap-2">
                {b.status === "paused" && <Button variant="secondary" icon={Play} onClick={() => toggleLaunch(b.id, "paused")}>Resume</Button>}
                {b.status === "sending" && <Button variant="secondary" icon={Pause} onClick={() => toggleLaunch(b.id, "sending")}>Pause</Button>}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Modal open={modal} onOpenChange={setModal}>
        <ModalContent size="sm" title="New WhatsApp Broadcast"
          footer={
            <>
              <Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
              <Button variant="primary" type="submit" form="whatsapp-broadcast-form">Create</Button>
            </>
          }
        >
          <form id="whatsapp-broadcast-form" onSubmit={save} className="space-y-3">
            <Input required label="Broadcast name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Select required label="Template" value={form.template_id} onChange={(v) => setForm({ ...form, template_id: v })}
              options={[{ value: "", label: "Select approved template" }, ...templates.map((t) => ({ value: t.id, label: t.name }))]} />
            <Input label="Contact IDs" help="Comma-separated" value={form.contact_ids} onChange={(e) => setForm({ ...form, contact_ids: e.target.value })} />
            <Input type="datetime-local" label="Scheduled for" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} />
          </form>
        </ModalContent>
      </Modal>
    </div>
  );
}
