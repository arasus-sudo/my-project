import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { PenSquare, Clock, CheckCircle2, Send } from "../icons";
import Card from "../components/composites/Card";
import MetricCard from "../components/composites/MetricCard";
import { EmptyState } from "../components/composites/EmptyState";

export default function SocialEQOverview() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.get("/social-eq/posts").then((r) => { setPosts(r.data); setLoading(false); }); }, []);

  useEffect(() => {
    if (params.get("setup") === "skipped") return;
    api.get("/workspace/brand-voice").then((r) => {
      if (!(r.data.content_pillars || []).length) nav("/app/social-eq/setup");
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const drafts = posts.filter((p) => p.status === "draft").length;
  const pending = posts.filter((p) => p.status === "scheduled" || p.status === "approved").length;
  const published = posts.filter((p) => p.status === "published");
  const totalEngagement = published.reduce((s, p) => s + (p.engagement?.likes || 0) + (p.engagement?.comments || 0), 0);

  return (
    <div>
      <PageHeader
        title="Social EQ"
        subtitle="Drafts, schedules, and — only with your explicit approval — publishes posts to LinkedIn, Instagram, and YouTube."
      />
      <div className="animate-fade-in px-6 sm:px-8 py-6 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <MetricCard icon={PenSquare} label="Drafts" value={loading ? "—" : drafts} />
          <MetricCard icon={Clock} label="Awaiting approval/publish" value={loading ? "—" : pending} />
          <MetricCard icon={CheckCircle2} label="Published" value={loading ? "—" : published.length} />
          <MetricCard icon={Send} label="Total engagement" value={loading ? "—" : totalEngagement} />
        </div>

        {!loading && posts.length === 0 && (
          <EmptyState icon={PenSquare} title="Draft your first post" description="Nothing publishes without your explicit review and approval."
            actionLabel="Compose a post" onAction={() => nav("/app/social-eq/compose")} />
        )}

        {!loading && posts.length > 0 && (
          <Card title="Recent posts" padding="compact" bodyClassName="-mx-5">
            <div className="overflow-x-auto">
              <table className="w-full" style={{ fontSize: 13 }}>
                <tbody>
                  {posts.slice(0, 8).map((p) => (
                    <tr key={p.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                      <td className="capitalize" style={{ padding: "10px 20px", color: "var(--text-tertiary)" }}>{p.platform}</td>
                      <td style={{ padding: "10px 0", fontWeight: 500, color: "var(--text-primary)" }}>{p.headline}</td>
                      <td style={{ padding: "10px 20px", fontSize: 11, color: "var(--text-tertiary)", textAlign: "right" }}>{p.status}</td>
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
