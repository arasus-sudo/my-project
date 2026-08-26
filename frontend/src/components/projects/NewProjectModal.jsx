import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { toast } from "sonner";
import Button from "../primitives/Button";
import Input from "../primitives/Input";
import { X, Folder } from "../../icons";

/* NewProjectModal — name + optional starter template. Templates are fetched
 * from GET /projects/templates so the list stays backend-owned.
 */

export default function NewProjectModal({ onClose, onCreated }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [templates, setTemplates] = useState([]);
  const [tplKey, setTplKey] = useState(null); // null = blank
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/projects/templates")
      .then((r) => setTemplates(r.data || []))
      .catch(() => setTemplates([]));
  }, []);

  const create = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const { data } = tplKey
        ? await api.post("/projects/from-template", { template_key: tplKey, name: name.trim(), description: description.trim() })
        : await api.post("/projects", { name: name.trim(), description: description.trim() });
      toast.success(`“${data.name}” created`);
      onCreated(data);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      toast.error(typeof detail === "object" ? detail.action_label || "Out of credits" : detail || "Create failed");
    }
    setBusy(false);
  };

  return (
    <>
      <div className="fixed inset-0 z-50 animate-fade-in" style={{ background: "var(--bg-overlay)" }} onClick={onClose} />
      <div role="dialog" aria-modal="true" data-testid="proj-new-modal"
        className="fixed z-50 animate-scale-in"
        style={{
          top: "50%", left: "50%", transform: "translate(-50%, -50%)",
          width: 480, maxWidth: "calc(100vw - 32px)",
          background: "var(--bg-surface)", border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-xl)", boxShadow: "var(--shadow-lg)", padding: 22,
        }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>
            New project
          </h2>
          <Button variant="tertiary" size="xs" icon={X} onClick={onClose} aria-label="Close" />
        </div>

        <label style={{ display: "block", fontSize: 12.5, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 5 }}>
          Name
        </label>
        <Input value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") create(); }}
          placeholder="e.g. Q1 outbound push" autoFocus data-testid="proj-new-name" />

        <label style={{ display: "block", fontSize: 12.5, fontWeight: 500, color: "var(--text-secondary)", margin: "12px 0 5px" }}>
          Description (optional)
        </label>
        <Input value={description} onChange={(e) => setDescription(e.target.value)}
          placeholder="What is this project for?" />

        {templates.length > 0 && (
          <>
            <label style={{ display: "block", fontSize: 12.5, fontWeight: 500, color: "var(--text-secondary)", margin: "16px 0 6px" }}>
              Start from
            </label>
            <div className="grid grid-cols-2 gap-2">
              <TemplateCard selected={tplKey === null} onClick={() => setTplKey(null)}
                title="Blank" blurb="An empty board with the default workflow." testid="proj-tpl-blank" />
              {templates.map((t) => (
                <TemplateCard key={t.key} selected={tplKey === t.key}
                  onClick={() => setTplKey(t.key)} title={t.name} blurb={t.blurb}
                  testid={`proj-tpl-${t.key}`} icon={Folder} />
              ))}
            </div>
          </>
        )}

        <div className="flex items-center justify-end gap-2" style={{ marginTop: 18 }}>
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={create} isLoading={busy}
            isDisabled={!name.trim()} data-testid="proj-create-btn">
            Create project
          </Button>
        </div>
      </div>
    </>
  );
}

function TemplateCard({ selected, onClick, title, blurb, testid, icon: Icon }) {
  return (
    <button type="button" onClick={onClick} data-testid={testid}
      className="text-left"
      style={{
        border: `1px solid ${selected ? "var(--color-primary)" : "var(--border-default)"}`,
        background: selected ? "var(--bg-selected)" : "var(--bg-surface)",
        borderRadius: "var(--radius-lg)", padding: "10px 12px", cursor: "pointer",
      }}>
      <div className="flex items-center gap-1.5" style={{ marginBottom: 3 }}>
        {Icon && <Icon size={13} strokeWidth={1.5} aria-hidden="true" style={{ color: "var(--color-primary)" }} />}
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>{title}</span>
      </div>
      <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", lineHeight: 1.4 }}>{blurb}</div>
    </button>
  );
}
