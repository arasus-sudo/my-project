import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { toast } from "sonner";
import { Loader2, Sparkles, X, Plus } from "lucide-react";

/** Prospect Finder drawer — Prospeo + Icypeas + LLM icebreaker */
export default function ProspectFinder({ open, onClose, onDone }) {
  const [icps, setIcps] = useState([]);
  const [icpModalOpen, setIcpModalOpen] = useState(false);
  const [providers, setProviders] = useState({ prospeo: "test", icypeas: "test" });
  const provLabel = (v) => (v === "live" ? "live" : "test mode");
  const [form, setForm] = useState({
    icp_id: "", domain: "", titles: "", industries: "", locations: "", limit: 8,
  });
  const [prospects, setProspects] = useState([]);
  const [selected, setSelected] = useState({});
  const [busy, setBusy] = useState(false);
  const [icpDraft, setIcpDraft] = useState({ name: "", titles: "", industries: "", keywords: "", seniority: "" });

  useEffect(() => {
    if (!open) return;
    api.get("/icps").then((r) => setIcps(r.data));
    api.get("/prospect/providers").then((r) => setProviders(r.data)).catch(() => {});
  }, [open]);

  if (!open) return null;

  const search = async () => {
    setBusy(true); setProspects([]);
    try {
      const body = {
        icp_id: form.icp_id || null,
        domain: form.domain || null,
        titles: split(form.titles),
        industries: split(form.industries),
        locations: split(form.locations),
        limit: Number(form.limit) || 10,
      };
      const { data } = await api.post("/prospect/search", body);
      setProspects(data.prospects || []);
      setProviders(data.providers || providers);
      const init = {}; (data.prospects || []).forEach((_, i) => (init[i] = true));
      setSelected(init);
    } catch { toast.error("Search failed"); }
    finally { setBusy(false); }
  };

  const importSelected = async () => {
    const chosen = prospects.filter((_, i) => selected[i]);
    if (!chosen.length) { toast.error("Select at least one prospect"); return; }
    setBusy(true);
    try {
      const { data } = await api.post("/prospect/import", { prospects: chosen, generate_icebreaker: true });
      toast.success(`Added ${data.added} · skipped ${data.skipped} · icebreakers ready`);
      onDone?.();
      onClose();
    } catch { toast.error("Import failed"); }
    finally { setBusy(false); }
  };

  const saveIcp = async (e) => {
    e.preventDefault();
    try {
      const body = {
        name: icpDraft.name,
        titles: split(icpDraft.titles),
        industries: split(icpDraft.industries),
        keywords: split(icpDraft.keywords),
        seniority: split(icpDraft.seniority),
      };
      const { data } = await api.post("/icps", body);
      setIcps([data, ...icps]);
      setForm({ ...form, icp_id: data.id });
      setIcpModalOpen(false);
      setIcpDraft({ name: "", titles: "", industries: "", keywords: "", seniority: "" });
      toast.success("ICP saved");
    } catch { toast.error("ICP save failed"); }
  };

  return (
    <div className="fixed inset-0 bg-ink/40 z-50 flex justify-end">
      <div className="w-full max-w-3xl bg-bone h-full overflow-y-auto animate-fade-in">
        <div className="sticky top-0 bg-white border-b border-line px-6 py-4 flex items-center gap-3 z-10">
          <div className="flex items-center gap-2">
            <Sparkles size={16} />
            <div className="font-display font-bold text-lg">Prospect Finder</div>
          </div>
          <span className={`ui-label px-2 py-0.5 rounded-full border ${providers.prospeo === "live" ? "text-green-700 border-green-600" : "text-amber-700 border-amber-500"}`}>Prospeo: {provLabel(providers.prospeo)}</span>
          <span className={`ui-label px-2 py-0.5 rounded-full border ${providers.icypeas === "live" ? "text-green-700 border-green-600" : "text-amber-700 border-amber-500"}`}>Icypeas: {provLabel(providers.icypeas)}</span>
          <button onClick={onClose} data-testid="pf-close" className="ml-auto btn-ghost"><X size={14} /></button>
        </div>

        <div className="p-6 space-y-5">
          {(providers.prospeo !== "live" || providers.icypeas !== "live") && (
            <div className="bg-white border border-amber-300 rounded-2xl p-4 text-sm text-amber-900">
              <span className="font-mono uppercase text-[10px] tracking-widest">Test mode</span> — enrichment returns sample prospects until you connect a data provider. Add your Prospeo or Icypeas account to search live contact data.
            </div>
          )}

          {/* Filter panel */}
          <div className="bg-white border border-line rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-3">
              <label className="flex-1 block">
                <span className="ui-label">Use ICP</span>
                <select value={form.icp_id} onChange={(e) => setForm({ ...form, icp_id: e.target.value })} data-testid="pf-icp"
                  className="mt-1 w-full border border-line rounded-full px-3 py-2 bg-white">
                  <option value="">— none / free-form —</option>
                  {icps.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
              </label>
              <button onClick={() => setIcpModalOpen(true)} data-testid="pf-new-icp" className="btn-secondary mt-5"><Plus size={12} /> New ICP</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="ui-label">Company domain</span>
                <input value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} data-testid="pf-domain"
                  placeholder="acme.com" className="mt-1 w-full border border-line rounded-full px-3 py-2 text-sm" />
              </label>
              <label className="block">
                <span className="ui-label">Result limit</span>
                <input type="number" min={1} max={50} value={form.limit} onChange={(e) => setForm({ ...form, limit: e.target.value })} data-testid="pf-limit"
                  className="mt-1 w-full border border-line rounded-full px-3 py-2 text-sm font-mono" />
              </label>
              <label className="block col-span-2">
                <span className="ui-label">Titles (comma-separated)</span>
                <input value={form.titles} onChange={(e) => setForm({ ...form, titles: e.target.value })} data-testid="pf-titles"
                  placeholder="VP Sales, Head of Growth, CTO" className="mt-1 w-full border border-line rounded-full px-3 py-2 text-sm" />
              </label>
              <label className="block">
                <span className="ui-label">Industries</span>
                <input value={form.industries} onChange={(e) => setForm({ ...form, industries: e.target.value })} data-testid="pf-industries"
                  placeholder="SaaS, Fintech" className="mt-1 w-full border border-line rounded-full px-3 py-2 text-sm" />
              </label>
              <label className="block">
                <span className="ui-label">Locations</span>
                <input value={form.locations} onChange={(e) => setForm({ ...form, locations: e.target.value })} data-testid="pf-locations"
                  placeholder="US, UK" className="mt-1 w-full border border-line rounded-full px-3 py-2 text-sm" />
              </label>
            </div>
            <button onClick={search} disabled={busy} data-testid="pf-search" className="btn-primary disabled:opacity-60">
              {busy ? <><Loader2 size={14} className="animate-spin" /> Finding prospects…</> : <>Find prospects</>}
            </button>
          </div>

          {/* Results */}
          {prospects.length > 0 && (
            <div className="bg-white border border-line rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-line flex items-center justify-between">
                <div className="ui-label">Found {prospects.length} · Verified via Icypeas</div>
                <button onClick={importSelected} disabled={busy} data-testid="pf-import" className="btn-primary text-sm py-2">
                  {busy ? "Importing…" : "Import selected + write icebreakers"}
                </button>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th className="p-3 w-8"></th>
                    {["Name", "Email", "Title", "Company", "Verify"].map((h) => <th key={h} className="ui-label text-left p-3">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {prospects.map((p, i) => (
                    <tr key={p.email + i} className="border-b border-line last:border-0">
                      <td className="p-3">
                        <input type="checkbox" checked={!!selected[i]} onChange={(e) => setSelected({ ...selected, [i]: e.target.checked })} data-testid={`pf-select-${i}`} />
                      </td>
                      <td className="p-3 font-medium">{p.first_name} {p.last_name}</td>
                      <td className="p-3 font-mono text-xs">{p.email}</td>
                      <td className="p-3 text-neutral-600">{p.title}</td>
                      <td className="p-3">{p.company}</td>
                      <td className="p-3">
                        <span className={`ui-label px-2 py-0.5 border rounded-full ${p.verified ? "text-green-700 border-green-600" : "text-amber-700 border-amber-500"}`}>
                          {(p.verification?.status || "risky")}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {icpModalOpen && (
        <div className="fixed inset-0 bg-ink/50 flex items-center justify-center z-[60] p-4">
          <form onSubmit={saveIcp} className="bg-white border border-line rounded-2xl p-6 w-full max-w-md space-y-3">
            <div className="font-display font-bold text-xl">New ICP</div>
            <input required placeholder="ICP name (e.g. 'SaaS founders')" value={icpDraft.name} onChange={(e) => setIcpDraft({ ...icpDraft, name: e.target.value })} data-testid="icp-name" className="w-full border border-line rounded-full px-3 py-2" />
            <input placeholder="Titles (comma-separated)" value={icpDraft.titles} onChange={(e) => setIcpDraft({ ...icpDraft, titles: e.target.value })} data-testid="icp-titles" className="w-full border border-line rounded-full px-3 py-2 text-sm" />
            <input placeholder="Industries" value={icpDraft.industries} onChange={(e) => setIcpDraft({ ...icpDraft, industries: e.target.value })} data-testid="icp-industries" className="w-full border border-line rounded-full px-3 py-2 text-sm" />
            <input placeholder="Seniority (Director, VP, Head…)" value={icpDraft.seniority} onChange={(e) => setIcpDraft({ ...icpDraft, seniority: e.target.value })} data-testid="icp-seniority" className="w-full border border-line rounded-full px-3 py-2 text-sm" />
            <input placeholder="Keywords / domains" value={icpDraft.keywords} onChange={(e) => setIcpDraft({ ...icpDraft, keywords: e.target.value })} data-testid="icp-keywords" className="w-full border border-line rounded-full px-3 py-2 text-sm" />
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setIcpModalOpen(false)} className="btn-secondary">Cancel</button>
              <button type="submit" data-testid="save-icp" className="btn-primary">Save ICP</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function split(v) {
  return (v || "").split(",").map((s) => s.trim()).filter(Boolean);
}
