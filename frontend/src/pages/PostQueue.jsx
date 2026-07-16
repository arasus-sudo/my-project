import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, isCreditError } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { CheckCircle2, Send, Trash2, X } from "lucide-react";

const STATUS_COLOR = {
  draft: "text-neutral-400 border-neutral-300",
  scheduled: "text-blue-700 border-blue-500",
  approved: "text-amber-700 border-amber-500",
  published: "text-green-700 border-green-700",
};

export default function PostQueue() {
  const [params] = useSearchParams();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);

  const load = () => api.get("/social-eq/posts").then((r) => {
    setPosts(r.data);
    setLoading(false);
    const focusId = params.get("post");
    if (focusId) {
      const found = r.data.find((p) => p.id === focusId);
      if (found) setDetail(found);
    }
  });
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const approve = async (id) => {
    await api.post(`/social-eq/posts/${id}/approve`);
    toast.success("Approved — ready to publish");
    load(); setDetail(null);
  };
  const publish = async (id) => {
    try {
      const { data } = await api.post(`/social-eq/posts/${id}/publish`);
      toast.success(data.mocked ? "Published in test mode — connect the platform to post live" : "Published");
      load(); setDetail(null);
    } catch (err) { if (!isCreditError(err)) toast.error(err?.response?.data?.detail || "Publish failed"); }
  };
  const remove = async (id) => {
    await api.delete(`/social-eq/posts/${id}`);
    setDetail(null); load();
  };

  return (
    <div>
      <PageHeader title="Queue" subtitle="Every draft, scheduled, approved, and published post." />
      <div className="animate-fade-in px-6 sm:px-8">
        {loading ? <div className="text-neutral-400 text-sm">Loading…</div> : posts.length === 0 ? (
          <div className="shadow-card p-6 sm:p-10 text-center text-sm text-neutral-400 rounded-2xl">No posts yet.</div>
        ) : (
          <div className="card-floating p-4 border border-line bg-white overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-neutral-400">
                  <th className="ui-label text-left p-3">Platform</th>
                  <th className="ui-label text-left p-3">Headline</th>
                  <th className="ui-label text-left p-3">Status</th>
                  <th className="ui-label text-right p-3">Engagement</th>
                </tr>
              </thead>
              <tbody>
                {posts.map((p) => (
                  <tr key={p.id} onClick={() => setDetail(p)} data-testid={`post-row-${p.id}`}
                    className="border-b border-line hover:bg-surfacehover cursor-pointer">
                    <td className="p-3 capitalize text-neutral-400">{p.platform}</td>
                    <td className="p-3 font-medium">{p.headline}</td>
                    <td className="p-3"><span className={`ui-label inline-block px-2 py-0.5 border ${STATUS_COLOR[p.status] || STATUS_COLOR.draft}`}>{p.status}</span></td>
                    <td className="p-3 text-right font-mono text-xs">
                      {p.engagement ? `${p.engagement.likes}♥ ${p.engagement.comments}💬` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detail && (
        <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50" onClick={(e) => e.target === e.currentTarget && setDetail(null)}>
          <div className="bg-white border border-line p-6 sm:p-8 rounded-2xl w-full max-w-lg space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <div className="ui-label text-neutral-400 capitalize">{detail.platform}</div>
                <div className="font-display font-semibold text-lg">{detail.headline}</div>
              </div>
              <button onClick={() => setDetail(null)} className="text-neutral-400 hover:text-ink"><X size={18} /></button>
            </div>
            <p className="text-sm whitespace-pre-wrap">{detail.body}</p>
            {detail.hashtags?.length > 0 && (
              <div className="text-xs text-sanguine">{detail.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")}</div>
            )}
            {detail.engagement && (
              <div className="text-xs text-neutral-400 font-mono">
                {detail.engagement.likes} likes · {detail.engagement.comments} comments · {detail.engagement.shares} shares · {detail.engagement.views} views
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              {detail.status === "draft" && (
                <button onClick={() => approve(detail.id)} data-testid="approve-post-btn" className="btn-secondary text-xs">
                  <CheckCircle2 size={12} /> Approve
                </button>
              )}
              {detail.status === "approved" && (
                <button onClick={() => publish(detail.id)} data-testid="publish-post-btn" className="btn-primary text-xs">
                  <Send size={12} /> Publish
                </button>
              )}
              {detail.status !== "published" && (
                <button onClick={() => remove(detail.id)} data-testid="delete-post-btn" className="btn-secondary text-xs text-red-600">
                  <Trash2 size={12} /> Delete
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
