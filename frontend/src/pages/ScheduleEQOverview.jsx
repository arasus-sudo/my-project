import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { CalendarRange, CalendarCheck, User, Clock, AlertTriangle } from "../icons";
import MetricCard from "../components/composites/MetricCard";
import Card from "../components/composites/Card";
import { EmptyState } from "../components/composites/EmptyState";

export default function ScheduleEQOverview() {
  const nav = useNavigate();
  const [eventTypes, setEventTypes] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.get("/schedule-eq/event-types"), api.get("/schedule-eq/bookings")])
      .then(([e, b]) => { setEventTypes(e.data); setBookings(b.data); setLoading(false); });
  }, []);

  const upcoming = bookings.filter((b) => b.status === "confirmed" && new Date(b.start_at) > new Date());
  const noShows = bookings.filter((b) => b.status === "no_show");
  const avgRisk = bookings.length
    ? Math.round(bookings.reduce((s, b) => s + (b.no_show_risk_score || 0), 0) / bookings.length)
    : 0;

  return (
    <div>
      <PageHeader
        title="Schedule EQ"
        subtitle="Calendly-style booking — real availability, lead qualifying, no-show risk, meeting prep."
      />
      <div className="animate-fade-in px-6 sm:px-8 py-6 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <MetricCard label="Event types" value={loading ? "—" : eventTypes.length} icon={CalendarRange} tone="primary" />
          <MetricCard label="Upcoming meetings" value={loading ? "—" : upcoming.length} icon={CalendarCheck} tone="success" />
          <MetricCard label="No-shows" value={loading ? "—" : noShows.length} icon={User} tone="risk" />
          <MetricCard label="Avg. no-show risk" value={loading ? "—" : `${avgRisk}%`} icon={Clock} tone="warning" />
        </div>

        {!loading && eventTypes.length === 0 && (
          <EmptyState
            icon={CalendarRange}
            title="Create your first event type"
            description="Set your availability, then publish a public booking link."
            actionLabel="Create event type"
            onAction={() => nav("/app/schedule-eq/event-types")}
          />
        )}

        {!loading && upcoming.length > 0 && (
          <Card title="Upcoming meetings" padding="compact" bodyClassName="-mx-5 -mb-5">
            {upcoming.slice(0, 8).map((b, i) => (
              <div key={b.id} className="flex items-center justify-between"
                style={{ padding: "10px 20px", borderTop: i > 0 ? "1px solid var(--border-subtle)" : "none", fontSize: 13 }}>
                <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>{b.guest_name}</span>
                <span style={{ color: "var(--text-tertiary)" }}>{b.event_type?.name}</span>
                <span className="tnum" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{(b.start_at || "").slice(0, 16).replace("T", " ")}</span>
                {b.no_show_risk_score >= 50 ? (
                  <span className="inline-flex items-center gap-1" style={{ fontSize: 11, color: "var(--color-warning-text)" }}>
                    <AlertTriangle size={12} strokeWidth={1.5} aria-hidden="true" /> risk {b.no_show_risk_score}%
                  </span>
                ) : <span />}
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
