import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { SkeletonListRows } from "../components/ui/loading-states";
import { Mail } from "../icons";
import { EmptyState } from "../components/composites/EmptyState";
import StatusPill from "../components/primitives/StatusPill";
import Input from "../components/primitives/Input";
import Button from "../components/primitives/Button";

const LABELS = {
  interested: { t: "Interested", tone: "success" },
  not_interested: { t: "Not interested", tone: "neutral" },
  ooo: { t: "Out of office", tone: "warning" },
  referral: { t: "Referral", tone: "primary" },
  unsubscribe: { t: "Unsubscribe", tone: "danger" },
  other: { t: "Other", tone: "neutral" },
};

const FILTERS = [["all", "All"], ["interested", "Interested"], ["referral", "Referral"], ["ooo", "OOO"], ["not_interested", "Not interested"], ["unsubscribe", "Unsubscribe"]];

export default function Inbox() {
  const [convos, setConvos] = useState([]);
  const [active, setActive] = useState(null);
  const [filter, setFilter] = useState("all");
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data } = await api.get("/inbox");
    setConvos(data);
    if (data.length && !active) setActive(data[0]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const send = async () => {
    if (!active || !reply.trim()) return;
    try {
      await api.post(`/inbox/${active.id}/reply`, { body: reply });
      setReply("");
      const { data } = await api.get(`/inbox/${active.id}`);
      setActive(data);
      toast.success("Sent");
      load();
    } catch { toast.error("Send failed"); }
  };

  const filtered = convos.filter((c) => filter === "all" || c.classification === filter);

  return (
    <div className="h-screen flex flex-col animate-fade-in">
      <PageHeader title="Unified Inbox" subtitle="Every reply, one place." />
      <div className="flex-1 grid grid-cols-1 md:grid-cols-12 min-h-0">
        {/* Filters */}
        <aside className="hidden md:block col-span-2 overflow-y-auto" style={{ borderRight: "1px solid var(--border-default)", background: "var(--bg-surface)", padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 10 }}>Filter</div>
          <div className="space-y-0.5">
            {FILTERS.map(([k, t]) => (
              <button key={k} onClick={() => setFilter(k)} data-testid={`filter-${k}`}
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
          {loading && <div className="p-3"><SkeletonListRows rows={5} /></div>}
          {!loading && filtered.length === 0 && (
            <EmptyState icon={Mail} title="No conversations" description="Launch a campaign to receive replies." className="py-10" />
          )}
          {!loading && filtered.map((c) => {
            const isActive = active?.id === c.id;
            return (
              <button key={c.id} onClick={() => setActive(c)} data-testid={`convo-${c.id}`}
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
                  <div className="truncate" style={{ fontWeight: 500, color: "var(--text-primary)", fontSize: 13.5 }}>{c.lead?.first_name} {c.lead?.last_name}</div>
                  <StatusPill status={LABELS[c.classification]?.t || "Other"} tone={LABELS[c.classification]?.tone || "neutral"} className="shrink-0" />
                </div>
                <div className="truncate" style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 4 }}>{c.lead?.company} · {c.lead?.email}</div>
                <div className="line-clamp-2" style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 8 }}>{c.snippet}</div>
              </button>
            );
          })}
        </div>

        {/* Thread */}
        <div className="col-span-full md:col-span-4 flex flex-col overflow-y-auto">
          {active ? (
            <>
              <div style={{ padding: 16, borderBottom: "1px solid var(--border-default)", background: "var(--bg-surface)" }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>{active.lead?.first_name} {active.lead?.last_name}</div>
                <div className="tnum" style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{active.lead?.email}</div>
              </div>
              <div className="flex-1 overflow-y-auto space-y-4" style={{ padding: 16 }}>
                {active.messages?.map((m, i) => (
                  <div key={i} className={`max-w-md ${m.from === "me" ? "ml-auto" : ""}`}>
                    <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", marginBottom: 4 }}>{m.from === "me" ? "You" : active.lead?.first_name}</div>
                    <div style={{
                      padding: 12, borderRadius: "var(--radius-lg)", fontSize: 13.5,
                      background: m.from === "me" ? "var(--color-primary)" : "var(--bg-surface)",
                      color: m.from === "me" ? "#FFFFFF" : "var(--text-primary)",
                      border: m.from === "me" ? "none" : "1px solid var(--border-default)",
                    }}>
                      {m.body}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ padding: 16, borderTop: "1px solid var(--border-default)", background: "var(--bg-surface)" }}>
                <Input as="textarea" rows={3} value={reply} onChange={(e) => setReply(e.target.value)} data-testid="reply-body" placeholder={`Reply to ${active.lead?.first_name}…`} />
                <Button variant="primary" onClick={send} data-testid="send-reply" isDisabled={!reply.trim()} className="mt-2">Send reply</Button>
              </div>
            </>
          ) : (
            <div style={{ padding: 32, fontSize: 13, color: "var(--text-tertiary)" }}>Select a conversation</div>
          )}
        </div>

        {/* Lead context */}
        <aside className="hidden lg:block col-span-2 overflow-y-auto" style={{ borderLeft: "1px solid var(--border-default)", background: "var(--bg-surface)", padding: 16 }}>
          {active?.lead ? (
            <>
              <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Lead</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-ui)", marginTop: 4 }}>{active.lead.first_name} {active.lead.last_name}</div>
              <div className="tnum" style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{active.lead.title}</div>
              <div className="tnum" style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{active.lead.company}</div>
              <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 16 }}>ICP score</div>
              <div className="tnum" style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
                {typeof active.lead.icp_score === "number" ? active.lead.icp_score : "—"}
              </div>
              <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 16 }}>Classification</div>
              <div style={{ fontSize: 13, color: "var(--text-primary)", marginTop: 4 }}>{LABELS[active.classification]?.t || "Other"}</div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: "var(--text-tertiary)" }}>—</div>
          )}
        </aside>
      </div>
    </div>
  );
}
