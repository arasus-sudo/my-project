import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Loader2, PenSquare, ShieldCheck, AlertTriangle, Check } from "lucide-react";
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

  const openInEditor = async () => {
    setBusy(true);
    try {
      // Hand off in whatever direction is on screen, not whatever the model
      // originally chose — the switcher above is free, so the two diverge.
      const { data } = await api.post(`/design-eq/projects/${id}/handoff`, { palette_family: family });
      // The palette hexes live in the frontend design system, so the deck's
      // swatches and chrome are written from here rather than duplicated in
      // Python. Non-fatal: the slides carry literal colours and render
      // correctly regardless — only the editor's palette panel would be stale.
      try {
        await api.put(`/carousel/${data.carousel_id}`, {
          ai_palette: paletteForDeck(data.palette_family || family),
        });
      } catch { /* deck still opens correctly */ }
      toast.success("Opened as an editable deck");
      nav(`/app/create-eq/${data.carousel_id}`);
    } catch (err) {
      if (!isCreditError(err)) toast.error(err?.response?.data?.detail || "Could not open in the editor");
    } finally { setBusy(false); }
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
          <button onClick={openInEditor} disabled={busy} data-testid="deq-open-editor"
            className="btn-primary disabled:opacity-50">
            {busy ? <><Loader2 size={14} className="animate-spin" /> Opening…</>
                  : <><PenSquare size={14} /> Open in editor</>}
          </button>
        )}
      </header>

      {!structured && (
        <div className="border border-line rounded-xl p-5 bg-amber-50/50 text-body">
          This format uses the code target, which isn&apos;t rendering yet. The structured
          record — surface, sections and audit — is stored and correct.
        </div>
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
