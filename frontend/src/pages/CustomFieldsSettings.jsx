import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Plus, Archive, GripVertical } from "lucide-react";

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
        right={
          <button onClick={() => setCreating((c) => !c)} className="btn-primary text-xs">
            <Plus size={14} /> New field
          </button>
        }
      />
      <div className="px-6 sm:px-8 py-6 space-y-6 max-w-2xl">
        {creating && (
          <div className="shadow-card p-4 rounded-2xl bg-white space-y-3">
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Field name (e.g. Renewal date)" data-testid="new-field-name"
              className="w-full border border-line px-3 py-2 rounded-xl text-input" />
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
              data-testid="new-field-type" className="w-full border border-line px-3 py-2 rounded-xl text-input">
              {Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            {form.type === "select" && (
              <input value={form.options} onChange={(e) => setForm({ ...form, options: e.target.value })}
                placeholder="Options, comma-separated (e.g. Small, Medium, Large)"
                className="w-full border border-line px-3 py-2 rounded-xl text-input" />
            )}
            <div className="flex gap-2">
              <button onClick={create} disabled={!form.name.trim()} data-testid="create-field-btn"
                className="btn-primary text-xs disabled:opacity-50">Create</button>
              <button onClick={() => setCreating(false)} className="btn-secondary text-xs">Cancel</button>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-caption text-ink-muted">Loading…</p>
        ) : active.length === 0 ? (
          <div className="shadow-card p-6 rounded-2xl bg-white text-center text-caption text-ink-muted">
            No custom fields yet. Add one to start collecting workspace-specific data on leads.
          </div>
        ) : (
          <div className="space-y-2">
            {active.map((f) => (
              <div key={f.id} data-testid={`field-${f.key}`}
                className="shadow-card p-3 rounded-xl flex items-center justify-between gap-3 bg-white">
                <div className="flex items-center gap-2 min-w-0">
                  <GripVertical size={14} className="text-ink-disabled shrink-0" />
                  <div className="min-w-0">
                    <div className="text-body font-medium truncate">{f.name}</div>
                    <div className="text-caption text-ink-muted">
                      {TYPE_LABEL[f.type] || f.type}
                      {f.type === "select" && f.options?.length > 0 && ` · ${f.options.join(", ")}`}
                    </div>
                  </div>
                </div>
                <button onClick={() => archive(f.id)} className="text-caption text-ink-muted hover:text-danger shrink-0">
                  <Archive size={12} className="inline mr-1" /> Archive
                </button>
              </div>
            ))}
          </div>
        )}

        {archived.length > 0 && (
          <div>
            <div className="ui-label mb-2">Archived</div>
            <div className="space-y-1">
              {archived.map((f) => (
                <div key={f.id} className="text-caption text-ink-muted px-3 py-2">
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
