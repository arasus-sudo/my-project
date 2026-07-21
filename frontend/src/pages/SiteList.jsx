import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Plus, RefreshCw, Trash2, Copy, Globe, X } from "lucide-react";

export default function SiteList() {
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [detail, setDetail] = useState(null);
  const [pages, setPages] = useState([]);
  const [form, setForm] = useState({ name: "", domain: "", primary_color: "#3B82F6", welcome_message: "Hi! Ask me anything about this site." });
  const [busy, setBusy] = useState(false);

  const load = () => api.get("/site-eq/sites").then((r) => { setSites(r.data); setLoading(false); });
  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    try {
      await api.post("/site-eq/sites", {
        name: form.name, domain: form.domain,
        brand: { primary_color: form.primary_color, welcome_message: form.welcome_message, position: "bottom-right" },
      });
      toast.success("Site added");
      setModal(false);
      setForm({ name: "", domain: "", primary_color: "#3B82F6", welcome_message: "Hi! Ask me anything about this site." });
      load();
    } catch (err) { toast.error(err?.response?.data?.detail || "Failed"); }
  };

  const crawl = async (id) => {
    setBusy(true);
    try {
      const { data } = await api.post(`/site-eq/sites/${id}/crawl`);
      toast.success(`Crawled ${data.pages_crawled} pages, ${data.chunks} chunks indexed`);
      load();
    } catch (err) { toast.error(err?.response?.data?.detail || "Crawl failed"); }
    finally { setBusy(false); }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this site and its knowledge base?")) return;
    await api.delete(`/site-eq/sites/${id}`);
    setDetail(null); load();
  };

  const openDetail = async (site) => {
    setDetail(site);
    const { data } = await api.get(`/site-eq/sites/${site.id}/pages`);
    setPages(data);
  };

  const embedSnippet = (site) =>
    `<script src="${api.defaults.baseURL}/site-eq/public/${site.id}/widget.js"></script>`;

  const copyEmbed = (site) => {
    navigator.clipboard.writeText(embedSnippet(site));
    toast.success("Embed snippet copied");
  };

  return (
    <div>
      <PageHeader
        title="Sites"
        subtitle="Crawl a website into a knowledge base, then embed the chat widget on it."
        right={<button onClick={() => setModal(true)} data-testid="add-site-btn" className="btn-primary"><Plus size={14} /> Add site</button>}
      />
      <div className="animate-fade-in px-6 sm:px-8">
        {loading ? <div className="text-neutral-400 text-sm">Loading…</div> : sites.length === 0 ? (
          <div className="shadow-card p-10 text-center rounded-2xl">
            <div className="font-display text-xl sm:text-2xl font-semibold">No sites yet</div>
            <p className="text-sm text-neutral-400 mt-2">Add your website's domain to start building its knowledge base.</p>
            <button onClick={() => setModal(true)} className="btn-primary mt-6 inline-flex">Add site</button>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {sites.map((s) => (
              <button key={s.id} onClick={() => openDetail(s)} data-testid={`site-card-${s.id}`}
                className="text-left card-flat p-6 hover:border-accent/30 transition-all shadow-card hover:shadow-card-hover">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-brand-gradient flex items-center justify-center text-white">
                    <Globe size={18} />
                  </div>
                  <span className={`ui-label px-2 py-0.5 border rounded-full ${s.status === "ready" ? "text-success border-success" : s.status === "crawling" ? "text-warning border-warning" : "text-neutral-400 border-line"}`}>
                    {s.status}
                  </span>
                </div>
                <div className="font-display font-bold text-lg mt-3">{s.name}</div>
                <div className="text-xs text-neutral-400 font-mono mt-0.5">{s.domain}</div>
                <div className="text-xs text-neutral-400 mt-2">{s.pages_crawled} pages indexed</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50 p-4" onClick={(e) => e.target === e.currentTarget && setModal(false)}>
          <form onSubmit={create} className="bg-white border border-line p-6 rounded-2xl w-full max-w-md space-y-3">
            <div className="font-display font-semibold text-xl">Add a site</div>
            <label className="block">
              <span className="ui-label">Name</span>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                data-testid="site-name-input" className="mt-1 w-full border border-line px-3 py-2 rounded-xl" />
            </label>
            <label className="block">
              <span className="ui-label">Domain</span>
              <input required value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })}
                placeholder="example.com" data-testid="site-domain-input" className="mt-1 w-full border border-line px-3 py-2 rounded-xl" />
            </label>
            <label className="block">
              <span className="ui-label">Widget color</span>
              <input type="color" value={form.primary_color} onChange={(e) => setForm({ ...form, primary_color: e.target.value })}
                className="mt-1 w-full h-10 border border-line rounded-xl" />
            </label>
            <label className="block">
              <span className="ui-label">Welcome message</span>
              <input value={form.welcome_message} onChange={(e) => setForm({ ...form, welcome_message: e.target.value })}
                data-testid="site-welcome-input" className="mt-1 w-full border border-line px-3 py-2 rounded-xl" />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setModal(false)} className="btn-secondary">Cancel</button>
              <button type="submit" data-testid="save-site-btn" className="btn-primary">Add site</button>
            </div>
          </form>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50 p-4" onClick={(e) => e.target === e.currentTarget && setDetail(null)}>
          <div className="bg-white border border-line p-6 rounded-2xl w-full max-w-lg space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-display font-semibold text-lg">{detail.name}</div>
                <div className="text-xs text-neutral-400 font-mono">{detail.domain}</div>
              </div>
              <button onClick={() => setDetail(null)} className="text-neutral-400 hover:text-ink"><X size={18} /></button>
            </div>

            <div>
              <div className="ui-label mb-1.5">Embed snippet</div>
              <div className="bg-ash border border-line rounded-xl p-3 font-mono text-[11px] break-all flex items-start gap-2">
                <span className="flex-1">{embedSnippet(detail)}</span>
                <button onClick={() => copyEmbed(detail)} data-testid="copy-embed-btn" className="text-neutral-400 hover:text-ink shrink-0"><Copy size={14} /></button>
              </div>
              <p className="text-[11px] text-neutral-400 mt-1.5">Paste this before <code>&lt;/body&gt;</code> on your site.</p>
            </div>

            <div>
              <div className="ui-label mb-1.5">Knowledge base — {pages.length} pages</div>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {pages.map((p) => (
                  <div key={p.url} className="text-xs text-neutral-500 truncate">{p.title || p.url}</div>
                ))}
                {pages.length === 0 && <div className="text-xs text-neutral-400">Not crawled yet.</div>}
              </div>
            </div>

            <div className="flex justify-between gap-2 pt-2">
              <button onClick={() => remove(detail.id)} data-testid="delete-site-btn" className="btn-secondary text-danger">
                <Trash2 size={14} /> Delete
              </button>
              <button onClick={() => crawl(detail.id)} disabled={busy} data-testid="crawl-site-btn" className="btn-primary">
                <RefreshCw size={14} className={busy ? "animate-spin" : ""} /> {detail.pages_crawled > 0 ? "Re-crawl" : "Crawl now"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
