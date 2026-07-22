import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { SkeletonKpiGrid, SkeletonCards } from "../components/ui/loading-states";

export default function Analytics() {
  const [campaigns, setCampaigns] = useState([]);
  const [mailboxes, setMailboxes] = useState([]);
  const [quota, setQuota] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([
      api.get("/analytics/campaigns").then((r) => setCampaigns(r.data)),
      api.get("/analytics/mailboxes").then((r) => setMailboxes(r.data)),
      api.get("/quota").then((r) => setQuota(r.data)),
    ]).then(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div>
        <PageHeader title="Analytics" subtitle="Step performance, mailbox health, and LLM quota." />
        <div className="animate-fade-in px-6 sm:px-8 space-y-6">
          <SkeletonKpiGrid count={3} />
          <SkeletonCards count={3} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Analytics" subtitle="Step performance, mailbox health, and LLM quota." />
      <div className="animate-fade-in px-6 sm:px-8 space-y-6">
        {quota && (
          <div className="bg-white border border-line rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
            <div>
              <div className="ui-label">LLM calls today</div>
              <div className="font-mono text-xl sm:text-2xl font-bold mt-1">{quota.used} <span className="text-ink-muted text-base">/ {quota.limit}</span></div>
            </div>
            <div className="flex-1 h-2 bg-neutral-100 rounded-full overflow-hidden">
              <div className="h-full bg-accent" style={{ width: `${Math.min(100, (quota.used / quota.limit) * 100)}%` }} />
            </div>
            <div className="ui-label">{quota.remaining} remaining</div>
          </div>
        )}

        <div>
          <div className="ui-label mb-2">Campaign step performance</div>
          {campaigns.length === 0 && <div className="text-body text-ink-muted">No campaigns yet.</div>}
          <div className="space-y-4">
            {campaigns.map((c) => (
              <div key={c.id} className="bg-white border border-line rounded-2xl overflow-hidden card-floating">
                <div className="px-5 py-3 border-b border-line flex items-center justify-between">
                  <div className="font-display font-semibold">{c.name}</div>
                  <span className="ui-label">{c.status}</span>
                </div>
                <div className="overflow-x-auto">
                <table className="w-full text-table min-w-[600px]">
                  <thead>
                    <tr className="border-b border-line">
                      {["Step", "Subject", "Sent", "Open %", "Reply %", "Clicked", "Replied"].map((h) => (
                        <th key={h} className="table-header text-left p-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {c.by_step.map((s) => (
                      <tr key={s.step} className="border-b border-line last:border-b-0">
                        <td className="p-3 font-mono">{s.step + 1}</td>
                        <td className="p-3">{s.subject}</td>
                        <td className="p-3 font-mono">{s.sent}</td>
                        <td className="p-3 font-mono">{s.open_rate}%</td>
                        <td className="p-3 font-mono">{s.reply_rate}%</td>
                        <td className="p-3 font-mono">{s.clicked}</td>
                        <td className="p-3 font-mono">{s.replied}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="ui-label mb-2">Mailbox health</div>
          <div className="grid md:grid-cols-2 gap-4">
            {mailboxes.map((m) => (
              <div key={m.id} className="bg-white border border-line rounded-2xl p-5">
                <div className="flex items-center justify-between">
                  <div className="font-display font-semibold">{m.email}</div>
                  <span className="ui-label px-2 py-1 rounded-full border">{m.provider}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-center">
                  {[
                    ["Warmup", `${m.warmup_day}/${m.warmup_target}`],
                    ["Sent/day", `${m.sent_today}/${m.daily_cap}`],
                    ["Bounce", `${m.bounce_rate}%`],
                    ["Spam", `${m.spam_rate}%`],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <div className="ui-label">{k}</div>
                      <div className="font-mono text-lg font-bold">{v}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex gap-2 flex-wrap">
                  {["spf", "dkim", "dmarc", "tracking_domain"].map((k) => (
                    <span key={k} className={`ui-label px-2 py-0.5 rounded-full border ${m.dns?.[k] ? "text-success border-success" : "text-danger border-danger"}`}>
                      {k.replace("_", " ")}
                    </span>
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
