import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Lightbulb, Check, X as XIcon } from "lucide-react";

const STATUS_META = {
  new: { t: "New", c: "text-warning border-warning" },
  replied: { t: "Replied", c: "text-success border-success" },
  ignored: { t: "Ignored", c: "text-ink-muted border-neutral-400" },
};

const PLATFORM_LABEL = { linkedin: "LinkedIn", instagram: "Instagram", youtube: "YouTube" };

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
        <aside className="hidden md:block col-span-2 border-r border-line bg-white p-4">
          <div className="ui-label mb-3">Filter</div>
          <ul className="space-y-1 text-body">
            {[["all", "All"], ["new", "New"], ["replied", "Replied"], ["ignored", "Ignored"]].map(([k, t]) => (
              <li key={k}>
                <button onClick={() => setFilter(k)} data-testid={`inbox-filter-${k}`}
                  className={`w-full text-left px-2 py-1.5 rounded-xl ${filter === k ? "bg-accent text-white" : "hover:bg-surfacehover"}`}>
                  {t}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {/* List */}
        <div className="col-span-full md:col-span-4 border-r border-line overflow-y-auto">
          {filtered.length === 0 && (
            <div className="p-6 text-body text-ink-muted">
              No comments yet. Once a post is published on a connected, real platform, comments show up here automatically.
            </div>
          )}
          {filtered.map((c) => (
            <button key={c.id} onClick={() => select(c)} data-testid={`comment-${c.id}`}
              className={`w-full text-left p-4 border-b border-line block ${active?.id === c.id ? "bg-surfacehover border-l-2 border-l-accent" : "hover:bg-surfacehover"}`}>
              <div className="flex items-center justify-between">
                <div className="text-body font-medium truncate">{c.author || "Someone"}</div>
                <span className={`ui-label border px-1.5 py-0.5 ${STATUS_META[c.status]?.c || STATUS_META.new.c}`}>
                  {STATUS_META[c.status]?.t || "New"}
                </span>
              </div>
              <div className="text-caption text-ink-muted truncate mt-1 capitalize">
                {PLATFORM_LABEL[c.platform] || c.platform} · {c.post_headline || "post"}
              </div>
              <div className="text-body text-ink-secondary mt-2 line-clamp-2">{c.text}</div>
            </button>
          ))}
        </div>

        {/* Thread */}
        <div className="col-span-full md:col-span-4 flex flex-col overflow-y-auto">
          {active ? (
            <>
              <div className="p-4 border-b border-line bg-white">
                <div className="text-subheading font-display font-semibold">{active.author || "Someone"}</div>
                <div className="text-caption text-ink-muted font-mono capitalize">{PLATFORM_LABEL[active.platform] || active.platform}</div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div className="max-w-md">
                  <div className="ui-label mb-1">{active.author || "Someone"}</div>
                  <div className="p-3 text-body rounded-xl border bg-white border-line">{active.text}</div>
                </div>
                {active.replied_text && (
                  <div className="max-w-md ml-auto">
                    <div className="ui-label mb-1">You</div>
                    <div className="p-3 text-body rounded-xl border bg-accent text-white border-transparent">{active.replied_text}</div>
                  </div>
                )}
              </div>
              {active.status !== "replied" && (
                <div className="p-4 border-t border-line bg-white space-y-2">
                  {active.ai_suggested_reply && reply === active.ai_suggested_reply && (
                    <div className="flex items-center gap-1.5 text-tiny text-accent">
                      <Lightbulb size={11} /> Suggested reply — edit before sending
                    </div>
                  )}
                  <textarea value={reply} onChange={(e) => setReply(e.target.value)} data-testid="inbox-reply-body"
                    rows={3} placeholder={`Reply to ${active.author || "them"}…`}
                    className="w-full border border-line p-3 rounded-sm focus:outline-none focus:border-accent text-input" />
                  <div className="flex gap-2">
                    <button onClick={send} data-testid="send-inbox-reply" disabled={!reply.trim()} className="btn-primary disabled:opacity-50">
                      <Check size={14} /> Send reply
                    </button>
                    <button onClick={() => ignore(active.id)} data-testid="ignore-comment-btn" className="btn-secondary">
                      <XIcon size={14} /> Ignore
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="p-8 text-ink-muted text-body">Select a comment</div>
          )}
        </div>

        {/* Post context */}
        <aside className="hidden lg:block col-span-2 border-l border-line bg-white p-4 overflow-y-auto">
          {active?.post ? (
            <>
              <div className="ui-label">Post</div>
              <div className="text-subheading font-display font-semibold mt-1">{active.post.headline}</div>
              <p className="text-caption text-ink-muted mt-2 line-clamp-4">{active.post.body}</p>
              {active.post.platform_post_url && (
                <a href={active.post.platform_post_url} target="_blank" rel="noreferrer"
                  className="text-caption text-accent hover:underline mt-3 inline-block">View live post</a>
              )}
            </>
          ) : (
            <div className="text-ink-muted text-body">—</div>
          )}
        </aside>
      </div>
    </div>
  );
}
