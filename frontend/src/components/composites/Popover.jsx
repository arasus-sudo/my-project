import * as PopoverPrimitive from "@radix-ui/react-popover";

/* Popover — docs/design-system.md §10.3. Wraps Radix Popover for its
 * positioning/dismiss logic; this file owns only the visual spec. */

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;

export function PopoverContent({ width = 320, sideOffset = 8, className = "", children, ...rest }) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        sideOffset={sideOffset}
        className={className}
        style={{
          width, maxWidth: "calc(100vw - 32px)",
          borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-md)",
          background: "var(--bg-surface-raised)", padding: 16,
          zIndex: "var(--z-dropdown)",
        }}
        {...rest}
      >
        {children}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  );
}
