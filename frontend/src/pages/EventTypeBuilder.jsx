import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Check, Plus, Trash2, Link, Clock, Mail, MessageSquare } from "../icons";
import Card from "../components/composites/Card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/composites/Tabs";
import Button from "../components/primitives/Button";
import Input from "../components/primitives/Input";
import Select from "../components/primitives/Select";
import Checkbox from "../components/primitives/Checkbox";

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

const FIELD_TYPE_OPTIONS = [
  { value: "string", label: "Text" },
  { value: "textarea", label: "Long text" },
  { value: "phone", label: "Phone" },
  { value: "email", label: "Email" },
  { value: "dropdown", label: "Dropdown" },
];

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
        right={<Button variant="primary" icon={Check} onClick={save} isLoading={busy} data-testid="save-event-type-btn">Save</Button>}
      />

      <Tabs value={tab} onValueChange={setTab}>
        <div className="px-6 sm:px-8">
          <TabsList>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="branding">Branding</TabsTrigger>
            <TabsTrigger value="questions">Questions</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
          </TabsList>
        </div>

        <div className="animate-fade-in px-6 sm:px-8 py-6">
          {/* Tab: General */}
          <TabsContent value="general" className="max-w-2xl space-y-4">
            <Card title="Event details">
              <div className="space-y-4">
                <Input label="Name" value={et.name} onChange={(e) => patch("name", e.target.value)} data-testid="et-name" />
                <Input as="textarea" rows={2} label="Description" value={et.description} onChange={(e) => patch("description", e.target.value)} data-testid="et-description" />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Input type="number" label="Default duration (min)" value={et.duration_minutes} onChange={(e) => patch("duration_minutes", Number(e.target.value) || 15)} data-testid="et-duration" />
                  <Select label="Location" value={et.location_type} onChange={(v) => patch("location_type", v)} data-testid="et-location"
                    options={[{ value: "video", label: "Video (Google Meet)" }, { value: "phone", label: "Phone" }, { value: "in_person", label: "In person" }]} />
                  <Input type="number" label="Min notice (hrs)" value={et.min_notice_hours} onChange={(e) => patch("min_notice_hours", Number(e.target.value) || 0)} data-testid="et-min-notice" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Input type="number" label="Buffer before (min)" value={et.buffer_before_minutes} onChange={(e) => patch("buffer_before_minutes", Number(e.target.value) || 0)} data-testid="et-buffer-before" />
                  <Input type="number" label="Buffer after (min)" value={et.buffer_after_minutes} onChange={(e) => patch("buffer_after_minutes", Number(e.target.value) || 0)} data-testid="et-buffer-after" />
                  <Input type="number" label="Daily limit (0=∞)" value={et.daily_limit} onChange={(e) => patch("daily_limit", Number(e.target.value) || 0)} data-testid="et-daily-limit" />
                </div>
                <Input type="number" label="Date range (days ahead)" value={et.date_range_days} onChange={(e) => patch("date_range_days", Number(e.target.value) || 7)} />
              </div>
            </Card>

            <Card>
              <div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
                <Clock size={14} strokeWidth={1.5} aria-hidden="true" style={{ color: "var(--text-primary)" }} />
                <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>Duration options</div>
                <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Let guests pick duration</span>
              </div>
              <div className="space-y-2">
                {(et.duration_options || []).map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input size="sm" placeholder="Label (e.g. Quick chat)" value={opt.label || ""}
                      onChange={(e) => { const next = [...et.duration_options]; next[i] = { ...next[i], label: e.target.value }; patch("duration_options", next); }}
                      className="flex-1" />
                    <Input size="sm" type="number" placeholder="Minutes" value={opt.minutes || 15}
                      onChange={(e) => { const next = [...et.duration_options]; next[i] = { ...next[i], minutes: Number(e.target.value) || 15 }; patch("duration_options", next); }}
                      className="w-24" />
                    <button onClick={() => patch("duration_options", et.duration_options.filter((_, x) => x !== i))} style={{ color: "var(--text-tertiary)" }}>
                      <Trash2 size={14} strokeWidth={1.5} aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
              <Button variant="tertiary" size="sm" icon={Plus} onClick={() => patch("duration_options", [...(et.duration_options || []), { label: "", minutes: 30 }])} className="mt-2">Add duration</Button>
            </Card>

            <Card title="Guest permissions">
              <div className="space-y-2">
                <Checkbox label="Allow rescheduling" checked={et.allow_rescheduling} onChange={(e) => patch("allow_rescheduling", e.target.checked)} />
                <Checkbox label="Allow cancellation" checked={et.allow_cancellation} onChange={(e) => patch("allow_cancellation", e.target.checked)} />
              </div>
            </Card>
          </TabsContent>

          {/* Tab: Branding */}
          <TabsContent value="branding" className="max-w-2xl">
            <Card title="Booking page appearance">
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--text-primary)", marginBottom: 6 }}>Primary color</label>
                    <div className="flex gap-2 items-center">
                      <input type="color" value={et.branding?.primary_color || "#141414"} onChange={(e) => patchBranding("primary_color", e.target.value)}
                        style={{ width: 40, height: 40, borderRadius: "var(--radius-md)", border: "1px solid var(--border-default)", cursor: "pointer" }} />
                      <Input value={et.branding?.primary_color || "#141414"} onChange={(e) => patchBranding("primary_color", e.target.value)} className="flex-1" style={{ fontFamily: "var(--font-mono)" }} />
                    </div>
                  </div>
                  <Input label="Button text" value={et.branding?.button_text || "Confirm booking"} onChange={(e) => patchBranding("button_text", e.target.value)} />
                </div>
                <Input label="Logo URL" value={et.branding?.logo_url || ""} onChange={(e) => patchBranding("logo_url", e.target.value)} placeholder="https://example.com/logo.png" />
                <Input as="textarea" rows={2} label="Custom message (shown below event info)" value={et.branding?.custom_message || ""} onChange={(e) => patchBranding("custom_message", e.target.value)} placeholder="e.g. We're excited to meet you!" />
                <Input as="textarea" rows={2} label="Confirmation message (shown after booking)" value={et.branding?.confirmation_message || ""} onChange={(e) => patchBranding("confirmation_message", e.target.value)} placeholder="e.g. See you soon!" />
                <Input label="Custom domain (optional)" value={et.branding?.custom_domain || ""} onChange={(e) => patchBranding("custom_domain", e.target.value)} placeholder="book.yourdomain.com" />
              </div>
            </Card>
          </TabsContent>

          {/* Tab: Questions */}
          <TabsContent value="questions" className="max-w-2xl space-y-4">
            <Card>
              <div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
                <MessageSquare size={14} strokeWidth={1.5} aria-hidden="true" style={{ color: "var(--text-primary)" }} />
                <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>Custom form fields</div>
                <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Shown on the booking form</span>
              </div>
              <div className="space-y-2">
                {(et.form_fields || []).map((f, i) => (
                  <div key={i} className="flex flex-col sm:flex-row gap-2 items-start sm:items-center" style={{ padding: 8, background: "var(--bg-surface-sunken)", borderRadius: "var(--radius-lg)" }}>
                    <Input size="sm" placeholder="Field key" value={f.key}
                      onChange={(e) => { const next = [...et.form_fields]; next[i] = { ...next[i], key: e.target.value }; patch("form_fields", next); }}
                      className="w-full sm:w-24" style={{ fontFamily: "var(--font-mono)" }} />
                    <Input size="sm" placeholder="Label" value={f.label}
                      onChange={(e) => { const next = [...et.form_fields]; next[i] = { ...next[i], label: e.target.value }; patch("form_fields", next); }}
                      className="flex-1" />
                    <Select size="sm" value={f.type || "string"}
                      onChange={(v) => { const next = [...et.form_fields]; next[i] = { ...next[i], type: v }; patch("form_fields", next); }}
                      options={FIELD_TYPE_OPTIONS} className="w-full sm:w-32" />
                    <Checkbox label="Req" checked={f.required !== false}
                      onChange={(e) => { const next = [...et.form_fields]; next[i] = { ...next[i], required: e.target.checked }; patch("form_fields", next); }} />
                    <button onClick={() => patch("form_fields", et.form_fields.filter((_, x) => x !== i))} className="shrink-0" style={{ color: "var(--text-tertiary)" }}>
                      <Trash2 size={14} strokeWidth={1.5} aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
              <Button variant="tertiary" size="sm" icon={Plus} onClick={() => patch("form_fields", [...(et.form_fields || []), { key: "", label: "", type: "string", required: true, options: [] }])} className="mt-2">Add field</Button>
            </Card>

            <Card title="Qualifying questions">
              <p style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginBottom: 12 }}>Asked before the calendar is shown; answers are scored 0-100 and can route low-fit guests elsewhere.</p>
              <div className="space-y-2">
                {et.qualifying_questions.map((q, i) => (
                  <div key={i} className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
                    <Input size="sm" placeholder="key" value={q.key} onChange={(e) => { const next = [...et.qualifying_questions]; next[i] = { ...next[i], key: e.target.value }; patch("qualifying_questions", next); }}
                      data-testid={`et-qfield-key-${i}`} className="w-full sm:w-28" style={{ fontFamily: "var(--font-mono)" }} />
                    <Input size="sm" placeholder="Question to ask" value={q.prompt} onChange={(e) => { const next = [...et.qualifying_questions]; next[i] = { ...next[i], prompt: e.target.value }; patch("qualifying_questions", next); }}
                      data-testid={`et-qfield-prompt-${i}`} className="flex-1" />
                    <button onClick={() => patch("qualifying_questions", et.qualifying_questions.filter((_, x) => x !== i))}
                      data-testid={`et-qfield-remove-${i}`} style={{ color: "var(--text-tertiary)" }}>
                      <Trash2 size={14} strokeWidth={1.5} aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
              <Button variant="tertiary" size="sm" icon={Plus} onClick={() => patch("qualifying_questions", [...et.qualifying_questions, { key: "", prompt: "", type: "string" }])}
                data-testid="et-qfield-add" className="mt-2">Add question</Button>

              {et.qualifying_questions.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border-subtle)" }}>
                  <Input type="number" min={0} max={100} label="Low-score threshold (0=off)" value={et.low_score_threshold}
                    onChange={(e) => patch("low_score_threshold", Number(e.target.value) || 0)} data-testid="et-low-score-threshold" />
                  <Input label="Redirect URL for low scores" value={et.low_score_redirect_url || ""} onChange={(e) => patch("low_score_redirect_url", e.target.value)}
                    data-testid="et-low-score-redirect" placeholder="https://…" />
                </div>
              )}
            </Card>
          </TabsContent>

          {/* Tab: Notifications */}
          <TabsContent value="notifications" className="max-w-2xl space-y-4">
            <Card>
              <div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
                <Mail size={14} strokeWidth={1.5} aria-hidden="true" style={{ color: "var(--text-primary)" }} />
                <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>Email notifications</div>
              </div>
              <div className="space-y-2">
                <Checkbox label="Send confirmation email" checked={et.send_confirmation_email !== false} onChange={(e) => patch("send_confirmation_email", e.target.checked)} />
                <Checkbox label="Send reminder email" checked={et.send_reminder_email !== false} onChange={(e) => patch("send_reminder_email", e.target.checked)} />
              </div>
            </Card>

            <Card>
              <div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
                <Clock size={14} strokeWidth={1.5} aria-hidden="true" style={{ color: "var(--text-primary)" }} />
                <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>Reminder timing</div>
              </div>
              <Checkbox label="Enable reminders" checked={et.reminder_config?.enabled !== false} onChange={(e) => patchReminder("enabled", e.target.checked)} />
              <div style={{ marginTop: 12 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--text-primary)", marginBottom: 6 }}>Send reminder(s) X minutes before</label>
                <div className="space-y-2">
                  {(et.reminder_config?.minutes_before || [1440]).map((m, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input size="sm" type="number" value={m}
                        onChange={(e) => { const next = [...et.reminder_config.minutes_before]; next[i] = Number(e.target.value) || 1440; patchReminder("minutes_before", next); }}
                        className="w-24" />
                      <span style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>{m >= 1440 ? `${Math.round(m / 1440)} day(s)` : m >= 60 ? `${Math.round(m / 60)} hour(s)` : `${m} min`}</span>
                      {et.reminder_config.minutes_before.length > 1 && (
                        <button onClick={() => patchReminder("minutes_before", et.reminder_config.minutes_before.filter((_, x) => x !== i))} style={{ color: "var(--text-tertiary)" }}>
                          <Trash2 size={14} strokeWidth={1.5} aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <Button variant="tertiary" size="sm" icon={Plus} onClick={() => patchReminder("minutes_before", [...(et.reminder_config?.minutes_before || [1440]), 60])} className="mt-2">Add another reminder</Button>
              </div>
            </Card>

            <Card>
              <div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
                <Link size={14} strokeWidth={1.5} aria-hidden="true" style={{ color: "var(--text-primary)" }} />
                <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>Webhook</div>
              </div>
              <Input label="Webhook URL (called on booking.created / cancelled / rescheduled)" value={et.webhook_url || ""} onChange={(e) => patch("webhook_url", e.target.value)}
                placeholder="https://hooks.example.com/calendar" />
            </Card>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
