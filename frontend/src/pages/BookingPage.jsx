import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../lib/api";
import { toast } from "sonner";
import { CalendarClock, CheckCircle2, CalendarPlus, Video } from "lucide-react";
import SlotPicker, { googleCalendarUrl } from "../components/SlotPicker";

export default function BookingPage() {
  const { workspaceId, eventTypeSlug } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [form, setForm] = useState({ guest_name: "", guest_email: "", guest_phone: "" });
  const [answers, setAnswers] = useState({});
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(null);

  useEffect(() => {
    api.get(`/book/${workspaceId}/${eventTypeSlug}`)
      .then((r) => setData(r.data))
      .catch(() => setError(true));
  }, [workspaceId, eventTypeSlug]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data: res } = await api.post(`/book/${workspaceId}/${eventTypeSlug}`, {
        ...form, start_at: selectedSlot, qualifying_answers: answers,
      });
      if (res.ok === false && res.redirect_url) {
        window.location.href = res.redirect_url;
        return;
      }
      setConfirmed(res);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Booking failed — that slot may no longer be available");
      setSelectedSlot(null);
    } finally { setBusy(false); }
  };

  if (error) return <div className="min-h-screen flex items-center justify-center text-neutral-400">This booking page isn't available.</div>;
  if (!data) return <div className="min-h-screen flex items-center justify-center text-neutral-400">Loading…</div>;

  if (confirmed) {
    const calUrl = googleCalendarUrl({
      title: `${data.event_type.name} — ${data.workspace_name}`,
      start: confirmed.start_at,
      end: confirmed.end_at,
      details: data.event_type.description || "",
      location: confirmed.meet_link || "",
    });
    return (
      <div className="min-h-screen flex items-center justify-center bg-bone p-4 sm:p-6">
        <div className="bg-white border border-line rounded-2xl p-6 sm:p-8 max-w-md text-center space-y-4" data-testid="booking-confirmed">
          <CheckCircle2 size={32} className="mx-auto text-green-600" />
          <div>
            <div className="font-display text-xl sm:text-2xl font-semibold">You're booked!</div>
            <p className="text-sm text-neutral-500 mt-1">
              {data.event_type.name} with {data.workspace_name}
            </p>
            <p className="text-sm font-medium mt-1">
              {new Date(confirmed.start_at).toLocaleString(undefined, {
                weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit",
              })}
            </p>
          </div>

          <p className="text-xs text-neutral-400">
            A confirmation is on its way to {confirmed.guest_email}, with a calendar invite attached.
          </p>

          <div className="flex flex-col gap-2 pt-1">
            {confirmed.meet_link && (
              <a href={confirmed.meet_link} target="_blank" rel="noreferrer"
                data-testid="join-link"
                className="btn-primary justify-center text-sm py-2">
                <Video size={14} /> Join video call
              </a>
            )}
            <a href={calUrl} target="_blank" rel="noreferrer"
              data-testid="add-to-calendar"
              className="border border-line rounded-xl py-2 text-sm flex items-center justify-center gap-1.5 hover:bg-surfacehover">
              <CalendarPlus size={14} /> Add to calendar
            </a>
            {confirmed.manage_token && (
              <Link to={`/book/manage/${confirmed.manage_token}`} data-testid="manage-link"
                className="text-xs text-neutral-400 hover:text-ink underline underline-offset-2 pt-1">
                Need a different time? Reschedule or cancel
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bone p-4 sm:p-6">
      <div className="max-w-2xl mx-auto bg-white border border-line rounded-2xl overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-line">
          <div className="ui-label text-neutral-400">{data.workspace_name}</div>
          <div className="font-display text-xl sm:text-2xl font-bold">{data.event_type.name}</div>
          {data.event_type.description && <p className="text-sm text-neutral-500 mt-1">{data.event_type.description}</p>}
          <div className="text-xs text-neutral-400 font-mono mt-2 flex items-center gap-1">
            <CalendarClock size={12} /> {data.event_type.duration_minutes} min · {data.event_type.location_type}
          </div>
        </div>

        {!selectedSlot ? (
          <div className="p-6 max-h-[60vh] overflow-y-auto">
            <SlotPicker slots={data.open_slots} onPick={setSelectedSlot} />
          </div>
        ) : (
          <form onSubmit={submit} className="p-4 sm:p-6 space-y-3">
            <div className="text-sm font-medium">
              {new Date(selectedSlot).toLocaleString(undefined, { weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              <button type="button" onClick={() => setSelectedSlot(null)} className="text-xs text-neutral-400 hover:text-ink ml-2">change</button>
            </div>
            <input required placeholder="Your name" value={form.guest_name} onChange={(e) => setForm({ ...form, guest_name: e.target.value })}
              data-testid="guest-name" className="w-full border border-line px-3 py-2 rounded-sm" />
            <input required type="email" placeholder="Email" value={form.guest_email} onChange={(e) => setForm({ ...form, guest_email: e.target.value })}
              data-testid="guest-email" className="w-full border border-line px-3 py-2 rounded-sm" />
            <input placeholder="Phone (optional)" value={form.guest_phone} onChange={(e) => setForm({ ...form, guest_phone: e.target.value })}
              data-testid="guest-phone" className="w-full border border-line px-3 py-2 rounded-sm" />
            {data.event_type.qualifying_questions.map((q) => (
              <div key={q.key}>
                <label className="text-xs text-neutral-400 block mb-1">{q.prompt}</label>
                <input value={answers[q.key] || ""} onChange={(e) => setAnswers({ ...answers, [q.key]: e.target.value })}
                  data-testid={`qanswer-${q.key}`} className="w-full border border-line px-3 py-2 rounded-sm" />
              </div>
            ))}
            <button type="submit" disabled={busy} data-testid="confirm-booking-btn" className="btn-primary w-full justify-center">
              {busy ? "Booking…" : "Confirm booking"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
