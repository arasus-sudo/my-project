import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { Globe, MessageSquare, Users, TrendingUp } from "../icons";
import Card from "../components/composites/Card";
import MetricCard from "../components/composites/MetricCard";
import { EmptyState } from "../components/composites/EmptyState";
import StatusPill from "../components/primitives/StatusPill";

export default function SiteEQOverview() {
  const nav = useNavigate();
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
      <div className="animate-fade-in px-6 sm:px-8 py-6 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <MetricCard icon={Globe} label="Sites" value={loading ? "—" : sites.length} />
          <MetricCard icon={MessageSquare} label="Conversations" value={loading ? "—" : analytics?.total_conversations ?? 0} />
          <MetricCard icon={TrendingUp} label="Resolution rate" value={loading ? "—" : `${analytics?.resolution_rate ?? 0}%`} />
          <MetricCard icon={Users} label="Leads captured" value={loading ? "—" : analytics?.leads_captured ?? 0} />
        </div>

        {!loading && sites.length === 0 && (
          <EmptyState icon={Globe} title="Add your first site" description="Crawl a website into a knowledge base, then embed the chat widget."
            actionLabel="Add a site" onAction={() => nav("/app/site-eq/sites")} />
        )}

        {!loading && sites.length > 0 && (
          <Card title="Your sites" padding="compact" bodyClassName="-mx-5">
            <div className="overflow-x-auto">
              <table className="w-full" style={{ fontSize: 13 }}>
                <tbody>
                  {sites.map((s) => (
                    <tr key={s.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                      <td style={{ padding: "10px 20px", fontWeight: 500, color: "var(--text-primary)" }}>{s.name}</td>
                      <td className="tnum" style={{ padding: "10px 0", fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--text-tertiary)" }}>{s.domain}</td>
                      <td style={{ padding: "10px 0", color: "var(--text-tertiary)" }}>{s.pages_crawled} pages</td>
                      <td style={{ padding: "10px 20px", textAlign: "right" }}>
                        <StatusPill status={s.status} tone={s.status === "ready" ? "success" : s.status === "crawling" ? "warning" : "neutral"} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
