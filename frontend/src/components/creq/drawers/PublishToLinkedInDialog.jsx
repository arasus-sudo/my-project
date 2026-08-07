import { useState } from "react";
import { Loader2, Send, FileText, Image as ImageIcon } from "lucide-react";
import { CANVAS as DEFAULT_CANVAS } from "../../../lib/creqTemplates";

/**
 * "Publish to LinkedIn" in Create EQ. Two modes:
 *   - Carousel: all slides render into one PDF -> Social EQ drafts the caption
 *     -> post lands in the Social EQ approval queue as a LinkedIn document post.
 *   - Single slide: the active slide renders as a PNG -> static image post.
 *
 * The dialog is a thin picker, like PdfExportDialog: rendering + the API call
 * happen in the editor (it owns the html2canvas/jsPDF pipeline), so this only
 * collects the mode + editable topic and reports back via `onPublish`.
 */
export default function PublishToLinkedInDialog({ proj, onClose, busy, progress, onPublish }) {
  const CANVAS = proj?.canvas?.w && proj?.canvas?.h ? proj.canvas : DEFAULT_CANVAS;
  const [mode, setMode] = useState("carousel");
  const [topic, setTopic] = useState(proj?.topic || "");

  return (
    <div className="fixed inset-0 bg-ink/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg flex flex-col" onClick={(e) => e.stopPropagation()} data-testid="publish-linkedin-dialog">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-line">
          <Send size={16} />
          <div className="font-display font-bold">Publish to LinkedIn</div>
          <div className="text-caption text-neutral-500 ml-2">Drafts via Social EQ, then lands in the approval queue.</div>
          <button onClick={onClose} className="ml-auto btn-ghost text-caption" data-testid="publish-close">Close</button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setMode("carousel")} data-testid="publish-mode-carousel"
              className={`text-left p-4 rounded-xl border-2 transition-all ${mode === "carousel" ? "border-ink bg-neutral-50" : "border-line hover:border-neutral-400"}`}>
              <FileText size={16} className="mb-2 text-neutral-700" />
              <div className="font-semibold text-body">Full carousel</div>
              <div className="text-caption text-neutral-500 mt-1">All {proj.slides.length} slides as a swipeable PDF document post.</div>
            </button>
            <button onClick={() => setMode("slide")} data-testid="publish-mode-slide"
              className={`text-left p-3 rounded-xl border-2 transition-all ${mode === "slide" ? "border-ink bg-neutral-50" : "border-line hover:border-neutral-400"}`}>
              <ImageIcon size={20} className="text-neutral-700" />
              <div className="font-semibold text-body">Single slide</div>
              <div className="text-caption text-neutral-500 mt-1">Current slide as a static image post ({CANVAS.w}×{CANVAS.h}).</div>
            </button>
          </div>

          <label className="block">
            <span className="ui-label">Topic — used by Social EQ to draft the caption & hashtags</span>
            <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)} data-testid="publish-topic"
              placeholder={proj?.topic || "e.g. How we built our AI sales pipeline"} className="w-full input" />
          </label>
        </div>

        <div className="px-6 py-4 border-t border-line flex items-center justify-between gap-3">
          {busy && progress ? (
            <span className="text-caption font-mono text-neutral-500" data-testid="publish-progress">
              Rendering {progress.done} of {progress.total}…
            </span>
          ) : <span className="text-caption text-neutral-500">Rendering stays local — nothing is posted until you approve in the Social EQ queue.</span>}
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="btn-secondary text-body">Cancel</button>
            <button onClick={() => onPublish(mode, topic)} disabled={busy || !topic.trim()}
              data-testid="publish-send"
              className="btn-primary disabled:opacity-40">
              {busy ? <><Loader2 size={14} className="animate-spin" /> Sending…</> : <><Send size={14} /> Send to queue</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}