import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import {
  Globe, Search, Building2, Target, Users, Lightbulb, TrendingUp,
  ShieldCheck, AlertTriangle, RefreshCw, Trash2, Loader2,
  ChevronRight, ExternalLink, FileText, BookOpen, CheckCircle2, XCircle,
} from "lucide-react";

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
      <div className="flex items-start gap-2.5 p-3 rounded-xl bg-ash border border-line">
        {Icon && <Icon size={15} className="text-neutral-400 mt-0.5 shrink-0" />}
        <div className="min-w-0">
          <div className="ui-label">{label}</div>
          <div className="text-sm mt-0.5">{value}</div>
        </div>
      </div>
    ) : null
  );

  const TagList = ({ label, items: list, icon: Icon, emptyText = "None identified" }) => (
    <div className="space-y-1.5">
      <div className="ui-label flex items-center gap-1.5">
        {Icon && <Icon size={12} />}{label}
      </div>
      {list?.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {list.map((item, i) => (
            <span key={i} className="pill text-[10px]">{item}</span>
          ))}
        </div>
      ) : (
        <div className="text-xs text-neutral-400">{emptyText}</div>
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
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="company.com"
              className="input-premium w-48 text-sm py-1.5"
            />
            <button type="submit" disabled={crawling || !url.trim()}
              className="btn-primary text-sm py-1.5 disabled:opacity-50">
              {crawling ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              {crawling ? "Crawling..." : "Crawl"}
            </button>
          </form>
        }
      />

      <div className="px-6 sm:px-8 pt-6 pb-8">
        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <div key={i} className="skeleton h-20 rounded-2xl" />)}
          </div>
        ) : items.length === 0 ? (
          <div className="card-floating p-12 text-center">
            <Globe size={32} className="mx-auto text-neutral-300 mb-4" />
            <div className="font-display text-xl sm:text-2xl font-semibold">No companies analysed yet</div>
            <p className="text-sm text-neutral-400 mt-2 max-w-md mx-auto">
              Enter a company website above and we'll crawl every page — homepage, about, services, blog, pricing, case studies, and more — then AI builds a complete intelligence profile.
            </p>
          </div>
        ) : (
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 space-y-2">
              <div className="ui-label px-1 mb-2">Analysed Companies</div>
              {items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setSelected(item)}
                  className={`w-full text-left p-3 rounded-xl border transition-all ${
                    selected?.id === item.id
                      ? "border-ink bg-ash"
                      : "border-line hover:border-ink/20 hover:bg-ash"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Building2 size={14} className="text-neutral-400 shrink-0" />
                    <span className="font-medium text-sm truncate flex-1">{item.domain}</span>
                    <span className={`w-2 h-2 rounded-full ${
                      item.status === "complete" ? "bg-success" :
                      item.status === "error" ? "bg-danger" : "bg-warning"
                    }`} />
                  </div>
                  <div className="text-2xs text-neutral-400 font-mono mt-1">
                    {item.pages_crawled} pages crawled
                  </div>
                </button>
              ))}
            </div>

            <div className="lg:col-span-2">
              {selected ? (
                <div className="space-y-6 animate-fade-in">
                  {selected.status === "error" && (
                    <div className="flex items-center gap-2 text-sm text-danger bg-danger/5 border border-danger/20 rounded-2xl p-4">
                      <AlertTriangle size={16} /> Crawl failed: {selected.error || "Unknown error"}
                    </div>
                  )}

                  {selected.profile && (
                    <>
                      <div className="card-floating p-6 space-y-6">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="font-display text-2xl font-semibold">{selected.profile.name || selected.domain}</div>
                            {selected.profile.industry && (
                              <div className="pill mt-1.5">{selected.profile.industry}</div>
                            )}
                          </div>
                          <button onClick={() => deleteIntel(selected.domain)}
                            className="p-2 text-neutral-400 hover:text-danger hover:bg-danger/5 rounded-xl transition-colors"
                            title="Remove intelligence">
                            <Trash2 size={14} />
                          </button>
                        </div>

                        {selected.profile.description && (
                          <p className="text-sm text-neutral-500 leading-relaxed">{selected.profile.description}</p>
                        )}
                      </div>

                      <div className="card-floating p-6">
                        <div className="font-display font-semibold mb-4">Company Profile</div>
                        <div className="grid sm:grid-cols-2 gap-3">
                          <ProfileCard label="Company Size" value={selected.profile.company_size} icon={Users} />
                          <ProfileCard label="Location" value={selected.profile.location} icon={Globe} />
                          <ProfileCard label="Founded" value={selected.profile.founded} />
                          <ProfileCard label="Target Market" value={selected.profile.target_market} icon={Target} />
                          <ProfileCard label="Ideal Customer" value={selected.profile.ideal_customer} icon={Users} />
                          <ProfileCard label="Brand Tone" value={selected.profile.brand_tone} icon={Lightbulb} />
                          <ProfileCard label="Communication Style" value={selected.profile.communication_style} />
                          <ProfileCard label="Buying Stage" value={selected.profile.buying_stage} icon={TrendingUp} />
                          <ProfileCard label="Sales Cycle" value={selected.profile.sales_cycle} />
                          <ProfileCard label="Pricing Model" value={selected.profile.pricing_model} />
                          <ProfileCard label="USP" value={selected.profile.usp} icon={Target} />
                        </div>
                      </div>

                      <div className="card-floating p-6">
                        <div className="font-display font-semibold mb-4">Products & Services</div>
                        {selected.profile.products_services?.length > 0 ? (
                          <div className="grid sm:grid-cols-2 gap-2">
                            {selected.profile.products_services.map((ps, i) => (
                              <div key={i} className="flex items-center gap-2 text-sm p-2.5 rounded-xl bg-ash border border-line">
                                <CheckCircle2 size={13} className="text-success shrink-0" />
                                {ps}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-sm text-neutral-400">No products/services identified</div>
                        )}
                      </div>

                      <div className="grid sm:grid-cols-2 gap-6">
                        <div className="card-floating p-6">
                          <TagList label="Pain Points" items={selected.profile.pain_points} icon={AlertTriangle} />
                        </div>
                        <div className="card-floating p-6">
                          <TagList label="Differentiators" items={selected.profile.differentiators} icon={Lightbulb} />
                        </div>
                      </div>

                      <div className="grid sm:grid-cols-2 gap-6">
                        <div className="card-floating p-6">
                          <TagList label="Competitors" items={selected.profile.competitors} icon={ShieldCheck} />
                        </div>
                        <div className="card-floating p-6">
                          <TagList label="Keywords" items={selected.profile.keywords} icon={Search} />
                        </div>
                      </div>

                      {(selected.profile.tech_stack?.length > 0) && (
                        <div className="card-floating p-6">
                          <TagList label="Tech Stack" items={selected.profile.tech_stack} icon={TrendingUp} />
                        </div>
                      )}

                      {(selected.profile.case_studies_summary) && (
                        <div className="card-floating p-6">
                          <div className="flex items-start gap-2.5">
                            <BookOpen size={15} className="text-neutral-400 mt-0.5 shrink-0" />
                            <div>
                              <div className="ui-label">Case Studies</div>
                              <div className="text-sm mt-1 text-neutral-500">{selected.profile.case_studies_summary}</div>
                            </div>
                          </div>
                        </div>
                      )}

                      {(selected.profile.blogs_summary) && (
                        <div className="card-floating p-6">
                          <div className="flex items-start gap-2.5">
                            <FileText size={15} className="text-neutral-400 mt-0.5 shrink-0" />
                            <div>
                              <div className="ui-label">Blog / Resources</div>
                              <div className="text-sm mt-1 text-neutral-500">{selected.profile.blogs_summary}</div>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {selected.status === "crawling" && (
                    <div className="card-floating p-12 text-center">
                      <Loader2 size={24} className="mx-auto animate-spin text-neutral-300 mb-3" />
                      <div className="font-display font-semibold">Crawling {selected.domain}...</div>
                      <p className="text-sm text-neutral-400 mt-1">Analysing every page on the site. This takes 30-60 seconds.</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="card-floating p-12 text-center">
                  <Building2 size={32} className="mx-auto text-neutral-300 mb-4" />
                  <div className="font-display text-xl font-semibold">Select a company</div>
                  <p className="text-sm text-neutral-400 mt-1">Choose a company from the left to view its intelligence profile.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
