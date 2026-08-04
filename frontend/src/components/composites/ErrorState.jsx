import { useState } from "react";
import { AlertCircle } from "../../icons";
import Button from "../primitives/Button";

/* ErrorState — docs/design-system.md §4.4.
 * Never exposes a stack trace or raw status code in the primary message —
 * the technical detail goes behind a collapsed mono disclosure line instead.
 */

export default function ErrorState({ title = "Something went wrong", message, code, onRetry, className = "" }) {
  const [showDetail, setShowDetail] = useState(false);
  return (
    <div className={className} style={{
      border: "1px solid var(--color-danger-border)", background: "var(--color-danger-subtle)",
      borderRadius: "var(--radius-lg)", padding: 20, textAlign: "center",
    }}>
      <AlertCircle size={20} strokeWidth={1.5} aria-hidden="true" style={{ color: "var(--color-danger)", margin: "0 auto 8px" }} />
      <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>{title}</div>
      {message && <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>{message}</div>}
      <div className="flex items-center justify-center gap-3 mt-4">
        {onRetry && <Button variant="secondary" size="sm" onClick={onRetry}>Try again</Button>}
        {code && (
          <button
            type="button"
            onClick={() => setShowDetail((s) => !s)}
            style={{ fontSize: 11.5, color: "var(--text-tertiary)", textDecoration: "underline" }}
          >
            {showDetail ? "Hide details" : "Show details"}
          </button>
        )}
      </div>
      {code && showDetail && (
        <div className="tnum" style={{
          marginTop: 8, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-tertiary)",
          background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)",
          padding: "6px 8px", display: "inline-block",
        }}>
          {code}
        </div>
      )}
    </div>
  );
}
