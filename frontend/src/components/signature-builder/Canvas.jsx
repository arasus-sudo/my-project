import { useState } from "react";
import { GripVertical, Eye, EyeOff, Trash2, Layers } from "lucide-react";
import { BLOCK_REGISTRY } from "./blockRegistry";

export default function Canvas({ blocks, onChange }) {
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);

  const updateBlockData = (id, data) => onChange(blocks.map((b) => (b.id === id ? { ...b, data } : b)));
  const toggleVisible = (id) => onChange(blocks.map((b) => (b.id === id ? { ...b, visible: b.visible === false } : b)));
  const removeBlock = (id) => onChange(blocks.filter((b) => b.id !== id));

  const onDragStart = (idx) => (e) => { setDragIndex(idx); e.dataTransfer.effectAllowed = "move"; };
  const onDragOver = (idx) => (e) => { e.preventDefault(); setOverIndex(idx); };
  const onDrop = (idx) => (e) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === idx) { setDragIndex(null); setOverIndex(null); return; }
    const next = [...blocks];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(idx, 0, moved);
    onChange(next);
    setDragIndex(null);
    setOverIndex(null);
  };

  if (blocks.length === 0) {
    return (
      <div className="text-center py-16 text-ink-muted">
        <Layers size={32} className="mx-auto mb-3 text-ink-disabled" />
        <div className="text-body font-medium mb-1">No blocks yet</div>
        <p className="text-caption">Add a block from the sidebar to start building your signature.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {blocks.map((b, idx) => {
        const def = BLOCK_REGISTRY[b.type];
        if (!def) return null;
        const Icon = def.icon;
        const Component = def.Component;
        const hidden = b.visible === false;
        return (
          <div
            key={b.id}
            draggable
            onDragStart={onDragStart(idx)}
            onDragOver={onDragOver(idx)}
            onDrop={onDrop(idx)}
            onDragEnd={() => { setDragIndex(null); setOverIndex(null); }}
            data-testid={`sig-block-${b.type}`}
            className={`border rounded-2xl bg-white p-4 transition-all ${hidden ? "opacity-50" : ""} ${
              overIndex === idx && dragIndex !== idx ? "border-ink ring-1 ring-ink/20" : "border-line"
            }`}
          >
            <div className="flex items-center gap-2 mb-3">
              <GripVertical size={14} className="text-ink-disabled cursor-grab shrink-0" />
              <Icon size={14} className="text-ink-muted shrink-0" />
              <span className="text-caption font-medium flex-1">{def.label}</span>
              <button onClick={() => toggleVisible(b.id)} title={hidden ? "Show" : "Hide"} className="p-1 text-ink-muted hover:text-ink">
                {hidden ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
              <button onClick={() => removeBlock(b.id)} title="Remove" className="p-1 text-ink-muted hover:text-danger">
                <Trash2 size={14} />
              </button>
            </div>
            <Component data={b.data} onChange={(data) => updateBlockData(b.id, data)} />
          </div>
        );
      })}
    </div>
  );
}
