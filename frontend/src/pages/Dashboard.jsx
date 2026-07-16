import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowRight } from "lucide-react";

export default function Dashboard() {
  const [data, setData] = useState(null);
  const load = () => api.get("/dashboard").then((r) => setData(r.data));
  useEffect(() => { load(); }, []);

  const seed = async () => {
    try { await api.post("/demo/seed"); toast.success("Sample data added"); load(); }
    catch { toast.error("Could not seed"); }
  };

  if (!data)     return <div className="p-6 sm:p-8 text-neutral-400 animate-fade-in">Loading…</div>;
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
              <div className="font-display font-bold">Get a live demo in one click</div>
              <div className="text-sm text-neutral-400">Seed sample leads, a mailbox and a Q1 outreach campaign.</div>
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
              <div className="font-mono text-2xl sm:text-4xl font-bold mt-2 tracking-tighter">{c.v}</div>
              {c.sub && <div className="text-xs text-neutral-400 mt-1 font-mono">{c.sub}</div>}
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
                  <Tooltip contentStyle={{ border: "1px solid #E5E6E1", borderRadius: 2, fontFamily: "JetBrains Mono", fontSize: 12 }} />
                  <Line type="monotone" dataKey="sent" stroke="#0F1010" strokeWidth={1.5} dot={{ r: 2 }} />
                  <Line type="monotone" dataKey="opened" stroke="#D94526" strokeWidth={1.5} dot={{ r: 2 }} />
                  <Line type="monotone" dataKey="replied" stroke="#118D57" strokeWidth={1.5} dot={{ r: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 flex flex-wrap gap-3 sm:gap-5 text-xs font-mono text-neutral-400 uppercase">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-ink" /> Sent</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-sanguine" /> Opened</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-green-700" /> Replied</span>
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
                  <span className="text-sm text-neutral-500">{k}</span>
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
                <div className="font-mono text-xl sm:text-3xl font-bold mt-1">{s.v}</div>
                <div className="mt-2 h-2 bg-line">
                  <div className="h-full bg-sanguine" style={{ width: `${Math.max(2, s.w)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
