import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Loader2, PenSquare, ShieldCheck, AlertTriangle, Check, Download, Play } from "lucide-react";
import { api, isCreditError } from "../lib/api";
import { buildPremiumDeck, paletteForDeck } from "../lib/creqPremiumEngine";
import { PALETTE_FAMILIES } from "../lib/creqClaudeDesign";
import ElementRender from "../components/creq/ElementRender";

/** Design EQ viewer.
 *
 * Two things here only work because the master is structured rather than HTML:
 *
 * 1. Palette variants are FREE. Swapping the direction re-composes locally from
 *    the same sections — no second generation, no credits, no waiting. In a
 *    code-master tool every variant is another full generation, which is why
 *    those tools iterate serially.
 * 2. "Open in editor" is a straight copy rather than an import, because Design
 *    EQ sections and Create EQ premium slides are deliberately one vocabulary.
 */

const THUMB_W = 260;

export default function DesignEQViewer() {
  const { id } = useParams();
  const nav = useNavigate();
  const [proj, setProj] = useState(null);
  const [audit, setAudit] = useState(null);
  const [family, setFamily] = useState(null);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [building, setBuilding] = useState(false);
  const [viewport, setViewport] = useState(1280);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/design-eq/projects/${id}`);
      setProj(data);
      setFamily(data.palette_family || "claude");
      try {
        const a = await api.post(`/design-eq/projects/${id}/audit`);
        setAudit(a.data);
      } catch { /* audit is advisory — never block the view on it */ }
    } catch { toast.error("Could not load this design"); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const canvas = proj?.canvas || { w: 1080, h: 1350 };

  // Composition is pure and local, so changing direction is instant.
  const built = useMemo(() => {
    if (!proj?.sections?.length || proj.master !== "structured") return [];
    try {
      return buildPremiumDeck(proj.sections, { canvas, familyId: family || "claude" });
    } catch { return []; }
  }, [proj, family, canvas]);

  const palette = useMemo(() => paletteForDeck(family || "claude"), [family]);

  // Measured so the preview can be scaled rather than clamped — see the frame.
  const frameWrapRef = useRef(null);
  const [wrapW, setWrapW] = useState(0);
  useEffect(() => {
    const node = frameWrapRef.current;
    if (!node) return undefined;
    const measure = () => setWrapW(node.clientWidth - 32); // minus the p-4 padding
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => ro.disconnect();
  }, [proj?.code]);
  const frameScale = wrapW > 0 ? Math.min(1, wrapW / viewport) : 1;

  /** Materialise the design as a deck, composed and persisted.
   *
   * The handoff writes the raw sections; this then saves the COMPOSED slides
   * over them. That matters beyond speed: composition runs in the browser, so
   * until the composed elements are persisted the server only holds
   * archetypes and copy — and anything server-side that reads the deck (the
   * .pptx exporter above all) would see slides with no elements on them.
   * Composing here means the stored deck is complete the moment it exists. */
  const materialise = async () => {
    // Hand off in whatever direction is on screen, not whatever the model
    // originally chose — the switcher above is free, so the two diverge.
    const { data } = await api.post(`/design-eq/projects/${id}/handoff`, { palette_family: family });
    const composed = built.length ? built : buildPremiumDeck(proj.sections, { canvas, familyId: family });
    try {
      await api.put(`/carousel/${data.carousel_id}`, {
        slides: composed,
        // The palette hexes live in the frontend design system, so they are
        // written from here rather than duplicated into Python.
        ai_palette: paletteForDeck(data.palette_family || family),
      });
    } catch { /* the editor recomposes from sections on open, so this is not fatal */ }
    setProj((p) => ({ ...p, carousel_id: data.carousel_id }));
    return data.carousel_id;
  };

  const openInEditor = async () => {
    setBusy(true);
    try {
      const deckId = await materialise();
      toast.success("Opened as an editable deck");
      nav(`/app/create-eq/${deckId}`);
    } catch (err) {
      if (!isCreditError(err)) toast.error(err?.response?.data?.detail || "Could not open in the editor");
    } finally { setBusy(false); }
  };

  /** Download a native .pptx. Needs a materialised deck, so it hands off first
   * when one doesn't exist yet — the user shouldn't have to know that a deck is
   * the thing being exported. Fetched as a blob rather than linked directly
   * because the endpoint is authenticated and an <a href> sends no token. */
  const downloadPptx = async () => {
    setExporting(true);
    try {
      // Always re-materialise: the export reads the stored deck, and the
      // direction on screen may have changed since it was last written.
      const deckId = await materialise();
      const res = await api.get(`/design-eq/decks/${deckId}/pptx`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(proj.brief || "deck").slice(0, 40).replace(/\W+/g, "-")}.pptx`;
      a.click();
      URL.revokeObjectURL(url);
      const live = res.headers?.["x-deck-text-elements"];
      toast.success(live ? `Exported — ${live} text blocks stayed editable` : "Exported");
    } catch (err) {
      if (!isCreditError(err)) toast.error("Could not build the presentation");
    } finally { setExporting(false); }
  };

  /** Build the code target. Tokens are resolved here and sent with the request:
   * the palette hexes live in the frontend design system, so shipping them to
   * the model from here keeps one source of truth instead of a Python copy that
   * would drift. */
  const buildCode = async () => {
    setBuilding(true);
    try {
      // A whole page is a long completion — routinely 30-60s. The client has no
      // default timeout, so this is bounded explicitly: a backend that dies
      // mid-build should surface as an error, not an endless spinner.
      const { data } = await api.post(`/design-eq/projects/${id}/build-code`, {
        tokens: paletteForDeck(family || "claude"),
      }, { timeout: 180000 });
      setProj((p) => ({ ...p, code: data.code, code_audit: data.audit }));
      const n = data.audit?.hits?.length || 0;
      if (n === 0) toast.success("Built — passed every check");
      else toast.warning(`Built with ${n} issue${n === 1 ? "" : "s"} — see the build check`);
    } catch (err) {
      if (!isCreditError(err)) toast.error(err?.response?.data?.detail || "Build failed");
    } finally { setBuilding(false); }
  };

  const downloadHtml = () => {
    const blob = new Blob([proj.code], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(proj.brief || "page").slice(0, 40).replace(/\W+/g, "-")}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!proj) return <div className="p-6 sm:p-8 text-ink-muted">Loading…</div>;

  const scale = THUMB_W / canvas.w;
  const structured = proj.master === "structured";

  return (
    <div className="p-6 sm:p-8 max-w-6xl mx-auto" data-testid="deq-viewer">
      <button onClick={() => nav("/app/design-eq")} className="btn-ghost text-caption mb-4">
        <ArrowLeft size={14} /> Designs
      </button>

      <header className="mb-6 flex flex-wrap items-start gap-4">
        <div className="flex-1 min-w-[260px]">
          <h1 className="text-h2 font-display font-bold">{proj.brief}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className="text-[10px] font-mono uppercase tracking-wide px-2 py-0.5 rounded-full bg-ash text-ink-muted">
              {proj.surface}
            </span>
            <span className="text-caption text-neutral-400">
              {(proj.sections || []).length} sections · {canvas.w}×{canvas.h}
            </span>
            {structured
              ? <span className="text-caption text-emerald-700 inline-flex items-center gap-1"><ShieldCheck size={13} /> structured master</span>
              : <span className="text-caption text-amber-700 inline-flex items-center gap-1"><AlertTriangle size={13} /> code master</span>}
          </div>
          {proj.routing_why && <p className="text-caption text-neutral-400 mt-2 max-w-2xl">{proj.routing_why}</p>}
        </div>
        {structured && (
          <div className="flex items-center gap-2">
            <button onClick={downloadPptx} disabled={exporting} data-testid="deq-export-pptx"
              className="btn-secondary text-body disabled:opacity-50"
              title="Native PowerPoint — every text block stays editable">
              {exporting ? <><Loader2 size={14} className="animate-spin" /> Building…</>
                         : <><Download size={14} /> Download .pptx</>}
            </button>
            <button onClick={openInEditor} disabled={busy} data-testid="deq-open-editor"
              className="btn-primary disabled:opacity-50">
              {busy ? <><Loader2 size={14} className="animate-spin" /> Opening…</>
                    : <><PenSquare size={14} /> Open in editor</>}
            </button>
          </div>
        )}
      </header>

      {!structured && (
        <section data-testid="deq-code-target">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <button onClick={buildCode} disabled={building} data-testid="deq-build-code"
              className="btn-primary disabled:opacity-50">
              {building ? <><Loader2 size={14} className="animate-spin" /> Building…</>
                        : <><Play size={14} /> {proj.code ? "Rebuild" : "Build it"}</>}
            </button>
            {proj.code && (
              <>
                {/* Real device widths, so the check is the same one a browser
                    would make rather than an arbitrary preview size. */}
                {[["desktop", 1280], ["tablet", 834], ["mobile", 390]].map(([k, w]) => (
                  <button key={k} type="button" onClick={() => setViewport(w)}
                    data-testid={`deq-viewport-${k}`}
                    className={`px-2.5 py-1 rounded-full border text-caption transition-colors ${
                      viewport === w ? "border-ink bg-ash" : "border-line hover:border-neutral-400"}`}>
                    {k} · {w}
                  </button>
                ))}
                <button onClick={downloadHtml} data-testid="deq-download-html"
                  className="btn-secondary text-caption ml-auto">
                  <Download size={13} /> Download .html
                </button>
              </>
            )}
          </div>

          {proj.code_audit && (
            <div className={`mb-3 rounded-xl border px-4 py-3 text-caption ${
              proj.code_audit.verdict === "clean" ? "border-emerald-300 bg-emerald-50"
              : proj.code_audit.verdict === "minor" ? "border-amber-300 bg-amber-50"
              : "border-red-300 bg-red-50"}`} data-testid="deq-code-audit">
              <b>Build check: {proj.code_audit.verdict}</b>
              {" — "}{Math.round((proj.code_audit.bytes || 0) / 1024)} KB, {proj.code_audit.hits.length} issue
              {proj.code_audit.hits.length === 1 ? "" : "s"}.
              {proj.code_audit.hits.length > 0 && (
                <ul className="mt-2 grid gap-1">
                  {proj.code_audit.hits.map((h) => (
                    <li key={h.id}><b>{h.id}</b> — {h.detail}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {proj.code ? (
            <>
            <div ref={frameWrapRef} className="border border-line rounded-xl overflow-hidden bg-neutral-100 p-4">
              {/* The frame is rendered at its TRUE viewport width and scaled down
                  to fit, rather than clamped with max-width. Clamping would make
                  the page lay out at the container's width instead of the width
                  on the button, so "desktop 1280" would quietly be previewing
                  something else — useless for the responsive check this is for. */}
              <div style={{
                width: viewport * frameScale, height: 720 * frameScale,
                margin: "0 auto", overflow: "hidden",
              }}>
                {/* Sandboxed: generated markup is untrusted, so it runs with no
                    same-origin access and cannot reach this app's session. */}
                <iframe
                  title="Design preview"
                  data-testid="deq-code-frame"
                  srcDoc={proj.code}
                  sandbox="allow-scripts"
                  style={{
                    width: viewport, height: 720, border: "none", background: "#fff",
                    transform: `scale(${frameScale})`, transformOrigin: "top left",
                  }}
                />
              </div>
            </div>
            <p className="text-caption text-neutral-400 mt-1.5">
              Rendering at {viewport}px{frameScale < 1 ? `, shown at ${Math.round(frameScale * 100)}%` : ""}.
            </p>
            </>
          ) : (
            <div className="border border-line rounded-xl p-5 text-body text-neutral-500">
              This format renders as a self-contained page rather than slides. Build it to
              see it — the surface and brief are already settled above.
            </div>
          )}
        </section>
      )}

      {structured && (
        <>
          {/* ---- direction switcher: free because composition is local ---- */}
          <section className="mb-6">
            <div className="flex items-baseline gap-2 mb-2">
              <span className="ui-label">Direction</span>
              <span className="text-[10px] font-mono text-neutral-400">
                re-composed locally — no credits, no regeneration
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.values(PALETTE_FAMILIES).map((f) => (
                <button key={f.id} type="button" onClick={() => setFamily(f.id)}
                  data-testid={`deq-family-${f.id}`}
                  className={`text-left p-2.5 rounded-xl border transition-colors min-w-[190px] ${
                    family === f.id ? "border-ink bg-ash" : "border-line hover:border-neutral-400"}`}>
                  <div className="flex items-center gap-1.5">
                    <span className="flex gap-0.5">
                      {["bg", "accentDisplay", "text"].map((k) => (
                        <span key={k} className="w-3 h-3 rounded-full border border-black/10"
                          style={{ background: f.surfaces.paper[k] }} />
                      ))}
                    </span>
                    <span className="text-caption font-medium">{f.name}</span>
                    {family === f.id && <Check size={12} className="ml-auto" />}
                  </div>
                  <div className="text-[10px] text-neutral-400 mt-1 leading-tight">{f.blurb}</div>
                </button>
              ))}
            </div>
          </section>

          {/* ---- composed slides ---- */}
          <section className="mb-8">
            <div className="ui-label mb-3">Composed</div>
            <div className="flex flex-wrap gap-4">
              {built.map((s, i) => (
                <div key={s._k} className="flex-none" data-testid={`deq-slide-${i}`}>
                  <div className="relative overflow-hidden rounded-lg ring-1 ring-line"
                    style={{ width: canvas.w * scale, height: canvas.h * scale, background: s.bg?.color }}>
                    <div style={{
                      position: "absolute", left: 0, top: 0,
                      width: canvas.w, height: canvas.h,
                      transform: `scale(${scale})`, transformOrigin: "top left", pointerEvents: "none",
                    }}>
                      {s.elements.map((el) => (
                        <ElementRender key={el.id} el={el} palette={palette} onPointerDown={() => {}} />
                      ))}
                    </div>
                  </div>
                  <div className="text-[10px] font-mono text-neutral-400 mt-1.5 flex gap-2">
                    <span>{i + 1}</span>
                    <span>{s._premium?.archetype}</span>
                    <span className="text-neutral-300">{s._premium?.surface}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {/* ---- audit ---- */}
      {audit && (
        <section className="border border-line rounded-2xl p-5 bg-white" data-testid="deq-audit">
          <div className="flex items-center gap-2 mb-1">
            <span className="ui-label">Anti-slop audit</span>
            <span className={`text-[10px] font-mono uppercase tracking-wide px-1.5 py-0.5 rounded-full ${
              audit.verdict === "clean" ? "bg-emerald-100 text-emerald-800"
              : audit.verdict === "minor" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"}`}>
              {audit.verdict}
            </span>
          </div>
          <p className="text-caption text-neutral-400">
            {audit.hits.length} of {audit.checked} machine-checkable tells hit.
          </p>
          {audit.hits.length > 0 && (
            <ul className="mt-3 grid gap-1.5">
              {audit.hits.map((h) => (
                <li key={h.id} className="text-caption border border-amber-300 bg-amber-50 rounded-lg px-3 py-2">
                  <b>{h.id}</b> — {h.detail}
                </li>
              ))}
            </ul>
          )}
          {/* Stated plainly rather than folded into the score, so a clean result
              never implies more was verified than actually was. */}
          <p className="text-caption text-neutral-400 mt-3">
            Not machine-checkable, needs a human eye: {(audit.unchecked || []).join(", ")}.
          </p>
        </section>
      )}
    </div>
  );
}
