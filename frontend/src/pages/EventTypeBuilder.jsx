import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Save, Plus, Trash2, Palette, Link2, Clock, Mail, MessageSquare, ToggleLeft } from "lucide-react";

const emptyEventType = () => ({
  name: "30 Min Intro Call", duration_minutes: 30, description: "",
  location_type: "video", buffer_before_minutes: 0, buffer_after_minutes: 10,
  daily_limit: 0, min_notice_hours: 2, date_range_days: 21,
  qualifying_questions: [], low_score_threshold: 0, low_score_redirect_url: "",
  branding: { primary_color: "#141414", logo_url: "", page_title: "", custom_message: "", confirmation_message: "", button_text: "Confirm booking", hide_calendar_photo: false, custom_domain: "", favicon_url: "" },
  reminder_config: { enabled: true, minutes_before: [1440] },
  form_fields: [],
  duration_options: [],
  webhook_url: "",
  allow_rescheduling: true, allow_cancellation: true,
  send_confirmation_email: true, send_reminder_email: true,
});

export default function EventTypeBuilder() {
  const { id } = useParams();
  const nav = useNavigate();
  const [et, setEt] = useState(emptyEventType());
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("general");

  useEffect(() => {
    if (!id || id === "new") return;
    api.get("/schedule-eq/event-types").then((r) => {
      const found = r.data.find((x) => x.id === id);
      if (found) setEt(found);
    });
  }, [id]);

  const patch = (key, val) => setEt({ ...et, [key]: val });
  const patchBranding = (key, val) => setEt({ ...et, branding: { ...et.branding, [key]: val } });
  const patchReminder = (key, val) => setEt({ ...et, reminder_config: { ...et.reminder_config, [key]: val } });

  const tabs = [
    { key: "general", label: "General" },
    { key: "branding", label: "Branding" },
    { key: "questions", label: "Questions" },
    { key: "notifications", label: "Notifications" },
  ];

  const save = async () => {
    setBusy(true);
    try {
      const payload = {
        ...et,
        low_score_redirect_url: et.low_score_redirect_url || null,
        webhook_url: et.webhook_url || null,
      };
      if (id && id !== "new") {
        await api.put(`/schedule-eq/event-types/${id}`, payload);
        toast.success("Saved");
      } else {
        const { data } = await api.post("/schedule-eq/event-types", payload);
        const { data: me } = await api.get("/auth/me");
        const wsId = me.workspace?.id || data.workspace_id;
        const link = `${window.location.origin}/book/${wsId}/${data.slug}`;
        navigator.clipboard.writeText(link);
        toast.success("Event type created — booking link copied to clipboard");
        nav(`/app/schedule-eq/event-types`, { replace: true });
      }
    } catch (err) { toast.error(err?.response?.data?.detail || "Save failed"); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <PageHeader
        title={id && id !== "new" ? et.name : "New event type"}
        subtitle="Duration, location, branding, reminders, and custom fields."
        right={<button onClick={save} disabled={busy} data-testid="save-event-type-btn" className="btn-primary"><Save size={14} /> Save</button>}
      />
      <div className="animate-fade-in px-6 sm:px-8">
        {/* Tabs */}
        <div className="flex gap-1 border-b border-line mb-6">
          {tabs.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-body font-medium font-display border-b-2 transition-colors ${tab === t.key ? 'border-ink text-ink' : 'border-transparent text-ink-muted hover:text-ink'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab: General */}
        {tab === "general" && (
          <div className="max-w-2xl space-y-6">
            <div className="shadow-card rounded-2xl p-6 sm:p-8 space-y-4">
              <h3 className="text-card-title font-display font-semibold">Event details</h3>
              <div>
                <label className="form-label block mb-1">Name</label>
                <input value={et.name} onChange={(e) => patch("name", e.target.value)}
                  data-testid="et-name" className="w-full border border-line px-3 py-2 rounded-sm text-input" />
              </div>
              <div>
                <label className="form-label block mb-1">Description</label>
                <textarea value={et.description} onChange={(e) => patch("description", e.target.value)}
                  data-testid="et-description" rows={2} className="w-full border border-line px-3 py-2 rounded-sm text-input" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="form-label block mb-1">Default duration (min)</label>
                  <input type="number" value={et.duration_minutes} onChange={(e) => patch("duration_minutes", Number(e.target.value) || 15)}
                    data-testid="et-duration" className="w-full border border-line px-3 py-2 rounded-sm text-input" />
                </div>
                <div>
                  <label className="form-label block mb-1">Location</label>
                  <select value={et.location_type} onChange={(e) => patch("location_type", e.target.value)}
                    data-testid="et-location" className="w-full border border-line px-3 py-2 rounded-sm text-input">
                    <option value="video">Video (Google Meet)</option>
                    <option value="phone">Phone</option>
                    <option value="in_person">In person</option>
                  </select>
                </div>
                <div>
                  <label className="form-label block mb-1">Min notice (hrs)</label>
                  <input type="number" value={et.min_notice_hours} onChange={(e) => patch("min_notice_hours", Number(e.target.value) || 0)}
                    data-testid="et-min-notice" className="w-full border border-line px-3 py-2 rounded-sm text-input" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="form-label block mb-1">Buffer before (min)</label>
                  <input type="number" value={et.buffer_before_minutes} onChange={(e) => patch("buffer_before_minutes", Number(e.target.value) || 0)}
                    data-testid="et-buffer-before" className="w-full border border-line px-3 py-2 rounded-sm text-input" />
                </div>
                <div>
                  <label className="form-label block mb-1">Buffer after (min)</label>
                  <input type="number" value={et.buffer_after_minutes} onChange={(e) => patch("buffer_after_minutes", Number(e.target.value) || 0)}
                    data-testid="et-buffer-after" className="w-full border border-line px-3 py-2 rounded-sm text-input" />
                </div>
                <div>
                  <label className="form-label block mb-1">Daily limit (0=∞)</label>
                  <input type="number" value={et.daily_limit} onChange={(e) => patch("daily_limit", Number(e.target.value) || 0)}
                    data-testid="et-daily-limit" className="w-full border border-line px-3 py-2 rounded-sm text-input" />
                </div>
              </div>
              <div>
                <label className="form-label block mb-1">Date range (days ahead)</label>
                <input type="number" value={et.date_range_days} onChange={(e) => patch("date_range_days", Number(e.target.value) || 7)}
                  className="w-full border border-line px-3 py-2 rounded-sm text-input" />
              </div>
            </div>

            {/* Duration options */}
            <div className="shadow-card rounded-2xl p-6 sm:p-8 space-y-3">
              <div className="flex items-center gap-2">
                <Clock size={14} className="text-ink" />
                <div className="text-card-title font-display font-semibold">Duration options</div>
                <span className="text-tiny text-ink-muted">Let guests pick duration</span>
              </div>
              <div className="space-y-2">
                {(et.duration_options || []).map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input placeholder="Label (e.g. Quick chat)" value={opt.label || ""}
                      onChange={(e) => { const next = [...et.duration_options]; next[i] = { ...next[i], label: e.target.value }; patch("duration_options", next); }}
                      className="flex-1 border border-line px-2 py-1.5 rounded-sm text-input" />
                    <input type="number" placeholder="Minutes" value={opt.minutes || 15}
                      onChange={(e) => { const next = [...et.duration_options]; next[i] = { ...next[i], minutes: Number(e.target.value) || 15 }; patch("duration_options", next); }}
                      className="w-20 border border-line px-2 py-1.5 rounded-sm text-input" />
                    <button onClick={() => patch("duration_options", et.duration_options.filter((_, x) => x !== i))}
                      className="text-ink-muted hover:text-danger"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
              <button onClick={() => patch("duration_options", [...(et.duration_options || []), { label: "", minutes: 30 }])}
                className="btn-ghost text-xs"><Plus size={12} /> Add duration</button>
            </div>

            {/* Guest permissions */}
            <div className="shadow-card rounded-2xl p-6 sm:p-8 space-y-3">
              <div className="text-card-title font-display font-semibold">Guest permissions</div>
              <label className="flex items-center gap-2 text-body">
                <input type="checkbox" checked={et.allow_rescheduling} onChange={(e) => patch("allow_rescheduling", e.target.checked)}
                  className="rounded border-line" />
                Allow rescheduling
              </label>
              <label className="flex items-center gap-2 text-body">
                <input type="checkbox" checked={et.allow_cancellation} onChange={(e) => patch("allow_cancellation", e.target.checked)}
                  className="rounded border-line" />
                Allow cancellation
              </label>
            </div>
          </div>
        )}

        {/* Tab: Branding */}
        {tab === "branding" && (
          <div className="max-w-2xl space-y-6">
            <div className="shadow-card rounded-2xl p-6 sm:p-8 space-y-4">
              <div className="flex items-center gap-2">
                <Palette size={14} className="text-sanguine" />
                <div className="font-display font-semibold">Booking page appearance</div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="ui-label block mb-1">Primary color</label>
                  <div className="flex gap-2 items-center">
                    <input type="color" value={et.branding?.primary_color || "#141414"}
                      onChange={(e) => patchBranding("primary_color", e.target.value)}
                      className="w-10 h-10 rounded cursor-pointer border border-line" />
                    <input value={et.branding?.primary_color || "#141414"}
                      onChange={(e) => patchBranding("primary_color", e.target.value)}
                      className="flex-1 border border-line px-3 py-2 rounded-sm text-sm font-mono" />
                  </div>
                </div>
                <div>
                  <label className="ui-label block mb-1">Button text</label>
                  <input value={et.branding?.button_text || "Confirm booking"}
                    onChange={(e) => patchBranding("button_text", e.target.value)}
                    className="w-full border border-line px-3 py-2 rounded-sm text-sm" />
                </div>
              </div>
              <div>
                <label className="ui-label block mb-1">Logo URL</label>
                <input value={et.branding?.logo_url || ""} onChange={(e) => patchBranding("logo_url", e.target.value)}
                  placeholder="https://example.com/logo.png"
                  className="w-full border border-line px-3 py-2 rounded-sm text-sm" />
              </div>
              <div>
                <label className="ui-label block mb-1">Custom message (shown below event info)</label>
                <textarea value={et.branding?.custom_message || ""} onChange={(e) => patchBranding("custom_message", e.target.value)}
                  rows={2} placeholder="e.g. We're excited to meet you!"
                  className="w-full border border-line px-3 py-2 rounded-sm text-sm" />
              </div>
              <div>
                <label className="ui-label block mb-1">Confirmation message (shown after booking)</label>
                <textarea value={et.branding?.confirmation_message || ""} onChange={(e) => patchBranding("confirmation_message", e.target.value)}
                  rows={2} placeholder="e.g. See you soon!"
                  className="w-full border border-line px-3 py-2 rounded-sm text-sm" />
              </div>
              <div>
                <label className="ui-label block mb-1">Custom domain (optional)</label>
                <input value={et.branding?.custom_domain || ""} onChange={(e) => patchBranding("custom_domain", e.target.value)}
                  placeholder="book.yourdomain.com"
                  className="w-full border border-line px-3 py-2 rounded-sm text-sm" />
              </div>
            </div>
          </div>
        )}

        {/* Tab: Questions */}
        {tab === "questions" && (
          <div className="max-w-2xl space-y-6">
            {/* Custom form fields */}
            <div className="shadow-card rounded-2xl p-6 sm:p-8 space-y-3">
              <div className="flex items-center gap-2">
                <MessageSquare size={14} className="text-sanguine" />
                <div className="font-display font-semibold">Custom form fields</div>
                <span className="text-[10px] text-neutral-400">Shown on the booking form</span>
              </div>
              <div className="space-y-2">
                {(et.form_fields || []).map((f, i) => (
                  <div key={i} className="flex flex-col sm:flex-row gap-2 items-start sm:items-center p-2 bg-neutral-50 rounded-lg">
                    <input placeholder="Field key" value={f.key}
                      onChange={(e) => { const next = [...et.form_fields]; next[i] = { ...next[i], key: e.target.value }; patch("form_fields", next); }}
                      className="w-full sm:w-24 border border-line px-2 py-1.5 rounded-sm text-sm font-mono" />
                    <input placeholder="Label" value={f.label}
                      onChange={(e) => { const next = [...et.form_fields]; next[i] = { ...next[i], label: e.target.value }; patch("form_fields", next); }}
                      className="flex-1 border border-line px-2 py-1.5 rounded-sm text-sm" />
                    <select value={f.type || "string"}
                      onChange={(e) => { const next = [...et.form_fields]; next[i] = { ...next[i], type: e.target.value }; patch("form_fields", next); }}
                      className="w-full sm:w-28 border border-line px-2 py-1.5 rounded-sm text-sm">
                      <option value="string">Text</option>
                      <option value="textarea">Long text</option>
                      <option value="phone">Phone</option>
                      <option value="email">Email</option>
                      <option value="dropdown">Dropdown</option>
                    </select>
                    <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                      <input type="checkbox" checked={f.required !== false}
                        onChange={(e) => { const next = [...et.form_fields]; next[i] = { ...next[i], required: e.target.checked }; patch("form_fields", next); }}
                        className="rounded border-line" />
                      Req
                    </label>
                    <button onClick={() => patch("form_fields", et.form_fields.filter((_, x) => x !== i))}
                      className="text-neutral-400 hover:text-danger shrink-0"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
              <button onClick={() => patch("form_fields", [...(et.form_fields || []), { key: "", label: "", type: "string", required: true, options: [] }])}
                className="btn-ghost text-xs"><Plus size={12} /> Add field</button>
            </div>

            {/* AI qualifying questions */}
            <div className="shadow-card rounded-2xl p-6 sm:p-8 space-y-3">
              <div className="font-display font-semibold">AI qualifying questions</div>
              <p className="text-xs text-neutral-400">Asked before the calendar is shown; answers are scored 0-100 and can route low-fit guests elsewhere.</p>
              <div className="space-y-2">
                {et.qualifying_questions.map((q, i) => (
                  <div key={i} className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
                    <input placeholder="key" value={q.key} onChange={(e) => { const next = [...et.qualifying_questions]; next[i] = { ...next[i], key: e.target.value }; patch("qualifying_questions", next); }}
                      data-testid={`et-qfield-key-${i}`} className="w-full sm:w-28 border border-line px-2 py-1.5 rounded-sm text-sm font-mono" />
                    <input placeholder="Question to ask" value={q.prompt} onChange={(e) => { const next = [...et.qualifying_questions]; next[i] = { ...next[i], prompt: e.target.value }; patch("qualifying_questions", next); }}
                      data-testid={`et-qfield-prompt-${i}`} className="flex-1 border border-line px-2 py-1.5 rounded-sm text-sm" />
                    <button onClick={() => patch("qualifying_questions", et.qualifying_questions.filter((_, x) => x !== i))}
                      data-testid={`et-qfield-remove-${i}`} className="text-neutral-400 hover:text-danger"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
              <button onClick={() => patch("qualifying_questions", [...et.qualifying_questions, { key: "", prompt: "", type: "string" }])}
                data-testid="et-qfield-add" className="btn-ghost text-xs"><Plus size={12} /> Add question</button>

              {et.qualifying_questions.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-line">
                  <div>
                    <label className="ui-label block mb-1">Low-score threshold (0=off)</label>
                    <input type="number" min={0} max={100} value={et.low_score_threshold}
                      onChange={(e) => patch("low_score_threshold", Number(e.target.value) || 0)}
                      data-testid="et-low-score-threshold" className="w-full border border-line px-3 py-2 rounded-sm" />
                  </div>
                  <div>
                    <label className="ui-label block mb-1">Redirect URL for low scores</label>
                    <input value={et.low_score_redirect_url || ""} onChange={(e) => patch("low_score_redirect_url", e.target.value)}
                      data-testid="et-low-score-redirect" placeholder="https://…" className="w-full border border-line px-3 py-2 rounded-sm" />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab: Notifications */}
        {tab === "notifications" && (
          <div className="max-w-2xl space-y-6">
            <div className="shadow-card rounded-2xl p-6 sm:p-8 space-y-4">
              <div className="flex items-center gap-2">
                <Mail size={14} className="text-sanguine" />
                <div className="font-display font-semibold">Email notifications</div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={et.send_confirmation_email !== false}
                  onChange={(e) => patch("send_confirmation_email", e.target.checked)}
                  className="rounded border-line" />
                Send confirmation email
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={et.send_reminder_email !== false}
                  onChange={(e) => patch("send_reminder_email", e.target.checked)}
                  className="rounded border-line" />
                Send reminder email
              </label>
            </div>

            <div className="shadow-card rounded-2xl p-6 sm:p-8 space-y-4">
              <div className="flex items-center gap-2">
                <Clock size={14} className="text-sanguine" />
                <div className="font-display font-semibold">Reminder timing</div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={et.reminder_config?.enabled !== false}
                  onChange={(e) => patchReminder("enabled", e.target.checked)}
                  className="rounded border-line" />
                Enable reminders
              </label>
              <div>
                <label className="ui-label block mb-1">Send reminder(s) X minutes before</label>
                <div className="space-y-2">
                  {(et.reminder_config?.minutes_before || [1440]).map((m, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input type="number" value={m}
                        onChange={(e) => { const next = [...et.reminder_config.minutes_before]; next[i] = Number(e.target.value) || 1440; patchReminder("minutes_before", next); }}
                        className="w-24 border border-line px-2 py-1.5 rounded-sm text-sm" />
                      <span className="text-xs text-neutral-400">{m >= 1440 ? `${Math.round(m/1440)} day(s)` : m >= 60 ? `${Math.round(m/60)} hour(s)` : `${m} min`}</span>
                      {et.reminder_config.minutes_before.length > 1 && (
                        <button onClick={() => patchReminder("minutes_before", et.reminder_config.minutes_before.filter((_, x) => x !== i))}
                          className="text-neutral-400 hover:text-danger"><Trash2 size={14} /></button>
                      )}
                    </div>
                  ))}
                </div>
                <button onClick={() => patchReminder("minutes_before", [...(et.reminder_config?.minutes_before || [1440]), 60])}
                  className="btn-ghost text-xs mt-1"><Plus size={12} /> Add another reminder</button>
              </div>
            </div>

            <div className="shadow-card rounded-2xl p-6 sm:p-8 space-y-4">
              <div className="flex items-center gap-2">
                <Link2 size={14} className="text-sanguine" />
                <div className="font-display font-semibold">Webhook</div>
              </div>
              <div>
                <label className="ui-label block mb-1">Webhook URL (called on booking.created / cancelled / rescheduled)</label>
                <input value={et.webhook_url || ""} onChange={(e) => patch("webhook_url", e.target.value)}
                  placeholder="https://hooks.example.com/calendar"
                  className="w-full border border-line px-3 py-2 rounded-sm text-sm" />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}