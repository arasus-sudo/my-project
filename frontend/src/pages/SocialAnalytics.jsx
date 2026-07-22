import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { AlertTriangle } from "lucide-react";

const PLATFORM_LABEL = { linkedin: "LinkedIn", instagram: "Instagram", youtube: "YouTube" };

export default function SocialAnalytics() {
  const [data, setData] = useState(null);

  useEffect(() => { api.get("/social-eq/analytics").then((r) => setData(r.data)); }, []);

  if (!data) return <div className="p-6 sm:p-8 text-ink-muted text-body animate-fade-in">Loading…</div>;

  const trend = Object.entries(data.by_day).map(([day, v]) => ({ day: day.slice(5), ...v }));
  const platforms = Object.entries(data.by_platform);

  return (
    <div>
      <PageHeader title="Analytics" subtitle="Engagement across every published post." />
      <div className="animate-fade-in px-6 sm:px-8 space-y-6">
        {data.mocked_count > 0 && (
          <div className="flex items-start gap-2 text-caption text-warning bg-warning/10 border border-warning/30 rounded-xl px-4 py-2.5">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            {data.real_count} of {data.total_posts} posts are on connected, real platforms — the rest ({data.mocked_count}) are
            in test mode, so their engagement numbers are simulated, not real audience data.
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Total posts" value={data.total_posts} />
          <StatCard label="Real (live)" value={data.real_count} />
          <StatCard label="Test mode" value={data.mocked_count} />
          <StatCard label="Platforms active" value={platforms.length} />
        </div>

        <div className="card-flat shadow-card p-6 sm:p-8">
          <div className="ui-label mb-4">Engagement over time</div>
          <div className="h-64">
            <ResponsiveContainer>
              <LineChart data={trend}>
                <CartesianGrid vertical={false} strokeDasharray="0" stroke="#E5E5E7" />
                <XAxis dataKey="day" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ border: "1px solid #E5E5E7", borderRadius: 12, fontFamily: "Roboto Mono", fontSize: 12 }} />
                <Line type="monotone" dataKey="likes" stroke="#1D1D1F" strokeWidth={2} dot={{ r: 2 }} />
                <Line type="monotone" dataKey="comments" stroke="#8E8E93" strokeWidth={1.5} strokeDasharray="6 3" dot={{ r: 2 }} />
                <Line type="monotone" dataKey="shares" stroke="#D2D2D7" strokeWidth={1.5} strokeDasharray="2 3" dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 flex flex-wrap gap-3 sm:gap-5 text-caption font-mono text-ink-muted uppercase">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-ink" /> Likes</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-neutral-500" /> Comments</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-neutral-300" /> Shares</span>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="card-flat shadow-card p-6 sm:p-8">
            <div className="ui-label mb-4">By platform</div>
            <div className="space-y-3">
              {platforms.map(([platform, v]) => (
                <div key={platform} className="flex items-center justify-between text-body">
                  <span className="capitalize font-medium">{PLATFORM_LABEL[platform] || platform}</span>
                  <span className="font-mono text-caption text-ink-muted">
                    {v.posts} posts · {v.likes}♥ {v.comments}💬 {v.shares}↻ {v.views}👁
                  </span>
                </div>
              ))}
              {platforms.length === 0 && <div className="text-body text-ink-muted">No published posts yet.</div>}
            </div>
          </div>

          <div className="card-flat shadow-card p-6 sm:p-8">
            <div className="ui-label mb-4">Top posts</div>
            <div className="space-y-3">
              {data.top_posts.map((p) => (
                <div key={p.id} className="flex items-center justify-between text-body gap-3">
                  <span className="truncate">{p.headline}</span>
                  <span className="font-mono text-caption text-ink-muted shrink-0">
                    {(p.engagement?.likes || 0)}♥ {(p.engagement?.comments || 0)}💬
                  </span>
                </div>
              ))}
              {data.top_posts.length === 0 && <div className="text-body text-ink-muted">No published posts yet.</div>}
            </div>
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
