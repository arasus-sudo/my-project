import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { createRoot } from "react-dom/client";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Sparkles, Download, FileDown, Send } from "lucide-react";
import BoardView from "../components/creq/BoardView";
import ElementRender from "../components/creq/ElementRender";
import { PALETTES, CANVAS } from "../lib/creqTemplates";
import { renderBackground } from "../components/creq/utils";

export default function ProposalBuilder() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const isNew = !id || id === "new";

  const [leads, setLeads] = useState([]);
  const [leadId, setLeadId] = useState(params.get("lead_id") || "");
  const [topic, setTopic] = useState("");
  const [includePricing, setIncludePricing] = useState(true);
  const [proposal, setProposal] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isNew) api.get("/leads").then((r) => setLeads(r.data));
    else api.get(`/proposal-eq/proposals/${id}`).then((r) => setProposal(r.data));
  }, [id, isNew]);

  const generate = async () => {
    if (!leadId) { toast.error("Pick a lead"); return; }
    setBusy(true);
    try {
      const { data } = await api.post("/proposal-eq/generate", { lead_id: leadId, topic, include_pricing: includePricing });
      toast.success("Proposal generated");
      nav(`/app/proposal-eq/${data.id}`, { replace: true });
    } catch (err) { toast.error(err?.response?.data?.detail || "Generation failed"); }
    finally { setBusy(false); }
  };

  const markSent = async () => {
    await api.post(`/proposal-eq/proposals/${id}/mark-sent`);
    toast.success("Marked as sent");
    setProposal({ ...proposal, status: "sent" });
  };

  const exportPptx = async () => {
    setBusy(true);
    try {
      const { data } = await api.get(`/proposal-eq/proposals/${id}/export.pptx`, { responseType: "blob" });
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url; a.download = `${(proposal.topic || "proposal").slice(0, 40).replace(/\W+/g, "-")}.pptx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("PPTX downloaded");
    } catch { toast.error("PPTX export failed"); }
    finally { setBusy(false); }
  };

  const palette = PALETTES.find((p) => p.id === proposal?.palette_id) || PALETTES[0];

  const renderSlideToDataUrl = (slideIdx) => new Promise((resolve, reject) => {
    const slide = proposal.slides[slideIdx];
    const host = document.createElement("div");
    host.style.cssText = [
      "position:fixed", "left:-99999px", "top:0",
      `width:${CANVAS.w}px`, `height:${CANVAS.h}px`,
      `background:${renderBackground(slide.bg, palette)}`,
      "overflow:hidden", "pointer-events:none",
    ].join(";");
    document.body.appendChild(host);
    const root = createRoot(host);
    const cleanup = () => { try { root.unmount(); } catch {} try { host.remove(); } catch {} };
    (async () => {
      try {
        root.render(<>{slide.elements.map((el) => (
          <ElementRender key={el.id} el={el} palette={palette} selected={false} onPointerDown={() => {}} />
        ))}</>);
        await new Promise((r) => setTimeout(r, 150));
        const canvas = await html2canvas(host, {
          width: CANVAS.w, height: CANVAS.h, windowWidth: CANVAS.w, windowHeight: CANVAS.h,
          scale: 2, useCORS: true, allowTaint: true, backgroundColor: null, logging: false,
        });
        const dataUrl = canvas.toDataURL("image/png", 0.92);
        cleanup(); resolve(dataUrl);
      } catch (err) { cleanup(); reject(err); }
    })();
  });

  const exportPdf = async () => {
    setBusy(true);
    try {
      const pdf = new jsPDF({ orientation: "portrait", unit: "px", format: [CANVAS.w, CANVAS.h], compress: true });
      for (let i = 0; i < proposal.slides.length; i++) {
        const dataUrl = await renderSlideToDataUrl(i);
        if (i > 0) pdf.addPage([CANVAS.w, CANVAS.h], "portrait");
        pdf.addImage(dataUrl, "PNG", 0, 0, CANVAS.w, CANVAS.h);
      }
      pdf.save(`${(proposal.topic || "proposal").slice(0, 40).replace(/\W+/g, "-")}.pdf`);
      toast.success("PDF exported");
    } catch (err) { console.error(err); toast.error("PDF export failed"); }
    finally { setBusy(false); }
  };

  if (isNew) {
    return (
      <div>
        <PageHeader title="New proposal" subtitle="Proposal EQ researches the lead and drafts a deck from your CRM data." />
        <div className="p-6 max-w-xl">
          <div className="card-flat p-5 space-y-4">
            <div>
              <label className="ui-label block mb-1">Lead</label>
              <select value={leadId} onChange={(e) => setLeadId(e.target.value)} data-testid="proposal-lead-select"
                className="w-full border border-line px-3 py-2 rounded-sm">
                <option value="">Select a lead…</option>
                {leads.map((l) => <option key={l.id} value={l.id}>{l.first_name} {l.last_name} — {l.company || l.email}</option>)}
              </select>
            </div>
            <div>
              <label className="ui-label block mb-1">Topic / context (optional)</label>
              <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Q3 partnership proposal"
                data-testid="proposal-topic" className="w-full border border-line px-3 py-2 rounded-sm" />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={includePricing} onChange={(e) => setIncludePricing(e.target.checked)} data-testid="proposal-include-pricing" />
              Include pricing slide from your catalog
            </label>
            <button onClick={generate} disabled={busy} data-testid="generate-proposal-btn" className="btn-primary w-full justify-center">
              <Sparkles size={14} /> {busy ? "Researching & drafting…" : "Generate proposal"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!proposal) return <div className="p-10 text-neutral-500 text-sm">Loading…</div>;

  const proj = { slides: proposal.slides, panorama: null };

  return (
    <div>
      <PageHeader
        title={proposal.topic}
        subtitle={proposal.research_notes ? "Researched and drafted by Proposal EQ." : "Drafted by Proposal EQ."}
        right={
          <div className="flex gap-2">
            <button onClick={exportPdf} disabled={busy} data-testid="export-pdf-btn" className="btn-secondary"><FileDown size={14} /> PDF</button>
            <button onClick={exportPptx} disabled={busy} data-testid="export-pptx-btn" className="btn-secondary"><Download size={14} /> PPTX</button>
            {proposal.status === "draft" && (
              <button onClick={markSent} data-testid="mark-sent-btn" className="btn-primary"><Send size={14} /> Mark sent</button>
            )}
          </div>
        }
      />
      {proposal.research_notes && (
        <div className="px-6 pt-4">
          <div className="card-flat p-4 text-sm text-neutral-600">
            <span className="ui-label text-neutral-400 mr-2">Research</span>
            {proposal.research_notes}
          </div>
        </div>
      )}
      <BoardView proj={proj} palette={palette} onFocus={() => {}} />
    </div>
  );
}
