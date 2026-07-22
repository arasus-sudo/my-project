import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  CalendarClock, CheckCircle2, XCircle, Video, CalendarPlus, ArrowLeft, Loader2,
} from "lucide-react";
import { api } from "../lib/api";
import SlotPicker, { googleCalendarUrl } from "../components/SlotPicker";

/** Guest self-service, reached from the link in their confirmation email.
 *  The token in the URL is the only credential — there is no login. */
export default function ManageBooking() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [mode, setMode] = useState("view"); // view | reschedule | confirmCancel
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null); // "rescheduled" | "cancelled"

  const load = useCallback(() => {
    api.get(`/book/manage/${token}`)
      .then((r) => setData(r.data))
      .catch(() => setError(true));
  }, [token]);

  useEffect(load, [load]);

  const reschedule = async (startAt) => {
    setBusy(true);
    try {
      await api.post(`/book/manage/${token}/reschedule`, { start_at: startAt });
      setDone("rescheduled");
      setMode("view");
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not reschedule — please pick another time");
      load();
    } finally { setBusy(false); }
  };

  const cancel = async () => {
    setBusy(true);
    try {
      await api.post(`/book/manage/${token}/cancel`);
      setDone("cancelled");
      setMode("view");
      load();
    } catch {
      toast.error("Could not cancel");
    } finally { setBusy(false); }
  };

  if (error) {
    return (
      <Shell>
        <p className="text-body text-ink-tertiary">
          This link isn't valid any more. If you think that's a mistake, reply to your confirmation email.
        </p>
      </Shell>
    );
  }
  if (!data) {
    return <Shell><Loader2 className="animate-spin text-ink-muted mx-auto" /></Shell>;
  }

  const { booking, event_type: et, workspace_name: ws, open_slots: slots } = data;
  const cancelled = booking.status === "cancelled";
  const when = new Date(booking.start_at);

  const calUrl = googleCalendarUrl({
    title: `${et.name} — ${ws}`,
    start: booking.start_at,
    end: booking.end_at,
    details: et.description || "",
    location: booking.meet_link || "",
  });

  if (cancelled) {
    return (
      <Shell>
        <div className="text-center space-y-3" data-testid="booking-cancelled">
          <XCircle size={32} className="mx-auto text-ink-muted" />
          <div className="text-section font-display font-semibold">Meeting cancelled</div>
          <p className="text-body text-ink-tertiary">
            Your {et.name} with {ws} is cancelled. Nothing further is needed — we've let them know.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      {done === "rescheduled" && (
        <div className="mb-5 flex items-center gap-2 rounded-xl border border-success/30 bg-ash px-3 py-2 text-caption text-success"
          data-testid="reschedule-success">
          <CheckCircle2 size={14} /> Moved. We've emailed the new time to both of you.
        </div>
      )}

      <div className="ui-label">{ws}</div>
      <div className="text-section font-display font-semibold mt-1">{et.name}</div>
      <div className="text-tiny text-ink-muted font-mono mt-2 flex items-center gap-1">
        <CalendarClock size={12} /> {et.duration_minutes} min · {et.location_type}
      </div>

      <div className="mt-5 rounded-xl border border-line bg-bone px-4 py-3" data-testid="current-time">
        <div className="ui-label">Your meeting</div>
        <div className="text-body font-medium mt-1">
          {when.toLocaleString(undefined, {
            weekday: "long", month: "long", day: "numeric",
            hour: "numeric", minute: "2-digit",
          })}
        </div>
        <div className="text-tiny text-ink-muted mt-0.5">Shown in your local time.</div>
      </div>

      {mode === "view" && (
        <div className="mt-5 flex flex-col gap-2">
          {booking.meet_link && (
            <a href={booking.meet_link} target="_blank" rel="noreferrer" data-testid="join-link"
              className="btn-primary justify-center py-2">
              <Video size={14} /> Join video call
            </a>
          )}
          <a href={calUrl} target="_blank" rel="noreferrer" data-testid="add-to-calendar"
            className="border border-line rounded-xl py-2 text-button font-medium font-display flex items-center justify-center gap-1.5 hover:bg-surfacehover">
            <CalendarPlus size={14} /> Add to calendar
          </a>
          <button onClick={() => setMode("reschedule")} data-testid="reschedule-btn"
            className="border border-line rounded-xl py-2 text-button font-medium font-display hover:bg-surfacehover">
            Reschedule
          </button>
          <button onClick={() => setMode("confirmCancel")} data-testid="cancel-btn"
            className="text-caption text-ink-muted hover:text-danger underline underline-offset-2 pt-1">
            Cancel this meeting
          </button>
        </div>
      )}

      {mode === "reschedule" && (
        <div className="mt-5">
          <button onClick={() => setMode("view")} className="text-caption text-ink-muted hover:text-ink flex items-center gap-1 mb-3">
            <ArrowLeft size={12} /> Back
          </button>
          <div className="ui-label mb-3">Pick a new time</div>
          <div className="max-h-[45vh] overflow-y-auto">
            <SlotPicker
              slots={slots}
              onPick={reschedule}
              emptyMessage="No other times are open right now. Reply to your confirmation email and we'll sort something out."
            />
          </div>
          {busy && <div className="text-caption text-ink-muted mt-3 flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Moving your meeting…</div>}
        </div>
      )}

      {mode === "confirmCancel" && (
        <div className="mt-5 rounded-xl border border-warning/30 bg-warning/10 p-4" data-testid="cancel-confirm">
          <div className="text-body font-medium text-warning">Cancel this meeting?</div>
          <p className="text-caption text-warning mt-1">
            The slot opens back up and {ws} is notified. This can't be undone — you'd need to book again.
          </p>
          <div className="flex gap-2 mt-3">
            <button onClick={cancel} disabled={busy} data-testid="cancel-confirm-btn"
              className="bg-danger text-white rounded-xl px-4 py-1.5 text-caption font-medium disabled:opacity-50">
              {busy ? "Cancelling…" : "Yes, cancel it"}
            </button>
            <button onClick={() => setMode("view")} className="text-caption text-ink-tertiary px-3 hover:text-ink">
              Keep the meeting
            </button>
          </div>
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-bone p-4 sm:p-6 flex items-center justify-center">
      <div className="w-full max-w-md bg-white border border-line rounded-2xl p-5 sm:p-7">{children}</div>
    </div>
  );
}
