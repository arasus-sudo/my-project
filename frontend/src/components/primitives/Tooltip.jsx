import { useRef, useState } from "react";

/* Tooltip — docs/design-system.md §10.4.
 * Description only — never interactive content, never essential information
 * (the spec is explicit that a tooltip must not be the only place a fact
 * lives). 400ms open delay, 100ms close, no arrow.
 */

export default function Tooltip({ content, children, side = "top", className = "" }) {
  const [visible, setVisible] = useState(false);
  const openTimer = useRef(null);
  const closeTimer = useRef(null);

  const show = () => {
    clearTimeout(closeTimer.current);
    openTimer.current = setTimeout(() => setVisible(true), 400);
  };
  const hide = () => {
    clearTimeout(openTimer.current);
    closeTimer.current = setTimeout(() => setVisible(false), 100);
  };

  const pos = {
    top: { bottom: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)" },
    bottom: { top: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)" },
    left: { right: "calc(100% + 6px)", top: "50%", transform: "translateY(-50%)" },
    right: { left: "calc(100% + 6px)", top: "50%", transform: "translateY(-50%)" },
  }[side];

  return (
    <span
      className={`relative inline-flex ${className}`}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {visible && content && (
        <span
          role="tooltip"
          className="absolute pointer-events-none"
          style={{
            ...pos, zIndex: "var(--z-tooltip)", maxWidth: 260,
            padding: "6px 8px", borderRadius: "var(--radius-sm)",
            background: "var(--tooltip-bg)", color: "var(--tooltip-fg)",
            fontSize: 11.5, lineHeight: "16px", fontFamily: "var(--font-ui)",
            whiteSpace: "normal",
          }}
        >
          {content}
        </span>
      )}
    </span>
  );
}
