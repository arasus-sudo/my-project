import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import RichEmailEditor, { sanitizeEmailHtml } from "../components/RichEmailEditor";
import { toast } from "sonner";
import {
  Save, Play, Pause, Plus, Trash2, Loader2, Check, AlertTriangle, LayoutTemplate,
  Mail, Eye, Signature, Search,
  Zap, ChevronLeft, ChevronRight, ChevronDown,
  Edit2, RotateCw, Flag, X, PenSquare,
  Phone, MessageSquare, Send, MessageCircle,
  FileText, Sparkles, Megaphone,
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
  condition: "always",
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

const htmlToText = (html) => {
  const el = document.createElement("div");
  el.innerHTML = sanitizeEmailHtml(html);
  el.querySelectorAll("p, li").forEach((n) => n.append("\n"));
  return (el.textContent || "").replace(/\n{4,}/g, "\n\n\n").trim();
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
  const [campaignLeads, setCampaignLeads] = useState([]);
  // Which sequence step the review pane renders. Separate from activeStep (the
  // step being edited) so switching the editor tab doesn't refetch every lead.
  const [previewStep, setPreviewStep] = useState(0);
  const [generatingEmail, setGeneratingEmail] = useState(null);
  const [leadSearch, setLeadSearch] = useState("");
  const [leadPickerPage, setLeadPickerPage] = useState(1);
  const LEADS_PAGE_SIZE = 25;
  const [signatures, setSignatures] = useState([]);
  const [signatureId, setSignatureId] = useState("");
  const [includeSignature, setIncludeSignature] = useState(true);
  const [campaignType, setCampaignType] = useState("blank"); // "blank" | "template" | "marketing" | "ai"
  const isTemplate = campaignType === "template" || campaignType === "blank" || campaignType === "marketing";
  const isAI = campaignType === "ai";
  const [mailboxView, setMailboxView] = useState(false);
  const [showCampaignTypePicker, setShowCampaignTypePicker] = useState(false);

  const fillMergeFields = useCallback((text, lead) => {
    if (!text) return text;
    return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
      const val = lead?.[key];
      return val !== undefined && val !== null ? String(val) : `{{${key}}}`;
    });
  }, []);
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
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewMode, setReviewMode] = useState(false);
  const [editingOpener, setEditingOpener] = useState(null); // {leadId, opener}
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
  const [folderId, setFolderId] = useState("");
  const [folders, setFolders] = useState([]);
  const [campaignTags, setCampaignTags] = useState("");
  const [advancingBatch, setAdvancingBatch] = useState(false);
  const [showEqPanel, setShowEqPanel] = useState(true);
  const [railSection, setRailSection] = useState("sequence"); // sequence|audience|sending|signature|basics
  const [reviewCollapsed, setReviewCollapsed] = useState({ leadRail: false });

  // Track actual campaign ID — may differ from useParams id when creating new
  const [activeCampaignId, setActiveCampaignId] = useState(id);
  useEffect(() => { setActiveCampaignId(id); }, [id]);

  const loadCampaignLeads = (overrideId, overrideStep) => {
    const cid = overrideId || activeCampaignId || id;
    if (!cid) return;
    const s = overrideStep ?? previewStep;
    api.get(`/campaigns/${cid}/leads`, { params: { step: s } })
      .then((r) => setCampaignLeads(r.data.leads || [])).catch(() => {});
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



  // Show 4-way picker for new campaigns
  useEffect(() => {
    if (!id) setShowCampaignTypePicker(true);
  }, [id]);

  const handleCampaignTypeSelect = (type) => {
    setCampaignType(type);
    setShowCampaignTypePicker(false);
    if (type === "template") {
      // template picker will be triggered by UI after selection
    } else if (type === "ai") {
      setSteps([{
        ...DEFAULT_STEP(),
        subject: "Quick idea for {{company}}",
        body_html: "<p>Hi {{first_name}},</p><p>{{personalized_opener}}</p><p>Worth 15 minutes to compare notes?</p>",
        body: "Hi {{first_name}},\n\n{{personalized_opener}}\n\nWorth 15 minutes to compare notes?",
      }]);
    } else if (type === "marketing") {
      setSteps([{
        ...DEFAULT_STEP(),
        subject: "New from {{company}} — {{first_name}}, quick update",
        body_html: "<p>Hi {{first_name}},</p><p>Excited to share what's new at {{company}} — here's a quick update worth 2 mins.</p>",
        body: "Hi {{first_name}},\n\nExcited to share what's new at {{company}} — here's a quick update worth 2 mins.",
      }]);
    } else {
      setSteps([DEFAULT_STEP()]);
    }
  };

  useEffect(() => {
    api.get("/leads?page_size=2000").then((r) => setLeads(r.data.items || r.data));
    api.get("/crm/lists").then((r) => setLeadLists(r.data || [])).catch(() => {});
    api.get("/campaign-folders").then((r) => setFolders(r.data || [])).catch(() => {});
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
        if (c.signature_id) { setSignatureId(c.signature_id); setIncludeSignature(true); }
        else setIncludeSignature(false);
        if (c.send_window_start) setSendWindowStart(c.send_window_start);
        if (c.send_window_end) setSendWindowEnd(c.send_window_end);
        if (c.timezone) setTimezone(c.timezone);
        if (c.folder_id) setFolderId(c.folder_id);
        if (c.tags?.length) setCampaignTags(c.tags.join(", "));
        setBatchSize(c.batch_size || 10);
        setPhasedGeneration(c.phased_generation || false);
        if (c.campaign_type) setCampaignType(c.campaign_type);
      });
      loadCampaignLeads();
      api.get(`/campaigns/${id}/batch-status`).then((r) => setBatchStatus(r.data)).catch(() => {});
    }
  }, [id]);

  const deleteLeadEmail = async (leadId) => {
    try {
      await api.delete(`/campaigns/${id}/leads/${leadId}/email`);
      toast.success("Email removed");
      loadCampaignLeads();
    } catch {
      toast.error("Failed to remove");
    }
  };

  // Load signatures — a per-user preference set by an org signature policy
  // (see Signature Policies) takes priority over the workspace-wide default,
  // since signatures are a shared pool with no per-user ownership otherwise.
  // Only prefills for a NEW campaign (no `id`) — an existing campaign's own
  // saved signature_id is loaded separately above and shouldn't be overridden.
  useEffect(() => {
    Promise.all([
      api.get("/signatures"),
      id ? Promise.resolve({ data: { signature_id: null } }) : api.get("/signatures/my-preference").catch(() => ({ data: { signature_id: null } })),
    ]).then(([sigRes, prefRes]) => {
      const sigs = sigRes.data || [];
      setSignatures(sigs);
      if (id) return;
      const preferredId = prefRes.data?.signature_id;
      const preferred = preferredId && sigs.find((s) => s.id === preferredId);
      const def = preferred || sigs.find((s) => s.is_default);
      if (def) setSignatureId(def.id);
    }).catch(() => {});
  }, [id]);

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

  // Shared by every generation trigger below: polls generation-status until
  // the job completes, keeping `genProgress` live so Preview can render a
  // real "N/M generated" bar instead of dropping into review mode before any
  // email actually exists.
  const pollGeneration = (cid, jobId, generating) => {
    setGenProgress({ done: 0, total: generating || 0 });
    setReviewMode(true);
    setReviewIndex(0);
    const poll = setInterval(async () => {
      try {
        const st = await api.get(`/campaigns/${cid}/generation-status`);
        const allJobs = Object.values(st.data.jobs);
        const running = allJobs.find((j) => j.status === "running");
        const job = running || allJobs[allJobs.length - 1] || null;
        if (!job) { clearInterval(poll); setGenProgress(null); return; }
        setGenProgress({ done: job.done || 0, total: job.total || generating || 0 });
        loadCampaignLeads(cid);
        if (job.status === "complete") {
          clearInterval(poll);
          setGenProgress(null);
          loadCampaignLeads(cid);
          refreshBatchStatus();
          toast.success(`Generated ${job.done} email${job.done === 1 ? "" : "s"}`);
        }
      } catch { clearInterval(poll); setGenProgress(null); }
    }, 3000);
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

  const rejectAllEmails = async () => {
    if (!id || !campaignLeads?.length) return;
    const allIds = campaignLeads.map((l) => l.id);
    try {
      const { data } = await api.post(`/campaigns/${id}/leads/bulk-status`, { lead_ids: allIds, status: "rejected" });
      toast.success(`${data.updated} email(s) rejected`);
      loadCampaignLeads();
    } catch { toast.error("Reject-all failed"); }
  };

  const dismissAllEmails = async () => {
    if (!id) return;
    try {
      await api.delete(`/campaigns/${id}/leads/email`);
      toast.success("All emails dismissed");
      setReviewMode(false);
      loadCampaignLeads();
    } catch { toast.error("Dismiss failed"); }
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

  const changePreviewStep = (s) => {
    setPreviewStep(s);
    loadCampaignLeads(undefined, s);
  };

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

  // Rendering all matching leads at once (sometimes 1000+) is what made this
  // panel feel congested and slow — page the DOM, not the underlying fetch.
  // Selection/"select all matching" still operate on the full filteredLeads
  // set, only the visible rows are windowed.
  useEffect(() => { setLeadPickerPage(1); }, [leadSearch, selectedListId, selectedTags]);
  const leadPickerTotalPages = Math.max(1, Math.ceil(filteredLeads.length / LEADS_PAGE_SIZE));
  const paginatedLeads = useMemo(
    () => filteredLeads.slice((leadPickerPage - 1) * LEADS_PAGE_SIZE, leadPickerPage * LEADS_PAGE_SIZE),
    [filteredLeads, leadPickerPage],
  );

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

  const save = async () => {
    setBusy(true);
    try {
      const cleanSteps = steps.map(({ _key, ...rest }) => ({
        ...rest,
        body_html: sanitizeEmailHtml(rest.body_html || rest.body || ""),
        body_text: htmlToText(rest.body_html || "") || rest.body || "",
      }));
      const payload = { name, goal, campaign_type: campaignType, steps: cleanSteps, lead_ids: selectedLeads, signature_id: (includeSignature && signatureId) ? signatureId : null, send_window_start: sendWindowStart, send_window_end: sendWindowEnd, timezone, batch_size: batchSize, phased_generation: phasedGeneration, folder_id: folderId || null, tags: campaignTags ? campaignTags.split(",").map((t) => t.trim()).filter(Boolean) : [] };
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
    // Re-launching an already-active campaign would re-run enqueue_campaign
    // and duplicate-queue every lead — Pause it first (button below already
    // won't offer "Launch" once status is active, this is the belt-and-braces
    // guard for stale state).
    if (status === "active") { toast.info("Already running — pause it first to relaunch."); return; }
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
      setStatus("active");
      toast.success(`Launched — ${data.queued} email${data.queued === 1 ? "" : "s"} queued`, {
        description: "They go out inside your sending window, spread across your mailboxes.",
        action: { label: "View in Campaigns", onClick: () => nav("/app/campaigns") },
        duration: 8000,
      });
    } catch (err) {
      console.error("Launch error:", err);
      toast.error(err?.response?.data?.detail || err?.message || "Launch failed", {
        action: { label: "Mailboxes", onClick: () => nav("/app/mailboxes") },
      });
    } finally { setBusy(false); }
  };

  const pauseCampaign = async () => {
    const cid = activeCampaignId || id;
    if (!cid) return;
    setBusy(true);
    try {
      await api.post(`/campaigns/${cid}/pause`);
      setStatus("paused");
      toast.success("Paused — sending stops until you resume.");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Pause failed");
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
            className="bg-transparent border-0 border-b border-transparent hover:border-line-default focus:border-primary focus:outline-none font-display font-semibold text-card-title w-full" />
        }
        subtitle={`Goal: ${goal}`}
        badge="EQ Editor"
        right={
          <div className="flex items-center gap-2">
            {status !== "draft" && (
              <span className="text-tiny font-mono px-2 py-1 rounded-lg border border-line-default text-fg-tertiary">{status}</span>
            )}
            <button data-testid="save-campaign" onClick={save} disabled={busy} className="btn-secondary"><Save size={12} /> Save</button>
            {id && (
              <button onClick={async () => {
                try {
                  await api.post(`/campaigns/${id}/save-template`);
                  toast.success("Campaign saved as template");
                } catch (err) { toast.error(err?.response?.data?.detail || "Failed"); }
              }} className="btn-secondary"><LayoutTemplate size={12} /> Template</button>
            )}
            {status === "active" ? (
              <button
                data-testid="pause-campaign"
                onClick={pauseCampaign}
                disabled={busy || !id}
                className="btn-secondary"
              >
                <Pause size={12} /> Pause
              </button>
            ) : (
              <button
                data-testid="launch-campaign"
                onClick={() => launch()}
                disabled={busy || !id || leadStats.approved === 0}
                title={leadStats.approved === 0 ? "Approve at least one lead before launching" : ""}
                className="btn-primary"
              >
                <Play size={12} /> {status === "paused" ? "Resume" : "Launch"}
              </button>
            )}
          </div>
        }
      />
      {id && leadStats.total > 0 && (
        <div className="px-3 sm:px-4 pt-2 flex items-center gap-3 flex-wrap" data-testid="assigned-leads-stat">
          <div className="flex items-baseline gap-1.5">
            <span className="text-tiny font-mono text-fg-tertiary">Leads</span>
            <span className="text-caption font-semibold">{leadStats.total}</span>
          </div>
          <div className="flex items-center gap-1.5 text-tiny font-mono">
            {leadStats.approved > 0 && <span className="text-success">{leadStats.approved}✓</span>}
            {leadStats.rejected > 0 && <span className="text-danger">{leadStats.rejected}✗</span>}
            {leadStats.draft > 0 && <span className="text-warning">{leadStats.draft}~</span>}
            {leadStats.ungenerated > 0 && <span className="text-fg-tertiary">{leadStats.ungenerated} pending</span>}
          </div>
        </div>
      )}
      {/* Current campaign type — 4 way, isolated per choice */}
      <div className="px-3 sm:px-4 pt-2 pb-1.5 flex items-center gap-3">
        <div className="ui-label shrink-0">Campaign type</div>
        <div className="flex items-center gap-1 bg-canvas border border-line-default rounded-xl p-0.5">
          <button onClick={() => setCampaignType("blank")}
            className={`px-3 py-1.5 rounded-lg text-caption font-medium transition-colors ${campaignType === "blank" ? "bg-primary text-white shadow-sm" : "text-fg-tertiary hover:text-fg"}`}>
            Blank
          </button>
          <button onClick={() => setCampaignType("template")}
            className={`px-3 py-1.5 rounded-lg text-caption font-medium transition-colors ${campaignType === "template" ? "bg-primary text-white shadow-sm" : "text-fg-tertiary hover:text-fg"}`}>
            Template
          </button>
          <button onClick={() => setCampaignType("marketing")}
            className={`px-3 py-1.5 rounded-lg text-caption font-medium transition-colors ${campaignType === "marketing" ? "bg-primary text-white shadow-sm" : "text-fg-tertiary hover:text-fg"}`}>
            Marketing
          </button>
          <button onClick={() => setCampaignType("ai")}
            className={`px-3 py-1.5 rounded-lg text-caption font-medium transition-colors ${campaignType === "ai" ? "bg-primary text-white shadow-sm" : "text-fg-tertiary hover:text-fg"}`}>
            AI Campaign
          </button>
        </div>
        {!id && (
          <button onClick={() => setShowCampaignTypePicker(true)} className="btn-ghost text-tiny">Change</button>
        )}
      </div>
      {/* Helper: only generation/preview for chosen type */}
      <div className="px-3 sm:px-4 pb-1 text-tiny text-fg-tertiary">
        {campaignType === "blank" && "Blank — you build every step; no AI generation, only merge-field preview."}
        {campaignType === "template" && "Template — inserts saved template blocks; basic merge preview, no AI opener."}
        {campaignType === "marketing" && "Marketing — campaign-style sequence; preview uses template merge, no AI opener."}
        {campaignType === "ai" && "AI — generates personalized opener per lead; preview shows AI opener merged."}
      </div>

      {/* Build / Review & Send tabs */}
      <div className="px-3 sm:px-4 border-b border-line-default">
        <div className="flex gap-1 overflow-x-auto">
          <button onClick={() => setReviewMode(false)} data-testid="build-tab"
            className={`px-4 py-2 text-body font-medium font-display border-b-2 transition-colors whitespace-nowrap shrink-0 ${!reviewMode ? "border-primary text-primary" : "border-transparent text-fg-tertiary hover:text-fg"}`}>
            <PenSquare size={14} className="inline mr-1.5" /> Build
          </button>
          <button onClick={() => setReviewMode(true)} disabled={leadStats.total === 0} data-testid="toggle-preview"
            title={leadStats.total === 0 ? "Add at least one lead to preview generated emails" : ""}
            className={`px-4 py-2 text-body font-medium font-display border-b-2 transition-colors whitespace-nowrap shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${reviewMode ? "border-primary text-primary" : "border-transparent text-fg-tertiary hover:text-fg"}`}>
            <Eye size={14} className="inline mr-1.5" /> Preview
          </button>
        </div>
      </div>

      {reviewMode ? (
        <ReviewAndSendView
          campaignLeads={campaignLeads} leadStats={leadStats}
          regenerateAllEmails={regenerateAllEmails} regeneratingAll={regeneratingAll}
          rejectAllEmails={rejectAllEmails} dismissAllEmails={dismissAllEmails} approveAllEmails={approveAllEmails}
          selectedReview={selectedReview} setSelectedReview={setSelectedReview}
          bulkSetReviewStatus={bulkSetReviewStatus}
          getReviewEmails={getReviewEmails} reviewIndex={reviewIndex} setReviewIndex={setReviewIndex}
          steps={steps} activeStep={activeStep}
          previewStep={previewStep} changePreviewStep={changePreviewStep}
          includeSignature={includeSignature} signatures={signatures} signatureId={signatureId}
          reviewCollapsed={reviewCollapsed} setReviewCollapsed={setReviewCollapsed}
          genProgress={genProgress}
          toggleReviewSelected={toggleReviewSelected}
          prevReview={prevReview} nextReview={nextReview}
          sendTestEmail={sendTestEmail} sendingTest={sendingTest}
          isTemplate={isTemplate}
          editingOpener={editingOpener} setEditingOpener={setEditingOpener}
          regenerateOpener={regenerateOpener} generatingEmail={generatingEmail}
          saveOpener={saveOpener}
          mailboxView={mailboxView} setMailboxView={setMailboxView}
          fillMergeFields={fillMergeFields} name={name}
          approveEmail={approveEmail} rejectEmail={rejectEmail} deleteLeadEmail={deleteLeadEmail}
        />
      ) : (
        <div className="flex flex-col md:flex-row min-h-[calc(100vh-190px)]">
          {/* Rail */}
          <aside className="w-full md:w-56 shrink-0 flex md:flex-col gap-1 overflow-x-auto md:overflow-visible px-3 sm:px-4 md:px-3 py-2 md:py-4 border-b md:border-b-0 md:border-r border-line-default md:sticky md:top-20 md:self-start">
            <RailBtn active={railSection === "sequence"} onClick={() => setRailSection("sequence")} icon={<LayoutTemplate size={14} />} label="Sequence" testid="rail-sequence" />
            <RailBtn active={railSection === "audience"} onClick={() => setRailSection("audience")} icon={<Search size={14} />} label="Audience" testid="rail-audience" />
            <RailBtn active={railSection === "sending"} onClick={() => setRailSection("sending")} icon={<Send size={14} />} label="Sending" testid="rail-sending" />
            <RailBtn active={railSection === "signature"} onClick={() => setRailSection("signature")} icon={<Signature size={14} />} label="Signature" testid="rail-signature" />
            <RailBtn active={railSection === "basics"} onClick={() => setRailSection("basics")} icon={<Flag size={14} />} label="Basics" testid="rail-basics" />
          </aside>

          <div className="flex-1 min-w-0 p-3 sm:p-4 bg-canvas">
            {railSection === "sequence" ? (
              <div className={`grid grid-cols-1 gap-3 ${showEqPanel ? "lg:grid-cols-[1fr_288px]" : ""}`}>
                <div className="min-w-0">
                  <SequenceSection steps={steps} activeStep={activeStep} setActiveStep={setActiveStep}
                    addStep={addStep} removeStep={removeStep} updateStep={updateStep} step={step} />
                </div>
                {showEqPanel ? (
                  <EqPanel eq={eq} setShowEqPanel={setShowEqPanel} />
                ) : (
                  <button onClick={() => setShowEqPanel(true)}
                    className="hidden lg:flex items-start justify-center pt-2 text-fg-tertiary hover:text-fg transition-colors" title="Show EQ panel">
                    <ChevronLeft size={14} />
                  </button>
                )}
              </div>
            ) : railSection === "audience" ? (
              <AudienceSection
                leads={leads} filteredLeads={filteredLeads} paginatedLeads={paginatedLeads} pageSize={LEADS_PAGE_SIZE}
                selectedLeads={selectedLeads} setSelectedLeads={setSelectedLeads}
                leadLists={leadLists} selectedListId={selectedListId} setSelectedListId={setSelectedListId}
                allTags={allTags} selectedTags={selectedTags} setSelectedTags={setSelectedTags}
                leadSearch={leadSearch} setLeadSearch={setLeadSearch}
                leadPickerPage={leadPickerPage} setLeadPickerPage={setLeadPickerPage} leadPickerTotalPages={leadPickerTotalPages}
                selectFromAll={selectFromAll} setSelectFromAll={setSelectFromAll} selectFirstN={selectFirstN}
                save={save} busy={busy}
                leadStats={leadStats} phasedGeneration={phasedGeneration} setPhasedGeneration={setPhasedGeneration}
                batchSize={batchSize} setBatchSize={setBatchSize} batchStatus={batchStatus}
                advanceBatch={advanceBatch} advancingBatch={advancingBatch}
                batchApproved={batchApproved} batchTotal={batchTotal}
              />
            ) : railSection === "sending" ? (
              <SendingSection
                sendWindowStart={sendWindowStart} setSendWindowStart={setSendWindowStart}
                sendWindowEnd={sendWindowEnd} setSendWindowEnd={setSendWindowEnd}
                timezone={timezone} setTimezone={setTimezone}
              />
            ) : railSection === "signature" ? (
              <SignatureSection
                includeSignature={includeSignature} setIncludeSignature={setIncludeSignature}
                signatures={signatures} signatureId={signatureId} setSignatureId={setSignatureId}
                deleteSignature={deleteSignature} onNewSignature={() => setShowSignatureModal(true)}
              />
            ) : (
              <BasicsSection
                goal={goal} setGoal={setGoal}
                folderId={folderId} setFolderId={setFolderId} folders={folders}
                campaignTags={campaignTags} setCampaignTags={setCampaignTags}
              />
            )}
          </div>
        </div>
      )}

      {showSignatureModal && (
        <SignatureModal
          onClose={() => setShowSignatureModal(false)}
          signatureName={signatureName} setSignatureName={setSignatureName}
          signatureHtml={signatureHtml} setSignatureHtml={setSignatureHtml}
          savingSignature={savingSignature} onCreate={createSignature}
        />
      )}
      {showCampaignTypePicker && (
        <CampaignTypePickerModal onClose={() => setShowCampaignTypePicker(false)} onSelect={handleCampaignTypeSelect} />
      )}
    </div>
  );
}

function CampaignTypePickerModal({ onClose, onSelect }) {
  const opts = [
    { key: "blank", label: "Blank", sub: "Start empty", icon: FileText, desc: "Build every step yourself. No generation, merge-field preview only." },
    { key: "template", label: "Template", sub: "From library", icon: LayoutTemplate, desc: "Insert saved template. Basic merge preview, no AI." },
    { key: "marketing", label: "Marketing", sub: "Campaign style", icon: Megaphone, desc: "Marketing sequence. Template merge preview, no AI opener." },
    { key: "ai", label: "AI Campaign", sub: "Personalized", icon: Sparkles, desc: "AI generates opener per lead. Preview shows AI merge." },
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-ds-surface rounded-xl shadow-card p-5 w-full max-w-2xl mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-subheading font-display font-semibold">Choose campaign type</div>
          <button onClick={onClose} className="btn-ghost text-caption">Close</button>
        </div>
        <p className="text-tiny text-fg-tertiary mb-4">Only the chosen type will be generated and previewed.</p>
        <div className="grid grid-cols-2 gap-3">
          {opts.map((o) => (
            <button key={o.key} onClick={() => onSelect(o.key)} data-testid={`picker-type-${o.key}`}
              className="text-left border border-line-default rounded-xl p-4 hover:border-primary hover:bg-surfacehover transition-colors">
              <div className="flex items-center gap-2 mb-1">
                <o.icon size={16} strokeWidth={1.5} className="text-primary" />
                <span className="text-body font-medium">{o.label}</span>
                <span className="text-tiny text-fg-tertiary">{o.sub}</span>
              </div>
              <div className="text-tiny text-fg-tertiary">{o.desc}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function RailBtn({ active, onClick, icon, label, testid }) {
  return (
    <button onClick={onClick} data-testid={testid}
      className={`shrink-0 md:w-full text-left flex items-center gap-2 px-3 py-2 rounded-xl text-body font-display transition-colors whitespace-nowrap ${active ? "bg-primary text-white" : "hover:bg-neutral-100 text-fg-secondary"}`}>
      {icon}
      {label}
    </button>
  );
}

/** Shared collapse/expand header used by every card-style section below —
 * one toggle pattern instead of each section reinventing it. */
function CollapsibleCard({ title, testid, defaultOpen = true, className = "max-w-lg", children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`shadow-card rounded-2xl bg-ds-surface ${className}`}>
      <div className="flex items-center justify-between px-4 sm:px-5 py-3 cursor-pointer select-none"
        onClick={() => setOpen((v) => !v)} data-testid={testid}>
        <div className="text-tiny font-mono text-fg-tertiary">{title}</div>
        <button className="text-fg-tertiary hover:text-fg transition-colors" title={open ? "Collapse" : "Expand"}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
      </div>
      {open && <div className="px-4 sm:px-5 pb-4 sm:pb-5">{children}</div>}
    </div>
  );
}

function BasicsSection({ goal, setGoal, folderId, setFolderId, folders, campaignTags, setCampaignTags }) {
  return (
    <CollapsibleCard title="Basics" testid="collapse-basics">
      <div className="space-y-3">
        <div>
          <label className="form-label">Goal</label>
          <input value={goal} onChange={(e) => setGoal(e.target.value)} data-testid="goal-input"
            placeholder="e.g. Book 15-minute intro calls"
            className="w-full border border-line-default px-3 py-2 rounded-lg text-input mt-1" />
        </div>
        <div>
          <label className="form-label">Folder</label>
          <select value={folderId} onChange={(e) => setFolderId(e.target.value)}
            className="w-full border border-line-default px-3 py-2 rounded-lg text-input mt-1">
            <option value="">No folder</option>
            {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Tags (comma-separated)</label>
          <input value={campaignTags} onChange={(e) => setCampaignTags(e.target.value)}
            placeholder="e.g. outbound, q4, ae-target"
            className="w-full border border-line-default px-3 py-2 rounded-lg text-input mt-1" />
        </div>
      </div>
    </CollapsibleCard>
  );
}

function SendingSection({ sendWindowStart, setSendWindowStart, sendWindowEnd, setSendWindowEnd, timezone, setTimezone }) {
  return (
    <CollapsibleCard title="Sending window" testid="collapse-sending">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="form-label">Start</label>
            <input type="time" value={sendWindowStart} onChange={(e) => setSendWindowStart(e.target.value)}
              className="w-full border border-line-default px-3 py-2 rounded-lg text-input mt-1" />
          </div>
          <div>
            <label className="form-label">End</label>
            <input type="time" value={sendWindowEnd} onChange={(e) => setSendWindowEnd(e.target.value)}
              className="w-full border border-line-default px-3 py-2 rounded-lg text-input mt-1" />
          </div>
        </div>
        <div>
          <label className="form-label">Timezone</label>
          <div className="relative mt-1">
            <select value={timezone} onChange={(e) => setTimezone(e.target.value)}
              className="w-full border border-line-default px-3 py-2 rounded-lg text-input font-mono appearance-none pr-8">
              {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-tertiary pointer-events-none" size={14} />
          </div>
        </div>
      </div>
    </CollapsibleCard>
  );
}

function SignatureSection({ includeSignature, setIncludeSignature, signatures, signatureId, setSignatureId, deleteSignature, onNewSignature }) {
  return (
    <CollapsibleCard title="Signature" testid="collapse-signature">
      <div className="space-y-3">
        <label className="flex items-center justify-between cursor-pointer">
          <span className="flex items-center gap-1.5 form-label"><Signature size={12} /> Include signature</span>
          <input type="checkbox" checked={includeSignature} onChange={(e) => setIncludeSignature(e.target.checked)}
            data-testid="include-signature-toggle" className="w-3.5 h-3.5" />
        </label>
        {includeSignature && (
          <div className="flex items-center gap-1.5">
            {signatures.length > 0 ? (
              <select value={signatureId} onChange={(e) => setSignatureId(e.target.value)} data-testid="signature-select"
                className="flex-1 min-w-0 border border-line-default rounded-lg px-3 py-2 text-input bg-ds-surface">
                <option value="">Choose a signature…</option>
                {signatures.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            ) : (
              <div className="flex-1 text-caption text-fg-tertiary">No signatures yet.</div>
            )}
            <button onClick={onNewSignature} title="New signature" data-testid="new-signature-btn"
              className="shrink-0 p-2 border border-line-default rounded-lg text-fg-tertiary hover:text-fg hover:bg-ds-hover transition-colors">
              <Plus size={14} />
            </button>
            <button
              onClick={() => { if (signatureId && window.confirm("Delete this signature?")) deleteSignature(signatureId); }}
              disabled={!signatureId} title="Delete signature" data-testid="delete-signature-btn"
              className="shrink-0 p-2 border border-line-default rounded-lg text-fg-tertiary hover:text-danger hover:bg-ds-hover transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>
    </CollapsibleCard>
  );
}

function AudienceSection({
  leads, filteredLeads, paginatedLeads, pageSize, selectedLeads, setSelectedLeads,
  leadLists, selectedListId, setSelectedListId, allTags, selectedTags, setSelectedTags,
  leadSearch, setLeadSearch, leadPickerPage, setLeadPickerPage, leadPickerTotalPages,
  selectFromAll, setSelectFromAll, selectFirstN, save, busy,
  leadStats, phasedGeneration, setPhasedGeneration, batchSize, setBatchSize, batchStatus,
  advanceBatch, advancingBatch, batchApproved, batchTotal,
}) {
  return (
    <CollapsibleCard title={`Leads (${selectedLeads.length}/${leads.length})`} testid="collapse-audience" className="max-w-2xl">
      {leadLists.length > 0 && (
        <div className="mb-2">
          <select value={selectedListId} onChange={(e) => setSelectedListId(e.target.value)}
            className="w-full border border-line-default rounded-lg px-2 py-1.5 text-caption font-mono bg-ds-surface">
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
              className={`text-tiny px-1.5 py-0.5 rounded-full border ${selectedTags.includes(t) ? "bg-primary/10 border-primary text-primary" : "border-line-default text-fg-tertiary hover:border-neutral-300"}`}>
              {t}
            </button>
          ))}
          {selectedTags.length > 0 && (
            <button onClick={() => setSelectedTags([])} className="text-tiny text-fg-tertiary hover:text-fg">
              <X size={12} />
            </button>
          )}
        </div>
      )}
      <div className="relative mb-2">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-tertiary pointer-events-none" />
        <input value={leadSearch} onChange={(e) => setLeadSearch(e.target.value)}
          placeholder="Search leads..."
          className="w-full border border-line-default rounded-xl pl-7 pr-3 py-1.5 text-tiny font-mono" />
      </div>
      <div className="border border-line-default rounded-xl max-h-[420px] overflow-y-auto">
        {paginatedLeads.map((l) => (
          <label key={l.id} className="flex items-start gap-1.5 px-2 py-1.5 border-b border-line-default last:border-b-0 text-tiny cursor-pointer hover:bg-surfacehover transition-colors duration-150">
            <input type="checkbox" className="mt-0.5 w-3 h-3"
              checked={selectedLeads.includes(l.id)}
              onChange={(e) => setSelectedLeads(e.target.checked ? [...selectedLeads, l.id] : selectedLeads.filter((x) => x !== l.id))}
              data-testid={`lead-check-${l.id}`}
            />
            <div className="flex-1 min-w-0">
              <div className="font-medium text-caption truncate">{l.first_name} {l.last_name}</div>
              <div className="text-fg-tertiary truncate">{l.company}{l.title ? ` · ${l.title}` : ""}</div>
              <div className="text-fg-tertiary font-mono truncate">{l.email}</div>
              {(l.tags?.length > 0 || l.campaign_names?.length > 0) && (
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {l.tags?.map((t) => (
                    <span key={t} className="font-mono bg-ink/5 text-fg-tertiary px-1.5 py-0.5 rounded-full">{t}</span>
                  ))}
                  {l.campaign_names?.map((cn) => (
                    <span key={cn} className="font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">{cn}</span>
                  ))}
                </div>
              )}
            </div>
          </label>
        ))}
        {filteredLeads.length === 0 && (
          <div className="text-caption text-fg-tertiary text-center py-6">No leads match the selected filters</div>
        )}
        {filteredLeads.length > 0 && (
          <div className="flex items-center justify-between px-2 py-1.5 border-t border-line-default bg-canvas text-tiny text-fg-tertiary">
            <span>
              {(leadPickerPage - 1) * pageSize + 1}–{Math.min(leadPickerPage * pageSize, filteredLeads.length)} of {filteredLeads.length}
            </span>
            <div className="flex items-center gap-1">
              <button onClick={() => setLeadPickerPage((p) => Math.max(1, p - 1))} disabled={leadPickerPage <= 1}
                data-testid="lead-picker-prev"
                className="p-1 rounded hover:bg-ds-hover disabled:opacity-30 disabled:hover:bg-transparent text-fg-tertiary hover:text-fg transition-colors">
                <ChevronLeft size={13} />
              </button>
              <button onClick={() => setLeadPickerPage((p) => Math.min(leadPickerTotalPages, p + 1))} disabled={leadPickerPage >= leadPickerTotalPages}
                data-testid="lead-picker-next"
                className="p-1 rounded hover:bg-ds-hover disabled:opacity-30 disabled:hover:bg-transparent text-fg-tertiary hover:text-fg transition-colors">
                <ChevronRight size={13} />
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
        <button onClick={() => setSelectedLeads(filteredLeads.map((l) => l.id))} className="text-tiny text-fg hover:underline" data-testid="select-all-leads">All ({filteredLeads.length})</button>
        <button onClick={() => setSelectedLeads([])} className="text-tiny text-fg-tertiary hover:underline" data-testid="deselect-all-leads">None</button>
        <span className="text-tiny text-fg-tertiary">|</span>
        <input type="number" min={1} placeholder="N"
          data-testid="select-n-input"
          className="w-10 border border-line-default rounded px-1 py-0.5 text-tiny text-center"
          onKeyDown={(e) => { if (e.key === "Enter") selectFirstN(e.target); }} />
        <button onClick={() => selectFirstN(document.querySelector('[data-testid="select-n-input"]'))}
          className="text-tiny text-fg-tertiary hover:text-fg hover:underline">Select</button>
        <label className="flex items-center gap-1 text-tiny text-fg-tertiary cursor-pointer ml-0.5">
          <input type="checkbox" checked={selectFromAll} onChange={(e) => setSelectFromAll(e.target.checked)} className="w-2.5 h-2.5" />
          All matching
        </label>
      </div>
      {selectedLeads.length > 0 && (
        <button onClick={save} disabled={busy} className="btn-primary w-full mt-2 text-tiny flex items-center justify-center gap-1">
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
          Add & Generate ({selectedLeads.length} leads)
        </button>
      )}

      {leadStats.total > 0 && (
        <div className="mt-2 p-2 bg-canvas rounded-xl border border-line-default space-y-1">
          <label className="flex items-center gap-1.5 text-tiny font-medium cursor-pointer">
            <input type="checkbox" checked={phasedGeneration}
              onChange={(e) => setPhasedGeneration(e.target.checked)} className="w-3 h-3" />
            Phased generation
          </label>
          {phasedGeneration && (
            <div className="space-y-1.5 ml-4">
              <label className="flex items-center gap-1.5 text-tiny text-fg-tertiary">
                <span>Batch:</span>
                <input type="number" min={1} max={500} value={batchSize}
                  onChange={(e) => setBatchSize(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="w-14 border border-line-default rounded px-1 py-0.5 text-tiny text-center" />
              </label>
              {batchStatus && batchStatus.phased && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-tiny">
                    <span className="text-fg-tertiary">Batch {batchStatus.current_batch}/{batchStatus.total_batches}</span>
                    <span className="text-fg-tertiary">
                      {Object.values(batchStatus.batches || {}).reduce((s, b) => s + b.approved, 0)}/{batchStatus.total_leads}
                    </span>
                  </div>
                  <div className="w-full bg-line rounded-full h-1 overflow-hidden">
                    <div className="bg-primary h-full rounded-full transition-all duration-300"
                      style={{ width: `${batchStatus.total_leads > 0 ? (Object.values(batchStatus.batches || {}).reduce((s, b) => s + b.approved, 0) / batchStatus.total_leads) * 100 : 0}%` }} />
                  </div>
                  {!batchStatus.all_batches_complete && batchApproved(batchStatus, batchStatus.current_batch) >= batchTotal(batchStatus, batchStatus.current_batch) && (
                    <button onClick={advanceBatch} disabled={advancingBatch}
                      className="text-tiny text-primary hover:underline flex items-center gap-0.5">
                      {advancingBatch ? <Loader2 size={10} className="animate-spin" /> : <ChevronRight size={10} />}
                      Next batch ({batchStatus.current_batch + 1}/{batchStatus.total_batches})
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </CollapsibleCard>
  );
}

function ChannelEditor({ step, updateStep }) {
  const [templatePicker, setTemplatePicker] = useState(false);
  return (
    <>
      {(step.channel || "email") === "email" && (
        <>
          <div className="text-tiny font-mono text-fg-tertiary mb-1">Subject</div>
          <input value={step.subject} onChange={(e) => updateStep({ subject: e.target.value })}
            data-testid="editor-subject"
            className="w-full text-caption font-medium border-0 border-b border-line-default py-1.5 focus:outline-none focus:border-primary bg-transparent"
            placeholder="Quick idea for {{company}}" />
          <div className="mt-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="text-tiny font-mono text-fg-tertiary">Body</div>
              <button onClick={() => setTemplatePicker(true)} data-testid="insert-template-btn"
                className="text-tiny font-medium text-primary hover:underline">
                <LayoutTemplate size={12} className="inline mr-0.5" /> Insert template
              </button>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-tiny text-fg-tertiary font-mono">day</label>
              <input type="number" min={0} value={step.day}
                onChange={(e) => updateStep({ day: Number(e.target.value) })}
                data-testid="editor-day"
                className="w-14 border border-line-default px-1.5 py-0.5 rounded font-mono text-tiny text-fg" />
            </div>
          </div>
          <div className="mt-1.5">
            <RichEmailEditor value={step.body_html || ""} onChange={(html) => updateStep({ body_html: html })}
              placeholder="Write your email, or research this lead and draft it for you." />
          </div>
        </>
      )}

      {(step.channel || "") === "phone_call" && (
        <>
          <div className="text-tiny font-mono text-fg-tertiary mb-0.5">Call Script</div>
          <p className="text-tiny text-fg-tertiary mb-1">{'{{'}first_name{'}}'}, {'{{'}company{'}}'}, and other merge fields will be filled automatically.</p>
          <textarea value={step.script || ""} onChange={(e) => updateStep({ script: e.target.value })}
            rows={4} className="w-full border border-line-default px-2 py-1.5 rounded font-mono text-tiny text-fg"
            placeholder="Hi {{first_name}}, this is [Your Name] from {{company}}... (write your call script with {{merge_fields}})" />
          <div className="mt-1.5 flex items-center gap-2">
            <label className="text-tiny text-fg-tertiary font-mono">day</label>
            <input type="number" min={0} value={step.day}
              onChange={(e) => updateStep({ day: Number(e.target.value) })}
              className="w-14 border border-line-default px-1.5 py-0.5 rounded font-mono text-tiny text-fg" />
          </div>
        </>
      )}

      {(step.channel || "") === "sms" && (
        <>
          <div className="text-tiny font-mono text-fg-tertiary mb-0.5">SMS Body</div>
          <p className="text-tiny text-fg-tertiary mb-1">Short message. Merge fields supported: {'{{'}first_name{'}}'}, {'{{'}company{'}}'}, etc.</p>
          <textarea value={step.body || ""} onChange={(e) => updateStep({ body: e.target.value })}
            rows={2} maxLength={160} className="w-full border border-line-default px-2 py-1.5 rounded font-mono text-tiny text-fg"
            placeholder="Hi {{first_name}}, quick reminder about {{company}}..." />
          <div className="text-tiny text-fg-tertiary mt-0.5">{(step.body || "").length}/160 characters</div>
          <div className="mt-1.5 flex items-center gap-2">
            <label className="text-tiny text-fg-tertiary font-mono">day</label>
            <input type="number" min={0} value={step.day}
              onChange={(e) => updateStep({ day: Number(e.target.value) })}
              className="w-14 border border-line-default px-1.5 py-0.5 rounded font-mono text-tiny text-fg" />
          </div>
        </>
      )}

      {(step.channel || "") === "whatsapp" && (
        <>
          <div className="text-tiny font-mono text-fg-tertiary mb-0.5">WhatsApp Message</div>
          <p className="text-tiny text-fg-tertiary mb-1">Merge fields supported. Keep it conversational.</p>
          <textarea value={step.body || ""} onChange={(e) => updateStep({ body: e.target.value })}
            rows={3} className="w-full border border-line-default px-2 py-1.5 rounded font-mono text-tiny text-fg"
            placeholder="Hi {{first_name}}, wanted to share something relevant for {{company}}..." />
          <div className="mt-1.5 flex items-center gap-2">
            <label className="text-tiny text-fg-tertiary font-mono">day</label>
            <input type="number" min={0} value={step.day}
              onChange={(e) => updateStep({ day: Number(e.target.value) })}
              className="w-14 border border-line-default px-1.5 py-0.5 rounded font-mono text-tiny text-fg" />
          </div>
        </>
      )}

      {(step.channel || "") === "linkedin_message" && (
        <>
          <div className="text-tiny font-mono text-fg-tertiary mb-0.5">LinkedIn Message</div>
          <p className="text-tiny text-fg-tertiary mb-1">This will be marked as a manual task — LinkedIn Messages require sending via LinkedIn.com</p>
          <textarea value={step.linkedin_message || step.body || ""} onChange={(e) => updateStep({ linkedin_message: e.target.value })}
            rows={3} className="w-full border border-line-default px-2 py-1.5 rounded font-mono text-tiny text-fg"
            placeholder="Hi {{first_name}}, noticed {{company}}'s recent work on..." />
          <div className="mt-1.5 flex items-center gap-2">
            <label className="text-tiny text-fg-tertiary font-mono">day</label>
            <input type="number" min={0} value={step.day}
              onChange={(e) => updateStep({ day: Number(e.target.value) })}
              className="w-14 border border-line-default px-1.5 py-0.5 rounded font-mono text-tiny text-fg" />
          </div>
        </>
      )}

      {(step.channel || "") === "linkedin_comment" && (
        <>
          <div className="text-tiny font-mono text-fg-tertiary mb-0.5">Post URL to comment on</div>
          <input value={step.linkedin_post_url || ""} onChange={(e) => updateStep({ linkedin_post_url: e.target.value })}
            className="w-full border border-line-default px-2 py-1.5 rounded text-tiny text-fg"
            placeholder="https://www.linkedin.com/posts/..." />
          <div className="text-tiny font-mono text-fg-tertiary mt-1.5 mb-0.5">Comment text</div>
          <textarea value={step.linkedin_comment_text || step.body || ""} onChange={(e) => updateStep({ linkedin_comment_text: e.target.value })}
            rows={3} className="w-full border border-line-default px-2 py-1.5 rounded font-mono text-tiny text-fg"
            placeholder="Great insight, {{first_name}}! I'd add that..." />
          <div className="mt-1.5 flex items-center gap-2">
            <label className="text-tiny text-fg-tertiary font-mono">day</label>
            <input type="number" min={0} value={step.day}
              onChange={(e) => updateStep({ day: Number(e.target.value) })}
              className="w-14 border border-line-default px-1.5 py-0.5 rounded font-mono text-tiny text-fg" />
          </div>
        </>
      )}

      {(step.channel || "") === "linkedin_connect" && (
        <>
          <div className="flex items-center gap-1 text-warning mb-1">
            <AlertTriangle size={12} />
            <span className="text-tiny font-medium">Manual action required</span>
          </div>
          <p className="text-tiny text-fg-tertiary mb-1.5">LinkedIn doesn't allow automating connection requests. The lead's LinkedIn URL will be shown so you can connect manually.</p>
          <div className="text-tiny font-mono text-fg-tertiary mb-0.5">Connection note (optional)</div>
          <textarea value={step.linkedin_connection_note || step.body || ""} onChange={(e) => updateStep({ linkedin_connection_note: e.target.value })}
            rows={2} className="w-full border border-line-default px-2 py-1.5 rounded font-mono text-tiny text-fg"
            placeholder="Hi {{first_name}}, I've been following {{company}}'s work..." />
          <div className="mt-1.5 flex items-center gap-2">
            <label className="text-tiny text-fg-tertiary font-mono">day</label>
            <input type="number" min={0} value={step.day}
              onChange={(e) => updateStep({ day: Number(e.target.value) })}
              className="w-14 border border-line-default px-1.5 py-0.5 rounded font-mono text-tiny text-fg" />
          </div>
        </>
      )}
      {templatePicker && (
        <TemplatePickerModal
          onClose={() => setTemplatePicker(false)}
          onPick={(t) => {
            updateStep({ body_html: t.html || "", body: t.body || "", subject: t.subject || "" });
            setTemplatePicker(false);
            toast.success(`Template "${t.name}" inserted into this step`);
          }}
        />
      )}
    </>
  );
}

function SequenceSection({ steps, activeStep, setActiveStep, addStep, removeStep, updateStep, step }) {
  const channelIcons = { email: <Mail size={12} />, phone_call: <Phone size={12} />, sms: <MessageSquare size={12} />, whatsapp: <MessageCircle size={12} />, linkedin_connect: <Send size={12} />, linkedin_message: <Send size={12} />, linkedin_comment: <MessageCircle size={12} /> };
  return (
    <div className="space-y-3">
      <CollapsibleCard title="Sequence" testid="collapse-sequence-steps" className="">
        <div className="flex items-stretch gap-0 overflow-x-auto pb-1">
          {steps.map((s, i) => (
            <div key={s._key || i} className="flex items-center shrink-0">
              <div onClick={() => setActiveStep(i)} data-testid={`step-${i}`}
                className={`text-left px-3 py-2 border rounded-xl transition-colors duration-150 min-w-[140px] cursor-pointer ${i === activeStep ? "border-primary bg-surfacehover" : "border-line-default hover:bg-surfacehover"}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-fg-tertiary">
                    {channelIcons[s.channel || "email"] || <Mail size={12} />}
                    <span className="text-tiny font-mono">Step {i + 1}</span>
                  </div>
                  <span className="text-tiny font-mono text-fg-tertiary">day {s.day}</span>
                </div>
                <div className="text-caption font-medium mt-0.5 truncate max-w-[160px]">{s.subject || CHANNELS.find((c) => c.key === (s.channel || "email"))?.label || "Email"}</div>
                {i > 0 && s.condition && s.condition !== "always" && (
                  <div className={`inline-block mt-1 px-1.5 py-0.5 rounded-sm text-tiny font-mono ${
                    s.condition === "if_no_reply" ? "bg-warning/10 text-warning" :
                    s.condition === "if_replied" ? "bg-success/10 text-success" :
                    s.condition === "if_opened_no_reply" ? "bg-accent-soft text-primary" :
                    "bg-neutral-100 text-fg-tertiary"
                  }`}>
                    {s.condition.replace("if_", "").replace(/_/g, " ")}
                  </div>
                )}
                {steps.length > 1 && (
                  <button onClick={(e) => { e.stopPropagation(); removeStep(i); }} data-testid={`remove-step-${i}`}
                    className="block text-tiny text-fg-tertiary hover:text-danger mt-1">
                    <Trash2 size={10} className="inline" /> remove
                  </button>
                )}
              </div>
              {i < steps.length - 1 && <div className="w-4 h-px bg-line shrink-0 self-center" />}
            </div>
          ))}
          <button onClick={addStep} data-testid="add-step" className="btn-ghost shrink-0 text-tiny ml-2 self-center"><Plus size={14} /> Add step</button>
        </div>
      </CollapsibleCard>

      <CollapsibleCard title="Draft editor" testid="collapse-sequence-editor" className="">
        <div className="flex items-center gap-1 mb-3 pb-3 border-b border-line-default flex-wrap">
          <div className="text-tiny font-mono text-fg-tertiary shrink-0">Channel</div>
          <div className="flex flex-wrap gap-0.5">
            {CHANNELS.map((ch) => {
              const active = (step.channel || "email") === ch.key;
              return (
                <button key={ch.key} onClick={() => updateStep({ channel: ch.key })}
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg text-tiny font-medium transition-colors ${active ? "bg-primary text-white" : "bg-ds-active text-fg-tertiary hover:text-fg"}`}>
                  {channelIcons[ch.key]} {ch.label}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-1 ml-auto">
            <label className="text-tiny text-fg-tertiary font-mono">Condition</label>
            <select value={step.condition || "always"} onChange={(e) => updateStep({ condition: e.target.value })}
              className="border border-line-default px-1.5 py-1 rounded text-tiny font-mono bg-ds-surface">
              <option value="always">Always send</option>
              <option value="if_no_reply">If no reply</option>
              <option value="if_opened_no_reply">If opened, no reply</option>
              <option value="if_replied">If replied</option>
              <option value="if_clicked">If clicked</option>
              <option value="if_not_opened">If not opened</option>
              <option value="if_bounced">If bounced</option>
            </select>
          </div>
        </div>
        <ChannelEditor step={step} updateStep={updateStep} />
      </CollapsibleCard>
    </div>
  );
}

function EqPanel({ eq, setShowEqPanel }) {
  return (
    <aside className="w-full lg:w-72 shrink-0 shadow-card rounded-2xl bg-ds-surface p-4 sm:p-5 relative self-start">
      <button onClick={() => setShowEqPanel(false)}
        className="absolute top-3 right-3 w-4 h-4 flex items-center justify-center rounded hover:bg-ds-hover text-fg-tertiary hover:text-fg transition-colors"
        title="Hide EQ panel">
        <ChevronRight size={12} />
      </button>
      <div className="ui-label text-fg">EQ Score</div>
      <div className="font-mono text-2xl sm:text-3xl font-bold tracking-tight mt-1"
        style={{ color: eq ? (eq.overall > 70 ? "#212025" : eq.overall > 40 ? "#5A5A63" : "#B33636") : "#8A8B86" }}>
        {eq?.overall ?? "—"}
      </div>
      <div className="mt-4 space-y-3">
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
              <span className="font-mono text-fg-secondary">{v}</span>
            </div>
            <div className="h-1 mt-1 bg-line rounded-full overflow-hidden">
              <div className="h-full bg-accent" style={{ width: `${v}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-6 ui-label mb-1.5">Hints</div>
      <ul className="space-y-2 text-caption text-fg-secondary">
        {eq?.hints?.length ? eq.hints.map((h) => (
          <li key={h} className="border-l-2 border-sanguine pl-2">{h}</li>
        )) : <li className="text-fg-tertiary">Looking sharp. Send it.</li>}
      </ul>
    </aside>
  );
}

function TemplatePickerModal({ onClose, onPick }) {
  const [items, setItems] = useState(null);
  useEffect(() => {
    api.get("/email-templates").then((r) => setItems(r.data?.items || [])).catch(() => setItems([]));
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-ds-surface rounded-lg shadow-card p-5 w-full max-w-xl mx-4 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-subheading font-display font-semibold">Insert template</div>
          <button onClick={onClose} className="btn-ghost text-caption">Close</button>
        </div>
        <p className="text-tiny text-fg-tertiary mb-3">
          Picks the template's rendered body (blocks, accent colour, signature and compliance footer included) into this step.
        </p>
        <div className="flex-1 overflow-y-auto space-y-2">
          {items === null ? (
            <div className="text-caption text-fg-tertiary py-6 text-center">Loading templates…</div>
          ) : items.length === 0 ? (
            <div className="text-caption text-fg-tertiary py-6 text-center">
              No templates yet — build one in Templates.
            </div>
          ) : items.map((t) => (
            <button key={t.id} onClick={() => onPick(t)} data-testid={`picker-template-${t.id}`}
              className="w-full text-left border border-line-default rounded-lg p-3 hover:border-primary transition-colors">
              <div className="flex items-center justify-between gap-2">
                <div className="text-caption font-medium text-fg truncate">{t.name}</div>
                <div className="text-tiny font-mono text-fg-tertiary shrink-0">EQ {t.eq_score}</div>
              </div>
              <div className="text-tiny text-fg-tertiary mt-0.5 truncate">{t.subject || "No subject"}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function SignatureModal({ onClose, signatureName, setSignatureName, signatureHtml, setSignatureHtml, savingSignature, onCreate }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-ds-surface rounded-lg shadow-card p-5 w-full max-w-xl mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-subheading font-display font-semibold">Create Signature</div>
          <button onClick={onClose} className="btn-ghost text-caption">Close</button>
        </div>
        <div className="space-y-2">
          <input value={signatureName} onChange={(e) => setSignatureName(e.target.value)}
            className="w-full border border-line-default rounded-lg px-3 py-1.5 text-caption"
            placeholder="Signature name (e.g. My Standard Signature)" />
          <RichEmailEditor
            value={signatureHtml}
            onChange={setSignatureHtml}
            placeholder="Paste or compose your signature here — add images, links, and formatting..."
          />
          {signatureHtml && (
            <div className="bg-canvas border border-line-default rounded-lg p-3 text-caption">
              <div className="text-tiny font-mono uppercase text-fg-tertiary mb-1">Preview</div>
              <div className="border-t border-line-default pt-2 mt-1 signature-preview" dangerouslySetInnerHTML={{ __html: signatureHtml }} />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="btn-secondary text-caption">Cancel</button>
            <button onClick={onCreate} disabled={savingSignature} className="btn-primary text-caption">
              {savingSignature ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              Create
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReviewAndSendView({
  campaignLeads, leadStats, regenerateAllEmails, regeneratingAll, rejectAllEmails, dismissAllEmails, approveAllEmails,
  selectedReview, setSelectedReview, bulkSetReviewStatus,
  getReviewEmails, reviewIndex, setReviewIndex, steps, activeStep,
  previewStep, changePreviewStep,
  includeSignature, signatures, signatureId,
  reviewCollapsed, setReviewCollapsed, genProgress, toggleReviewSelected,
  prevReview, nextReview, sendTestEmail, sendingTest, isTemplate,
  editingOpener, setEditingOpener, regenerateOpener, generatingEmail, saveOpener,
  mailboxView, setMailboxView, fillMergeFields, name,
  approveEmail, rejectEmail, deleteLeadEmail,
}) {
  const reviewEmails = getReviewEmails();
  const current = reviewEmails[reviewIndex];
  // Mirrors the real send + test-send append (sender.py / server.py) —
  // the preview must show exactly what would actually go out.
  const activeSignatureHtml = includeSignature
    ? signatures.find((s) => s.id === signatureId)?.content_html || ""
    : "";

  const rail = reviewEmails.length > 0 && (
    reviewCollapsed.leadRail ? (
      <button onClick={() => setReviewCollapsed((prev) => ({ ...prev, leadRail: false }))}
        className="shadow-card rounded-lg bg-ds-surface overflow-hidden flex items-center justify-center py-6 cursor-pointer hover:bg-surfacehover transition-colors"
        title="Expand leads panel">
        <ChevronRight size={13} className="text-fg-tertiary" />
      </button>
    ) : (
    <div className="shadow-card rounded-lg bg-ds-surface overflow-hidden flex flex-col max-h-[calc(100vh-280px)]">
      <div className="px-2.5 py-1.5 border-b border-line-default flex items-center justify-between cursor-pointer" onClick={() => setReviewCollapsed((prev) => ({ ...prev, leadRail: !prev.leadRail }))}>
        <div className="flex items-center gap-1">
          <ChevronLeft size={11} className="text-fg-tertiary" />
          <span className="text-[11px] font-mono text-fg-tertiary">Leads</span>
        </div>
        <input type="checkbox" onClick={(e) => e.stopPropagation()}
          checked={selectedReview.length === reviewEmails.length}
          onChange={(e) => setSelectedReview(e.target.checked ? reviewEmails.map((l) => l.id) : [])}
          title="Select all" />
      </div>
      <div className="px-2.5 py-1 border-b border-line-default flex items-center gap-2">
        <input type="range" min={0} max={Math.max(0, reviewEmails.length - 1)} value={reviewIndex}
          onChange={(e) => setReviewIndex(Number(e.target.value))}
          className="flex-1 h-0.5 accent-primary cursor-pointer" />
        <span className="text-[10.5px] text-fg-tertiary font-mono shrink-0">{reviewIndex + 1}/{reviewEmails.length}</span>
      </div>
      <div className="overflow-y-auto flex-1">
        {reviewEmails.map((l, i) => (
          <div key={l.id}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 border-b border-line-default cursor-pointer hover:bg-surfacehover transition-colors ${i === reviewIndex ? "bg-accent-soft" : ""}`}
            onClick={() => setReviewIndex(i)}>
            <input type="checkbox" onClick={(e) => e.stopPropagation()}
              checked={selectedReview.includes(l.id)} onChange={() => toggleReviewSelected(l.id)} />
            <span className={`w-1 h-1 rounded-full shrink-0 ${l.email_status === "approved" ? "bg-success" : l.email_status === "rejected" ? "bg-danger" : l.personalized ? "bg-warning" : "bg-ink-disabled"}`} />
            <span className="text-[11px] truncate flex-1">{l.first_name} {l.last_name}</span>
          </div>
        ))}
      </div>
    </div>
    )
  );

  return (
    <div className="px-2.5 sm:px-3 py-2 space-y-2">
      {campaignLeads.length > 0 && (
        <div className="shadow-card rounded-lg bg-ds-surface">
          <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 flex-wrap">
            {selectedReview.length === 0 ? (
              <>
                <div className="text-[11px] text-fg-tertiary">
                  <span className="font-medium text-fg">{leadStats.approved}</span> approved · {" "}
                  <span className="font-medium text-fg">{leadStats.rejected}</span> rejected · {" "}
                  <span className="font-medium text-fg">{leadStats.total - leadStats.reviewed}</span> awaiting review
                  <button onClick={dismissAllEmails} disabled={leadStats.total === 0}
                    className="ml-2 text-danger/50 hover:text-danger underline decoration-dotted underline-offset-2">
                    Delete all
                  </button>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={regenerateAllEmails} disabled={regeneratingAll || leadStats.total === 0}
                    className="btn-ghost text-[11px]" data-testid="regenerate-all-emails">
                    {regeneratingAll ? <Loader2 size={10} className="animate-spin" /> : <RotateCw size={10} />} Regenerate all
                  </button>
                  <button onClick={rejectAllEmails} disabled={leadStats.total === 0}
                    className="btn-ghost text-[11px]" data-testid="reject-all-emails">
                    <Flag size={10} /> Reject all
                  </button>
                  <button onClick={approveAllEmails} disabled={leadStats.total === 0}
                    className="btn-secondary text-[11px]" data-testid="approve-all-emails">
                    <Check size={10} /> Approve all
                  </button>
                </div>
              </>
            ) : (
              <>
                <span className="text-[11px] font-medium">{selectedReview.length} selected</span>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => setSelectedReview([])}
                    className="btn-ghost text-[11px] text-fg-tertiary">Clear</button>
                  <button onClick={() => bulkSetReviewStatus("rejected")}
                    className="btn-ghost text-[11px]" data-testid="bulk-reject">
                    <Flag size={10} /> Reject selected
                  </button>
                  <button onClick={() => bulkSetReviewStatus("approved")}
                    className="btn-primary text-[11px]" data-testid="bulk-approve">
                    <Check size={10} /> Approve selected
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div className={`grid grid-cols-1 gap-3 h-full ${
        reviewCollapsed.leadRail
          ? "lg:grid-cols-[48px_1fr]"
          : "lg:grid-cols-[220px_1fr]"
      }`}>
        {!current ? (
          <>
            {rail}
            <div className="shadow-card rounded-lg bg-ds-surface p-8 text-center">
              {genProgress ? (
                <>
                  <Loader2 size={14} className="animate-spin mx-auto text-fg-tertiary mb-2" />
                  <div className="text-tiny font-medium">
                    Generating personalized emails… {genProgress.done}/{genProgress.total || "?"}
                  </div>
                  <div className="text-tiny text-fg-tertiary mt-1">This updates live — no need to refresh.</div>
                  {genProgress.total > 0 && (
                    <div className="h-1 max-w-xs mx-auto mt-3 bg-line rounded-full overflow-hidden">
                      <div className="h-full bg-accent transition-all duration-500" style={{ width: `${Math.min(100, (genProgress.done / genProgress.total) * 100)}%` }} />
                    </div>
                  )}
                </>
              ) : (
                <>
                  <Mail size={14} className="mx-auto text-fg-tertiary mb-2" />
                  <div className="text-tiny font-medium text-fg-tertiary">
                    {leadStats.total === 0 ? "No leads assigned yet" : "Select a lead to preview"}
                  </div>
                  <p className="text-tiny text-fg-tertiary mt-1 max-w-sm mx-auto">
                    {leadStats.total === 0
                      ? "Assign leads from the Audience section — every lead previews with your template's merge fields filled in, even before you generate."
                      : "Pick a lead from the list on the left to see its preview."}
                  </p>
                </>
              )}
            </div>
          </>
        ) : (
          <>
            {rail}
            {/* Preview - always expanded, takes remaining space */}
            <div className="shadow-card rounded-lg bg-ds-surface">
              {steps.length > 1 && (
                <div className="px-2.5 py-1.5 border-b border-line-default flex items-center gap-1.5 flex-wrap" data-testid="preview-step-tabs">
                  <span className="text-[10.5px] text-fg-tertiary font-mono mr-0.5">STEP</span>
                  {steps.map((s, i) => (
                    <button key={i} onClick={() => changePreviewStep(i)}
                      data-testid={`preview-step-${i}`}
                      title={s?.subject || `Step ${i + 1}`}
                      className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${i === previewStep ? "border-primary bg-surfacehover font-medium" : "border-line-default text-fg-tertiary hover:bg-surfacehover"}`}>
                      {i + 1}
                      <span className="text-[10px] text-fg-tertiary ml-1 font-mono">
                        {s?.day ? `+${s.day}d` : "d0"}
                      </span>
                    </button>
                  ))}
                  {previewStep > 0 && (
                    <span className="text-[10px] text-fg-tertiary ml-1">
                      Follow-up — shows this step's template with each lead's opener applied.
                    </span>
                  )}
                </div>
              )}
              <div className="px-2.5 py-1.5 border-b border-line-default flex items-center justify-between gap-2">
                <div className="flex items-center gap-1 min-w-0">
                  <button onClick={prevReview} disabled={reviewIndex === 0} className="btn-ghost text-[11px] px-1 py-0.5 disabled:opacity-30"><ChevronLeft size={10} /></button>
                  <span className="text-[10.5px] text-fg-tertiary font-mono shrink-0">{reviewIndex + 1}/{reviewEmails.length}</span>
                  <button onClick={nextReview} disabled={reviewIndex >= reviewEmails.length - 1} className="btn-ghost text-[11px] px-1 py-0.5 disabled:opacity-30"><ChevronRight size={10} /></button>
                  <span className="text-[11px] truncate max-w-[120px] font-medium ml-1">{current.first_name} {current.last_name}</span>
                  <span className={`text-[10px] font-mono px-1 py-0.5 rounded-full shrink-0 ${current.email_status === "approved" ? "bg-success/10 text-success" : current.email_status === "rejected" ? "bg-danger/10 text-danger" : "bg-warning/10 text-warning"}`}>
                    {current.email_status === "approved" ? "✓" : current.email_status === "rejected" ? "✗" : "~"}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => sendTestEmail(current.id)} disabled={sendingTest} className="btn-ghost text-[11px] flex items-center gap-1" data-testid="send-test-email" title="Email this exact preview to yourself">
                    {sendingTest ? <Loader2 size={9} className="animate-spin" /> : <Send size={9} />} Send
                  </button>
                  {!isTemplate && (
                    <>
                      {editingOpener?.leadId === current.id ? (
                        <button onClick={() => setEditingOpener(null)} className="btn-ghost text-[11px]"><X size={11} /> Cancel</button>
                      ) : (
                        <button onClick={() => setEditingOpener({ leadId: current.id, opener: current.personalized_opener })} className="btn-ghost text-[11px] flex items-center gap-1">
                          <Edit2 size={11} /> {current.personalized_opener ? "Opener" : "Add opener"}
                        </button>
                      )}
                      <button onClick={() => regenerateOpener(current.id)} disabled={generatingEmail === current.id} className="btn-ghost text-[11px] flex items-center gap-1">
                        <RotateCw size={11} className={generatingEmail === current.id ? "animate-spin" : ""} /> {current.personalized ? "Regenerate" : "Generate"}
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="p-2.5 space-y-1.5 max-h-[calc(100vh-280px)] overflow-y-auto">
                  {!isTemplate && editingOpener?.leadId === current.id && (
                    <div className="bg-canvas border border-line-default rounded-xl p-2.5 space-y-1.5">
                      <div className="text-[11px] font-mono text-fg-tertiary">
                        {current.personalized_opener ? "Edit personalized opener" : "Write an opener"}
                      </div>
                      <textarea value={editingOpener.opener} onChange={(e) => setEditingOpener({ ...editingOpener, opener: e.target.value })}
                        rows={2} placeholder="A one-line hook personal to this lead…"
                        className="w-full border border-line-default px-2 py-1 rounded-lg text-tiny font-sans" />
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setEditingOpener(null)} className="btn-secondary text-[11px]">Cancel</button>
                        <button onClick={() => saveOpener(current.id, editingOpener.opener)} disabled={!editingOpener.opener?.trim()} className="btn-primary text-[11px]"><Check size={11} /> Save</button>
                      </div>
                    </div>
                  )}
                  <div>
                    <div className="flex items-center justify-between mb-0.5">
                      <div className="text-[10.5px] text-fg-tertiary font-mono">SUBJECT</div>
                      <button onClick={() => setMailboxView(!mailboxView)}
                        className="text-[10.5px] text-fg-tertiary hover:text-fg flex items-center gap-1 transition-colors">
                        {mailboxView ? <Edit2 size={10} /> : <Eye size={10} />}
                        {mailboxView ? "Edit view" : "Mailbox view"}
                      </button>
                    </div>
                    <div className="text-tiny font-semibold font-mono text-fg-secondary border border-line-default rounded-xl px-2.5 py-1.5">
                      {fillMergeFields(current.email_subject || "(no subject)", current)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10.5px] text-fg-tertiary mb-0.5 font-mono">BODY</div>
                    {mailboxView ? (
                      <div className="border border-line-default rounded-xl bg-ds-surface overflow-hidden">
                        <div className="text-tiny text-fg-tertiary px-3 py-1.5 border-b border-line-default space-y-0.5 font-mono">
                          <div><span className="font-medium text-fg">From:</span> {name || "PitchEQ"}</div>
                          <div><span className="font-medium text-fg">To:</span> {current.email || "lead@example.com"}</div>
                          <div><span className="font-medium text-fg">Date:</span> {new Date().toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true })}</div>
                        </div>
                        <div className="p-2.5 text-tiny text-fg leading-relaxed prose-email">
                          {current.email_body_html ? (
                            <div dangerouslySetInnerHTML={{ __html: fillMergeFields(current.email_body_html, current) + (activeSignatureHtml ? "<br><br>" + activeSignatureHtml : "") }} />
                          ) : (
                            <div className="whitespace-pre-wrap font-sans">
                              {fillMergeFields(current.email_body, current)}
                              {activeSignatureHtml && <div className="mt-2" dangerouslySetInnerHTML={{ __html: activeSignatureHtml }} />}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="max-h-96 overflow-y-auto text-tiny text-fg-secondary whitespace-pre-wrap font-sans leading-relaxed border border-line-default rounded-xl p-2.5 bg-ds-surface prose-email">
                        {current.email_body || current.email_body_html ? (
                          <div dangerouslySetInnerHTML={{ __html: fillMergeFields(current.email_body_html || current.email_body?.replace(/\n/g, "<br>") || "", current) + (activeSignatureHtml ? "<br><br>" + activeSignatureHtml : "") }} />
                        ) : (
                          <div className="text-fg-tertiary italic">No content</div>
                        )}
                      </div>
                    )}
                    {activeSignatureHtml && (
                      <div className="flex items-center gap-1 text-[10.5px] text-fg-tertiary mt-1">
                        <Signature size={10} /> Signature included in preview
                      </div>
                    )}
                    {/\{\{\s*\w+\s*\}\}/.test(current.email_body || "") && (
                      <div className="flex items-center gap-1 text-[10.5px] text-warning mt-1">
                        <AlertTriangle size={10} /> Contains an unresolved merge field — this lead may be missing that field.
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 pt-2 border-t border-line-default">
                    {isTemplate ? (
                      current.email_status === "approved" ? (
                        <>
                          <span className="flex items-center gap-1 text-tiny text-success font-medium"><Check size={11} /> Approved</span>
                          <button onClick={() => rejectEmail(current.id)} className="btn-ghost text-tiny text-danger flex items-center gap-1 ml-auto"><Flag size={11} /> Reject</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => approveEmail(current.id)} className="btn-primary text-tiny flex items-center gap-1"><Check size={11} /> Approve</button>
                          <button onClick={() => rejectEmail(current.id)} className="btn-ghost text-tiny text-danger flex items-center gap-1"><Flag size={11} /> Reject</button>
                        </>
                      )
                    ) : (
                      !current.personalized ? (
                        <span className="text-tiny text-fg-tertiary">Write an opener above (or generate one) to enable approval.</span>
                      ) : current.email_status === "approved" ? (
                        <>
                          <span className="flex items-center gap-1 text-tiny text-success font-medium"><Check size={11} /> Approved</span>
                          <button onClick={() => rejectEmail(current.id)} className="btn-ghost text-tiny text-danger flex items-center gap-1 ml-auto"><Flag size={11} /> Reject</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => approveEmail(current.id)} className="btn-primary text-tiny flex items-center gap-1"><Check size={11} /> Approve</button>
                          <button onClick={() => rejectEmail(current.id)} className="btn-ghost text-tiny text-danger flex items-center gap-1"><Flag size={11} /> Reject</button>
                        </>
                      )
                    )}
                    {current.personalized && (
                      <button onClick={() => deleteLeadEmail(current.id)} className="btn-ghost text-tiny text-fg-tertiary hover:text-danger ml-auto flex items-center gap-1"><Trash2 size={11} /> Remove</button>
                    )}
                  </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
