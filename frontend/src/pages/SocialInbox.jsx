import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Lightbulb, Check, X, MessageSquare } from "../icons";
import { EmptyState } from "../components/composites/EmptyState";
import StatusPill from "../components/primitives/StatusPill";
import Input from "../components/primitives/Input";
import Button from "../components/primitives/Button";

const STATUS_META = {
  new: { t: "New", tone: "warning" },
  replied: { t: "Replied", tone: "success" },
  ignored: { t: "Ignored", tone: "neutral" },
};

const PLATFORM_LABEL = { linkedin: "LinkedIn", instagram: "Instagram", youtube: "YouTube" };
const FILTERS = [["all", "All"], ["new", "New"], ["replied", "Replied"], ["ignored", "Ignored"]];

export default function SocialInbox() {
  const [comments, setComments] = useState([]);
  const [active, setActive] = useState(null);
  const [filter, setFilter] = useState("all");
  const [reply, setReply] = useState("");

  const load = async () => {
    const { data } = await api.get("/social-eq/inbox");
    setComments(data);
    if (data.length && !active) select(data[0]);
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const select = async (c) => {
    setReply(c.ai_suggested_reply || "");
    const { data } = await api.get(`/social-eq/inbox/${c.id}`);
    setActive(data);
  };

  const send = async () => {
    if (!active || !reply.trim()) return;
    try {
      await api.post(`/social-eq/inbox/${active.id}/reply`, { body: reply });
      toast.success("Reply sent");
      setReply(""); setActive(null); load();
    } catch { toast.error("Reply failed"); }
  };

  const ignore = async (id) => {
    await api.post(`/social-eq/inbox/${id}/ignore`);
    toast.success("Ignored");
    setActive(null); load();
  };

  const filtered = comments.filter((c) => filter === "all" || c.status === filter);

  return (
    <div className="h-screen flex flex-col animate-fade-in">
      <PageHeader title="Engagement Inbox" subtitle="Every comment on your published posts, one place." />
      <div className="flex-1 grid grid-cols-1 md:grid-cols-12 min-h-0">
        {/* Filters */}
        <aside className="hidden md:block col-span-2 overflow-y-auto" style={{ borderRight: "1px solid var(--border-default)", background: "var(--bg-surface)", padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 10 }}>Filter</div>
          <div className="space-y-0.5">
            {FILTERS.map(([k, t]) => (
              <button key={k} onClick={() => setFilter(k)} data-testid={`inbox-filter-${k}`}
                className="w-full text-left transition-colors"
                style={{
                  padding: "8px 10px", borderRadius: "var(--radius-md)", fontSize: 13.5,
                  background: filter === k ? "var(--bg-selected)" : "transparent",
                  color: filter === k ? "var(--color-primary)" : "var(--text-secondary)",
                }}
                onMouseEnter={(e) => { if (filter !== k) e.currentTarget.style.background = "var(--bg-hover)"; }}
                onMouseLeave={(e) => { if (filter !== k) e.currentTarget.style.background = "transparent"; }}
              >
                {t}
              </button>
            ))}
          </div>
        </aside>

        {/* List */}
        <div className="col-span-full md:col-span-4 overflow-y-auto" style={{ borderRight: "1px solid var(--border-default)" }}>
          {filtered.length === 0 && (
            <EmptyState icon={MessageSquare} title="No comments yet" description="Once a post is published on a connected, real platform, comments show up here automatically." className="py-10" />
          )}
          {filtered.map((c) => {
            const isActive = active?.id === c.id;
            return (
              <button key={c.id} onClick={() => select(c)} data-testid={`comment-${c.id}`}
                className="w-full text-left block transition-colors"
                style={{
                  padding: 16, borderBottom: "1px solid var(--border-subtle)",
                  background: isActive ? "var(--bg-selected)" : "transparent",
                  borderLeft: isActive ? "2px solid var(--color-primary)" : "2px solid transparent",
                }}
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "var(--bg-hover)"; }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="truncate" style={{ fontWeight: 500, color: "var(--text-primary)", fontSize: 13.5 }}>{c.author || "Someone"}</div>
                  <StatusPill status={STATUS_META[c.status]?.t || "New"} tone={STATUS_META[c.status]?.tone || "warning"} className="shrink-0" />
                </div>
                <div className="truncate capitalize" style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 4 }}>
                  {PLATFORM_LABEL[c.platform] || c.platform} · {c.post_headline || "post"}
                </div>
                <div className="line-clamp-2" style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 8 }}>{c.text}</div>
              </button>
            );
          })}
        </div>

        {/* Thread */}
        <div className="col-span-full md:col-span-4 flex flex-col overflow-y-auto">
          {active ? (
            <>
              <div style={{ padding: 16, borderBottom: "1px solid var(--border-default)", background: "var(--bg-surface)" }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>{active.author || "Someone"}</div>
                <div className="tnum capitalize" style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{PLATFORM_LABEL[active.platform] || active.platform}</div>
              </div>
              <div className="flex-1 overflow-y-auto space-y-4" style={{ padding: 16 }}>
                <div className="max-w-md">
                  <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", marginBottom: 4 }}>{active.author || "Someone"}</div>
                  <div style={{ padding: 12, borderRadius: "var(--radius-lg)", fontSize: 13.5, background: "var(--bg-surface)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}>{active.text}</div>
                </div>
                {active.replied_text && (
                  <div className="max-w-md ml-auto">
                    <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", marginBottom: 4 }}>You</div>
                    <div style={{ padding: 12, borderRadius: "var(--radius-lg)", fontSize: 13.5, background: "var(--color-primary)", color: "#fff" }}>{active.replied_text}</div>
                  </div>
                )}
              </div>
              {active.status !== "replied" && (
                <div className="space-y-2" style={{ padding: 16, borderTop: "1px solid var(--border-default)", background: "var(--bg-surface)" }}>
                  {active.ai_suggested_reply && reply === active.ai_suggested_reply && (
                    <div className="flex items-center gap-1.5" style={{ fontSize: 11, color: "var(--color-primary)" }}>
                      <Lightbulb size={12} strokeWidth={1.5} aria-hidden="true" /> Suggested reply — edit before sending
                    </div>
                  )}
                  <Input as="textarea" rows={3} value={reply} onChange={(e) => setReply(e.target.value)} data-testid="inbox-reply-body" placeholder={`Reply to ${active.author || "them"}…`} />
                  <div className="flex gap-2">
                    <Button variant="primary" icon={Check} onClick={send} data-testid="send-inbox-reply" isDisabled={!reply.trim()}>Send reply</Button>
                    <Button variant="secondary" icon={X} onClick={() => ignore(active.id)} data-testid="ignore-comment-btn">Ignore</Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div style={{ padding: 32, fontSize: 13, color: "var(--text-tertiary)" }}>Select a comment</div>
          )}
        </div>

        {/* Post context */}
        <aside className="hidden lg:block col-span-2 overflow-y-auto" style={{ borderLeft: "1px solid var(--border-default)", background: "var(--bg-surface)", padding: 16 }}>
          {active?.post ? (
            <>
              <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Post</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-ui)", marginTop: 4 }}>{active.post.headline}</div>
              <p className="line-clamp-4" style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 8 }}>{active.post.body}</p>
              {active.post.platform_post_url && (
                <a href={active.post.platform_post_url} target="_blank" rel="noreferrer"
                  className="inline-block" style={{ fontSize: 12, color: "var(--text-link)", marginTop: 12 }}>View live post</a>
              )}
            </>
          ) : (
            <div style={{ fontSize: 13, color: "var(--text-tertiary)" }}>—</div>
          )}
        </aside>
      </div>
    </div>
  );
}
