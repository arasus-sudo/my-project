import { RefreshCw } from "../../icons";
import StatusPill from "../primitives/StatusPill";
import Button from "../primitives/Button";

/* Integration tile — docs/design-system.md §17. */

const STATE_TONE = {
  connected: "success", active: "success", syncing: "primary", "not connected": "neutral", failed: "danger",
};

export default function IntegrationTile({ logo, name, state = "not connected", description, onConnect, onManage, onMore, className = "" }) {
  const connected = state === "connected" || state === "active";
  const tone = STATE_TONE[state.toLowerCase()] || "neutral";
  return (
    <div className={className} style={{
      background: "var(--bg-surface)", border: "1px solid var(--border-default)",
      borderRadius: "var(--radius-lg)", padding: 16,
    }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span className="inline-grid place-items-center shrink-0" style={{
            width: 36, height: 36, borderRadius: "var(--radius-md)", background: "#FFFFFF",
            border: "1px solid var(--border-default)", overflow: "hidden",
          }}>
            {logo ? <img src={logo} alt="" className="w-full h-full object-contain p-1.5" /> : null}
          </span>
          <div className="min-w-0">
            <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>{name}</div>
            <div className="flex items-center gap-1 mt-1">
              {state.toLowerCase() === "syncing" && <RefreshCw size={12} strokeWidth={1.5} aria-hidden="true" className="ds-spin" style={{ color: "var(--color-primary)" }} />}
              <StatusPill status={state} tone={tone} />
            </div>
          </div>
        </div>
        <button type="button" onClick={onMore} aria-label="More" className="inline-grid place-items-center shrink-0" style={{ width: 28, height: 28, borderRadius: "var(--radius-sm)", color: "var(--text-tertiary)" }}>
          ⋯
        </button>
      </div>
      {description && (
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 10 }}>{description}</div>
      )}
      <div className="flex justify-end" style={{ marginTop: 12 }}>
        {connected ? (
          <Button variant="secondary" size="sm" onClick={onManage}>Manage</Button>
        ) : (
          <Button variant="subtle" size="sm" onClick={onConnect}>Connect</Button>
        )}
      </div>
    </div>
  );
}

export function SyncActivityRow({ logo, event, detail, time, status, className = "" }) {
  return (
    <div className={`flex items-center gap-3 ${className}`} style={{ padding: "10px 0", borderBottom: "1px solid var(--border-subtle)" }}>
      <span className="inline-grid place-items-center shrink-0" style={{ width: 20, height: 20, borderRadius: "var(--radius-xs)", background: "var(--bg-active)", overflow: "hidden" }}>
        {logo ? <img src={logo} alt="" className="w-full h-full object-contain" /> : null}
      </span>
      <div className="min-w-0 flex-1">
        <div style={{ fontSize: 13, color: "var(--text-primary)" }}>{event}</div>
        {detail && <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{detail}</div>}
      </div>
      <span className="shrink-0" style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{time}</span>
      {status && <StatusPill status={status} tone={status.toLowerCase() === "failed" ? "danger" : "success"} className="shrink-0" />}
    </div>
  );
}
