import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "../../icons";

/* Modal — docs/design-system.md §10.1.
 *
 * Wraps Radix Dialog rather than reimplementing focus trap / portal / escape
 * handling by hand — Radix owns the a11y machinery, this file owns only the
 * visual spec (widths, radius, shadow, scrim, header/body/footer geometry).
 */

const WIDTHS = { sm: 440, md: 560, lg: 720, xl: 960 };

export function Modal({ open, onOpenChange, children }) {
  return <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>{children}</DialogPrimitive.Root>;
}
export const ModalTrigger = DialogPrimitive.Trigger;

export function ModalContent({ size = "md", title, subtitle, footer, children, className = "" }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className="fixed inset-0"
        style={{ background: "var(--bg-overlay)", backdropFilter: "blur(2px)", zIndex: "var(--z-modal)" }}
      />
      <DialogPrimitive.Content
        className={`fixed left-1/2 top-1/2 flex flex-col ${className}`}
        style={{
          transform: "translate(-50%, -50%)",
          width: WIDTHS[size] || WIDTHS.md,
          maxWidth: "calc(100vw - 32px)",
          maxHeight: "72vh",
          borderRadius: "var(--radius-xl)",
          boxShadow: "var(--shadow-xl)",
          background: "var(--bg-surface)",
          zIndex: "var(--z-modal)",
        }}
      >
        {(title || subtitle) && (
          <div className="flex items-start justify-between shrink-0" style={{ padding: "20px 24px" }}>
            <div className="min-w-0">
              {title && (
                <DialogPrimitive.Title style={{
                  fontSize: 18, lineHeight: "24px", fontWeight: 600,
                  color: "var(--text-primary)", fontFamily: "var(--font-ui)", margin: 0,
                }}>
                  {title}
                </DialogPrimitive.Title>
              )}
              {subtitle && (
                <DialogPrimitive.Description style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>
                  {subtitle}
                </DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close
              aria-label="Close"
              className="shrink-0 inline-grid place-items-center"
              style={{ width: 32, height: 32, borderRadius: "var(--radius-md)", color: "var(--text-tertiary)" }}
            >
              <X size={18} strokeWidth={1.5} aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>
        )}
        <div className="overflow-y-auto" style={{ padding: 24, fontSize: 14, color: "var(--text-primary)" }}>
          {children}
        </div>
        {footer && (
          <div className="flex items-center justify-end gap-2 shrink-0" style={{
            padding: "16px 24px", borderTop: "1px solid var(--border-subtle)",
          }}>
            {footer}
          </div>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export const ModalClose = DialogPrimitive.Close;
