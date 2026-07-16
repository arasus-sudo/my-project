import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../lib/auth";
import { CreditPill } from "./Credits";
import InnoiraLogo from "./InnoiraLogo";
import {
  LayoutDashboard, Send, Users, Inbox as InboxIcon, Kanban, Mail, Settings as SettingsIcon, LogOut, Sparkles, Shield,
  FileText, BarChart3, UsersRound, ShieldCheck, Image as ImageIcon, ChevronDown, Layers, Webhook, Link2,
  Bot, PhoneCall, History, Radio, CalendarClock, CalendarCheck, CalendarRange, FileBarChart, Tags,
  Share2, PenSquare, ListChecks, LayoutGrid, Menu, X,
} from "lucide-react";

const PITCH_NAV = [
  { to: "/app", label: "Overview", icon: LayoutDashboard, end: true, tid: "nav-overview" },
  { to: "/app/campaigns", label: "Campaigns", icon: Send, tid: "nav-campaigns" },
  { to: "/app/templates", label: "Templates", icon: FileText, tid: "nav-templates" },
  { to: "/app/inbox", label: "Inbox", icon: InboxIcon, tid: "nav-inbox" },
  { to: "/app/crm", label: "Pipeline", icon: Kanban, tid: "nav-crm" },
  { to: "/app/leads", label: "Leads", icon: Users, tid: "nav-leads" },
  { to: "/app/mailboxes", label: "Mailboxes", icon: Mail, tid: "nav-mailboxes" },
  { to: "/app/analytics", label: "Analytics", icon: BarChart3, tid: "nav-analytics" },
  { to: "/app/hubspot", label: "HubSpot", icon: Link2, tid: "nav-hubspot" },
  { to: "/app/team", label: "Team", icon: UsersRound, tid: "nav-team" },
  { to: "/app/audit-log", label: "Audit log", icon: ShieldCheck, tid: "nav-audit" },
];

const CREATE_NAV = [
  { to: "/app/create-eq", label: "Projects", icon: Layers, end: true, tid: "creq-nav-projects" },
  { to: "/app/webhooks", label: "Webhooks", icon: Webhook, tid: "creq-nav-webhooks" },
];

const VOICE_NAV = [
  { to: "/app/voice-eq", label: "Overview", icon: LayoutDashboard, end: true, tid: "veq-nav-overview" },
  { to: "/app/voice-eq/agents", label: "Agents", icon: Bot, tid: "veq-nav-agents" },
  { to: "/app/voice-eq/campaigns", label: "Campaigns", icon: PhoneCall, tid: "veq-nav-campaigns" },
  { to: "/app/voice-eq/calls", label: "Call Logs", icon: History, tid: "veq-nav-calls" },
  { to: "/app/voice-eq/live", label: "Live", icon: Radio, tid: "veq-nav-live" },
  { to: "/app/voice-eq/settings", label: "Settings", icon: SettingsIcon, tid: "veq-nav-settings" },
];

const SCHEDULE_NAV = [
  { to: "/app/schedule-eq", label: "Overview", icon: LayoutDashboard, end: true, tid: "seq-nav-overview" },
  { to: "/app/schedule-eq/event-types", label: "Event Types", icon: CalendarRange, tid: "seq-nav-event-types" },
  { to: "/app/schedule-eq/bookings", label: "Bookings", icon: CalendarCheck, tid: "seq-nav-bookings" },
  { to: "/app/schedule-eq/settings", label: "Settings", icon: SettingsIcon, tid: "seq-nav-settings" },
];

const PROPOSAL_NAV = [
  { to: "/app/proposal-eq", label: "Proposals", icon: FileBarChart, end: true, tid: "prop-nav-proposals" },
  { to: "/app/proposal-eq/pricing", label: "Pricing Catalog", icon: Tags, tid: "prop-nav-pricing" },
];

const SOCIAL_NAV = [
  { to: "/app/social-eq", label: "Overview", icon: LayoutDashboard, end: true, tid: "soc-nav-overview" },
  { to: "/app/social-eq/compose", label: "Compose", icon: PenSquare, tid: "soc-nav-compose" },
  { to: "/app/social-eq/queue", label: "Queue", icon: ListChecks, tid: "soc-nav-queue" },
  { to: "/app/social-eq/settings", label: "Settings", icon: SettingsIcon, tid: "soc-nav-settings" },
];

export const AGENTS = [
  { k: "pitch", label: "Pitch EQ", tag: "Outbound", root: "/app", nav: PITCH_NAV, tid: "agent-pitch", icon: Send,
    blurb: "AI cold email — sequences, unified inbox, and EQ-scored outreach." },
  { k: "create", label: "Create EQ", tag: "Carousel", root: "/app/create-eq", nav: CREATE_NAV, tid: "agent-create", icon: Layers,
    blurb: "AI-drafted carousels and decks, Canva-style editing." },
  { k: "voice", label: "Voice EQ", tag: "Calling", root: "/app/voice-eq", nav: VOICE_NAV, tid: "agent-voice", icon: PhoneCall,
    blurb: "Autonomous AI calling agent — dials leads, qualifies, updates the CRM." },
  { k: "schedule", label: "Schedule EQ", tag: "Booking", root: "/app/schedule-eq", nav: SCHEDULE_NAV, tid: "agent-schedule", icon: CalendarRange,
    blurb: "Calendly-style booking with real availability and AI qualifying." },
  { k: "proposal", label: "Proposal EQ", tag: "Proposals", root: "/app/proposal-eq", nav: PROPOSAL_NAV, tid: "agent-proposal", icon: FileBarChart,
    blurb: "Researches leads and drafts proposals — export to PDF or PPTX." },
  { k: "social", label: "Social EQ", tag: "Social", root: "/app/social-eq", nav: SOCIAL_NAV, tid: "agent-social", icon: Share2,
    blurb: "Drafts and schedules posts — publishing always needs your approval." },
];

export const AGENT_BADGE = { pitch: "P", create: "C", voice: "V", schedule: "S", proposal: "R", social: "O" };

export default function AppLayout() {
  const { user, workspace, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const currentAgent =
    AGENTS.find((a) => a.root !== "/app" && loc.pathname.startsWith(a.root)) || AGENTS[0];
  const [open, setOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  useEffect(() => { closeSidebar(); }, [loc.pathname, closeSidebar]);

  return (
    <div className="min-h-screen flex bg-bone">
      <button onClick={() => setSidebarOpen(true)} data-testid="sidebar-open"
        className="lg:hidden fixed top-4 left-4 z-50 p-2.5 bg-white/80 backdrop-blur-xl border border-line rounded-xl shadow-card hover:shadow-card-hover transition-all">
        <Menu size={18} className="text-ink" />
      </button>

      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/20 backdrop-blur-sm z-40 animate-fade-in" onClick={closeSidebar} />
      )}

      <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-64 border-r border-line bg-white flex flex-col transform transition-transform duration-300 ease-out ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>
        <div className="p-5 border-b border-line relative">
          <button onClick={() => setOpen(!open)} data-testid="suite-switcher"
            className="w-full flex items-center gap-3 hover:bg-ash rounded-xl p-2 transition-colors">
            <InnoiraLogo size="xs" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-display font-semibold text-sm text-neutral-500 truncate">/ {currentAgent.label}</span>
              </div>
              <div className="text-2xs text-neutral-400 font-mono uppercase tracking-wider truncate mt-0.5">{workspace?.name}</div>
            </div>
            <ChevronDown size={14} className={`text-neutral-400 transition-transform duration-200 shrink-0 ${open ? "rotate-180" : ""}`} />
          </button>
          {open && (
            <div className="absolute left-4 right-4 top-full mt-2 bg-white border border-line rounded-2xl shadow-card-lg z-30 overflow-hidden animate-scale-in origin-top">
              {AGENTS.map((a) => (
                <button key={a.k} onClick={() => { setOpen(false); nav(a.root); }} data-testid={a.tid}
                  className={`w-full text-left p-3 hover:bg-ash flex items-center gap-3 transition-colors ${a.k === currentAgent.k ? "bg-accent/5" : ""}`}>
                  <div className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-mono font-medium ${a.k === currentAgent.k ? "bg-accent text-white" : "bg-ash text-neutral-500"}`}>
                    {AGENT_BADGE[a.k]}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium">{a.label}</div>
                    <div className="text-2xs text-neutral-400 font-mono uppercase">{a.tag}</div>
                  </div>
                  {a.k === currentAgent.k && <span className="w-1.5 h-1.5 bg-accent rounded-full" />}
                </button>
              ))}
              <button onClick={() => { setOpen(false); nav("/suite"); }} data-testid="suite-home-link"
                className="w-full text-left p-3 hover:bg-ash flex items-center gap-3 border-t border-line text-neutral-500 transition-colors">
                <div className="w-7 h-7 rounded-xl bg-ash flex items-center justify-center"><LayoutGrid size={14} /></div>
                <div className="text-sm font-medium">Command center</div>
              </button>
            </div>
          )}
        </div>
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto scrollbar-thin">
          {currentAgent.nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              data-testid={n.tid}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 text-sm rounded-xl transition-all duration-200 ${
                  isActive ? "bg-accent text-white shadow-sm" : "text-neutral-500 hover:text-ink hover:bg-ash"
                }`
              }
            >
              <n.icon size={16} strokeWidth={1.75} />
              <span className="truncate">{n.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-line">
          <div className="px-1 pb-3">
            <CreditPill />
          </div>
          <div className="flex items-center gap-3 pt-3 border-t border-line">
            <div className="w-9 h-9 bg-ash text-ink flex items-center justify-center rounded-xl font-mono text-xs font-semibold shrink-0">
              {(user?.name || "U").slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{user?.name}</div>
              <div className="text-2xs text-neutral-400 truncate">{user?.email}</div>
            </div>
            {user?.is_admin && (
              <button onClick={() => nav("/admin")} data-testid="admin-link" title="Suite Admin"
                className="p-2 text-neutral-400 hover:text-ink hover:bg-ash rounded-xl transition-all">
                <Shield size={14} />
              </button>
            )}
            <button data-testid="logout-btn" onClick={logout} className="p-2 text-neutral-400 hover:text-ink hover:bg-ash rounded-xl transition-all">
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <div className="min-h-screen animate-fade-in">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export function PageHeader({ title, subtitle, right, badge }) {
  return (
    <div className="border-b border-line bg-white/80 backdrop-blur-sm sticky top-0 z-10">
      <div className="px-6 sm:px-8 py-6 flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-display font-semibold tracking-tight truncate">{title}</h1>
            {badge && (
              <span className="badge-info">
                <Sparkles size={10} /> {badge}
              </span>
            )}
          </div>
          {subtitle && <div className="text-sm text-neutral-400 mt-1">{subtitle}</div>}
        </div>
        {right && <div className="flex items-center gap-3 shrink-0">{right}</div>}
      </div>
    </div>
  );
}
