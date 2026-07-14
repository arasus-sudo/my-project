import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Save, Link2, Unlink } from "lucide-react";

const DAYS = [
  { key: "mon", label: "Monday" }, { key: "tue", label: "Tuesday" }, { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" }, { key: "fri", label: "Friday" }, { key: "sat", label: "Saturday" }, { key: "sun", label: "Sunday" },
];

export default function ScheduleSettings() {
  const [params] = useSearchParams();
  const [status, setStatus] = useState(null);
  const [availability, setAvailability] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    api.get("/schedule-eq/calendar-status").then((r) => setStatus(r.data));
    api.get("/schedule-eq/availability").then((r) => setAvailability(r.data));
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

  if (!status || !availability) return <div className="p-10 text-neutral-500 text-sm">Loading…</div>;

  return (
    <div>
      <PageHeader title="Schedule EQ Settings" subtitle="Calendar connection and working hours." />
      <div className="p-6 max-w-2xl space-y-6">
        <div className="card-flat p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-display font-semibold">Google Calendar</div>
              <p className="text-xs text-neutral-500 mt-1">
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

        <div className="card-flat p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-display font-semibold">Working hours</div>
            <button onClick={saveAvailability} disabled={busy} data-testid="save-availability-btn" className="btn-primary text-xs"><Save size={12} /> Save</button>
          </div>
          <div>
            <label className="ui-label block mb-1">Timezone</label>
            <input value={availability.timezone} onChange={(e) => setAvailability({ ...availability, timezone: e.target.value })}
              data-testid="availability-timezone" className="w-full border border-line px-3 py-2 rounded-sm" placeholder="UTC, America/New_York, …" />
          </div>
          <div className="space-y-2 pt-2">
            {DAYS.map((d) => {
              const active = !!availability.working_hours[d.key];
              const window = availability.working_hours[d.key]?.[0] || { start: "09:00", end: "17:00" };
              return (
                <div key={d.key} className="flex items-center gap-3">
                  <label className="flex items-center gap-2 w-32 text-sm">
                    <input type="checkbox" checked={active} onChange={() => toggleDay(d.key)} data-testid={`day-toggle-${d.key}`} />
                    {d.label}
                  </label>
                  {active && (
                    <>
                      <input type="time" value={window.start} onChange={(e) => updateWindow(d.key, "start", e.target.value)}
                        data-testid={`day-start-${d.key}`} className="border border-line px-2 py-1 rounded-sm text-sm" />
                      <span className="text-neutral-400">to</span>
                      <input type="time" value={window.end} onChange={(e) => updateWindow(d.key, "end", e.target.value)}
                        data-testid={`day-end-${d.key}`} className="border border-line px-2 py-1 rounded-sm text-sm" />
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
