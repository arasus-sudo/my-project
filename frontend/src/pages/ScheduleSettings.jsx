import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Check, Link, Mail } from "../icons";
import Card from "../components/composites/Card";
import Button from "../components/primitives/Button";
import Select from "../components/primitives/Select";
import Checkbox from "../components/primitives/Checkbox";
import Input from "../components/primitives/Input";
import StatusPill from "../components/primitives/StatusPill";

const TIMEZONES = [
  "UTC", "US/Eastern", "US/Central", "US/Mountain", "US/Pacific",
  "US/Alaska", "US/Hawaii", "Canada/Atlantic", "Canada/Newfoundland",
  "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Madrid",
  "Europe/Rome", "Europe/Amsterdam", "Europe/Stockholm", "Europe/Moscow",
  "Asia/Almaty", "Asia/Amman", "Asia/Aqtau", "Asia/Aqtobe", "Asia/Ashgabat",
  "Asia/Baghdad", "Asia/Bahrain", "Asia/Baku", "Asia/Bangkok", "Asia/Beirut",
  "Asia/Bishkek", "Asia/Colombo", "Asia/Damascus", "Asia/Dhaka", "Asia/Dili",
  "Asia/Dubai", "Asia/Dushanbe", "Asia/Ho_Chi_Minh", "Asia/Hong_Kong",
  "Asia/Irkutsk", "Asia/Jakarta", "Asia/Jayapura", "Asia/Jerusalem",
  "Asia/Kabul", "Asia/Kamchatka", "Asia/Karachi", "Asia/Kathmandu",
  "Asia/Kolkata", "Asia/Krasnoyarsk", "Asia/Kuala_Lumpur", "Asia/Kuwait",
  "Asia/Macau", "Asia/Magadan", "Asia/Makassar", "Asia/Manila",
  "Asia/Muscat", "Asia/Nicosia", "Asia/Novosibirsk", "Asia/Oral",
  "Asia/Phnom_Penh", "Asia/Pyongyang", "Asia/Qatar", "Asia/Riyadh",
  "Asia/Sakhalin", "Asia/Samarkand", "Asia/Seoul", "Asia/Shanghai",
  "Asia/Singapore", "Asia/Taipei", "Asia/Tashkent", "Asia/Tbilisi",
  "Asia/Tehran", "Asia/Thimphu", "Asia/Tokyo", "Asia/Ulaanbaatar",
  "Asia/Vientiane", "Asia/Vladivostok", "Asia/Yakutsk", "Asia/Yangon",
  "Asia/Yekaterinburg", "Asia/Yerevan",
  "Australia/Sydney", "Australia/Melbourne", "Australia/Perth",
  "Pacific/Auckland", "Pacific/Fiji", "America/Sao_Paulo",
  "America/Mexico_City", "America/Argentina/Buenos_Aires",
  "Africa/Cairo", "Africa/Lagos", "Africa/Johannesburg",
];

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

  if (!status || !availability) return <div className="p-10" style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Loading…</div>;

  return (
    <div>
      <PageHeader title="Schedule EQ Settings" subtitle="Calendar connection, email notifications, and working hours." />
      <div className="animate-fade-in px-6 sm:px-8 py-6 max-w-2xl space-y-4">
        <Card>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <div className="flex items-center gap-2" style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>
                <Mail size={16} strokeWidth={1.5} aria-hidden="true" /> Email notifications
              </div>
              <p style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginTop: 4 }}>
                {emailStatus?.mocked === false
                  ? <>Live — confirmations, 24-hour reminders, reschedules and cancellations are sent from <span style={{ fontFamily: "var(--font-mono)" }}>{emailStatus.from}</span>, each with a calendar invite attached.</>
                  : <>Test mode — every message is fully composed and recorded, but not delivered. Add a <span style={{ fontFamily: "var(--font-mono)" }}>RESEND_API_KEY</span> to send for real.</>}
              </p>
              {emailStatus && (
                <p style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginTop: 6 }}>
                  {emailStatus.sent_count} message{emailStatus.sent_count === 1 ? "" : "s"} composed so far.
                </p>
              )}
            </div>
            <StatusPill data-testid="email-status-chip" status={emailStatus?.mocked === false ? "Live" : "Test mode"} tone={emailStatus?.mocked === false ? "success" : "neutral"} className="shrink-0" />
          </div>
        </Card>

        <Card>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>Google Calendar</div>
              <p style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginTop: 4 }}>
                {status.connected ? "Connected — real availability and calendar events are used." : status.mocked
                  ? "Test mode — availability is computed from your working hours only. Connect Google Calendar to sync real events."
                  : "Not connected."}
              </p>
            </div>
            {status.connected ? (
              <Button variant="secondary" icon={Link} onClick={disconnect} data-testid="disconnect-google">Disconnect</Button>
            ) : (
              <Button variant="primary" icon={Link} onClick={connect} data-testid="connect-google">Connect Google</Button>
            )}
          </div>
        </Card>

        <Card>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>Working hours</div>
            <Button variant="primary" size="sm" icon={Check} onClick={saveAvailability} isLoading={busy} data-testid="save-availability-btn" className="self-start">Save</Button>
          </div>
          <Select
            label="Timezone" value={availability.timezone} onChange={(v) => setAvailability({ ...availability, timezone: v })} data-testid="availability-timezone"
            options={TIMEZONES.map((tz) => ({ value: tz, label: tz }))}
          />
          <div className="space-y-2" style={{ marginTop: 16 }}>
            {DAYS.map((d) => {
              const active = !!availability.working_hours[d.key];
              const win = availability.working_hours[d.key]?.[0] || { start: "09:00", end: "17:00" };
              return (
                <div key={d.key} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                  <div className="sm:w-32">
                    <Checkbox label={d.label} checked={active} onChange={() => toggleDay(d.key)} data-testid={`day-toggle-${d.key}`} />
                  </div>
                  {active && (
                    <>
                      <Input size="sm" type="time" value={win.start} onChange={(e) => updateWindow(d.key, "start", e.target.value)} data-testid={`day-start-${d.key}`} className="min-w-0" />
                      <span style={{ color: "var(--text-tertiary)", fontSize: 12.5 }} className="hidden sm:inline">to</span>
                      <span style={{ color: "var(--text-tertiary)", fontSize: 12.5 }} className="sm:hidden">—</span>
                      <Input size="sm" type="time" value={win.end} onChange={(e) => updateWindow(d.key, "end", e.target.value)} data-testid={`day-end-${d.key}`} className="min-w-0" />
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
