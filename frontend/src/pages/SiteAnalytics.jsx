import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export default function SiteAnalytics() {
  const [data, setData] = useState(null);

  useEffect(() => { api.get("/site-eq/analytics").then((r) => setData(r.data)); }, []);

  if (!data) return <div className="p-6 sm:p-8 text-ink-muted text-body animate-fade-in">Loading…</div>;

  const trend = Object.entries(data.by_day).map(([day, count]) => ({ day: day.slice(5), count }));

  return (
    <div>
      <PageHeader title="Analytics" subtitle="How your Site EQ widget is doing across every site." />
      <div className="animate-fade-in px-6 sm:px-8 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Conversations" value={data.total_conversations} />
          <StatCard label="Resolved" value={data.resolved} />
          <StatCard label="Needs a human" value={data.needs_human} />
          <StatCard label="Leads captured" value={data.leads_captured} />
        </div>

        <div className="card-flat shadow-card p-6 sm:p-8">
          <div className="ui-label mb-4">Conversations over time</div>
          <div className="h-64">
            <ResponsiveContainer>
              <LineChart data={trend}>
                <CartesianGrid vertical={false} strokeDasharray="0" stroke="#E5E5E7" />
                <XAxis dataKey="day" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ border: "1px solid #E5E5E7", borderRadius: 12, fontFamily: "Roboto Mono", fontSize: 12 }} />
                <Line type="monotone" dataKey="count" stroke="#1D1D1F" strokeWidth={2} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card-flat shadow-card p-6 sm:p-8">
          <div className="ui-label mb-2">Resolution rate</div>
          <div className="font-mono text-app-title font-bold">{data.resolution_rate}%</div>
          <div className="mt-3 h-2 bg-line rounded-full overflow-hidden">
            <div className="h-full bg-accent" style={{ width: `${data.resolution_rate}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="p-3 sm:p-4 bg-white shadow-card rounded-2xl">
      <div className="ui-label">{label}</div>
      <div className="text-section font-mono font-bold mt-1.5">{value}</div>
    </div>
  );
}
