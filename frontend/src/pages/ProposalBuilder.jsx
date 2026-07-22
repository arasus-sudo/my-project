import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, isCreditError } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import RichEmailEditor, { sanitizeEmailHtml } from "../components/RichEmailEditor";
import { toast } from "sonner";
import {
  FileSignature, FileText, FileDown, Send, Save, Loader2, Check, AlertTriangle,
  Plus, Trash2,
} from "lucide-react";

const CHAIN_STEPS = [
  { key: "solution", label: "Solution" },
  { key: "scope", label: "Scope" },
  { key: "pricing", label: "Pricing" },
  { key: "risks", label: "Risks" },
  { key: "exec", label: "Summary" },
];

const CUR = { USD: "$", EUR: "€", GBP: "£", INR: "₹" };
const money = (n, cur = "USD") => {
  const s = CUR[cur] || "";
  const v = Number(n || 0);
  const body = Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const out = s ? `${s}${body}` : `${body} ${cur}`;
  return v < 0 ? `-${out}` : out;
};

export default function ProposalBuilder() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const isNew = !id || id === "new";

  // ---- New-proposal form ----
  const [leads, setLeads] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [leadId, setLeadId] = useState(params.get("lead_id") || "");
  const [templateId, setTemplateId] = useState("");
  const [busy, setBusy] = useState(false);
  const [chainStep, setChainStep] = useState(null);

  // ---- Editor state ----
  const [proposal, setProposal] = useState(null);
  const [sections, setSections] = useState([]);
  const [pricing, setPricing] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (isNew) {
      api.get("/leads?page_size=2000").then((r) => setLeads(r.data.items || r.data));
      api.get("/proposal-eq/templates").then((r) => {
        setTemplates(r.data);
        if (r.data.length) setTemplateId(r.data.find((t) => t.service === "custom")?.id || r.data[0].id);
      });
    } else {
      api.get(`/proposal-eq/proposals/${id}`).then((r) => {
        setProposal(r.data);
        setSections(r.data.sections || []);
        setPricing(r.data.pricing || null);
      });
      api.get("/proposal-eq/pricing-catalog").then((r) => setCatalog(r.data));
    }
  }, [id, isNew]);

  const template = useMemo(() => templates.find((t) => t.id === templateId), [templates, templateId]);

  const generate = async () => {
    if (!leadId) { toast.error("Pick a lead"); return; }
    setBusy(true);
    setChainStep("solution");
    const timers = CHAIN_STEPS.slice(1).map((s, i) =>
      setTimeout(() => setChainStep(s.key), (i + 1) * 6000));
    try {
      const { data } = await api.post("/proposal-eq/generate", {
        lead_id: leadId, template_id: templateId, service: template?.service || "custom",
      });
      toast.success("Proposal drafted");
      nav(`/app/proposal-eq/${data.id}`, { replace: true });
    } catch (err) {
      if (!isCreditError(err)) toast.error(err?.response?.data?.detail || "Generation failed");
    } finally {
      timers.forEach(clearTimeout);
      setChainStep(null);
      setBusy(false);
    }
  };

  // ---- Editing ----
  const setSectionHtml = useCallback((key, html) => {
    setSections((prev) => prev.map((s) => (s.key === key ? { ...s, html } : s)));
    setDirty(true);
  }, []);

  const recomputeLocal = (p) => {
    const subtotal = (p.line_items || []).reduce((a, li) => a + Number(li.qty || 0) * Number(li.unit_price || 0), 0);
    const discount = subtotal * (Number(p.discount_pct || 0) / 100);
    return { ...p, subtotal, discount, total: subtotal - discount };
  };
  const patchPricing = (patch) => {
    setPricing((prev) => recomputeLocal({
      ...prev, ...patch,
      line_items: (patch.line_items || prev.line_items).map((li) => ({
        ...li, line_total: Number(li.qty || 0) * Number(li.unit_price || 0),
      })),
    }));
    setDirty(true);
  };
  const addLine = (catId) => {
    const item = catalog.find((c) => c.id === catId);
    if (!item) return;
    patchPricing({
      line_items: [...(pricing.line_items || []), {
        catalog_id: item.id, name: item.name, description: item.description || "",
        unit: item.unit || "", qty: 1, unit_price: item.unit_price, line_total: item.unit_price,
      }],
    });
  };
  const removeLine = (idx) =>
    patchPricing({ line_items: pricing.line_items.filter((_, i) => i !== idx) });
  const setQty = (idx, qty) =>
    patchPricing({ line_items: pricing.line_items.map((li, i) => (i === idx ? { ...li, qty: Math.max(1, qty) } : li)) });

  const save = async () => {
    setBusy(true);
    try {
      const { data } = await api.put(`/proposal-eq/proposals/${id}`, {
        sections: sections.map((s) => ({ ...s, html: sanitizeEmailHtml(s.html) })),
        pricing,
      });
      setProposal(data);
      setSections(data.sections);
      setPricing(data.pricing);   // server is the source of truth for totals
      setDirty(false);
      toast.success("Saved");
    } catch { toast.error("Save failed"); }
    finally { setBusy(false); }
  };

  const download = async (fmt) => {
    if (dirty) await save();
    setBusy(true);
    try {
      const { data } = await api.get(`/proposal-eq/proposals/${id}/export.${fmt}`, { responseType: "blob" });
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(proposal.topic || "proposal").slice(0, 50).replace(/[^\w-]+/g, "-")}.${fmt}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${fmt.toUpperCase()} downloaded`);
    } catch { toast.error(`${fmt.toUpperCase()} export failed`); }
    finally { setBusy(false); }
  };

  const markSent = async () => {
    await api.post(`/proposal-eq/proposals/${id}/mark-sent`);
    toast.success("Marked as sent — deal advanced to Proposal");
    setProposal((p) => ({ ...p, status: "sent" }));
  };

  // ---- New-proposal view ----
  if (isNew) {
    return (
      <div>
        <PageHeader title="New proposal"
          subtitle="Proposal EQ assembles everything known about the deal, then drafts a document you can edit." />
        <div className="animate-fade-in px-6 sm:px-8 max-w-xl">
          <div className="shadow-card rounded-2xl p-6 sm:p-8 space-y-4">
            <div>
              <label className="form-label block mb-1">Lead / deal</label>
              <select value={leadId} onChange={(e) => setLeadId(e.target.value)} data-testid="proposal-lead-select"
                className="w-full border border-line px-3 py-2 rounded-full text-input">
                <option value="">Select a lead…</option>
                {leads.map((l) => (
                  <option key={l.id} value={l.id}>{l.first_name} {l.last_name} — {l.company || l.email}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label block mb-1">Proposal type</label>
              <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} data-testid="proposal-template-select"
                className="w-full border border-line px-3 py-2 rounded-full text-input">
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              {template?.blurb && <p className="text-caption text-ink-muted mt-1">{template.blurb}</p>}
            </div>

            <button onClick={generate} disabled={busy} data-testid="generate-proposal-btn"
              className="btn-primary w-full justify-center">
              {chainStep ? <Loader2 size={14} className="animate-spin" /> : <FileSignature size={14} />}
              {chainStep ? "Drafting…" : "Generate proposal"}
            </button>

            {chainStep && (
              <div className="flex items-center gap-1.5 pt-1" data-testid="chain-progress">
                {CHAIN_STEPS.map((s, i) => {
                  const idx = CHAIN_STEPS.findIndex((x) => x.key === chainStep);
                  const done = i < idx, active = s.key === chainStep;
                  return (
                    <div key={s.key} className="flex items-center gap-1.5 flex-1">
                      <span className={`text-tiny font-mono uppercase tracking-wider flex items-center gap-1 ${
                        active ? "text-ink font-semibold" : done ? "text-ink-muted" : "text-ink-disabled"}`}>
                        {done ? <Check size={10} /> : active ? <Loader2 size={10} className="animate-spin" /> : <span className="w-2.5" />}
                        {s.label}
                      </span>
                      {i < CHAIN_STEPS.length - 1 && <div className="flex-1 h-px bg-line" />}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!proposal) return <div className="p-10 text-ink-muted text-body">Loading…</div>;

  return (
    <div>
      <PageHeader
        title={proposal.topic}
        subtitle={`${proposal.template_name || "Proposal"}${proposal.status === "sent" ? " · sent" : ""}`}
        right={
          <div className="flex flex-wrap gap-2">
            <button onClick={save} disabled={busy || !dirty} data-testid="save-proposal-btn"
              className="btn-secondary disabled:opacity-40">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
            </button>
            <button onClick={() => download("docx")} disabled={busy} data-testid="export-docx-btn" className="btn-secondary">
              <FileText size={14} /> DOCX
            </button>
            <button onClick={() => download("pdf")} disabled={busy} data-testid="export-pdf-btn" className="btn-secondary">
              <FileDown size={14} /> PDF
            </button>
            {proposal.status === "draft" && (
              <button onClick={markSent} data-testid="mark-sent-btn" className="btn-primary"><Send size={14} /> Mark sent</button>
            )}
          </div>
        }
      />

      <div className="animate-fade-in px-6 sm:px-8 max-w-3xl mx-auto space-y-5">
        {!!(proposal.missing || []).length && (
          <div className="shadow-card rounded-2xl p-4 border-warning/30 bg-warning/10" data-testid="missing-banner">
            <div className="flex items-start gap-2 text-body text-warning">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              <div>
                <div className="font-medium">Some inputs are missing.</div>
                <div className="text-caption mt-0.5">
                  The draft left these blank rather than inventing them — fill them in:
                  {" "}{proposal.missing.join("; ")}.
                </div>
              </div>
            </div>
          </div>
        )}

        {sections.map((s) => (
          <div key={s.key} className="shadow-card rounded-2xl p-6 sm:p-8" data-testid={`section-${s.key}`}>
            <div className="ui-label mb-2">{s.heading}</div>
            {s.slot === "pricing_table" ? (
              <PricingEditor
                pricing={pricing} catalog={catalog}
                onAdd={addLine} onRemove={removeLine} onQty={setQty}
                onDiscount={(pct) => patchPricing({ discount_pct: pct })}
              />
            ) : (
              <RichEmailEditor value={s.html || ""} onChange={(html) => setSectionHtml(s.key, html)}
                placeholder="Write this section, or leave the drafted copy as-is." />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function PricingEditor({ pricing, catalog, onAdd, onRemove, onQty, onDiscount }) {
  const [pick, setPick] = useState("");
  if (!pricing) return null;
  const cur = pricing.currency || "USD";
  const unused = catalog.filter((c) => !(pricing.line_items || []).some((li) => li.catalog_id === c.id));

  return (
    <div data-testid="pricing-editor">
      <p className="text-caption text-ink-muted mb-3">
        Prices come from your catalog and totals are computed server-side — never set by hand.
      </p>

      {(pricing.line_items || []).length === 0 ? (
        <p className="text-body text-ink-muted py-3">No line items yet — add from your catalog below.</p>
      ) : (
        <div className="overflow-x-auto">
        <table className="w-full text-table" data-testid="pricing-table">
          <thead>
            <tr className="border-b border-line">
              <th className="table-header py-1.5">Item</th>
              <th className="table-header py-1.5 w-16 text-center">Qty</th>
              <th className="table-header py-1.5 w-28 text-right">Unit</th>
              <th className="table-header py-1.5 w-28 text-right">Amount</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {pricing.line_items.map((li, i) => (
              <tr key={i} className="border-b border-line/60">
                <td className="py-1.5">
                  {li.name}{li.unit ? <span className="text-ink-muted"> /{li.unit}</span> : ""}
                </td>
                <td className="py-1.5 text-center">
                  <input type="number" min={1} value={li.qty}
                    onChange={(e) => onQty(i, parseInt(e.target.value, 10) || 1)}
                    data-testid={`qty-${i}`}
                    className="w-14 border border-line rounded px-1 py-0.5 text-center text-input" />
                </td>
                <td className="py-1.5 text-right tabular-nums text-ink-muted">{money(li.unit_price, cur)}</td>
                <td className="py-1.5 text-right tabular-nums font-medium">{money(li.line_total, cur)}</td>
                <td className="py-1.5 text-right">
                  <button onClick={() => onRemove(i)} data-testid={`remove-line-${i}`}
                    className="text-ink-muted hover:text-danger"><Trash2 size={13} /></button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="py-1.5 text-right text-ink-muted">Subtotal</td>
              <td className="py-1.5 text-right tabular-nums">{money(pricing.subtotal, cur)}</td><td></td>
            </tr>
            <tr>
              <td colSpan={3} className="py-1 text-right text-ink-muted">
                Discount
                <input type="number" min={0} max={100} value={pricing.discount_pct || 0}
                  onChange={(e) => onDiscount(Math.max(0, Math.min(100, Number(e.target.value))))}
                  data-testid="discount-pct"
                  className="w-14 border border-line rounded px-1 py-0.5 text-center mx-1 text-input" />%
              </td>
              <td className="py-1 text-right tabular-nums">{pricing.discount ? `-${money(pricing.discount, cur)}` : money(0, cur)}</td><td></td>
            </tr>
            <tr className="border-t border-line">
              <td colSpan={3} className="py-1.5 text-right font-semibold">Total</td>
              <td className="py-1.5 text-right tabular-nums font-semibold" data-testid="pricing-total">{money(pricing.total, cur)}</td><td></td>
            </tr>
          </tfoot>
        </table>
        </div>
      )}

      {unused.length > 0 && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mt-3">
          <select value={pick} onChange={(e) => setPick(e.target.value)} data-testid="add-line-select"
            className="border border-line rounded-full px-3 py-1.5 text-caption flex-1">
            <option value="">Add a line from your catalog…</option>
            {unused.map((c) => <option key={c.id} value={c.id}>{c.name} — {money(c.unit_price, c.currency)}{c.unit ? `/${c.unit}` : ""}</option>)}
          </select>
          <button onClick={() => { if (pick) { onAdd(pick); setPick(""); } }} disabled={!pick}
            data-testid="add-line-btn" className="btn-secondary text-xs disabled:opacity-40"><Plus size={13} /> Add</button>
        </div>
      )}

      {pricing.notes && <p className="text-caption text-ink-muted mt-3 italic">{pricing.notes}</p>}
    </div>
  );
}
