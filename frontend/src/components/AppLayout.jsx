import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../lib/auth";
import {
  LayoutDashboard, Send, Users, Inbox as InboxIcon, Kanban, Mail, Settings as SettingsIcon, LogOut, Sparkles, Shield,
  FileText, BarChart3, UsersRound, ShieldCheck, Image as ImageIcon, ChevronDown, Layers, Webhook, Link2,
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
  { to: "/app/settings", label: "Settings", icon: SettingsIcon, tid: "nav-settings" },
];

const CREATE_NAV = [
  { to: "/app/create-eq", label: "Projects", icon: Layers, end: true, tid: "creq-nav-projects" },
  { to: "/app/webhooks", label: "Webhooks", icon: Webhook, tid: "creq-nav-webhooks" },
];

const AGENTS = [
  { k: "pitch", label: "Pitch EQ", tag: "Outbound", root: "/app", nav: PITCH_NAV, tid: "agent-pitch" },
  { k: "create", label: "Create EQ", tag: "Carousel", root: "/app/create-eq", nav: CREATE_NAV, tid: "agent-create" },
];

export default function AppLayout() {
  const { user, workspace, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const currentAgent = loc.pathname.startsWith("/app/create-eq") ? AGENTS[1] : AGENTS[0];
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen flex bg-bone">
      <aside className="w-60 border-r border-line bg-white flex flex-col">
        <div className="p-4 border-b border-line relative">
          <button onClick={() => setOpen(!open)} data-testid="suite-switcher"
            className="w-full flex items-center gap-2 hover:bg-surfacehover rounded-lg p-1">
            <div className="w-7 h-7 bg-ink text-white flex items-center justify-center rounded-full font-display font-bold text-sm">i</div>
            <div className="leading-tight flex-1 text-left">
              <div className="font-display font-semibold tracking-tight text-sm">Innoira <span className="text-neutral-400">/</span> {currentAgent.label}</div>
              <div className="text-[10px] text-neutral-500 font-mono uppercase tracking-wider truncate">{workspace?.name}</div>
            </div>
            <ChevronDown size={14} className={`text-neutral-400 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
          {open && (
            <div className="absolute left-4 right-4 top-full mt-1 bg-white border border-line rounded-xl shadow-lg z-30 overflow-hidden">
              {AGENTS.map((a) => (
                <button key={a.k} onClick={() => { setOpen(false); nav(a.root); }} data-testid={a.tid}
                  className={`w-full text-left p-3 hover:bg-surfacehover flex items-center gap-2 ${a.k === currentAgent.k ? "bg-neutral-50" : ""}`}>
                  <div className="w-6 h-6 bg-ink/10 rounded-md flex items-center justify-center text-[10px] font-mono">
                    {a.k === "pitch" ? "P" : "C"}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium">{a.label}</div>
                    <div className="text-[10px] text-neutral-500 font-mono uppercase">{a.tag}</div>
                  </div>
                  {a.k === currentAgent.k && <span className="w-1.5 h-1.5 bg-ink rounded-full" />}
                </button>
              ))}
            </div>
          )}
        </div>
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {currentAgent.nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              data-testid={n.tid}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 text-sm rounded-full transition-colors ${
                  isActive ? "bg-ink text-white" : "text-neutral-700 hover:bg-surfacehover"
                }`
              }
            >
              <n.icon size={16} strokeWidth={1.75} />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-line">
          <div className="flex items-center gap-2 px-2 py-2">
            <div className="w-8 h-8 bg-ink/10 text-ink flex items-center justify-center rounded-full font-mono text-xs font-semibold">
              {(user?.name || "U").slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium truncate">{user?.name}</div>
              <div className="text-[10px] text-neutral-500 truncate">{user?.email}</div>
            </div>
            {user?.is_admin && (
              <button onClick={() => nav("/admin")} data-testid="admin-link" title="Suite Admin"
                className="p-1.5 text-neutral-500 hover:text-ink hover:bg-surfacehover rounded-full">
                <Shield size={14} />
              </button>
            )}
            <button data-testid="logout-btn" onClick={logout} className="p-1.5 text-neutral-500 hover:text-ink hover:bg-surfacehover rounded-full">
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <div className="animate-fade-in">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export function PageHeader({ title, subtitle, right, badge }) {
  return (
    <div className="border-b border-line bg-white">
      <div className="px-6 py-5 flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-display font-bold truncate">{title}</h1>
            {badge && (
              <span className="ui-label text-ink border border-ink px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                <Sparkles size={11} /> {badge}
              </span>
            )}
          </div>
          {subtitle && <div className="text-sm text-neutral-500 mt-1">{subtitle}</div>}
        </div>
        {right}
      </div>
    </div>
  );
}
