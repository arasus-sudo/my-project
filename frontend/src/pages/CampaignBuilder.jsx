import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, isCreditError } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import RichEmailEditor, { sanitizeEmailHtml } from "../components/RichEmailEditor";
import { toast } from "sonner";
import {
  FileSearch, Save, Play, Plus, Trash2, Loader2, Check, AlertTriangle, Flame,
  Mail, Eye, ThumbsUp, Signature, Search, Megaphone,
  Zap, ChevronLeft, ChevronRight, ChevronDown,
  Edit2, RotateCw, Flag, List, Tag, X, PenSquare,
  Phone, MessageSquare, Send, MessageCircle,
} from "lucide-react";

const TIMEZONES = [
  "UTC", "US/Eastern", "US/Central", "US/Mountain", "US/Pacific",
  "US/Alaska", "US/Hawaii", "Canada/Atlantic", "Canada/Newfoundland",
  "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Madrid",
  "Europe/Rome", "Europe/Amsterdam", "Europe/Stockholm", "Europe/Moscow",
  "Asia/Almaty", "Asia/Amman", "Asia/Aqtau", "Asia/Aqtobe", "Asia/Ashgabat",
  "Asia/Baghdad", "Asia/Bahrain", "Asia/Baku", "Asia/Bangkok", "Asia/Beirut",
  "Asia/Bishkek", "Asia/Colombo", "Asia/Damascus", "Asia/Dhaka", "Asia/Dili",
  "Asia/Dubai", "Asia/Dushanbe", "Asia/Ho_Chi_Minh", "Asia/Hong_Kong",
  "Asia/Irkutsk", "Asia/Jakarta", "Asia/Jayapura", "Asia/Jerusalem",
  "Asia/Kabul", "Asia/Kamchatka", "Asia/Karachi", "Asia/Kathmandu",
  "Asia/Kolkata", "Asia/Krasnoyarsk", "Asia/Kuala_Lumpur", "Asia/Kuwait",
  "Asia/Macau", "Asia/Magadan", "Asia/Makassar", "Asia/Manila",
  "Asia/Muscat", "Asia/Nicosia", "Asia/Novosibirsk", "Asia/Oral",
  "Asia/Phnom_Penh", "Asia/Pyongyang", "Asia/Qatar", "Asia/Riyadh",
  "Asia/Sakhalin", "Asia/Samarkand", "Asia/Seoul", "Asia/Shanghai",
  "Asia/Singapore", "Asia/Taipei", "Asia/Tashkent", "Asia/Tbilisi",
  "Asia/Tehran", "Asia/Thimphu", "Asia/Tokyo", "Asia/Ulaanbaatar",
  "Asia/Vientiane", "Asia/Vladivostok", "Asia/Yakutsk", "Asia/Yangon",
  "Asia/Yekaterinburg", "Asia/Yerevan",
  "Australia/Sydney", "Australia/Melbourne", "Australia/Perth",
  "Pacific/Auckland", "Pacific/Fiji", "America/Sao_Paulo",
  "America/Mexico_City", "America/Argentina/Buenos_Aires",
  "Africa/Cairo", "Africa/Lagos", "Africa/Johannesburg",
];

const stepKey = () => `s_${Math.random().toString(36).slice(2, 10)}`;

const CHANNELS = [
  { key: "email", label: "Email" },
  { key: "phone_call", label: "Phone Call" },
  { key: "sms", label: "SMS" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "linkedin_connect", label: "LinkedIn Connect" },
  { key: "linkedin_message", label: "LinkedIn Message" },
  { key: "linkedin_comment", label: "LinkedIn Comment" },
];

const DEFAULT_STEP = () => ({
  _key: stepKey(),
  channel: "email",
  day: 0,
  subject: "Quick idea for {{company}}",
  body_html: "<p>Hi {{first_name}},</p><p>Noticed {{company}} — worth 15 minutes to compare notes?</p>",
  body: "Hi {{first_name}},\n\nNoticed {{company}} — worth 15 minutes to compare notes?",
  script: "",
  agent_id: null,
  linkedin_message: "",
  linkedin_comment_text: "",
  linkedin_post_url: "",
  linkedin_connection_note: "",
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
  const [selectFromAll, setSelectFromAll] = useState(false);
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
  const [campaignType, setCampaignType] = useState("ai"); // "ai" or "template"
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [signatureName, setSignatureName] = useState("");
  const [signatureHtml, setSignatureHtml] = useState("");
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
  const [genJobId, setGenJobId] = useState("");
  // Shared by every generation entry point (save / run-engine / add-leads) so
  // Preview always shows accurate live progress instead of a bare "no emails
  // yet" dead end while a background job is still writing them.
  const [genProgress, setGenProgress] = useState(null); // {done, total} | null when idle
  const [selectedReview, setSelectedReview] = useState([]); // lead ids checked in the review rail
  const [sendingTest, setSendingTest] = useState(false);
  const [regeneratingAll, setRegeneratingAll] = useState(false);
  const [batchSize, setBatchSize] = useState(10);
  const [phasedGeneration, setPhasedGeneration] = useState(false);
  const [batchStatus, setBatchStatus] = useState(null);
  const [advancingBatch, setAdvancingBatch] = useState(false);
  const [showEqPanel, setShowEqPanel] = useState(true);

  // Track actual campaign ID — may differ from useParams id when creating new
  const [activeCampaignId, setActiveCampaignId] = useState(id);
  useEffect(() => { setActiveCampaignId(id); }, [id]);

  const loadCampaignLeads = (overrideId) => {
    const cid = overrideId || activeCampaignId || id;
    if (!cid) return;
    api.get(`/campaigns/${cid}/leads`).then((r) => setCampaignLeads(r.data.leads || [])).catch(() => {});
  };

  // Select first N leads — from current filtered view or from ALL matching leads
  const selectFirstN = async (inputEl) => {
    if (!inputEl) return;
    const n = parseInt(inputEl.value, 10);
    if (!n || n < 1) return;
    if (!selectFromAll) {
      setSelectedLeads(filteredLeads.slice(0, n).map((l) => l.id));
      return;
    }
    try {
      const params = {};
      if (leadSearch) params.search = leadSearch;
      if (selectedListId) params.list_id = selectedListId;
      if (selectedTags.length > 0) params.tags = selectedTags.join(",");
      const { data } = await api.get("/leads/all-ids", { params });
      setSelectedLeads((data.ids || []).slice(0, n));
    } catch {
      setSelectedLeads(filteredLeads.slice(0, n).map((l) => l.id));
    }
  };



  useEffect(() => {
    api.get("/leads?page_size=2000").then((r) => setLeads(r.data.items || r.data));
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
        setBatchSize(c.batch_size || 10);
        setPhasedGeneration(c.phased_generation || false);
      });
      loadCampaignLeads();
      api.get(`/campaigns/${id}/batch-status`).then((r) => setBatchStatus(r.data)).catch(() => {});
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
  const createSignature = async () => {
    if (!signatureName.trim()) { toast.error("Name is required"); return; }
    if (!signatureHtml.trim()) { toast.error("Signature content is required"); return; }
    setSavingSignature(true);
    try {
      const txt = signatureHtml.replace(/<[^>]+>/g, '').trim();
      const { data } = await api.post("/signatures", { name: signatureName, content_html: signatureHtml, content_text: txt });
      setSignatures((prev) => [data, ...prev]);
      setSignatureId(data.id);
      setShowSignatureModal(false);
      setSignatureName(""); setSignatureHtml("");
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

  // Shared by every generation trigger below: polls generation-status until
  // the job completes, keeping `genProgress` live so Preview can render a
  // real "N/M generated" bar instead of dropping into review mode before any
  // email actually exists.
  const pollGeneration = (cid, jobId, generating) => {
    setGenJobId(jobId);
    setGenProgress({ done: 0, total: generating || 0 });
    setReviewMode(true);
    setReviewIndex(0);
    const poll = setInterval(async () => {
      try {
        const st = await api.get(`/campaigns/${cid}/generation-status`);
        const allJobs = Object.values(st.data.jobs);
        const running = allJobs.find((j) => j.status === "running");
        const job = running || allJobs[allJobs.length - 1] || null;
        if (!job) { clearInterval(poll); setGenProgress(null); setEngineRunning(false); return; }
        setGenProgress({ done: job.done || 0, total: job.total || generating || 0 });
        loadCampaignLeads(cid);
        if (job.status === "complete") {
          clearInterval(poll);
          setGenProgress(null);
          setEngineRunning(false);
          loadCampaignLeads(cid);
          refreshBatchStatus();
          toast.success(`Generated ${job.done} email${job.done === 1 ? "" : "s"}`);
        }
      } catch { clearInterval(poll); setGenProgress(null); setEngineRunning(false); }
    }, 3000);
  };

  // Add selected panel leads to campaign and auto-generate emails
  const addSelectedToCampaign = async () => {
    const cid = activeCampaignId || id;
    if (!cid || selectedPanelLeads.length === 0) return;
    try {
      const { data } = await api.post(`/campaigns/${cid}/leads/batch`, { lead_ids: selectedPanelLeads });
      if (data.added === 0) {
        toast.info("Leads already in campaign");
        return;
      }
      toast.success(`Added ${data.added} lead${data.added === 1 ? '' : 's'} — generating emails...`);
      const campaign = await api.get(`/campaigns/${cid}`);
      setSelectedLeads(campaign.data.lead_ids || []);
      loadCampaignLeads(cid);
      const engine = await api.post(`/campaigns/${cid}/run-engine`);
      if (engine.data.job_id) {
        pollGeneration(cid, engine.data.job_id, engine.data.generating);
      } else {
        toast.success(`Generated ${engine.data.generated || 0} personalized emails`);
        loadCampaignLeads(cid);
        setReviewMode(true);
        setReviewIndex(0);
      }
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

  // Multi-select bulk approve/reject — the counterpart to Approve all for
  // when only some of the batch is ready to go.
  const bulkSetReviewStatus = async (status) => {
    if (!id || selectedReview.length === 0) return;
    try {
      const { data } = await api.post(`/campaigns/${id}/leads/bulk-status`, { lead_ids: selectedReview, status });
      toast.success(`${data.updated} email(s) ${status}`);
      setSelectedReview([]);
      loadCampaignLeads();
    } catch { toast.error(`Bulk ${status} failed`); }
  };

  const toggleReviewSelected = (leadId) => {
    setSelectedReview((prev) => prev.includes(leadId) ? prev.filter((x) => x !== leadId) : [...prev, leadId]);
  };

  const sendTestEmail = async (leadId) => {
    if (!id) return;
    setSendingTest(true);
    try {
      const { data } = await api.post(`/campaigns/${id}/leads/${leadId}/send-test`);
      toast.success(data.mocked ? `Test recorded (no mailbox connected — see Mailboxes)` : `Test sent to ${data.sent_to}`);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Test send failed");
    } finally {
      setSendingTest(false);
    }
  };

  // "Start over" regeneration — unlike generate-all (which skips leads that
  // already have a draft), this reprocesses every assigned lead, for when
  // the template changed and existing drafts are stale.
  const regenerateAllEmails = async () => {
    if (!id) return;
    setRegeneratingAll(true);
    try {
      const { data } = await api.post(`/campaigns/${id}/leads/regenerate-all`);
      toast.success(`Regenerated ${data.generated} email(s)`);
      if (data.errors?.length) console.warn("Regenerate errors:", data.errors);
      loadCampaignLeads();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Regenerate-all failed");
    } finally {
      setRegeneratingAll(false);
    }
  };

  // Run Campaign Engine - generates personalized openers for all leads
  const runCampaignEngine = async () => {
    const cid = activeCampaignId || id;
    if (!cid) return;
    setEngineRunning(true);
    try {
      const { data } = await api.post(`/campaigns/${cid}/run-engine`);
      if (data.job_id) {
        toast.success(`Generating emails for ${data.generating} leads in background`);
        pollGeneration(cid, data.job_id, data.generating);
      } else {
        toast.success(`Campaign engine processed ${data.generated} emails`);
        loadCampaignLeads(cid);
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

  // Review navigation — every assigned lead is previewable (the backend
  // resolves merge fields against the raw template even before any AI
  // generation runs), not just leads that have already been personalized.
  const getReviewEmails = () => campaignLeads;

  const nextReview = () => {
    const emails = getReviewEmails();
    if (reviewIndex < emails.length - 1) setReviewIndex(reviewIndex + 1);
  };

  const prevReview = () => {
    if (reviewIndex > 0) setReviewIndex(reviewIndex - 1);
  };

  // Assigned-leads / review-progress summary, driven by the same data the
  // server's launch gate checks — so the button and the 400 never disagree.
  const allTags = useMemo(() => {
    const set = new Set();
    leads.forEach((l) => {
      const tags = Array.isArray(l.tags) ? l.tags : [];
      tags.forEach((t) => set.add(t));
    });
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
        // No tone override here — the backend falls back to the workspace's
        // real Brand Voice tone (Settings → Brand voice) instead of a
        // hardcoded value that ignored whatever the user configured.
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
      const payload = { name, goal, campaign_type: campaignType, steps: cleanSteps, lead_ids: selectedLeads, signature_id: signatureId || null, send_window_start: sendWindowStart, send_window_end: sendWindowEnd, timezone, batch_size: batchSize, phased_generation: phasedGeneration };
      let cid = activeCampaignId || id;
      if (!cid) {
        const { data } = await api.post("/campaigns", payload);
        cid = data.id;
        setActiveCampaignId(cid);
        window.history.replaceState(null, "", `/app/campaigns/${cid}`);
      } else {
        await api.put(`/campaigns/${cid}`, payload);
      }
      if (cid && selectedLeads.length > 0) {
        try {
          const engine = await api.post(`/campaigns/${cid}/run-engine`);
          if (engine.data.job_id) {
            toast.success(`Generating emails for ${engine.data.generating} leads in background`);
            pollGeneration(cid, engine.data.job_id, engine.data.generating);
          } else {
            loadCampaignLeads(cid);
            setReviewMode(true);
            setReviewIndex(0);
            toast.success(`Saved — emails ready`);
          }
        } catch (err) {
          toast.warning("Saved, but email generation failed: " + (err?.response?.data?.detail || err.message));
        }
        api.get(`/campaigns/${cid}/batch-status`).then((r) => setBatchStatus(r.data)).catch(() => {});
      } else {
        toast.success("Saved");
      }
    } catch { toast.error("Save failed"); }
    finally { setBusy(false); }
  };

  const launch = async (skipPending) => {
    const cid = activeCampaignId || id;
    if (!cid) { toast.error("Save first"); return; }
    if (skipPending === undefined && !leadStats.canLaunch && leadStats.approved > 0) {
      toast.info(`Send to ${leadStats.approved} approved leads only?`, {
        description: `${leadStats.total - leadStats.approved} leads need review and will be skipped`,
        action: { label: "Send approved only", onClick: () => launch(true) },
        duration: 10000,
      });
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post(`/campaigns/${cid}/launch${skipPending ? "?skip_pending=true" : ""}`);
      toast.success(`Launched — ${data.queued} email${data.queued === 1 ? "" : "s"} queued`, {
        description: "They go out inside your sending window, spread across your mailboxes.",
      });
      nav("/app/campaigns");
    } catch (err) {
      console.error("Launch error:", err);
      toast.error(err?.response?.data?.detail || err?.message || "Launch failed", {
        action: { label: "Mailboxes", onClick: () => nav("/app/mailboxes") },
      });
    } finally { setBusy(false); }
  };

  const advanceBatch = async () => {
    const cid = activeCampaignId || id;
    if (!cid) return;
    setAdvancingBatch(true);
    try {
      const { data } = await api.post(`/campaigns/${cid}/advance-batch`);
      if (data.advanced) {
        toast.success(`Advanced to batch ${data.batch} — generating emails for ${data.generating} leads`);
        if (data.job_id) pollGeneration(cid, data.job_id, data.generating);
        api.get(`/campaigns/${cid}/batch-status`).then((r) => setBatchStatus(r.data)).catch(() => {});
        loadCampaignLeads(cid);
      } else {
        toast.info(data.message);
        api.get(`/campaigns/${cid}/batch-status`).then((r) => setBatchStatus(r.data)).catch(() => {});
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to advance batch");
    } finally { setAdvancingBatch(false); }
  };

  const refreshBatchStatus = () => {
    const cid = activeCampaignId || id;
    if (!cid) return;
    api.get(`/campaigns/${cid}/batch-status`).then((r) => setBatchStatus(r.data)).catch(() => {});
  };

  const batchApproved = (bs, bn) => { const b = bs.batches?.[bn]; return b ? b.approved : 0; };
  const batchTotal = (bs, bn) => { const b = bs.batches?.[bn]; return b ? b.total : 0; };

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
              data-testid="toggle-preview"
              onClick={() => setReviewMode((v) => !v)}
              disabled={leadStats.total === 0}
              title={leadStats.total === 0 ? "Add at least one lead to preview generated emails" : ""}
              className="btn-secondary"
            >
              {reviewMode ? <><PenSquare size={14} /> Edit template</> : <><Eye size={14} /> Preview</>}
            </button>
            <button
              data-testid="launch-campaign"
              onClick={launch}
              disabled={busy || !id || leadStats.approved === 0}
              title={leadStats.approved === 0 ? "Approve at least one lead before launching" : ""}
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
            <span className="text-section font-display font-bold">{leadStats.total}</span>
          </div>
          <div className="flex items-center gap-2 text-caption font-mono">
            {leadStats.approved > 0 && <span className="text-success">{leadStats.approved} approved</span>}
            {leadStats.rejected > 0 && <span className="text-danger">{leadStats.rejected} rejected</span>}
            {leadStats.draft > 0 && <span className="text-warning">{leadStats.draft} draft</span>}
            {leadStats.ungenerated > 0 && <span className="text-ink-muted">{leadStats.ungenerated} not generated</span>}
          </div>
          {leadStats.approved > 0 && !leadStats.canLaunch && (
            <span className="text-caption text-ink-muted ml-auto">Launch will send to {leadStats.approved} approved leads (skipping {leadStats.total - leadStats.approved} unapproved)</span>
          )}
          {leadStats.approved === 0 && !leadStats.canLaunch && (
            <span className="text-caption text-ink-muted ml-auto">{leadStats.reviewed}/{leadStats.total} reviewed — approve at least one lead to launch</span>
          )}
        </div>
      )}
      {/* Campaign Type Toggle */}
      <div className="px-4 sm:px-6 pt-3 pb-2 flex items-center gap-4">
        <div className="ui-label shrink-0">Campaign type</div>
        <div className="flex items-center gap-1 bg-bone border border-line rounded-xl p-0.5">
          <button onClick={() => setCampaignType("ai")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${campaignType === "ai" ? "bg-ink text-white shadow-sm" : "text-ink-muted hover:text-ink"}`}>
            AI Campaign <span className="text-tiny opacity-70">(personal openers)</span>
          </button>
          <button onClick={() => setCampaignType("template")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${campaignType === "template" ? "bg-ink text-white shadow-sm" : "text-ink-muted hover:text-ink"}`}>
            Template <span className="text-tiny opacity-70">(basic merge fields)</span>
          </button>
        </div>
      </div>

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
                  className={`w-full text-left p-3 border transition-colors duration-150 ${i === activeStep ? "border-ink bg-surfacehover" : "border-line hover:bg-surfacehover"} rounded-xl`}
                >
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-1.5">
                      {(() => {
                        const ch = s.channel || "email";
                        const icons = { email: <Mail size={12} />, phone_call: <Phone size={12} />, sms: <MessageSquare size={12} />, whatsapp: <MessageCircle size={12} />, linkedin_connect: <Send size={12} />, linkedin_message: <Send size={12} />, linkedin_comment: <MessageCircle size={12} /> };
                        return <span className="text-ink-muted">{icons[ch] || <Mail size={12} />}</span>;
                      })()}
                      <div className="ui-label">Step {i + 1}</div>
                    </div>
                    <div className="text-tiny font-mono text-ink-muted">day {s.day}</div>
                  </div>
                  <div className="text-body font-medium mt-1 truncate">{s.subject || CHANNELS.find(c => c.key === (s.channel || "email"))?.label || "Email"}</div>
                  {steps.length > 1 && (
                    <button onClick={(e) => { e.stopPropagation(); removeStep(i); }} data-testid={`remove-step-${i}`} className="text-caption text-ink-muted hover:text-danger mt-2">
                      <Trash2 size={12} className="inline" /> remove
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
        <div className="relative">
          <select value={timezone} onChange={(e) => setTimezone(e.target.value)}
            className="w-full border border-line px-2 py-1.5 rounded-lg text-caption font-mono appearance-none pr-8">
            {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 text-ink-muted pointer-events-none" size={14} />
        </div>
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
                  <X size={12} />
                </button>
              )}
            </div>
          )}
          <div className="relative mb-2">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
            <input value={leadSearch} onChange={(e) => setLeadSearch(e.target.value)}
              placeholder="Search leads..."
              className="w-full border border-line rounded-xl pl-7 pr-3 py-1.5 text-caption font-mono" />
          </div>
          <div className="border border-line rounded-xl max-h-64 overflow-y-auto">
            {filteredLeads.map((l) => (
              <label key={l.id} className="flex items-start gap-2 p-2 border-b border-line last:border-b-0 text-caption cursor-pointer hover:bg-surfacehover transition-colors duration-150">
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
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <button onClick={() => setSelectedLeads(filteredLeads.map((l) => l.id))} className="text-caption text-ink hover:underline" data-testid="select-all-leads">Select all</button>
            <button onClick={() => setSelectedLeads([])} className="text-caption text-ink-muted hover:underline" data-testid="deselect-all-leads">Deselect all</button>
            <span className="text-tiny text-ink-muted">|</span>
            <input type="number" min={1} placeholder="N"
              data-testid="select-n-input"
              className="w-14 border border-line rounded px-1.5 py-0.5 text-tiny text-center"
              onKeyDown={(e) => { if (e.key === "Enter") selectFirstN(e.target); }} />
            <button onClick={() => selectFirstN(document.querySelector('[data-testid="select-n-input"]'))}
              className="text-tiny text-ink-muted hover:text-ink hover:underline">Select</button>
            <label className="flex items-center gap-1 text-tiny text-ink-muted cursor-pointer ml-1">
              <input type="checkbox" checked={selectFromAll} onChange={(e) => setSelectFromAll(e.target.checked)} className="w-3 h-3" />
              All matching
            </label>
          </div>
          {selectedLeads.length > 0 && (
            <button onClick={save} disabled={busy} className="btn-primary w-full mt-3 text-sm flex items-center justify-center gap-1">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
              Add & Generate ({selectedLeads.length} leads)
            </button>
          )}

          {/* Phased generation config */}
          {leadStats.total > 0 && (
            <div className="mt-4 p-3 bg-bone rounded-2xl border border-line space-y-2">
              <label className="flex items-center gap-2 text-caption font-medium cursor-pointer">
                <input type="checkbox" checked={phasedGeneration}
                  onChange={(e) => setPhasedGeneration(e.target.checked)} className="w-3.5 h-3.5" />
                Phased generation
              </label>
              {phasedGeneration && (
                <div className="space-y-2 ml-5">
                  <label className="flex items-center gap-2 text-tiny text-ink-muted">
                    <span>Batch size:</span>
                    <input type="number" min={1} max={500} value={batchSize}
                      onChange={(e) => setBatchSize(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      className="w-16 border border-line rounded px-1.5 py-0.5 text-tiny text-center" />
                  </label>
                  {batchStatus && batchStatus.phased && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-tiny">
                        <span className="text-ink-muted">Batch {batchStatus.current_batch}/{batchStatus.total_batches}</span>
                        <span className="text-ink-muted">
                          {Object.values(batchStatus.batches || {}).reduce((s, b) => s + b.approved, 0)}/{batchStatus.total_leads} approved
                        </span>
                      </div>
                      <div className="w-full bg-line rounded-full h-1.5 overflow-hidden">
                        <div className="bg-primary h-full rounded-full transition-all duration-300"
                          style={{ width: `${batchStatus.total_leads > 0 ? (Object.values(batchStatus.batches || {}).reduce((s, b) => s + b.approved, 0) / batchStatus.total_leads) * 100 : 0}%` }} />
                      </div>
                      {!batchStatus.all_batches_complete && batchApproved(batchStatus, batchStatus.current_batch) >= batchTotal(batchStatus, batchStatus.current_batch) && (
                        <button onClick={advanceBatch} disabled={advancingBatch}
                          className="text-xs text-primary hover:underline flex items-center gap-1">
                          {advancingBatch ? <Loader2 size={12} className="animate-spin" /> : <ChevronRight size={12} />}
                          Generate next batch ({batchStatus.current_batch + 1}/{batchStatus.total_batches})
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

        </aside>

        {/* Editor */}
        {/* Main editor/review */}
        <section className={`col-span-full ${showEqPanel ? "lg:col-span-6" : "lg:col-span-9"} p-4 sm:p-6 bg-bone space-y-4 relative`}>
          {!showEqPanel && (
            <button onClick={() => setShowEqPanel(true)}
              className="absolute top-4 right-4 w-5 h-5 flex items-center justify-center rounded hover:bg-white/50 text-ink-muted hover:text-ink transition-colors z-10"
              title="Show EQ panel">
              <ChevronLeft size={14} />
            </button>
          )}
          {reviewMode ? (
            /* REVIEW MODE — split pane: template left, generated email right */
            <div className="space-y-3">
              {campaignLeads.length > 0 && (
                <div className="shadow-card rounded-2xl bg-white">
                  <div className="flex items-center justify-between gap-2 px-4 py-2.5 flex-wrap">
                    <div className="text-caption text-ink-muted">
                      <span className="font-medium text-ink">{leadStats.approved}</span> approved · {" "}
                      <span className="font-medium text-ink">{leadStats.rejected}</span> rejected · {" "}
                      <span className="font-medium text-ink">{leadStats.total - leadStats.reviewed}</span> awaiting review
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={regenerateAllEmails} disabled={regeneratingAll || leadStats.total === 0} className="btn-ghost text-xs" data-testid="regenerate-all-emails">
                        {regeneratingAll ? <Loader2 size={12} className="animate-spin" /> : <RotateCw size={12} />} Regenerate all
                      </button>
                      <button onClick={approveAllEmails} disabled={leadStats.total === 0} className="btn-secondary text-xs" data-testid="approve-all-emails">
                        <Check size={12} /> Approve all
                      </button>
                    </div>
                  </div>
                  {selectedReview.length > 0 && (
                    <div className="flex items-center gap-2 px-4 py-2 border-t border-line bg-accent-soft/40">
                      <span className="text-caption font-medium">{selectedReview.length} selected</span>
                      <button onClick={() => bulkSetReviewStatus("approved")} className="btn-primary text-xs ml-auto" data-testid="bulk-approve">
                        <Check size={12} /> Approve selected
                      </button>
                      <button onClick={() => bulkSetReviewStatus("rejected")} className="btn-ghost text-xs text-danger" data-testid="bulk-reject">
                        <Flag size={12} /> Reject selected
                      </button>
                      <button onClick={() => setSelectedReview([])} className="btn-ghost text-xs text-ink-muted">Clear</button>
                    </div>
                  )}
                </div>
              )}
              <div className={`grid grid-cols-1 gap-4 h-full ${showEqPanel ? "lg:grid-cols-[200px_1fr_1fr]" : "lg:grid-cols-[180px_1fr_2fr]"}`}>
              {(() => {
                const reviewEmails = getReviewEmails();
                const current = reviewEmails[reviewIndex];
                const template = steps[activeStep] || steps[0] || {};
                const rail = reviewEmails.length > 0 && (
                  <div className="shadow-card rounded-2xl bg-white overflow-hidden flex flex-col max-h-[calc(100vh-280px)]">
                    <div className="p-3 border-b border-line flex items-center justify-between">
                      <span className="ui-label">Leads</span>
                      <input type="checkbox"
                        checked={selectedReview.length === reviewEmails.length}
                        onChange={(e) => setSelectedReview(e.target.checked ? reviewEmails.map((l) => l.id) : [])}
                        title="Select all" />
                    </div>
                    <div className="overflow-y-auto flex-1">
                      {reviewEmails.map((l, i) => (
                        <div key={l.id}
                          className={`flex items-center gap-2 px-3 py-2 border-b border-line cursor-pointer hover:bg-surfacehover transition-colors ${i === reviewIndex ? "bg-accent-soft" : ""}`}
                          onClick={() => setReviewIndex(i)}>
                          <input type="checkbox" onClick={(e) => e.stopPropagation()}
                            checked={selectedReview.includes(l.id)} onChange={() => toggleReviewSelected(l.id)} />
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${l.email_status === "approved" ? "bg-success" : l.email_status === "rejected" ? "bg-danger" : l.personalized ? "bg-warning" : "bg-ink-disabled"}`} />
                          <span className="text-caption truncate flex-1">{l.first_name} {l.last_name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
                if (!current) return (
                  <>
                    {rail}
                    <div className="lg:col-span-2 shadow-card rounded-2xl bg-white p-12 text-center">
                    {genProgress ? (
                      <>
                        <Loader2 size={22} className="animate-spin mx-auto text-ink-muted mb-3" />
                        <div className="text-body font-medium">
                          Generating personalized emails… {genProgress.done}/{genProgress.total || "?"}
                        </div>
                        <div className="text-caption text-ink-muted mt-1">This updates live — no need to refresh.</div>
                        {genProgress.total > 0 && (
                          <div className="h-1.5 max-w-xs mx-auto mt-4 bg-line rounded-full overflow-hidden">
                            <div className="h-full bg-accent transition-all duration-500" style={{ width: `${Math.min(100, (genProgress.done / genProgress.total) * 100)}%` }} />
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <Mail size={22} className="mx-auto text-ink-disabled mb-3" />
                        <div className="text-body font-medium text-ink-muted">
                          {leadStats.total === 0 ? "No leads assigned yet" : "Select a lead to preview"}
                        </div>
                        <p className="text-caption text-ink-muted mt-1 max-w-sm mx-auto">
                          {leadStats.total === 0
                            ? "Assign leads from the sidebar — every lead previews with your template's merge fields filled in, even before you generate."
                            : "Pick a lead from the list on the left to see its preview."}
                        </p>
                      </>
                    )}
                    </div>
                  </>
                );
                return (
                  <>
                    {rail}
                    {/* LEFT: Template with placeholders */}
                    <div className="shadow-card rounded-2xl bg-white">
                      <div className="p-4 border-b border-line flex items-center justify-between">
                        <div className="ui-label">Template</div>
                        <span className="text-tiny text-ink-muted font-mono">{reviewIndex + 1} / {reviewEmails.length}</span>
                      </div>
                      <div className="p-4 space-y-3 max-h-[calc(100vh-280px)] overflow-y-auto">
                        <div>
                          <div className="text-tiny text-ink-muted mb-1 font-mono">SUBJECT</div>
                          <div className="text-caption font-semibold font-mono text-ink-secondary">{template.subject || "(no subject)"}</div>
                        </div>
                        <div>
                          <div className="text-tiny text-ink-muted mb-1 font-mono">BODY</div>
                          <div className="text-caption text-ink-secondary whitespace-pre-wrap font-sans leading-relaxed border border-line rounded-xl p-3 bg-bone">
                            {template.body_html ? (
                              <div className="prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: template.body_html.replace(/\{\{personalized_opener\}\}/g, '<mark class="bg-warning/20 text-warning px-0.5 rounded">{{personalized_opener}}</mark>') }} />
                            ) : (
                              <div className="whitespace-pre-wrap font-mono text-sm text-ink-secondary leading-relaxed">{template.body}</div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 pt-2 border-t border-line">
                          <button onClick={prevReview} disabled={reviewIndex === 0} className="btn-ghost text-xs px-2 py-1"><ChevronLeft size={12} /> Prev</button>
                          <button onClick={nextReview} disabled={reviewIndex >= reviewEmails.length - 1} className="btn-ghost text-xs px-2 py-1">Next <ChevronRight size={12} /></button>
                        </div>
                      </div>
                    </div>

                    {/* RIGHT: Generated email preview + controls */}
                    <div className="shadow-card rounded-2xl bg-white">
                      <div className="p-4 border-b border-line flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-medium truncate max-w-[140px]">{current.first_name} {current.last_name}</span>
                          <span className={`text-tiny font-mono px-1.5 py-0.5 rounded-full shrink-0 ${current.email_status === "approved" ? "bg-success/10 text-success" : current.email_status === "rejected" ? "bg-danger/10 text-danger" : "bg-warning/10 text-warning"}`}>
                            {current.email_status === "approved" ? "Approved" : current.email_status === "rejected" ? "Rejected" : "Draft"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                          <button onClick={() => sendTestEmail(current.id)} disabled={sendingTest} className="btn-ghost text-xs flex items-center gap-1" data-testid="send-test-email" title="Email this exact preview to yourself">
                            {sendingTest ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Send test
                          </button>
                          {editingOpener?.leadId === current.id ? (
                            <button onClick={() => setEditingOpener(null)} className="btn-ghost text-xs"><X size={12} /> Cancel</button>
                          ) : (
                            <button onClick={() => setEditingOpener({ leadId: current.id, opener: current.personalized_opener })} className="btn-ghost text-xs flex items-center gap-1">
                              <Edit2 size={12} /> {current.personalized_opener ? "Opener" : "Add opener"}
                            </button>
                          )}
                          <button onClick={() => regenerateOpener(current.id)} disabled={generatingEmail === current.id} className="btn-ghost text-xs flex items-center gap-1">
                            <RotateCw size={12} className={generatingEmail === current.id ? "animate-spin" : ""} /> {current.personalized ? "Regenerate" : "Generate with AI"}
                          </button>
                        </div>
                      </div>
                      <div className="p-4 space-y-3 max-h-[calc(100vh-280px)] overflow-y-auto">
                        {/* Opener editing — available even before any AI generation has
                            run, so a user can write/edit it by hand and immediately see
                            an approvable draft without spending a generation credit. */}
                        {editingOpener?.leadId === current.id && (
                          <div className="bg-bone border border-line rounded-xl p-3 space-y-2">
                            <div className="text-tiny font-mono text-ink-muted">
                              {current.personalized_opener ? "Edit personalized opener" : "Write an opener"}
                            </div>
                            <textarea value={editingOpener.opener} onChange={(e) => setEditingOpener({ ...editingOpener, opener: e.target.value })}
                              rows={3} placeholder="A one-line hook personal to this lead…"
                              className="w-full border border-line px-2 py-1.5 rounded-lg text-sm font-sans" />
                            <div className="flex justify-end gap-2">
                              <button onClick={() => setEditingOpener(null)} className="btn-secondary text-xs">Cancel</button>
                              <button onClick={() => saveOpener(current.id, editingOpener.opener)} disabled={!editingOpener.opener?.trim()} className="btn-primary text-xs"><Check size={12} /> Save</button>
                            </div>
                          </div>
                        )}
                        <div>
                          <div className="text-tiny text-ink-muted mb-1 font-mono">SUBJECT</div>
                          <div className="text-caption font-semibold font-mono text-ink-secondary border border-line rounded-xl px-3 py-2">
                            {current.email_subject || "(no subject)"}
                          </div>
                        </div>
                        <div>
                          <div className="text-tiny text-ink-muted mb-1 font-mono">BODY</div>
                          <div className="max-h-96 overflow-y-auto text-caption text-ink-secondary whitespace-pre-wrap font-sans leading-relaxed border border-line rounded-xl p-3 bg-white">
                            {current.email_body || current.email_body_html ? (
                              <div dangerouslySetInnerHTML={{ __html: current.email_body_html || current.email_body?.replace(/\n/g, "<br>") || "" }} />
                            ) : (
                              <div className="text-ink-muted italic">No content</div>
                            )}
                          </div>
                          {/\{\{\s*\w+\s*\}\}/.test(current.email_body || "") && (
                            <div className="flex items-center gap-1.5 text-tiny text-warning mt-1.5">
                              <AlertTriangle size={11} /> Contains an unresolved merge field — this lead may be missing that field.
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 pt-3 border-t border-line">
                          {!current.personalized ? (
                            <span className="text-caption text-ink-muted">Write an opener above (or generate with AI) to enable approval.</span>
                          ) : current.email_status === "approved" ? (
                            <>
                              <span className="flex items-center gap-1 text-xs text-success font-medium"><Check size={14} /> Approved</span>
                              <button onClick={() => rejectEmail(current.id)} className="btn-ghost text-xs text-danger flex items-center gap-1 ml-auto"><Flag size={12} /> Reject</button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => approveEmail(current.id)} className="btn-primary text-xs flex items-center gap-1"><Check size={12} /> Approve</button>
                              <button onClick={() => rejectEmail(current.id)} className="btn-ghost text-xs text-danger flex items-center gap-1"><Flag size={12} /> Reject</button>
                            </>
                          )}
                          {current.personalized && (
                            <button onClick={() => deleteLeadEmail(current.id)} className="btn-ghost text-xs text-ink-muted hover:text-danger ml-auto flex items-center gap-1"><Trash2 size={12} /> Remove</button>
                          )}
                        </div>
                      </div>
                    </div>
                  </>
                );
              })()}
              </div>
            </div>
          ) : (
            /* TEMPLATE EDITOR — multi-channel */
            <div className="shadow-card p-6 sm:p-8 rounded-2xl">
              {/* Channel selector */}
              <div className="flex items-center gap-2 mb-5 pb-4 border-b border-line">
                <div className="ui-label shrink-0">Channel</div>
                <div className="flex flex-wrap gap-1">
                  {CHANNELS.map((ch) => {
                    const active = (step.channel || "email") === ch.key;
                    const chIcons = { email: <Mail size={14} />, phone_call: <Phone size={14} />, sms: <MessageSquare size={14} />, whatsapp: <MessageCircle size={14} />, linkedin_connect: <Send size={14} />, linkedin_message: <Send size={14} />, linkedin_comment: <MessageCircle size={14} /> };
                    return (
                      <button key={ch.key} onClick={() => updateStep({ channel: ch.key })}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${active ? "bg-ink text-white" : "bg-ash text-ink-muted hover:text-ink"}`}>
                        {chIcons[ch.key]} {ch.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Email fields */}
              {(step.channel || "email") === "email" && (
                <>
                  <div className="ui-label mb-2">Subject</div>
                  <input value={step.subject} onChange={(e) => updateStep({ subject: e.target.value })}
                    data-testid="editor-subject"
                    className="w-full text-body font-display font-semibold border-0 border-b border-line py-2 focus:outline-none focus:border-ink bg-transparent"
                    placeholder="Quick idea for {{company}}" />
                  <div className="mt-5 flex items-center justify-between">
                    <div className="ui-label">Body</div>
                    <div className="flex items-center gap-3">
                      <label className="form-label">day</label>
                      <input type="number" min={0} value={step.day}
                        onChange={(e) => updateStep({ day: Number(e.target.value) })}
                        data-testid="editor-day"
                        className="w-16 border border-line px-2 py-1 rounded-xl font-mono text-ink" />
                    </div>
                  </div>
                  <div className="mt-2">
                    <RichEmailEditor value={step.body_html || ""} onChange={(html) => updateStep({ body_html: html })}
                      placeholder="Write your email, or research this lead and draft it for you." />
                  </div>
                </>
              )}

              {/* Phone Call fields */}
              {(step.channel || "") === "phone_call" && (
                <>
                  <div className="ui-label mb-1">Call Script</div>
                  <p className="text-tiny text-ink-muted mb-2">{{first_name}}, {{company}}, and other merge fields will be filled automatically.</p>
                  <textarea value={step.script || ""} onChange={(e) => updateStep({ script: e.target.value })}
                    rows={6} className="w-full border border-line px-3 py-2 rounded-xl font-mono text-sm text-ink"
                    placeholder="Hi {{first_name}}, this is [Your Name] from {{company}}... (write your call script with {{merge_fields}})" />
                  <div className="mt-3 flex items-center gap-3">
                    <label className="form-label">day</label>
                    <input type="number" min={0} value={step.day}
                      onChange={(e) => updateStep({ day: Number(e.target.value) })}
                      className="w-16 border border-line px-2 py-1 rounded-xl font-mono text-ink" />
                  </div>
                </>
              )}

              {/* SMS fields */}
              {(step.channel || "") === "sms" && (
                <>
                  <div className="ui-label mb-1">SMS Body</div>
                  <p className="text-tiny text-ink-muted mb-2">Short message. Merge fields supported: {'{{'}first_name{'}}'}, {'{{'}company{'}}'}, etc.</p>
                  <textarea value={step.body || ""} onChange={(e) => updateStep({ body: e.target.value })}
                    rows={3} maxLength={160} className="w-full border border-line px-3 py-2 rounded-xl font-mono text-sm text-ink"
                    placeholder="Hi {{first_name}}, quick reminder about {{company}}..." />
                  <div className="text-tiny text-ink-muted mt-1">{(step.body || "").length}/160 characters</div>
                  <div className="mt-3 flex items-center gap-3">
                    <label className="form-label">day</label>
                    <input type="number" min={0} value={step.day}
                      onChange={(e) => updateStep({ day: Number(e.target.value) })}
                      className="w-16 border border-line px-2 py-1 rounded-xl font-mono text-ink" />
                  </div>
                </>
              )}

              {/* WhatsApp fields */}
              {(step.channel || "") === "whatsapp" && (
                <>
                  <div className="ui-label mb-1">WhatsApp Message</div>
                  <p className="text-tiny text-ink-muted mb-2">Merge fields supported. Keep it conversational.</p>
                  <textarea value={step.body || ""} onChange={(e) => updateStep({ body: e.target.value })}
                    rows={4} className="w-full border border-line px-3 py-2 rounded-xl font-mono text-sm text-ink"
                    placeholder="Hi {{first_name}}, wanted to share something relevant for {{company}}..." />
                  <div className="mt-3 flex items-center gap-3">
                    <label className="form-label">day</label>
                    <input type="number" min={0} value={step.day}
                      onChange={(e) => updateStep({ day: Number(e.target.value) })}
                      className="w-16 border border-line px-2 py-1 rounded-xl font-mono text-ink" />
                  </div>
                </>
              )}

              {/* LinkedIn Message fields */}
              {(step.channel || "") === "linkedin_message" && (
                <>
                  <div className="ui-label mb-1">LinkedIn Message</div>
                  <p className="text-tiny text-ink-muted mb-2">This will be marked as a manual task — LinkedIn Messages require sending via LinkedIn.com</p>
                  <textarea value={step.linkedin_message || step.body || ""} onChange={(e) => updateStep({ linkedin_message: e.target.value })}
                    rows={5} className="w-full border border-line px-3 py-2 rounded-xl font-mono text-sm text-ink"
                    placeholder="Hi {{first_name}}, noticed {{company}}'s recent work on..." />
                  <div className="mt-3 flex items-center gap-3">
                    <label className="form-label">day</label>
                    <input type="number" min={0} value={step.day}
                      onChange={(e) => updateStep({ day: Number(e.target.value) })}
                      className="w-16 border border-line px-2 py-1 rounded-xl font-mono text-ink" />
                  </div>
                </>
              )}

              {/* LinkedIn Comment fields */}
              {(step.channel || "") === "linkedin_comment" && (
                <>
                  <div className="ui-label mb-1">Post URL to comment on</div>
                  <input value={step.linkedin_post_url || ""} onChange={(e) => updateStep({ linkedin_post_url: e.target.value })}
                    className="w-full border border-line px-3 py-2 rounded-xl text-sm text-ink"
                    placeholder="https://www.linkedin.com/posts/..." />
                  <div className="ui-label mb-1 mt-3">Comment text</div>
                  <textarea value={step.linkedin_comment_text || step.body || ""} onChange={(e) => updateStep({ linkedin_comment_text: e.target.value })}
                    rows={4} className="w-full border border-line px-3 py-2 rounded-xl font-mono text-sm text-ink"
                    placeholder="Great insight, {{first_name}}! I'd add that..." />
                  <div className="mt-3 flex items-center gap-3">
                    <label className="form-label">day</label>
                    <input type="number" min={0} value={step.day}
                      onChange={(e) => updateStep({ day: Number(e.target.value) })}
                      className="w-16 border border-line px-2 py-1 rounded-xl font-mono text-ink" />
                  </div>
                </>
              )}

              {/* LinkedIn Connect fields */}
              {(step.channel || "") === "linkedin_connect" && (
                <>
                  <div className="flex items-center gap-2 text-warning mb-2">
                    <AlertTriangle size={14} />
                    <span className="text-caption font-medium">Manual action required</span>
                  </div>
                  <p className="text-tiny text-ink-muted mb-3">LinkedIn doesn't allow automating connection requests. The lead's LinkedIn URL will be shown so you can connect manually.</p>
                  <div className="ui-label mb-1">Connection note (optional)</div>
                  <textarea value={step.linkedin_connection_note || step.body || ""} onChange={(e) => updateStep({ linkedin_connection_note: e.target.value })}
                    rows={3} className="w-full border border-line px-3 py-2 rounded-xl font-mono text-sm text-ink"
                    placeholder="Hi {{first_name}}, I've been following {{company}}'s work..." />
                  <div className="mt-3 flex items-center gap-3">
                    <label className="form-label">day</label>
                    <input type="number" min={0} value={step.day}
                      onChange={(e) => updateStep({ day: Number(e.target.value) })}
                      className="w-16 border border-line px-2 py-1 rounded-xl font-mono text-ink" />
                  </div>
                </>
              )}
            </div>
          )}

          {/* Signature modal */}
          {showSignatureModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowSignatureModal(false)}>
              <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-2xl mx-4" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                  <div className="text-section font-display font-semibold">Create Signature</div>
                  <button onClick={() => setShowSignatureModal(false)} className="btn-ghost text-xs">Close</button>
                </div>
                <div className="space-y-3">
                  <input value={signatureName} onChange={(e) => setSignatureName(e.target.value)}
                    className="w-full border border-line rounded-xl px-3 py-2 text-input"
                    placeholder="Signature name (e.g. My Standard Signature)" />
                  <RichEmailEditor
                    value={signatureHtml}
                    onChange={setSignatureHtml}
                    placeholder="Paste or compose your signature here — add images, links, and formatting..."
                  />
                  {signatureHtml && (
                    <div className="bg-bone border border-line rounded-xl p-3 text-body">
                      <div className="text-tiny font-mono uppercase text-ink-muted mb-1">Preview</div>
                      <div className="border-t border-line pt-2 mt-1 signature-preview" dangerouslySetInnerHTML={{ __html: signatureHtml }} />
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
        <aside className={`col-span-full ${showEqPanel ? "lg:col-span-3" : "lg:col-span-0 lg:hidden"} border-l border-line bg-white p-6 sm:p-8 relative`}>
          <button onClick={() => setShowEqPanel(false)}
            className="absolute top-3 right-3 w-5 h-5 flex items-center justify-center rounded hover:bg-bone text-ink-muted hover:text-ink transition-colors"
            title="Hide EQ panel">
            <ChevronRight size={14} />
          </button>
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
