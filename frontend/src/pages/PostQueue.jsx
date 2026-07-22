import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, isCreditError } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { CheckCircle2, Send, Trash2, X, XCircle, Pencil, Save } from "lucide-react";
import { SkeletonTableRows } from "../components/ui/loading-states";

const STATUS_COLOR = {
  draft: "text-ink-muted border-neutral-300",
  scheduled: "text-info border-info",
  pending_approval: "text-warning border-warning",
  approved: "text-accent border-accent",
  publishing: "text-accent border-accent",
  published: "text-success border-success",
  rejected: "text-danger border-danger",
  publish_failed: "text-danger border-danger",
};

const STATUS_LABEL = {
  pending_approval: "awaiting approval",
  publish_failed: "publish failed",
};

export default function PostQueue() {
  const [params] = useSearchParams();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);

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

  const openDetail = (p) => { setDetail(p); setEditing(false); setForm(null); };

  const approve = async (id) => {
    await api.post(`/social-eq/posts/${id}/approve`);
    toast.success("Approved — will publish automatically at its scheduled time");
    load(); setDetail(null);
  };
  const reject = async (id) => {
    await api.post(`/social-eq/posts/${id}/reject`);
    toast.success("Rejected");
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

  const startEdit = () => {
    setForm({
      headline: detail.headline || "",
      body: detail.body || "",
      hashtags: (detail.hashtags || []).join(", "),
      scheduled_for: detail.scheduled_for ? detail.scheduled_for.slice(0, 16) : "",
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    const payload = {
      headline: form.headline,
      body: form.body,
      hashtags: form.hashtags.split(",").map((h) => h.trim()).filter(Boolean),
    };
    if (form.scheduled_for) payload.scheduled_for = new Date(form.scheduled_for).toISOString();
    const { data } = await api.put(`/social-eq/posts/${detail.id}`, payload);
    toast.success("Saved");
    setDetail(data); setEditing(false); load();
  };

  return (
    <div>
      <PageHeader title="Queue" subtitle="Every draft, scheduled, pending-approval, approved, and published post." />
      <div className="animate-fade-in px-6 sm:px-8">
        {loading ? (
          <div className="card-floating p-4 border border-line bg-white overflow-x-auto">
            <table className="w-full text-table">
              <thead>
                <tr className="border-b border-line">
                  <th className="table-header text-left p-3">Platform</th>
                  <th className="table-header text-left p-3">Headline</th>
                  <th className="table-header text-left p-3">Scheduled</th>
                  <th className="table-header text-left p-3">Status</th>
                  <th className="table-header text-right p-3">Engagement</th>
                </tr>
              </thead>
              <tbody><SkeletonTableRows rows={5} cols={5} /></tbody>
            </table>
          </div>
        ) : posts.length === 0 ? (
          <div className="shadow-card p-6 sm:p-10 text-center text-body text-ink-muted rounded-2xl">No posts yet.</div>
        ) : (
          <div className="card-floating p-4 border border-line bg-white overflow-x-auto">
            <table className="w-full text-table">
              <thead>
                <tr className="border-b border-line">
                  <th className="table-header text-left p-3">Platform</th>
                  <th className="table-header text-left p-3">Headline</th>
                  <th className="table-header text-left p-3">Scheduled</th>
                  <th className="table-header text-left p-3">Status</th>
                  <th className="table-header text-right p-3">Engagement</th>
                </tr>
              </thead>
              <tbody>
                {posts.map((p) => (
                  <tr key={p.id} onClick={() => openDetail(p)} data-testid={`post-row-${p.id}`}
                    className="border-b border-line hover:bg-surfacehover cursor-pointer transition-colors duration-150">
                    <td className="p-3 capitalize text-ink-muted">{p.platform}</td>
                    <td className="p-3 font-medium">{p.headline}</td>
                    <td className="p-3 text-tiny text-ink-muted font-mono">{p.scheduled_for ? p.scheduled_for.slice(0, 10) : "—"}</td>
                    <td className="p-3">
                      <span className={`ui-label inline-block px-2 py-0.5 border ${STATUS_COLOR[p.status] || STATUS_COLOR.draft}`}>
                        {STATUS_LABEL[p.status] || p.status}
                      </span>
                    </td>
                    <td className="p-3 text-right font-mono text-tiny">
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
        <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50 p-4" onClick={(e) => e.target === e.currentTarget && setDetail(null)}>
          <div className="bg-white border border-line p-6 sm:p-8 rounded-2xl w-full max-w-lg space-y-3 max-h-[85vh] overflow-y-auto">
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <div className="ui-label capitalize">{detail.platform} · {detail.content_type || "static"}</div>
                {editing ? (
                  <input value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })}
                    className="text-card-title font-display font-semibold w-full border-b border-line focus:outline-none focus:border-accent" />
                ) : (
                  <div className="text-card-title font-display font-semibold truncate">{detail.headline}</div>
                )}
              </div>
              <button onClick={() => setDetail(null)} className="text-ink-muted hover:text-ink shrink-0 ml-2"><X size={16} /></button>
            </div>

            {detail.media_url && (
              <img src={`${api.defaults.baseURL}${detail.media_url}`} alt="" className="w-full rounded-xl border border-line object-cover max-h-64" />
            )}

            {editing ? (
              <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={4}
                className="w-full border border-line rounded-xl px-3 py-2 text-input" />
            ) : (
              <p className="text-body whitespace-pre-wrap">{detail.body}</p>
            )}

            {editing ? (
              <input value={form.hashtags} onChange={(e) => setForm({ ...form, hashtags: e.target.value })}
                placeholder="hashtags, comma, separated" className="w-full border border-line rounded-xl px-3 py-2 text-caption" />
            ) : detail.hashtags?.length > 0 && (
              <div className="text-caption text-accent">{detail.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")}</div>
            )}

            <div>
              <label className="form-label block mb-1">Scheduled for</label>
              {editing ? (
                <input type="datetime-local" value={form.scheduled_for}
                  onChange={(e) => setForm({ ...form, scheduled_for: e.target.value })}
                  data-testid="post-schedule-input"
                  className="w-full border border-line rounded-xl px-3 py-2 text-input" />
              ) : (
                <div className="text-caption text-ink-muted font-mono">
                  {detail.scheduled_for ? new Date(detail.scheduled_for).toLocaleString() : "Not scheduled — publishes as soon as approved"}
                </div>
              )}
            </div>

            {detail.status === "publish_failed" && detail.publish_error && (
              <div className="text-caption text-danger bg-danger/10 border border-danger/30 rounded-xl px-3 py-2">{detail.publish_error}</div>
            )}
            {detail.engagement && (
              <div className="text-caption text-ink-muted font-mono">
                {detail.engagement.likes} likes · {detail.engagement.comments} comments · {detail.engagement.shares} shares · {detail.engagement.views} views
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 flex-wrap">
              {editing ? (
                <>
                  <button onClick={() => setEditing(false)} className="btn-secondary text-xs">Cancel</button>
                  <button onClick={saveEdit} data-testid="save-post-btn" className="btn-primary text-xs"><Save size={12} /> Save</button>
                </>
              ) : (
                <>
                  {detail.status !== "published" && (
                    <button onClick={startEdit} data-testid="edit-post-btn" className="btn-secondary text-xs"><Pencil size={12} /> Edit</button>
                  )}
                  {(detail.status === "draft" || detail.status === "pending_approval" || detail.status === "scheduled") && (
                    <>
                      <button onClick={() => approve(detail.id)} data-testid="approve-post-btn" className="btn-secondary text-xs">
                        <CheckCircle2 size={12} /> Approve
                      </button>
                      <button onClick={() => reject(detail.id)} data-testid="reject-post-btn" className="btn-secondary text-xs text-danger">
                        <XCircle size={12} /> Reject
                      </button>
                    </>
                  )}
                  {(detail.status === "approved" || detail.status === "publish_failed") && (
                    <button onClick={() => publish(detail.id)} data-testid="publish-post-btn" className="btn-primary text-xs">
                      <Send size={12} /> Publish now
                    </button>
                  )}
                  {detail.status !== "published" && (
                    <button onClick={() => remove(detail.id)} data-testid="delete-post-btn" className="btn-secondary text-xs text-danger">
                      <Trash2 size={12} /> Delete
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
