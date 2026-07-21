import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { CalendarRange, CalendarCheck, UserX, Clock } from "lucide-react";

export default function ScheduleEQOverview() {
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
      <div className="animate-fade-in px-6 sm:px-8 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard icon={CalendarRange} label="Event types" value={loading ? "—" : eventTypes.length} />
          <StatCard icon={CalendarCheck} label="Upcoming meetings" value={loading ? "—" : upcoming.length} />
          <StatCard icon={UserX} label="No-shows" value={loading ? "—" : noShows.length} />
          <StatCard icon={Clock} label="Avg. no-show risk" value={loading ? "—" : `${avgRisk}%`} />
        </div>

        {!loading && eventTypes.length === 0 && (
          <div className="shadow-card rounded-2xl p-10 text-center">
            <div className="text-section font-display font-semibold">Create your first event type</div>
            <p className="text-body text-ink-muted mt-2">Set your availability, then publish a public booking link.</p>
            <Link to="/app/schedule-eq/event-types" className="btn-primary mt-6 inline-flex">Create event type</Link>
          </div>
        )}

        {!loading && upcoming.length > 0 && (
          <div className="shadow-card rounded-2xl border border-line bg-white overflow-x-auto">
            <div className="p-4 border-b border-line text-card-title font-display font-semibold">Upcoming meetings</div>
            <table className="w-full text-table">
              <tbody>
                {upcoming.slice(0, 8).map((b) => (
                  <tr key={b.id} className="border-b border-line last:border-0">
                    <td className="p-3">{b.guest_name}</td>
                    <td className="p-3 text-ink-tertiary">{b.event_type?.name}</td>
                    <td className="p-3 text-tiny text-ink-muted">{(b.start_at || "").slice(0, 16).replace("T", " ")}</td>
                    <td className="p-3 text-right text-tiny">
                      {b.no_show_risk_score >= 50 && <span className="text-warning">⚠ risk {b.no_show_risk_score}%</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }) {
  return (
    <div className="shadow-card rounded-2xl p-4">
      <div className="flex items-center gap-2 text-ink-muted">
        <Icon size={14} />
        <span className="ui-label">{label}</span>
      </div>
      <div className="text-page-title font-display font-semibold mt-1">{value}</div>
    </div>
  );
}
