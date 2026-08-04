import IconSquare from "../primitives/IconSquare";

/* Notification item + panel — docs/design-system.md §18. */

export default function NotificationItem({ icon, tone = "primary", title, body, timestamp, unread = false, onClick, className = "" }) {
  return (
    <button
      type="button" onClick={onClick}
      className={`w-full flex items-start gap-3 text-left transition-colors ${className}`}
      style={{ padding: "12px 16px", borderBottom: "1px solid var(--border-subtle)" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {unread && <span className="shrink-0" style={{ width: 6, height: 6, borderRadius: "var(--radius-full)", background: "var(--color-primary)", marginTop: 7 }} />}
      <IconSquare icon={icon} tone={tone} size={32} />
      <div className="min-w-0 flex-1">
        <div style={{ fontSize: 13, fontWeight: unread ? 500 : 400, color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>{title}</div>
        {body && <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>{body}</div>}
        {timestamp && <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>{timestamp}</div>}
      </div>
    </button>
  );
}

export function NotificationPanel({ title = "Notifications", onMarkAllRead, children, footerHref, className = "" }) {
  return (
    <div className={className} style={{
      width: 400, maxHeight: 480, display: "flex", flexDirection: "column",
      background: "var(--bg-surface-raised)", borderRadius: "var(--radius-lg)",
      boxShadow: "var(--shadow-md)", border: "1px solid var(--border-default)", overflow: "hidden",
    }}>
      <div className="flex items-center justify-between shrink-0" style={{ padding: "14px 16px", borderBottom: "1px solid var(--border-subtle)" }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>{title}</span>
        {onMarkAllRead && (
          <button type="button" onClick={onMarkAllRead} style={{ fontSize: 12, color: "var(--text-link)" }}>Mark all read</button>
        )}
      </div>
      <div className="overflow-y-auto flex-1">{children}</div>
      {footerHref && (
        <a href={footerHref} className="block text-center shrink-0" style={{ padding: 12, fontSize: 12.5, color: "var(--text-link)", borderTop: "1px solid var(--border-subtle)" }}>
          View all notifications
        </a>
      )}
    </div>
  );
}
