/* Right-hand control panel for the email template maker: block palette,
 * step position, tone preset, signature picker, accent colour, compliance. */

import { useState } from "react";
import { ShieldCheck } from "../../icons";
import { BLOCK_REGISTRY, BLOCK_TYPES, newBlock, STEP_POSITIONS, STEP_CAMPAIGN_HINT, TONE_PRESETS, SAMPLE_MERGE_FIELDS } from "./blockRegistry";
import Input from "../primitives/Input";
import Select from "../primitives/Select";
import Toggle from "../primitives/Toggle";
import Button from "../primitives/Button";
import { Modal, ModalContent } from "../composites/Modal";

export default function Sidebar({
  blocks, setBlocks, signatures, settings, onSettingsPatch, onSaveSettings,
  stepPosition, onStepPosition, tone, onTone,
  accent, onAccent, complianceEnabled, onComplianceEnabled,
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  const add = (type) => setBlocks([...blocks, newBlock(type)]);

  return (
    <div className="space-y-5" style={{ minWidth: 0 }}>
      <div>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8, textTransform: "uppercase", letterSpacing: ".06em" }}>
          Blocks
        </div>
        <div className="grid grid-cols-2 gap-2">
          {BLOCK_TYPES.map((t) => {
            const meta = BLOCK_REGISTRY[t];
            return (
              <button key={t} type="button" onClick={() => add(t)} data-testid={`tmpl-add-${t}`}
                className="flex items-center gap-1.5 justify-center"
                style={{ border: "1px dashed var(--border-default)", borderRadius: "var(--radius-md)", padding: "7px 4px", fontSize: 12.5, color: "var(--text-secondary)", cursor: "pointer" }}>
                {meta.icon && <meta.icon size={13} strokeWidth={1.5} aria-hidden="true" />}
                {meta.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8, textTransform: "uppercase", letterSpacing: ".06em" }}>
            Sequence position
          </div>
          <Select
            options={STEP_POSITIONS}
            value={stepPosition}
            onChange={onStepPosition}
            data-testid="tmpl-step-position"
          />
          <p style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 6 }}>{STEP_CAMPAIGN_HINT[stepPosition] || ""}</p>
        </div>

        <div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8, textTransform: "uppercase", letterSpacing: ".06em" }}>
            Tone preset
          </div>
          <Select
            options={TONE_PRESETS}
            value={tone}
            onChange={onTone}
            data-testid="tmpl-tone"
          />
          <p style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 6 }}>
            {TONE_PRESETS.find((t) => t.value === tone)?.guidance || ""}
          </p>
        </div>

        <div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8, textTransform: "uppercase", letterSpacing: ".06em" }}>
            Accent colour
          </div>
          <div className="flex items-center gap-2">
            <input type="color" value={accent} onChange={(e) => onAccent(e.target.value)}
              style={{ width: 34, height: 34, border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", background: "transparent", cursor: "pointer" }}
              data-testid="tmpl-accent-picker" />
            <Input value={accent} onChange={(e) => onAccent(e.target.value)} style={{ width: 110 }}
              data-testid="tmpl-accent" />
          </div>
        </div>

        <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 14 }}>
          <Toggle
            label="Compliance footer"
            description="Auto-appended when the region is covered (CASL for CA)"
            checked={complianceEnabled}
            onChange={onComplianceEnabled}
            data-testid="tmpl-compliance-toggle"
          />
          <div className="flex items-center gap-2" style={{ marginTop: 10 }}>
            <ShieldCheck size={14} strokeWidth={1.5} aria-hidden="true" style={{ color: "var(--text-tertiary)" }} />
            <button type="button" onClick={() => setSettingsOpen(true)} style={{ fontSize: 12.5, color: "var(--color-primary)", cursor: "pointer" }} data-testid="tmpl-compliance-settings">
              Edit legal name, address and regions
            </button>
          </div>
        </div>

        <div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8, textTransform: "uppercase", letterSpacing: ".06em" }}>
            Merge fields
          </div>
          <div className="flex flex-wrap gap-1">
            {SAMPLE_MERGE_FIELDS.map((f) => (
              <span key={f} style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, background: "var(--bg-surface-sunken)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)", padding: "2px 5px", color: "var(--text-secondary)" }}>
                {f}
              </span>
            ))}
          </div>
          <p style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 6 }}>
            The preview substitutes sample data; campaigns resolve them per lead.
          </p>
        </div>
      </div>

      <Modal open={settingsOpen} onOpenChange={(o) => !o && setSettingsOpen(false)}>
        <ModalContent size="md" title="Compliance footer settings"
          subtitle="The footer auto-appends to every template whose regions are covered here. Unsubscribe is one-click.">
          <div className="space-y-4">
            <Input label="Legal entity name" value={settings.legal_name || ""} onChange={(e) => onSettingsPatch({ legal_name: e.target.value })} placeholder="Innoira Consulting Services" data-testid="tmpl-settings-legal" />
            <Input as="textarea" rows={2} label="Registered address" value={settings.address || ""} onChange={(e) => onSettingsPatch({ address: e.target.value })} placeholder="100 King St W, Suite 5600, Toronto, ON" data-testid="tmpl-settings-address" />
            <Input label="Regions that get the footer" optional value={(settings.regions || []).join(", ")} onChange={(e) => onSettingsPatch({ regions: e.target.value.split(",").map((r) => r.trim().toLowerCase()).filter(Boolean) })} help="Comma-separated ISO country codes — ca for CASL" data-testid="tmpl-settings-regions" />
            <Toggle label="Auto-append by default" description="New templates start with the footer on" checked={settings.auto_append !== false} onChange={(v) => onSettingsPatch({ auto_append: v })} data-testid="tmpl-settings-autoappend" />
          </div>
          <div className="flex items-center justify-end gap-2" style={{ paddingTop: 16, marginTop: 16, borderTop: "1px solid var(--border-subtle)" }}>
            <Button variant="secondary" size="sm" onClick={() => setSettingsOpen(false)} data-testid="tmpl-settings-cancel">Cancel</Button>
            <Button variant="primary" size="sm" onClick={() => { onSaveSettings(); setSettingsOpen(false); }} data-testid="tmpl-settings-save">Save settings</Button>
          </div>
        </ModalContent>
      </Modal>
    </div>
  );
}
