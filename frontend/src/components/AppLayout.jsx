import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect, useCallback, Suspense } from "react";
import { useAuth } from "../lib/auth";
import { CreditPill } from "./Credits";
import InnoiraLogo from "./InnoiraLogo";
import CommandPalette from "./CommandPalette";
import NotificationsCenter from "./NotificationsCenter";
import {
  LayoutDashboard, Send, Users, Inbox as InboxIcon, Kanban, Mail, Settings as SettingsIcon, LogOut, Info, Shield,
  FileText, BarChart3, UsersRound, ShieldCheck, Image as ImageIcon, ChevronDown, Layers, Webhook, Link2,
  Bot, PhoneCall, History, Radio, CalendarClock, CalendarCheck, CalendarRange, FileBarChart, Tags,
  Share2, PenSquare, ListChecks, LayoutGrid, Menu, X, Search, Upload, Globe, Loader2,
  MessageSquare, Building2, Briefcase, BookOpen, DollarSign, FileDown, Scale, TrendingUp,
} from "lucide-react";

const FONT_FAMILIES = {
  display: "Geist, Archivo, sans-serif", // new: Geist by default, keep Archivo as fallback, sans-serif for rest
  sans: "Inter, sans-serif",           // existing: Inter
  mono: "Roboto Mono, monospace",      // existing: Roboto Mono
  heading: "Geist, Archivo, sans-serif", // specifically for display font
  body: "Inter, sans-serif",           // specifically for body
};

const PITCH_NAV = [
  { to: "/app", label: "Overview", icon: LayoutDashboard, end: true, tid: "nav-overview" },
  { to: "/app/campaigns", label: "Campaigns", icon: Send, tid: "nav-campaigns" },
  { to: "/app/intelligence", label: "Intelligence", icon: Search, tid: "nav-intelligence" },
  { to: "/app/services", label: "Services", icon: Layers, tid: "nav-services" },
  { to: "/app/templates", label: "Templates", icon: FileText, tid: "nav-templates" },
  { to: "/app/inbox", label: "Inbox", icon: InboxIcon, tid: "nav-inbox" },
  { to: "/app/mailboxes", label: "Mailboxes", icon: Mail, tid: "nav-mailboxes" },
  { to: "/app/analytics", label: "Analytics", icon: BarChart3, tid: "nav-analytics" },
  { to: "/app/hubspot", label: "HubSpot", icon: Link2, tid: "nav-hubspot" },
  { to: "/app/team", label: "Team", icon: UsersRound, tid: "nav-team" },
  { to: "/app/audit-log", label: "Audit log", icon: ShieldCheck, tid: "nav-audit" },
];

const CRM_NAV = [
  { to: "/app/crm", label: "Overview", icon: LayoutDashboard, end: true, tid: "crm-nav-overview" },
  { to: "/app/crm/leads", label: "Leads", icon: Users, tid: "crm-nav-leads" },
  { to: "/app/crm/search", label: "Lead Search", icon: Search, tid: "crm-nav-search" },
  { to: "/app/crm/lists", label: "Lead Lists", icon: ListChecks, tid: "crm-nav-lists" },
  { to: "/app/crm/pipeline", label: "Pipeline", icon: Kanban, tid: "crm-nav-pipeline" },
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
  { to: "/app/social-eq/calendar", label: "Calendar", icon: CalendarRange, tid: "soc-nav-calendar" },
  { to: "/app/social-eq/queue", label: "Queue", icon: ListChecks, tid: "soc-nav-queue" },
  { to: "/app/social-eq/inbox", label: "Inbox", icon: InboxIcon, tid: "soc-nav-inbox" },
  { to: "/app/social-eq/analytics", label: "Analytics", icon: BarChart3, tid: "soc-nav-analytics" },
  { to: "/app/social-eq/import", label: "Bulk Import", icon: Upload, tid: "soc-nav-import" },
  { to: "/app/social-eq/settings", label: "Settings", icon: SettingsIcon, tid: "soc-nav-settings" },
];

const SITE_NAV = [
  { to: "/app/site-eq", label: "Overview", icon: LayoutDashboard, end: true, tid: "site-nav-overview" },
  { to: "/app/site-eq/sites", label: "Sites", icon: Globe, tid: "site-nav-sites" },
  { to: "/app/site-eq/inbox", label: "Inbox", icon: InboxIcon, tid: "site-nav-inbox" },
  { to: "/app/site-eq/analytics", label: "Analytics", icon: BarChart3, tid: "site-nav-analytics" },
];

const SMS_NAV = [
  { to: "/app/sms-eq", label: "Overview", icon: LayoutDashboard, end: true, tid: "sms-nav-overview" },
  { to: "/app/sms-eq/templates", label: "Templates", icon: FileText, tid: "sms-nav-templates" },
  { to: "/app/sms-eq/inbox", label: "Inbox", icon: InboxIcon, tid: "sms-nav-inbox" },
  { to: "/app/sms-eq/broadcasts", label: "Broadcasts", icon: Send, tid: "sms-nav-broadcasts" },
  { to: "/app/sms-eq/contacts", label: "Contacts", icon: Users, tid: "sms-nav-contacts" },
  { to: "/app/sms-eq/settings", label: "Settings", icon: SettingsIcon, tid: "sms-nav-settings" },
];

const WHATSAPP_NAV = [
  { to: "/app/whatsapp-eq", label: "Overview", icon: LayoutDashboard, end: true, tid: "wa-nav-overview" },
  { to: "/app/whatsapp-eq/templates", label: "Templates", icon: FileText, tid: "wa-nav-templates" },
  { to: "/app/whatsapp-eq/inbox", label: "Inbox", icon: InboxIcon, tid: "wa-nav-inbox" },
  { to: "/app/whatsapp-eq/broadcasts", label: "Broadcasts", icon: Send, tid: "wa-nav-broadcasts" },
  { to: "/app/whatsapp-eq/contacts", label: "Contacts", icon: Users, tid: "wa-nav-contacts" },
  { to: "/app/whatsapp-eq/settings", label: "Settings", icon: SettingsIcon, tid: "wa-nav-settings" },
];

const HRMS_NAV = [
  { to: "/app/hrms-eq", label: "Overview", icon: LayoutDashboard, end: true, tid: "hrms-nav-overview" },
  { to: "/app/hrms-eq/employees", label: "Employees", icon: Users, tid: "hrms-nav-employees" },
  { to: "/app/hrms-eq/org-chart", label: "Org Chart", icon: Building2, tid: "hrms-nav-orgchart" },
  { to: "/app/hrms-eq/recruitment", label: "Recruitment", icon: Briefcase, tid: "hrms-nav-recruitment" },
  { to: "/app/hrms-eq/onboarding", label: "Onboarding", icon: ListChecks, tid: "hrms-nav-onboarding" },
  { to: "/app/hrms-eq/leave", label: "Leave", icon: CalendarClock, tid: "hrms-nav-leave" },
  { to: "/app/hrms-eq/reviews", label: "Reviews", icon: FileBarChart, tid: "hrms-nav-reviews" },
];

const ACCOUNTING_NAV = [
  { to: "/app/accounting-eq", label: "Overview", icon: LayoutDashboard, end: true, tid: "acct-nav-overview" },
  { to: "/app/accounting-eq/chart-of-accounts", label: "Chart of Accounts", icon: BookOpen, tid: "acct-nav-coa" },
  { to: "/app/accounting-eq/journal-entries", label: "Journal Entries", icon: FileText, tid: "acct-nav-journal" },
  { to: "/app/accounting-eq/customers", label: "Customers", icon: Users, tid: "acct-nav-customers" },
  { to: "/app/accounting-eq/invoices", label: "Invoices", icon: DollarSign, tid: "acct-nav-invoices" },
  { to: "/app/accounting-eq/bills", label: "Bills", icon: FileDown, tid: "acct-nav-bills" },
  { to: "/app/accounting-eq/reports", label: "Reports", icon: BarChart3, tid: "acct-nav-reports" },
];

export const AGENTS = [
  // Pitch EQ must stay first: its root ("/app") is a prefix of every other
  // agent's routes too, so the matcher below deliberately skips it in the
  // startsWith check and relies on it being the fallback (AGENTS[0]) instead.
  // Putting any other agent at index 0 breaks that fallback for every Pitch
  // EQ page (wrong sidebar nav + wrong header label near the logo).
  { k: "pitch", label: "Pitch EQ", tag: "Outbound", root: "/app", nav: PITCH_NAV, tid: "agent-pitch", icon: Send,
    blurb: "Cold email — sequences, unified inbox, and EQ-scored outreach." },
  { k: "crm", label: "CRM", tag: "CRM", root: "/app/crm", nav: CRM_NAV, tid: "agent-crm", icon: Users,
    blurb: "Shared lead repository, lists, and activity timeline — every agent stores and pulls leads from here." },
  { k: "create", label: "Create EQ", tag: "Carousel", root: "/app/create-eq", nav: CREATE_NAV, tid: "agent-create", icon: Layers,
    blurb: "Drafted carousels and decks, Canva-style editing." },
  { k: "voice", label: "Voice EQ", tag: "Calling", root: "/app/voice-eq", nav: VOICE_NAV, tid: "agent-voice", icon: PhoneCall,
    blurb: "Autonomous calling agent — dials leads, qualifies, updates the CRM." },
  { k: "schedule", label: "Schedule EQ", tag: "Booking", root: "/app/schedule-eq", nav: SCHEDULE_NAV, tid: "agent-schedule", icon: CalendarRange,
    blurb: "Calendly-style booking with real availability and automated qualifying." },
  { k: "proposal", label: "Proposal EQ", tag: "Proposals", root: "/app/proposal-eq", nav: PROPOSAL_NAV, tid: "agent-proposal", icon: FileBarChart,
    blurb: "Researches leads and drafts proposals — export to PDF or PPTX." },
  { k: "social", label: "Social EQ", tag: "Social", root: "/app/social-eq", nav: SOCIAL_NAV, tid: "agent-social", icon: Share2,
    blurb: "Drafts and schedules posts — publishing always needs your approval." },
  { k: "site", label: "Site EQ", tag: "Website Chat", root: "/app/site-eq", nav: SITE_NAV, tid: "agent-site", icon: Globe,
    blurb: "A chat widget for your website — answers from your own content, hands off to a human when it can't." },
  { k: "sms", label: "SMS EQ", tag: "Texting", root: "/app/sms-eq", nav: SMS_NAV, tid: "agent-sms", icon: MessageSquare,
    blurb: "Broadcast messaging, two-way conversations, and contact management." },
  { k: "whatsapp", label: "WhatsApp EQ", tag: "WhatsApp", root: "/app/whatsapp-eq", nav: WHATSAPP_NAV, tid: "agent-whatsapp", icon: MessageSquare,
    blurb: "WhatsApp Business messaging, templates, and broadcasts." },
  { k: "hrms", label: "HRMS EQ", tag: "HR", root: "/app/hrms-eq", nav: HRMS_NAV, tid: "agent-hrms", icon: Users,
    blurb: "Employee lifecycle, recruitment, leave, and performance management." },
  { k: "accounting", label: "Accounting EQ", tag: "Finance", root: "/app/accounting-eq", nav: ACCOUNTING_NAV, tid: "agent-accounting", icon: DollarSign,
    blurb: "Double-entry ledger, invoicing, AP bills, and financial reports." },
];

export const AGENT_BADGE = { crm: "M", pitch: "P", create: "C", voice: "V", schedule: "S", proposal: "R", social: "O", site: "W", sms: "T", whatsapp: "A", hrms: "H", accounting: "F" };

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
        <Menu size={20} className="text-ink" />
      </button>

      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/20 backdrop-blur-sm z-40 animate-fade-in" onClick={closeSidebar} />
      )}

      <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-64 border-r border-line bg-white flex flex-col transform transition-transform duration-300 ease-out ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>
        <div className="p-5 border-b border-line relative">
          <button onClick={() => setOpen(!open)} data-testid="suite-switcher"
            className="w-full flex items-center gap-3 hover:bg-ash rounded-xl p-2 transition-colors">
            <div className="flex items-center justify-center">
              <InnoiraLogo size="xs" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="font-display font-semibold text-sm text-ink truncate block">{currentAgent.label}</span>
            </div>
            <ChevronDown size={14} className={`text-ink-muted transition-transform duration-200 shrink-0 ${open ? "rotate-180" : ""}`} />
          </button>
          {open && (
            <div className="absolute left-4 right-4 top-full mt-2 bg-white border border-line rounded-2xl shadow-card-lg z-30 overflow-hidden animate-scale-in origin-top">
              {AGENTS.map((a) => (
                <button key={a.k} onClick={() => { setOpen(false); nav(a.root); }} data-testid={a.tid}
                  className={`w-full text-left p-3 hover:bg-ash flex items-center gap-3 transition-colors ${a.k === currentAgent.k ? "bg-accent/5" : ""}`}>
                  <div className={`w-7 h-7 rounded-xl flex items-center justify-center text-tiny font-mono font-medium ${a.k === currentAgent.k ? "bg-accent text-white" : "bg-ash text-ink-muted"}`}>
                    {AGENT_BADGE[a.k]}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-display font-medium">{a.label}</div>
                    <div className="text-tiny text-ink-muted font-mono uppercase">{a.tag}</div>
                  </div>
                  {a.k === currentAgent.k && <span className="w-1.5 h-1.5 bg-accent rounded-full" />}
                </button>
              ))}
              <button onClick={() => { setOpen(false); nav("/suite"); }} data-testid="suite-home-link"
                className="w-full text-left p-3 hover:bg-ash flex items-center gap-3 border-t border-line text-ink-muted transition-colors">
                <div className="w-7 h-7 rounded-xl bg-ash flex items-center justify-center"><LayoutGrid size={14} /></div>
                <div className="text-sm font-display font-medium">Command center</div>
              </button>
            </div>
          )}
        </div>
        <div className="px-4 pt-3 flex items-center gap-2">
          <button onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
            data-testid="open-command-palette"
            className="flex-1 flex items-center gap-2 px-3 py-2 text-caption text-ink-muted bg-ash hover:bg-line/40 rounded-xl transition-colors">
            <Search size={14} />
            <span className="flex-1 text-left">Search…</span>
            <kbd className="text-tiny font-mono">⌘K</kbd>
          </button>
          <button onClick={() => nav("/app/unified-inbox")} title="Unified inbox — every channel, one list"
            data-testid="open-unified-inbox"
            className="p-2 text-ink-muted hover:text-ink hover:bg-ash rounded-xl transition-all">
            <InboxIcon size={16} />
          </button>
          <NotificationsCenter />
        </div>
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto scrollbar-thin">
          {currentAgent.nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              data-testid={n.tid}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 text-sm font-display font-medium rounded-xl transition-all duration-200 ${
                  isActive ? "bg-accent-soft text-accent" : "text-ink-muted hover:text-ink hover:bg-ash"
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
            <button onClick={() => nav("/settings")} title="Profile settings"
              className="w-9 h-9 bg-ash text-ink flex items-center justify-center rounded-xl font-mono text-caption font-semibold shrink-0 overflow-hidden hover:opacity-80 transition-opacity">
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                (user?.name || "U").slice(0, 2).toUpperCase()
              )}
            </button>
            <button onClick={() => nav("/settings")} className="flex-1 min-w-0 text-left">
              <div className="text-sm font-display font-medium truncate">{user?.name}</div>
              <div className="text-tiny text-ink-muted truncate">{user?.email}</div>
            </button>
            {user?.is_admin && (
              <button onClick={() => nav("/admin")} data-testid="admin-link" title="Suite Admin"
                className="p-2 text-ink-muted hover:text-ink hover:bg-ash rounded-xl transition-all">
                <Shield size={14} />
              </button>
            )}
            <button data-testid="logout-btn" onClick={logout} className="p-2 text-ink-muted hover:text-ink hover:bg-ash rounded-xl transition-all">
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <div className="min-h-screen animate-fade-in">
          <Suspense fallback={<ContentLoader />}>
            <Outlet />
          </Suspense>
        </div>
      </main>
      <CommandPalette />
    </div>
  );
}

function ContentLoader() {
  // Shown only inside the content area while a lazy-loaded page chunk
  // fetches — nav/sidebar/chrome stay put so switching agents never flashes
  // a full blank screen, just a brief in-place loading state.
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <Loader2 size={20} className="animate-spin text-ink-muted" />
    </div>
  );
}

export function PageHeader({ title, subtitle, right, badge }) {
  return (
    <div className="border-b border-line bg-white/80 backdrop-blur-sm sticky top-0 z-10">
      {/* pl-16 below lg clears the fixed hamburger button (top-4 left-4, ~44px);
          actions stack under the title on phones instead of crushing it. */}
      <div className="pl-16 pr-6 sm:pr-8 lg:pl-8 py-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-page-title font-display font-semibold truncate">{title}</h1>
            {badge && (
              <span className="badge-info">
                <Info size={12} /> {badge}
              </span>
            )}
          </div>
          {subtitle && <div className="text-caption text-ink-muted mt-1 truncate">{subtitle}</div>}
        </div>
        {right && <div className="flex items-center gap-2.5 shrink-0 flex-wrap">{right}</div>}
      </div>
    </div>
  );
}
