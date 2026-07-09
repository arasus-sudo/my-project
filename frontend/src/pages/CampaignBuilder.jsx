import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Sparkles, Save, Play, Plus, Trash2 } from "lucide-react";

const stepKey = () => `s_${Math.random().toString(36).slice(2, 10)}`;

const DEFAULT_STEP = () => ({
  _key: stepKey(),
  day: 0,
  subject: "Quick idea for {{company}}",
  body: "Hi {{first_name}},\n\nNoticed {{company}} — worth 15 minutes to compare notes?\n\n—",
});

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
  const previewLead = useMemo(() => leads[0] || { first_name: "Alex", company: "Northloop" }, [leads]);

  useEffect(() => {
    if (!step) return;
    const t = setTimeout(() => {
      api.post("/ai/score", { subject: step.subject, body: step.body }).then((r) => setEq(r.data));
    }, 300);
    return () => clearTimeout(t);
  }, [step?.subject, step?.body]);

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

  const aiRegenerate = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/ai/personalize", { lead: previewLead, template: step.body });
      updateStep({ subject: data.subject, body: data.body });
      toast.success("Regenerated with EQ boost");
    } finally { setBusy(false); }
  };

  const save = async () => {
    setBusy(true);
    try {
      const cleanSteps = steps.map(({ _key, ...rest }) => rest);
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
      await api.post(`/campaigns/${id}/launch`);
      toast.success("Launched — check the inbox in a moment");
      nav("/app/campaigns");
    } catch { toast.error("Launch failed"); }
    finally { setBusy(false); }
  };

  return (
    <div>
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
      <div className="grid grid-cols-12 gap-0 min-h-[calc(100vh-90px)]">
        {/* Steps sidebar */}
        <aside className="col-span-3 border-r border-line bg-white p-4">
          <div className="ui-label mb-3">Sequence</div>
          <ol className="space-y-2">
            {steps.map((s, i) => (
              <li key={s._key || i}>
                <button
                  onClick={() => setActiveStep(i)}
                  data-testid={`step-${i}`}
                  className={`w-full text-left p-3 border ${i === activeStep ? "border-ink bg-surfacehover" : "border-line hover:bg-surfacehover"} rounded-sm`}
                >
                  <div className="flex justify-between items-center">
                    <div className="ui-label">Step {i + 1}</div>
                    <div className="text-xs font-mono text-neutral-500">day {s.day}</div>
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
          <div className="border border-line rounded-sm max-h-64 overflow-y-auto">
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
                  <div className="text-neutral-500 truncate">{l.company}</div>
                </div>
              </label>
            ))}
          </div>
          <button onClick={() => setSelectedLeads(leads.map((l) => l.id))} className="text-xs text-sanguine mt-2 hover:underline" data-testid="select-all-leads">Select all</button>
        </aside>

        {/* Editor */}
        <section className="col-span-6 p-6 bg-bone">
          <div className="card-flat p-6">
            <div className="ui-label mb-2">Subject</div>
            <input
              value={step.subject}
              onChange={(e) => updateStep({ subject: e.target.value })}
              data-testid="editor-subject"
              className="w-full text-lg font-display font-bold border-0 border-b border-line py-2 focus:outline-none focus:border-ink bg-transparent"
              placeholder="Quick idea for {{company}}"
            />
            <div className="mt-4 ui-label">Body</div>
            <textarea
              value={step.body}
              onChange={(e) => updateStep({ body: e.target.value })}
              data-testid="editor-body"
              rows={14}
              className="w-full mt-2 p-3 border border-line focus:border-ink focus:outline-none rounded-sm font-mono text-sm leading-relaxed bg-white"
            />
            <div className="mt-3 text-xs text-neutral-500 font-mono">
              Merge fields: <span className="kbd">{`{{first_name}}`}</span> <span className="kbd">{`{{last_name}}`}</span> <span className="kbd">{`{{company}}`}</span> <span className="kbd">{`{{title}}`}</span>
            </div>
            <div className="mt-4 flex gap-2 items-center">
              <button onClick={aiRegenerate} disabled={busy} data-testid="ai-regenerate" className="btn-secondary text-sm">
                <Sparkles size={14} /> AI regenerate with high EQ
              </button>
              <div className="ml-auto flex items-center gap-3">
                <label className="text-xs text-neutral-500 font-mono">day</label>
                <input type="number" min={0} value={step.day} onChange={(e) => updateStep({ day: Number(e.target.value) })}
                  className="w-16 border border-line px-2 py-1 text-sm rounded-sm font-mono" />
              </div>
            </div>
          </div>
        </section>

        {/* EQ Panel */}
        <aside className="col-span-3 border-l border-line bg-white p-6">
          <div className="ui-label text-sanguine">EQ Score</div>
          <div className="font-mono text-6xl font-bold tracking-tighter mt-1"
            style={{ color: eq ? (eq.overall > 70 ? "#D94526" : eq.overall > 40 ? "#5C5D58" : "#E62E2E") : "#8A8B86" }}>
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
            <div className="mt-8 border border-line p-3">
              <div className="ui-label mb-1">Status</div>
              <div className="font-mono text-sm">{status}</div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
