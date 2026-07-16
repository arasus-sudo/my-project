import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";

const LABELS = {
  interested: { t: "Interested", c: "text-green-700 border-green-700" },
  not_interested: { t: "Not interested", c: "text-neutral-400 border-neutral-400" },
  ooo: { t: "Out of office", c: "text-amber-700 border-amber-500" },
  referral: { t: "Referral", c: "text-blue-700 border-blue-700" },
  unsubscribe: { t: "Unsubscribe", c: "text-red-700 border-red-700" },
  other: { t: "Other", c: "text-neutral-400 border-line" },
};

export default function Inbox() {
  const [convos, setConvos] = useState([]);
  const [active, setActive] = useState(null);
  const [filter, setFilter] = useState("all");
  const [reply, setReply] = useState("");

  const load = async () => {
    const { data } = await api.get("/inbox");
    setConvos(data);
    if (data.length && !active) setActive(data[0]);
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
                  className={`w-full text-left px-2 py-1.5 rounded-xl ${filter === k ? "bg-ink text-bone" : "hover:bg-surfacehover"}`}>
                  {t}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {/* List */}
        <div className="col-span-full md:col-span-4 border-r border-line overflow-y-auto">
          {filtered.length === 0 && <div className="p-6 text-sm text-neutral-400">No conversations. Launch a campaign to receive replies.</div>}
          {filtered.map((c) => (
            <button key={c.id} onClick={() => setActive(c)} data-testid={`convo-${c.id}`}
              className={`w-full text-left p-4 border-b border-line block ${active?.id === c.id ? "bg-surfacehover border-l-2 border-l-sanguine" : "hover:bg-surfacehover"}`}>
              <div className="flex items-center justify-between">
                <div className="font-medium truncate">{c.lead?.first_name} {c.lead?.last_name}</div>
                <span className={`ui-label border px-1.5 py-0.5 text-[9px] ${LABELS[c.classification]?.c || LABELS.other.c}`}>
                  {LABELS[c.classification]?.t || "Other"}
                </span>
              </div>
              <div className="text-xs text-neutral-400 truncate mt-1">{c.lead?.company} · {c.lead?.email}</div>
              <div className="text-xs text-neutral-700 mt-2 line-clamp-2">{c.snippet}</div>
            </button>
          ))}
        </div>

        {/* Thread */}
        <div className="col-span-full md:col-span-4 flex flex-col overflow-y-auto">
          {active ? (
            <>
              <div className="p-4 border-b border-line bg-white">
                <div className="font-display font-semibold">{active.lead?.first_name} {active.lead?.last_name}</div>
                <div className="text-xs text-neutral-400 font-mono">{active.lead?.email}</div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {active.messages?.map((m, i) => (
                  <div key={i} className={`max-w-md ${m.from === "me" ? "ml-auto" : ""}`}>
                    <div className="ui-label mb-1">{m.from === "me" ? "You" : active.lead?.first_name}</div>
                    <div className={`p-3 text-sm rounded-xl border ${m.from === "me" ? "bg-ink text-bone border-ink" : "bg-white border-line"}`}>
                      {m.body}
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-4 border-t border-line bg-white">
                <textarea value={reply} onChange={(e) => setReply(e.target.value)} data-testid="reply-body"
                  rows={3} placeholder={`Reply to ${active.lead?.first_name}…`}
                  className="w-full border border-line p-3 rounded-sm focus:outline-none focus:border-ink text-sm" />
                <button onClick={send} data-testid="send-reply" disabled={!reply.trim()} className="btn-primary mt-2 disabled:opacity-50">Send reply</button>
              </div>
            </>
          ) : (
            <div className="p-8 text-neutral-400 text-sm">Select a conversation</div>
          )}
        </div>

        {/* Lead context */}
        <aside className="hidden lg:block col-span-2 border-l border-line bg-white p-4 overflow-y-auto">
          {active?.lead ? (
            <>
              <div className="ui-label">Lead</div>
              <div className="font-display font-semibold mt-1">{active.lead.first_name} {active.lead.last_name}</div>
              <div className="text-xs text-neutral-400 font-mono">{active.lead.title}</div>
              <div className="text-xs text-neutral-400 font-mono">{active.lead.company}</div>
              <div className="mt-4 ui-label">ICP score</div>
              <div className="font-mono text-2xl font-bold text-sanguine">{active.lead.icp_score}</div>
              <div className="mt-4 ui-label">Classification</div>
              <div className="text-sm mt-1">{LABELS[active.classification]?.t || "Other"}</div>
            </>
          ) : (
            <div className="text-neutral-400 text-sm">—</div>
          )}
        </aside>
      </div>
    </div>
  );
}
