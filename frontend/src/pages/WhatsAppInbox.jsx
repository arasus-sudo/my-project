import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Bot, UserCheck, AlertTriangle } from "lucide-react";

const STATUS_META = {
  needs_human: { label: "Needs human", cls: "text-danger bg-danger/10", icon: AlertTriangle },
  bot_paused: { label: "Human handling", cls: "text-accent bg-accent/10", icon: UserCheck },
  bot_active: { label: "Bot active", cls: "text-success bg-success/10", icon: Bot },
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
        <div className="w-80 border-r border-line bg-white overflow-y-auto">
          {conversations.map((c) => {
            const meta = conversationStatus(c);
            const last = (c.messages || [])[c.messages?.length - 1];
            return (
              <div key={c.id} className={`p-4 border-b border-line cursor-pointer hover:bg-ash ${active?.id === c.id ? "bg-ash" : ""}`} onClick={() => setActive(c)}>
                <div className="text-body font-medium">{c.phone}</div>
                <div className="text-caption text-ink-muted truncate">{last?.body}</div>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-tiny px-1.5 py-0.5 rounded inline-flex items-center gap-1 ${meta.cls}`}>
                    <meta.icon size={10} /> {meta.label}
                  </span>
                </div>
              </div>
            );
          })}
          {conversations.length === 0 && <div className="p-4 text-body text-ink-muted">No conversations yet.</div>}
        </div>
        <div className="flex-1 flex flex-col bg-white">
          {active ? (
            <>
              <div className="border-b border-line px-4 py-2.5 flex items-center justify-between">
                <div className="text-body font-medium">{active.phone}</div>
                <div className="flex items-center gap-2">
                  {(() => { const meta = conversationStatus(active); return (
                    <span className={`text-tiny px-2 py-1 rounded-full inline-flex items-center gap-1 ${meta.cls}`}>
                      <meta.icon size={11} /> {meta.label}
                    </span>
                  ); })()}
                  {active.bot_paused && (
                    <button onClick={resumeBot} disabled={resuming} data-testid="resume-bot-btn" className="btn-ghost text-caption">
                      {resuming ? "Resuming…" : "Resume bot"}
                    </button>
                  )}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {active.messages?.map((m, i) => (
                  <div key={m.id || i} className={`flex ${m.direction === "agent" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-lg p-3 rounded-2xl text-body ${m.direction === "agent" ? "bg-accent text-white" : "bg-ash"}`}>
                      {m.body}
                      <div className="text-tiny mt-1 opacity-70">
                        {m.at?.slice(11, 16)}{m.automated ? " · bot" : ""}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {canReply ? (
                <div className="border-t border-line p-4">
                  <div className="flex gap-2">
                    <input className="inp flex-1" placeholder="Type your reply..." value={reply} onChange={(e) => setReply(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendReply()} />
                    <button onClick={sendReply} disabled={sending || !reply.trim()} className="btn-primary">Send</button>
                  </div>
                  {!active.bot_paused && (
                    <p className="text-tiny text-ink-muted mt-1.5">Replying will pause the automated agent for this conversation.</p>
                  )}
                </div>
              ) : (
                <div className="border-t border-line p-4 text-caption text-ink-muted text-center">
                  Session closed — use a template to re-open the conversation.
                </div>
              )}
            </>
          ) : <div className="flex-1 flex items-center justify-center text-body text-ink-muted">Select a conversation</div>}
        </div>
      </div>
    </div>
  );
}
