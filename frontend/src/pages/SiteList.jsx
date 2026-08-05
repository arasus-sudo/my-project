import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Plus, RefreshCw, Trash2, Copy, Globe } from "../icons";
import { EmptyState } from "../components/composites/EmptyState";
import { Modal, ModalContent } from "../components/composites/Modal";
import StatusPill from "../components/primitives/StatusPill";
import Input from "../components/primitives/Input";
import Button from "../components/primitives/Button";

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
        right={<Button variant="primary" icon={Plus} onClick={() => setModal(true)} data-testid="add-site-btn">Add site</Button>}
      />
      <div className="animate-fade-in px-6 sm:px-8 py-6">
        {loading ? <div style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Loading…</div> : sites.length === 0 ? (
          <EmptyState icon={Globe} title="No sites yet" description="Add your website's domain to start building its knowledge base."
            actionLabel="Add site" onAction={() => setModal(true)} />
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {sites.map((s) => (
              <button key={s.id} onClick={() => openDetail(s)} data-testid={`site-card-${s.id}`}
                className="text-left transition-all"
                style={{ padding: 20, borderRadius: "var(--radius-xl)", border: "1px solid var(--border-default)", background: "var(--bg-surface)", boxShadow: "var(--shadow-xs)" }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center justify-center" style={{ width: 40, height: 40, borderRadius: "var(--radius-lg)", background: "var(--color-primary)", color: "#fff" }}>
                    <Globe size={16} strokeWidth={1.5} aria-hidden="true" />
                  </div>
                  <StatusPill status={s.status} tone={s.status === "ready" ? "success" : s.status === "crawling" ? "warning" : "neutral"} />
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-display)", marginTop: 12 }}>{s.name}</div>
                <div className="tnum" style={{ fontSize: 11.5, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", marginTop: 2 }}>{s.domain}</div>
                <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 8 }}>{s.pages_crawled} pages indexed</div>
              </button>
            ))}
          </div>
        )}
      </div>

      <Modal open={modal} onOpenChange={setModal}>
        <ModalContent size="sm" title="Add a site"
          footer={
            <>
              <Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
              <Button variant="primary" type="submit" form="add-site-form" data-testid="save-site-btn">Add site</Button>
            </>
          }
        >
          <form id="add-site-form" onSubmit={create} className="space-y-3">
            <Input required label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="site-name-input" />
            <Input required label="Domain" value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} placeholder="example.com" data-testid="site-domain-input" />
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--text-primary)", marginBottom: 6 }}>Widget color</label>
              <input type="color" value={form.primary_color} onChange={(e) => setForm({ ...form, primary_color: e.target.value })}
                style={{ width: "100%", height: 40, border: "1px solid var(--border-default)", borderRadius: "var(--radius-lg)", cursor: "pointer" }} />
            </div>
            <Input label="Welcome message" value={form.welcome_message} onChange={(e) => setForm({ ...form, welcome_message: e.target.value })} data-testid="site-welcome-input" />
          </form>
        </ModalContent>
      </Modal>

      <Modal open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        {detail && (
          <ModalContent
            size="md"
            title={detail.name}
            subtitle={detail.domain}
            footer={
              <>
                <Button variant="danger-subtle" icon={Trash2} onClick={() => remove(detail.id)} data-testid="delete-site-btn">Delete</Button>
                <Button variant="primary" icon={RefreshCw} onClick={() => crawl(detail.id)} isLoading={busy} data-testid="crawl-site-btn">
                  {detail.pages_crawled > 0 ? "Re-crawl" : "Crawl now"}
                </Button>
              </>
            }
          >
            <div className="space-y-4">
              <div>
                <div style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-tertiary)", marginBottom: 6 }}>Embed snippet</div>
                <div className="flex items-start gap-2" style={{ background: "var(--bg-surface-sunken)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-lg)", padding: 12, fontFamily: "var(--font-mono)", fontSize: 11, wordBreak: "break-all" }}>
                  <span className="flex-1">{embedSnippet(detail)}</span>
                  <button onClick={() => copyEmbed(detail)} data-testid="copy-embed-btn" className="shrink-0" style={{ color: "var(--text-tertiary)" }}>
                    <Copy size={14} strokeWidth={1.5} aria-hidden="true" />
                  </button>
                </div>
                <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 6 }}>Paste this before <code>&lt;/body&gt;</code> on your site.</p>
              </div>

              <div>
                <div style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-tertiary)", marginBottom: 6 }}>Knowledge base — {pages.length} pages</div>
                <div className="space-y-1" style={{ maxHeight: 160, overflowY: "auto" }}>
                  {pages.map((p) => (
                    <div key={p.url} className="truncate" style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>{p.title || p.url}</div>
                  ))}
                  {pages.length === 0 && <div style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>Not crawled yet.</div>}
                </div>
              </div>
            </div>
          </ModalContent>
        )}
      </Modal>
    </div>
  );
}
