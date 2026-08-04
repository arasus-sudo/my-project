import { useTheme } from "next-themes"
import { Toaster as Sonner, toast } from "sonner"

/* §10.5: 360px wide, --bg-surface, --border-default, --shadow-lg, radius-lg,
 * 14/16px padding. Set as inline `style` (sonner's own escape hatch) rather
 * than Tailwind utility classes so it reads straight off the design tokens
 * instead of the legacy bg-background/border/shadow-lg utility names. */
const Toaster = ({
  ...props
}) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      style={{ "--width": "360px" }}
      toastOptions={{
        style: {
          width: 360,
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-lg)",
          padding: "14px 16px",
          color: "var(--text-primary)",
          fontFamily: "var(--font-ui)",
        },
        classNames: {
          title: "font-medium",
          description: "text-caption",
          // bg-primary/text-primary-foreground used to resolve through the
          // (now-fixed) colliding legacy "primary" key. That key is gone,
          // so this uses the CSS var directly rather than reintroducing a
          // Tailwind color alias just for one button.
          actionButton:
            "group-[.toast]:bg-[var(--color-primary)] group-[.toast]:text-white",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-ink-muted",
        },
      }}
      {...props} />
  );
}

export { Toaster, toast }
