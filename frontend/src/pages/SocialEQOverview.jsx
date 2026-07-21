import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { PenSquare, Clock, CheckCircle2, Send } from "lucide-react";

export default function SocialEQOverview() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.get("/social-eq/posts").then((r) => { setPosts(r.data); setLoading(false); }); }, []);

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
      <div className="animate-fade-in px-6 sm:px-8 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard icon={PenSquare} label="Drafts" value={loading ? "—" : drafts} />
          <StatCard icon={Clock} label="Awaiting approval/publish" value={loading ? "—" : pending} />
          <StatCard icon={CheckCircle2} label="Published" value={loading ? "—" : published.length} />
          <StatCard icon={Send} label="Total engagement" value={loading ? "—" : totalEngagement} />
        </div>

        {!loading && posts.length === 0 && (
          <div className="shadow-card p-10 text-center rounded-2xl">
            <div className="text-section font-display font-semibold">Draft your first post</div>
            <p className="text-caption text-ink-muted mt-2">Nothing publishes without your explicit review and approval.</p>
            <Link to="/app/social-eq/compose" className="btn-primary mt-6 inline-flex">Compose a post</Link>
          </div>
        )}

        {!loading && posts.length > 0 && (
          <div className="card-floating p-4 border border-line bg-white overflow-x-auto">
            <div className="p-4 border-b border-line text-card-title font-display font-semibold">Recent posts</div>
            <table className="w-full text-table">
              <tbody>
                {posts.slice(0, 8).map((p) => (
                  <tr key={p.id} className="border-b border-line last:border-0">
                    <td className="p-3 capitalize text-ink-muted">{p.platform}</td>
                    <td className="p-3 font-medium">{p.headline}</td>
                    <td className="p-3 text-tiny text-ink-muted text-right">{p.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }) {
  return (
    <div className="shadow-card p-4 rounded-2xl">
      <div className="flex items-center gap-2 text-ink-muted">
        <Icon size={14} />
        <span className="ui-label">{label}</span>
      </div>
      <div className="text-section font-display font-bold mt-1">{value}</div>
    </div>
  );
}
