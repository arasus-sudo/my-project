import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { toast } from "sonner";
import {
  Send, X, ChevronLeft, ChevronRight, MessageSquare, Sparkles, Plus,
  RotateCcw, RefreshCw, CheckCircle2, AlertCircle, Clock,
} from "../icons";
import { PageHeader } from "../components/AppLayout";
import Button from "../components/primitives/Button";
import Input from "../components/primitives/Input";
import SegmentedControl from "../components/primitives/SegmentedControl";
import Card from "../components/composites/Card";
import { EmptyState } from "../components/composites/EmptyState";

/* Command EQ — the conversational orchestrator. One chat surface that plans
 * and executes across every specialist agent (CRM, Campaigns, Projects, etc.).
 */

const messageRole = (role) => role === "user" ? "You" : "Command EQ";

function MessageBubble({ message }) {
  const isUser = message.role === "user";
  const meta = message.mode ? (
    <span style={{ fontSize: 10.5, color: "var(--text-tertiary)", marginLeft: 8 }}>
      {message.mode === "question" ? "Awaiting clarification" :
       message.mode === "unconfigured" ? "LLM not configured" : "Executed"}
    </span>
  ) : null;

  const tools = message.tools_used?.length ? (
    <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
      {message.tools_used.map((t) => (
        <span key={t} style={{
          fontSize: 10.5, padding: "1px 6px", borderRadius: "var(--radius-sm)",
          background: "var(--bg-surface-sunken)", color: "var(--text-tertiary)",
          fontSize: 10.5, fontFamily: "var(--font-ui)",
        }}>{t}</span>
      ))}
    </div>
  ) : null;

  return (
    <div className={`flex gap-3 ${!isUser ? "flex-row-reverse" : ""}`}
      style={{ marginBottom: 14 }} data-testid={`cmd-msg-${message.at}`}>
      <div className="flex-1" style={{ minWidth: 0 }}>
        {!isUser && (
          <div className="flex items-center gap-1.5" style={{ marginBottom: 4 }}>
            <Sparkles size={13} strokeWidth={1.5} aria-hidden="true"
              style={{ color: "var(--color-primary)" }} />
            <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", fontFamily: "var(--font-ui)" }}>
              Command EQ
            </span>
            {meta}
          </div>
        )}
        <div style={{
          background: isUser ? "var(--color-primary)" : "var(--bg-surface)",
          color: isUser ? "#FFFFFF" : "var(--text-primary)",
          borderRadius: isUser ? "var(--radius-xl) var(--radius-xl) 0 var(--radius-xl)"
            : "var(--radius-xl) 0 var(--radius-xl) var(--radius-xl)",
          padding: "10px 14px", maxWidth: "85%", alignSelf: isUser ? "flex-end" : "flex-start",
          fontSize: 13.5, lineHeight: 1.5, fontFamily: "var(--font-ui)",
        }}>
          {message.content}
        </div>
        {tools}
      </div>
    </div>
  );
}

function StepChip({ step }) {
  const bgTone = step.status === "ok" ? "success" : step.status === "error" ? "danger" : step.status === "skipped" ? "warning" : "risk";
  const fgTone = step.status === "ok" ? "success" : step.status === "error" ? "danger" : step.status === "skipped" ? "warning-text" : "risk-text";
  const icon = step.status === "ok" ? "✓" : step.status === "error" ? "✗" : step.status === "skipped" ? "⊘" : "🚫";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      height: 22, padding: "0 8px", borderRadius: "var(--radius-sm)",
      background: `var(--color-${bgTone}-subtle)`,
      color: `var(--color-${fgTone})`,
      fontSize: 11, fontWeight: 500, fontFamily: "var(--font-ui)",
    }}>
      {step.tool} <span style={{ opacity: 0.7 }}>{icon}</span>
      {step.latency_ms ? <span style={{ opacity: 0.6, fontSize: 9.5 }}>{step.latency_ms}ms</span> : null}
    </span>
  );
}

export default function CommandEQ() {
  const [sessions, setSessions] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const loadSessions = useCallback(async () => {
    try {
      const { data } = await api.get("/command/sessions");
      setSessions(data || []);
    } catch {
      setSessions([]);
    }
  }, []);

  const loadSession = useCallback(async (sid) => {
    try {
      const { data } = await api.get(`/command/sessions/${sid}`);
      setSelectedId(sid);
      setMessages(data.messages || []);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to load session");
    }
  }, []);

  const newSession = useCallback(async () => {
    setSelectedId(null);
    setMessages([]);
    setInput("");
  }, []);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      const params = new URLSearchParams();
      if (selectedId) {
        const { data } = await api.post(`/command/chat`, { message: text, session_id: selectedId });
        setMessages((m) => [...m, { role: "user", content: text, at: new Date().toISOString() },
          { role: "assistant", content: data.answer, tools_used: data.steps?.map(s => s.tool) || [],
            mode: data.mode, at: new Date().toISOString() }]);
        setSelectedId(data.session_id);
      } else {
        const { data } = await api.post("/command/chat", { message: text });
        setMessages((m) => [...m, { role: "user", content: text, at: new Date().toISOString() },
          { role: "assistant", content: data.answer, tools_used: data.steps?.map(s => s.tool) || [],
            mode: data.mode, at: new Date().toISOString() }]);
        setSelectedId(data.session_id);
      }
      setInput("");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Send failed");
    }
    setBusy(false);
  };

  const deleteSession = async (sid) => {
    if (!window.confirm("Delete this conversation?")) return;
    try {
      await api.delete(`/command/sessions/${sid}`);
      if (selectedId === sid) { setSelectedId(null); setMessages([]); }
      loadSessions();
    } catch (err) { toast.error(err?.response?.data?.detail || "Delete failed"); }
  };

  useEffect(() => { loadSessions(); }, [loadSessions]);

  return (
    <div className="flex h-full animate-fade-in" style={{ background: "var(--bg-canvas)" }}>
      {/* Sidebar */}
      <aside
        className={`flex flex-col ${!sidebarCollapsed ? "md:block hidden" : "hidden md:block"} transition-all duration-200 overflow-y-auto scrollbar-thin`}
        style={{ width: sidebarCollapsed ? 52 : 260, borderRight: "1px solid var(--border-default)", background: "var(--bg-surface)" }}>
        <div style={{ padding: 14, borderBottom: "1px solid var(--border-default)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div className="flex items-center gap-2">
            <MessageSquare size={18} strokeWidth={1.5} aria-hidden="true" style={{ color: "var(--color-primary)" }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>Command EQ</span>
          </div>
          <Button variant="tertiary" size="xs" icon={sidebarCollapsed ? ChevronRight : ChevronLeft} onClick={() => setSidebarCollapsed(!sidebarCollapsed)} aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} />
        </div>

        <Button variant="primary" size="sm" icon={Plus} className="w-full justify-center m-3"
          onClick={newSession} data-testid="cmd-new-session">
          New conversation
        </Button>

        <div className="flex-1 overflow-y-auto scrollbar-thin" style={{ padding: "0 12px 12px" }}>
          {sessions.length === 0 ? (
            <div style={{ padding: 12, fontSize: 12, color: "var(--text-tertiary)", textAlign: "center" }}>
              No conversations yet. Start one!
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {sessions.map((s) => (
                <button key={s.id} type="button" onClick={() => loadSession(s.id)}
                  data-testid={`cmd-session-${s.id}`}
                  style={{
                    width: "100%", textAlign: "left", padding: "8px 10px",
                    borderRadius: "var(--radius-md)", border: "1px solid transparent",
                    background: s.id === selectedId ? "var(--bg-selected)" : "transparent",
                    borderColor: s.id === selectedId ? "var(--color-primary-border)" : "transparent",
                    color: s.id === selectedId ? "var(--color-primary)" : "var(--text-secondary)",
                    fontSize: 12.5, fontWeight: s.id === selectedId ? 600 : 500,
                    fontFamily: "var(--font-ui)", textAlign: "left",
                    transition: "all var(--dur-fast) var(--ease-out)",
                  }}>
                    <div className="truncate" style={{ fontWeight: 600 }}>{s.title || "Untitled"}</div>
                    <div className="truncate" style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>
                      {s.updated_at ? new Date(s.updated_at).toLocaleString() : "—"}
                    </div>
                  </button>
              ))}
            </div>
          )}

          {sessions.length > 0 && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border-default)" }}>
              <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginBottom: 6 }}>
                Quick actions
              </div>
              <div className="flex flex-col gap-1.5">
                <Button variant="tertiary" size="sm" icon={RotateCcw} className="w-full justify-start" onClick={loadSessions}>
                  <RefreshCw size={13} strokeWidth={1.5} /> Refresh sessions
                </Button>
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: 14, borderTop: "1px solid var(--border-default)" }}>
          <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 6 }}>
            Commands: type naturally. Try “Find leads in California”, “Draft email for Acme”, “Create project for Q3 launch”.
          </div>
        </div>
      </aside>

      {/* Main chat */}
      <main className="flex-1 flex flex-col min-w-0">
        <PageHeader title="Command EQ" subtitle="Describe what you want done — I’ll plan and run it across every agent." />

        <div className="flex-1 overflow-y-auto scrollbar-thin p-6 space-y-5" style={{ maxWidth: 800, margin: "0 auto", width: "100%" }}>
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center" style={{ color: "var(--text-tertiary)" }}>
              <MessageSquare size={48} strokeWidth={1.5} style={{ opacity: 0.4, marginBottom: 16 }} />
              <h3 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8 }}>
                Start a conversation
              </h3>
              <p style={{ fontSize: 13.5, color: "var(--text-tertiary)", maxWidth: 360, lineHeight: 1.6 }}>
                Tell me what you need — find leads, draft emails, launch campaigns, create projects,
                search knowledge, check analytics — I’ll coordinate the right agents.
              </p>
              <div className="flex flex-wrap gap-2 mt-6" style={{ maxWidth: 480 }}>
                <ExamplePrompt text="Find tech leads at Series B SaaS companies in California" />
                <ExamplePrompt text="Draft a follow-up email for the Acme Corp deal" />
                <ExamplePrompt text="Create a sprint project from the Sprint template" />
                <ExamplePrompt text="What were our email open rates last week?" />
              </div>
            </div>
          ) : (
            <div data-testid="cmd-messages" className="flex flex-col gap-4">
              {messages.map((m, i) => <MessageBubble key={i} message={m} />)}
            </div>
          )}

          {/* Input bar */}
          <div style={{ paddingTop: 12, borderTop: "1px solid var(--border-default)" }}>
            <div className="flex items-end gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder="Describe what you need…"
                data-testid="cmd-input"
                style={{ fontSize: 14, height: 42 }}
              />
              <Button variant="primary" size="md" icon={Send} onClick={send} isLoading={busy} isDisabled={!input.trim() || busy} />
            </div>
          </div>
          </div>
        </main>
    </div>
  );
}

function ExamplePrompt({ text, onClick }) {
  return (
    <button type="button" onClick={onClick}
      className="text-left"
      style={{
        padding: "8px 12px", borderRadius: "var(--radius-md)",
        border: "1px solid var(--border-default)", background: "var(--bg-surface)",
        fontSize: 12, color: "var(--text-secondary)", textAlign: "left",
        fontFamily: "var(--font-ui)", cursor: "pointer", transition: "all var(--dur-fast)",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--color-primary)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-default)"; }}>
    {text}
  </button>
  );
}