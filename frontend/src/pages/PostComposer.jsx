import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, isCreditError } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { PenSquare, Image as ImageIcon, Layers, Tags } from "lucide-react";

const PLATFORMS = [
  { id: "linkedin", label: "LinkedIn" },
  { id: "instagram", label: "Instagram" },
  { id: "youtube", label: "YouTube" },
];

const CONTENT_TYPES = [
  { id: "static", label: "Static image", icon: ImageIcon },
  { id: "carousel", label: "Carousel", icon: Layers },
];

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
      <div className="animate-fade-in px-6 sm:px-8 max-w-xl space-y-4">
        <div className="shadow-card p-6 sm:p-8 space-y-4 rounded-2xl">
          <div>
            <label className="form-label block mb-1">Platform</label>
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map((p) => (
                <button key={p.id} type="button" onClick={() => setPlatform(p.id)} data-testid={`platform-${p.id}`}
                  className={`px-3 py-1.5 rounded-xl text-body border transition-colors duration-150 ${platform === p.id ? "bg-accent text-white border-transparent" : "border-line hover:bg-surfacehover"}`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="form-label block mb-1">Content type</label>
            <div className="flex flex-wrap gap-2">
              {CONTENT_TYPES.map((c) => (
                <button key={c.id} type="button" onClick={() => setContentType(c.id)} data-testid={`content-type-${c.id}`}
                  className={`px-3 py-1.5 rounded-xl text-body border inline-flex items-center gap-1.5 transition-colors duration-150 ${contentType === c.id ? "bg-accent text-white border-transparent" : "border-line hover:bg-surfacehover"}`}>
                  <c.icon size={14} /> {c.label}
                </button>
              ))}
            </div>
            {contentType === "carousel" && (
              <p className="text-tiny text-ink-muted mt-1.5">
                Generates a cover image for the feed post, plus a full editable multi-slide deck in Create EQ you can open afterward.
              </p>
            )}
          </div>
          <div>
            <label className="form-label block mb-1">Topic</label>
            <textarea value={topic} onChange={(e) => setTopic(e.target.value)} rows={3}
              placeholder="e.g. Announcing our new AI calling agent, Voice EQ"
              data-testid="post-topic" className="w-full border border-line px-3 py-2 rounded-sm text-input" />
          </div>
          <div>
            <label className="form-label block mb-1">Tone</label>
            <input value={tone} onChange={(e) => setTone(e.target.value)} data-testid="post-tone"
              className="w-full border border-line px-3 py-2 rounded-sm text-input" />
          </div>
          <div>
            <label className="form-label block mb-1">First comment <span className="text-ink-muted">(optional)</span></label>
            <input value={firstComment} onChange={(e) => setFirstComment(e.target.value)} data-testid="post-first-comment"
              placeholder="Posted automatically right after this goes live — e.g. extra hashtags or a link"
              className="w-full border border-line px-3 py-2 rounded-sm text-input" />
          </div>
          <button onClick={generate} disabled={busy} data-testid="generate-post-btn" className="btn-primary w-full justify-center">
            <PenSquare size={14} /> {busy ? "Drafting…" : "Generate draft"}
          </button>
        </div>

        {preview && (
          <div className="shadow-card p-5 rounded-2xl space-y-3" data-testid="post-preview">
            <div className="ui-label">Preview</div>
            {preview.media_url && (
              <img src={`${api.defaults.baseURL}${preview.media_url}`} alt="" className="w-full rounded-xl border border-line object-cover max-h-72" />
            )}
            <div className="text-card-title font-display font-semibold">{preview.headline}</div>
            <p className="text-body text-ink-tertiary whitespace-pre-wrap">{preview.body}</p>
            {preview.hashtags?.length > 0 && (
              <div className="text-caption text-accent">{preview.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")}</div>
            )}
            {hashtagGroups.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-tiny text-ink-muted inline-flex items-center gap-1"><Tags size={12} /> Add group:</span>
                {hashtagGroups.map((g) => (
                  <button key={g.id} onClick={() => applyHashtagGroup(g)} data-testid={`apply-hashtag-group-${g.id}`}
                    className="text-tiny px-2 py-0.5 rounded-full border border-line hover:border-accent hover:bg-surfacehover transition-colors duration-150">
                    {g.name}
                  </button>
                ))}
              </div>
            )}
            <button onClick={() => nav(`/app/social-eq/queue?post=${preview.id}`)} data-testid="review-in-queue-btn" className="btn-secondary w-full justify-center">
              Review in Queue
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
