/* Live email preview — desktop/mobile toggle inside an isolated iframe. */

import { useState } from "react";
import { SegmentedControl } from "../primitives";

export default function LivePreview({ html, subject, loading }) {
  const [mode, setMode] = useState("desktop");

  return (
    <div className="flex flex-col" style={{ minHeight: 0, height: "100%" }}>
      <div className="flex items-center justify-between gap-2" style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {subject || "No subject"}
        </div>
        <SegmentedControl
          value={mode}
          options={[
            { value: "desktop", label: "Desktop" },
            { value: "mobile", label: "Mobile" },
          ]}
          onChange={setMode}
        />
      </div>
      <div style={{ flex: 1, minHeight: 0, border: "1px solid var(--border-default)", borderRadius: "var(--radius-lg)", overflow: "hidden", background: "var(--bg-surface-sunken)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 16 }}>
        {loading ? (
          <p style={{ fontSize: 12.5, color: "var(--text-tertiary)", paddingTop: 40 }}>Rendering…</p>
        ) : (
          <iframe
            title="Email preview"
            sandbox=""
            srcDoc={`<!doctype html><html><body style="margin:0">${html || ""}</body></html>`}
            style={{
              width: mode === "desktop" ? "100%" : 360,
              maxWidth: mode === "desktop" ? 640 : 360,
              height: 620,
              border: 0,
              background: "#fff",
              borderRadius: "var(--radius-md)",
              boxShadow: mode === "mobile" ? "var(--shadow-md)" : "none",
              transition: "width var(--dur-base) var(--ease-out)",
            }}
            data-testid="tmpl-live-preview"
          />
        )}
      </div>
    </div>
  );
}
