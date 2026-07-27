import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { SkeletonKpiGrid, SkeletonCards } from "../components/ui/loading-states";

export default function Analytics() {
  const [data, setData] = useState(null);
  const [mailboxes, setMailboxes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([
      api.get("/analytics/dashboard").then((r) => setData(r.data)),
      api.get("/analytics/mailboxes").then((r) => setMailboxes(r.data)),
    ]).then(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div>
        <PageHeader title="Analytics" subtitle="Campaign funnel, pipeline attribution, and mailbox health." />
        <div className="animate-fade-in px-6 sm:px-8 space-y-6"><SkeletonKpiGrid count={3} /><SkeletonCards count={3} /></div>
      </div>
    );
  }

  const t = data?.totals || {};

  return (
    <div>
      <PageHeader title="Analytics" subtitle="Campaign funnel, pipeline attribution, and mailbox health." />
      <div className="animate-fade-in px-6 sm:px-8 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            ["Sent", t.total_sent || 0, ""],
            ["Opened", t.total_opened || 0, t.total_sent ? `(${Math.round(t.total_opened / t.total_sent * 100)}%)` : ""],
            ["Replied", t.total_replied || 0, t.total_sent ? `(${Math.round(t.total_replied / t.total_sent * 100)}%)` : ""],
            ["Meetings", t.total_meetings || 0, ""],
            ["Bounced", t.total_bounced || 0, t.total_sent ? `(${Math.round(t.total_bounced / t.total_sent * 100)}%)` : ""],
            ["Campaigns", t.campaign_count || 0, ""],
          ].map(([label, value, pct]) => (
            <div key={label} className="bg-white border border-line rounded-2xl p-4 text-center">
              <div className="text-body font-bold text-2xl">{value}</div>
              <div className="text-tiny text-ink-muted">{label} <span className="font-mono">{pct}</span></div>
            </div>
          ))}
        </div>

        <div>
          <div className="ui-label mb-2">Campaign funnel & attribution</div>
          {(data?.campaigns || []).length === 0 && <div className="text-body text-ink-muted">No campaigns yet.</div>}
          <div className="space-y-3">
            {(data?.campaigns || []).map((c) => (
              <div key={c.id} className="bg-white border border-line rounded-2xl overflow-hidden card-floating">
                <div className="px-4 py-3 border-b border-line flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="font-display font-semibold text-sm truncate">{c.name}</div>
                    <span className={`text-tiny font-mono px-1.5 py-0.5 rounded-full ${c.status === "active" ? "bg-success/10 text-success" : c.status === "paused" ? "bg-warning/10 text-warning" : "bg-neutral-100 text-ink-muted"}`}>{c.status}</span>
                    <span className={`inline-block w-1.5 h-1.5 rounded-full ${c.health === "good" ? "bg-success" : "bg-warning"}`} title={c.health} />
                  </div>
                  <div className="flex items-center gap-3 text-tiny font-mono text-ink-muted shrink-0">
                    <span>{c.total_leads} leads</span>
                    <span>{c.total_sent} sent</span>
                    <span>{c.pipeline_value > 0 ? `$${c.pipeline_value.toLocaleString()} pipeline` : ""}</span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-table min-w-[600px]">
                    <thead>
                      <tr className="border-b border-line">
                        {["Step", "Subject", "Sent", "Opened", "Open%", "Replied", "Reply%", "Bounced"].map((h) => (
                          <th key={h} className="table-header text-left p-2 text-tiny">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {c.by_step.map((s) => (
                        <tr key={s.step} className="border-b border-line last:border-b-0 hover:bg-surfacehover">
                          <td className="p-2 text-tiny font-mono">{s.step + 1}</td>
                          <td className="p-2 text-tiny text-ink-muted max-w-[160px] truncate">{s.subject}</td>
                          <td className="p-2 text-tiny font-mono">{s.sent}</td>
                          <td className="p-2 text-tiny font-mono">{s.opened}</td>
                          <td className="p-2 text-tiny font-mono">{s.open_rate}%</td>
                          <td className="p-2 text-tiny font-mono">{s.replied}</td>
                          <td className="p-2 text-tiny font-mono">{s.reply_rate}%</td>
                          <td className="p-2 text-tiny font-mono">{s.bounced}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {c.deal_count > 0 && (
                  <div className="px-4 py-2 bg-success/5 border-t border-line flex items-center gap-4 text-tiny font-mono">
                    <span className="text-success font-medium">{c.deal_count} deal{c.deal_count > 1 ? "s" : ""}</span>
                    <span>${c.pipeline_value.toLocaleString()} pipeline</span>
                    {c.won_deals > 0 && <span className="text-success">{c.won_deals} won · ${c.won_value.toLocaleString()}</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="ui-label mb-2">Mailbox health</div>
          <div className="grid md:grid-cols-2 gap-4">
            {mailboxes.map((m) => (
              <div key={m.id} className="bg-white border border-line rounded-2xl p-4">
                <div className="flex items-center justify-between">
                  <div className="font-display font-semibold text-sm">{m.email}</div>
                  <span className="text-tiny font-mono px-1.5 py-0.5 rounded-full border">{m.provider}</span>
                </div>
                <div className="grid grid-cols-4 gap-2 mt-3 text-center">
                  {[
                    ["Warmup", `${m.warmup_day || "?"}/30`],
                    ["Sent", `${m.sent_today || 0}/${m.daily_cap || 50}`],
                    ["DNS", m.dns?.spf && m.dns?.dkim && m.dns?.dmarc ? "OK" : "Check"],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <div className="text-tiny text-ink-muted">{k}</div>
                      <div className="text-caption font-bold font-mono">{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
