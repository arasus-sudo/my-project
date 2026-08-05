import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Check, Globe, MessageSquare } from "../icons";
import { EmptyState } from "../components/composites/EmptyState";
import StatusPill from "../components/primitives/StatusPill";
import Input from "../components/primitives/Input";
import Button from "../components/primitives/Button";

const STATUS_META = {
  open: { t: "Open", tone: "primary" },
  needs_human: { t: "Needs you", tone: "warning" },
  resolved: { t: "Resolved", tone: "success" },
};

const FILTERS = [["all", "All"], ["needs_human", "Needs you"], ["open", "Open"], ["resolved", "Resolved"]];

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
        <aside className="hidden md:block col-span-2 overflow-y-auto" style={{ borderRight: "1px solid var(--border-default)", background: "var(--bg-surface)", padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 10 }}>Filter</div>
          <div className="space-y-0.5">
            {FILTERS.map(([k, t]) => (
              <button key={k} onClick={() => setFilter(k)} data-testid={`site-inbox-filter-${k}`}
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

        <div className="col-span-full md:col-span-4 overflow-y-auto" style={{ borderRight: "1px solid var(--border-default)" }}>
          {filtered.length === 0 && (
            <EmptyState icon={MessageSquare} title="No conversations yet" description="Embed the widget on a site to start receiving chats." className="py-10" />
          )}
          {filtered.map((c) => {
            const isActive = active?.id === c.id;
            return (
              <button key={c.id} onClick={() => setActive(c)} data-testid={`site-convo-${c.id}`}
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
                  <div className="truncate flex items-center gap-1.5" style={{ fontWeight: 500, color: "var(--text-primary)", fontSize: 13.5 }}>
                    <Globe size={12} strokeWidth={1.5} aria-hidden="true" style={{ color: "var(--text-tertiary)" }} /> {c.site_name || "Site"}
                  </div>
                  <StatusPill status={STATUS_META[c.status]?.t || c.status} tone={STATUS_META[c.status]?.tone || "primary"} className="shrink-0" />
                </div>
                <div className="truncate" style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 4 }}>{c.visitor_id}</div>
                <div className="line-clamp-2" style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 8 }}>
                  {c.messages?.[c.messages.length - 1]?.body}
                </div>
              </button>
            );
          })}
        </div>

        <div className="col-span-full md:col-span-6 flex flex-col overflow-y-auto">
          {active ? (
            <>
              <div className="flex items-center justify-between" style={{ padding: 16, borderBottom: "1px solid var(--border-default)", background: "var(--bg-surface)" }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>{active.site_name || "Site"}</div>
                  <div className="tnum" style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{active.visitor_id}</div>
                </div>
                {active.status !== "resolved" && (
                  <Button variant="secondary" size="sm" icon={Check} onClick={() => resolve(active.id)} data-testid="resolve-site-convo-btn">Mark resolved</Button>
                )}
              </div>
              <div className="flex-1 overflow-y-auto space-y-4" style={{ padding: 16 }}>
                {active.messages?.map((m, i) => (
                  <div key={i} className={`max-w-md ${m.from === "agent" ? "ml-auto" : ""}`}>
                    <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", marginBottom: 4 }}>{m.from === "visitor" ? "Visitor" : m.from === "ai" ? "Site EQ (AI)" : "You"}</div>
                    <div style={{
                      padding: 12, borderRadius: "var(--radius-lg)", fontSize: 13.5,
                      background: m.from === "agent" ? "var(--color-primary)" : "var(--bg-surface)",
                      color: m.from === "agent" ? "#fff" : "var(--text-primary)",
                      border: m.from === "agent" ? "none" : "1px solid var(--border-default)",
                    }}>
                      {m.body}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ padding: 16, borderTop: "1px solid var(--border-default)", background: "var(--bg-surface)" }}>
                <Input as="textarea" rows={3} value={reply} onChange={(e) => setReply(e.target.value)} data-testid="site-reply-body" placeholder="Reply to the visitor…" />
                <Button variant="primary" onClick={send} data-testid="send-site-reply" isDisabled={!reply.trim()} className="mt-2">Send reply</Button>
              </div>
            </>
          ) : (
            <div style={{ padding: 32, fontSize: 13, color: "var(--text-tertiary)" }}>Select a conversation</div>
          )}
        </div>
      </div>
    </div>
  );
}
