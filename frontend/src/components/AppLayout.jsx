import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import {
  LayoutDashboard, Send, Users, Inbox as InboxIcon, Kanban, Mail, Settings as SettingsIcon, LogOut, Sparkles,
} from "lucide-react";

const NAV = [
  { to: "/app", label: "Overview", icon: LayoutDashboard, end: true, tid: "nav-overview" },
  { to: "/app/campaigns", label: "Campaigns", icon: Send, tid: "nav-campaigns" },
  { to: "/app/inbox", label: "Inbox", icon: InboxIcon, tid: "nav-inbox" },
  { to: "/app/crm", label: "Pipeline", icon: Kanban, tid: "nav-crm" },
  { to: "/app/leads", label: "Leads", icon: Users, tid: "nav-leads" },
  { to: "/app/mailboxes", label: "Mailboxes", icon: Mail, tid: "nav-mailboxes" },
  { to: "/app/settings", label: "Settings", icon: SettingsIcon, tid: "nav-settings" },
];

export default function AppLayout() {
  const { user, workspace, logout } = useAuth();
  const nav = useNavigate();

  return (
    <div className="min-h-screen flex bg-bone">
      <aside className="w-60 border-r border-line bg-white flex flex-col">
        <div className="p-5 border-b border-line">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => nav("/app")}>
            <div className="w-7 h-7 bg-ink text-bone flex items-center justify-center rounded-sm font-display font-bold">P</div>
            <div className="leading-tight">
              <div className="font-display font-bold tracking-tight">Pitch EQ</div>
              <div className="text-[10px] text-neutral-500 font-mono uppercase tracking-wider">{workspace?.name}</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-0.5">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              data-testid={n.tid}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 text-sm rounded-sm transition-colors ${
                  isActive
                    ? "bg-ink text-bone"
                    : "text-neutral-700 hover:bg-surfacehover"
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
            <div className="w-8 h-8 bg-sanguine-soft text-sanguine flex items-center justify-center rounded-sm font-mono text-xs font-bold">
              {(user?.name || "U").slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium truncate">{user?.name}</div>
              <div className="text-[10px] text-neutral-500 truncate">{user?.email}</div>
            </div>
            <button data-testid="logout-btn" onClick={logout} className="p-1.5 text-neutral-500 hover:text-ink hover:bg-surfacehover rounded-sm">
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
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-display font-bold">{title}</h1>
            {badge && (
              <span className="ui-label text-sanguine border border-sanguine px-2 py-0.5 rounded-sm inline-flex items-center gap-1">
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
