import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { MessageSquare } from "../icons";
import { EmptyState } from "../components/composites/EmptyState";
import Input from "../components/primitives/Input";
import Button from "../components/primitives/Button";

export default function SmsInbox() {
  const [conversations, setConversations] = useState([]);
  const [active, setActive] = useState(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  const load = async () => {
    const { data } = await api.get("/sms-eq/conversations");
    const items = data.items || [];
    setConversations(items);
    if (items.length && !active) setActive(items[0]);
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const sendReply = async () => {
    if (!active || !reply.trim() || sending) return;
    setSending(true);
    try {
      await api.post(`/sms-eq/conversations/${active.contact_id}/reply`, { body: reply });
      toast.success("Reply sent");
      setReply(""); load();
    } catch { toast.error("Send failed"); }
    setSending(false);
  };

  return (
    <div className="h-screen flex flex-col animate-fade-in">
      <PageHeader title="SMS Inbox" subtitle="Two-way SMS conversations." />
      <div className="flex-1 flex min-h-0">
        <div className="overflow-y-auto" style={{ width: 320, borderRight: "1px solid var(--border-default)", background: "var(--bg-surface)" }}>
          {conversations.map((c) => {
            const isActive = active?.contact_id === c.contact_id;
            return (
              <button key={c.contact_id} onClick={() => setActive(c)}
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
                  <div className="truncate" style={{ fontWeight: 500, color: "var(--text-primary)", fontSize: 13.5 }}>{c.contact_name || c.phone}</div>
                  {c.unread > 0 && (
                    <span className="shrink-0" style={{
                      background: "var(--color-primary)", color: "#fff", fontSize: 11, fontWeight: 600,
                      padding: "1px 6px", borderRadius: "var(--radius-full)",
                    }}>{c.unread}</span>
                  )}
                </div>
                <div className="truncate" style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 4 }}>{c.last_message}</div>
              </button>
            );
          })}
          {conversations.length === 0 && (
            <EmptyState icon={MessageSquare} title="No conversations yet" description="Two-way SMS replies will appear here." className="py-10" />
          )}
        </div>
        <div className="flex-1 flex flex-col" style={{ background: "var(--bg-surface)" }}>
          {active ? (
            <>
              <div className="flex-1 overflow-y-auto space-y-3" style={{ padding: 16 }}>
                {active.messages?.map((m, i) => (
                  <div key={i} className={`flex ${m.direction === "outbound" ? "justify-end" : "justify-start"}`}>
                    <div className="max-w-lg" style={{
                      padding: 12, borderRadius: "var(--radius-lg)", fontSize: 13.5,
                      background: m.direction === "outbound" ? "var(--color-primary)" : "var(--bg-surface-sunken)",
                      color: m.direction === "outbound" ? "#fff" : "var(--text-primary)",
                    }}>
                      {m.body}
                      <div className="tnum" style={{ fontSize: 11, marginTop: 4, opacity: 0.7 }}>{m.created_at?.slice(11, 16)}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2" style={{ borderTop: "1px solid var(--border-default)", padding: 16 }}>
                <Input className="flex-1" placeholder="Type your reply..." value={reply} onChange={(e) => setReply(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendReply()} />
                <Button variant="primary" onClick={sendReply} isDisabled={sending || !reply.trim()} isLoading={sending}>Send</Button>
              </div>
            </>
          ) : <div className="flex-1 flex items-center justify-center" style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Select a conversation</div>}
        </div>
      </div>
    </div>
  );
}
