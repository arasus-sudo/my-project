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
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-4 gap-4">
          <StatCard icon={PenSquare} label="Drafts" value={loading ? "—" : drafts} />
          <StatCard icon={Clock} label="Awaiting approval/publish" value={loading ? "—" : pending} />
          <StatCard icon={CheckCircle2} label="Published" value={loading ? "—" : published.length} />
          <StatCard icon={Send} label="Total engagement" value={loading ? "—" : totalEngagement} />
        </div>

        {!loading && posts.length === 0 && (
          <div className="card-flat p-10 text-center">
            <div className="font-display text-xl font-bold">Draft your first post</div>
            <p className="text-sm text-neutral-500 mt-2">Nothing publishes without your explicit review and approval.</p>
            <Link to="/app/social-eq/compose" className="btn-primary mt-6 inline-flex">Compose a post</Link>
          </div>
        )}

        {!loading && posts.length > 0 && (
          <div className="border border-line bg-white">
            <div className="p-4 border-b border-line font-display font-semibold text-sm">Recent posts</div>
            <table className="w-full text-sm">
              <tbody>
                {posts.slice(0, 8).map((p) => (
                  <tr key={p.id} className="border-b border-line last:border-0">
                    <td className="p-3 capitalize text-neutral-600">{p.platform}</td>
                    <td className="p-3 font-medium">{p.headline}</td>
                    <td className="p-3 text-xs text-neutral-400 text-right">{p.status}</td>
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
    <div className="card-flat p-4">
      <div className="flex items-center gap-2 text-neutral-500">
        <Icon size={14} />
        <span className="ui-label">{label}</span>
      </div>
      <div className="font-display text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}
