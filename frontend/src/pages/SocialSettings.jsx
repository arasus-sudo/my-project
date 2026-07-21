import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Link2, Unlink, Linkedin, Instagram, Youtube, AlertTriangle, Plus, Trash2, Rss, Tags } from "lucide-react";

const PLATFORM_META = {
  linkedin: { label: "LinkedIn", icon: Linkedin },
  instagram: { label: "Instagram", icon: Instagram },
  youtube: { label: "YouTube", icon: Youtube },
};

export default function SocialSettings() {
  const [params] = useSearchParams();
  const [integrations, setIntegrations] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => api.get("/social-eq/integrations").then((r) => { setIntegrations(r.data); setLoading(false); });
  useEffect(() => {
    load();
    if (params.get("connected")) toast.success(`${PLATFORM_META[params.get("connected")]?.label || "Platform"} connected`);
    if (params.get("error")) toast.error("Could not connect — the authorisation was cancelled or failed");
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  const connect = async (provider) => {
    const { data } = await api.post(`/social-eq/integrations/${provider}/connect`);
    if (data.url) { window.location.href = data.url; return; }
    toast.success(`${PLATFORM_META[provider].label} connected (test mode)`);
    load();
  };
  const disconnect = async (provider) => {
    await api.post(`/social-eq/integrations/${provider}/disconnect`);
    toast.success("Disconnected");
    load();
  };

  if (loading) return <div className="animate-fade-in p-6 sm:p-8 text-ink-muted text-body">Loading…</div>;

  return (
    <div>
      <PageHeader title="Social EQ Settings" subtitle="Connect the platforms you publish to. Posts run in test mode until a platform is connected with real credentials." />
      <div className="animate-fade-in px-6 sm:px-8 max-w-2xl space-y-4">
        {integrations.map((i) => {
          const meta = PLATFORM_META[i.provider];
          const Icon = meta.icon;
          return (
            <div key={i.provider} className="shadow-card p-6 sm:p-8 rounded-2xl">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Icon size={20} />
                  <div>
                    <div className="text-card-title font-display font-semibold flex items-center gap-2">
                      {meta.label}
                      <span className={`ui-label px-1.5 py-0.5 rounded-full border ${i.mocked ? "text-ink-muted border-line" : "text-success border-success/30 bg-success/10"}`}>
                        {i.mocked ? "test mode" : "live"}
                      </span>
                    </div>
                    <p className="text-caption text-ink-muted mt-0.5">
                      {i.connected
                        ? `Connected as ${i.account_name}. ${i.mocked ? "Approved posts simulate — connect real credentials to go live." : "Approved posts publish here for real."}`
                        : i.mocked
                          ? "Not connected. No API credentials configured — connecting will simulate."
                          : "Not connected."}
                    </p>
                  </div>
                </div>
                {i.connected ? (
                  <button onClick={() => disconnect(i.provider)} data-testid={`disconnect-${i.provider}`} className="btn-secondary shrink-0"><Unlink size={14} /> Disconnect</button>
                ) : (
                  <button onClick={() => connect(i.provider)} data-testid={`connect-${i.provider}`} className="btn-primary shrink-0"><Link2 size={14} /> Connect</button>
                )}
              </div>
              {i.provider === "youtube" && i.real_publish_supported === false && (
                <div className="mt-3 flex items-start gap-2 text-tiny text-warning bg-warning/10 border border-warning/30 rounded-xl px-3 py-2">
                  <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                  YouTube has no public API for creating Community-tab posts (text/image updates) — this is a platform
                  limitation, not a missing feature here. Connecting still lets you pull channel data; publishing always simulates.
                </div>
              )}
            </div>
          );
        })}

        <HashtagGroups />
        <RssFeeds />
      </div>
    </div>
  );
}

function HashtagGroups() {
  const [groups, setGroups] = useState([]);
  const [name, setName] = useState("");
  const [tags, setTags] = useState("");

  const load = () => api.get("/social-eq/hashtag-groups").then((r) => setGroups(r.data));
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!name.trim() || !tags.trim()) { toast.error("Name and hashtags required"); return; }
    await api.post("/social-eq/hashtag-groups", {
      name: name.trim(), hashtags: tags.split(",").map((t) => t.trim().replace(/^#/, "")).filter(Boolean),
    });
    setName(""); setTags(""); load();
    toast.success("Group saved");
  };
  const remove = async (id) => { await api.delete(`/social-eq/hashtag-groups/${id}`); load(); };

  return (
    <div className="shadow-card p-6 sm:p-8 rounded-2xl">
      <div className="text-card-title font-display font-semibold flex items-center gap-2 mb-1"><Tags size={16} /> Hashtag groups</div>
      <p className="text-caption text-ink-muted mb-4">Saved sets you can insert into a draft with one click from Compose.</p>
      <div className="space-y-2 mb-4">
        {groups.map((g) => (
          <div key={g.id} className="flex items-center justify-between gap-3 border border-line rounded-xl px-3 py-2">
            <div className="min-w-0">
              <div className="text-body font-medium">{g.name}</div>
              <div className="text-caption text-accent truncate">{g.hashtags.map((h) => `#${h}`).join(" ")}</div>
            </div>
            <button onClick={() => remove(g.id)} data-testid={`delete-hashtag-group-${g.id}`} className="text-ink-muted hover:text-danger shrink-0"><Trash2 size={14} /></button>
          </div>
        ))}
        {groups.length === 0 && <div className="text-caption text-ink-muted">No groups yet.</div>}
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Group name" data-testid="hashtag-group-name"
          className="border border-line rounded-xl px-3 py-2 text-input flex-1" />
        <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="saas, b2b, launch" data-testid="hashtag-group-tags"
          className="border border-line rounded-xl px-3 py-2 text-input flex-1" />
        <button onClick={add} data-testid="add-hashtag-group-btn" className="btn-secondary shrink-0"><Plus size={14} /> Add</button>
      </div>
    </div>
  );
}

function RssFeeds() {
  const [feeds, setFeeds] = useState([]);
  const [url, setUrl] = useState("");
  const [platforms, setPlatforms] = useState(["linkedin"]);

  const load = () => api.get("/social-eq/rss-feeds").then((r) => setFeeds(r.data));
  useEffect(() => { load(); }, []);

  const togglePlatform = (p) => setPlatforms((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);

  const add = async () => {
    if (!url.trim() || platforms.length === 0) { toast.error("Feed URL and at least one platform required"); return; }
    await api.post("/social-eq/rss-feeds", { feed_url: url.trim(), platforms, content_type: "static", tone: "confident, professional", active: true });
    setUrl(""); load();
    toast.success("Feed added — new entries will be drafted automatically");
  };
  const toggleActive = async (feed) => {
    await api.put(`/social-eq/rss-feeds/${feed.id}`, { ...feed, active: !feed.active });
    load();
  };
  const remove = async (id) => { await api.delete(`/social-eq/rss-feeds/${id}`); load(); };

  return (
    <div className="shadow-card p-6 sm:p-8 rounded-2xl">
      <div className="text-card-title font-display font-semibold flex items-center gap-2 mb-1"><Rss size={16} /> RSS auto-posting</div>
      <p className="text-caption text-ink-muted mb-4">New entries from these feeds draft posts automatically — same review-and-approve flow as everything else.</p>
      <div className="space-y-2 mb-4">
        {feeds.map((f) => (
          <div key={f.id} className="flex items-center justify-between gap-3 border border-line rounded-xl px-3 py-2">
            <div className="min-w-0">
              <div className="text-body font-medium truncate">{f.feed_url}</div>
              <div className="text-caption text-ink-muted">{f.platforms.join(", ")} · {f.active ? "active" : "paused"}</div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => toggleActive(f)} data-testid={`toggle-rss-${f.id}`} className="btn-secondary text-xs">{f.active ? "Pause" : "Resume"}</button>
              <button onClick={() => remove(f.id)} data-testid={`delete-rss-${f.id}`} className="text-ink-muted hover:text-danger"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
        {feeds.length === 0 && <div className="text-caption text-ink-muted">No feeds yet.</div>}
      </div>
      <div className="space-y-2">
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://yourblog.com/rss" data-testid="rss-feed-url"
          className="w-full border border-line rounded-xl px-3 py-2 text-input" />
        <div className="flex items-center gap-2 flex-wrap">
          {Object.keys(PLATFORM_META).map((p) => (
            <button key={p} type="button" onClick={() => togglePlatform(p)} data-testid={`rss-platform-${p}`}
              className={`px-2.5 py-1 rounded-full text-caption border ${platforms.includes(p) ? "bg-accent text-white border-transparent" : "border-line"}`}>
              {PLATFORM_META[p].label}
            </button>
          ))}
          <button onClick={add} data-testid="add-rss-feed-btn" className="btn-secondary ml-auto"><Plus size={14} /> Add feed</button>
        </div>
      </div>
    </div>
  );
}
