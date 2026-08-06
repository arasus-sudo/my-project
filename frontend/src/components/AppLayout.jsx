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
  Bot, PhoneCall, History, Radio, Clock, CalendarClock, CalendarCheck, CalendarRange, FileBarChart, Tags,
  Share2, PenSquare, ListChecks, LayoutGrid, Menu, X, Search, Upload, Globe, Loader2, Compass,
  Building2, Briefcase, BookOpen, DollarSign, FileDown, Scale, TrendingUp,
  Smartphone, Phone, Zap, KeyRound,
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
  { to: "/app/campaigns/queue", label: "Queue", icon: Clock, tid: "nav-queue" },
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
  { to: "/app/crm/companies", label: "Companies", icon: Building2, tid: "crm-nav-companies" },
  { to: "/app/crm/search", label: "Lead Search", icon: Search, tid: "crm-nav-search" },
  { to: "/app/crm/lists", label: "Lead Lists", icon: ListChecks, tid: "crm-nav-lists" },
  { to: "/app/crm/pipeline", label: "Pipeline", icon: Kanban, tid: "crm-nav-pipeline" },
  { to: "/app/crm/custom-fields", label: "Custom Fields", icon: SettingsIcon, tid: "crm-nav-custom-fields" },
  { to: "/app/signatures", label: "Signatures", icon: PenSquare, tid: "nav-signatures" },
  { to: "/app/signature-policies", label: "Signature Policies", icon: Zap, tid: "nav-signature-policies", orgAdminOnly: true },
  { to: "/app/directory-sync", label: "Directory Sync", icon: KeyRound, tid: "nav-directory-sync", orgAdminOnly: true },
];

const DESIGN_NAV = [
  { to: "/app/design-eq", label: "Designs", icon: Compass, end: true, tid: "deq-nav-projects" },
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
    category: "sales", blurb: "Cold email — sequences, unified inbox, and EQ-scored outreach." },
  { k: "crm", label: "CRM", tag: "CRM", root: "/app/crm", nav: CRM_NAV, tid: "agent-crm", icon: Users,
    category: "sales", blurb: "Shared lead repository, lists, and activity timeline — every agent stores and pulls leads from here." },
  { k: "voice", label: "Voice EQ", tag: "Calling", root: "/app/voice-eq", nav: VOICE_NAV, tid: "agent-voice", icon: PhoneCall,
    category: "sales", blurb: "Autonomous calling agent — dials leads, qualifies, updates the CRM." },
  { k: "schedule", label: "Schedule EQ", tag: "Booking", root: "/app/schedule-eq", nav: SCHEDULE_NAV, tid: "agent-schedule", icon: CalendarRange,
    category: "sales", blurb: "Calendly-style booking with real availability and automated qualifying." },
  { k: "proposal", label: "Proposal EQ", tag: "Proposals", root: "/app/proposal-eq", nav: PROPOSAL_NAV, tid: "agent-proposal", icon: FileBarChart,
    category: "sales", blurb: "Researches leads and drafts proposals — export to PDF or PPTX." },
  { k: "sms", label: "SMS EQ", tag: "Texting", root: "/app/sms-eq", nav: SMS_NAV, tid: "agent-sms", icon: Smartphone,
    category: "sales", blurb: "Broadcast messaging, two-way conversations, and contact management." },
  { k: "whatsapp", label: "WhatsApp EQ", tag: "WhatsApp", root: "/app/whatsapp-eq", nav: WHATSAPP_NAV, tid: "agent-whatsapp", icon: Phone,
    category: "sales", blurb: "WhatsApp Business messaging, templates, and broadcasts." },
  { k: "create", label: "Create EQ", tag: "Carousel", root: "/app/create-eq", nav: CREATE_NAV, tid: "agent-create", icon: Layers,
    category: "marketing", blurb: "Drafted carousels and decks, Canva-style editing." },
  { k: "design", label: "Design EQ", tag: "Design", root: "/app/design-eq", nav: DESIGN_NAV, tid: "agent-design", icon: Compass,
    category: "marketing", blurb: "Decks, prototypes and landing pages, composed for what the surface actually does." },
  { k: "social", label: "Social EQ", tag: "Social", root: "/app/social-eq", nav: SOCIAL_NAV, tid: "agent-social", icon: Share2,
    category: "marketing", blurb: "Drafts and schedules posts — publishing always needs your approval." },
  { k: "site", label: "Site EQ", tag: "Website Chat", root: "/app/site-eq", nav: SITE_NAV, tid: "agent-site", icon: Globe,
    category: "marketing", blurb: "A chat widget for your website — answers from your own content, hands off to a human when it can't." },
  { k: "hrms", label: "HRMS EQ", tag: "HR", root: "/app/hrms-eq", nav: HRMS_NAV, tid: "agent-hrms", icon: Briefcase,
    category: "operations", blurb: "Employee lifecycle, recruitment, leave, and performance management." },
  { k: "accounting", label: "Accounting EQ", tag: "Finance", root: "/app/accounting-eq", nav: ACCOUNTING_NAV, tid: "agent-accounting", icon: DollarSign,
    category: "operations", blurb: "Double-entry ledger, invoicing, AP bills, and financial reports." },
];

// Command-center grouping (SuiteHome.jsx) — sales/revenue agents, brand &
// content agents, and back-office agents render as three labeled sections
// instead of one flat grid.
export const AGENT_CATEGORIES = [
  { key: "sales", label: "Sales" },
  { key: "marketing", label: "Marketing" },
  { key: "operations", label: "Operations" },
];

export const AGENT_BADGE = { crm: "M", pitch: "P", create: "C", design: "D", voice: "V", schedule: "S", proposal: "R", social: "O", site: "W", sms: "T", whatsapp: "WA", hrms: "H", accounting: "F" };

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

  // §8.1 sidebar item — default/hover/active states + item geometry, shared
  // by both the nav links below and the mobile-only inbox/admin/logout
  // icon buttons so every clickable row in the rail reads consistently.
  const navItemStyle = (active) => ({
    display: "flex", alignItems: "center", gap: 8, height: 38, padding: "0 10px",
    borderRadius: "var(--radius-md)", fontSize: 13.5, fontWeight: 500, fontFamily: "var(--font-ui)",
    color: active ? "var(--color-primary)" : "var(--text-secondary)",
    background: active ? "var(--bg-selected)" : "transparent",
    border: active ? "1px solid var(--color-primary-border)" : "1px solid transparent",
    transition: "background-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)",
  });

  return (
    <div className="min-h-screen flex" style={{ background: "var(--bg-canvas)" }}>
      <button onClick={() => setSidebarOpen(true)} data-testid="sidebar-open"
        className="lg:hidden fixed top-4 left-4 z-50 p-2.5 transition-all"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-sm)" }}>
        <Menu size={20} style={{ color: "var(--text-primary)" }} />
      </button>

      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-40 animate-fade-in" style={{ background: "var(--bg-overlay)" }} onClick={closeSidebar} />
      )}

      <aside
        className={`fixed lg:sticky lg:h-screen inset-y-0 left-0 z-50 flex flex-col transform transition-transform duration-300 ease-out ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
        style={{ width: 248, background: "var(--bg-surface)", borderRight: "1px solid var(--border-default)" }}
      >
        {/* Logo zone — §8.1: 56px tall, 16px bottom margin. */}
        <div className="relative" style={{ padding: "16px 12px" }}>
          <button onClick={() => setOpen(!open)} data-testid="suite-switcher"
            className="w-full flex items-center gap-3 transition-colors"
            style={{ height: 40, borderRadius: "var(--radius-md)", padding: "0 8px" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <div className="flex items-center justify-center">
              <InnoiraLogo size="xs" />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <span className="truncate block" style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>
                {currentAgent.label}
              </span>
            </div>
            <ChevronDown size={14} strokeWidth={1.5} aria-hidden="true"
              className="shrink-0" style={{ color: "var(--text-tertiary)", transition: "transform var(--dur-fast) var(--ease-out)", transform: open ? "rotate(180deg)" : "rotate(0deg)" }} />
          </button>
          {open && (
            <div className="absolute left-3 right-3 top-full mt-1 overflow-y-auto scrollbar-thin animate-scale-in origin-top"
              style={{ background: "var(--bg-surface-raised)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-lg)", zIndex: "var(--z-dropdown)", padding: 4, maxHeight: "calc(100vh - 100px)" }}
            >
              {AGENTS.map((a) => {
                const active = a.k === currentAgent.k;
                return (
                  <button key={a.k} onClick={() => { setOpen(false); nav(a.root); }} data-testid={a.tid}
                    className="w-full text-left flex items-center gap-3 transition-colors"
                    style={{ padding: 10, borderRadius: "var(--radius-md)", background: active ? "var(--bg-selected)" : "transparent" }}
                    onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "var(--bg-hover)"; }}
                    onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
                  >
                    <div className="flex items-center justify-center shrink-0"
                      style={{
                        width: 28, height: 28, borderRadius: "var(--radius-md)", fontSize: 11, fontWeight: 500, fontFamily: "var(--font-mono)",
                        background: active ? "var(--color-primary)" : "var(--bg-active)", color: active ? "#FFFFFF" : "var(--text-secondary)",
                      }}
                    >
                      {AGENT_BADGE[a.k]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="truncate" style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>{a.label}</div>
                      <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", textTransform: "uppercase" }}>{a.tag}</div>
                    </div>
                    {active && <span style={{ width: 6, height: 6, borderRadius: "var(--radius-full)", background: "var(--color-primary)" }} />}
                  </button>
                );
              })}
              <button onClick={() => { setOpen(false); nav("/suite"); }} data-testid="suite-home-link"
                className="w-full text-left flex items-center gap-3 transition-colors"
                style={{ padding: 10, borderRadius: "var(--radius-md)", borderTop: "1px solid var(--border-subtle)", marginTop: 4, paddingTop: 14, color: "var(--text-secondary)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <div className="flex items-center justify-center" style={{ width: 28, height: 28, borderRadius: "var(--radius-md)", background: "var(--bg-active)" }}>
                  <LayoutGrid size={14} strokeWidth={1.5} aria-hidden="true" />
                </div>
                <span style={{ fontSize: 13, fontWeight: 500, fontFamily: "var(--font-ui)" }}>Command center</span>
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2" style={{ padding: "0 12px 8px" }}>
          <button onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
            data-testid="open-command-palette"
            className="flex-1 flex items-center gap-2 transition-colors"
            style={{ height: 32, padding: "0 10px", borderRadius: "var(--radius-md)", background: "var(--bg-surface-sunken)", color: "var(--text-tertiary)", fontSize: 12.5, fontFamily: "var(--font-ui)" }}
          >
            <Search size={14} strokeWidth={1.5} aria-hidden="true" />
            <span className="flex-1 text-left">Search…</span>
            <kbd style={{ fontSize: 10.5, fontFamily: "var(--font-mono)", background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-xs)", padding: "1px 5px" }}>⌘K</kbd>
          </button>
          <button onClick={() => nav("/app/unified-inbox")} title="Unified inbox — every channel, one list"
            data-testid="open-unified-inbox"
            className="inline-grid place-items-center transition-colors"
            style={{ width: 32, height: 32, borderRadius: "var(--radius-md)", color: "var(--text-tertiary)" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.color = "var(--text-primary)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-tertiary)"; }}
          >
            <InboxIcon size={16} strokeWidth={1.5} aria-hidden="true" />
          </button>
          <NotificationsCenter />
        </div>

        {/* §8.1: item gap 2px, group label as overline. */}
        <nav className="flex-1 min-h-0 overflow-y-auto scrollbar-thin" style={{ padding: "4px 12px", display: "flex", flexDirection: "column", gap: 2 }}>
          {currentAgent.nav.filter((n) => !n.orgAdminOnly || user?.role === "org_admin" || user?.is_admin).map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              data-testid={n.tid}
              style={({ isActive }) => navItemStyle(isActive)}
              onMouseEnter={(e) => { if (e.currentTarget.getAttribute("aria-current") !== "page") e.currentTarget.style.background = "var(--bg-hover)"; }}
              onMouseLeave={(e) => { if (e.currentTarget.getAttribute("aria-current") !== "page") e.currentTarget.style.background = "transparent"; }}
            >
              <n.icon size={18} strokeWidth={1.5} aria-hidden="true" />
              <span className="truncate">{n.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Footer — §8.1: pinned bottom, divider, then the user block. */}
        <div style={{ padding: 12, borderTop: "1px solid var(--border-subtle)" }}>
          <div style={{ paddingBottom: 8 }}>
            <CreditPill />
          </div>
          <div className="flex items-center gap-3" style={{ paddingTop: 8, borderTop: "1px solid var(--border-subtle)" }}>
            <button onClick={() => nav("/settings")} title="Profile settings"
              className="flex items-center justify-center shrink-0 overflow-hidden transition-opacity"
              style={{ width: 32, height: 32, borderRadius: "var(--radius-full)", background: "var(--bg-active)", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600 }}
            >
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                (user?.name || "U").slice(0, 2).toUpperCase()
              )}
            </button>
            <button onClick={() => nav("/settings")} className="flex-1 min-w-0 text-left">
              <div className="truncate" style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>{user?.name}</div>
              <div className="truncate" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{user?.email}</div>
            </button>
            {user?.is_admin && (
              <button onClick={() => nav("/admin")} data-testid="admin-link" title="Suite Admin"
                className="inline-grid place-items-center transition-colors"
                style={{ width: 28, height: 28, borderRadius: "var(--radius-md)", color: "var(--text-tertiary)" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.color = "var(--text-primary)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-tertiary)"; }}
              >
                <Shield size={14} strokeWidth={1.5} aria-hidden="true" />
              </button>
            )}
            <button data-testid="logout-btn" onClick={logout}
              className="inline-grid place-items-center transition-colors"
              style={{ width: 28, height: 28, borderRadius: "var(--radius-md)", color: "var(--text-tertiary)" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.color = "var(--text-primary)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-tertiary)"; }}
            >
              <LogOut size={14} strokeWidth={1.5} aria-hidden="true" />
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

/* PageHeader — docs/design-system.md §8.2.
 * Row 1: heading-2 title + body-sm description, up to 4 right-aligned
 * controls. Sticks to the top with --bg-canvas + --border-default after
 * scroll — restyled onto tokens in place rather than as a parallel
 * composite, since every page already imports this one. */
export function PageHeader({ title, subtitle, right, badge }) {
  return (
    <div
      className="sticky top-0 z-10"
      style={{ background: "var(--bg-canvas)", borderBottom: "1px solid var(--border-default)" }}
    >
      {/* pl-16 below lg clears the fixed hamburger button (top-4 left-4, ~44px);
          actions stack under the title on phones instead of crushing it. */}
      <div className="pl-16 pr-6 sm:pr-8 lg:pl-8 py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5">
            <h1
              className="truncate"
              style={{ fontSize: 20, lineHeight: "26px", fontWeight: 600, letterSpacing: "-0.01em", color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}
            >
              {title}
            </h1>
            {badge && (
              <span
                className="inline-flex items-center gap-1"
                style={{
                  height: 20, padding: "0 8px", borderRadius: "var(--radius-sm)",
                  background: "var(--color-primary-subtle)", color: "var(--color-primary)",
                  fontSize: 11.5, fontWeight: 500, fontFamily: "var(--font-ui)",
                }}
              >
                <Info size={12} strokeWidth={1.5} aria-hidden="true" /> {badge}
              </span>
            )}
          </div>
          {subtitle && (
            <div className="truncate" style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>
              {subtitle}
            </div>
          )}
        </div>
        {right && <div className="flex items-center gap-2.5 shrink-0 flex-wrap">{right}</div>}
      </div>
    </div>
  );
}
