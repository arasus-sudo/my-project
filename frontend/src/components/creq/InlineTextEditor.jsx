import { useEffect, useRef } from "react";
import { textStyleOf } from "./utils";

/** Double-click-to-edit overlay for text elements — a contentEditable placed
 * exactly over the element with the identical typographic style (shared
 * textStyleOf helper), so entering edit mode causes zero visual jump. The
 * underlying element stays mounted but renders its text transparent.
 *
 * Commit on blur or Ctrl/Cmd+Enter (one undo step, handled by the caller);
 * Escape cancels. Plain Enter inserts a line break, matching the element's
 * pre-wrap rendering. Lives only in the live editor — never the export tree. */
export default function InlineTextEditor({ el, palette, zoom, onCommit, onCancel }) {
  const ref = useRef(null);
  const cancelled = useRef(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.innerText = el.text || "";
    node.focus();
    // Select-all on entry (Canva behavior) — typing replaces, clicking places the caret.
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(node);
    sel.removeAllRanges();
    sel.addRange(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commit = () => {
    if (cancelled.current) return;
    onCommit(ref.current ? ref.current.innerText.replace(/\n$/, "") : "");
  };

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      data-testid="inline-text-editor"
      onBlur={commit}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation(); // keep canvas shortcuts (delete/nudge/undo) out of typing
        if (e.key === "Escape") { e.preventDefault(); cancelled.current = true; onCancel(); }
        else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); ref.current?.blur(); }
      }}
      style={{
        position: "absolute",
        left: el.x, top: el.y, width: el.w, minHeight: el.h,
        transform: el.rotate ? `rotate(${el.rotate}deg)` : undefined,
        boxSizing: "border-box",
        background: "transparent",
        outline: `${1.5 / zoom}px solid #1D1D1F`,
        outlineOffset: 2,
        caretColor: "#1D1D1F",
        zIndex: 55,
        ...textStyleOf(el, palette),
      }}
    />
  );
}
