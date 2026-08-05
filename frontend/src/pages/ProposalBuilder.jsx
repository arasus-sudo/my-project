import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, isCreditError } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import RichEmailEditor, { sanitizeEmailHtml } from "../components/RichEmailEditor";
import { toast } from "sonner";
import {
  Wand2, FileText, Download, Send, Check, Loader2, AlertTriangle, Plus, Trash2,
} from "../icons";
import Card from "../components/composites/Card";
import Select from "../components/primitives/Select";
import Input from "../components/primitives/Input";
import Button from "../components/primitives/Button";
import InlineAlert from "../components/composites/InlineAlert";

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
        <div className="animate-fade-in px-6 sm:px-8 py-6 max-w-xl">
          <Card>
            <div className="space-y-4">
              <Select label="Lead / deal" value={leadId} onChange={setLeadId} data-testid="proposal-lead-select"
                options={[{ value: "", label: "Select a lead…" }, ...leads.map((l) => ({ value: l.id, label: `${l.first_name} ${l.last_name} — ${l.company || l.email}` }))]} />
              <div>
                <Select label="Proposal type" value={templateId} onChange={setTemplateId} data-testid="proposal-template-select"
                  options={templates.map((t) => ({ value: t.id, label: t.name }))} />
                {template?.blurb && <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 6 }}>{template.blurb}</p>}
              </div>

              <Button variant="primary" icon={chainStep ? Loader2 : Wand2} onClick={generate} isLoading={busy && !chainStep} disabled={busy}
                data-testid="generate-proposal-btn" className="w-full justify-center">
                {chainStep ? "Drafting…" : "Generate proposal"}
              </Button>

              {chainStep && (
                <div className="flex items-center gap-1.5 pt-1" data-testid="chain-progress">
                  {CHAIN_STEPS.map((s, i) => {
                    const idx = CHAIN_STEPS.findIndex((x) => x.key === chainStep);
                    const done = i < idx, active = s.key === chainStep;
                    return (
                      <div key={s.key} className="flex items-center gap-1.5 flex-1">
                        <span className="flex items-center gap-1" style={{
                          fontSize: 10.5, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.04em",
                          color: active ? "var(--text-primary)" : done ? "var(--text-tertiary)" : "var(--text-disabled)",
                          fontWeight: active ? 600 : 400,
                        }}>
                          {done ? <Check size={12} strokeWidth={1.5} aria-hidden="true" /> : active ? <Loader2 size={12} strokeWidth={1.5} className="animate-spin" aria-hidden="true" /> : <span className="w-2.5" />}
                          {s.label}
                        </span>
                        {i < CHAIN_STEPS.length - 1 && <div className="flex-1 h-px" style={{ background: "var(--border-default)" }} />}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    );
  }

  if (!proposal) return <div style={{ padding: 40, fontSize: 13, color: "var(--text-tertiary)" }}>Loading…</div>;

  return (
    <div>
      <PageHeader
        title={proposal.topic}
        subtitle={`${proposal.template_name || "Proposal"}${proposal.status === "sent" ? " · sent" : ""}`}
        right={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={Check} onClick={save} isLoading={busy} disabled={busy || !dirty} data-testid="save-proposal-btn">Save</Button>
            <Button variant="secondary" icon={FileText} onClick={() => download("docx")} disabled={busy} data-testid="export-docx-btn">DOCX</Button>
            <Button variant="secondary" icon={Download} onClick={() => download("pdf")} disabled={busy} data-testid="export-pdf-btn">PDF</Button>
            {proposal.status === "draft" && (
              <Button variant="primary" icon={Send} onClick={markSent} data-testid="mark-sent-btn">Mark sent</Button>
            )}
          </div>
        }
      />

      <div className="animate-fade-in px-6 sm:px-8 py-6 max-w-3xl mx-auto space-y-4">
        {!!(proposal.missing || []).length && (
          <div data-testid="missing-banner">
            <InlineAlert tone="warning" title="Some inputs are missing.">
              The draft left these blank rather than inventing them — fill them in: {proposal.missing.join("; ")}.
            </InlineAlert>
          </div>
        )}

        {sections.map((s) => (
          <Card key={s.key} data-testid={`section-${s.key}`}>
            <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-tertiary)", marginBottom: 12 }}>{s.heading}</div>
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
          </Card>
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
      <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 12 }}>
        Prices come from your catalog and totals are computed server-side — never set by hand.
      </p>

      {(pricing.line_items || []).length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-tertiary)", padding: "12px 0" }}>No line items yet — add from your catalog below.</p>
      ) : (
        <div className="overflow-x-auto">
        <table className="w-full" data-testid="pricing-table" style={{ fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border-default)" }}>
              <th style={{ textAlign: "left", padding: "6px 0", fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)" }}>Item</th>
              <th style={{ width: 64, textAlign: "center", padding: "6px 0", fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)" }}>Qty</th>
              <th style={{ width: 112, textAlign: "right", padding: "6px 0", fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)" }}>Unit</th>
              <th style={{ width: 112, textAlign: "right", padding: "6px 0", fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)" }}>Amount</th>
              <th style={{ width: 32 }}></th>
            </tr>
          </thead>
          <tbody>
            {pricing.line_items.map((li, i) => (
              <tr key={i} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <td style={{ padding: "6px 0", color: "var(--text-primary)" }}>
                  {li.name}{li.unit ? <span style={{ color: "var(--text-tertiary)" }}> /{li.unit}</span> : ""}
                </td>
                <td style={{ padding: "6px 0", textAlign: "center" }}>
                  <Input size="sm" type="number" min={1} value={li.qty}
                    onChange={(e) => onQty(i, parseInt(e.target.value, 10) || 1)}
                    data-testid={`qty-${i}`} className="w-14 text-center" />
                </td>
                <td className="tnum" style={{ padding: "6px 0", textAlign: "right", color: "var(--text-tertiary)" }}>{money(li.unit_price, cur)}</td>
                <td className="tnum" style={{ padding: "6px 0", textAlign: "right", fontWeight: 500, color: "var(--text-primary)" }}>{money(li.line_total, cur)}</td>
                <td style={{ padding: "6px 0", textAlign: "right" }}>
                  <button onClick={() => onRemove(i)} data-testid={`remove-line-${i}`} style={{ color: "var(--text-tertiary)" }}>
                    <Trash2 size={14} strokeWidth={1.5} aria-hidden="true" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} style={{ padding: "6px 0", textAlign: "right", color: "var(--text-tertiary)" }}>Subtotal</td>
              <td className="tnum" style={{ padding: "6px 0", textAlign: "right" }}>{money(pricing.subtotal, cur)}</td><td></td>
            </tr>
            <tr>
              <td colSpan={3} style={{ padding: "4px 0", textAlign: "right", color: "var(--text-tertiary)" }}>
                Discount
                <input type="number" min={0} max={100} value={pricing.discount_pct || 0}
                  onChange={(e) => onDiscount(Math.max(0, Math.min(100, Number(e.target.value))))}
                  data-testid="discount-pct"
                  style={{ width: 56, border: "1px solid var(--border-default)", borderRadius: "var(--radius-sm)", padding: "2px 4px", textAlign: "center", margin: "0 4px", fontSize: 13, background: "var(--bg-surface)", color: "var(--text-primary)" }} />%
              </td>
              <td className="tnum" style={{ padding: "4px 0", textAlign: "right" }}>{pricing.discount ? `-${money(pricing.discount, cur)}` : money(0, cur)}</td><td></td>
            </tr>
            <tr style={{ borderTop: "1px solid var(--border-default)" }}>
              <td colSpan={3} style={{ padding: "6px 0", textAlign: "right", fontWeight: 600, color: "var(--text-primary)" }}>Total</td>
              <td className="tnum" style={{ padding: "6px 0", textAlign: "right", fontWeight: 600, color: "var(--text-primary)" }} data-testid="pricing-total">{money(pricing.total, cur)}</td><td></td>
            </tr>
          </tfoot>
        </table>
        </div>
      )}

      {unused.length > 0 && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mt-3">
          <Select value={pick} onChange={setPick} data-testid="add-line-select" className="flex-1"
            options={[{ value: "", label: "Add a line from your catalog…" }, ...unused.map((c) => ({ value: c.id, label: `${c.name} — ${money(c.unit_price, c.currency)}${c.unit ? `/${c.unit}` : ""}` }))]} />
          <Button variant="secondary" size="sm" icon={Plus} onClick={() => { if (pick) { onAdd(pick); setPick(""); } }} disabled={!pick}
            data-testid="add-line-btn">Add</Button>
        </div>
      )}

      {pricing.notes && <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 12, fontStyle: "italic" }}>{pricing.notes}</p>}
    </div>
  );
}
