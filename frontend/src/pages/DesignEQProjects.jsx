import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Compass, Trash2, ArrowRight, ShieldCheck, AlertTriangle } from "lucide-react";
import { api, isCreditError } from "../lib/api";
import FormatPicker from "../components/creq/FormatPicker";

/** Design EQ — surface-first design agent.
 *
 * The page is deliberately built around the routing step rather than hiding it.
 * Claude Design commits to a surface archetype internally and never shows the
 * user which one it picked; when it picks wrong, the only feedback is that the
 * output feels off with no way to say why. Here the chosen surface is shown
 * before generation, with the model's reasoning and a one-click override — the
 * decision that most determines the result is the one the user can actually
 * see and correct. See backend/design_eq.py and the Design EQ research brief. */

const FORMAT_BLURB = {
  deck: "Slide sequence with an argument arc.",
  one_pager: "A single dense page that stands alone.",
  landing: "Marketing page built to convert.",
  prototype: "Clickable flow modelling real interaction.",
  comparison: "Options side by side on one canvas.",
  component_lab: "Variants of one component, explored.",
};

export default function DesignEQProjects() {
  const [catalog, setCatalog] = useState(null);
  const [projects, setProjects] = useState([]);
  const [brief, setBrief] = useState("");
  const [fmt, setFmt] = useState("deck");
  const [sectionCount, setSectionCount] = useState(6);
  const [format, setFormat] = useState({ platform: "linkedin", customW: 1080, customH: 1350 });
  const [routing, setRouting] = useState(null);
  const [surfaceOverride, setSurfaceOverride] = useState(null);
  const [routing_busy, setRoutingBusy] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [cat, list] = await Promise.all([
        api.get("/design-eq/surfaces"),
        api.get("/design-eq/projects"),
      ]);
      setCatalog(cat.data);
      setProjects(list.data || []);
    } catch { toast.error("Could not load Design EQ"); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Routing is its own step and its own (cheap) call, so the surface can be
  // reviewed before the expensive generation is paid for.
  const runRouting = async () => {
    if (brief.trim().length < 8) { toast.error("Describe what you're designing first"); return; }
    setRoutingBusy(true);
    setSurfaceOverride(null);
    try {
      const { data } = await api.post("/design-eq/route", { brief: brief.trim(), format: fmt });
      setRouting(data);
    } catch (err) { if (!isCreditError(err)) toast.error("Could not read the brief"); }
    finally { setRoutingBusy(false); }
  };

  const activeSurface = surfaceOverride || routing?.surface || null;
  const surfaceMeta = (catalog?.surfaces || []).find((s) => s.id === activeSurface);

  const generate = async () => {
    if (brief.trim().length < 8) { toast.error("Describe what you're designing first"); return; }
    setBusy(true);
    try {
      const isStructured = (catalog?.formats || []).find((f) => f.id === fmt)?.master === "structured";
      const { data } = await api.post("/design-eq/generate", {
        brief: brief.trim(),
        fmt,
        section_count: sectionCount,
        ...(activeSurface ? { surface: activeSurface } : {}),
        ...(isStructured ? { canvas: canvasFromFormat(format) } : {}),
      });
      toast.success(`Designed as a ${surfaceLabel(catalog, data.surface)} surface`);
      setBrief(""); setRouting(null); setSurfaceOverride(null);
      setProjects((cur) => [data, ...cur]);
    } catch (err) { if (!isCreditError(err)) toast.error("Generation failed — try again"); }
    finally { setBusy(false); }
  };

  const remove = async (id) => {
    try {
      await api.delete(`/design-eq/projects/${id}`);
      setProjects((cur) => cur.filter((p) => p.id !== id));
    } catch { toast.error("Could not delete"); }
  };

  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto" data-testid="design-eq-page">
      <header className="mb-7">
        <h1 className="text-h1 font-display font-bold">Design EQ</h1>
        <p className="text-body text-neutral-400 mt-1">
          Decks, prototypes and landing pages — composed for what the surface actually does.
        </p>
      </header>

      {/* ---- brief ---- */}
      <div className="border border-line rounded-2xl p-5 bg-white">
        <label className="ui-label block mb-1.5" htmlFor="deq-brief">What are you designing?</label>
        <textarea
          id="deq-brief"
          value={brief}
          onChange={(e) => { setBrief(e.target.value); setRouting(null); }}
          rows={3}
          data-testid="deq-brief"
          placeholder="e.g. An internal console where support leads triage the overnight ticket queue and reassign owners"
          className="w-full border border-line rounded-xl p-3 text-body focus:outline-none focus:border-ink resize-y"
        />

        <div className="mt-4">
          <span className="ui-label block mb-1.5">Deliverable</span>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {(catalog?.formats || []).map((f) => (
              <button key={f.id} type="button" data-testid={`deq-fmt-${f.id}`}
                onClick={() => { setFmt(f.id); setRouting(null); }}
                className={`text-left p-2.5 rounded-xl border transition-colors ${
                  fmt === f.id ? "border-ink bg-ash" : "border-line hover:border-neutral-400"}`}>
                <div className="text-caption font-medium">{f.label}</div>
                <div className="text-[10px] text-neutral-400 mt-0.5 leading-tight">{FORMAT_BLURB[f.id]}</div>
              </button>
            ))}
          </div>
        </div>

        {(catalog?.formats || []).find((f) => f.id === fmt)?.master === "structured" && (
          <div className="mt-4 grid sm:grid-cols-2 gap-4">
            <FormatPicker value={format} onChange={setFormat} />
            <label className="block">
              <span className="ui-label block mb-1.5">Sections</span>
              <div className="flex gap-1.5">
                {[4, 6, 8, 10, 12].map((n) => (
                  <button key={n} type="button" onClick={() => setSectionCount(n)}
                    data-testid={`deq-count-${n}`}
                    className={`px-3 py-1.5 rounded-lg border text-caption transition-colors ${
                      sectionCount === n ? "border-ink bg-ash" : "border-line hover:border-neutral-400"}`}>
                    {n}
                  </button>
                ))}
              </div>
            </label>
          </div>
        )}

        <div className="mt-4 flex items-center gap-2">
          <button onClick={runRouting} disabled={routing_busy || busy}
            data-testid="deq-route-btn" className="btn-secondary text-body disabled:opacity-50">
            {routing_busy ? <><Loader2 size={14} className="animate-spin" /> Reading the brief…</>
                          : <><Compass size={14} /> Read the brief</>}
          </button>
          <button onClick={generate} disabled={busy || brief.trim().length < 8}
            data-testid="deq-generate-btn" className="btn-primary disabled:opacity-40">
            {busy ? <><Loader2 size={14} className="animate-spin" /> Designing…</>
                  : <>Design it <ArrowRight size={14} /></>}
          </button>
        </div>
      </div>

      {/* ---- surface decision, shown before you pay for it ---- */}
      {routing && (
        <div className="mt-4 border border-line rounded-2xl p-5 bg-white animate-fade-in" data-testid="deq-routing">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="ui-label">Surface</span>
            <span className="text-[10px] font-mono text-neutral-400">
              {Math.round((routing.confidence || 0) * 100)}% confident
            </span>
          </div>
          <p className="text-body">
            <b>{surfaceMeta?.label || activeSurface}</b>
            <span className="text-neutral-400"> — the user is {surfaceMeta?.does}</span>
          </p>
          {routing.why && <p className="text-caption text-neutral-400 mt-1.5">{routing.why}</p>}
          {surfaceMeta?.composition && (
            <p className="text-caption text-ink-muted mt-2 border-l-2 border-line pl-3">{surfaceMeta.composition}</p>
          )}

          <div className="mt-3">
            <span className="ui-label block mb-1.5">Wrong read? Override it</span>
            <div className="flex flex-wrap gap-1.5">
              {(catalog?.surfaces || []).map((s) => (
                <button key={s.id} type="button" onClick={() => setSurfaceOverride(s.id)}
                  data-testid={`deq-surface-${s.id}`}
                  className={`px-2.5 py-1 rounded-full border text-caption transition-colors ${
                    activeSurface === s.id ? "border-ink bg-ash" : "border-line hover:border-neutral-400"}`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ---- projects ---- */}
      <section className="mt-8">
        <div className="ui-label mb-3">Your designs{projects.length ? ` · ${projects.length}` : ""}</div>
        {!projects.length && (
          <p className="text-caption text-neutral-400">Nothing yet — describe something above to start.</p>
        )}
        <div className="grid sm:grid-cols-2 gap-3">
          {projects.map((p) => (
            <div key={p.id} className="group relative border border-line rounded-xl p-4 bg-white" data-testid={`deq-project-${p.id}`}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[10px] font-mono uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-ash text-ink-muted">
                  {surfaceLabel(catalog, p.surface)}
                </span>
                <span className="text-[10px] font-mono text-neutral-400">
                  {(catalog?.formats || []).find((f) => f.id === p.format)?.label || p.format}
                </span>
                {p.master === "structured"
                  ? <ShieldCheck size={13} className="text-emerald-600" title="Structured master — exports stay editable" />
                  : <AlertTriangle size={13} className="text-amber-600" title="Code master — export is a translation" />}
              </div>
              <div className="text-body font-medium line-clamp-2">{p.brief}</div>
              <div className="text-caption text-neutral-400 mt-1">
                {(p.sections || []).length} sections · {(p.sections || []).map((s) => s.archetype).slice(0, 4).join(" · ")}
              </div>
              <button onClick={() => remove(p.id)} title="Delete design"
                data-testid={`deq-delete-${p.id}`}
                className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 focus:opacity-100 text-neutral-400 hover:text-danger transition-opacity">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function surfaceLabel(catalog, id) {
  return (catalog?.surfaces || []).find((s) => s.id === id)?.label || id || "—";
}

/** FormatPicker speaks social-platform names; the backend wants raw pixels. */
function canvasFromFormat(f) {
  if (f.platform === "custom") return { w: f.customW, h: f.customH };
  const map = {
    linkedin: { w: 1080, h: 1350 },
    square: { w: 1080, h: 1080 },
    instagram_story: { w: 1080, h: 1920 },
    twitter: { w: 1080, h: 1350 },
  };
  return map[f.platform] || { w: 1080, h: 1350 };
}
