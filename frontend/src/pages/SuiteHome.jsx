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
    <div className="min-h-screen bg-bone animate-fade-in relative">
      <div className="border-b border-line bg-white/80 backdrop-blur-xl sticky top-0 z-20 relative">
        <div className="max-w-6xl mx-auto px-6 sm:px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <InnoiraLogo size="xs" />
            <div className="text-tiny text-ink-muted font-mono uppercase tracking-wider border-l border-line pl-2.5">{workspace?.name}</div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <CreditPill />
            <Link to="/settings" data-testid="suite-settings-link" title="Settings"
              className="p-1.5 text-ink-muted hover:text-ink hover:bg-surfacehover rounded-lg transition-colors">
              <SettingsIcon size={14} />
            </Link>
            <div className="hidden sm:block text-right leading-tight pl-1">
              <div className="text-caption font-medium">{user?.name}</div>
              <div className="text-tiny text-ink-muted">{user?.email}</div>
            </div>
            <button onClick={logout} data-testid="suite-logout-btn" className="p-1.5 text-ink-muted hover:text-danger hover:bg-danger/10 rounded-lg transition-colors">
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 sm:px-8 py-6 sm:py-8 relative">
        <div className="ui-label text-accent mb-1.5">Live overview</div>
        <h1 className="text-page-title font-display">
          Command center
        </h1>
        <p className="text-caption text-ink-muted mt-1.5 max-w-lg">Every agent, what it's working on, and what needs you — live.</p>

        {/* KPI strip */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5 sm:gap-3 mt-5 animate-fade-in">
          <Kpi icon={Zap} label="Agents active now" value={`${activeAgents} / ${AGENTS.length}`} highlight />
          <Kpi icon={ActivityIcon} label="Actions today" value={summary ? summary.today : "—"} />
          <Kpi icon={TrendingUp} label="Total actions" value={summary ? summary.total : "—"} />
          <Kpi icon={Users} label="Leads in CRM" value={leadsStat ?? "—"} />
          <Kpi icon={Coins} label="Credits left" to="/billing"
            value={sub ? Math.max(0, sub.balance).toLocaleString() : "—"} />
        </div>

        {/* Needs your attention */}
        {attention.length > 0 && (
          <div className="mt-4 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3" data-testid="needs-attention">
            <div className="flex items-center gap-1.5 text-warning mb-1.5">
              <AlertCircle size={14} />
              <span className="ui-label">Needs your attention</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {attention.map((n) => (
                <Link key={n.key} to={n.href} data-testid={`attention-${n.key}`}
                  className="inline-flex items-center gap-1.5 bg-white border border-warning/30 rounded-full pl-1 pr-2.5 py-0.5 text-caption hover:border-warning">
                  <span className="bg-warning text-white text-tiny font-mono rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">{n.count}</span>
                  <span className="text-warning">{n.label}</span>
                  <span className="text-warning text-tiny font-mono uppercase">{n.agentLabel.replace(" EQ", "")}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5 mt-6">
          {/* Detailed agent grid */}
          <div className="lg:col-span-2">
            <div className="ui-label mb-2">Agents</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {AGENTS.map((a) => {
                const Icon = a.icon;
                const s = data[a.k];
                return (
                  <button key={a.k} onClick={() => nav(a.root)} data-testid={`suite-card-${a.k}`}
                    className="relative text-left bg-white border border-line rounded-xl p-4 shadow-card hover:shadow-card-lg hover:border-accent/30 transition-all duration-200 group overflow-hidden">
                    <div className="relative flex items-start justify-between">
                      <div className="w-8 h-8 rounded-xl bg-accent flex items-center justify-center text-white shadow-sm">
                        <Icon size={16} />
                      </div>
                      {s === undefined ? null : (
                        <span className={`inline-flex items-center gap-1 text-tiny font-mono uppercase tracking-wide px-1.5 py-0.5 rounded-full border ${s?.active ? "text-success border-success/30 bg-success/10" : "text-ink-muted border-line"}`}>
                          <Circle size={6} className={s?.active ? "fill-success text-success" : "fill-ink-muted text-ink-muted"} />
                          {s?.active ? "Active" : "Idle"}
                        </span>
                      )}
                    </div>
                    <div className="relative font-display font-semibold text-subheading mt-2.5">{a.label}</div>
                    <p className="relative text-tiny text-ink-muted mt-0.5 min-h-[14px] truncate">
                      {s === undefined ? "Loading…" : s === null ? "—" : s.working}
                    </p>
                    <div className="relative flex items-center gap-4 mt-3 pt-3 border-t border-line">
                      {s?.metrics?.map((m) => (
                        <div key={m.label}>
                          <div className="font-display text-sm font-bold">{m.value}</div>
                          <div className="text-tiny text-ink-muted font-mono uppercase">{m.label}</div>
                        </div>
                      ))}
                      {s?.needs > 0 && (
                        <div className="ml-auto text-tiny text-warning font-medium flex items-center gap-1">
                          <AlertCircle size={12} /> {s.needs} {s.needsLabel}
                        </div>
                      )}
                      {(!s || !s.needs) && <span className="ml-auto text-ink-disabled group-hover:text-accent transition-colors"><ArrowRight size={14} /></span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Live activity feed */}
          <aside className="animate-fade-in">
            <div className="ui-label mb-2 flex items-center gap-2">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-accent" />
              </span>
              Live activity
            </div>
            <div className="bg-white border border-line rounded-xl shadow-card p-0 overflow-hidden">
              {activities === null ? (
                <div className="p-5 text-caption text-ink-muted">Loading…</div>
              ) : activities.length === 0 ? (
                <div className="p-5 text-caption text-ink-muted">
                  No activity yet. As agents send emails, place calls, book meetings, or publish posts, it shows up here.
                </div>
              ) : (
                <div className="max-h-[560px] overflow-y-auto divide-y divide-line">
                  {activities.map((a) => {
                    const meta = ACTIVITY_META[a.agent] || { icon: ActivityIcon, label: a.agent };
                    const Icon = meta.icon;
                    return (
                      <div key={a.id} data-testid={`activity-${a.id}`} className="p-2.5 flex gap-2.5 hover:bg-ash/60 transition-colors">
                        <div className="w-6 h-6 rounded-lg bg-accent flex items-center justify-center text-white shrink-0 shadow-sm">
                          <Icon size={12} />
                        </div>
                        <div className="min-w-0">
                          <div className="text-tiny text-ink-muted font-mono uppercase tracking-wide">
                            {meta.label} · {formatDistanceToNow(new Date(a.at), { addSuffix: true })}
                          </div>
                          <div className="text-caption leading-snug mt-0.5">{a.summary}</div>
                          {a.lead && (
                            <Link to={`/app/crm/leads/${a.lead.id}`} className="text-tiny text-ink-muted hover:text-accent">
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

function Kpi({ icon: Icon, label, value, to, highlight }) {
  const Wrap = to ? Link : "div";
  return (
    <Wrap {...(to ? { to } : {})}
      className={`relative rounded-xl p-3 sm:p-3.5 block overflow-hidden transition-all duration-200 ${
        highlight ? "bg-accent text-white shadow-card-lg" : "bg-white border border-line shadow-card"
      } ${to ? "hover:shadow-card-lg" : ""}`}>
      <div className={`flex items-center gap-1.5 ${highlight ? "text-white/80" : "text-ink-muted"}`}>
        <Icon size={12} />
        <span className={`ui-label truncate ${highlight ? "text-white/80" : ""}`}>{label}</span>
      </div>
      <div className="font-display text-lg sm:text-xl font-bold mt-1 tabular-nums truncate">{value}</div>
    </Wrap>
  );
}
