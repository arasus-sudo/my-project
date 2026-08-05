import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { toast } from "sonner";
import { ArrowRight, Globe, Search, Check, Pencil, X } from "../icons";
import Input from "../components/primitives/Input";
import Button from "../components/primitives/Button";
import Checkbox from "../components/primitives/Checkbox";
import Chip from "../components/primitives/Chip";

function StepPanel({ children, className = "" }) {
  return (
    <div className={`animate-fade-in ${className}`} style={{
      background: "var(--bg-surface)", border: "1px solid var(--border-default)",
      borderRadius: "var(--radius-2xl)", boxShadow: "var(--shadow-xs)", padding: 24,
    }}>
      {children}
    </div>
  );
}

function StepLabel({ icon: Icon, children }) {
  return (
    <div className="flex items-center gap-1" style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-tertiary)", marginBottom: 12 }}>
      <Icon size={12} strokeWidth={1.5} aria-hidden="true" /> {children}
    </div>
  );
}

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
    <div style={{ minHeight: "100vh", background: "var(--bg-canvas)" }} className="p-6 sm:p-8 animate-fade-in">
      <div className="max-w-3xl mx-auto" style={{ paddingTop: 48, paddingBottom: 64 }}>
        <div className="flex items-center gap-3" style={{ marginBottom: 32 }}>
          <div className="flex items-center justify-center rounded-full" style={{
            width: 32, height: 32, background: "var(--text-primary)", color: "var(--bg-surface)",
            fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14,
          }}>i</div>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14, color: "var(--text-primary)" }}>
            Innoira <span style={{ color: "var(--text-tertiary)" }}>/</span> <span style={{ color: "var(--text-tertiary)" }}>Setup</span>
          </div>
          <button onClick={skip} data-testid="onboarding-skip" className="ml-auto" style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>Skip for now</button>
        </div>

        <div className="flex items-center gap-2" style={{ marginBottom: 40 }}>
          {[1, 2, 3].map((n) => (
            <div key={n} className="flex-1 rounded-full" style={{ height: 6, background: step >= n ? "var(--color-primary)" : "var(--border-default)" }} />
          ))}
        </div>

        {step === 1 && (
          <StepPanel>
            <StepLabel icon={Globe}>Step 1 of 3</StepLabel>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 600, color: "var(--text-primary)" }}>Teach the agent about your business.</h1>
            <p style={{ marginTop: 12, fontSize: 14, color: "var(--text-secondary)" }}>Paste your website. Pitch EQ will crawl the homepage plus a few relevant pages, understand your services and ICP, then draft campaigns you can review.</p>
            <div style={{ marginTop: 32 }}>
              <Input label="Website URL" value={url} onChange={(e) => setUrl(e.target.value)} data-testid="onboarding-url" placeholder="https://yourcompany.com" />
            </div>
            <Button variant="primary" trailingIcon={ArrowRight} onClick={analyze} isLoading={busy} data-testid="onboarding-analyze" style={{ marginTop: 24 }}>
              {busy ? "Crawling & analysing…" : "Analyze my website"}
            </Button>
          </StepPanel>
        )}

        {step === 2 && (
          <StepPanel>
            <StepLabel icon={Search}>Step 2 of 3</StepLabel>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 600, color: "var(--text-primary)" }}>Here's what I understood.</h1>
            <div style={{ marginTop: 20, borderLeft: "2px solid var(--color-primary)", paddingLeft: 16, fontSize: 14, color: "var(--text-secondary)" }}>
              {summary || <span style={{ color: "var(--text-tertiary)" }}>Couldn't extract much — help me by answering below.</span>}
            </div>
            {crawled.length > 0 && (
              <div className="tnum" style={{ marginTop: 12, fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>Pages read: {crawled.length}</div>
            )}
            {services.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <div style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-tertiary)", marginBottom: 8 }}>Detected services / offerings</div>
                <div className="flex flex-wrap gap-2">
                  {services.map((s, i) => (
                    <Chip key={s} label={s} data-testid={`onboarding-service-${i}`} onRemove={() => setServices(services.filter((_, x) => x !== i))} />
                  ))}
                  {services.length < 3 && (
                    <button onClick={() => { const v = prompt("Add a service or offering"); if (v && v.trim()) setServices([...services, v.trim()]); }}
                      data-testid="onboarding-add-service"
                      style={{ height: 26, padding: "0 10px", borderRadius: "var(--radius-sm)", border: "1px dashed var(--border-default)", fontSize: 12.5, color: "var(--text-tertiary)" }}>+ add</button>
                  )}
                </div>
                <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 8 }}>We'll create one campaign per service (max 3).</p>
              </div>
            )}
            <div className="space-y-4" style={{ marginTop: 32 }}>
              {questions.map((q, i) => (
                <Input key={q} as="textarea" rows={2} label={q}
                  value={answers[q] || ""} onChange={(e) => setAnswers({ ...answers, [q]: e.target.value })}
                  data-testid={`onboarding-answer-${i}`} />
              ))}
            </div>
            <div className="flex gap-2" style={{ marginTop: 24 }}>
              <Button variant="secondary" onClick={() => setStep(1)}>Back</Button>
              <Button variant="primary" trailingIcon={ArrowRight} onClick={generate} isLoading={busy} data-testid="onboarding-generate">
                {busy ? "Designing campaigns…" : "Generate campaigns"}
              </Button>
            </div>
          </StepPanel>
        )}

        {step === 3 && (
          <div className="animate-fade-in">
            <StepPanel className="mb-4">
              <StepLabel icon={Check}>Step 3 of 3 · Review & edit</StepLabel>
              <h1 style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 600, color: "var(--text-primary)" }}>Here are your campaigns — please verify.</h1>
              <p style={{ marginTop: 8, fontSize: 14, color: "var(--text-secondary)" }}>Edit anything, uncheck to drop, then save. You can also change everything later in Campaigns.</p>
            </StepPanel>
            <div className="space-y-4">
              {campaigns.map((c, ci) => (
                <div key={c._k || ci} style={{
                  background: "var(--bg-surface)", border: `1px solid ${accept[ci] ? "var(--text-primary)" : "var(--border-default)"}`,
                  borderRadius: "var(--radius-xl)", boxShadow: "var(--shadow-xs)", padding: 20,
                }}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      {c.service && <div style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-tertiary)", marginBottom: 4 }}>Service: {c.service}</div>}
                      <input value={c.name || ""} onChange={(e) => updateCampaignField(ci, "name", e.target.value)}
                        data-testid={`onboarding-campaign-name-${ci}`}
                        className="w-full"
                        style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 16, background: "transparent", border: "none", color: "var(--text-primary)" }} />
                      <input value={c.goal || ""} onChange={(e) => updateCampaignField(ci, "goal", e.target.value)}
                        className="w-full" style={{ marginTop: 4, fontSize: 12.5, background: "transparent", border: "none", color: "var(--text-tertiary)" }} />
                    </div>
                    <Checkbox label="Include" checked={!!accept[ci]} onChange={(e) => setAccept({ ...accept, [ci]: e.target.checked })} data-testid={`onboarding-accept-${ci}`} />
                  </div>
                  <div className="space-y-3" style={{ marginTop: 20 }}>
                    {c.steps?.map((s, si) => {
                      const isEdit = editing && editing.ci === ci && editing.si === si;
                      return (
                        <div key={s._k || si} style={{ borderLeft: "2px solid var(--border-default)", paddingLeft: 16 }}>
                          <div className="flex items-center gap-2" style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-tertiary)" }}>
                            <span>Step {si + 1} · day {s.day}</span>
                            <button onClick={() => setEditing(isEdit ? null : { ci, si })}
                              data-testid={`onboarding-edit-${ci}-${si}`} style={{ color: "var(--text-tertiary)" }}>
                              <Pencil size={12} strokeWidth={1.5} aria-hidden="true" />
                            </button>
                          </div>
                          {isEdit ? (
                            <div className="space-y-2" style={{ marginTop: 8 }}>
                              <Input value={s.subject} onChange={(e) => updateStep(ci, si, { subject: e.target.value })} data-testid={`onboarding-step-subject-${ci}-${si}`} />
                              <Input as="textarea" rows={6} value={s.body} onChange={(e) => updateStep(ci, si, { body: e.target.value })} data-testid={`onboarding-step-body-${ci}-${si}`} style={{ fontFamily: "var(--font-mono)" }} />
                            </div>
                          ) : (
                            <>
                              <div style={{ fontSize: 13.5, fontWeight: 500, color: "var(--text-primary)", marginTop: 4 }}>{s.subject}</div>
                              <div className="line-clamp-5 whitespace-pre-wrap" style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginTop: 4 }}>{s.body}</div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2" style={{ marginTop: 24 }}>
              <Button variant="secondary" onClick={() => setStep(2)}>Back</Button>
              <Button variant="primary" trailingIcon={ArrowRight} onClick={finish} isLoading={busy} data-testid="onboarding-finish">
                {busy ? "Saving…" : "Approve & save"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
