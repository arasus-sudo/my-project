import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import Card from "../components/composites/Card";
import MetricCard from "../components/composites/MetricCard";
import LineChart from "../components/charts/LineChart";

const TREND_SERIES = [{ key: "count", label: "Conversations" }];

export default function SiteAnalytics() {
  const [data, setData] = useState(null);

  useEffect(() => { api.get("/site-eq/analytics").then((r) => setData(r.data)); }, []);

  if (!data) return <div className="p-6 sm:p-8 animate-fade-in" style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Loading…</div>;

  const trend = Object.entries(data.by_day).map(([day, count]) => ({ label: day.slice(5), count }));

  return (
    <div>
      <PageHeader title="Analytics" subtitle="How your Site EQ widget is doing across every site." />
      <div className="animate-fade-in px-6 sm:px-8 py-6 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <MetricCard label="Conversations" value={data.total_conversations} />
          <MetricCard label="Resolved" value={data.resolved} />
          <MetricCard label="Needs a human" value={data.needs_human} />
          <MetricCard label="Leads captured" value={data.leads_captured} />
        </div>

        <Card title="Conversations over time">
          <LineChart data={trend} series={TREND_SERIES} height={256} />
        </Card>

        <Card title="Resolution rate">
          <div className="tnum" style={{ fontSize: 26, fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>{data.resolution_rate}%</div>
          <div className="overflow-hidden" style={{ marginTop: 12, height: 8, background: "var(--border-default)", borderRadius: "var(--radius-full)" }}>
            <div style={{ height: "100%", background: "var(--color-primary)", width: `${data.resolution_rate}%` }} />
          </div>
        </Card>
      </div>
    </div>
  );
}
