import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Save, Link2, Unlink, Mail } from "lucide-react";

const DAYS = [
  { key: "mon", label: "Monday" }, { key: "tue", label: "Tuesday" }, { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" }, { key: "fri", label: "Friday" }, { key: "sat", label: "Saturday" }, { key: "sun", label: "Sunday" },
];

export default function ScheduleSettings() {
  const [params] = useSearchParams();
  const [status, setStatus] = useState(null);
  const [availability, setAvailability] = useState(null);
  const [emailStatus, setEmailStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    api.get("/schedule-eq/calendar-status").then((r) => setStatus(r.data));
    api.get("/schedule-eq/availability").then((r) => setAvailability(r.data));
    api.get("/schedule-eq/email-status").then((r) => setEmailStatus(r.data)).catch(() => {});
  };
  useEffect(() => {
    load();
    if (params.get("connected")) toast.success("Google Calendar connected");
  }, [params]);

  const connect = async () => {
    const { data } = await api.get("/schedule-eq/oauth/url");
    if (data.mocked) { toast.error("Connect a Google Calendar app to sync a real calendar"); return; }
    window.location.href = data.url;
  };
  const disconnect = async () => {
    await api.post("/schedule-eq/calendar-disconnect");
    toast.success("Disconnected");
    load();
  };

  const toggleDay = (day) => {
    const hours = { ...availability.working_hours };
    if (hours[day]) delete hours[day];
    else hours[day] = [{ start: "09:00", end: "17:00" }];
    setAvailability({ ...availability, working_hours: hours });
  };
  const updateWindow = (day, field, value) => {
    const hours = { ...availability.working_hours };
    hours[day] = [{ ...hours[day][0], [field]: value }];
    setAvailability({ ...availability, working_hours: hours });
  };

  const saveAvailability = async () => {
    setBusy(true);
    try {
      const { workspace_id, ...body } = availability;
      await api.put("/schedule-eq/availability", body);
      toast.success("Availability saved");
    } finally { setBusy(false); }
  };

  if (!status || !availability) return <div className="p-10 text-ink-muted text-body">Loading…</div>;

  return (
    <div>
      <PageHeader title="Schedule EQ Settings" subtitle="Calendar connection, email notifications, and working hours." />
      <div className="animate-fade-in px-6 sm:px-8 max-w-2xl space-y-6">
        <div className="shadow-card rounded-2xl p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <div className="text-card-title font-display font-semibold flex items-center gap-2">
                <Mail size={16} /> Email notifications
              </div>
              <p className="text-caption text-ink-muted mt-1">
                {emailStatus?.mocked === false
                  ? <>Live — confirmations, 24-hour reminders, reschedules and cancellations are sent from <span className="font-mono">{emailStatus.from}</span>, each with a calendar invite attached.</>
                  : <>Test mode — every message is fully composed and recorded, but not delivered. Add a <span className="font-mono">RESEND_API_KEY</span> to send for real.</>}
              </p>
              {emailStatus && (
                <p className="text-caption text-ink-muted mt-1.5">
                  {emailStatus.sent_count} message{emailStatus.sent_count === 1 ? "" : "s"} composed so far.
                </p>
              )}
            </div>
            <span data-testid="email-status-chip"
              className={`shrink-0 text-tiny font-mono uppercase tracking-wider px-2 py-1 rounded-full border ${
                emailStatus?.mocked === false
                  ? "border-success/30 bg-success/10 text-success"
                  : "border-line bg-bone text-ink-muted"
              }`}>
              {emailStatus?.mocked === false ? "Live" : "Test mode"}
            </span>
          </div>
        </div>

        <div className="shadow-card rounded-2xl p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="text-card-title font-display font-semibold">Google Calendar</div>
              <p className="text-caption text-ink-muted mt-1">
                {status.connected ? "Connected — real availability and calendar events are used." : status.mocked
                  ? "Test mode — availability is computed from your working hours only. Connect Google Calendar to sync real events."
                  : "Not connected."}
              </p>
            </div>
            {status.connected ? (
              <button onClick={disconnect} data-testid="disconnect-google" className="btn-secondary"><Unlink size={14} /> Disconnect</button>
            ) : (
              <button onClick={connect} data-testid="connect-google" className="btn-primary"><Link2 size={14} /> Connect Google</button>
            )}
          </div>
        </div>

        <div className="shadow-card rounded-2xl p-6 sm:p-8 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="text-card-title font-display font-semibold">Working hours</div>
            <button onClick={saveAvailability} disabled={busy} data-testid="save-availability-btn" className="btn-primary text-xs self-start"><Save size={12} /> Save</button>
          </div>
          <div>
            <label className="form-label block mb-1">Timezone</label>
            <input value={availability.timezone} onChange={(e) => setAvailability({ ...availability, timezone: e.target.value })}
              data-testid="availability-timezone" className="w-full border border-line px-3 py-2 rounded-sm text-input" placeholder="UTC, America/New_York, …" />
          </div>
          <div className="space-y-2 pt-2">
            {DAYS.map((d) => {
              const active = !!availability.working_hours[d.key];
              const window = availability.working_hours[d.key]?.[0] || { start: "09:00", end: "17:00" };
              return (
                <div key={d.key} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                  <label className="form-label flex items-center gap-2 sm:w-32">
                    <input type="checkbox" checked={active} onChange={() => toggleDay(d.key)} data-testid={`day-toggle-${d.key}`} />
                    {d.label}
                  </label>
                  {active && (
                    <>
                      <input type="time" value={window.start} onChange={(e) => updateWindow(d.key, "start", e.target.value)}
                        data-testid={`day-start-${d.key}`} className="border border-line px-2 py-1 rounded-sm text-input min-w-0" />
                      <span className="text-ink-muted hidden sm:inline">to</span>
                      <span className="text-ink-muted sm:hidden">—</span>
                      <input type="time" value={window.end} onChange={(e) => updateWindow(d.key, "end", e.target.value)}
                        data-testid={`day-end-${d.key}`} className="border border-line px-2 py-1 rounded-sm text-input min-w-0" />
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
