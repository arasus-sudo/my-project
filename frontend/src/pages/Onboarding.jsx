import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { toast } from "sonner";
import { ArrowRight, Globe, FileSearch, Check, Loader2, Pencil, X } from "lucide-react";

export default function Onboarding() {
  const nav = useNavigate();
  const [step, setStep] = useState(1);
  const [url, setUrl] = useState("");
  const [summary, setSummary] = useState("");
  const [services, setServices] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [crawled, setCrawled] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [accept, setAccept] = useState({});
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null); // {ci, si} step being edited

  const analyze = async () => {
    if (!url.trim()) { toast.error("Enter a URL first"); return; }
    setBusy(true);
    try {
      const { data } = await api.post("/onboarding/analyze", { url });
      setSummary(data.summary || "");
      setServices(data.services || []);
      setQuestions(data.questions || []);
      setCrawled(data.crawled || []);
      setStep(2);
    } catch { toast.error("Could not analyze"); }
    finally { setBusy(false); }
  };
  const generate = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/onboarding/generate", { business_summary: summary, services, answers });
      const list = (data.campaigns || []).map((c, i) => ({
        ...c,
        _k: `c_${i}_${Date.now()}`,
        steps: (c.steps || []).map((s, si) => ({ ...s, _k: `s_${i}_${si}_${Date.now()}` })),
      }));
      setCampaigns(list);
      const init = {}; list.forEach((_, i) => (init[i] = true));
      setAccept(init); setStep(3);
    } catch { toast.error("Generation failed"); }
    finally { setBusy(false); }
  };
  const finish = async () => {
    const strip = ({ _k, steps, ...rest }) => ({
      ...rest,
      steps: (steps || []).map(({ _k: _, ...s }) => s),
    });
    const chosen = campaigns.filter((_, i) => accept[i]).map(strip);
    setBusy(true);
    try {
      // Persist what we learned about the business (summary + clarifying
      // answers) onto the workspace's Brand Voice, so every other agent can
      // draw on it instead of just seeding the first batch of campaigns and
      // then losing this profile forever.
      await api.post("/onboarding/accept", {
        campaigns: chosen, business_summary: summary, services, answers,
      });
      toast.success(`${chosen.length} campaign${chosen.length === 1 ? "" : "s"} saved`);
      nav("/suite");
    } catch { toast.error("Save failed"); }
    finally { setBusy(false); }
  };
  const skip = async () => {
    try { await api.post("/onboarding/accept", { campaigns: [] }); }
    catch (err) { console.warn("skip accept failed", err); }
    nav("/app");
  };

  const updateCampaignField = (ci, key, val) => {
    const next = [...campaigns]; next[ci] = { ...next[ci], [key]: val }; setCampaigns(next);
  };
  const updateStep = (ci, si, patch) => {
    const next = [...campaigns];
    next[ci] = { ...next[ci], steps: next[ci].steps.map((s, i) => i === si ? { ...s, ...patch } : s) };
    setCampaigns(next);
  };

  return (
    <div className="min-h-screen bg-bone p-6 sm:p-8 animate-fade-in">
      <div className="max-w-3xl mx-auto pt-12 pb-16">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-8 h-8 bg-accent text-white flex items-center justify-center rounded-full font-display font-bold text-sm">i</div>
          <div className="font-display font-semibold">Innoira <span className="text-ink-muted">/</span> <span className="text-ink-muted">Setup</span></div>
          <button onClick={skip} data-testid="onboarding-skip" className="ml-auto text-caption text-ink-muted hover:text-ink">Skip for now</button>
        </div>

        <div className="flex items-center gap-2 mb-10">
          {[1, 2, 3].map((n) => (
            <div key={n} className={`h-1.5 flex-1 rounded-full ${step >= n ? "bg-accent" : "bg-neutral-200"}`} />
          ))}
        </div>

        {step === 1 && (
          <div className="shadow-card bg-white border border-line rounded-3xl p-6 sm:p-10 animate-fade-in">
            <div className="ui-label mb-3"><Globe size={12} className="inline mr-1" /> Step 1 of 3</div>
            <h1 className="text-page-title font-display">Teach the agent about your business.</h1>
            <p className="mt-3 text-body text-ink-tertiary">Paste your website. Pitch EQ will crawl the homepage plus a few relevant pages, understand your services and ICP, then draft campaigns you can review.</p>
            <div className="mt-8">
              <label className="form-label">Website URL</label>
              <input value={url} onChange={(e) => setUrl(e.target.value)} data-testid="onboarding-url"
                placeholder="https://yourcompany.com"
                className="mt-2 w-full input-premium" />
            </div>
            <button onClick={analyze} disabled={busy} data-testid="onboarding-analyze"
              className="btn-primary mt-6 disabled:opacity-60">
              {busy ? <><Loader2 size={14} className="animate-spin" /> Crawling & analysing…</> : <>Analyze my website <ArrowRight size={14} /></>}
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="shadow-card bg-white border border-line rounded-3xl p-6 sm:p-10 animate-fade-in">
            <div className="ui-label mb-3"><FileSearch size={12} className="inline mr-1" /> Step 2 of 3</div>
            <h1 className="text-page-title font-display">Here's what I understood.</h1>
            <div className="mt-5 border-l-2 border-accent pl-4 text-ink-secondary text-body">
              {summary || <span className="text-ink-muted">Couldn't extract much — help me by answering below.</span>}
            </div>
            {crawled.length > 0 && (
              <div className="mt-3 text-tiny text-ink-muted font-mono">Pages read: {crawled.length}</div>
            )}
            {services.length > 0 && (
              <div className="mt-6">
                <div className="ui-label mb-2">Detected services / offerings</div>
                <div className="flex flex-wrap gap-2">
                  {services.map((s, i) => (
                    <span key={s} className="pill bg-accent text-white border-transparent" data-testid={`onboarding-service-${i}`}>{s}
                      <button onClick={() => setServices(services.filter((_, x) => x !== i))} className="ml-1 opacity-70 hover:opacity-100"><X size={11} /></button>
                    </span>
                  ))}
                  {services.length < 3 && (
                    <button onClick={() => { const v = prompt("Add a service or offering"); if (v && v.trim()) setServices([...services, v.trim()]); }}
                      className="pill hover:border-ink" data-testid="onboarding-add-service">+ add</button>
                  )}
                </div>
                <p className="text-tiny text-ink-muted mt-2">We'll create one campaign per service (max 3).</p>
              </div>
            )}
            <div className="mt-8 space-y-5">
              {questions.map((q, i) => (
                <div key={q}>
                  <label className="form-label block">{q}</label>
                  <textarea rows={2}
                    value={answers[q] || ""} onChange={(e) => setAnswers({ ...answers, [q]: e.target.value })}
                    data-testid={`onboarding-answer-${i}`}
                    className="mt-2 w-full input-premium" />
                </div>
              ))}
            </div>
            <div className="mt-6 flex gap-2">
              <button onClick={() => setStep(1)} className="btn-secondary">Back</button>
              <button onClick={generate} disabled={busy} data-testid="onboarding-generate" className="btn-primary disabled:opacity-60">
                {busy ? <><Loader2 size={14} className="animate-spin" /> Designing campaigns…</> : <>Generate campaigns <ArrowRight size={14} /></>}
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="animate-fade-in">
            <div className="shadow-card bg-white border border-line rounded-3xl p-5 sm:p-8 mb-4">
              <div className="ui-label mb-3"><Check size={12} className="inline mr-1" /> Step 3 of 3 · Review & edit</div>
              <h1 className="text-page-title font-display">Here are your campaigns — please verify.</h1>
              <p className="mt-2 text-body text-ink-tertiary">Edit anything, uncheck to drop, then save. You can also change everything later in Campaigns.</p>
            </div>
            <div className="space-y-4">
              {campaigns.map((c, ci) => (
                <div key={c._k || ci} className={`shadow-card bg-white border rounded-2xl p-4 sm:p-6 ${accept[ci] ? "border-ink" : "border-line"}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      {c.service && <div className="ui-label mb-1">Service: {c.service}</div>}
                      <input value={c.name || ""} onChange={(e) => updateCampaignField(ci, "name", e.target.value)}
                        data-testid={`onboarding-campaign-name-${ci}`}
                        className="font-display font-semibold text-card-title bg-transparent border-0 border-b border-transparent hover:border-line focus:border-ink focus:outline-none w-full" />
                      <input value={c.goal || ""} onChange={(e) => updateCampaignField(ci, "goal", e.target.value)}
                        className="mt-1 text-caption text-ink-muted bg-transparent border-0 focus:outline-none w-full" />
                    </div>
                    <label className="flex items-center gap-2 text-sm cursor-pointer" data-testid={`onboarding-accept-${ci}`}>
                      <input type="checkbox" checked={!!accept[ci]} onChange={(e) => setAccept({ ...accept, [ci]: e.target.checked })} />
                      Include
                    </label>
                  </div>
                  <div className="mt-5 space-y-3">
                    {c.steps?.map((s, si) => {
                      const isEdit = editing && editing.ci === ci && editing.si === si;
                      return (
                        <div key={s._k || si} className="border-l-2 border-line pl-4">
                          <div className="ui-label flex items-center gap-2">
                            <span>Step {si + 1} · day {s.day}</span>
                            <button onClick={() => setEditing(isEdit ? null : { ci, si })}
                              data-testid={`onboarding-edit-${ci}-${si}`}
                              className="text-ink-muted hover:text-ink"><Pencil size={11} /></button>
                          </div>
                          {isEdit ? (
                            <div className="mt-2 space-y-2">
                              <input value={s.subject} onChange={(e) => updateStep(ci, si, { subject: e.target.value })}
                                data-testid={`onboarding-step-subject-${ci}-${si}`}
                                className="input-premium w-full font-medium" />
                              <textarea value={s.body} onChange={(e) => updateStep(ci, si, { body: e.target.value })}
                                rows={6} data-testid={`onboarding-step-body-${ci}-${si}`}
                                className="input-premium w-full text-caption font-mono text-ink-tertiary" />
                            </div>
                          ) : (
                            <>
                              <div className="font-medium text-body mt-1">{s.subject}</div>
                              <div className="text-caption text-ink-tertiary mt-1 whitespace-pre-wrap line-clamp-5">{s.body}</div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 flex gap-2">
              <button onClick={() => setStep(2)} className="btn-secondary">Back</button>
              <button onClick={finish} disabled={busy} data-testid="onboarding-finish" className="btn-primary disabled:opacity-60">
                {busy ? "Saving…" : "Approve & save"} <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
