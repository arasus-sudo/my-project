import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { Globe, MessageCircle, Users, TrendingUp } from "lucide-react";

export default function SiteEQOverview() {
  const [sites, setSites] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.get("/site-eq/sites"), api.get("/site-eq/analytics")])
      .then(([s, a]) => { setSites(s.data); setAnalytics(a.data); setLoading(false); });
  }, []);

  return (
    <div>
      <PageHeader
        title="Site EQ"
        subtitle="An AI chat widget for your website — answers from your own content, hands off to a human when it can't."
      />
      <div className="animate-fade-in px-6 sm:px-8 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard icon={Globe} label="Sites" value={loading ? "—" : sites.length} />
          <StatCard icon={MessageCircle} label="Conversations" value={loading ? "—" : analytics?.total_conversations ?? 0} />
          <StatCard icon={TrendingUp} label="Resolution rate" value={loading ? "—" : `${analytics?.resolution_rate ?? 0}%`} />
          <StatCard icon={Users} label="Leads captured" value={loading ? "—" : analytics?.leads_captured ?? 0} />
        </div>

        {!loading && sites.length === 0 && (
          <div className="shadow-card rounded-2xl p-10 text-center">
            <div className="font-display text-xl sm:text-2xl font-semibold">Add your first site</div>
            <p className="text-sm text-neutral-400 mt-2">Crawl a website into a knowledge base, then embed the chat widget.</p>
            <Link to="/app/site-eq/sites" className="btn-primary mt-6 inline-flex">Add a site</Link>
          </div>
        )}

        {!loading && sites.length > 0 && (
          <div className="shadow-card rounded-2xl border border-line bg-white">
            <div className="p-4 border-b border-line font-display font-semibold text-sm">Your sites</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {sites.map((s) => (
                    <tr key={s.id} className="border-b border-line last:border-0">
                      <td className="p-3 font-medium">{s.name}</td>
                      <td className="p-3 font-mono text-xs text-neutral-400">{s.domain}</td>
                      <td className="p-3 text-neutral-500">{s.pages_crawled} pages</td>
                      <td className="p-3 text-right">
                        <span className={`ui-label px-2 py-0.5 border rounded-full ${s.status === "ready" ? "text-success border-success" : s.status === "crawling" ? "text-warning border-warning" : "text-neutral-400 border-line"}`}>
                          {s.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }) {
  return (
    <div className="shadow-card rounded-2xl p-4">
      <div className="flex items-center gap-2 text-neutral-400">
        <Icon size={14} />
        <span className="ui-label">{label}</span>
      </div>
      <div className="font-display text-xl sm:text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}
