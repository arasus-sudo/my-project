import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import { toast } from "sonner";
import { CalendarClock, CheckCircle2 } from "lucide-react";

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

  const slotsByDay = useMemo(() => {
    if (!data) return {};
    const groups = {};
    for (const iso of data.open_slots) {
      const day = iso.slice(0, 10);
      (groups[day] = groups[day] || []).push(iso);
    }
    return groups;
  }, [data]);

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

  if (error) return <div className="min-h-screen flex items-center justify-center text-neutral-500">This booking page isn't available.</div>;
  if (!data) return <div className="min-h-screen flex items-center justify-center text-neutral-500">Loading…</div>;

  if (confirmed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bone p-6">
        <div className="bg-white border border-line rounded-sm p-8 max-w-md text-center space-y-3">
          <CheckCircle2 size={32} className="mx-auto text-green-600" />
          <div className="font-display text-xl font-bold">You're booked!</div>
          <p className="text-sm text-neutral-600">
            {data.event_type.name} with {data.workspace_name}, {new Date(confirmed.start_at).toLocaleString()}
          </p>
          {confirmed.meet_link && (
            <a href={confirmed.meet_link} target="_blank" rel="noreferrer" className="text-sanguine text-sm hover:underline block">
              Join video call
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bone p-6">
      <div className="max-w-2xl mx-auto bg-white border border-line rounded-sm overflow-hidden">
        <div className="p-6 border-b border-line">
          <div className="ui-label text-neutral-500">{data.workspace_name}</div>
          <div className="font-display text-2xl font-bold">{data.event_type.name}</div>
          {data.event_type.description && <p className="text-sm text-neutral-600 mt-1">{data.event_type.description}</p>}
          <div className="text-xs text-neutral-500 font-mono mt-2 flex items-center gap-1">
            <CalendarClock size={12} /> {data.event_type.duration_minutes} min · {data.event_type.location_type}
          </div>
        </div>

        {!selectedSlot ? (
          <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
            {Object.keys(slotsByDay).length === 0 ? (
              <p className="text-sm text-neutral-500">No open slots right now — check back soon.</p>
            ) : Object.entries(slotsByDay).map(([day, slots]) => (
              <div key={day}>
                <div className="ui-label mb-2">{new Date(day).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}</div>
                <div className="flex flex-wrap gap-2">
                  {slots.map((s) => (
                    <button key={s} onClick={() => setSelectedSlot(s)} data-testid={`slot-${s}`}
                      className="border border-line px-3 py-1.5 rounded-sm text-sm hover:border-ink hover:bg-surfacehover">
                      {new Date(s).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <form onSubmit={submit} className="p-6 space-y-3">
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
                <label className="text-xs text-neutral-500 block mb-1">{q.prompt}</label>
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
