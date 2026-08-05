import * as TabsPrimitive from "@radix-ui/react-tabs";

/* Tabs — docs/design-system.md §8.3, underline style. Wraps Radix Tabs for
 * roving-tabindex keyboard behaviour; restyles the generic shadcn "pill"
 * tabs (see components/ui/tabs.jsx) into the spec's underline treatment. */

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className = "", ...rest }) {
  return (
    <TabsPrimitive.List
      className={`flex ${className}`}
      style={{ borderBottom: "1px solid var(--border-default)", gap: 20 }}
      {...rest}
    />
  );
}

export function TabsTrigger({ count, className = "", children, ...rest }) {
  return (
    <TabsPrimitive.Trigger
      className={`ds-tab relative inline-flex items-center gap-1.5 ${className}`}
      style={{
        height: 36, fontSize: 13.5, fontWeight: 500, fontFamily: "var(--font-ui)",
        color: "var(--text-secondary)", background: "transparent",
      }}
      {...rest}
    >
      {children}
      {typeof count === "number" && (
        <span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{count}</span>
      )}
    </TabsPrimitive.Trigger>
  );
}

export const TabsContent = TabsPrimitive.Content;
