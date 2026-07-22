import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowRight } from "lucide-react";
import { SkeletonKpiGrid } from "../components/ui/loading-states";

export default function Dashboard() {
  const [data, setData] = useState(null);
  const load = () => api.get("/dashboard").then((r) => setData(r.data));
  useEffect(() => { load(); }, []);

  const seed = async () => {
    try { await api.post("/demo/seed"); toast.success("Sample data added"); load(); }
    catch { toast.error("Could not seed"); }
  };

  if (!data) {
    return (
      <div className="animate-fade-in">
        <PageHeader title="Overview" subtitle="Your outbound engine at a glance." />
        <div className="p-6 sm:p-8">
          <SkeletonKpiGrid count={4} />
        </div>
      </div>
    );
  }
  const { kpis, counts, trend } = data;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Overview"
        subtitle="Your outbound engine at a glance."
        right={
          <Link to="/app/campaigns/new" data-testid="new-campaign-cta" className="btn-primary">
            New campaign <ArrowRight size={14} />
          </Link>
        }
      />
      <div className="p-6 sm:p-8 space-y-6">
        {kpis.sent === 0 && (
          <div className="card-flat shadow-card p-6 flex items-center justify-between">
            <div>
              <div className="text-card-title font-display font-semibold">Get a live demo in one click</div>
              <div className="text-caption text-ink-muted">Seed sample leads, a mailbox and a Q1 outreach campaign.</div>
            </div>
            <button data-testid="seed-demo-btn" onClick={seed} className="btn-secondary">Seed demo data</button>
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { k: "Sent", v: kpis.sent, sub: null },
            { k: "Open rate", v: `${kpis.open_rate}%`, sub: `${kpis.opened} opens` },
            { k: "Reply rate", v: `${kpis.reply_rate}%`, sub: `${kpis.replied} replies` },
            { k: "Meetings", v: kpis.meetings, sub: `${kpis.meeting_rate}% booked` },
            { k: "Clicks", v: kpis.clicked, sub: null },
          ].map((c, i) => (
            <div key={c.k} className="p-3 sm:p-6 bg-white shadow-card rounded-2xl">
              <div className="ui-label">{c.k}</div>
              <div className="font-mono text-xl sm:text-2xl font-bold mt-2 tracking-tighter truncate">{c.v}</div>
              {c.sub && <div className="text-tiny text-ink-muted mt-1 font-mono">{c.sub}</div>}
            </div>
          ))}
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-2 card-flat shadow-card p-6 sm:p-8">
            <div className="ui-label mb-4">7-day activity</div>
            <div className="h-64">
              <ResponsiveContainer>
                <LineChart data={trend}>
                  <CartesianGrid vertical={false} strokeDasharray="0" />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ border: "1px solid #E5E5E7", borderRadius: 12, fontFamily: "Roboto Mono", fontSize: 12 }} />
                  {/* Monochrome ramp — series differ by weight/dash, not hue. */}
                  <Line type="monotone" dataKey="sent" stroke="#1D1D1F" strokeWidth={2} dot={{ r: 2 }} />
                  <Line type="monotone" dataKey="opened" stroke="#8E8E93" strokeWidth={1.5} strokeDasharray="6 3" dot={{ r: 2 }} />
                  <Line type="monotone" dataKey="replied" stroke="#D2D2D7" strokeWidth={1.5} strokeDasharray="2 3" dot={{ r: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 flex flex-wrap gap-3 sm:gap-5 text-caption font-mono text-ink-muted uppercase">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-ink" /> Sent</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-neutral-500" /> Opened</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-neutral-300" /> Replied</span>
            </div>
          </div>

          <div className="card-flat shadow-card p-6 sm:p-8">
            <div className="ui-label mb-4">Workspace</div>
            <ul className="divide-y divide-line">
              {[
                ["Campaigns", counts.campaigns],
                ["Active", counts.active_campaigns],
                ["Leads", counts.leads],
                ["Mailboxes", counts.mailboxes],
              ].map(([k, v]) => (
                <li key={k} className="flex justify-between py-3">
                  <span className="text-body text-ink-tertiary">{k}</span>
                  <span className="font-mono text-lg font-bold">{v}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Funnel */}
        <div className="card-flat shadow-card p-6 sm:p-8">
          <div className="ui-label mb-4">Outbound funnel</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { k: "Sent", v: kpis.sent, w: 100 },
              { k: "Opened", v: kpis.opened, w: kpis.sent ? (kpis.opened / kpis.sent) * 100 : 0 },
              { k: "Replied", v: kpis.replied, w: kpis.sent ? (kpis.replied / kpis.sent) * 100 : 0 },
              { k: "Meetings", v: kpis.meetings, w: kpis.sent ? (kpis.meetings / kpis.sent) * 100 : 0 },
            ].map((s) => (
              <div key={s.k}>
                <div className="ui-label">{s.k}</div>
                <div className="font-mono text-lg sm:text-2xl font-bold mt-1 truncate">{s.v}</div>
                <div className="mt-2 h-2 bg-line rounded-full overflow-hidden">
                  <div className="h-full bg-accent" style={{ width: `${Math.max(2, s.w)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
