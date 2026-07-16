import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, isCreditError } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import RichEmailEditor, { sanitizeEmailHtml } from "../components/RichEmailEditor";
import { toast } from "sonner";
import {
  Sparkles, Save, Play, Plus, Trash2, Loader2, Check, AlertTriangle, Flame,
} from "lucide-react";

const stepKey = () => `s_${Math.random().toString(36).slice(2, 10)}`;

const DEFAULT_STEP = () => ({
  _key: stepKey(),
  day: 0,
  subject: "Quick idea for {{company}}",
  body_html: "<p>Hi {{first_name}},</p><p>Noticed {{company}} — worth 15 minutes to compare notes?</p>",
  body: "Hi {{first_name}},\n\nNoticed {{company}} — worth 15 minutes to compare notes?",
});

/** The four steps the backend actually runs (draft_chain.run_chain). */
const CHAIN_STEPS = [
  { key: "research", label: "Research" },
  { key: "angle", label: "Angle" },
  { key: "draft", label: "Draft" },
  { key: "humanise", label: "Humanise" },
];

const htmlToText = (html) => {
  const el = document.createElement("div");
  el.innerHTML = sanitizeEmailHtml(html);
  el.querySelectorAll("p, li").forEach((n) => n.append("\n"));
  return (el.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
};

export default function CampaignBuilder() {
  const { id } = useParams();
  const nav = useNavigate();
  const [name, setName] = useState("Untitled campaign");
  const [goal, setGoal] = useState("Book meetings");
  const [steps, setSteps] = useState([DEFAULT_STEP()]);
  const [leads, setLeads] = useState([]);
  const [selectedLeads, setSelectedLeads] = useState([]);
  const [activeStep, setActiveStep] = useState(0);
  const [eq, setEq] = useState(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("draft");
  const [previewLeadId, setPreviewLeadId] = useState("");
  const [chainStep, setChainStep] = useState(null);   // which chain step is running
  const [draftMeta, setDraftMeta] = useState(null);   // confidence / angle / note

  useEffect(() => {
    api.get("/leads").then((r) => setLeads(r.data));
    if (id) {
      api.get(`/campaigns/${id}`).then((r) => {
        const c = r.data;
        setName(c.name); setGoal(c.goal || "");
        setSteps(c.steps?.length ? c.steps.map((s) => ({ ...s, _key: s._key || stepKey() })) : [DEFAULT_STEP()]);
        setSelectedLeads(c.lead_ids || []);
        setStatus(c.status || "draft");
      });
    }
  }, [id]);

  const step = steps[activeStep];

  // The AI writes for ONE specific lead. Previously this silently used leads[0]
  // with no way to change it, so every "personalized" draft was aimed at whoever
  // happened to be first in the list.
  const previewLead = useMemo(
    () => leads.find((l) => l.id === previewLeadId) || leads[0] || null,
    [leads, previewLeadId],
  );

  useEffect(() => {
    if (!step) return;
    const t = setTimeout(() => {
      const text = htmlToText(step.body_html || "") || step.body || "";
      api.post("/ai/score", { subject: step.subject, body: text })
        .then((r) => setEq(r.data))
        .catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [step?.subject, step?.body_html, step?.body]);

  const updateStep = (patch) => {
    const next = [...steps];
    next[activeStep] = { ...next[activeStep], ...patch };
    setSteps(next);
  };

  const addStep = () => { setSteps([...steps, { ...DEFAULT_STEP(), day: (steps.at(-1)?.day || 0) + 3 }]); setActiveStep(steps.length); };
  const removeStep = (i) => {
    if (steps.length === 1) return;
    const next = steps.filter((_, x) => x !== i);
    setSteps(next); setActiveStep(Math.max(0, activeStep - (i <= activeStep ? 1 : 0)));
  };

  /** Research → Angle → Draft → Humanise, against the selected preview lead. */
  const writeWithAI = async () => {
    if (!previewLead) { toast.error("Add a lead first — the AI writes to a real person."); return; }
    setBusy(true);
    setDraftMeta(null);

    // The backend runs the chain in one request, so step the indicator on a timer
    // to reflect roughly where it is rather than pretending to stream.
    setChainStep("research");
    const timers = [
      setTimeout(() => setChainStep("angle"), 2500),
      setTimeout(() => setChainStep("draft"), 8000),
      setTimeout(() => setChainStep("humanise"), 15000),
    ];

    try {
      const { data } = await api.post("/pitch-eq/draft", {
        lead_id: previewLead.id,
        goal: goal || "Book a 15-minute intro call.",
        tone: "warm",
      });
      updateStep({
        subject: data.subject,
        body_html: sanitizeEmailHtml(data.body_html),
        body: data.body_text,
      });
      setEq(data.eq);
      setDraftMeta(data);
      toast.success(
        data.has_angle
          ? "Written from a real trigger"
          : data.has_signal
            ? "Written — no usable trigger found, so it leads with the pain, not a fake hook"
            : "Written — no public signals found, so it makes no claims about their company",
      );
    } catch (err) {
      if (!isCreditError(err)) {
        toast.error(err?.response?.data?.detail || "Could not write the draft");
      }
    } finally {
      timers.forEach(clearTimeout);
      setChainStep(null);
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      const cleanSteps = steps.map(({ _key, ...rest }) => ({
        ...rest,
        // Persist both parts: the HTML we send, and a text alternative. An
        // HTML-only email is one of the strongest spam signals there is.
        body_html: sanitizeEmailHtml(rest.body_html || ""),
        body_text: htmlToText(rest.body_html || "") || rest.body || "",
      }));
      const payload = { name, goal, steps: cleanSteps, lead_ids: selectedLeads };
      let cid = id;
      if (!cid) {
        const { data } = await api.post("/campaigns", payload);
        cid = data.id;
      } else {
        await api.put(`/campaigns/${id}`, payload);
      }
      toast.success("Saved");
      nav(`/app/campaigns/${cid}`);
    } catch { toast.error("Save failed"); }
    finally { setBusy(false); }
  };

  const launch = async () => {
    if (!id) { toast.error("Save first"); return; }
    setBusy(true);
    try {
      const { data } = await api.post(`/campaigns/${id}/launch`);
      toast.success(`Launched — ${data.queued} email${data.queued === 1 ? "" : "s"} queued`, {
        description: "They go out inside your sending window, spread across your mailboxes.",
      });
      nav("/app/campaigns");
    } catch (err) {
      // The most common case by far: no mailbox connected. Say so plainly and
      // point at the fix, rather than a generic "Launch failed".
      toast.error(err?.response?.data?.detail || "Launch failed", {
        action: { label: "Mailboxes", onClick: () => nav("/app/mailboxes") },
      });
    } finally { setBusy(false); }
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={
          <input value={name} onChange={(e) => setName(e.target.value)} data-testid="campaign-name-input"
            className="bg-transparent border-0 border-b border-transparent hover:border-line focus:border-ink focus:outline-none font-display font-bold text-2xl w-full" />
        }
        subtitle={`Goal: ${goal}`}
        badge="AI EQ Editor"
        right={
          <div className="flex gap-2">
            <button data-testid="save-campaign" onClick={save} disabled={busy} className="btn-secondary"><Save size={14} /> Save</button>
            <button data-testid="launch-campaign" onClick={launch} disabled={busy || !id} className="btn-primary"><Play size={14} /> Launch</button>
          </div>
        }
      />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-0 min-h-[calc(100vh-90px)]">
        {/* Steps sidebar */}
        <aside className="col-span-full lg:col-span-3 border-r border-line bg-white p-4">
          <div className="ui-label mb-3">Sequence</div>
          <ol className="space-y-2">
            {steps.map((s, i) => (
              <li key={s._key || i}>
                <button
                  onClick={() => setActiveStep(i)}
                  data-testid={`step-${i}`}
                  className={`w-full text-left p-3 border ${i === activeStep ? "border-ink bg-surfacehover" : "border-line hover:bg-surfacehover"} rounded-xl`}
                >
                  <div className="flex justify-between items-center">
                    <div className="ui-label">Step {i + 1}</div>
                    <div className="text-xs font-mono text-neutral-400">day {s.day}</div>
                  </div>
                  <div className="text-sm font-medium mt-1 truncate">{s.subject || "(no subject)"}</div>
                  {steps.length > 1 && (
                    <button onClick={(e) => { e.stopPropagation(); removeStep(i); }} data-testid={`remove-step-${i}`} className="text-xs text-neutral-400 hover:text-red-600 mt-2">
                      <Trash2 size={11} className="inline" /> remove
                    </button>
                  )}
                </button>
              </li>
            ))}
          </ol>
          <button onClick={addStep} data-testid="add-step" className="btn-ghost w-full justify-start mt-3 text-sm"><Plus size={14} /> Add step</button>

          <div className="ui-label mt-8 mb-2">Leads ({selectedLeads.length}/{leads.length})</div>
          <div className="border border-line rounded-xl max-h-64 overflow-y-auto">
            {leads.map((l) => (
              <label key={l.id} className="flex items-center gap-2 p-2 border-b border-line last:border-b-0 text-xs cursor-pointer hover:bg-surfacehover">
                <input
                  type="checkbox"
                  checked={selectedLeads.includes(l.id)}
                  onChange={(e) => setSelectedLeads(e.target.checked ? [...selectedLeads, l.id] : selectedLeads.filter((x) => x !== l.id))}
                  data-testid={`lead-check-${l.id}`}
                />
                <div className="flex-1 truncate">
                  <div className="font-medium">{l.first_name} {l.last_name}</div>
                  <div className="text-neutral-400 truncate">{l.company}</div>
                </div>
              </label>
            ))}
          </div>
          <button onClick={() => setSelectedLeads(leads.map((l) => l.id))} className="text-xs text-sanguine mt-2 hover:underline" data-testid="select-all-leads">Select all</button>
        </aside>

        {/* Editor */}
        <section className="col-span-full lg:col-span-6 p-4 sm:p-6 bg-bone space-y-4">
          <div className="shadow-card p-6 sm:p-8 rounded-2xl">
            <div className="ui-label mb-2">Subject</div>
            <input
              value={step.subject}
              onChange={(e) => updateStep({ subject: e.target.value })}
              data-testid="editor-subject"
              className="w-full text-lg font-display font-bold border-0 border-b border-line py-2 focus:outline-none focus:border-ink bg-transparent"
              placeholder="Quick idea for {{company}}"
            />

            <div className="mt-5 flex items-center justify-between">
              <div className="ui-label">Body</div>
              <div className="flex items-center gap-3">
                <label className="text-xs text-neutral-400 font-mono">day</label>
                <input type="number" min={0} value={step.day}
                  onChange={(e) => updateStep({ day: Number(e.target.value) })}
                  data-testid="editor-day"
                  className="w-16 border border-line px-2 py-1 text-sm rounded-xl font-mono" />
              </div>
            </div>

            <div className="mt-2">
              <RichEmailEditor
                value={step.body_html || ""}
                onChange={(html) => updateStep({ body_html: html })}
                placeholder="Write your email, or let the AI research this lead and write it for you."
              />
            </div>
          </div>

          {/* AI draft chain */}
          <div className="shadow-card p-6 sm:p-8 rounded-2xl" data-testid="ai-panel">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <Sparkles size={15} className="text-sanguine" />
                <div className="text-sm font-medium">Write from real research</div>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={previewLead?.id || ""}
                  onChange={(e) => setPreviewLeadId(e.target.value)}
                  data-testid="preview-lead-select"
                  className="border border-line rounded-xl px-3 py-1.5 text-xs max-w-[190px]"
                >
                  {leads.length === 0 && <option value="">No leads yet</option>}
                  {leads.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.first_name} {l.last_name} · {l.company || "—"}
                    </option>
                  ))}
                </select>
                <button onClick={writeWithAI} disabled={busy || !leads.length}
                  data-testid="ai-write" className="btn-primary text-xs disabled:opacity-50">
                  {chainStep ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                  {chainStep ? "Writing…" : "Write with AI"}
                </button>
              </div>
            </div>

            {/* Four steps, because the backend really does run four calls. */}
            <div className="flex items-center gap-2 mt-4" data-testid="chain-progress">
              {CHAIN_STEPS.map((s, i) => {
                const idx = CHAIN_STEPS.findIndex((x) => x.key === chainStep);
                const done = chainStep && i < idx;
                const active = chainStep === s.key;
                return (
                  <div key={s.key} className="flex items-center gap-2 flex-1">
                    <div className={`flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider ${
                      active ? "text-ink font-semibold" : done ? "text-neutral-400" : "text-neutral-300"
                    }`}>
                      {done ? <Check size={11} /> : active ? <Loader2 size={11} className="animate-spin" /> : <span className="w-[11px]" />}
                      {s.label}
                    </div>
                    {i < CHAIN_STEPS.length - 1 && <div className="flex-1 h-px bg-line" />}
                  </div>
                );
              })}
            </div>

            {draftMeta && (
              <div className="mt-4 space-y-2" data-testid="draft-meta">
                {draftMeta.has_angle ? (
                  <div className="flex items-start gap-2 text-xs bg-bone border border-line rounded-2xl px-3 py-2">
                    <Flame size={13} className="text-sanguine mt-0.5 shrink-0" />
                    <div>
                      <div className="font-medium">{draftMeta.angle?.angle}</div>
                      {draftMeta.angle?.trigger && (
                        <div className="text-neutral-400 mt-0.5">Trigger: {draftMeta.angle.trigger}</div>
                      )}
                    </div>
                  </div>
                ) : (
                  // Two different honest outcomes, and they must not be conflated:
                  // "we found nothing" is a different claim from "we found things,
                  // none of which justify a hook".
                  <div className="flex items-start gap-2 text-xs bg-amber-50 border border-amber-200 rounded-2xl px-3 py-2 text-amber-900">
                    <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                    <div>
                      <div className="font-medium">
                        {draftMeta.has_signal
                          ? "Researched — but no usable trigger."
                          : "No public signals found for this company."}
                      </div>
                      <div className="mt-0.5">{draftMeta.note}</div>
                    </div>
                  </div>
                )}
                {!!draftMeta.changes?.length && (
                  <details className="text-xs text-neutral-400">
                    <summary className="cursor-pointer hover:text-ink">What the humanise pass changed</summary>
                    <ul className="mt-1.5 space-y-1 pl-4 list-disc">
                      {draftMeta.changes.map((c, i) => <li key={i}>{c}</li>)}
                    </ul>
                  </details>
                )}
              </div>
            )}
          </div>
        </section>

        {/* EQ Panel */}
        <aside className="col-span-full lg:col-span-3 border-l border-line bg-white p-6 sm:p-8">
          <div className="ui-label text-sanguine">EQ Score</div>
          <div className="font-mono text-4xl sm:text-6xl font-bold tracking-tighter mt-1"
            style={{ color: eq ? (eq.overall > 70 ? "#212025" : eq.overall > 40 ? "#5A5A63" : "#B33636") : "#8A8B86" }}>
            {eq?.overall ?? "—"}
          </div>
          <div className="mt-6 space-y-4">
            {eq && [
              ["Relevance", eq.relevance],
              ["Empathy", eq.empathy],
              ["Clarity", eq.clarity],
              ["CTA", eq.cta],
              ["Spam safety", eq.spam_safety],
            ].map(([k, v]) => (
              <div key={k}>
                <div className="flex justify-between text-xs">
                  <span className="ui-label">{k}</span>
                  <span className="font-mono text-neutral-700">{v}</span>
                </div>
                <div className="h-1 mt-1 bg-line">
                  <div className="h-full bg-ink" style={{ width: `${v}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-8 ui-label mb-2">Hints</div>
          <ul className="space-y-2 text-xs text-neutral-700">
            {eq?.hints?.length ? eq.hints.map((h) => (
              <li key={h} className="border-l-2 border-sanguine pl-2">{h}</li>
            )) : <li className="text-neutral-400">Looking sharp. Send it.</li>}
          </ul>

          {status !== "draft" && (
            <div className="mt-8 shadow-card p-3">
              <div className="ui-label mb-1">Status</div>
              <div className="font-mono text-sm">{status}</div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
