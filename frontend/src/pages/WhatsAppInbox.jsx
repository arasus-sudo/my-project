import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Bot, User, AlertTriangle } from "../icons";
import { EmptyState } from "../components/composites/EmptyState";
import StatusPill from "../components/primitives/StatusPill";
import Input from "../components/primitives/Input";
import Button from "../components/primitives/Button";

const STATUS_META = {
  needs_human: { label: "Needs human", tone: "danger", icon: AlertTriangle },
  bot_paused: { label: "Human handling", tone: "primary", icon: User },
  bot_active: { label: "Bot active", tone: "success", icon: Bot },
};

function conversationStatus(c) {
  if (c.status === "needs_human") return STATUS_META.needs_human;
  if (c.bot_paused) return STATUS_META.bot_paused;
  return STATUS_META.bot_active;
}

export default function WhatsAppInbox() {
  const [conversations, setConversations] = useState([]);
  const [active, setActive] = useState(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [resuming, setResuming] = useState(false);

  const load = async () => {
    const { data } = await api.get("/whatsapp-eq/conversations");
    const items = data.items || [];
    setConversations(items);
    setActive((prev) => {
      if (!prev) return items[0] || null;
      return items.find((c) => c.id === prev.id) || prev;
    });
  };
  useEffect(() => { load(); }, []);

  const sendReply = async () => {
    if (!active || !reply.trim() || sending) return;
    setSending(true);
    try {
      await api.post(`/whatsapp-eq/conversations/${active.id}/reply`, { body: reply });
      toast.success("Reply sent");
      setReply(""); load();
    } catch (err) { toast.error(err?.response?.data?.detail || "Send failed"); }
    setSending(false);
  };

  const resumeBot = async () => {
    if (!active || resuming) return;
    setResuming(true);
    try {
      await api.post(`/whatsapp-eq/conversations/${active.id}/resume-bot`);
      toast.success("Bot resumed for this conversation");
      load();
    } catch { toast.error("Failed to resume bot"); }
    setResuming(false);
  };

  const canReply = active && active.session_expires_at && new Date(active.session_expires_at) > new Date();

  return (
    <div className="h-screen flex flex-col animate-fade-in">
      <PageHeader title="WhatsApp Inbox" subtitle="24-hour session-based messaging." />
      <div className="flex-1 flex min-h-0">
        <div className="overflow-y-auto" style={{ width: 320, borderRight: "1px solid var(--border-default)", background: "var(--bg-surface)" }}>
          {conversations.map((c) => {
            const meta = conversationStatus(c);
            const last = (c.messages || [])[c.messages?.length - 1];
            const isActive = active?.id === c.id;
            return (
              <button key={c.id} onClick={() => setActive(c)}
                className="w-full text-left block transition-colors"
                style={{
                  padding: 16, borderBottom: "1px solid var(--border-subtle)",
                  background: isActive ? "var(--bg-selected)" : "transparent",
                  borderLeft: isActive ? "2px solid var(--color-primary)" : "2px solid transparent",
                }}
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "var(--bg-hover)"; }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
              >
                <div style={{ fontWeight: 500, color: "var(--text-primary)", fontSize: 13.5 }}>{c.phone}</div>
                <div className="truncate" style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>{last?.body}</div>
                <div style={{ marginTop: 6 }}>
                  <StatusPill status={meta.label} tone={meta.tone} icon={meta.icon} />
                </div>
              </button>
            );
          })}
          {conversations.length === 0 && (
            <EmptyState icon={Bot} title="No conversations yet" description="WhatsApp sessions will appear here." className="py-10" />
          )}
        </div>
        <div className="flex-1 flex flex-col" style={{ background: "var(--bg-surface)" }}>
          {active ? (
            <>
              <div className="flex items-center justify-between" style={{ borderBottom: "1px solid var(--border-default)", padding: "10px 16px" }}>
                <div style={{ fontWeight: 500, color: "var(--text-primary)", fontSize: 13.5 }}>{active.phone}</div>
                <div className="flex items-center gap-2">
                  {(() => { const meta = conversationStatus(active); return <StatusPill status={meta.label} tone={meta.tone} icon={meta.icon} />; })()}
                  {active.bot_paused && (
                    <Button variant="tertiary" size="sm" onClick={resumeBot} isLoading={resuming} data-testid="resume-bot-btn">
                      {resuming ? "Resuming…" : "Resume bot"}
                    </Button>
                  )}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto space-y-3" style={{ padding: 16 }}>
                {active.messages?.map((m, i) => (
                  <div key={m.id || i} className={`flex ${m.direction === "agent" ? "justify-end" : "justify-start"}`}>
                    <div className="max-w-lg" style={{
                      padding: 12, borderRadius: "var(--radius-lg)", fontSize: 13.5,
                      background: m.direction === "agent" ? "var(--color-primary)" : "var(--bg-surface-sunken)",
                      color: m.direction === "agent" ? "#fff" : "var(--text-primary)",
                    }}>
                      {m.body}
                      <div className="tnum" style={{ fontSize: 11, marginTop: 4, opacity: 0.7 }}>
                        {m.at?.slice(11, 16)}{m.automated ? " · bot" : ""}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {canReply ? (
                <div style={{ borderTop: "1px solid var(--border-default)", padding: 16 }}>
                  <div className="flex gap-2">
                    <Input className="flex-1" placeholder="Type your reply..." value={reply} onChange={(e) => setReply(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendReply()} />
                    <Button variant="primary" onClick={sendReply} isDisabled={sending || !reply.trim()} isLoading={sending}>Send</Button>
                  </div>
                  {!active.bot_paused && (
                    <p style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 6 }}>Replying will pause the automated agent for this conversation.</p>
                  )}
                </div>
              ) : (
                <div className="text-center" style={{ borderTop: "1px solid var(--border-default)", padding: 16, fontSize: 12.5, color: "var(--text-tertiary)" }}>
                  Session closed — use a template to re-open the conversation.
                </div>
              )}
            </>
          ) : <div className="flex-1 flex items-center justify-center" style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Select a conversation</div>}
        </div>
      </div>
    </div>
  );
}
