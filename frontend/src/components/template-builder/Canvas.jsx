/* Block canvas — the assembled block list with reorder/remove controls. */

import { ArrowUp, ArrowDown, Trash2, GripVertical } from "../../icons";
import { BLOCK_REGISTRY } from "./blockRegistry";
import { GreetingBlock, OpeningBlock, BodyBlock, ProofBlock, CtaBlock, SignatureBlock, DividerBlock } from "./blocks";

const EDITORS = {
  greeting: GreetingBlock,
  opening: OpeningBlock,
  body: BodyBlock,
  proof: ProofBlock,
  cta: CtaBlock,
  signature: SignatureBlock,
  divider: DividerBlock,
};

export default function Canvas({ blocks, onChange, signatures }) {
  const patch = (idx, data) =>
    onChange(blocks.map((b, i) => (i === idx ? { ...b, data } : b)));

  const move = (idx, dir) => {
    const j = idx + dir;
    if (j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange(next);
  };

  const remove = (idx) => onChange(blocks.filter((_, i) => i !== idx));

  return (
    <div className="space-y-3">
      {blocks.map((b, idx) => {
        const meta = BLOCK_REGISTRY[b.type];
        if (!meta) return null;
        const Editor = EDITORS[b.type] || BodyBlock;
        return (
          <div key={b.id} data-testid={`tmpl-block-${b.type}`}
            style={{ border: "1px solid var(--border-default)", borderRadius: "var(--radius-lg)", background: "var(--bg-surface)" }}>
            <div className="flex items-center gap-1" style={{ padding: "8px 10px 0 10px" }}>
              <GripVertical size={14} strokeWidth={1.5} aria-hidden="true" style={{ color: "var(--text-tertiary)", cursor: "grab" }} />
              {meta.icon && <meta.icon size={14} strokeWidth={1.5} aria-hidden="true" style={{ color: "var(--text-secondary)" }} />}
              <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)", flex: 1 }}>{meta.label}</span>
              <button type="button" onClick={() => move(idx, -1)} disabled={idx === 0} aria-label="Move up"
                data-testid={`tmpl-move-up-${b.id}`} style={{ color: "var(--text-tertiary)", opacity: idx === 0 ? 0.3 : 1, cursor: "pointer" }}>
                <ArrowUp size={14} strokeWidth={1.5} />
              </button>
              <button type="button" onClick={() => move(idx, 1)} disabled={idx === blocks.length - 1} aria-label="Move down"
                data-testid={`tmpl-move-down-${b.id}`} style={{ color: "var(--text-tertiary)", opacity: idx === blocks.length - 1 ? 0.3 : 1, cursor: "pointer" }}>
                <ArrowDown size={14} strokeWidth={1.5} />
              </button>
              <button type="button" onClick={() => remove(idx)} aria-label="Remove block"
                data-testid={`tmpl-remove-block-${b.id}`}
                style={{ color: "var(--text-tertiary)", cursor: "pointer", marginLeft: 2 }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "var(--color-danger)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-tertiary)"; }}>
                <Trash2 size={14} strokeWidth={1.5} />
              </button>
            </div>
            <div style={{ padding: "8px 10px 10px 10px" }}>
              <Editor data={b.data} onChange={(d) => patch(idx, d)} signatures={signatures} />
            </div>
          </div>
        );
      })}
      {blocks.length === 0 && (
        <p style={{ fontSize: 13, color: "var(--text-tertiary)", textAlign: "center", padding: "24px 0" }}>
          No blocks yet — add one from the palette on the right.
        </p>
      )}
    </div>
  );
}
