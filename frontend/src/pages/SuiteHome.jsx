import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { AGENTS } from "../components/AppLayout";
import { CreditPill } from "../components/Credits";
import InnoiraLogo from "../components/InnoiraLogo";
import {
  LogOut, ArrowRight, Settings as SettingsIcon, Activity as ActivityIcon,
  Mail, PhoneCall, CalendarCheck, FileBarChart, Share2, Zap, Users, TrendingUp,
  AlertCircle, Circle, Coins,
} from "lucide-react";

/** Each fetcher returns a rich per-agent status: what it's doing right now,
 * a few headline metrics, and how many items need the operator's attention. */
const AGENT_STATUS = {
  pitch: async () => {
    const [dash, inbox] = await Promise.all([api.get("/dashboard"), api.get("/inbox").catch(() => ({ data: [] }))]);
    const d = dash.data;
    const openReplies = inbox.data.filter((c) => c.status === "open").length;
    const active = d.counts.active_campaigns || 0;
    return {
      active: active > 0,
      working: active > 0 ? `${active} campaign${active > 1 ? "s" : ""} sending` : "No campaigns running",
      metrics: [
        { label: "Leads", value: d.counts.leads },
        { label: "Replies", value: d.kpis.replied },
        { label: "Meetings", value: d.kpis.meetings },
      ],
      needs: openReplies, needsLabel: "replies to review", needsHref: "/app/inbox",
    };
  },
  create: async () => {
    const { data } = await api.get("/carousel");
    const latest = data[0];
    return {
      active: false,
      working: latest ? `Last: “${latest.topic}”` : "No projects yet",
      metrics: [{ label: "Projects", value: data.length }],
      needs: 0,
    };
  },
  voice: async () => {
    const [agents, calls, live] = await Promise.all([
      api.get("/voice-eq/agents"), api.get("/voice-eq/calls"),
      api.get("/voice-eq/calls/active").catch(() => ({ data: [] })),
    ]);
    const unsynced = agents.data.filter((a) => a.status !== "synced").length;
    const liveCount = live.data.length;
    return {
      active: liveCount > 0,
      working: liveCount > 0 ? `${liveCount} call${liveCount > 1 ? "s" : ""} live now` : "No calls in progress",
      metrics: [
        { label: "Agents", value: agents.data.length },
        { label: "Calls", value: calls.data.length },
      ],
      needs: unsynced, needsLabel: "agents to sync", needsHref: "/app/voice-eq/agents",
    };
  },
  schedule: async () => {
    const [types, bookings] = await Promise.all([api.get("/schedule-eq/event-types"), api.get("/schedule-eq/bookings")]);
    const upcoming = bookings.data.filter((b) => b.status === "confirmed" && new Date(b.start_at) > new Date());
    const atRisk = upcoming.filter((b) => (b.no_show_risk_score || 0) >= 50).length;
    const next = upcoming.sort((a, b) => new Date(a.start_at) - new Date(b.start_at))[0];
    return {
      active: upcoming.length > 0,
      working: next ? `Next: ${next.guest_name}, ${new Date(next.start_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : "No upcoming meetings",
      metrics: [
        { label: "Event types", value: types.data.length },
        { label: "Upcoming", value: upcoming.length },
      ],
      needs: atRisk, needsLabel: "at-risk meetings", needsHref: "/app/schedule-eq/bookings",
    };
  },
  proposal: async () => {
    const { data } = await api.get("/proposal-eq/proposals");
    const drafts = data.filter((p) => p.status === "draft").length;
    const sent = data.filter((p) => p.status === "sent").length;
    return {
      active: drafts > 0,
      working: drafts > 0 ? `${drafts} draft${drafts > 1 ? "s" : ""} in progress` : "No drafts open",
      metrics: [
        { label: "Total", value: data.length },
        { label: "Sent", value: sent },
      ],
      needs: drafts, needsLabel: "drafts to review", needsHref: "/app/proposal-eq",
    };
  },
  social: async () => {
    const { data } = await api.get("/social-eq/posts");
    const pending = data.filter((p) => p.status === "draft" || p.status === "approved").length;
    const scheduled = data.filter((p) => p.status === "scheduled").length;
    return {
      active: scheduled > 0,
      working: scheduled > 0 ? `${scheduled} scheduled to post` : (pending > 0 ? `${pending} awaiting approval` : "No posts queued"),
      metrics: [
        { label: "Posts", value: data.length },
        { label: "Published", value: data.filter((p) => p.status === "published").length },
      ],
      needs: pending, needsLabel: "posts to approve", needsHref: "/app/social-eq/queue",
    };
  },
};

const ACTIVITY_META = {
  pitch: { icon: Mail, label: "Pitch EQ" },
  voice: { icon: PhoneCall, label: "Voice EQ" },
  scheduler: { icon: CalendarCheck, label: "Schedule EQ" },
  proposal: { icon: FileBarChart, label: "Proposal EQ" },
  social: { icon: Share2, label: "Social EQ" },
};

export default function SuiteHome() {
  const { user, workspace, logout } = useAuth();
  const nav = useNavigate();
  const [data, setData] = useState({});
  const [activities, setActivities] = useState(null);
  const [summary, setSummary] = useState(null);
  const [sub, setSub] = useState(null);

  useEffect(() => {
    AGENTS.forEach((a) => {
      const fn = AGENT_STATUS[a.k];
      if (!fn) return;
      fn().then((s) => setData((prev) => ({ ...prev, [a.k]: s }))).catch(() => setData((prev) => ({ ...prev, [a.k]: null })));
    });
    api.get("/activities", { params: { limit: 40 } }).then((r) => setActivities(r.data)).catch(() => setActivities([]));
    api.get("/activities/summary").then((r) => setSummary(r.data)).catch(() => setSummary(null));
    api.get("/billing/subscription").then((r) => setSub(r.data)).catch(() => setSub(null));
  }, []);

  const leadsStat = data.pitch?.metrics?.find((m) => m.label === "Leads")?.value;
  const activeAgents = AGENTS.filter((a) => data[a.k]?.active).length;

  // Aggregate everything that needs the operator across all agents.
  const attention = AGENTS
    .map((a) => ({ agent: a, s: data[a.k] }))
    .filter(({ s }) => s && s.needs > 0)
    .map(({ agent, s }) => ({ key: agent.k, label: s.needsLabel, count: s.needs, href: s.needsHref, agentLabel: agent.label }));

  return (
    <div className="min-h-screen bg-bone animate-fade-in">
      <div className="border-b border-line bg-white">
        <div className="max-w-6xl mx-auto px-6 sm:px-8 py-4 sm:py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <InnoiraLogo size="sm" />
            <div className="text-[10px] text-neutral-400 font-mono uppercase tracking-wider border-l border-line pl-3">{workspace?.name}</div>
          </div>
          <div className="flex items-center gap-3">
            <CreditPill />
            <Link to="/settings" data-testid="suite-settings-link" title="Settings"
              className="p-1.5 text-neutral-400 hover:text-ink hover:bg-surfacehover rounded-xl">
              <SettingsIcon size={16} />
            </Link>
            <div className="text-right leading-tight">
              <div className="text-xs font-medium">{user?.name}</div>
              <div className="text-[10px] text-neutral-400">{user?.email}</div>
            </div>
            <button onClick={logout} data-testid="suite-logout-btn" className="p-1.5 text-neutral-400 hover:text-ink hover:bg-surfacehover rounded-xl">
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 sm:px-8 py-8">
        <h1 className="font-display text-2xl font-bold">Command center</h1>
        <p className="text-sm text-neutral-400 mt-1">Every agent, what it's working on, and what needs you — live.</p>

        {/* KPI strip */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 sm:gap-6 mt-8 animate-fade-in">
          <Kpi icon={Zap} label="Agents active now" value={`${activeAgents} / ${AGENTS.length}`} />
          <Kpi icon={ActivityIcon} label="Actions today" value={summary ? summary.today : "—"} />
          <Kpi icon={TrendingUp} label="Total actions" value={summary ? summary.total : "—"} />
          <Kpi icon={Users} label="Leads in CRM" value={leadsStat ?? "—"} />
          <Kpi icon={Coins} label="Credits left" to="/billing"
            value={sub ? Math.max(0, sub.balance).toLocaleString() : "—"} />
        </div>

        {/* Needs your attention */}
        {attention.length > 0 && (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4" data-testid="needs-attention">
            <div className="flex items-center gap-2 text-amber-800 mb-2">
              <AlertCircle size={15} />
              <span className="ui-label">Needs your attention</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {attention.map((n) => (
                <Link key={n.key} to={n.href} data-testid={`attention-${n.key}`}
                  className="inline-flex items-center gap-2 bg-white border border-amber-200 rounded-full pl-1 pr-3 py-1 text-sm hover:border-amber-400">
                  <span className="bg-amber-500 text-white text-xs font-mono rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center">{n.count}</span>
                  <span className="text-amber-900">{n.label}</span>
                  <span className="text-amber-500 text-[11px] font-mono uppercase">{n.agentLabel.replace(" EQ", "")}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8">
          {/* Detailed agent grid */}
          <div className="lg:col-span-2">
            <div className="ui-label text-neutral-400 mb-3">Agents</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {AGENTS.map((a) => {
                const Icon = a.icon;
                const s = data[a.k];
                return (
                  <button key={a.k} onClick={() => nav(a.root)} data-testid={`suite-card-${a.k}`}
                    className="text-left card-flat p-6 hover:border-ink transition-all shadow-card hover:shadow-card-hover group">
                    <div className="flex items-start justify-between">
                      <div className="w-10 h-10 rounded-full bg-ink/10 flex items-center justify-center">
                        <Icon size={18} />
                      </div>
                      {s === undefined ? null : (
                        <span className={`inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wide px-2 py-0.5 rounded-full border ${s?.active ? "text-emerald-700 border-emerald-300 bg-emerald-50" : "text-neutral-400 border-line"}`}>
                          <Circle size={7} className={s?.active ? "fill-emerald-500 text-emerald-500" : "fill-neutral-400 text-neutral-400"} />
                          {s?.active ? "Active" : "Idle"}
                        </span>
                      )}
                    </div>
                    <div className="font-display font-bold text-lg mt-3">{a.label}</div>
                    <p className="text-xs text-neutral-400 mt-0.5 min-h-[16px]">
                      {s === undefined ? "Loading…" : s === null ? "—" : s.working}
                    </p>
                    <div className="flex items-center gap-5 mt-4 pt-4 border-t border-line">
                      {s?.metrics?.map((m) => (
                        <div key={m.label}>
                          <div className="font-display text-lg font-bold">{m.value}</div>
                          <div className="text-[10px] text-neutral-400 font-mono uppercase">{m.label}</div>
                        </div>
                      ))}
                      {s?.needs > 0 && (
                        <div className="ml-auto text-[11px] text-amber-700 font-medium flex items-center gap-1">
                          <AlertCircle size={12} /> {s.needs} {s.needsLabel}
                        </div>
                      )}
                      {(!s || !s.needs) && <span className="ml-auto text-neutral-300 group-hover:text-ink transition-colors"><ArrowRight size={16} /></span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Live activity feed */}
          <aside className="animate-fade-in">
            <div className="ui-label text-neutral-400 mb-3">Live activity</div>
            <div className="card-flat shadow-card p-0 overflow-hidden">
              {activities === null ? (
                <div className="p-6 text-sm text-neutral-400">Loading…</div>
              ) : activities.length === 0 ? (
                <div className="p-6 text-sm text-neutral-400">
                  No activity yet. As agents send emails, place calls, book meetings, or publish posts, it shows up here.
                </div>
              ) : (
                <div className="max-h-[620px] overflow-y-auto divide-y divide-line">
                  {activities.map((a) => {
                    const meta = ACTIVITY_META[a.agent] || { icon: ActivityIcon, label: a.agent };
                    const Icon = meta.icon;
                    return (
                      <div key={a.id} data-testid={`activity-${a.id}`} className="p-3 flex gap-3">
                        <div className="w-7 h-7 rounded-full bg-ink/10 flex items-center justify-center shrink-0">
                          <Icon size={13} />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[10px] text-neutral-400 font-mono uppercase tracking-wide">
                            {meta.label} · {formatDistanceToNow(new Date(a.at), { addSuffix: true })}
                          </div>
                          <div className="text-sm leading-snug mt-0.5">{a.summary}</div>
                          {a.lead && (
                            <Link to={`/app/leads/${a.lead.id}`} className="text-xs text-neutral-400 hover:text-sanguine">
                              {a.lead.first_name} {a.lead.last_name || ""}{a.lead.company ? ` · ${a.lead.company}` : ""}
                            </Link>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, to }) {
  const Wrap = to ? Link : "div";
  return (
    <Wrap {...(to ? { to } : {})} className={`card-flat shadow-card rounded-2xl p-4 sm:p-5 block ${to ? "hover:shadow-card-hover transition-all" : ""}`}>
      <div className="flex items-center gap-2 text-neutral-400">
        <Icon size={14} />
        <span className="ui-label">{label}</span>
      </div>
      <div className="font-display text-2xl font-bold mt-1">{value}</div>
    </Wrap>
  );
}
