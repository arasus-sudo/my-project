/* Editor shell for the email template maker: blocks canvas, live preview and
 * the control sidebar, plus save / test-send and the sequence-repeat warning. */

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Send, Check, Trash2, Loader2 } from "../../icons";
import { api } from "../../lib/api";
import { toast } from "sonner";
import Input from "../primitives/Input";
import Button from "../primitives/Button";
import InlineAlert from "../composites/InlineAlert";
import { Modal, ModalContent } from "../composites/Modal";
import Canvas from "./Canvas";
import Sidebar from "./Sidebar";
import LivePreview from "./LivePreview";
import { STEP_LABEL, TONE_LABEL } from "./blockRegistry";
import { TEMPLATE_PRESETS, blankTemplateBlocks } from "./templates";

const DEFAULT_STYLE = { accent_color: "#2563eb" };

function normalizeStyle(style) {
  return { ...DEFAULT_STYLE, ...(style || {}) };
}

export default function TemplateBuilder({ template, onBack, onSaved }) {
  const [name, setName] = useState(template?.name || "");
  const [subject, setSubject] = useState(template?.subject || "");
  const [blocks, setBlocks] = useState(template?.blocks_json || blankTemplateBlocks());
  const [style, setStyle] = useState(normalizeStyle(template?.style_json));
  const [tone, setTone] = useState(template?.tone || "none");
  const [stepPosition, setStepPosition] = useState(template?.step_position || "intro");
  const [tags, setTags] = useState((template?.tags || []).join(", "));
  const [serviceLine, setServiceLine] = useState(template?.service_line || "");
  const [persona, setPersona] = useState(template?.persona || "");
  const [complianceEnabled, setComplianceEnabled] = useState(template?.compliance?.enabled !== false);
  const [complianceRegions, setComplianceRegions] = useState(template?.compliance?.regions || ["ca"]);
  const [savedId, setSavedId] = useState(template?.id || null);

  const [signatures, setSignatures] = useState([]);
  const [settings, setSettings] = useState({ legal_name: "", address: "", regions: ["ca"], auto_append: true });
  const [previewHtml, setPreviewHtml] = useState("");
  const [rendering, setRendering] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [warnings, setWarnings] = useState([]);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const renderSeq = useRef(0);

  useEffect(() => {
    api.get("/signatures").then((r) => setSignatures(r.data || [])).catch(() => {});
    api.get("/email-templates/settings").then((r) => setSettings(r.data || settings)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const requestRender = useCallback(async (blocksArg, styleArg) => {
    const seq = ++renderSeq.current;
    setRendering(true);
    try {
      const { data } = await api.post("/email-templates/render", {
        blocks_json: blocksArg,
        style_json: styleArg,
      });
      if (seq === renderSeq.current) setPreviewHtml(data.html || "");
    } catch {
      // keep the last good preview on transient failures
    } finally {
      if (seq === renderSeq.current) setRendering(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(() => requestRender(blocks, style), 350);
    return () => clearTimeout(t);
  }, [blocks, style, requestRender]);

  const applyPreset = (preset) => {
    setBlocks(preset.blocks());
    setSubject(preset.subject || "");
    setTone(preset.tone || "none");
    setStepPosition(preset.step_position || "intro");
    setPresetsOpen(false);
  };

  const compliancePayload = () => ({
    enabled: complianceEnabled,
    regions: complianceRegions,
  });

  const save = async () => {
    if (!name.trim()) { toast.error("Name the template first"); return; }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        subject,
        blocks_json: blocks,
        style_json: style,
        tone,
        step_position: stepPosition,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        service_line: serviceLine.trim(),
        persona: persona.trim(),
        compliance: compliancePayload(),
      };
      const { data } = savedId
        ? await api.put(`/email-templates/${savedId}`, payload)
        : await api.post("/email-templates", payload);
      setWarnings(data.overlap_warnings || []);
      setSavedId(data.id);
      toast.success(savedId ? "Template updated" : "Template saved to your library");
      onSaved(data);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not save the template");
    } finally {
      setSaving(false);
    }
  };

  const testSend = async () => {
    if (!savedId) { toast.error("Save the template before sending a test"); return; }
    setTesting(true);
    try {
      const { data } = await api.post(`/email-templates/${savedId}/test-send`);
      toast.success(data.mocked ? "Test recorded (no mailbox configured — check your inbox settings)" : "Test sent to your inbox");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Test send failed");
    } finally {
      setTesting(false);
    }
  };

  const remove = async () => {
    if (!savedId) return;
    setDeleting(true);
    try {
      await api.delete(`/email-templates/${savedId}`);
      toast.success("Template deleted");
      onSaved({ deleted: true });
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not delete the template");
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  const saveSettings = async () => {
    try {
      await api.put("/email-templates/settings", settings);
      toast.success("Compliance settings saved");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not save settings");
    }
  };

  return (
    <div className="flex flex-col" style={{ minHeight: 0, height: "100%" }}>
      <div className="flex items-center gap-3" style={{ paddingBottom: 16 }}>
        <button type="button" onClick={onBack} aria-label="Back to library" data-testid="tmpl-back"
          style={{ color: "var(--text-secondary)", cursor: "pointer" }}>
          <ArrowLeft size={18} strokeWidth={1.5} />
        </button>
        <button type="button" onClick={() => setPresetsOpen(true)} data-testid="tmpl-presets"
          style={{ fontSize: 13, fontWeight: 600, color: "var(--color-primary)", cursor: "pointer" }}>
          Start from a preset
        </button>
        <div style={{ flex: 1 }} />
        {savedId && (
          <Button variant="secondary" size="sm" icon={Trash2} onClick={() => setDeleteOpen(true)} data-testid="tmpl-delete">
            Delete
          </Button>
        )}
        <Button variant="secondary" size="sm" icon={Send} onClick={testSend} isLoading={testing} isDisabled={!savedId}
          data-testid="tmpl-test-send">
          {testing ? "Sending…" : "Test send"}
        </Button>
        <Button variant="primary" size="sm" icon={Check} onClick={save} isLoading={saving} data-testid="tmpl-save">
          {saving ? "Saving…" : savedId ? "Save changes" : "Save to library"}
        </Button>
      </div>

      {warnings.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <InlineAlert tone="warning" title="Heavy wording overlap with an earlier step">
            {warnings.map((w) => (
              <div key={w.template_id}>“{w.name}” repeats {w.score}% of this wording — follow-ups should say something new.</div>
            ))}
          </InlineAlert>
        </div>
      )}

      <div className="flex-1 grid gap-4" style={{ minHeight: 0, gridTemplateColumns: "minmax(0,5fr) minmax(0,4fr) 300px", alignItems: "start" }}>
        <div style={{ minWidth: 0 }}>
          <div className="space-y-3">
            <Input label="Template name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Founder intro — AP automation" data-testid="tmpl-name" />
            <Input label="Subject line" optional value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Quick idea for {{company}}" data-testid="tmpl-subject" />
            <Canvas blocks={blocks} onChange={setBlocks} signatures={signatures} />
            <div className="grid grid-cols-3 gap-3">
              <Input label="Tags" optional value={tags} onChange={(e) => setTags(e.target.value)} placeholder="ap-automation, cold" data-testid="tmpl-tags" />
              <Input label="Service line" optional value={serviceLine} onChange={(e) => setServiceLine(e.target.value)} placeholder="AP / AR outsourcing" data-testid="tmpl-service-line" />
              <Input label="Persona" optional value={persona} onChange={(e) => setPersona(e.target.value)} placeholder="Founder / CFO" data-testid="tmpl-persona" />
            </div>
          </div>
        </div>

        <div style={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
          <LivePreview html={previewHtml} subject={subject} loading={rendering} />
        </div>

        <Sidebar
          blocks={blocks} setBlocks={setBlocks} signatures={signatures}
          settings={settings} onSettingsPatch={(patch) => setSettings((s) => ({ ...s, ...patch }))}
          onSaveSettings={saveSettings}
          stepPosition={stepPosition} onStepPosition={setStepPosition}
          tone={tone} onTone={setTone}
          accent={style.accent_color} onAccent={(c) => setStyle((s) => ({ ...s, accent_color: c }))}
          complianceEnabled={complianceEnabled} onComplianceEnabled={setComplianceEnabled}
        />
      </div>

      <Modal open={presetsOpen} onOpenChange={(o) => !o && setPresetsOpen(false)}>
        <ModalContent size="md" title="Start from a preset"
          subtitle="Presets load blocks, subject, tone and sequence position — then edit to taste.">
          <div className="space-y-2">
            {TEMPLATE_PRESETS.map((p) => (
              <button key={p.id} type="button" onClick={() => applyPreset(p)} data-testid={`tmpl-preset-${p.id}`}
                className="w-full text-left"
                style={{ border: "1px solid var(--border-default)", borderRadius: "var(--radius-lg)", padding: "12px 14px", cursor: "pointer" }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)" }}>{p.name}</div>
                <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>
                  {STEP_LABEL[p.step_position]} · {TONE_LABEL[p.tone] || p.tone}
                </div>
              </button>
            ))}
            <button type="button" onClick={() => { setBlocks(blankTemplateBlocks()); setPresetsOpen(false); }} data-testid="tmpl-preset-blank"
              className="w-full text-left"
              style={{ border: "1px dashed var(--border-default)", borderRadius: "var(--radius-lg)", padding: "12px 14px", cursor: "pointer" }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)" }}>Blank template</div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>Start from an empty canvas</div>
            </button>
          </div>
        </ModalContent>
      </Modal>

      <Modal open={deleteOpen} onOpenChange={(o) => !o && setDeleteOpen(false)}>
        <ModalContent size="sm" title="Delete this template?"
          subtitle="This can't be undone. Templates already copied into a campaign are unaffected.">
          <div className="flex items-center justify-end gap-2" style={{ paddingTop: 16, marginTop: 16, borderTop: "1px solid var(--border-subtle)" }}>
            <Button variant="secondary" size="sm" onClick={() => setDeleteOpen(false)} data-testid="tmpl-delete-cancel">Cancel</Button>
            <Button variant="danger" size="sm" icon={Loader2} isLoading={deleting} onClick={remove} data-testid="tmpl-delete-confirm">
              {deleting ? "Deleting…" : "Delete template"}
            </Button>
          </div>
        </ModalContent>
      </Modal>
    </div>
  );
}
