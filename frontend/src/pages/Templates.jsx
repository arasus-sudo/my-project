/* Email template maker — library list + block-based builder.
 * Replaces the legacy plain-text template list. */

import { useEffect, useCallback, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Plus, Trash2, Copy, Pencil, Send, FileText, LayoutGrid } from "../icons";
import Card from "../components/composites/Card";
import { EmptyState } from "../components/composites/EmptyState";
import Button from "../components/primitives/Button";
import Input from "../components/primitives/Input";
import Select from "../components/primitives/Select";
import Chip from "../components/primitives/Chip";
import TemplateBuilder from "../components/template-builder/TemplateBuilder";
import { STEP_LABEL, TONE_LABEL } from "../components/template-builder/blockRegistry";

const STEP_FILTERS = [{ value: "all", label: "All positions" }, ...Object.entries(STEP_LABEL).map(([value, label]) => ({ value, label }))];
const TONE_FILTERS = [{ value: "all", label: "All tones" }, ...Object.entries(TONE_LABEL).map(([value, label]) => ({ value, label }))];

export default function Templates() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStep, setFilterStep] = useState("all");
  const [filterTone, setFilterTone] = useState("all");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null); // template | {} for new | null

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterStep !== "all") params.set("step_position", filterStep);
    if (filterTone !== "all") params.set("tone", filterTone);
    if (q.trim()) params.set("q", q.trim());
    api.get(`/email-templates?${params}`).then((r) => {
      setItems(r.data?.items || []);
    }).catch(() => toast.error("Could not load templates"))
      .finally(() => setLoading(false));
  }, [filterStep, filterTone, q]);

  useEffect(() => {
    const t = setTimeout(load, q.trim() ? 350 : 0);
    return () => clearTimeout(t);
  }, [load]);

  const startNew = () => setEditing({});
  const clone = async (t) => {
    try {
      const { data } = await api.post(`/email-templates/${t.id}/duplicate`);
      toast.success("Template duplicated");
      load();
      setEditing(data);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not duplicate the template");
    }
  };
  const testSend = async (t) => {
    try {
      const { data } = await api.post(`/email-templates/${t.id}/test-send`);
      toast.success(data.mocked ? "Test recorded (no mailbox configured — connect one in Mailboxes)" : "Test sent to your inbox");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Test send failed");
    }
  };
  const del = async (t) => {
    if (!window.confirm(`Delete "${t.name}"? This can't be undone.`)) return;
    try {
      await api.delete(`/email-templates/${t.id}`);
      toast.success("Template deleted");
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not delete the template");
    }
  };

  if (editing) {
    return (
      <div className="animate-fade-in px-6 sm:px-8 py-6" style={{ height: "calc(100vh - 140px)" }}>
        <TemplateBuilder
          template={editing.id ? editing : null}
          onBack={() => { setEditing(null); load(); }}
          onSaved={(data) => { if (data?.deleted) setEditing(null); else load(); }}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Templates"
        subtitle="Block-built, email-safe templates for your sequences — with compliance footers and sequence-aware follow-ups."
        badge="Template maker"
        right={<Button variant="primary" icon={Plus} onClick={startNew} data-testid="tmpl-new">New template</Button>}
      />
      <div className="animate-fade-in px-6 sm:px-8 py-6">
        <div className="flex flex-wrap items-center gap-3" style={{ marginBottom: 18 }}>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search templates…"
            style={{ width: 240 }} data-testid="tmpl-search" />
          <Select options={STEP_FILTERS} value={filterStep} onChange={setFilterStep} style={{ width: 170 }} data-testid="tmpl-filter-step" />
          <Select options={TONE_FILTERS} value={filterTone} onChange={setFilterTone} style={{ width: 170 }} data-testid="tmpl-filter-tone" />
        </div>

        {loading ? (
          <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Loading templates…</p>
        ) : items.length === 0 ? (
          <EmptyState
            icon={LayoutGrid}
            title={q.trim() || filterStep !== "all" || filterTone !== "all" ? "No templates match" : "No templates yet"}
            description="Build a polished, on-brand email in minutes — blocks, personalization tokens, tone presets, compliance footer."
            actionLabel="New template"
            onAction={startNew}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((t) => (
              <Card key={t.id}>
                <div className="flex items-start justify-between gap-3">
                  <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>{t.name}</div>
                  <div className="tnum" style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>{t.eq_score}</div>
                </div>
                <div className="flex items-center gap-2" style={{ marginTop: 6 }}>
                  <Chip label={STEP_LABEL[t.step_position] || t.step_position} />
                  {t.tone && t.tone !== "none" && <Chip label={TONE_LABEL[t.tone] || t.tone} />}
                  {t.compliance?.enabled && <Chip label="CASL footer" />}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 8 }}>
                  Subject: {t.subject || "—"}
                </div>
                {(t.service_line || t.persona) && (
                  <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 6 }}>
                    {[t.service_line, t.persona].filter(Boolean).join(" · ")}
                  </div>
                )}
                {t.tags?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">{t.tags.map((tg) => <Chip key={tg} label={tg} />)}</div>
                )}
                <div className="flex items-center gap-1" style={{ marginTop: 12, borderTop: "1px solid var(--border-subtle)", paddingTop: 10 }}>
                  <Button variant="tertiary" size="xs" icon={Pencil} onClick={() => setEditing(t)} data-testid={`tmpl-edit-${t.id}`}>Edit</Button>
                  <Button variant="tertiary" size="xs" icon={Copy} onClick={() => clone(t)} data-testid={`tmpl-clone-${t.id}`}>Clone</Button>
                  <Button variant="tertiary" size="xs" icon={Send} onClick={() => testSend(t)} data-testid={`tmpl-test-${t.id}`}>Test</Button>
                  <div style={{ flex: 1 }} />
                  <button onClick={() => del(t)} aria-label="Delete template" data-testid={`tmpl-delete-${t.id}`}
                    style={{ color: "var(--text-tertiary)", cursor: "pointer", padding: 4 }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "var(--color-danger)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-tertiary)"; }}>
                    <Trash2 size={14} strokeWidth={1.5} aria-hidden="true" />
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}