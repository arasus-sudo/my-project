import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { SkeletonKpiGrid, SkeletonCards } from "../components/ui/loading-states";
import { Send, Eye, MessageSquare, CalendarClock, AlertTriangle, Table as TableIcon } from "../icons";
import MetricCard from "../components/composites/MetricCard";
import Card from "../components/composites/Card";
import StatusPill from "../components/primitives/StatusPill";

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
      <div className="animate-fade-in px-6 sm:px-8 py-6 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <MetricCard label="Sent" value={t.total_sent || 0} icon={Send} tone="primary" />
          <MetricCard label="Opened" value={t.total_opened || 0} icon={Eye} tone="success"
            basis={t.total_sent ? `${Math.round(t.total_opened / t.total_sent * 100)}% of sent` : undefined} />
          <MetricCard label="Replied" value={t.total_replied || 0} icon={MessageSquare} tone="success"
            basis={t.total_sent ? `${Math.round(t.total_replied / t.total_sent * 100)}% of sent` : undefined} />
          <MetricCard label="Meetings" value={t.total_meetings || 0} icon={CalendarClock} tone="warning" />
          <MetricCard label="Bounced" value={t.total_bounced || 0} icon={AlertTriangle} tone="risk"
            basis={t.total_sent ? `${Math.round(t.total_bounced / t.total_sent * 100)}% of sent` : undefined} />
          <MetricCard label="Campaigns" value={t.campaign_count || 0} icon={TableIcon} tone="primary" />
        </div>

        <div>
          <div style={{ fontSize: 11.5, fontWeight: 500, color: "var(--text-secondary)", fontFamily: "var(--font-ui)", marginBottom: 10 }}>
            Campaign funnel & attribution
          </div>
          {(data?.campaigns || []).length === 0 && (
            <div style={{ fontSize: 13, color: "var(--text-tertiary)" }}>No campaigns yet.</div>
          )}
          <div className="space-y-3">
            {(data?.campaigns || []).map((c) => (
              // §2.7: never nest equal radii — this row already sits inside a
              // Card (--radius-xl), so the per-step breakdown below is a plain
              // table on tokens rather than the Table composite, which would
              // add its own --radius-xl card chrome one level too deep.
              <Card key={c.id} padding="compact" bodyClassName="-mx-5 -mb-5">
                <div className="flex items-center justify-between gap-2" style={{ padding: "0 20px", marginBottom: 12 }}>
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="truncate" style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>{c.name}</div>
                    <StatusPill status={c.status} />
                    <span title={c.health} style={{ width: 6, height: 6, borderRadius: "var(--radius-full)", background: c.health === "good" ? "var(--color-success)" : "var(--color-warning)" }} />
                  </div>
                  <div className="tnum flex items-center gap-3 shrink-0" style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
                    <span>{c.total_leads} leads</span>
                    <span>{c.total_sent} sent</span>
                    {c.pipeline_value > 0 && <span>${c.pipeline_value.toLocaleString()} pipeline</span>}
                  </div>
                </div>
                <div className="overflow-x-auto" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                  <table className="w-full" style={{ borderCollapse: "collapse", minWidth: 600 }}>
                    <thead>
                      <tr style={{ height: 32, background: "var(--bg-surface-sunken)", borderBottom: "1px solid var(--border-default)" }}>
                        {["Step", "Subject", "Sent", "Opened", "Open%", "Replied", "Reply%", "Bounced"].map((h, i) => (
                          <th key={h} style={{ padding: "0 10px", paddingLeft: i === 0 ? 20 : 10, textAlign: i > 1 ? "right" : "left", fontSize: 11, fontWeight: 500, color: "var(--text-secondary)", fontFamily: "var(--font-ui)" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {c.by_step.map((s, i) => (
                        <tr key={s.step} className="ds-table-row" style={{ height: 36, borderBottom: i < c.by_step.length - 1 ? "1px solid var(--border-subtle)" : "none" }}>
                          <td className="tnum" style={{ padding: "0 10px", paddingLeft: 20, fontSize: 12, color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>{s.step + 1}</td>
                          <td className="truncate" style={{ padding: "0 10px", fontSize: 12, color: "var(--text-tertiary)", maxWidth: 160 }}>{s.subject}</td>
                          <td className="tnum" style={{ padding: "0 10px", textAlign: "right", fontSize: 12, color: "var(--text-primary)" }}>{s.sent}</td>
                          <td className="tnum" style={{ padding: "0 10px", textAlign: "right", fontSize: 12, color: "var(--text-primary)" }}>{s.opened}</td>
                          <td className="tnum" style={{ padding: "0 10px", textAlign: "right", fontSize: 12, color: "var(--text-primary)" }}>{s.open_rate}%</td>
                          <td className="tnum" style={{ padding: "0 10px", textAlign: "right", fontSize: 12, color: "var(--text-primary)" }}>{s.replied}</td>
                          <td className="tnum" style={{ padding: "0 10px", textAlign: "right", fontSize: 12, color: "var(--text-primary)" }}>{s.reply_rate}%</td>
                          <td className="tnum" style={{ padding: "0 10px 0 10px", paddingRight: 20, textAlign: "right", fontSize: 12, color: "var(--text-primary)" }}>{s.bounced}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {c.deal_count > 0 && (
                  <div className="tnum flex items-center gap-4" style={{
                    padding: "10px 20px", background: "var(--color-success-subtle)", borderTop: "1px solid var(--border-subtle)", fontSize: 11,
                  }}>
                    <span style={{ color: "var(--color-success-text)", fontWeight: 600 }}>{c.deal_count} deal{c.deal_count > 1 ? "s" : ""}</span>
                    <span style={{ color: "var(--text-secondary)" }}>${c.pipeline_value.toLocaleString()} pipeline</span>
                    {c.won_deals > 0 && <span style={{ color: "var(--color-success-text)" }}>{c.won_deals} won · ${c.won_value.toLocaleString()}</span>}
                  </div>
                )}
              </Card>
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 11.5, fontWeight: 500, color: "var(--text-secondary)", fontFamily: "var(--font-ui)", marginBottom: 10 }}>
            Mailbox health
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {mailboxes.map((m) => (
              <Card key={m.id} padding="compact">
                <div className="flex items-center justify-between">
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>{m.email}</div>
                  <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", padding: "2px 8px", borderRadius: "var(--radius-full)", border: "1px solid var(--border-default)", color: "var(--text-secondary)" }}>{m.provider}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                  {[
                    ["Warmup", `${m.warmup_day || "?"}/30`],
                    ["Sent", `${m.sent_today || 0}/${m.daily_cap || 50}`],
                    ["DNS", m.dns?.spf && m.dns?.dkim && m.dns?.dmarc ? "OK" : "Check"],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{k}</div>
                      <div className="tnum" style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>{v}</div>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
