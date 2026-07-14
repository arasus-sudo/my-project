import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";

const PLATFORMS = [
  { id: "linkedin", label: "LinkedIn" },
  { id: "instagram", label: "Instagram" },
  { id: "youtube", label: "YouTube" },
];

export default function PostComposer() {
  const nav = useNavigate();
  const [platform, setPlatform] = useState("linkedin");
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState("confident, professional");
  const [busy, setBusy] = useState(false);

  const generate = async () => {
    if (!topic.trim()) { toast.error("Give it a topic first"); return; }
    setBusy(true);
    try {
      const { data } = await api.post("/social-eq/posts/generate", { platform, topic, tone });
      toast.success("Draft generated");
      nav(`/app/social-eq/queue?post=${data.id}`);
    } catch (err) { toast.error(err?.response?.data?.detail || "Generation failed"); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <PageHeader title="Compose" subtitle="Draft a post — nothing publishes until you review and explicitly approve it in the Queue." />
      <div className="p-6 max-w-xl">
        <div className="card-flat p-5 space-y-4">
          <div>
            <label className="ui-label block mb-1">Platform</label>
            <div className="flex gap-2">
              {PLATFORMS.map((p) => (
                <button key={p.id} type="button" onClick={() => setPlatform(p.id)} data-testid={`platform-${p.id}`}
                  className={`px-3 py-1.5 rounded-full text-sm border ${platform === p.id ? "bg-ink text-white border-ink" : "border-line hover:bg-surfacehover"}`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="ui-label block mb-1">Topic</label>
            <textarea value={topic} onChange={(e) => setTopic(e.target.value)} rows={3}
              placeholder="e.g. Announcing our new AI calling agent, Voice EQ"
              data-testid="post-topic" className="w-full border border-line px-3 py-2 rounded-sm" />
          </div>
          <div>
            <label className="ui-label block mb-1">Tone</label>
            <input value={tone} onChange={(e) => setTone(e.target.value)} data-testid="post-tone"
              className="w-full border border-line px-3 py-2 rounded-sm" />
          </div>
          <button onClick={generate} disabled={busy} data-testid="generate-post-btn" className="btn-primary w-full justify-center">
            <Sparkles size={14} /> {busy ? "Drafting…" : "Generate draft"}
          </button>
        </div>
      </div>
    </div>
  );
}
