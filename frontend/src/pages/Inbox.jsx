import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { SkeletonListRows } from "../components/ui/loading-states";

const LABELS = {
  interested: { t: "Interested", c: "text-success border-success" },
  not_interested: { t: "Not interested", c: "text-ink-muted border-neutral-400" },
  ooo: { t: "Out of office", c: "text-warning border-warning" },
  referral: { t: "Referral", c: "text-info border-info" },
  unsubscribe: { t: "Unsubscribe", c: "text-danger border-danger" },
  other: { t: "Other", c: "text-ink-muted border-line" },
};

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
        <aside className="hidden md:block col-span-2 border-r border-line bg-white p-4">
          <div className="ui-label mb-3">Filter</div>
          <ul className="space-y-1 text-sm">
            {[["all", "All"], ["interested", "Interested"], ["referral", "Referral"], ["ooo", "OOO"], ["not_interested", "Not interested"], ["unsubscribe", "Unsubscribe"]].map(([k, t]) => (
              <li key={k}>
                <button onClick={() => setFilter(k)} data-testid={`filter-${k}`}
                  className={`w-full text-left px-2 py-1.5 rounded-xl transition-colors duration-150 ${filter === k ? "bg-ink text-bone" : "hover:bg-surfacehover"}`}>
                  {t}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {/* List */}
        <div className="col-span-full md:col-span-4 border-r border-line overflow-y-auto">
          {loading && <div className="p-3"><SkeletonListRows rows={5} /></div>}
          {!loading && filtered.length === 0 && <div className="p-6 text-body text-ink-muted">No conversations. Launch a campaign to receive replies.</div>}
          {!loading && filtered.map((c) => (
            <button key={c.id} onClick={() => setActive(c)} data-testid={`convo-${c.id}`}
              className={`w-full text-left p-4 border-b border-line block transition-colors duration-150 ${active?.id === c.id ? "bg-surfacehover border-l-2 border-l-ink" : "hover:bg-surfacehover"}`}>
              <div className="flex items-center justify-between">
                <div className="font-medium truncate">{c.lead?.first_name} {c.lead?.last_name}</div>
                <span className={`ui-label border px-1.5 py-0.5 ${LABELS[c.classification]?.c || LABELS.other.c}`}>
                  {LABELS[c.classification]?.t || "Other"}
                </span>
              </div>
              <div className="text-caption text-ink-muted truncate mt-1">{c.lead?.company} · {c.lead?.email}</div>
              <div className="text-caption text-ink-tertiary mt-2 line-clamp-2">{c.snippet}</div>
            </button>
          ))}
        </div>

        {/* Thread */}
        <div className="col-span-full md:col-span-4 flex flex-col overflow-y-auto">
          {active ? (
            <>
              <div className="p-4 border-b border-line bg-white">
                <div className="text-card-title font-display font-semibold">{active.lead?.first_name} {active.lead?.last_name}</div>
                <div className="text-tiny text-ink-muted font-mono">{active.lead?.email}</div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {active.messages?.map((m, i) => (
                  <div key={i} className={`max-w-md ${m.from === "me" ? "ml-auto" : ""}`}>
                    <div className="ui-label mb-1">{m.from === "me" ? "You" : active.lead?.first_name}</div>
                    <div className={`p-3 text-body rounded-xl border ${m.from === "me" ? "bg-ink text-bone border-ink" : "bg-white border-line"}`}>
                      {m.body}
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-4 border-t border-line bg-white">
                <textarea value={reply} onChange={(e) => setReply(e.target.value)} data-testid="reply-body"
                  rows={3} placeholder={`Reply to ${active.lead?.first_name}…`}
                  className="w-full border border-line p-3 rounded-sm focus:outline-none focus:border-ink text-input" />
                <button onClick={send} data-testid="send-reply" disabled={!reply.trim()} className="btn-primary mt-2 disabled:opacity-50">Send reply</button>
              </div>
            </>
          ) : (
            <div className="p-8 text-body text-ink-muted">Select a conversation</div>
          )}
        </div>

        {/* Lead context */}
        <aside className="hidden lg:block col-span-2 border-l border-line bg-white p-4 overflow-y-auto">
          {active?.lead ? (
            <>
              <div className="ui-label">Lead</div>
              <div className="text-subheading font-display font-semibold mt-1">{active.lead.first_name} {active.lead.last_name}</div>
              <div className="text-tiny text-ink-muted font-mono">{active.lead.title}</div>
              <div className="text-tiny text-ink-muted font-mono">{active.lead.company}</div>
              <div className="mt-4 ui-label">ICP score</div>
              <div className="font-mono text-2xl font-bold text-ink">
                {typeof active.lead.icp_score === "number" ? active.lead.icp_score : "—"}
              </div>
              <div className="mt-4 ui-label">Classification</div>
              <div className="text-body mt-1">{LABELS[active.classification]?.t || "Other"}</div>
            </>
          ) : (
            <div className="text-body text-ink-muted">—</div>
          )}
        </aside>
      </div>
    </div>
  );
}
