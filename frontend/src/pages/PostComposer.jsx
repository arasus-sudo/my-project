import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, isCreditError } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { PenSquare, Image as ImageIcon, Table as CarouselIcon, Tags, Video } from "../icons";
import Card from "../components/composites/Card";
import Input from "../components/primitives/Input";
import Button from "../components/primitives/Button";

const PLATFORMS = [
  { id: "linkedin", label: "LinkedIn" },
  { id: "instagram", label: "Instagram" },
  { id: "youtube", label: "YouTube" },
];

const CONTENT_TYPES = [
  { id: "static", label: "Static image", icon: ImageIcon },
  { id: "carousel", label: "Carousel", icon: CarouselIcon },
  { id: "video", label: "Video", icon: Video },
];

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

export default function PostComposer() {
  const nav = useNavigate();
  const [platform, setPlatform] = useState("linkedin");
  const [contentType, setContentType] = useState("static");
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState("confident, professional");
  const [firstComment, setFirstComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [hashtagGroups, setHashtagGroups] = useState([]);

  useEffect(() => { api.get("/social-eq/hashtag-groups").then((r) => setHashtagGroups(r.data)).catch(() => {}); }, []);

  const generate = async () => {
    if (!topic.trim()) { toast.error("Give it a topic first"); return; }
    setBusy(true);
    setPreview(null);
    try {
      const { data } = await api.post("/social-eq/posts/generate", {
        platform, topic, tone, content_type: contentType,
        first_comment: firstComment.trim() || null,
      });
      setPreview(data);
      toast.success("Draft generated");
    } catch (err) { if (!isCreditError(err)) toast.error(err?.response?.data?.detail || "Generation failed"); }
    finally { setBusy(false); }
  };

  const applyHashtagGroup = async (group) => {
    if (!preview) return;
    const merged = Array.from(new Set([...(preview.hashtags || []), ...group.hashtags]));
    const { data } = await api.put(`/social-eq/posts/${preview.id}`, { hashtags: merged });
    setPreview(data);
    toast.success(`Added "${group.name}" hashtags`);
  };

  return (
    <div>
      <PageHeader title="Compose" subtitle="Draft a post — nothing publishes until you review and explicitly approve it in the Queue." />
      <div className="animate-fade-in px-6 sm:px-8 py-6 max-w-xl space-y-4">
        <Card>
          <div className="space-y-4">
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--text-primary)", marginBottom: 6 }}>Platform</label>
              <div className="flex flex-wrap gap-2">
                {PLATFORMS.map((p) => (
                  <TogglePill key={p.id} selected={platform === p.id} onClick={() => setPlatform(p.id)} data-testid={`platform-${p.id}`}>
                    {p.label}
                  </TogglePill>
                ))}
              </div>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--text-primary)", marginBottom: 6 }}>Content type</label>
              <div className="flex flex-wrap gap-2">
                {CONTENT_TYPES.map((c) => (
                  <TogglePill key={c.id} selected={contentType === c.id} onClick={() => setContentType(c.id)} data-testid={`content-type-${c.id}`}>
                    <c.icon size={14} strokeWidth={1.5} aria-hidden="true" /> {c.label}
                  </TogglePill>
                ))}
              </div>
              {contentType === "carousel" && (
                <p style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 6 }}>
                  Generates a cover image for the feed post, plus a full editable multi-slide deck in Create EQ you can open afterward.
                </p>
              )}
              {contentType === "video" && (
                <p style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 6 }}>
                  Generates a short AI video (Google Veo). This takes a few minutes — check the Queue for progress instead of waiting here.
                </p>
              )}
            </div>
            <Input as="textarea" rows={3} label="Topic" value={topic} onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Announcing our new AI calling agent, Voice EQ" data-testid="post-topic" />
            <Input label="Tone" value={tone} onChange={(e) => setTone(e.target.value)} data-testid="post-tone" />
            <Input label="First comment" help="Optional" value={firstComment} onChange={(e) => setFirstComment(e.target.value)}
              placeholder="Posted automatically right after this goes live — e.g. extra hashtags or a link" data-testid="post-first-comment" />
            <Button variant="primary" icon={PenSquare} onClick={generate} isLoading={busy} data-testid="generate-post-btn" className="w-full justify-center">
              {busy ? "Drafting…" : "Generate draft"}
            </Button>
          </div>
        </Card>

        {preview && (
          <Card data-testid="post-preview">
            <div className="space-y-3">
              <div style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-tertiary)" }}>Preview</div>
              {preview.video_status === "processing" && (
                <div className="text-center" style={{ border: "1px dashed var(--border-default)", borderRadius: "var(--radius-lg)", padding: 24 }}>
                  <Video size={20} strokeWidth={1.5} aria-hidden="true" className="mx-auto" style={{ color: "var(--text-tertiary)", marginBottom: 8 }} />
                  <p style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>Generating your video — this can take a few minutes. Check the Queue for progress.</p>
                </div>
              )}
              {preview.video_status === "failed" && (
                <div className="text-center" style={{ border: "1px solid var(--color-danger-border)", borderRadius: "var(--radius-lg)", padding: 16 }}>
                  <p style={{ fontSize: 12.5, color: "var(--color-danger)" }}>Video generation failed. Try again from the Queue.</p>
                </div>
              )}
              {preview.media_url && (
                <img src={`${api.defaults.baseURL}${preview.media_url}`} alt="" className="w-full object-cover"
                  style={{ borderRadius: "var(--radius-lg)", border: "1px solid var(--border-default)", maxHeight: 288 }} />
              )}
              <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>{preview.headline}</div>
              <p className="whitespace-pre-wrap" style={{ fontSize: 13, color: "var(--text-secondary)" }}>{preview.body}</p>
              {preview.hashtags?.length > 0 && (
                <div style={{ fontSize: 12.5, color: "var(--color-primary)" }}>{preview.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")}</div>
              )}
              {hashtagGroups.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5" style={{ paddingTop: 4 }}>
                  <span className="inline-flex items-center gap-1" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                    <Tags size={12} strokeWidth={1.5} aria-hidden="true" /> Add group:
                  </span>
                  {hashtagGroups.map((g) => (
                    <button key={g.id} onClick={() => applyHashtagGroup(g)} data-testid={`apply-hashtag-group-${g.id}`}
                      style={{
                        fontSize: 11, padding: "2px 8px", borderRadius: "var(--radius-full)",
                        border: "1px solid var(--border-default)", color: "var(--text-secondary)",
                      }}>
                      {g.name}
                    </button>
                  ))}
                </div>
              )}
              <Button variant="secondary" onClick={() => nav(`/app/social-eq/queue?post=${preview.id}`)} data-testid="review-in-queue-btn" className="w-full justify-center">
                Review in Queue
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
