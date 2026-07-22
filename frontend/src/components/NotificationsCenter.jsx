import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Bell, Phone, Mail, CalendarClock, FileText, MessageSquare, Share2, Users, Search } from "lucide-react";

const ACTIVITY_ICON = {
  call: Phone, email: Mail, meeting: CalendarClock, booking: CalendarClock,
  proposal: FileText, note: MessageSquare, whatsapp: MessageSquare,
  post: Share2, lead: Users, research: Search, transfer: Phone,
};

const lastSeenKey = (workspaceId) => `innoira_notifications_last_seen_${workspaceId}`;

export default function NotificationsCenter() {
  const { workspace } = useAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unseenCount, setUnseenCount] = useState(0);
  const panelRef = useRef(null);

  const load = async () => {
    const { data } = await api.get("/activities", { params: { limit: 30 } }).catch(() => ({ data: [] }));
    setItems(data);
    const lastSeen = workspace?.id ? localStorage.getItem(lastSeenKey(workspace.id)) : null;
    if (!lastSeen) { setUnseenCount(0); return; }
    setUnseenCount(data.filter((a) => a.at > lastSeen).length);
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace?.id]);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const toggle = () => {
    setOpen((o) => {
      const next = !o;
      if (next && workspace?.id) {
        localStorage.setItem(lastSeenKey(workspace.id), new Date().toISOString());
        setUnseenCount(0);
      }
      return next;
    });
  };

  return (
    <div className="relative" ref={panelRef}>
      <button onClick={toggle} data-testid="notifications-bell"
        className="relative p-2 text-ink-muted hover:text-ink hover:bg-ash rounded-xl transition-all">
        <Bell size={16} />
        {unseenCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-danger text-white text-[9px] font-mono font-medium">
            {unseenCount > 9 ? "9+" : unseenCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-h-96 overflow-y-auto bg-white border border-line rounded-2xl shadow-card-lg z-30 animate-scale-in origin-top-right">
          <div className="p-3 border-b border-line text-card-title font-display font-semibold">Notifications</div>
          {items.length === 0 ? (
            <div className="p-6 text-center text-caption text-ink-muted">No activity yet.</div>
          ) : (
            <div>
              {items.map((a) => {
                const Icon = ACTIVITY_ICON[a.type?.split("_")[0]] || ACTIVITY_ICON[a.agent] || Bell;
                return (
                  <Link key={a.id} to={a.lead?.id ? `/app/crm/leads/${a.lead.id}` : "#"} onClick={() => setOpen(false)}
                    className="flex items-start gap-2.5 p-3 border-b border-line/60 last:border-b-0 hover:bg-surfacehover transition-colors">
                    <div className="w-7 h-7 rounded-lg bg-ash flex items-center justify-center shrink-0">
                      <Icon size={14} className="text-ink-muted" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-caption text-ink leading-snug">{a.summary}</div>
                      <div className="text-tiny text-ink-muted font-mono mt-0.5">
                        {a.agent ? `${a.agent.toUpperCase()} · ` : ""}{a.at ? new Date(a.at).toLocaleString() : ""}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
