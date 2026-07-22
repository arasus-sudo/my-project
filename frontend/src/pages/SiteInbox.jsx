import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Check, Globe } from "lucide-react";

const STATUS_META = {
  open: { t: "Open", c: "text-info border-info" },
  needs_human: { t: "Needs you", c: "text-warning border-warning" },
  resolved: { t: "Resolved", c: "text-success border-success" },
};

export default function SiteInbox() {
  const [convos, setConvos] = useState([]);
  const [active, setActive] = useState(null);
  const [filter, setFilter] = useState("all");
  const [reply, setReply] = useState("");

  const load = async () => {
    const { data } = await api.get("/site-eq/conversations");
    setConvos(data);
    if (data.length && !active) setActive(data[0]);
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async () => {
    if (!active || !reply.trim()) return;
    try {
      await api.post(`/site-eq/conversations/${active.id}/reply`, { body: reply });
      toast.success("Sent");
      setReply(""); setActive(null); load();
    } catch { toast.error("Send failed"); }
  };

  const resolve = async (id) => {
    await api.post(`/site-eq/conversations/${id}/resolve`);
    setActive(null); load();
  };

  const filtered = convos.filter((c) => filter === "all" || c.status === filter);

  return (
    <div className="h-screen flex flex-col animate-fade-in">
      <PageHeader title="Site Inbox" subtitle="Every visitor chat, handed off when the AI can't answer." />
      <div className="flex-1 grid grid-cols-1 md:grid-cols-12 min-h-0">
        <aside className="hidden md:block col-span-2 border-r border-line bg-white p-4">
          <div className="ui-label mb-3">Filter</div>
          <ul className="space-y-1 text-body">
            {[["all", "All"], ["needs_human", "Needs you"], ["open", "Open"], ["resolved", "Resolved"]].map(([k, t]) => (
              <li key={k}>
                <button onClick={() => setFilter(k)} data-testid={`site-inbox-filter-${k}`}
                  className={`w-full text-left px-2 py-1.5 rounded-xl ${filter === k ? "bg-accent text-white" : "hover:bg-surfacehover"}`}>
                  {t}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <div className="col-span-full md:col-span-4 border-r border-line overflow-y-auto">
          {filtered.length === 0 && <div className="p-6 text-body text-ink-muted">No conversations yet. Embed the widget on a site to start receiving chats.</div>}
          {filtered.map((c) => (
            <button key={c.id} onClick={() => setActive(c)} data-testid={`site-convo-${c.id}`}
              className={`w-full text-left p-4 border-b border-line block ${active?.id === c.id ? "bg-surfacehover border-l-2 border-l-accent" : "hover:bg-surfacehover"}`}>
              <div className="flex items-center justify-between">
                <div className="text-body font-medium truncate flex items-center gap-1.5"><Globe size={12} className="text-ink-muted" /> {c.site_name || "Site"}</div>
                <span className={`ui-label border px-1.5 py-0.5 ${STATUS_META[c.status]?.c || STATUS_META.open.c}`}>
                  {STATUS_META[c.status]?.t || c.status}
                </span>
              </div>
              <div className="text-caption text-ink-muted truncate mt-1">{c.visitor_id}</div>
              <div className="text-body text-ink-secondary mt-2 line-clamp-2">
                {c.messages?.[c.messages.length - 1]?.body}
              </div>
            </button>
          ))}
        </div>

        <div className="col-span-full md:col-span-6 flex flex-col overflow-y-auto">
          {active ? (
            <>
              <div className="p-4 border-b border-line bg-white flex items-center justify-between">
                <div>
                  <div className="text-subheading font-display font-semibold">{active.site_name || "Site"}</div>
                  <div className="text-caption text-ink-muted font-mono">{active.visitor_id}</div>
                </div>
                {active.status !== "resolved" && (
                  <button onClick={() => resolve(active.id)} data-testid="resolve-site-convo-btn" className="btn-secondary text-xs">
                    <Check size={12} /> Mark resolved
                  </button>
                )}
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {active.messages?.map((m, i) => (
                  <div key={i} className={`max-w-md ${m.from === "agent" ? "ml-auto" : ""}`}>
                    <div className="ui-label mb-1">{m.from === "visitor" ? "Visitor" : m.from === "ai" ? "Site EQ (AI)" : "You"}</div>
                    <div className={`p-3 text-body rounded-xl border ${m.from === "agent" ? "bg-accent text-white border-transparent" : "bg-white border-line"}`}>
                      {m.body}
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-4 border-t border-line bg-white">
                <textarea value={reply} onChange={(e) => setReply(e.target.value)} data-testid="site-reply-body"
                  rows={3} placeholder="Reply to the visitor…"
                  className="w-full border border-line p-3 rounded-sm focus:outline-none focus:border-accent text-input" />
                <button onClick={send} data-testid="send-site-reply" disabled={!reply.trim()} className="btn-primary mt-2 disabled:opacity-50">Send reply</button>
              </div>
            </>
          ) : (
            <div className="p-8 text-ink-muted text-body">Select a conversation</div>
          )}
        </div>
      </div>
    </div>
  );
}
