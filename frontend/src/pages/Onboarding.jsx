import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { toast } from "sonner";
import { ArrowRight, Globe, Sparkles, Check, Loader2 } from "lucide-react";

export default function Onboarding() {
  const nav = useNavigate();
  const [step, setStep] = useState(1);
  const [url, setUrl] = useState("");
  const [summary, setSummary] = useState("");
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [campaigns, setCampaigns] = useState([]);
  const [accept, setAccept] = useState({});
  const [busy, setBusy] = useState(false);

  const analyze = async () => {
    if (!url.trim()) { toast.error("Enter a URL first"); return; }
    setBusy(true);
    try {
      const { data } = await api.post("/onboarding/analyze", { url });
      setSummary(data.summary || ""); setQuestions(data.questions || []);
      setStep(2);
    } catch { toast.error("Could not analyze"); }
    finally { setBusy(false); }
  };
  const generate = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/onboarding/generate", { business_summary: summary, answers });
      setCampaigns(data.campaigns || []);
      const initial = {}; (data.campaigns || []).forEach((_, i) => (initial[i] = true));
      setAccept(initial); setStep(3);
    } catch { toast.error("Generation failed"); }
    finally { setBusy(false); }
  };
  const finish = async () => {
    const chosen = campaigns.filter((_, i) => accept[i]);
    setBusy(true);
    try {
      if (chosen.length) await api.post("/onboarding/accept", { campaigns: chosen });
      toast.success("Setup complete");
      nav("/app");
    } catch { toast.error("Save failed"); }
    finally { setBusy(false); }
  };
  const skip = async () => {
    try { await api.post("/onboarding/accept", { campaigns: [] }); } catch {}
    nav("/app");
  };

  return (
    <div className="min-h-screen bg-bone p-6">
      <div className="max-w-3xl mx-auto pt-12">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-8 h-8 bg-ink text-white flex items-center justify-center rounded-full font-display font-bold text-sm">i</div>
          <div className="font-display font-semibold">Innoira <span className="text-neutral-400">/</span> <span className="text-neutral-600">Setup</span></div>
          <button onClick={skip} data-testid="onboarding-skip" className="ml-auto text-sm text-neutral-500 hover:text-ink">Skip for now</button>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-2 mb-10">
          {[1, 2, 3].map((n) => (
            <div key={n} className={`h-1.5 flex-1 rounded-full ${step >= n ? "bg-ink" : "bg-neutral-200"}`} />
          ))}
        </div>

        {step === 1 && (
          <div className="bg-white border border-line rounded-3xl p-10 animate-fade-in">
            <div className="ui-label mb-3"><Globe size={12} className="inline mr-1" /> Step 1 of 3</div>
            <h1 className="font-display text-4xl font-bold tracking-tight">Let's teach the agent about your business.</h1>
            <p className="mt-3 text-neutral-600">Paste your website. Pitch EQ will crawl it, understand your ICP and value prop, then ask you a few sharpening questions.</p>
            <div className="mt-8">
              <label className="ui-label">Website URL</label>
              <input value={url} onChange={(e) => setUrl(e.target.value)} data-testid="onboarding-url"
                placeholder="https://yourcompany.com"
                className="mt-2 w-full border border-line px-4 py-3 rounded-full focus:outline-none focus:border-ink" />
            </div>
            <button onClick={analyze} disabled={busy} data-testid="onboarding-analyze"
              className="btn-primary mt-6 disabled:opacity-60">
              {busy ? <><Loader2 size={14} className="animate-spin" /> Crawling & analysing…</> : <>Analyze my website <ArrowRight size={14} /></>}
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="bg-white border border-line rounded-3xl p-10 animate-fade-in">
            <div className="ui-label mb-3"><Sparkles size={12} className="inline mr-1" /> Step 2 of 3</div>
            <h1 className="font-display text-4xl font-bold tracking-tight">Here's what I understood.</h1>
            <div className="mt-5 border-l-2 border-ink pl-4 text-neutral-700 text-sm">
              {summary || <span className="text-neutral-400">Couldn't extract much — help me by answering below.</span>}
            </div>
            <div className="mt-8 space-y-5">
              {questions.map((q, i) => (
                <div key={q}>
                  <label className="text-sm font-medium text-ink block">{q}</label>
                  <textarea rows={2}
                    value={answers[q] || ""} onChange={(e) => setAnswers({ ...answers, [q]: e.target.value })}
                    data-testid={`onboarding-answer-${i}`}
                    className="mt-2 w-full border border-line px-4 py-2 rounded-2xl focus:outline-none focus:border-ink text-sm" />
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
            <div className="bg-white border border-line rounded-3xl p-8 mb-4">
              <div className="ui-label mb-3"><Check size={12} className="inline mr-1" /> Step 3 of 3</div>
              <h1 className="font-display text-3xl font-bold tracking-tight">Here are 2 campaigns, drafted for you.</h1>
              <p className="mt-2 text-neutral-600 text-sm">Keep the ones you like — they'll land in your workspace as drafts.</p>
            </div>
            <div className="space-y-4">
              {campaigns.map((c, i) => (
                <div key={i} className={`bg-white border rounded-2xl p-6 ${accept[i] ? "border-ink" : "border-line"}`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="ui-label">{c.goal}</div>
                      <div className="font-display font-semibold text-xl mt-1">{c.name}</div>
                    </div>
                    <label className="flex items-center gap-2 text-sm cursor-pointer" data-testid={`onboarding-accept-${i}`}>
                      <input type="checkbox" checked={!!accept[i]} onChange={(e) => setAccept({ ...accept, [i]: e.target.checked })} />
                      Include
                    </label>
                  </div>
                  <div className="mt-5 space-y-3">
                    {c.steps?.map((s, si) => (
                      <div key={si} className="border-l-2 border-line pl-4">
                        <div className="ui-label">Step {si + 1} · day {s.day}</div>
                        <div className="font-medium text-sm mt-1">{s.subject}</div>
                        <div className="text-xs text-neutral-600 mt-1 whitespace-pre-wrap line-clamp-4">{s.body}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 flex gap-2">
              <button onClick={() => setStep(2)} className="btn-secondary">Back</button>
              <button onClick={finish} disabled={busy} data-testid="onboarding-finish" className="btn-primary disabled:opacity-60">
                {busy ? "Saving…" : "Save & enter workspace"} <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
