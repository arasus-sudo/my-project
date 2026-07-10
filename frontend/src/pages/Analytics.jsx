import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";

export default function Analytics() {
  const [campaigns, setCampaigns] = useState([]);
  const [mailboxes, setMailboxes] = useState([]);
  const [quota, setQuota] = useState(null);

  useEffect(() => {
    api.get("/analytics/campaigns").then((r) => setCampaigns(r.data));
    api.get("/analytics/mailboxes").then((r) => setMailboxes(r.data));
    api.get("/quota").then((r) => setQuota(r.data)).catch(() => {});
  }, []);

  return (
    <div>
      <PageHeader title="Analytics" subtitle="Step performance, mailbox health, and LLM quota." />
      <div className="p-6 space-y-6">
        {quota && (
          <div className="bg-white border border-line rounded-2xl p-5 flex items-center gap-6">
            <div>
              <div className="ui-label">LLM calls today</div>
              <div className="font-mono text-3xl font-bold mt-1">{quota.used} <span className="text-neutral-400 text-lg">/ {quota.limit}</span></div>
            </div>
            <div className="flex-1 h-2 bg-neutral-100 rounded-full overflow-hidden">
              <div className="h-full bg-ink" style={{ width: `${Math.min(100, (quota.used / quota.limit) * 100)}%` }} />
            </div>
            <div className="ui-label text-neutral-500">{quota.remaining} remaining</div>
          </div>
        )}

        <div>
          <div className="ui-label mb-2">Campaign step performance</div>
          {campaigns.length === 0 && <div className="text-sm text-neutral-500">No campaigns yet.</div>}
          <div className="space-y-4">
            {campaigns.map((c) => (
              <div key={c.id} className="bg-white border border-line rounded-2xl overflow-hidden">
                <div className="px-5 py-3 border-b border-line flex items-center justify-between">
                  <div className="font-display font-semibold">{c.name}</div>
                  <span className="ui-label">{c.status}</span>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line">
                      {["Step", "Subject", "Sent", "Open %", "Reply %", "Clicked", "Replied"].map((h) => (
                        <th key={h} className="ui-label text-left p-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {c.by_step.map((s) => (
                      <tr key={s.step} className="border-b border-line last:border-b-0">
                        <td className="p-3 font-mono">{s.step + 1}</td>
                        <td className="p-3 text-xs">{s.subject}</td>
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
                <div className="grid grid-cols-4 gap-3 mt-4 text-center">
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
                    <span key={k} className={`ui-label px-2 py-0.5 rounded-full border ${m.dns?.[k] ? "text-green-700 border-green-600" : "text-red-700 border-red-500"}`}>
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
