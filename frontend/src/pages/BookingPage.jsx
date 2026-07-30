import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import { toast } from "sonner";
import { Calendar, Clock, MapPin, CheckCircle, Loader2 } from "lucide-react";

export default function BookingPage() {
  const { workspaceId, eventTypeSlug } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [selectedSlot, setSelectedSlot] = useState("");
  const [form, setForm] = useState({ guest_name: "", guest_email: "", guest_phone: "" });
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(null);

  useEffect(() => {
    api.get(`/book/${workspaceId}/${eventTypeSlug}`).then((r) => {
      setData(r.data);
    }).catch((err) => {
      const detail = err?.response?.data?.detail || err.message || "";
      setError(detail || "Booking page not found");
    });
  }, [workspaceId, eventTypeSlug]);

  if (error) {
    return (
      <div className="min-h-screen bg-bone flex items-center justify-center p-4">
        <div className="shadow-card rounded-lg bg-white max-w-md w-full p-6 text-center">
          <Calendar size={32} className="mx-auto mb-3 text-ink-muted opacity-40" />
          <h1 className="text-heading font-medium mb-1">This booking page isn't available</h1>
          <p className="text-body text-ink-muted mb-4">The link may be invalid or the event type has been removed.</p>
          {error && <p className="text-tiny font-mono text-ink-muted bg-ash rounded p-2 text-left">API: /book/{workspaceId}/{eventTypeSlug}<br />Detail: {error}</p>}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-bone flex items-center justify-center p-4">
        <Loader2 size={20} className="animate-spin text-ink-muted" />
      </div>
    );
  }

  const et = data.event_type;
  const brand = et.branding || {};
  const accentColor = brand.primary_color || "#3B82F6";
  const formFields = et.form_fields || [];

  const groupSlotsByDate = (slots) => {
    const groups = {};
    slots.forEach((s) => {
      const d = new Date(s);
      const key = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
      if (!groups[key]) groups[key] = [];
      groups[key].push(s);
    });
    return groups;
  };

  const handleBook = async (e) => {
    e.preventDefault();
    if (!selectedSlot) { toast.error("Select a time slot"); return; }
    setSaving(true);
    try {
      const { data: result } = await api.post(`/book/${workspaceId}/${eventTypeSlug}`, {
        guest_name: form.guest_name,
        guest_email: form.guest_email,
        guest_phone: form.guest_phone || undefined,
        start_at: selectedSlot,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      setDone(result);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Booking failed");
    }
    setSaving(false);
  };

  if (done) {
    const start = new Date(done.start_at);
    return (
      <div className="min-h-screen bg-bone flex items-center justify-center p-4">
        <div className="shadow-card rounded-lg bg-white max-w-md w-full p-6 text-center">
          <CheckCircle size={40} className="mx-auto mb-3 text-success" />
          <h1 className="text-heading font-medium mb-1">You're booked</h1>
          <p className="text-body text-ink-muted mb-4">{brand.confirmation_message || "A confirmation email is on its way."}</p>
          <div className="bg-bone rounded p-3 space-y-1 text-left mb-4">
            <p className="text-body font-medium">{et.name}</p>
            <p className="text-tiny text-ink-muted flex items-center gap-1"><Calendar size={12} /> {start.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</p>
            <p className="text-tiny text-ink-muted flex items-center gap-1"><Clock size={12} /> {start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })} ({et.duration_minutes} min)</p>
            {et.location_type === "video" && done.meet_link && (
              <p className="text-tiny flex items-center gap-1"><MapPin size={12} /> <a href={done.meet_link} target="_blank" rel="noopener noreferrer" className="text-accent underline">{done.meet_link}</a></p>
            )}
          </div>
        </div>
      </div>
    );
  }

  const grouped = groupSlotsByDate(data.open_slots || []);

  return (
    <div className="min-h-screen bg-bone flex items-start justify-center p-4 py-8">
      <div className="shadow-card rounded-lg bg-white max-w-2xl w-full overflow-hidden">
        <div className="p-5 border-b border-line flex items-center gap-4">
          {brand.logo_url && <img src={brand.logo_url} alt="" className="w-10 h-10 rounded-full object-cover" />}
          <div>
            <h1 className="text-heading font-medium">{data.workspace_name || "Schedule a meeting"}</h1>
            <p className="text-body text-ink-muted mt-0.5">{et.name} · {et.duration_minutes} min</p>
          </div>
        </div>
        {et.description && (
          <div className="px-5 py-3 border-b border-line text-body text-ink-secondary">{et.description}</div>
        )}
        <div className="p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h2 className="text-[11px] font-mono text-ink-muted uppercase tracking-wider mb-3">Select a time</h2>
              {data.open_slots?.length === 0 ? (
                <p className="text-body text-ink-muted">No available slots in the coming days.</p>
              ) : (
                <div className="space-y-3 max-h-[400px] overflow-y-auto">
                  {Object.entries(grouped).map(([date, slots]) => (
                    <div key={date}>
                      <p className="text-[10.5px] font-mono text-ink-muted mb-1.5">{date}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {slots.map((s) => {
                          const t = new Date(s);
                          const timeStr = t.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
                          return (
                            <button key={s} onClick={() => setSelectedSlot(s)}
                              className={`px-2.5 py-1.5 rounded text-[11px] font-mono border transition-colors ${selectedSlot === s ? "text-white" : "border-line hover:border-accent"}`}
                              style={selectedSlot === s ? { backgroundColor: accentColor, borderColor: accentColor } : {}}>
                              {timeStr}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <h2 className="text-[11px] font-mono text-ink-muted uppercase tracking-wider mb-3">Your details</h2>
              <form onSubmit={handleBook} className="space-y-3">
                <div>
                  <label className="text-[10.5px] font-mono text-ink-muted block mb-0.5">Name *</label>
                  <input value={form.guest_name} onChange={(e) => setForm((p) => ({ ...p, guest_name: e.target.value }))}
                    required className="inp text-tiny w-full" placeholder="Your name" />
                </div>
                <div>
                  <label className="text-[10.5px] font-mono text-ink-muted block mb-0.5">Email *</label>
                  <input type="email" value={form.guest_email} onChange={(e) => setForm((p) => ({ ...p, guest_email: e.target.value }))}
                    required className="inp text-tiny w-full" placeholder="you@example.com" />
                </div>
                <div>
                  <label className="text-[10.5px] font-mono text-ink-muted block mb-0.5">Phone</label>
                  <input value={form.guest_phone} onChange={(e) => setForm((p) => ({ ...p, guest_phone: e.target.value }))}
                    className="inp text-tiny w-full" placeholder="+1 (123) 456-7890" />
                </div>
                {formFields.map((f) => (
                  <div key={f.key}>
                    <label className="text-[10.5px] font-mono text-ink-muted block mb-0.5">{f.label}{f.required ? " *" : ""}</label>
                    {f.type === "textarea" ? (
                      <textarea onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                        className="inp text-tiny w-full" rows={2} placeholder={f.label} />
                    ) : f.type === "dropdown" ? (
                      <select onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))} className="inp text-tiny w-full">
                        <option value="">Select...</option>
                        {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input type={f.type === "phone" ? "tel" : "text"} onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                        className="inp text-tiny w-full" placeholder={f.label} />
                    )}
                  </div>
                ))}
                <button type="submit" disabled={saving || !selectedSlot}
                  className="w-full py-2.5 rounded text-body font-medium text-white disabled:opacity-40 transition-colors"
                  style={{ backgroundColor: accentColor }}>
                  {saving ? <><Loader2 size={12} className="animate-spin inline" /> Booking…</> : brand.button_text || "Confirm booking"}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
