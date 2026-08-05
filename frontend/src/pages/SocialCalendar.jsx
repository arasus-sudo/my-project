import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { ChevronLeft, ChevronRight } from "../icons";
import { Modal, ModalContent } from "../components/composites/Modal";
import StatusPill from "../components/primitives/StatusPill";
import Button from "../components/primitives/Button";

const STATUS_TONE = {
  draft: "neutral", scheduled: "primary", pending_approval: "warning",
  approved: "primary", publishing: "primary", published: "success",
  rejected: "danger", publish_failed: "danger",
};
const DOT_COLOR = {
  neutral: "var(--color-neutral-status)", primary: "var(--color-primary)",
  warning: "var(--color-warning)", success: "var(--color-success)", danger: "var(--color-danger)",
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
  const [dayModal, setDayModal] = useState(null); // number | null

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
            <Button variant="tertiary" iconOnly icon={ChevronLeft} onClick={() => shiftMonth(-1)} data-testid="cal-prev" aria-label="Previous month" />
            <div className="text-center" style={{ width: 128, fontSize: 14, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
              {cursor.toLocaleString(undefined, { month: "long", year: "numeric" })}
            </div>
            <Button variant="tertiary" iconOnly icon={ChevronRight} onClick={() => shiftMonth(1)} data-testid="cal-next" aria-label="Next month" />
          </div>
        }
      />
      <div className="animate-fade-in px-6 sm:px-8 py-6">
        <div className="grid grid-cols-7 gap-px overflow-hidden" style={{ background: "var(--border-default)", borderRadius: "var(--radius-xl)", border: "1px solid var(--border-default)" }}>
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="text-center" style={{ background: "var(--bg-surface-sunken)", padding: "8px 0", fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)" }}>{d}</div>
          ))}
          {cells.map((day, i) => {
            const dayPosts = day ? byDay[day] || [] : [];
            return (
              <button key={i} disabled={!day} onClick={() => day && dayPosts.length > 0 && setDayModal(day)}
                data-testid={day ? `cal-day-${day}` : undefined}
                className="text-left align-top"
                style={{
                  background: day ? "var(--bg-surface)" : "var(--bg-surface-sunken)",
                  minHeight: 92, padding: 8, cursor: dayPosts.length ? "pointer" : "default",
                }}>
                {day && (
                  <>
                    <div className="tnum" style={isToday(day)
                      ? { color: "#fff", background: "var(--text-primary)", borderRadius: "var(--radius-full)", width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11 }
                      : { color: "var(--text-tertiary)", fontSize: 11 }}>{day}</div>
                    <div className="space-y-1" style={{ marginTop: 6 }}>
                      {dayPosts.slice(0, 3).map((p) => (
                        <div key={p.id} className="flex items-center gap-1 truncate" style={{ fontSize: 11 }}>
                          <span className="shrink-0" style={{ width: 6, height: 6, borderRadius: "var(--radius-full)", background: DOT_COLOR[STATUS_TONE[p.status]] || DOT_COLOR.neutral }} />
                          <span className="truncate" style={{ color: "var(--text-secondary)" }}>{p.headline || p.platform}</span>
                        </div>
                      ))}
                      {dayPosts.length > 3 && <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>+{dayPosts.length - 3} more</div>}
                    </div>
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <Modal open={!!dayModal} onOpenChange={(o) => !o && setDayModal(null)}>
        {dayModal && (
          <ModalContent size="sm" title={new Date(year, month, dayModal).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}>
            <div className="space-y-2">
              {(byDay[dayModal] || []).map((p) => (
                <button key={p.id} onClick={() => nav(`/app/social-eq/queue?post=${p.id}`)} className="w-full text-left"
                  style={{ border: "1px solid var(--border-default)", borderRadius: "var(--radius-lg)", padding: 12 }}>
                  <div className="flex items-center gap-2">
                    <span style={{ width: 8, height: 8, borderRadius: "var(--radius-full)", background: DOT_COLOR[STATUS_TONE[p.status]] || DOT_COLOR.neutral }} />
                    <span className="capitalize" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{p.platform}</span>
                    <StatusPill status={p.status} tone={STATUS_TONE[p.status]} />
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)", marginTop: 4 }}>{p.headline}</div>
                </button>
              ))}
            </div>
          </ModalContent>
        )}
      </Modal>
    </div>
  );
}
