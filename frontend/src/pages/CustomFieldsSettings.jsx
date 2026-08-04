import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Plus, Archive, GripVertical } from "../icons";
import Card from "../components/composites/Card";
import { EmptyState } from "../components/composites/EmptyState";
import Button from "../components/primitives/Button";
import Input from "../components/primitives/Input";
import Select from "../components/primitives/Select";

const TYPE_LABEL = { text: "Text", number: "Number", date: "Date", select: "Dropdown" };

export default function CustomFieldsSettings() {
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", type: "text", options: "" });

  const load = () => {
    api.get("/crm/custom-fields", { params: { entity: "lead" } })
      .then((r) => setFields(r.data || []))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const create = async () => {
    if (!form.name.trim()) return;
    try {
      await api.post("/crm/custom-fields", {
        entity: "lead",
        name: form.name.trim(),
        type: form.type,
        options: form.type === "select" ? form.options.split(",").map((o) => o.trim()).filter(Boolean) : [],
      });
      toast.success("Field created");
      setForm({ name: "", type: "text", options: "" });
      setCreating(false);
      load();
    } catch (err) { toast.error(err?.response?.data?.detail || "Failed to create field"); }
  };

  const archive = async (id) => {
    if (!window.confirm("Archive this field? Existing values are kept, but it won't be editable on new records.")) return;
    try {
      await api.delete(`/crm/custom-fields/${id}`);
      toast.success("Archived");
      load();
    } catch (err) { toast.error(err?.response?.data?.detail || "Failed"); }
  };

  const active = fields.filter((f) => !f.archived);
  const archived = fields.filter((f) => f.archived);

  return (
    <div>
      <PageHeader
        title="Custom fields"
        subtitle="Add workspace-specific fields to leads — renewal date, product interest, referral source, whatever your process needs."
        right={<Button variant="primary" icon={Plus} onClick={() => setCreating((c) => !c)}>New field</Button>}
      />
      <div className="px-6 sm:px-8 py-6 space-y-6 max-w-2xl">
        {creating && (
          <Card className="space-y-3">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Field name (e.g. Renewal date)" data-testid="new-field-name" />
            <Select
              value={form.type} onChange={(v) => setForm({ ...form, type: v })} data-testid="new-field-type"
              options={Object.entries(TYPE_LABEL).map(([v, l]) => ({ value: v, label: l }))}
            />
            {form.type === "select" && (
              <Input value={form.options} onChange={(e) => setForm({ ...form, options: e.target.value })} placeholder="Options, comma-separated (e.g. Small, Medium, Large)" />
            )}
            <div className="flex gap-2">
              <Button variant="primary" onClick={create} isDisabled={!form.name.trim()} data-testid="create-field-btn">Create</Button>
              <Button variant="secondary" onClick={() => setCreating(false)}>Cancel</Button>
            </div>
          </Card>
        )}

        {loading ? (
          <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Loading…</p>
        ) : active.length === 0 ? (
          <EmptyState icon={Plus} title="No custom fields yet" description="Add one to start collecting workspace-specific data on leads." actionLabel="New field" onAction={() => setCreating(true)} />
        ) : (
          <div className="space-y-2">
            {active.map((f) => (
              <Card key={f.id} data-testid={`field-${f.key}`} padding="compact">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <GripVertical size={14} strokeWidth={1.5} aria-hidden="true" style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
                    <div className="min-w-0">
                      <div className="truncate" style={{ fontSize: 13.5, fontWeight: 500, color: "var(--text-primary)" }}>{f.name}</div>
                      <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                        {TYPE_LABEL[f.type] || f.type}
                        {f.type === "select" && f.options?.length > 0 && ` · ${f.options.join(", ")}`}
                      </div>
                    </div>
                  </div>
                  <button onClick={() => archive(f.id)} className="inline-flex items-center gap-1 shrink-0 transition-colors"
                    style={{ fontSize: 12, color: "var(--text-tertiary)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-danger)")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-tertiary)")}
                  >
                    <Archive size={12} strokeWidth={1.5} aria-hidden="true" /> Archive
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}

        {archived.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Archived</div>
            <div className="space-y-1">
              {archived.map((f) => (
                <div key={f.id} style={{ fontSize: 12.5, color: "var(--text-tertiary)", padding: "8px 12px" }}>
                  {f.name} — {TYPE_LABEL[f.type] || f.type}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
