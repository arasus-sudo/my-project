import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import Card from "../components/composites/Card";
import MetricCard from "../components/composites/MetricCard";
import LineChart from "../components/charts/LineChart";
import InlineAlert from "../components/composites/InlineAlert";

const PLATFORM_LABEL = { linkedin: "LinkedIn", instagram: "Instagram", youtube: "YouTube" };
const TREND_SERIES = [
  { key: "likes", label: "Likes" },
  { key: "comments", label: "Comments" },
  { key: "shares", label: "Shares" },
];

export default function SocialAnalytics() {
  const [data, setData] = useState(null);

  useEffect(() => { api.get("/social-eq/analytics").then((r) => setData(r.data)); }, []);

  if (!data) return <div className="p-6 sm:p-8 animate-fade-in" style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Loading…</div>;

  const trend = Object.entries(data.by_day).map(([day, v]) => ({ label: day.slice(5), ...v }));
  const platforms = Object.entries(data.by_platform);

  return (
    <div>
      <PageHeader title="Analytics" subtitle="Engagement across every published post." />
      <div className="animate-fade-in px-6 sm:px-8 py-6 space-y-4">
        {data.mocked_count > 0 && (
          <InlineAlert tone="warning">
            {data.real_count} of {data.total_posts} posts are on connected, real platforms — the rest ({data.mocked_count}) are
            in test mode, so their engagement numbers are simulated, not real audience data.
          </InlineAlert>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <MetricCard label="Total posts" value={data.total_posts} />
          <MetricCard label="Real (live)" value={data.real_count} />
          <MetricCard label="Test mode" value={data.mocked_count} />
          <MetricCard label="Platforms active" value={platforms.length} />
        </div>

        <Card title="Engagement over time">
          <LineChart data={trend} series={TREND_SERIES} height={256} />
        </Card>

        <div className="grid md:grid-cols-2 gap-4">
          <Card title="By platform">
            <div className="space-y-3">
              {platforms.map(([platform, v]) => (
                <div key={platform} className="flex items-center justify-between" style={{ fontSize: 13 }}>
                  <span className="capitalize" style={{ fontWeight: 500, color: "var(--text-primary)" }}>{PLATFORM_LABEL[platform] || platform}</span>
                  <span className="tnum" style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
                    {v.posts} posts · {v.likes}♥ {v.comments}💬 {v.shares}↻ {v.views}👁
                  </span>
                </div>
              ))}
              {platforms.length === 0 && <div style={{ fontSize: 13, color: "var(--text-tertiary)" }}>No published posts yet.</div>}
            </div>
          </Card>

          <Card title="Top posts">
            <div className="space-y-3">
              {data.top_posts.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3" style={{ fontSize: 13 }}>
                  <span className="truncate" style={{ color: "var(--text-primary)" }}>{p.headline}</span>
                  <span className="tnum shrink-0" style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
                    {(p.engagement?.likes || 0)}♥ {(p.engagement?.comments || 0)}💬
                  </span>
                </div>
              ))}
              {data.top_posts.length === 0 && <div style={{ fontSize: 13, color: "var(--text-tertiary)" }}>No published posts yet.</div>}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
