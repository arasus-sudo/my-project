import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { ChevronLeft, ChevronRight, Plus, Upload, Image as ImageIcon, Video, Type, FileText, CalendarClock, X, Trash2, LayoutGrid } from "../icons";
import { Modal, ModalContent } from "../components/composites/Modal";
import StatusPill from "../components/primitives/StatusPill";
import Button from "../components/primitives/Button";
import Input from "../components/primitives/Input";
import { toast } from "sonner";

const STATUS_TONE = {
  draft: "neutral", scheduled: "primary", pending_approval: "warning",
  approved: "primary", publishing: "primary", published: "success",
  rejected: "danger", publish_failed: "danger",
};
const DOT_COLOR = {
  neutral: "var(--color-neutral-status)", primary: "var(--color-primary)",
  warning: "var(--color-warning)", success: "var(--color-success)", danger: "var(--color-danger)",
};

const CONTENT_TYPES = [
  { id: "text", label: "Text", icon: Type },
  { id: "article", label: "Article", icon: FileText },
  { id: "static", label: "Image", icon: ImageIcon },
  { id: "video", label: "Video", icon: Video },
  { id: "carousel", label: "Carousel", icon: LayoutGrid },
];
const PLATFORM_BY_TYPE = {
  text: ["linkedin"],
  article: ["linkedin"],
  static: ["linkedin", "instagram"],
  video: ["linkedin", "instagram", "youtube"],
  carousel: ["linkedin"],
};
const PLATFORM_LABEL = { linkedin: "LinkedIn", instagram: "Instagram", youtube: "YouTube" };

function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const startOffset = first.getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function localDateTimeInput(d) {
  const t = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return t.toISOString().slice(0, 16);
}
function nextHour() {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  return localDateTimeInput(d);
}
function dayPrefill(year, month, day) {
  const d = new Date(year, month, day, new Date().getHours() + 1, 0, 0, 0);
  return localDateTimeInput(d);
}

function TogglePill({ selected, onClick, children, ...rest }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1.5" style={{
      height: 32, padding: "0 12px", borderRadius: "var(--radius-md)",
      border: `1px solid ${selected ? "var(--color-primary)" : "var(--border-default)"}`,
      background: selected ? "var(--color-primary)" : "var(--bg-surface)",
      color: selected ? "#fff" : "var(--text-primary)",
      fontSize: 13, fontWeight: 500, fontFamily: "var(--font-ui)",
      transition: "background 150ms, border-color 150ms",
    }} {...rest}>
      {children}
    </button>
  );
}

function ComposeForm({ prefillDate, onCreated, onCancel }) {
  const [contentType, setContentType] = useState("static");
  const [platforms, setPlatforms] = useState(PLATFORM_BY_TYPE.static);
  const [headline, setHeadline] = useState("");
  const [body, setBody] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [firstComment, setFirstComment] = useState("");
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [scheduledFor, setScheduledFor] = useState(prefillDate || nextHour());
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const pickType = (t) => {
    setContentType(t);
    setPlatforms((prev) => {
      const kept = prev.filter((p) => PLATFORM_BY_TYPE[t].includes(p));
      return kept.length ? kept : [PLATFORM_BY_TYPE[t][0]];
    });
    if (t === "text" || t === "article") { setFile(null); setPreviewUrl(null); }
  };

  const togglePlatform = (p) =>
    setPlatforms((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);

  const pickFile = (e) => {
    const f = e.target.files && e.target.files[0];
    setFile(f || null);
    setPreviewUrl(f ? URL.createObjectURL(f) : null);
    e.target.value = "";
  };

  const submit = async () => {
    if (!platforms.length) { toast.error("Choose at least one platform"); return; }
    if (!headline.trim()) { toast.error("Add a headline"); return; }
    if ((contentType === "text" || contentType === "article") && !body.trim()) { toast.error("Add the post body"); return; }
    if ((contentType === "static" || contentType === "video" || contentType === "carousel") && !file) {
      toast.error(contentType === "static" ? "Upload an image" : contentType === "video" ? "Upload a video" : "Upload a PDF");
      return;
    }
    const fd = new FormData();
    fd.append("content_type", contentType);
    fd.append("platforms", platforms.join(","));
    fd.append("headline", headline.trim());
    fd.append("body", body.trim());
    if (hashtags.trim()) fd.append("hashtags", hashtags.trim());
    if (firstComment.trim()) fd.append("first_comment", firstComment.trim());
    if (scheduledFor) fd.append("scheduled_for", new Date(scheduledFor).toISOString());
    if (file) fd.append("file", file);
    setBusy(true);
    try {
      const { data } = await api.post("/social-eq/posts/manual", fd);
      toast.success(`Scheduled for ${data.created.length} platform${data.created.length > 1 ? "s" : ""} — approve it in the Queue to publish`);
      onCreated(data.created);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not schedule the post");
    } finally { setBusy(false); }
  };

  const isMedia = contentType === "static" || contentType === "video";
  const needsFile = isMedia || contentType === "carousel";

  return (
    <>
      <div className="space-y-4">
        <div>
          <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--text-primary)", marginBottom: 6 }}>Content type</label>
          <div className="flex flex-wrap gap-2">
            {CONTENT_TYPES.map((c) => (
              <TogglePill key={c.id} selected={contentType === c.id} onClick={() => pickType(c.id)} data-testid={`cal-content-type-${c.id}`}>
                <c.icon size={14} strokeWidth={1.5} aria-hidden="true" /> {c.label}
              </TogglePill>
            ))}
          </div>
        </div>
        <div>
          <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--text-primary)", marginBottom: 6 }}>Platforms</label>
          <div className="flex flex-wrap gap-2">
            {PLATFORM_BY_TYPE[contentType].map((p) => (
              <TogglePill key={p} selected={platforms.includes(p)} onClick={() => togglePlatform(p)} data-testid={`cal-platform-${p}`}>
                {PLATFORM_LABEL[p]}
              </TogglePill>
            ))}
          </div>
          <p style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 6 }}>
            {contentType === "text" || contentType === "article"
              ? "Text and articles are LinkedIn-only. Instagram requires a media file; YouTube has no text/community-post endpoint."
              : contentType === "static"
                ? "Images go to LinkedIn and Instagram."
                : contentType === "carousel"
                  ? "Upload the carousel as a multi-page PDF — LinkedIn-only."
                  : "Videos go to LinkedIn, Instagram and YouTube."}
          </p>
        </div>
        <Input label="Headline" value={headline} onChange={(e) => setHeadline(e.target.value)}
          placeholder="Shown on the calendar and in the queue" data-testid="cal-headline" />
        <Input as="textarea" rows={contentType === "article" ? 8 : 4}
          label={contentType === "article" ? "Article body" : needsFile ? "Caption" : "Post body"}
          help={needsFile ? "Optional — the caption that publishes with the media" : "The post itself — write it here"}
          value={body} onChange={(e) => setBody(e.target.value)}
          placeholder={contentType === "article" ? "Write the full article…" : needsFile ? "Caption for the media…" : "Write the post…"}
          data-testid="cal-body" />
        <Input label="Hashtags" optional value={hashtags} onChange={(e) => setHashtags(e.target.value)}
          placeholder="comma, separated, no # needed" data-testid="cal-hashtags" />
        <Input label="First comment" optional value={firstComment} onChange={(e) => setFirstComment(e.target.value)}
          placeholder="Posted under the post after publishing" data-testid="cal-first-comment" />
        {needsFile && (
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--text-primary)", marginBottom: 6 }}>
              {contentType === "static" ? "Image" : contentType === "video" ? "Video" : "Carousel PDF"} file
            </label>
            <div onClick={() => fileRef.current?.click()} data-testid="cal-media-dropzone"
              className="cursor-pointer"
              style={{ border: "1px dashed var(--border-default)", borderRadius: "var(--radius-lg)", padding: 16, textAlign: "center" }}>
              {previewUrl ? (
                contentType === "video"
                  ? <video src={previewUrl} controls className="w-full" style={{ borderRadius: "var(--radius-md)", maxHeight: 200 }} />
                  : contentType === "carousel"
                    ? (
                      <embed src={previewUrl} type="application/pdf" className="w-full" style={{ borderRadius: "var(--radius-md)", maxHeight: 200 }} />
                    )
                    : <img src={previewUrl} alt="" className="w-full object-cover" style={{ borderRadius: "var(--radius-md)", maxHeight: 200 }} />
              ) : (
                <div className="flex flex-col items-center gap-1" style={{ color: "var(--text-tertiary)" }}>
                  <Upload size={20} strokeWidth={1.5} aria-hidden="true" />
                  <p style={{ fontSize: 12.5 }}>Click to upload {contentType === "static" ? "an image" : contentType === "video" ? "a video" : "a PDF"}</p>
                  <p style={{ fontSize: 11 }}>
                    {contentType === "static" ? "PNG, JPG, WEBP or GIF"
                      : contentType === "video" ? "MP4, MOV, WEBM or M4V — up to 100MB"
                        : "Multi-page PDF — up to 100MB"}
                  </p>
                </div>
              )}
            </div>
            {file && (
              <button type="button" onClick={() => { setFile(null); setPreviewUrl(null); }} data-testid="cal-media-remove"
                className="inline-flex items-center gap-1" style={{ marginTop: 8, fontSize: 12, color: "var(--text-tertiary)" }}>
                <X size={12} strokeWidth={1.5} aria-hidden="true" /> Remove {file.name}
              </button>
            )}
            <input ref={fileRef} type="file" hidden
              accept={contentType === "static" ? "image/*" : contentType === "video" ? "video/*" : "application/pdf"}
              onChange={pickFile} data-testid="cal-media-file" />
          </div>
        )}
        <Input type="datetime-local" label="Schedule for" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)}
          leadingIcon={CalendarClock} data-testid="cal-schedule-input" />
        <p style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
          Scheduled posts publish automatically once approved in the Queue.
        </p>
      </div>
      <div className="flex items-center justify-end gap-2" style={{ paddingTop: 16, marginTop: 16, borderTop: "1px solid var(--border-subtle)" }}>
        <Button variant="secondary" size="sm" onClick={onCancel} data-testid="cal-compose-cancel">Cancel</Button>
        <Button variant="primary" size="sm" icon={CalendarClock} onClick={submit} isLoading={busy} data-testid="cal-schedule-submit">
          {busy ? "Scheduling…" : "Schedule"}
        </Button>
      </div>
    </>
  );
}

export default function SocialCalendar() {
  const nav = useNavigate();
  const [posts, setPosts] = useState([]);
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [dayModal, setDayModal] = useState(null); // number | null
  const [composeOpen, setComposeOpen] = useState(false);
  const [composePrefill, setComposePrefill] = useState(null); // datetime-local string | null

  const load = () => api.get("/social-eq/posts").then((r) => setPosts(r.data));
  useEffect(() => { load(); }, []);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const cells = useMemo(() => monthGrid(year, month), [year, month]);

  const byDay = useMemo(() => {
    const map = {};
    for (const p of posts) {
      if (!p.scheduled_for) continue;
      const d = new Date(p.scheduled_for);
      if (d.getFullYear() !== year || d.getMonth() !== month) continue;
      const day = d.getDate();
      (map[day] = map[day] || []).push(p);
    }
    return map;
  }, [posts, year, month]);

  const shiftMonth = (delta) => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));
  const today = new Date();
  const isToday = (day) => day === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  const openCompose = () => { setComposePrefill(null); setComposeOpen(true); };
  const openComposeFor = (day) => { setComposePrefill(dayPrefill(year, month, day)); setComposeOpen(true); };

  return (
    <div>
      <PageHeader
        title="Calendar"
        subtitle="Every post plotted by its scheduled date — schedule new content straight from here."
        right={
          <div className="flex items-center gap-2">
            <Button variant="primary" size="sm" icon={Plus} onClick={openCompose} data-testid="cal-new-post">New post</Button>
            <div className="flex items-center gap-1">
              <Button variant="tertiary" iconOnly icon={ChevronLeft} onClick={() => shiftMonth(-1)} data-testid="cal-prev" aria-label="Previous month" />
              <div className="text-center" style={{ width: 128, fontSize: 14, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
                {cursor.toLocaleString(undefined, { month: "long", year: "numeric" })}
              </div>
              <Button variant="tertiary" iconOnly icon={ChevronRight} onClick={() => shiftMonth(1)} data-testid="cal-next" aria-label="Next month" />
            </div>
          </div>
        }
      />
      <div className="animate-fade-in px-6 sm:px-8 py-6">
        <div className="grid grid-cols-7 gap-px overflow-hidden" style={{ background: "var(--border-default)", borderRadius: "var(--radius-xl)", border: "1px solid var(--border-default)" }}>
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="text-center" style={{ background: "var(--bg-surface-sunken)", padding: "8px 0", fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)" }}>{d}</div>
          ))}
          {cells.map((day, i) => {
            const dayPosts = day ? byDay[day] || [] : [];
            return (
              <button key={i} disabled={!day}
                onClick={() => day && (dayPosts.length > 0 ? setDayModal(day) : openComposeFor(day))}
                data-testid={day ? `cal-day-${day}` : undefined}
                className="text-left align-top"
                style={{
                  background: day ? "var(--bg-surface)" : "var(--bg-surface-sunken)",
                  minHeight: 92, padding: 8, cursor: day ? "pointer" : "default",
                }}>
                {day && (
                  <>
                    <div className="tnum" style={isToday(day)
                      ? { color: "#fff", background: "var(--text-primary)", borderRadius: "var(--radius-full)", width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11 }
                      : { color: "var(--text-tertiary)", fontSize: 11 }}>{day}</div>
                    <div className="space-y-1" style={{ marginTop: 6 }}>
                      {dayPosts.slice(0, 3).map((p) => (
                        <div key={p.id} className="flex items-center gap-1 truncate" style={{ fontSize: 11 }}>
                          <span className="shrink-0" style={{ width: 6, height: 6, borderRadius: "var(--radius-full)", background: DOT_COLOR[STATUS_TONE[p.status]] || DOT_COLOR.neutral }} />
                          <span className="truncate" style={{ color: "var(--text-secondary)" }}>{p.headline || p.platform}</span>
                        </div>
                      ))}
                      {dayPosts.length > 3 && <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>+{dayPosts.length - 3} more</div>}
                      {dayPosts.length === 0 && (
                        <div style={{ fontSize: 11, color: "var(--text-tertiary)", opacity: 0.7 }}>+ schedule content</div>
                      )}
                    </div>
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <Modal open={!!dayModal} onOpenChange={(o) => !o && setDayModal(null)}>
        {dayModal && (
          <ModalContent size="sm"
            title={new Date(year, month, dayModal).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
            footer={
              <Button variant="secondary" size="sm" icon={Plus} onClick={() => { setDayModal(null); openComposeFor(dayModal); }} data-testid="cal-day-add-post">
                Add post
              </Button>
            }>
            <div className="space-y-2">
              {(byDay[dayModal] || []).map((p) => (
                <div key={p.id} className="flex items-center gap-2"
                  style={{ border: "1px solid var(--border-default)", borderRadius: "var(--radius-lg)", padding: 12 }}>
                  <button onClick={() => nav(`/app/social-eq/queue?post=${p.id}`)} className="flex-1 text-left min-w-0">
                    <div className="flex items-center gap-2">
                      <span style={{ width: 8, height: 8, borderRadius: "var(--radius-full)", background: DOT_COLOR[STATUS_TONE[p.status]] || DOT_COLOR.neutral }} />
                      <span className="capitalize" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{p.platform}</span>
                      <StatusPill status={p.status} tone={STATUS_TONE[p.status]} />
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)", marginTop: 4 }}>{p.headline}</div>
                  </button>
                  {p.status !== "published" && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (!window.confirm(`Delete "${p.headline}"? This can't be undone.`)) return;
                        try {
                          await api.delete(`/social-eq/posts/${p.id}`);
                          toast.success("Post deleted");
                          load();
                        } catch (err) {
                          toast.error(err?.response?.data?.detail || "Could not delete the post");
                        }
                      }}
                      data-testid={`cal-delete-${p.id}`}
                      aria-label="Delete post"
                      className="shrink-0 flex items-center justify-center"
                      style={{ width: 28, height: 28, borderRadius: "var(--radius-md)", color: "var(--text-tertiary)" }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = "var(--color-danger)"; e.currentTarget.style.background = "var(--color-danger-subtle)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-tertiary)"; e.currentTarget.style.background = "transparent"; }}
                    >
                      <Trash2 size={14} strokeWidth={1.5} aria-hidden="true" />
                    </button>
                  )}
                </div>
              ))}
              {(byDay[dayModal] || []).length === 0 && (
                <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Nothing scheduled — add a post for this day.</p>
              )}
            </div>
          </ModalContent>
        )}
      </Modal>

      <Modal open={composeOpen} onOpenChange={(o) => !o && setComposeOpen(false)}>
        <ModalContent size="md" title="Schedule content"
          subtitle="Write or upload the post now, pick platforms and a time — it lands in the Queue for approval and publishes automatically at the scheduled time.">
          <ComposeForm prefillDate={composePrefill} onCancel={() => setComposeOpen(false)}
            onCreated={() => { setComposeOpen(false); load(); }} />
        </ModalContent>
      </Modal>
    </div>
  );
}