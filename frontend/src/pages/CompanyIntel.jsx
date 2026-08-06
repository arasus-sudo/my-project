import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import {
  Globe, Search, Building2, Target, Users, Lightbulb, TrendingUp,
  ShieldCheck, AlertTriangle, Trash2, Loader2,
  FileText, CheckCircle2,
} from "../icons";
import Card from "../components/composites/Card";
import { EmptyState } from "../components/composites/EmptyState";
import InlineAlert from "../components/composites/InlineAlert";
import Input from "../components/primitives/Input";
import Button from "../components/primitives/Button";
import Chip from "../components/primitives/Chip";
import { Skeleton } from "../components/primitives/Feedback";

export default function CompanyIntel() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [crawling, setCrawling] = useState(false);
  const [url, setUrl] = useState("");
  const [selected, setSelected] = useState(null);

  const load = () => api.get("/company-intel/crawl").then((r) => {
    setItems(r.data);
    setLoading(false);
  });

  useEffect(() => { load(); }, []);

  const crawl = async (e) => {
    e.preventDefault();
    if (!url.trim()) return;
    setCrawling(true);
    try {
      const { data } = await api.post("/company-intel/crawl", { url: url.trim() });
      toast.success(`Crawled ${url.trim()} — ${data.data?.pages_crawled || 0} pages`);
      setUrl("");
      await load();
      if (data.data) setSelected(data.data);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Crawl failed");
    } finally { setCrawling(false); }
  };

  const deleteIntel = async (domain) => {
    if (!window.confirm(`Remove intelligence for ${domain}?`)) return;
    try {
      await api.delete(`/company-intel/crawl/${encodeURIComponent(domain)}`);
      toast.success("Removed");
      if (selected?.domain === domain) setSelected(null);
      load();
    } catch { toast.error("Failed to remove"); }
  };

  const ProfileCard = ({ label, value, icon: Icon }) => (
    value ? (
      <div className="flex items-start gap-2.5" style={{ padding: 12, borderRadius: "var(--radius-lg)", background: "var(--bg-surface-sunken)", border: "1px solid var(--border-default)" }}>
        {Icon && <Icon size={16} strokeWidth={1.5} aria-hidden="true" style={{ color: "var(--text-tertiary)", marginTop: 2, flexShrink: 0 }} />}
        <div className="min-w-0">
          <div style={{ fontSize: 10.5, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
          <div style={{ fontSize: 13, color: "var(--text-primary)", marginTop: 2 }}>{value}</div>
        </div>
      </div>
    ) : null
  );

  const TagList = ({ label, items: list, icon: Icon, emptyText = "None identified" }) => (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5" style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {Icon && <Icon size={12} strokeWidth={1.5} aria-hidden="true" />}{label}
      </div>
      {list?.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {list.map((item, i) => <Chip key={i} label={item} />)}
        </div>
      ) : (
        <div style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>{emptyText}</div>
      )}
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Company Intelligence"
        subtitle="Deep-crawl any company website to build a complete intelligence profile — never generate a campaign blind again."
        right={
          <form onSubmit={crawl} className="flex items-center gap-2">
            <Input size="sm" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="company.com" className="w-40 sm:w-56" />
            <Button type="submit" variant="primary" size="sm" icon={crawling ? undefined : Search} isLoading={crawling} isDisabled={!url.trim()}>
              {crawling ? "Crawling…" : "Crawl"}
            </Button>
          </form>
        }
      />

      <div className="px-6 sm:px-8 py-6">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} height={80} radius="var(--radius-xl)" />)}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={Globe}
            title="No companies analysed yet"
            description="Enter a company website above and we'll crawl every page — homepage, about, services, blog, pricing, case studies, and more — then build a complete intelligence profile."
          />
        ) : (
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 space-y-2">
              <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", padding: "0 4px", marginBottom: 8 }}>
                Analysed companies
              </div>
              {items.map((item) => {
                const active = selected?.id === item.id;
                const dotColor = item.status === "complete" ? "var(--color-success)" : item.status === "error" ? "var(--color-danger)" : "var(--color-warning)";
                return (
                  <button
                    key={item.id}
                    onClick={() => setSelected(item)}
                    className="w-full text-left transition-colors"
                    style={{
                      padding: 12, borderRadius: "var(--radius-lg)",
                      border: `1px solid ${active ? "var(--color-primary-border)" : "var(--border-default)"}`,
                      background: active ? "var(--bg-selected)" : "transparent",
                    }}
                    onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "var(--bg-hover)"; }}
                    onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
                  >
                    <div className="flex items-center gap-2">
                      <Building2 size={14} strokeWidth={1.5} aria-hidden="true" style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
                      <span className="truncate flex-1" style={{ fontWeight: 500, fontSize: 13.5, color: "var(--text-primary)" }}>{item.domain}</span>
                      <span style={{ width: 8, height: 8, borderRadius: "var(--radius-full)", background: dotColor, flexShrink: 0 }} />
                    </div>
                    <div className="tnum" style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", marginTop: 4 }}>
                      {item.pages_crawled} pages crawled
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="lg:col-span-2">
              {selected ? (
                <div className="space-y-6 animate-fade-in">
                  {selected.status === "error" && (
                    <InlineAlert tone="danger" title="Crawl failed">{selected.error || "Unknown error"}</InlineAlert>
                  )}

                  {selected.profile && (
                    <>
                      <Card>
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>{selected.profile.name || selected.domain}</div>
                            {selected.profile.industry && <div style={{ marginTop: 8 }}><Chip label={selected.profile.industry} /></div>}
                          </div>
                          <button onClick={() => deleteIntel(selected.domain)} title="Remove intelligence"
                            className="inline-grid place-items-center transition-colors shrink-0"
                            style={{ width: 32, height: 32, borderRadius: "var(--radius-md)", color: "var(--text-tertiary)" }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-danger-subtle)"; e.currentTarget.style.color = "var(--color-danger)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-tertiary)"; }}
                          >
                            <Trash2 size={14} strokeWidth={1.5} aria-hidden="true" />
                          </button>
                        </div>
                        {selected.profile.description && (
                          <p style={{ fontSize: 13.5, color: "var(--text-secondary)", lineHeight: "20px", marginTop: 16 }}>{selected.profile.description}</p>
                        )}
                      </Card>

                      <Card title="Company profile">
                        <div className="grid sm:grid-cols-2 gap-3">
                          <ProfileCard label="Company size" value={selected.profile.company_size} icon={Users} />
                          <ProfileCard label="Location" value={selected.profile.location} icon={Globe} />
                          <ProfileCard label="Founded" value={selected.profile.founded} />
                          <ProfileCard label="Target market" value={selected.profile.target_market} icon={Target} />
                          <ProfileCard label="Ideal customer" value={selected.profile.ideal_customer} icon={Users} />
                          <ProfileCard label="Brand tone" value={selected.profile.brand_tone} icon={Lightbulb} />
                          <ProfileCard label="Communication style" value={selected.profile.communication_style} />
                          <ProfileCard label="Buying stage" value={selected.profile.buying_stage} icon={TrendingUp} />
                          <ProfileCard label="Sales cycle" value={selected.profile.sales_cycle} />
                          <ProfileCard label="Pricing model" value={selected.profile.pricing_model} />
                          <ProfileCard label="USP" value={selected.profile.usp} icon={Target} />
                        </div>
                      </Card>

                      <Card title="Products & services">
                        {selected.profile.products_services?.length > 0 ? (
                          <div className="grid sm:grid-cols-2 gap-2">
                            {selected.profile.products_services.map((ps, i) => (
                              <div key={i} className="flex items-center gap-2"
                                style={{ padding: "10px 12px", borderRadius: "var(--radius-lg)", background: "var(--bg-surface-sunken)", border: "1px solid var(--border-default)", fontSize: 13 }}>
                                <CheckCircle2 size={14} strokeWidth={1.5} aria-hidden="true" style={{ color: "var(--color-success)", flexShrink: 0 }} />
                                {ps}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ fontSize: 13, color: "var(--text-tertiary)" }}>No products/services identified</div>
                        )}
                      </Card>

                      <div className="grid sm:grid-cols-2 gap-6">
                        <Card><TagList label="Pain points" items={selected.profile.pain_points} icon={AlertTriangle} /></Card>
                        <Card><TagList label="Differentiators" items={selected.profile.differentiators} icon={Lightbulb} /></Card>
                      </div>

                      <div className="grid sm:grid-cols-2 gap-6">
                        <Card><TagList label="Competitors" items={selected.profile.competitors} icon={ShieldCheck} /></Card>
                        <Card><TagList label="Keywords" items={selected.profile.keywords} icon={Search} /></Card>
                      </div>

                      {selected.profile.tech_stack?.length > 0 && (
                        <Card><TagList label="Tech stack" items={selected.profile.tech_stack} icon={TrendingUp} /></Card>
                      )}

                      {selected.profile.case_studies_summary && (
                        <Card>
                          <div className="flex items-start gap-2.5">
                            <FileText size={16} strokeWidth={1.5} aria-hidden="true" style={{ color: "var(--text-tertiary)", marginTop: 2, flexShrink: 0 }} />
                            <div>
                              <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Case studies</div>
                              <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>{selected.profile.case_studies_summary}</div>
                            </div>
                          </div>
                        </Card>
                      )}

                      {selected.profile.blogs_summary && (
                        <Card>
                          <div className="flex items-start gap-2.5">
                            <FileText size={16} strokeWidth={1.5} aria-hidden="true" style={{ color: "var(--text-tertiary)", marginTop: 2, flexShrink: 0 }} />
                            <div>
                              <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Blog / resources</div>
                              <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>{selected.profile.blogs_summary}</div>
                            </div>
                          </div>
                        </Card>
                      )}
                    </>
                  )}

                  {selected.status === "crawling" && (
                    <div className="text-center" style={{ padding: 48 }}>
                      <Loader2 size={24} className="animate-spin mx-auto" style={{ color: "var(--text-tertiary)", marginBottom: 12 }} />
                      <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>Crawling {selected.domain}…</div>
                      <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginTop: 4 }}>Analysing every page on the site. This takes 30-60 seconds.</p>
                    </div>
                  )}
                </div>
              ) : (
                <EmptyState icon={Building2} title="Select a company" description="Choose a company from the left to view its intelligence profile." />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
