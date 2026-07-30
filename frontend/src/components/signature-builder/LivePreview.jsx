import { useState } from "react";
import { Monitor, Smartphone } from "lucide-react";
import { renderSignature } from "./renderHtml";
import { API } from "../../lib/api";

export default function LivePreview({ blocks, style, signatureId, clickTracking, previewRef }) {
  const [width, setWidth] = useState("desktop");
  const { html } = renderSignature(blocks, style, {
    signatureId, clickTracking, trackingApiBase: API,
  });

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-line">
        <span className="text-caption font-medium text-ink-muted">Live preview</span>
        <div className="flex items-center gap-1 rounded-full border border-line bg-white p-1">
          <button onClick={() => setWidth("desktop")} data-testid="sig-preview-desktop"
            className={`p-1.5 rounded-full ${width === "desktop" ? "bg-ink text-white" : "text-ink-muted"}`}>
            <Monitor size={13} />
          </button>
          <button onClick={() => setWidth("mobile")} data-testid="sig-preview-mobile"
            className={`p-1.5 rounded-full ${width === "mobile" ? "bg-ink text-white" : "text-ink-muted"}`}>
            <Smartphone size={13} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-6 flex justify-center">
        <div
          className="bg-white border border-line rounded-2xl shadow-card p-6 transition-all"
          style={{ width: width === "mobile" ? 320 : 480, maxWidth: "100%" }}
          data-testid="sig-live-preview"
        >
          {html ? (
            <div ref={previewRef} dangerouslySetInnerHTML={{ __html: html }} />
          ) : (
            <p className="text-caption text-ink-muted text-center">Your signature preview will appear here.</p>
          )}
        </div>
      </div>
    </div>
  );
}
