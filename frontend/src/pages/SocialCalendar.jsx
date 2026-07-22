import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

const STATUS_DOT = {
  draft: "bg-neutral-300",
  scheduled: "bg-info",
  pending_approval: "bg-warning",
  approved: "bg-accent",
  publishing: "bg-accent",
  published: "bg-success",
  rejected: "bg-danger",
  publish_failed: "bg-danger",
};

function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const startOffset = first.getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export default function SocialCalendar() {
  const nav = useNavigate();
  const [posts, setPosts] = useState([]);
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [dayModal, setDayModal] = useState(null); // Date | null

  useEffect(() => { api.get("/social-eq/posts").then((r) => setPosts(r.data)); }, []);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const cells = useMemo(() => monthGrid(year, month), [year, month]);

  const byDay = useMemo(() => {
    const map = {};
    for (const p of posts) {
      if (!p.scheduled_for) continue;
      const d = new Date(p.scheduled_for);
      if (d.getFullYear() !== year || d.getMonth() !== month) continue;
      const day = d.getDate();
      (map[day] = map[day] || []).push(p);
    }
    return map;
  }, [posts, year, month]);

  const shiftMonth = (delta) => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));
  const today = new Date();
  const isToday = (day) => day === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  return (
    <div>
      <PageHeader
        title="Calendar"
        subtitle="Every post plotted by its scheduled date."
        right={
          <div className="flex items-center gap-1">
            <button onClick={() => shiftMonth(-1)} data-testid="cal-prev" className="btn-ghost p-2"><ChevronLeft size={16} /></button>
            <div className="text-subheading font-display font-semibold w-32 text-center">
              {cursor.toLocaleString(undefined, { month: "long", year: "numeric" })}
            </div>
            <button onClick={() => shiftMonth(1)} data-testid="cal-next" className="btn-ghost p-2"><ChevronRight size={16} /></button>
          </div>
        }
      />
      <div className="animate-fade-in px-6 sm:px-8">
        <div className="grid grid-cols-7 gap-px bg-line rounded-2xl overflow-hidden border border-line">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="bg-ash text-center py-2 ui-label">{d}</div>
          ))}
          {cells.map((day, i) => {
            const dayPosts = day ? byDay[day] || [] : [];
            return (
              <button key={i} disabled={!day} onClick={() => day && dayPosts.length > 0 && setDayModal(day)}
                data-testid={day ? `cal-day-${day}` : undefined}
                className={`bg-white min-h-[92px] p-2 text-left align-top transition-colors duration-150 ${day ? "hover:bg-surfacehover" : "bg-ash/40"} ${dayPosts.length ? "cursor-pointer" : "cursor-default"}`}>
                {day && (
                  <>
                    <div className={`text-tiny font-mono ${isToday(day) ? "text-white bg-ink rounded-full w-5 h-5 flex items-center justify-center" : "text-ink-muted"}`}>{day}</div>
                    <div className="mt-1.5 space-y-1">
                      {dayPosts.slice(0, 3).map((p) => (
                        <div key={p.id} className="flex items-center gap-1 text-tiny truncate">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[p.status] || STATUS_DOT.draft}`} />
                          <span className="truncate text-ink-tertiary">{p.headline || p.platform}</span>
                        </div>
                      ))}
                      {dayPosts.length > 3 && <div className="text-tiny text-ink-muted">+{dayPosts.length - 3} more</div>}
                    </div>
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {dayModal && (
        <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50 p-4" onClick={(e) => e.target === e.currentTarget && setDayModal(null)}>
          <div className="bg-white border border-line p-6 rounded-2xl w-full max-w-md space-y-3 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="text-card-title font-display font-semibold">
                {new Date(year, month, dayModal).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
              </div>
              <button onClick={() => setDayModal(null)} className="text-ink-muted hover:text-ink"><X size={16} /></button>
            </div>
            <div className="space-y-2">
              {(byDay[dayModal] || []).map((p) => (
                <button key={p.id} onClick={() => nav(`/app/social-eq/queue?post=${p.id}`)}
                  className="w-full text-left border border-line rounded-xl p-3 hover:bg-surfacehover transition-colors duration-150">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${STATUS_DOT[p.status] || STATUS_DOT.draft}`} />
                    <span className="ui-label capitalize">{p.platform}</span>
                    <span className="ui-label">{p.status}</span>
                  </div>
                  <div className="text-body font-medium mt-1">{p.headline}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
