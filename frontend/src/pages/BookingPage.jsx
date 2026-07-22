import { useEffect, useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../lib/api";
import { toast } from "sonner";
import { CalendarClock, CheckCircle2, CalendarPlus, Video, Clock, MapPin, ChevronLeft, ArrowRight } from "lucide-react";
import SlotPicker, { googleCalendarUrl } from "../components/SlotPicker";

export default function BookingPage() {
  const { workspaceId, eventTypeSlug } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [selectedDuration, setSelectedDuration] = useState(null);
  const [form, setForm] = useState({ guest_name: "", guest_email: "", guest_phone: "" });
  const [answers, setAnswers] = useState({});
  const [formAnswers, setFormAnswers] = useState({});
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(null);
  const [step, setStep] = useState("slot"); // slot | form | confirmed

  useEffect(() => {
    if (!workspaceId || !eventTypeSlug) { setError({status: 0, detail: "Missing workspace ID or event type slug in URL"}); return; }
    api.get(`/book/${workspaceId}/${eventTypeSlug}`)
      .then((r) => { setData(r.data); if (r.data.event_type?.duration_options?.length) setSelectedDuration(r.data.event_type.duration_options[0].minutes); })
      .catch((err) => { console.error("Booking API error", err?.response?.status, err?.response?.data); setError({status: err?.response?.status || 0, detail: err?.response?.data?.detail || err.message || "Unknown error"}); });
  }, [workspaceId, eventTypeSlug]);

  const branding = data?.event_type?.branding || {};
  const primaryColor = branding.primary_color || "#141414";
  const primaryStyle = { backgroundColor: primaryColor, borderColor: primaryColor, color: "#ffffff" };
  const primaryStyleOutlined = { borderColor: primaryColor, color: primaryColor };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data: res } = await api.post(`/book/${workspaceId}/${eventTypeSlug}`, {
        ...form, start_at: selectedSlot, qualifying_answers: answers,
        form_answers: formAnswers,
        selected_duration_minutes: selectedDuration || undefined,
        // The guest's own timezone — without this every booking/email defaulted
        // to the host's timezone (or UTC) regardless of who was actually booking.
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      if (res.ok === false && res.redirect_url) {
        window.location.href = res.redirect_url;
        return;
      }
      setConfirmed(res);
      setStep("confirmed");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Booking failed — that slot may no longer be available");
      setSelectedSlot(null);
      setStep("slot");
    } finally { setBusy(false); }
  };

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bone p-6">
        <div className="text-center max-w-sm">
          <div className="text-4xl mb-3">🔗</div>
          <div className="text-section font-display font-semibold mb-2">This booking page isn't available</div>
          <p className="text-body text-ink-tertiary">The link may be invalid or the event type has been removed.</p>
          <div className="mt-4 p-3 bg-danger/10 border border-danger/30 rounded-xl text-left">
            <p className="text-caption font-mono text-danger break-all">API: /book/{workspaceId}/{eventTypeSlug}</p>
            <p className="text-caption font-mono text-danger mt-1">Status: {error.status}</p>
            <p className="text-caption font-mono text-danger mt-1">Detail: {error.detail}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bone">
        <div className="flex items-center gap-2 text-ink-muted">
          <div className="w-4 h-4 border-2 border-neutral-300 border-t-transparent rounded-full animate-spin" />
          Loading…
        </div>
      </div>
    );
  }

  if (confirmed && step === "confirmed") {
    const calUrl = googleCalendarUrl({
      title: `${data.event_type.name} — ${data.workspace_name}`,
      start: confirmed.start_at,
      end: confirmed.end_at,
      details: data.event_type.description || "",
      location: confirmed.meet_link || "",
    });
    const confirmMsg = branding.confirmation_message || "";
    return (
      <div className="min-h-screen flex items-center justify-center bg-bone p-4 sm:p-6">
        <div className="w-full max-w-md mx-auto">
          <div className="bg-white border border-line rounded-3xl overflow-hidden shadow-sm">
            {branding.logo_url && (
              <div className="flex justify-center pt-8 pb-0">
                <img src={branding.logo_url} alt="" className="h-10 object-contain" />
              </div>
            )}
            <div className="p-8 text-center space-y-4">
              <CheckCircle2 size={32} className="mx-auto text-success" />
              <div>
                <div className="text-page-title font-display font-semibold" style={{ color: primaryColor }}>
                  {branding.confirmation_message || "You're booked!"}
                </div>
                <p className="text-body text-ink-tertiary mt-1">
                  {data.event_type.name} with {data.workspace_name}
                </p>
                <p className="text-body font-medium mt-2">
                  {new Date(confirmed.start_at).toLocaleString(undefined, {
                    weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit",
                  })}
                </p>
                {confirmed.selected_duration_minutes && (
                  <p className="text-caption text-ink-muted mt-1">
                    {confirmed.selected_duration_minutes} minutes
                  </p>
                )}
              </div>

              {confirmMsg && (
                <p className="text-body text-ink-secondary italic">{confirmMsg}</p>
              )}

              <p className="text-caption text-ink-muted">
                A confirmation is on its way to {confirmed.guest_email}, with a calendar invite attached.
              </p>

              <div className="flex flex-col gap-2 pt-1">
                {confirmed.meet_link && (
                  <a href={confirmed.meet_link} target="_blank" rel="noreferrer"
                    data-testid="join-link"
                    className="btn-primary justify-center py-2"
                    style={primaryStyle}>
                    <Video size={14} /> Join video call
                  </a>
                )}
                <a href={calUrl} target="_blank" rel="noreferrer"
                  data-testid="add-to-calendar"
                  className="border border-line rounded-xl py-2 text-button font-medium font-display flex items-center justify-center gap-1.5 hover:bg-surfacehover transition-colors duration-150">
                  <CalendarPlus size={14} /> Add to calendar
                </a>
                {confirmed.manage_token && (
                  <Link to={`/book/manage/${confirmed.manage_token}`} data-testid="manage-link"
                    className="text-caption text-ink-muted hover:text-ink underline underline-offset-2 pt-1">
                    Need a different time? Reschedule or cancel
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const et = data.event_type;
  const hasMultipleDurations = et.duration_options?.length > 0;

  return (
    <div className="min-h-screen bg-bone" style={{ backgroundColor: branding.page_title ? undefined : undefined }}>
      <div className="max-w-5xl mx-auto p-4 sm:p-6 min-h-screen flex items-center justify-center">
        <div className="w-full bg-white border border-line rounded-3xl overflow-hidden shadow-sm flex flex-col md:flex-row">
          {/* Left column — event info */}
          <div className="md:w-80 p-6 sm:p-8 bg-neutral-50 border-b md:border-b-0 md:border-r border-line">
            {branding.logo_url && (
              <img src={branding.logo_url} alt="" className="h-8 mb-6 object-contain" />
            )}
            <div className="ui-label mb-1">{data.workspace_name}</div>
            <h1 className="text-section font-display font-semibold mb-2">{et.name}</h1>
            {et.description && <p className="text-body text-ink-tertiary mb-4">{et.description}</p>}
            <div className="space-y-2 text-body text-ink-tertiary">
              <div className="flex items-center gap-2">
                <Clock size={14} className="shrink-0 text-ink-muted" />
                <span>{hasMultipleDurations ? `${Math.min(...et.duration_options.map(d => d.minutes))}–${Math.max(...et.duration_options.map(d => d.minutes))} min` : `${et.duration_minutes} min`}</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin size={14} className="shrink-0 text-ink-muted" />
                <span className="capitalize">{et.location_type === "video" ? "Video call (Google Meet)" : et.location_type === "phone" ? "Phone call" : "In person"}</span>
              </div>
            </div>
            {branding.custom_message && (
              <p className="text-body text-ink-secondary mt-6 italic border-t border-line pt-4">{branding.custom_message}</p>
            )}
          </div>

          {/* Right column — booking flow */}
          <div className="flex-1 p-6 sm:p-8">
            {step === "slot" && (
              <div>
                <h2 className="text-subheading font-display font-semibold mb-4">Select a time</h2>

                {hasMultipleDurations && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {et.duration_options.map((opt) => (
                      <button key={opt.minutes} onClick={() => setSelectedDuration(opt.minutes)}
                        className={`px-3 py-1.5 text-body rounded-lg border transition-all ${selectedDuration === opt.minutes ? 'border-ink bg-ink text-white' : 'border-line hover:border-neutral-400'}`}>
                        {opt.label || `${opt.minutes} min`}
                      </button>
                    ))}
                  </div>
                )}

                <SlotPicker slots={data.open_slots} onPick={(slot) => { setSelectedSlot(slot); setStep("form"); }} />
              </div>
            )}

            {step === "form" && selectedSlot && (
              <div>
                <button onClick={() => setStep("slot")} className="flex items-center gap-1 text-caption text-ink-muted hover:text-ink mb-4">
                  <ChevronLeft size={12} /> Back to time selection
                </button>

                <div className="flex items-center gap-2 mb-5 p-3 bg-neutral-50 rounded-xl border border-line text-body">
                  <CalendarClock size={14} className="shrink-0 text-ink-muted" />
                  <span className="font-medium">
                    {new Date(selectedSlot).toLocaleString(undefined, {
                      weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                    })}
                  </span>
                  {selectedDuration && (
                    <span className="text-ink-muted">· {selectedDuration} min</span>
                  )}
                </div>

                <form onSubmit={submit} className="space-y-3">
                  <input required placeholder="Your name" value={form.guest_name}
                    onChange={(e) => setForm({ ...form, guest_name: e.target.value })}
                    data-testid="guest-name"
                    className="w-full border border-line px-3 py-2.5 rounded-xl text-input focus:border-ink focus:outline-none transition-colors" />

                  <input required type="email" placeholder="Email address" value={form.guest_email}
                    onChange={(e) => setForm({ ...form, guest_email: e.target.value })}
                    data-testid="guest-email"
                    className="w-full border border-line px-3 py-2.5 rounded-xl text-input focus:border-ink focus:outline-none transition-colors" />

                  <input placeholder="Phone (optional)" value={form.guest_phone}
                    onChange={(e) => setForm({ ...form, guest_phone: e.target.value })}
                    data-testid="guest-phone"
                    className="w-full border border-line px-3 py-2.5 rounded-xl text-input focus:border-ink focus:outline-none transition-colors" />

                  {/* Custom form fields */}
                  {et.form_fields?.map((field) => (
                    <div key={field.key}>
                      {field.type === "textarea" ? (
                        <textarea placeholder={field.label} required={field.required}
                          value={formAnswers[field.key] || ""}
                          onChange={(e) => setFormAnswers({ ...formAnswers, [field.key]: e.target.value })}
                          className="w-full border border-line px-3 py-2.5 rounded-xl text-input focus:border-ink focus:outline-none transition-colors" rows={2} />
                      ) : field.type === "dropdown" ? (
                        <select required={field.required}
                          value={formAnswers[field.key] || ""}
                          onChange={(e) => setFormAnswers({ ...formAnswers, [field.key]: e.target.value })}
                          className="w-full border border-line px-3 py-2.5 rounded-xl text-input focus:border-ink focus:outline-none transition-colors">
                          <option value="">{field.label}</option>
                          {field.options?.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      ) : (
                        <input type={field.type === "email" ? "email" : field.type === "phone" ? "tel" : "text"}
                          placeholder={field.label} required={field.required}
                          value={formAnswers[field.key] || ""}
                          onChange={(e) => setFormAnswers({ ...formAnswers, [field.key]: e.target.value })}
                          className="w-full border border-line px-3 py-2.5 rounded-xl text-input focus:border-ink focus:outline-none transition-colors" />
                      )}
                    </div>
                  ))}

                  {/* Qualifying questions */}
                  {et.qualifying_questions?.map((q) => (
                    <div key={q.key}>
                      <label className="form-label block mb-1">{q.prompt}</label>
                      <input value={answers[q.key] || ""}
                        onChange={(e) => setAnswers({ ...answers, [q.key]: e.target.value })}
                        data-testid={`qanswer-${q.key}`}
                        className="w-full border border-line px-3 py-2.5 rounded-xl text-input focus:border-ink focus:outline-none transition-colors" />
                    </div>
                  ))}

                  <button type="submit" disabled={busy}
                    data-testid="confirm-booking-btn"
                    className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-button font-medium font-display transition-opacity hover:opacity-90 disabled:opacity-50"
                    style={primaryStyle}>
                    {busy ? "Booking…" : branding.button_text || "Confirm booking"}
                    {!busy && <ArrowRight size={14} />}
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}