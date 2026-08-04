import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { Link } from "react-router-dom";
import LineChart from "../components/charts/LineChart";
import { SkeletonKpiGrid } from "../components/ui/loading-states";
// §25: icons come from the closed list, never from lucide-react directly.
import { ArrowRight, Send, Eye, MessageSquare, CalendarClock, Activity } from "../icons";
import MetricCard from "../components/composites/MetricCard";
import Card from "../components/composites/Card";
import SegmentedControl from "../components/primitives/SegmentedControl";

const PERIODS = [
  { value: 7, label: "7D" },
  { value: 30, label: "30D" },
  { value: 90, label: "90D" },
];

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [days, setDays] = useState(30);
  const load = (d) => api.get(`/dashboard?days=${d}`).then((r) => setData(r.data));
  useEffect(() => { load(days); }, [days]);

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
          <div className="flex items-center gap-3">
            <SegmentedControl options={PERIODS} value={days} onChange={setDays} />
            <Link to="/app/campaigns/new" data-testid="new-campaign-cta" className="btn-primary">
              New campaign <ArrowRight size={14} />
            </Link>
          </div>
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
          <Card title="Activity over time" className="md:col-span-2">
            <LineChart
              height={256}
              data={trend.map((d) => ({ ...d, label: d.date }))}
              series={[
                { key: "sent", label: "Sent" },
                { key: "opened", label: "Opened" },
                { key: "replied", label: "Replied" },
              ]}
            />
          </Card>

          <Card title="Workspace">
            <ul>
              {[
                ["Campaigns", counts.campaigns],
                ["Active", counts.active_campaigns],
                ["Leads", counts.leads],
                ["Mailboxes", counts.mailboxes],
              ].map(([k, v]) => (
                <li key={k} className="flex justify-between items-center tnum" style={{ padding: "12px 0", borderBottom: "1px solid var(--border-subtle)" }}>
                  <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{k}</span>
                  <span style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>{v}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
