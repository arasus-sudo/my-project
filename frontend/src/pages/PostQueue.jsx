import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, isCreditError } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { CheckCircle2, Send, Trash2, AlertCircle, Pencil, Check } from "../icons";
import { SkeletonTableRows } from "../components/ui/loading-states";
import Table from "../components/composites/Table";
import { EmptyState } from "../components/composites/EmptyState";
import { Modal, ModalContent } from "../components/composites/Modal";
import StatusPill from "../components/primitives/StatusPill";
import Button from "../components/primitives/Button";
import Input from "../components/primitives/Input";

const STATUS_TONE = {
  draft: "neutral",
  scheduled: "primary",
  pending_approval: "warning",
  approved: "primary",
  publishing: "primary",
  published: "success",
  rejected: "danger",
  publish_failed: "danger",
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

  const columns = [
    { key: "platform", label: "Platform", render: (p) => <span className="capitalize" style={{ color: "var(--text-tertiary)" }}>{p.platform}</span> },
    { key: "headline", label: "Headline", render: (p) => <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>{p.headline}</span> },
    { key: "scheduled", label: "Scheduled", render: (p) => <span className="tnum" style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{p.scheduled_for ? p.scheduled_for.slice(0, 10) : "—"}</span> },
    {
      key: "status", label: "Status", render: (p) => (
        <div className="flex items-center gap-1">
          <StatusPill status={STATUS_LABEL[p.status] || p.status} tone={STATUS_TONE[p.status]} />
          {p.content_type === "video" && p.video_status && p.video_status !== "ready" && (
            <StatusPill status={p.video_status === "processing" ? "generating video" : p.video_status} tone={p.video_status === "failed" ? "danger" : "warning"} />
          )}
        </div>
      ),
    },
    { key: "engagement", label: "Engagement", align: "right", render: (p) => <span className="tnum" style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{p.engagement ? `${p.engagement.likes}♥ ${p.engagement.comments}💬` : "—"}</span> },
  ];

  return (
    <div>
      <PageHeader title="Queue" subtitle="Every draft, scheduled, pending-approval, approved, and published post." />
      <div className="animate-fade-in px-6 sm:px-8 py-6">
        {loading ? (
          <div style={{ padding: 16, borderRadius: "var(--radius-xl)", border: "1px solid var(--border-default)", background: "var(--bg-surface)" }}>
            <table className="w-full"><tbody><SkeletonTableRows rows={5} cols={5} /></tbody></table>
          </div>
        ) : posts.length === 0 ? (
          <EmptyState title="No posts yet" description="Drafted posts will appear here once you compose one." />
        ) : (
          <Table columns={columns} rows={posts} rowKey={(p) => p.id} onRowClick={openDetail} />
        )}
      </div>

      <Modal open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        {detail && (
          <ModalContent
            size="md"
            title={detail.headline}
            subtitle={`${detail.platform} · ${detail.content_type || "static"}`}
            footer={editing ? (
              <>
                <Button variant="secondary" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
                <Button variant="primary" size="sm" icon={Check} onClick={saveEdit} data-testid="save-post-btn">Save</Button>
              </>
            ) : (
              <>
                {detail.status !== "published" && (
                  <Button variant="secondary" size="sm" icon={Pencil} onClick={startEdit} data-testid="edit-post-btn">Edit</Button>
                )}
                {(detail.status === "draft" || detail.status === "pending_approval" || detail.status === "scheduled") &&
                  !(detail.content_type === "video" && detail.video_status === "processing") && (
                  <>
                    <Button variant="secondary" size="sm" icon={CheckCircle2} onClick={() => approve(detail.id)} data-testid="approve-post-btn">Approve</Button>
                    <Button variant="danger-subtle" size="sm" icon={AlertCircle} onClick={() => reject(detail.id)} data-testid="reject-post-btn">Reject</Button>
                  </>
                )}
                {(detail.status === "approved" || detail.status === "publish_failed") && (
                  <Button variant="primary" size="sm" icon={Send} onClick={() => publish(detail.id)} data-testid="publish-post-btn">Publish now</Button>
                )}
                {detail.status !== "published" && (
                  <Button variant="danger-subtle" size="sm" icon={Trash2} onClick={() => remove(detail.id)} data-testid="delete-post-btn">Delete</Button>
                )}
              </>
            )}
          >
            <div className="space-y-3">
              {editing && (
                <Input value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} />
              )}

              {detail.content_type === "video" && detail.video_status === "processing" && (
                <div className="text-center" style={{ border: "1px dashed var(--border-default)", borderRadius: "var(--radius-lg)", padding: 24 }}>
                  <p style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>Generating video — this can take a few minutes. Refresh to check progress.</p>
                </div>
              )}
              {detail.content_type === "video" && detail.video_status === "failed" && (
                <div className="text-center" style={{ border: "1px solid var(--color-danger-border)", borderRadius: "var(--radius-lg)", padding: 16 }}>
                  <p style={{ fontSize: 12.5, color: "var(--color-danger)" }}>Video generation failed.</p>
                </div>
              )}
              {detail.media_url && detail.content_type === "video" ? (
                <video src={`${api.defaults.baseURL}${detail.media_url}`} controls className="w-full" style={{ borderRadius: "var(--radius-lg)", border: "1px solid var(--border-default)", maxHeight: 256 }} />
              ) : detail.media_url && (
                <img src={`${api.defaults.baseURL}${detail.media_url}`} alt="" className="w-full object-cover" style={{ borderRadius: "var(--radius-lg)", border: "1px solid var(--border-default)", maxHeight: 256 }} />
              )}

              {editing ? (
                <Input as="textarea" rows={4} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
              ) : (
                <p className="whitespace-pre-wrap" style={{ fontSize: 13, color: "var(--text-secondary)" }}>{detail.body}</p>
              )}

              {editing ? (
                <Input value={form.hashtags} onChange={(e) => setForm({ ...form, hashtags: e.target.value })} placeholder="hashtags, comma, separated" />
              ) : detail.hashtags?.length > 0 && (
                <div style={{ fontSize: 12.5, color: "var(--color-primary)" }}>{detail.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")}</div>
              )}

              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--text-primary)", marginBottom: 6 }}>Scheduled for</label>
                {editing ? (
                  <Input type="datetime-local" value={form.scheduled_for} onChange={(e) => setForm({ ...form, scheduled_for: e.target.value })} data-testid="post-schedule-input" />
                ) : (
                  <div className="tnum" style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                    {detail.scheduled_for ? new Date(detail.scheduled_for).toLocaleString() : "Not scheduled — publishes as soon as approved"}
                  </div>
                )}
              </div>

              {detail.status === "publish_failed" && detail.publish_error && (
                <div style={{ fontSize: 12.5, color: "var(--color-danger)", background: "var(--color-danger-subtle)", border: "1px solid var(--color-danger-border)", borderRadius: "var(--radius-lg)", padding: "8px 12px" }}>{detail.publish_error}</div>
              )}
              {detail.engagement && (
                <div className="tnum" style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                  {detail.engagement.likes} likes · {detail.engagement.comments} comments · {detail.engagement.shares} shares · {detail.engagement.views} views
                </div>
              )}
            </div>
          </ModalContent>
        )}
      </Modal>
    </div>
  );
}
