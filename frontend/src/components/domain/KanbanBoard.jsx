import { MoreVertical, GripVertical, Mail, Phone, FileText, Plus } from "../../icons";
import StatusPill from "../primitives/StatusPill";

/* Kanban / pipeline board — docs/design-system.md §13.
 *
 * `columns`: [{ key, label, tone, cards: [{ id, name, value, owner, ownerAvatar,
 * lastActivity, risk }] }]. Drag/drop is left to the caller (native HTML5 DnD
 * or a library) via `onDragStart`/`onDrop`/`onDragOver` passthrough props —
 * this component owns layout and visual states only, not DnD mechanics,
 * which are page-specific (react-beautiful-dnd vs native vary by screen).
 */

export default function KanbanBoard({ columns, onCardClick, onAddCard, onDragStart, onDrop, onDragOver, dragOverKey, draggingId, className = "" }) {
  return (
    <div className={`flex gap-3 overflow-x-auto pb-2 ${className}`}>
      {columns.map((col) => (
        <div
          key={col.key}
          onDragOver={(e) => { e.preventDefault(); onDragOver?.(col.key); }}
          onDrop={() => onDrop?.(col.key)}
          className="shrink-0 flex flex-col"
          style={{
            width: 288, background: "var(--bg-surface-sunken)", borderRadius: "var(--radius-xl)",
            border: dragOverKey === col.key ? "1px dashed var(--color-primary-border)" : "1px solid var(--border-default)",
            backgroundColor: dragOverKey === col.key ? "var(--bg-selected)" : "var(--bg-surface-sunken)",
            padding: 8, gap: 12,
          }}
        >
          <div className="flex items-center gap-2 sticky top-0" style={{ padding: "6px 6px 10px", borderBottom: "1px solid var(--border-subtle)" }}>
            <span style={{ width: 8, height: 8, borderRadius: "var(--radius-full)", background: col.tone || "var(--color-primary)" }} />
            <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>{col.label}</span>
            <span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{col.cards.length}</span>
            <span className="flex-1" />
            <span className="tnum" style={{ fontSize: 12, fontWeight: 500, color: "var(--text-primary)" }}>
              {col.cards.reduce((s, c) => s + (c.value || 0), 0).toLocaleString()}
            </span>
            <button type="button" className="inline-grid place-items-center" style={{ width: 24, height: 24, color: "var(--text-tertiary)" }}>
              <MoreVertical size={14} strokeWidth={1.5} aria-hidden="true" />
            </button>
          </div>

          <div className="flex flex-col gap-2 overflow-y-auto" style={{ maxHeight: "70vh" }}>
            {col.cards.map((card) => (
              <KanbanCard
                key={card.id}
                card={card}
                dragging={draggingId === card.id}
                onClick={() => onCardClick?.(card)}
                onDragStart={() => onDragStart?.(card.id, col.key)}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={() => onAddCard?.(col.key)}
            className="flex items-center justify-center gap-1.5"
            style={{
              height: 34, borderRadius: "var(--radius-md)", border: "1px dashed var(--border-default)",
              color: "var(--text-secondary)", fontSize: 12.5, fontWeight: 500, fontFamily: "var(--font-ui)",
            }}
          >
            <Plus size={14} strokeWidth={1.5} aria-hidden="true" /> Add deal
          </button>
        </div>
      ))}
    </div>
  );
}

function KanbanCard({ card, dragging, onClick, onDragStart }) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      className="ds-kanban-card group cursor-pointer"
      style={{
        background: "var(--bg-surface)", border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-lg)", padding: 12, boxShadow: dragging ? "var(--shadow-lg)" : "var(--shadow-xs)",
        opacity: dragging ? 0.4 : 1, transform: dragging ? "rotate(2deg)" : "none",
        cursor: dragging ? "grabbing" : "pointer",
      }}
    >
      <div className="flex items-center gap-2">
        <span className="inline-grid place-items-center shrink-0" style={{ width: 18, height: 18, borderRadius: "var(--radius-xs)", background: "var(--bg-active)" }}>
          {card.logo ? <img src={card.logo} alt="" className="w-full h-full rounded" /> : null}
        </span>
        <span className="flex-1 truncate" style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>
          {card.name}
        </span>
        <GripVertical size={14} strokeWidth={1.5} aria-hidden="true"
          className="opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ color: "var(--text-tertiary)", transitionDuration: "var(--dur-fast)" }} />
      </div>

      {card.value != null && (
        <div className="tnum" style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-display)", marginTop: 6 }}>
          ${card.value.toLocaleString()}
        </div>
      )}

      {card.owner && (
        <div className="flex items-center gap-1.5" style={{ marginTop: 8 }}>
          <span className="inline-grid place-items-center shrink-0" style={{ width: 20, height: 20, borderRadius: "var(--radius-full)", background: "var(--bg-active)", fontSize: 9.5, fontWeight: 600, color: "var(--text-secondary)" }}>
            {card.ownerAvatar ? <img src={card.ownerAvatar} alt="" className="w-full h-full rounded-full" /> : card.owner.slice(0, 2).toUpperCase()}
          </span>
          <span style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>{card.owner}</span>
        </div>
      )}

      {card.lastActivity && (
        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 4 }}>{card.lastActivity}</div>
      )}

      {card.risk && (
        <div style={{ marginTop: 8 }}>
          <StatusPill status={card.risk} />
        </div>
      )}

      <div className="flex items-center gap-1" style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border-subtle)" }}>
        {[Mail, Phone, FileText].map((Icon, i) => (
          <button key={i} type="button" onClick={(e) => e.stopPropagation()}
            className="inline-grid place-items-center" style={{ width: 26, height: 26, borderRadius: "var(--radius-sm)", color: "var(--text-tertiary)" }}>
            <Icon size={13} strokeWidth={1.5} aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  );
}
