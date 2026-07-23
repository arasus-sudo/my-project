import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import {
  ArrowRight, ArrowLeft, Loader2, CheckCircle2, XCircle,
  Mail, MessageCircle, Phone, Globe, Smartphone, Target, Users,
  Building2, BookOpen, ChevronRight, Zap, ShieldCheck, AlertTriangle,
  FileText, BarChart3, Play, Plus,
} from "lucide-react";

const GOALS = [
  { value: "book_meetings", label: "Book Meetings", icon: Target },
  { value: "generate_leads", label: "Generate Leads", icon: Users },
  { value: "brand_awareness", label: "Brand Awareness", icon: Globe },
  { value: "event", label: "Event Promotion", icon: BookOpen },
  { value: "recruitment", label: "Recruitment", icon: Users },
  { value: "upsell", label: "Upsell / Expansion", icon: Zap },
  { value: "renewals", label: "Renewals", icon: ShieldCheck },
];

const CHANNEL_OPTIONS = [
  { value: "email", label: "Email", icon: Mail, desc: "Cold email sequences" },
  { value: "linkedin", label: "LinkedIn", icon: MessageCircle, desc: "Connection requests + DMs" },
  { value: "whatsapp", label: "WhatsApp", icon: Phone, desc: "WhatsApp messaging" },
  { value: "call", label: "Voice Call", icon: Phone, desc: "Call scripts + voicemail" },
  { value: "sms", label: "SMS", icon: Smartphone, desc: "Text message outreach" },
];

const TONES = [
  { value: "professional", label: "Professional" },
  { value: "consultative", label: "Consultative" },
  { value: "technical", label: "Technical" },
  { value: "executive", label: "Executive" },
  { value: "friendly", label: "Friendly" },
  { value: "urgent", label: "Urgent" },
  { value: "luxury", label: "Luxury" },
  { value: "enterprise", label: "Enterprise" },
];

const STEPS = ["Service", "Goal", "Audience", "Tone", "Channels", "Generate"];

export default function CampaignWizard() {
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [services, setServices] = useState([]);
  const [intel, setIntel] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [campaign, setCampaign] = useState(null);

  const [form, setForm] = useState({
    service_id: "",
    goal: "book_meetings",
    target_audience: { industry: "", location: "", company_size: "", titles: "", decision_makers: "" },
    tone: "professional",
    channels: ["email"],
    campaign_type: "cold_email",
    company_intel_id: "",
    signature: "",
    cta_override: "",
  });

  const load = async () => {
    try {
      const [svcRes, intelRes] = await Promise.all([
        api.get("/services"),
        api.get("/company-intel/crawl").catch(() => ({ data: [] })),
      ]);
      setServices(svcRes.data.filter((s) => s.status !== "archived"));
      setIntel(intelRes.data || []);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });
  const setAudience = (field) => (e) =>
    setForm({ ...form, target_audience: { ...form.target_audience, [field]: e.target.value } });

  const toggleChannel = (ch) => {
    setForm({
      ...form,
      channels: form.channels.includes(ch)
        ? form.channels.filter((c) => c !== ch)
        : [...form.channels, ch],
    });
  };

  const generate = async () => {
    setGenerating(true);
    try {
      const { data } = await api.post("/campaign-engine/generate", {
        service_id: form.service_id,
        goal: form.goal,
        target_audience: form.target_audience,
        tone: form.tone,
        channels: form.channels,
        campaign_type: form.campaign_type,
        company_intel_id: form.company_intel_id || undefined,
        signature: form.signature || undefined,
        cta_override: form.cta_override || undefined,
      });
      setCampaign(data.campaign);
      toast.success("Campaign generated!");
      nav(`/app/campaigns/${data.campaign_id}`);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Generation failed");
    } finally { setGenerating(false); }
  };

  const selectedService = services.find((s) => s.id === form.service_id);

  const canProceed = () => {
    if (step === 0) return !!form.service_id;
    if (step === 4) return form.channels.length > 0;
    return true;
  };

  const getScoreColor = (score) => {
    if (!score && score !== 0) return "text-ink-disabled";
    if (score >= 80) return "text-success";
    if (score >= 50) return "text-warning";
    return "text-danger";
  };

  const renderEmailSequence = () => {
    const seq = campaign?.email_sequence || [];
    if (!seq.length) return null;
    return (
      <div className="card-floating p-5">
        <div className="text-card-title font-display font-semibold mb-4 flex items-center gap-2">
          <Mail size={16} /> Email Sequence
        </div>
        <div className="space-y-3">
          {seq.map((email, i) => (
            <div key={i} className="border border-line rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="pill">Day {email.day}</span>
                <span className="text-caption text-ink-muted">{email.goal || ""}</span>
              </div>
              <div className="text-body font-medium mb-1">{email.subject}</div>
              <div className="text-caption text-ink-tertiary leading-relaxed whitespace-pre-line">{email.body}</div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderLinkedIn = () => {
    const li = campaign?.linkedin_sequence;
    if (!li?.connection_request) return null;
    return (
      <div className="card-floating p-5">
        <div className="text-card-title font-display font-semibold mb-4 flex items-center gap-2">
          <MessageCircle size={16} /> LinkedIn Sequence
        </div>
        <div className="space-y-3">
          <div className="border border-line rounded-xl p-3">
            <div className="ui-label mb-1">Connection Request</div>
            <div className="text-caption">{li.connection_request}</div>
          </div>
          {li.follow_up && (
            <div className="border border-line rounded-xl p-3">
              <div className="ui-label mb-1">Follow-up</div>
              <div className="text-caption">{li.follow_up}</div>
            </div>
          )}
          {li.dm_sequence?.map((dm, i) => (
            <div key={i} className="border border-line rounded-xl p-3">
              <div className="ui-label mb-1">DM Day {dm.day}</div>
              <div className="text-caption">{dm.message}</div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderObjections = () => {
    const obs = campaign?.objection_handling || [];
    if (!obs.length) return null;
    return (
      <div className="card-floating p-5">
        <div className="text-card-title font-display font-semibold mb-4 flex items-center gap-2">
          <ShieldCheck size={16} /> Objection Handling
        </div>
        <div className="space-y-2">
          {obs.map((ob, i) => (
            <div key={i} className="border border-line rounded-xl p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="pill">{ob.category || "objection"}</span>
                <span className="text-caption font-medium">{ob.objection}</span>
              </div>
              <div className="text-caption text-ink-tertiary">{ob.handling}</div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderVoiceScript = () => {
    const vs = campaign?.voice_script;
    if (!vs?.call_script) return null;
    return (
      <div className="card-floating p-5">
        <div className="text-card-title font-display font-semibold mb-4 flex items-center gap-2">
          <Phone size={16} /> Voice Script
        </div>
        <div className="border border-line rounded-xl p-3">
          <div className="ui-label mb-1">Call Script</div>
          <div className="text-caption whitespace-pre-line">{vs.call_script}</div>
        </div>
        {vs.gatekeeper_script && (
          <div className="border border-line rounded-xl p-3 mt-2">
            <div className="ui-label mb-1">Gatekeeper Script</div>
            <div className="text-caption">{vs.gatekeeper_script}</div>
          </div>
        )}
        {vs.voicemail && (
          <div className="border border-line rounded-xl p-3 mt-2">
            <div className="ui-label mb-1">Voicemail</div>
            <div className="text-caption">{vs.voicemail}</div>
          </div>
        )}
      </div>
    );
  };

  const renderAI_SCORE = () => {
    const score = campaign?.ai_score;
    if (!score) return null;
    return (
      <div className="card-floating p-5">
        <div className="text-card-title font-display font-semibold mb-4 flex items-center gap-2">
          <BarChart3 size={16} /> AI Score
        </div>
        <div className="text-center mb-4">
          <div className={`font-display text-5xl font-bold tracking-tight ${getScoreColor(score.overall_score)}`}>
            {score.overall_score}
          </div>
          <div className="text-caption text-ink-muted">Overall Score</div>
        </div>
        <div className="space-y-2">
          {[
            { label: "Personalization", value: score.personalization },
            { label: "ICP Match", value: score.icp_match },
            { label: "Offer Quality", value: score.offer_quality },
            { label: "CTA Quality", value: score.cta_quality },
            { label: "Readability", value: score.readability },
            { label: "Spam Safety", value: score.spam_score_risk },
            { label: "Deliverability", value: score.deliverability },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-2 text-caption">
              <span className="w-24 text-ink-muted">{s.label}</span>
              <div className="flex-1 h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${
                  s.value >= 80 ? "bg-success" : s.value >= 50 ? "bg-warning" : "bg-danger"
                }`} style={{ width: `${s.value || 0}%` }} />
              </div>
              <span className={`w-6 text-right font-mono font-bold ${getScoreColor(s.value)}`}>{s.value || 0}</span>
            </div>
          ))}
        </div>
        {score.strengths?.length > 0 && (
          <div className="mt-3">
            <div className="ui-label mb-1">Strengths</div>
            {score.strengths.map((s, i) => (
              <div key={i} className="text-caption text-success flex items-center gap-1"><CheckCircle2 size={12} />{s}</div>
            ))}
          </div>
        )}
        {score.weaknesses_to_improve?.length > 0 && (
          <div className="mt-2">
            <div className="ui-label mb-1">To Improve</div>
            {score.weaknesses_to_improve.map((w, i) => (
              <div key={i} className="text-caption text-warning flex items-center gap-1"><AlertTriangle size={12} />{w}</div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderAI_ACTIONS = () => {
    const actions = campaign?.ai_actions || [];
    if (!actions.length) return null;
    return (
      <div className="card-floating p-5">
        <div className="text-card-title font-display font-semibold mb-4 flex items-center gap-2">
          <Zap size={16} /> AI Action Items
        </div>
        <div className="space-y-2">
          {actions.map((a, i) => (
            <div key={i} className="flex items-start gap-2 text-caption p-2 rounded-xl bg-ash border border-line">
              <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                a.priority === "high" ? "bg-danger" :
                a.priority === "medium" ? "bg-warning" : "bg-neutral-300"
              }`} />
              <div className="flex-1">
                <div className="font-medium">{a.task}</div>
                <div className="text-ink-muted mt-0.5">{a.category} · {a.effort}</div>
              </div>
              <span className={`pill ${
                a.priority === "high" ? "text-danger border-danger/20" :
                a.priority === "medium" ? "text-warning border-warning/20" : ""
              }`}>{a.priority}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div>
        <PageHeader title="Campaign Wizard" subtitle="Build an outbound campaign in minutes." />
        <div className="p-12 text-center text-body text-ink-muted">Loading...</div>
      </div>
    );
  }

  if (campaign) {
    return (
      <div>
        <PageHeader
          title={campaign?.strategy?.executive_summary ? "Campaign Generated" : "Campaign"}
          subtitle="Review your complete campaign below. All sections are editable and can be regenerated individually."
          right={
            <div className="flex items-center gap-2">
              <button onClick={() => nav("/app/campaigns")} className="btn-secondary">
                <ArrowLeft size={14} /> Back to Campaigns
              </button>
            </div>
          }
        />
        <div className="px-6 sm:px-8 pb-8 space-y-6">
          {campaign.strategy?.executive_summary && (
            <div className="card-floating p-6">
              <div className="text-card-title font-display font-semibold mb-3">Executive Summary</div>
              <div className="flex flex-wrap gap-2 mb-3">
                <span className="pill">{campaign.campaign_type?.replace(/_/g, " ")}</span>
                <span className="pill">{campaign.goal?.replace(/_/g, " ")}</span>
                <span className="pill">{campaign.tone}</span>
                {campaign.channels?.map((ch) => <span key={ch} className="pill">{ch}</span>)}
              </div>
              <p className="text-body text-ink-tertiary leading-relaxed">{campaign.strategy.executive_summary}</p>

              <div className="grid sm:grid-cols-2 gap-4 mt-4">
                {campaign.strategy.messaging_angle && (
                  <div className="p-3 rounded-xl bg-ash border border-line">
                    <div className="ui-label">Messaging Angle</div>
                    <div className="text-body mt-1">{campaign.strategy.messaging_angle}</div>
                  </div>
                )}
                {campaign.strategy.usp && (
                  <div className="p-3 rounded-xl bg-ash border border-line">
                    <div className="ui-label">USP</div>
                    <div className="text-body mt-1">{campaign.strategy.usp}</div>
                  </div>
                )}
              </div>

              {campaign.strategy.hooks?.length > 0 && (
                <div className="mt-4">
                  <div className="ui-label mb-2">Hooks</div>
                  <div className="flex flex-wrap gap-2">
                    {campaign.strategy.hooks.map((h, i) => (
                      <span key={i} className="pill">{h}</span>
                    ))}
                  </div>
                </div>
              )}

              {campaign.strategy.target_personas?.length > 0 && (
                <div className="mt-4">
                  <div className="ui-label mb-2">Target Personas</div>
                  <div className="space-y-1">
                    {campaign.strategy.target_personas.map((p, i) => (
                      <div key={i} className="text-caption flex items-center gap-2">
                        <Target size={12} className="text-ink-muted" />{p}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="grid xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 space-y-6">
              {renderEmailSequence()}
              {renderLinkedIn()}
              {renderVoiceScript()}
              {renderObjections()}

              {campaign.whatsapp_sequence?.length > 0 && (
                <div className="card-floating p-5">
                  <div className="text-card-title font-display font-semibold mb-4 flex items-center gap-2">
                    <Phone size={16} /> WhatsApp Sequence
                  </div>
                  {campaign.whatsapp_sequence.map((wa, i) => (
                    <div key={i} className="border border-line rounded-xl p-3 mb-2">
                      <span className="pill">Day {wa.day}</span>
                      <div className="text-caption mt-1">{wa.message}</div>
                    </div>
                  ))}
                </div>
              )}

              {campaign.sms_sequence?.length > 0 && (
                <div className="card-floating p-5">
                  <div className="text-card-title font-display font-semibold mb-4 flex items-center gap-2">
                    <Smartphone size={16} /> SMS Sequence
                  </div>
                  {campaign.sms_sequence.map((sms, i) => (
                    <div key={i} className="border border-line rounded-xl p-3 mb-2">
                      <span className="pill">Day {sms.day}</span>
                      <div className="text-caption mt-1">{sms.message}</div>
                    </div>
                  ))}
                </div>
              )}

              {campaign.meeting_script?.discovery_questions?.length > 0 && (
                <div className="card-floating p-5">
                  <div className="text-card-title font-display font-semibold mb-3">Meeting Script</div>
                  <div className="space-y-3">
                    {campaign.meeting_script.discovery_questions?.length > 0 && (
                      <div>
                        <div className="ui-label mb-1">Discovery Questions</div>
                        {campaign.meeting_script.discovery_questions.map((q, i) => (
                          <div key={i} className="text-caption py-1">• {q}</div>
                        ))}
                      </div>
                    )}
                    {campaign.meeting_script.closing_questions?.length > 0 && (
                      <div>
                        <div className="ui-label mb-1">Closing Questions</div>
                        {campaign.meeting_script.closing_questions.map((q, i) => (
                          <div key={i} className="text-caption py-1">• {q}</div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {campaign.follow_up_plan?.length > 0 && (
                <div className="card-floating p-5">
                  <div className="text-card-title font-display font-semibold mb-3">Follow-up Timeline</div>
                  <div className="space-y-1">
                    {campaign.follow_up_plan.map((f, i) => (
                      <div key={i} className="flex items-center gap-3 text-caption p-2 rounded-lg hover:bg-ash transition-colors">
                        <span className="w-16 text-ink-muted font-mono">Day {f.day}</span>
                        <span>{f.action}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-6">
              {renderAI_SCORE()}
              {renderAI_ACTIONS()}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Campaign Wizard" subtitle="Build a multi-channel outbound campaign in five minutes." />

      <div className="px-6 sm:px-8 pt-6 pb-8 max-w-4xl mx-auto">
        {/* Steps indicator */}
        <div className="flex items-center mb-8">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center flex-1 last:flex-none">
              <button onClick={() => i < step && setStep(i)}
                className={`w-8 h-8 rounded-full flex items-center justify-center text-caption font-medium transition-all ${
                  i === step ? "bg-accent text-white" :
                  i < step ? "bg-success text-white" : "bg-neutral-100 text-ink-muted"
                }`}>
                {i < step ? <CheckCircle2 size={14} /> : i + 1}
              </button>
              <div className={`hidden sm:block text-caption ml-2 ${
                i === step ? "text-ink font-medium" : "text-ink-muted"
              }`}>{s}</div>
              {i < STEPS.length - 1 && <div className="flex-1 h-px bg-line mx-2 sm:mx-4" />}
            </div>
          ))}
        </div>

        {/* Step 0: Choose Service */}
        {step === 0 && (
          <div className="animate-fade-up space-y-4">
            <div className="text-card-title font-display font-semibold">Choose a Service</div>
            <p className="text-body text-ink-muted">Select the service this campaign will promote.</p>
            {services.length === 0 ? (
              <div className="card-floating p-8 text-center">
                <div className="text-card-title font-display font-semibold">No services defined</div>
                <p className="text-body text-ink-muted mt-1">Create a service first in the Service Library.</p>
                <Link to="/app/services" className="btn-primary mt-4 inline-flex">Go to Service Library</Link>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                {services.map((s) => (
                  <button key={s.id} onClick={() => setForm({ ...form, service_id: s.id })}
                    className={`text-left p-4 rounded-2xl border transition-all ${
                      form.service_id === s.id
                        ? "border-accent bg-accent/5"
                        : "border-line hover:border-ink/20 bg-white"
                    }`}>
                    <div className="font-medium text-body">{s.name}</div>
                    {s.description && <div className="text-caption text-ink-muted mt-1 line-clamp-2">{s.description}</div>}
                    {s.industry && <div className="pill mt-2">{s.industry}</div>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 1: Choose Goal */}
        {step === 1 && (
          <div className="animate-fade-up space-y-4">
            <div className="text-card-title font-display font-semibold">Campaign Goal</div>
            <p className="text-body text-ink-muted">What's the primary objective of this campaign?</p>
            <div className="grid sm:grid-cols-2 gap-3">
              {GOALS.map((g) => (
                <button key={g.value} onClick={() => setForm({ ...form, goal: g.value })}
                  className={`text-left p-4 rounded-2xl border transition-all ${
                    form.goal === g.value
                      ? "border-accent bg-accent/5"
                      : "border-line hover:border-ink/20 bg-white"
                  }`}>
                  <div className="flex items-center gap-2">
                    <g.icon size={16} className="text-ink-muted" />
                    <span className="font-medium text-body">{g.label}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Target Audience */}
        {step === 2 && (
          <div className="animate-fade-up space-y-4">
            <div className="text-card-title font-display font-semibold">Target Audience</div>
            <p className="text-body text-ink-muted">Define who you want to reach.</p>
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="block">
                <span className="form-label">Industry</span>
                <input value={form.target_audience.industry} onChange={setAudience("industry")}
                  className="input-premium mt-1" placeholder="e.g. SaaS, Healthcare, Fintech" />
              </label>
              <label className="block">
                <span className="form-label">Location</span>
                <input value={form.target_audience.location} onChange={setAudience("location")}
                  className="input-premium mt-1" placeholder="e.g. US, UK, Remote" />
              </label>
              <label className="block">
                <span className="form-label">Company Size</span>
                <input value={form.target_audience.company_size} onChange={setAudience("company_size")}
                  className="input-premium mt-1" placeholder="e.g. 51-200, 1000+" />
              </label>
              <label className="block">
                <span className="form-label">Job Titles</span>
                <input value={form.target_audience.titles} onChange={setAudience("titles")}
                  className="input-premium mt-1" placeholder="e.g. VP of Sales, CRO" />
              </label>
              <label className="sm:col-span-2 block">
                <span className="form-label">Decision Makers</span>
                <input value={form.target_audience.decision_makers} onChange={setAudience("decision_makers")}
                  className="input-premium mt-1" placeholder="e.g. CEO, CTO, Head of Revenue" />
              </label>
            </div>

            {intel.length > 0 && (
              <div>
                <div className="ui-label mb-2">Use Company Intelligence</div>
                <select value={form.company_intel_id} onChange={set("company_intel_id")}
                  className="input-premium">
                  <option value="">None (skip company intelligence)</option>
                  {intel.map((i) => (
                    <option key={i.id} value={i.id}>{i.domain} — {i.profile?.industry || "No industry"}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Tone */}
        {step === 3 && (
          <div className="animate-fade-up space-y-4">
            <div className="text-card-title font-display font-semibold">Communication Tone</div>
            <p className="text-body text-ink-muted">How should your campaign sound?</p>
            <div className="grid sm:grid-cols-2 gap-3">
              {TONES.map((t) => (
                <button key={t.value} onClick={() => setForm({ ...form, tone: t.value })}
                  className={`text-left p-4 rounded-2xl border transition-all ${
                    form.tone === t.value
                      ? "border-accent bg-accent/5"
                      : "border-line hover:border-ink/20 bg-white"
                  }`}>
                  <span className="font-medium text-body">{t.label}</span>
                </button>
              ))}
            </div>

            <div className="grid sm:grid-cols-2 gap-4 pt-2">
              <label className="block">
                <span className="form-label">Signature (optional)</span>
                <textarea value={form.signature} onChange={set("signature")}
                  rows={4}
                  className="input-premium mt-1 font-mono text-caption"
                  placeholder={"Best,\nJane Doe\nVP Sales, Acme Co."} />
                <p className="text-caption text-ink-muted mt-1">Appended to every email at send time — leave blank to pick a signature later in the editor.</p>
              </label>
              <label className="block">
                <span className="form-label">CTA override (optional)</span>
                <input value={form.cta_override} onChange={set("cta_override")}
                  className="input-premium mt-1"
                  placeholder="e.g. Worth a 15-minute call this week?" />
                <p className="text-caption text-ink-muted mt-1">Forces every generated email to close with this exact question instead of a generated one.</p>
              </label>
            </div>
          </div>
        )}

        {/* Step 4: Channels */}
        {step === 4 && (
          <div className="animate-fade-up space-y-4">
            <div className="text-card-title font-display font-semibold">Outbound Channels</div>
            <p className="text-body text-ink-muted">Select the channels for this campaign. Multi-channel campaigns get better response rates.</p>
            <div className="grid sm:grid-cols-2 gap-3">
              {CHANNEL_OPTIONS.map((ch) => (
                <button key={ch.value} onClick={() => toggleChannel(ch.value)}
                  className={`text-left p-4 rounded-2xl border transition-all ${
                    form.channels.includes(ch.value)
                      ? "border-accent bg-accent/5"
                      : "border-line hover:border-ink/20 bg-white"
                  }`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      form.channels.includes(ch.value) ? "bg-accent text-white" : "bg-ash text-ink-muted"
                    }`}>
                      <ch.icon size={16} />
                    </div>
                    <div>
                      <div className="font-medium text-body">{ch.label}</div>
                      <div className="text-caption text-ink-muted">{ch.desc}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 5: Generate */}
        {step === 5 && (
          <div className="animate-fade-up space-y-4 text-center">
            <div className="text-card-title font-display font-semibold">Ready to Generate</div>
            <p className="text-body text-ink-muted max-w-md mx-auto">
              This creates a complete multi-channel campaign including strategy, email sequences, LinkedIn outreach, voice scripts, objection handling, and more.
            </p>

            <div className="card-floating p-6 max-w-md mx-auto text-left">
              <div className="space-y-3 text-body">
                <div className="flex items-center justify-between">
                  <span className="text-ink-muted">Service</span>
                  <span className="font-medium">{selectedService?.name || "—"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-ink-muted">Goal</span>
                  <span className="font-medium">{GOALS.find((g) => g.value === form.goal)?.label || form.goal}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-ink-muted">Tone</span>
                  <span className="font-medium capitalize">{form.tone}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-ink-muted">Channels</span>
                  <span className="font-medium">{form.channels.join(", ")}</span>
                </div>
              </div>
            </div>

            <button onClick={generate} disabled={generating} className="btn-primary text-base py-3 px-8 disabled:opacity-50">
              {generating ? (
                <><Loader2 size={16} className="animate-spin" /> Generating Campaign...</>
              ) : (
                <><Zap size={16} /> Generate Campaign</>
              )}
            </button>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8">
          <button onClick={() => setStep(Math.max(0, step - 1))}
            disabled={step === 0}
            className="btn-ghost disabled:opacity-30">
            <ArrowLeft size={14} /> Back
          </button>
          <div className="text-caption text-ink-muted font-mono">Step {step + 1} of 6</div>
          {step < 5 ? (
            <button onClick={() => setStep(Math.min(5, step + 1))}
              disabled={!canProceed()}
              className="btn-primary disabled:opacity-30">
              Continue <ArrowRight size={14} />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
