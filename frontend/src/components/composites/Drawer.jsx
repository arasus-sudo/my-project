import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "../../icons";

/* Drawer / side sheet — docs/design-system.md §10.2.
 * Right-anchored, radius 0, same header/footer geometry as Modal. Wraps
 * Radix Dialog (not a separate library) since a drawer is a dialog that
 * slides in from an edge, not a distinct interaction pattern.
 */

const WIDTHS = { sm: 400, md: 520, lg: 640 };

export function Drawer({ open, onOpenChange, children }) {
  return <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>{children}</DialogPrimitive.Root>;
}
export const DrawerTrigger = DialogPrimitive.Trigger;

export function DrawerContent({ size = "md", title, subtitle, footer, children, className = "" }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0" style={{ background: "var(--bg-overlay)", zIndex: "var(--z-drawer)" }} />
      <DialogPrimitive.Content
        className={`fixed top-0 right-0 h-full flex flex-col ${className}`}
        style={{
          width: WIDTHS[size] || WIDTHS.md,
          maxWidth: "100vw",
          borderLeft: "1px solid var(--border-default)",
          boxShadow: "var(--shadow-lg)",
          background: "var(--bg-surface)",
          zIndex: "var(--z-drawer)",
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
        <div className="overflow-y-auto flex-1" style={{ padding: 24, fontSize: 14, color: "var(--text-primary)" }}>
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

export const DrawerClose = DialogPrimitive.Close;
