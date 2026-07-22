import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, isCreditError } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import RichEmailEditor, { sanitizeEmailHtml } from "../components/RichEmailEditor";
import { toast } from "sonner";
import {
  FileSearch, Save, Play, Plus, Trash2, Loader2, Check, AlertTriangle, Flame,
  Mail, Eye, ThumbsUp, Signature, Search, Megaphone,
  Zap, ChevronLeft, ChevronRight,
  Edit2, RotateCw, Flag, List, Tag, X,
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
  const [campaignLeads, setCampaignLeads] = useState([]);
  const [generatingEmail, setGeneratingEmail] = useState(null);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [previewEmail, setPreviewEmail] = useState(null);
  const [selectedPanelLeads, setSelectedPanelLeads] = useState([]);
  const [selectAllPanel, setSelectAllPanel] = useState(false);
  const [leadSearch, setLeadSearch] = useState("");
  const [signatures, setSignatures] = useState([]);
  const [signatureId, setSignatureId] = useState("");
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [signatureName, setSignatureName] = useState("");
  const [signatureHtml, setSignatureHtml] = useState("");
  const [sigSenderName, setSigSenderName] = useState("");
  const [sigTitle, setSigTitle] = useState("");
  const [sigCompany, setSigCompany] = useState("");
  const [sigEmail, setSigEmail] = useState("");
  const [sigPhone, setSigPhone] = useState("");
  const [savingSignature, setSavingSignature] = useState(false);
  
  const [leadLists, setLeadLists] = useState([]);
  const [selectedListId, setSelectedListId] = useState("");
  const [selectedTags, setSelectedTags] = useState([]);

  const [sendWindowStart, setSendWindowStart] = useState("09:00");
  const [sendWindowEnd, setSendWindowEnd] = useState("17:00");
  const [timezone, setTimezone] = useState("UTC");

  // Campaign Engine & Review states
  const [engineRunning, setEngineRunning] = useState(false);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewMode, setReviewMode] = useState(false);
  const [editingOpener, setEditingOpener] = useState(null); // {leadId, opener}

  const loadCampaignLeads = () => {
    if (!id) return;
    api.get(`/campaigns/${id}/leads`).then((r) => setCampaignLeads(r.data.leads || [])).catch(() => {});
  };

  useEffect(() => {
    api.get("/leads").then((r) => setLeads(r.data));
    api.get("/crm/lists").then((r) => setLeadLists(r.data || [])).catch(() => {});
    if (id) {
      api.get(`/campaigns/${id}`).then((r) => {
        const c = r.data;
        setName(c.name); setGoal(c.goal || "");
        setSteps(c.steps?.length ? c.steps.map((s) => ({
          ...s,
          _key: s._key || stepKey(),
          body_html: s.body_html || (s.body ? "<p>" + s.body.replace(/\n\n+/g, "</p><p>").replace(/\n/g, "<br/>") + "</p>" : ""),
        })) : [DEFAULT_STEP()]);
        setSelectedLeads(c.lead_ids || []);
        setStatus(c.status || "draft");
        if (c.signature_id) setSignatureId(c.signature_id);
        if (c.send_window_start) setSendWindowStart(c.send_window_start);
        if (c.send_window_end) setSendWindowEnd(c.send_window_end);
        if (c.timezone) setTimezone(c.timezone);
      });
      loadCampaignLeads();
    }
  }, [id]);

  const generateLeadEmail = async (leadId) => {
    setGeneratingEmail(leadId);
    try {
      const { data } = await api.post(`/campaigns/${id}/leads/${leadId}/generate-email`);
      toast.success("Personalized email generated");
      loadCampaignLeads();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Generation failed");
    } finally {
      setGeneratingEmail(null);
    }
  };

  const generateAllEmails = async () => {
    setGeneratingAll(true);
    try {
      const { data } = await api.post(`/campaigns/${id}/leads/generate-all`);
      toast.success(`Generated ${data.generated} personalized email${data.generated === 1 ? '' : 's'}`);
      if (data.errors?.length) console.warn("Generation errors:", data.errors);
      loadCampaignLeads();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Bulk generation failed");
    } finally {
      setGeneratingAll(false);
    }
  };

  const deleteLeadEmail = async (leadId) => {
    try {
      await api.delete(`/campaigns/${id}/leads/${leadId}/email`);
      toast.success("Email removed");
      loadCampaignLeads();
    } catch {
      toast.error("Failed to remove");
    }
  };

  // Load signatures
  useEffect(() => {
    api.get("/signatures").then((r) => {
      setSignatures(r.data || []);
      const def = (r.data || []).find((s) => s.is_default);
      if (def) setSignatureId(def.id);
    }).catch(() => {});
  }, []);

  // Signature CRUD
  const buildSignatureHtml = () => {
    const parts = [];
    if (sigSenderName) parts.push(`<strong>${sigSenderName}</strong>`);
    if (sigTitle) parts.push(sigTitle);
    if (sigCompany) parts.push(sigCompany);
    if (sigEmail) parts.push(`<a href="mailto:${sigEmail}" style="color:inherit;text-decoration:none">${sigEmail}</a>`);
    if (sigPhone) parts.push(sigPhone);
    return parts.join('<br>');
  };

  const createSignature = async () => {
    if (!signatureName.trim()) { toast.error("Name is required"); return; }
    setSavingSignature(true);
    try {
      const html = buildSignatureHtml();
      const text = [sigSenderName, sigTitle, sigCompany, sigEmail, sigPhone].filter(Boolean).join('\n');
      const { data } = await api.post("/signatures", { name: signatureName, content_html: html, content_text: text });
      setSignatures((prev) => [data, ...prev]);
      setSignatureId(data.id);
      setShowSignatureModal(false);
      setSignatureName(""); setSigSenderName(""); setSigTitle(""); setSigCompany(""); setSigEmail(""); setSigPhone("");
      toast.success("Signature created");
    } catch { toast.error("Failed to create signature"); }
    finally { setSavingSignature(false); }
  };

  const deleteSignature = async (sid) => {
    try {
      await api.delete(`/signatures/${sid}`);
      setSignatures((prev) => prev.filter((s) => s.id !== sid));
      if (signatureId === sid) setSignatureId(signatures.find((s) => s.id !== sid)?.id || "");
      toast.success("Signature deleted");
    } catch { toast.error("Failed to delete"); }
  };

  // Panel: select/deselect all
  const toggleSelectAllPanel = () => {
    if (selectAllPanel) {
      setSelectedPanelLeads([]);
      setSelectAllPanel(false);
    } else {
      setSelectedPanelLeads(campaignLeads.map((l) => l.id));
      setSelectAllPanel(true);
    }
  };

  const togglePanelLead = (lid) => {
    setSelectedPanelLeads((prev) =>
      prev.includes(lid) ? prev.filter((x) => x !== lid) : [...prev, lid]
    );
    setSelectAllPanel(false);
  };

  // Add selected panel leads to campaign and auto-generate emails
  const addSelectedToCampaign = async () => {
    if (!id || selectedPanelLeads.length === 0) return;
    try {
      const { data } = await api.post(`/campaigns/${id}/leads/batch`, { lead_ids: selectedPanelLeads });
      if (data.added === 0) {
        toast.info("Leads already in campaign");
        return;
      }
      toast.success(`Added ${data.added} lead${data.added === 1 ? '' : 's'} — generating emails...`);
      const campaign = await api.get(`/campaigns/${id}`);
      setSelectedLeads(campaign.data.lead_ids || []);
      loadCampaignLeads();
      const engine = await api.post(`/campaigns/${id}/run-engine`);
      toast.success(`Generated ${engine.data.generated} personalized emails`);
      loadCampaignLeads();
      setReviewMode(true);
      setReviewIndex(0);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to add leads");
    }
  };

  // Approve / Reject
  const approveEmail = async (leadId) => {
    try {
      await api.post(`/campaigns/${id}/leads/${leadId}/approve`);
      toast.success("Email approved");
      loadCampaignLeads();
    } catch { toast.error("Approval failed"); }
  };

  const approveAllEmails = async () => {
    if (!id) return;
    try {
      const { data } = await api.post(`/campaigns/${id}/leads/approve-all`);
      toast.success(`${data.approved} email(s) approved`);
      loadCampaignLeads();
    } catch { toast.error("Approve-all failed"); }
  };

  const rejectEmail = async (leadId) => {
    try {
      await api.post(`/campaigns/${id}/leads/${leadId}/reject`);
      toast.success("Email rejected");
      loadCampaignLeads();
    } catch { toast.error("Rejection failed"); }
  };

  // Run Campaign Engine - generates personalized openers for all leads
  const runCampaignEngine = async () => {
    if (!id) return;
    setEngineRunning(true);
    try {
      const { data } = await api.post(`/campaigns/${id}/run-engine`);
      if (data.job_id) {
        toast.success(`Generating emails for ${data.generating} leads in background`);
        const poll = setInterval(async () => {
          try {
            const st = await api.get(`/campaigns/${id}/generation-status`);
            const job = Object.values(st.data.jobs)[0];
            if (!job) { clearInterval(poll); setEngineRunning(false); return; }
            if (job.status === "complete") {
              clearInterval(poll);
              setEngineRunning(false);
              loadCampaignLeads();
              setReviewMode(true);
              setReviewIndex(0);
              toast.success(`Generated ${job.done} emails`);
            }
          } catch { clearInterval(poll); setEngineRunning(false); }
        }, 3000);
      } else {
        toast.success(`Campaign engine processed ${data.generated} emails`);
        loadCampaignLeads();
        setReviewMode(true);
        setReviewIndex(0);
        setEngineRunning(false);
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Engine failed");
      setEngineRunning(false);
    }
  };

  // Regenerate opener for a single lead
  const regenerateOpener = async (leadId) => {
    if (!id) return;
    setGeneratingEmail(leadId);
    try {
      const { data } = await api.post(`/campaigns/${id}/leads/${leadId}/regenerate-opener`);
      toast.success("Opener regenerated");
      loadCampaignLeads();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Regeneration failed");
    } finally {
      setGeneratingEmail(null);
    }
  };

  // Save edited opener
  const saveOpener = async (leadId, newOpener) => {
    if (!id) return;
    try {
      await api.post(`/campaigns/${id}/leads/${leadId}/update-opener`, { opener: newOpener });
      toast.success("Opener updated");
      loadCampaignLeads();
      setEditingOpener(null);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Save failed");
    }
  };

  // Review navigation
  const getReviewEmails = () => {
    return campaignLeads.filter(l => l.personalized).sort((a, b) => {
      const idxA = campaignLeads.findIndex(l => l.id === a.id);
      const idxB = campaignLeads.findIndex(l => l.id === b.id);
      return idxA - idxB;
    });
  };

  const nextReview = () => {
    const emails = getReviewEmails();
    if (reviewIndex < emails.length - 1) setReviewIndex(reviewIndex + 1);
  };

  const prevReview = () => {
    if (reviewIndex > 0) setReviewIndex(reviewIndex - 1);
  };

  const startReview = () => {
    setReviewMode(true);
    setReviewIndex(0);
  };

  const exitReview = () => {
    setReviewMode(false);
    setReviewIndex(0);
  };

  // Assigned-leads / review-progress summary, driven by the same data the
  // server's launch gate checks — so the button and the 400 never disagree.
  const allTags = useMemo(() => {
    const set = new Set();
    leads.forEach((l) => (l.tags || []).forEach((t) => set.add(t)));
    return [...set].sort();
  }, [leads]);

  const listLeadIds = useMemo(() => {
    if (!selectedListId) return null;
    const list = leadLists.find((l) => l.id === selectedListId);
    return list ? new Set(list.lead_ids || []) : null;
  }, [selectedListId, leadLists]);

  const filteredLeads = useMemo(() => {
    return leads.filter((l) => {
      if (leadSearch) {
        const q = leadSearch.toLowerCase();
        const match = [l.first_name, l.last_name, l.company, l.email, l.title].some((f) => f?.toLowerCase().includes(q));
        if (!match) return false;
      }
      if (listLeadIds && !listLeadIds.has(l.id)) return false;
      if (selectedTags.length > 0) {
        const leadTags = new Set(l.tags || []);
        if (!selectedTags.some((t) => leadTags.has(t))) return false;
      }
      return true;
    });
  }, [leads, leadSearch, listLeadIds, selectedTags]);

  const leadStats = useMemo(() => {
    const total = campaignLeads.length;
    const approved = campaignLeads.filter((l) => l.email_status === "approved").length;
    const rejected = campaignLeads.filter((l) => l.email_status === "rejected").length;
    const draft = campaignLeads.filter((l) => l.personalized && l.email_status === "draft").length;
    const ungenerated = total - approved - rejected - draft;
    const reviewed = approved + rejected;
    return { total, approved, rejected, draft, ungenerated, reviewed, canLaunch: total > 0 && reviewed === total };
  }, [campaignLeads]);

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
        body_html: sanitizeEmailHtml(rest.body_html || rest.body || ""),
        body_text: htmlToText(rest.body_html || "") || rest.body || "",
      }));
      const payload = { name, goal, steps: cleanSteps, lead_ids: selectedLeads, signature_id: signatureId || null, send_window_start: sendWindowStart, send_window_end: sendWindowEnd, timezone };
      let cid = id;
      if (!cid) {
        const { data } = await api.post("/campaigns", payload);
        cid = data.id;
      } else {
        await api.put(`/campaigns/${id}`, payload);
      }
      if (cid && selectedLeads.length > 0) {
        try {
          const engine = await api.post(`/campaigns/${cid}/run-engine`);
          if (engine.data.job_id) {
            toast.success(`Generating emails for ${engine.data.generating} leads in background`);
            const poll = setInterval(async () => {
              try {
                const st = await api.get(`/campaigns/${cid}/generation-status`);
                const job = Object.values(st.data.jobs)[0];
                if (!job) { clearInterval(poll); return; }
                if (job.status === "complete") {
                  clearInterval(poll);
                  loadCampaignLeads();
                  setReviewMode(true);
                  setReviewIndex(0);
                  toast.success(`Generated ${job.done} emails`);
                }
              } catch { clearInterval(poll); }
            }, 3000);
          } else {
            loadCampaignLeads();
            setReviewMode(true);
            setReviewIndex(0);
            toast.success(`Saved — emails ready`);
          }
        } catch (err) {
          toast.warning("Saved, but email generation failed: " + (err?.response?.data?.detail || err.message));
        }
      } else {
        toast.success("Saved");
      }
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
            className="bg-transparent border-0 border-b border-transparent hover:border-line focus:border-ink focus:outline-none font-display font-semibold text-page-title w-full" />
        }
        subtitle={`Goal: ${goal}`}
        badge="EQ Editor"
        right={
          <div className="flex gap-2">
            <button data-testid="save-campaign" onClick={save} disabled={busy} className="btn-secondary"><Save size={14} /> Save</button>
            <button
              data-testid="launch-campaign"
              onClick={launch}
              disabled={busy || !id || !leadStats.canLaunch}
              title={leadStats.canLaunch ? "" : `${leadStats.reviewed} of ${leadStats.total} leads reviewed — approve or reject every lead before launching`}
              className="btn-primary"
            >
              <Play size={14} /> Launch
            </button>
          </div>
        }
      />
      {id && leadStats.total > 0 && (
        <div className="px-4 sm:px-6 pt-4 flex items-center gap-4 flex-wrap" data-testid="assigned-leads-stat">
          <div className="flex items-baseline gap-2">
            <span className="ui-label">Assigned Leads</span>
            <span className="font-mono text-2xl font-bold">{leadStats.total}</span>
          </div>
          <div className="flex items-center gap-2 text-caption font-mono">
            {leadStats.approved > 0 && <span className="text-success">{leadStats.approved} approved</span>}
            {leadStats.rejected > 0 && <span className="text-danger">{leadStats.rejected} rejected</span>}
            {leadStats.draft > 0 && <span className="text-warning">{leadStats.draft} draft</span>}
            {leadStats.ungenerated > 0 && <span className="text-ink-muted">{leadStats.ungenerated} not generated</span>}
          </div>
          {!leadStats.canLaunch && (
            <span className="text-caption text-ink-muted ml-auto">{leadStats.reviewed}/{leadStats.total} reviewed — approve or reject every lead to unlock Launch</span>
          )}
        </div>
      )}
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
                    <div className="text-tiny font-mono text-ink-muted">day {s.day}</div>
                  </div>
                  <div className="text-body font-medium mt-1 truncate">{s.subject || "(no subject)"}</div>
                  {steps.length > 1 && (
                    <button onClick={(e) => { e.stopPropagation(); removeStep(i); }} data-testid={`remove-step-${i}`} className="text-caption text-ink-muted hover:text-danger mt-2">
                      <Trash2 size={11} className="inline" /> remove
                    </button>
                  )}
                </button>
              </li>
            ))}
          </ol>
          <button onClick={addStep} data-testid="add-step" className="btn-ghost w-full justify-start mt-3 text-sm"><Plus size={14} /> Add step</button>

          <div className="mt-6 pt-4 border-t border-line">
            <div className="ui-label mb-2">Sending Window</div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="form-label">Start</label>
                <input type="time" value={sendWindowStart}
                  onChange={(e) => setSendWindowStart(e.target.value)}
                  className="w-full border border-line px-2 py-1.5 rounded-lg text-caption" />
              </div>
              <div>
                <label className="form-label">End</label>
                <input type="time" value={sendWindowEnd}
                  onChange={(e) => setSendWindowEnd(e.target.value)}
                  className="w-full border border-line px-2 py-1.5 rounded-lg text-caption" />
              </div>
            </div>
            <div className="mt-2">
              <label className="form-label">Timezone</label>
              <input value={timezone} onChange={(e) => setTimezone(e.target.value)}
                className="w-full border border-line px-2 py-1.5 rounded-lg text-caption font-mono"
                placeholder="UTC" />
            </div>
          </div>

          <div className="ui-label mt-6 mb-2">Leads ({selectedLeads.length}/{leads.length})</div>
          {leadLists.length > 0 && (
            <div className="mb-2">
              <select value={selectedListId} onChange={(e) => setSelectedListId(e.target.value)}
                className="w-full border border-line rounded-lg px-2 py-1.5 text-caption font-mono bg-white">
                <option value="">All lists</option>
                {leadLists.map((lst) => (
                  <option key={lst.id} value={lst.id}>{lst.name} ({lst.lead_count || (lst.lead_ids || []).length})</option>
                ))}
              </select>
            </div>
          )}
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {allTags.map((t) => (
                <button key={t} onClick={() => setSelectedTags((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t])}
                  className={`text-tiny px-1.5 py-0.5 rounded-full border ${selectedTags.includes(t) ? "bg-primary/10 border-primary text-primary" : "border-line text-ink-muted hover:border-neutral-300"}`}>
                  {t}
                </button>
              ))}
              {selectedTags.length > 0 && (
                <button onClick={() => setSelectedTags([])} className="text-tiny text-ink-muted hover:text-ink">
                  <X size={10} />
                </button>
              )}
            </div>
          )}
          <div className="relative mb-2">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
            <input value={leadSearch} onChange={(e) => setLeadSearch(e.target.value)}
              placeholder="Search leads..."
              className="w-full border border-line rounded-xl pl-7 pr-3 py-1.5 text-caption font-mono" />
          </div>
          <div className="border border-line rounded-xl max-h-64 overflow-y-auto">
            {filteredLeads.map((l) => (
              <label key={l.id} className="flex items-start gap-2 p-2 border-b border-line last:border-b-0 text-caption cursor-pointer hover:bg-surfacehover">
                <input type="checkbox" className="mt-0.5"
                  checked={selectedLeads.includes(l.id)}
                  onChange={(e) => setSelectedLeads(e.target.checked ? [...selectedLeads, l.id] : selectedLeads.filter((x) => x !== l.id))}
                  data-testid={`lead-check-${l.id}`}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{l.first_name} {l.last_name}</div>
                  <div className="text-ink-muted truncate">{l.company}{l.title ? ` · ${l.title}` : ""}</div>
                  <div className="text-tiny text-ink-disabled font-mono truncate">{l.email}</div>
                  {l.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {l.tags.map((t) => (
                        <span key={t} className="text-tiny font-mono bg-ink/5 text-ink-muted px-1.5 py-0.5 rounded-full">{t}</span>
                      ))}
                    </div>
                  )}
                  {l.campaign_names?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {l.campaign_names.map((cn) => (
                        <span key={cn} className="text-tiny font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">{cn}</span>
                      ))}
                    </div>
                  )}
                </div>
              </label>
            ))}
            {filteredLeads.length === 0 && (
              <div className="text-caption text-ink-muted text-center py-6">No leads match the selected filters</div>
            )}
          </div>
          <button onClick={() => setSelectedLeads(filteredLeads.map((l) => l.id))} className="text-caption text-ink mt-2 hover:underline" data-testid="select-all-leads">Select all</button>
          <button onClick={() => setSelectedLeads([])} className="text-caption text-ink-muted mt-2 hover:underline ml-3" data-testid="deselect-all-leads">Deselect all</button>
          {selectedLeads.length > 0 && (
            <button onClick={save} disabled={busy} className="btn-primary w-full mt-3 text-sm flex items-center justify-center gap-1">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
              Add & Generate ({selectedLeads.length} leads)
            </button>
          )}

        </aside>

        {/* Editor */}
        <section className="col-span-full lg:col-span-6 p-4 sm:p-6 bg-bone space-y-4">
          {reviewMode ? (
            /* REVIEW MODE — replaces editor */
            <div className="shadow-card p-6 sm:p-8 rounded-2xl">
              {(() => {
                const reviewEmails = campaignLeads.filter(l => l.personalized);
                const current = reviewEmails[reviewIndex];
                if (!current) return <div className="text-center py-8 text-body text-ink-muted">No emails to review</div>;
                return (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-line pb-3">
                      <div className="flex items-center gap-3">
                        <span className="text-caption text-ink-muted font-mono">{reviewIndex + 1} / {reviewEmails.length}</span>
                        <span className={`text-caption font-medium ${current.email_status === "approved" ? "text-success" : current.email_status === "rejected" ? "text-danger" : "text-warning"}`}>
                          {current.email_status === "approved" ? "Approved" : current.email_status === "rejected" ? "Rejected" : "Draft"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={prevReview} disabled={reviewIndex === 0} className="btn-ghost text-xs px-2 py-1"><ChevronLeft size={12} /> Prev</button>
                        <button onClick={nextReview} disabled={reviewIndex >= reviewEmails.length - 1} className="btn-ghost text-xs px-2 py-1">Next <ChevronRight size={12} /></button>
                        <button onClick={exitReview} className="btn-ghost text-xs text-ink-muted px-2 py-1">Exit</button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-medium">{current.first_name} {current.last_name}</span>
                        <span className="text-caption text-ink-muted ml-2">{current.company}{current.title ? ` · ${current.title}` : ''}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {current.personalized_opener && (
                          <button onClick={() => setEditingOpener({ leadId: current.id, opener: current.personalized_opener })} className="btn-ghost text-xs flex items-center gap-1">
                            <Edit2 size={11} /> Edit Opener
                          </button>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="ui-label mb-1">Subject</div>
                      <div className="w-full text-body font-semibold border border-line rounded-xl px-3 py-2">{current.email_subject || "(no subject)"}</div>
                    </div>
                    <div>
                      <div className="ui-label mb-1">Body</div>
                      <div className="max-h-80 overflow-y-auto text-body text-ink-secondary whitespace-pre-wrap font-sans leading-relaxed border border-line rounded-xl p-3 bg-white">
                        {current.email_body || current.email_body_html ? (
                          <div dangerouslySetInnerHTML={{ __html: current.email_body_html || current.email_body?.replace(/\n/g, "<br>") || "" }} />
                        ) : (
                          <div className="text-ink-muted italic">No content</div>
                        )}
                      </div>
                    </div>

                    {/* Write from real research */}
                    <div className="shadow-card p-4 rounded-2xl">
                      <div className="flex items-center gap-1.5 mb-2">
                        <FileSearch size={13} className="text-ink" />
                        <div className="text-caption font-semibold">Write from real research</div>
                      </div>
                      <div className="flex items-center gap-2 mb-2">
                        <select
                          value={previewLead?.id || ""}
                          onChange={(e) => setPreviewLeadId(e.target.value)}
                          className="border border-line rounded-lg px-2 py-1 text-caption flex-1 min-w-0"
                        >
                          {leads.length === 0 && <option value="">No leads yet</option>}
                          {leads.map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.first_name} {l.last_name} · {l.company || "—"}
                            </option>
                          ))}
                        </select>
                        <button onClick={writeWithAI} disabled={busy || !leads.length}
                          className="btn-primary text-xs disabled:opacity-50 shrink-0">
                          {chainStep ? <Loader2 size={11} className="animate-spin" /> : <FileSearch size={11} />}
                          {chainStep ? "Writing…" : "Draft with research"}
                        </button>
                      </div>
                      {chainStep && (
                        <div className="flex items-center gap-1 mb-2" data-testid="chain-progress">
                          {CHAIN_STEPS.map((s, i) => {
                            const idx = CHAIN_STEPS.findIndex((x) => x.key === chainStep);
                            const done = chainStep && i < idx;
                            const active = chainStep === s.key;
                            return (
                              <div key={s.key} className="flex items-center gap-1 flex-1">
                                <div className={`flex items-center gap-1 text-tiny font-mono uppercase tracking-wider ${
                                  active ? "text-ink font-semibold" : done ? "text-ink-muted" : "text-ink-disabled"
                                }`}>
                                  {done ? <Check size={9} /> : active ? <Loader2 size={9} className="animate-spin" /> : <span className="w-[9px]" />}
                                  {s.label}
                                </div>
                                {i < CHAIN_STEPS.length - 1 && <div className="flex-1 h-px bg-line" />}
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {draftMeta && (
                        <div className="space-y-1">
                          {draftMeta.has_angle ? (
                            <div className="flex items-start gap-1.5 text-tiny bg-bone border border-line rounded-xl px-2 py-1.5">
                              <Flame size={11} className="text-ink mt-0.5 shrink-0" />
                              <div>
                                <div className="font-medium">{draftMeta.angle?.angle}</div>
                                {draftMeta.angle?.trigger && (
                                  <div className="text-ink-muted mt-0.5">{draftMeta.angle.trigger}</div>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-start gap-1.5 text-tiny bg-warning/10 border border-warning/30 rounded-xl px-2 py-1.5 text-warning">
                              <AlertTriangle size={11} className="mt-0.5 shrink-0" />
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
                            <details className="text-tiny text-ink-muted">
                              <summary className="cursor-pointer hover:text-ink">What the humanise pass changed</summary>
                              <ul className="mt-1 pl-3 list-disc space-y-0.5">
                                {draftMeta.changes.map((c, i) => <li key={i}>{c}</li>)}
                              </ul>
                            </details>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Signature */}
                    <div className="shadow-card p-4 rounded-2xl">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Signature size={13} className="text-ink" />
                        <div className="text-caption font-semibold">Signature</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <select value={signatureId} onChange={(e) => setSignatureId(e.target.value)}
                          className="border border-line rounded-lg px-2 py-1 text-caption flex-1 min-w-0">
                          <option value="">No signature</option>
                          {signatures.map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                        <button onClick={() => setShowSignatureModal(true)} className="btn-ghost text-xs shrink-0" title="New signature">
                          <Plus size={11} />
                        </button>
                        {signatureId && (
                          <button onClick={() => { const s = signatures.find((x) => x.id === signatureId); if (s) deleteSignature(s.id); }}
                            className="btn-ghost text-xs text-danger/70 shrink-0" title="Delete signature">
                            <Trash2 size={11} />
                          </button>
                        )}
                      </div>
                      {signatureId && (() => {
                        const sig = signatures.find((s) => s.id === signatureId);
                        if (!sig) return null;
                        return (
                          <div className="mt-1 text-tiny text-ink-tertiary border-t border-line pt-1"
                            dangerouslySetInnerHTML={{ __html: sig.content_html || sig.content_text || '' }} />
                        );
                      })()}
                    </div>

                    {/* Personalized Emails */}
                    {id && (
                      <div className="shadow-card p-4 rounded-2xl">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-1.5">
                            <Mail size={13} className="text-ink" />
                            <div className="text-caption font-semibold">Personalized Emails</div>
                          </div>
                          <span className="text-caption text-ink-muted">{campaignLeads.filter((l) => l.personalized).length}/{campaignLeads.length}</span>
                        </div>
                        {campaignLeads.length > 0 && (
                          <>
                            <div className="flex items-center gap-1 mb-2">
                              {campaignLeads.some(l => !l.personalized) && (
                                <button onClick={runCampaignEngine} disabled={engineRunning} className="btn-primary text-xs flex items-center gap-1">
                                  {engineRunning ? <Loader2 size={11} className="animate-spin" /> : <Zap size={11} />}
                                  {engineRunning ? "Engine…" : "Generate All"}
                                </button>
                              )}
                              {campaignLeads.some(l => l.personalized && l.email_status !== "approved") && (
                                <button onClick={approveAllEmails} className="btn-secondary text-xs flex items-center gap-1">
                                  <ThumbsUp size={11} />
                                  Approve All
                                </button>
                              )}
                              {campaignLeads.every(l => l.personalized) && campaignLeads.length > 0 && (
                                <button onClick={startReview} className="btn-secondary text-xs flex items-center gap-1">
                                  <Eye size={11} />
                                  Review
                                </button>
                              )}
                            </div>
                            <div className="max-h-48 overflow-y-auto space-y-1">
                              {campaignLeads.map((cl, idx) => (
                                <div key={cl.id} className="flex items-center gap-1.5 px-1 py-1 rounded-lg hover:bg-surfacehover cursor-pointer"
                                  onClick={() => { setReviewIndex(idx); setReviewMode(true); }}>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-caption font-medium truncate">{cl.first_name} {cl.last_name}</div>
                                    <div className="text-tiny text-ink-muted truncate">{cl.company}{cl.title ? ` · ${cl.title}` : ''}</div>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    {cl.personalized ? (
                                      <>
                                        <span className={`text-tiny font-mono ${cl.email_status === "approved" ? "text-success" : cl.email_status === "rejected" ? "text-danger" : "text-warning"}`}>
                                          {cl.email_status === "approved" ? "Approved" : cl.email_status === "rejected" ? "Rejected" : "Draft"}
                                        </span>
                                        {cl.email_status !== "approved" && (
                                          <button onClick={(e) => { e.stopPropagation(); approveEmail(cl.id); }} className="btn-ghost text-success p-0.5" title="Approve"><ThumbsUp size={10} /></button>
                                        )}
                                      </>
                                    ) : (
                                      <button onClick={(e) => { e.stopPropagation(); generateLeadEmail(cl.id); }} disabled={generatingEmail === cl.id} className="btn-primary text-tiny px-1.5 py-0.5">
                                        {generatingEmail === cl.id ? <Loader2 size={9} className="animate-spin" /> : <Zap size={9} />}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {editingOpener && editingOpener.leadId === current.id && (
                      <div className="bg-warning/10 border border-warning/30 rounded-xl p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium text-warning">Edit Personalized Opener</span>
                          <button onClick={() => setEditingOpener(null)} className="btn-ghost text-xs">Cancel</button>
                        </div>
                        <textarea
                          value={editingOpener.opener}
                          onChange={(e) => setEditingOpener({...editingOpener, opener: e.target.value})}
                          className="w-full min-h-[60px] border border-line rounded-lg px-3 py-2 text-input font-mono"
                        />
                        <div className="flex justify-end gap-2 mt-2">
                          <button onClick={() => regenerateOpener(current.id)} className="btn-ghost text-xs flex items-center gap-1">
                            <RotateCw size={11} /> Regenerate
                          </button>
                          <button onClick={() => saveOpener(current.id, editingOpener.opener)} className="btn-primary text-xs flex items-center gap-1">
                            <Check size={11} /> Save Opener
                          </button>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-2 pt-3 border-t border-line">
                      {current.email_status === "approved" ? (
                        <>
                          <span className="btn-ghost text-success flex items-center gap-1 text-xs"><Check size={12} /> Approved</span>
                          <button onClick={() => rejectEmail(current.id)} className="btn-ghost text-danger flex items-center gap-1 text-xs"><Flag size={12} /> Reject</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => approveEmail(current.id)} className="btn-primary text-xs flex items-center gap-1"><Check size={12} /> Approve</button>
                          <button onClick={() => rejectEmail(current.id)} className="btn-ghost text-danger flex items-center gap-1 text-xs"><Flag size={12} /> Reject</button>
                        </>
                      )}
                      <button onClick={() => deleteLeadEmail(current.id)} className="btn-ghost text-xs text-danger ml-auto flex items-center gap-1"><Trash2 size={12} /> Remove</button>
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : (
            /* TEMPLATE EDITOR — normal mode */
            <div className="shadow-card p-6 sm:p-8 rounded-2xl">
              <div className="ui-label mb-2">Subject</div>
              <input
                value={step.subject}
                onChange={(e) => updateStep({ subject: e.target.value })}
                data-testid="editor-subject"
                className="w-full text-card-title font-display font-semibold border-0 border-b border-line py-2 focus:outline-none focus:border-ink bg-transparent"
                placeholder="Quick idea for {{company}}"
              />
              <div className="mt-5 flex items-center justify-between">
                <div className="ui-label">Body</div>
                <div className="flex items-center gap-3">
                  <label className="form-label">day</label>
                  <input type="number" min={0} value={step.day}
                    onChange={(e) => updateStep({ day: Number(e.target.value) })}
                    data-testid="editor-day"
                    className="w-16 border border-line px-2 py-1 text-input rounded-xl font-mono" />
                </div>
              </div>
              <div className="mt-2">
                <RichEmailEditor
                  value={step.body_html || ""}
                  onChange={(html) => updateStep({ body_html: html })}
                  placeholder="Write your email, or research this lead and draft it for you."
                />
              </div>
          </div>
            )}

          {/* Signature modal */}
          {showSignatureModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowSignatureModal(false)}>
              <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                  <div className="text-section font-display font-semibold">Create Signature</div>
                  <button onClick={() => setShowSignatureModal(false)} className="btn-ghost text-xs">Close</button>
                </div>
                <div className="space-y-3">
                  <input value={signatureName} onChange={(e) => setSignatureName(e.target.value)}
                    className="w-full border border-line rounded-xl px-3 py-2 text-input"
                    placeholder="Signature name (e.g. My Standard Signature)" />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input value={sigSenderName} onChange={(e) => setSigSenderName(e.target.value)}
                      className="w-full border border-line rounded-xl px-3 py-2 text-input" placeholder="Your name" />
                    <input value={sigTitle} onChange={(e) => setSigTitle(e.target.value)}
                      className="w-full border border-line rounded-xl px-3 py-2 text-input" placeholder="Title" />
                    <input value={sigCompany} onChange={(e) => setSigCompany(e.target.value)}
                      className="w-full border border-line rounded-xl px-3 py-2 text-input" placeholder="Company" />
                    <input value={sigEmail} onChange={(e) => setSigEmail(e.target.value)}
                      className="w-full border border-line rounded-xl px-3 py-2 text-input" placeholder="Email" />
                    <input value={sigPhone} onChange={(e) => setSigPhone(e.target.value)}
                      className="w-full border border-line rounded-xl px-3 py-2 text-input" placeholder="Phone (optional)" />
                  </div>
                  {(sigSenderName || sigTitle || sigCompany || sigEmail || sigPhone) && (
                    <div className="bg-bone border border-line rounded-xl p-3 text-body">
                      <div className="text-tiny font-mono uppercase text-ink-muted mb-1">Preview</div>
                      <div className="border-t border-line pt-2 mt-1" dangerouslySetInnerHTML={{ __html: buildSignatureHtml() }} />
                    </div>
                  )}
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setShowSignatureModal(false)} className="btn-secondary text-xs">Cancel</button>
                    <button onClick={createSignature} disabled={savingSignature} className="btn-primary text-xs">
                      {savingSignature ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                      Create
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* EQ Panel */}
        <aside className="col-span-full lg:col-span-3 border-l border-line bg-white p-6 sm:p-8">
          <div className="ui-label text-ink">EQ Score</div>
          <div className="font-mono text-3xl sm:text-5xl font-bold tracking-tighter mt-1"
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
                <div className="flex justify-between text-caption">
                  <span className="ui-label">{k}</span>
                  <span className="font-mono text-ink-secondary">{v}</span>
                </div>
                <div className="h-1 mt-1 bg-line rounded-full overflow-hidden">
                  <div className="h-full bg-accent" style={{ width: `${v}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-8 ui-label mb-2">Hints</div>
          <ul className="space-y-2 text-caption text-ink-secondary">
            {eq?.hints?.length ? eq.hints.map((h) => (
              <li key={h} className="border-l-2 border-sanguine pl-2">{h}</li>
            )) : <li className="text-ink-muted">Looking sharp. Send it.</li>}
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
