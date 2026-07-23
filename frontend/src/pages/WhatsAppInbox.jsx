import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";

export default function WhatsAppInbox() {
  const [conversations, setConversations] = useState([]);
  const [active, setActive] = useState(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  const load = async () => {
    const { data } = await api.get("/whatsapp-eq/conversations");
    setConversations(data);
    if (data.length && !active) setActive(data[0]);
  };
  useEffect(() => { load(); }, []);

  const sendReply = async () => {
    if (!active || !reply.trim() || sending) return;
    setSending(true);
    try {
      await api.post(`/whatsapp-eq/conversations/${active.contact_id}/reply`, { body: reply });
      toast.success("Reply sent");
      setReply(""); load();
    } catch { toast.error("Send failed"); }
    setSending(false);
  };

  const canReply = active && active.session_status === "open";

  return (
    <div className="h-screen flex flex-col animate-fade-in">
      <PageHeader title="WhatsApp Inbox" subtitle="24-hour session-based messaging." />
      <div className="flex-1 flex min-h-0">
        <div className="w-80 border-r border-line bg-white overflow-y-auto">
          {conversations.map((c) => (
            <div key={c.contact_id} className={`p-4 border-b border-line cursor-pointer hover:bg-ash ${active?.contact_id === c.contact_id ? "bg-ash" : ""}`} onClick={() => setActive(c)}>
              <div className="text-body font-medium">{c.contact_name || c.phone}</div>
              <div className="text-caption text-ink-muted truncate">{c.last_message}</div>
              <div className="flex items-center gap-2 mt-1">
                {c.unread > 0 && <span className="bg-accent text-white text-tiny px-1.5 py-0.5 rounded-full">{c.unread}</span>}
                <span className={`text-tiny px-1 py-0.5 rounded ${c.session_status === "open" ? "text-success bg-success/10" : "text-ink-muted bg-ash"}`}>{c.session_status}</span>
              </div>
            </div>
          ))}
          {conversations.length === 0 && <div className="p-4 text-body text-ink-muted">No conversations yet.</div>}
        </div>
        <div className="flex-1 flex flex-col bg-white">
          {active ? (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {active.messages?.map((m, i) => (
                  <div key={i} className={`flex ${m.direction === "outbound" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-lg p-3 rounded-2xl text-body ${m.direction === "outbound" ? "bg-accent text-white" : "bg-ash"}`}>
                      {m.body}
                      <div className="text-tiny mt-1 opacity-70">{m.created_at?.slice(11, 16)}</div>
                    </div>
                  </div>
                ))}
              </div>
              {canReply ? (
                <div className="border-t border-line p-4 flex gap-2">
                  <input className="inp flex-1" placeholder="Type your reply..." value={reply} onChange={(e) => setReply(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendReply()} />
                  <button onClick={sendReply} disabled={sending || !reply.trim()} className="btn-primary">Send</button>
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
