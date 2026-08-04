import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Link } from "react-router-dom";
import { SkeletonKpiGrid } from "../components/ui/loading-states";
// §25: icons come from the closed list, never from lucide-react directly.
import { ArrowRight, Send, Eye, MessageSquare, CalendarClock, Activity } from "../icons";
import MetricCard from "../components/composites/MetricCard";

export default function Dashboard() {
  const [data, setData] = useState(null);
  const load = () => api.get("/dashboard").then((r) => setData(r.data));
  useEffect(() => { load(); }, []);

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
  const { kpis, counts, trend, deltas, delta_units: units = {}, period } = data;
  // §4.2: a delta is meaningless without the window it is measured against,
  // and the headline figures are now that window rather than all-time — so the
  // page has to say so out loud.
  const window_ = period?.label || "vs previous period";
  const periodDays = period?.days || 30;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Overview"
        subtitle={`Your outbound engine over the last ${periodDays} days.`}
        right={
          <Link to="/app/campaigns/new" data-testid="new-campaign-cta" className="btn-primary">
            New campaign <ArrowRight size={14} />
          </Link>
        }
      />
      <div className="p-6 sm:p-8 space-y-6">
        {/* KPI strip — docs/design-system.md §15 step 2, built from §4.2
            metric blocks. Every card now carries the label + icon + basis line
            §1.4 requires; a bare number was an unfinished component.

            No `delta` is passed because the analytics endpoint does not return
            period-over-period figures yet. §4.2 wants one on every metric, but
            §24.16 forbids inventing numbers, so the delta row is simply absent
            until the API supplies a real comparison — see the note in
            docs/design-system.md's implementation section.

            §2.11: 4 columns at ≥1280, 2 at 768-1279, 1 below. */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
          <MetricCard
            label="Sent" value={kpis.sent} icon={Send} tone="primary"
            delta={deltas?.sent} deltaSuffix={units.sent} comparison={window_}
            basis={`across ${counts?.campaigns ?? 0} campaigns`}
          />
          <MetricCard
            label="Open rate" value={`${kpis.open_rate}%`} icon={Eye} tone="success"
            delta={deltas?.open_rate} deltaSuffix={units.open_rate} comparison={window_}
            basis={`${kpis.opened} opens`}
          />
          <MetricCard
            label="Reply rate" value={`${kpis.reply_rate}%`} icon={MessageSquare} tone="success"
            delta={deltas?.reply_rate} deltaSuffix={units.reply_rate} comparison={window_}
            basis={`${kpis.replied} replies`}
          />
          <MetricCard
            label="Meetings" value={kpis.meetings} icon={CalendarClock} tone="warning"
            delta={deltas?.meetings} deltaSuffix={units.meetings} comparison={window_}
            basis={`${kpis.meeting_rate}% booked`}
          />
          <MetricCard
            label="Clicks" value={kpis.clicked} icon={Activity} tone="primary"
            delta={deltas?.clicked} deltaSuffix={units.clicked} comparison={window_}
            basis={`${kpis.sent ? Math.round((kpis.clicked / kpis.sent) * 100) : 0}% of sent`}
          />
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
                  <Tooltip contentStyle={{ border: "1px solid #E2E2E5", borderRadius: 12, fontFamily: "Roboto Mono", fontSize: 12 }} />
                  {/* Monochrome ramp — series differ by weight/dash, not hue. */}
                  <Line type="monotone" dataKey="sent" stroke="#0A0A0B" strokeWidth={2} dot={{ r: 2 }} />
                  <Line type="monotone" dataKey="opened" stroke="#6E6E73" strokeWidth={1.5} strokeDasharray="6 3" dot={{ r: 2 }} />
                  <Line type="monotone" dataKey="replied" stroke="#B4B4B9" strokeWidth={1.5} strokeDasharray="2 3" dot={{ r: 2 }} />
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
                  <span className="text-subheading font-display font-bold">{v}</span>
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
                <div className="text-section font-display font-bold mt-1 truncate">{s.v}</div>
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
