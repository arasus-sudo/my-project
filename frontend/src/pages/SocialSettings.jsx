import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Link, Linkedin, Instagram, Youtube, AlertTriangle, Plus, Trash2, Globe, Tags } from "../icons";
import Card from "../components/composites/Card";
import StatusPill from "../components/primitives/StatusPill";
import Input from "../components/primitives/Input";
import Button from "../components/primitives/Button";

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

  if (loading) return <div className="animate-fade-in p-6 sm:p-8" style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Loading…</div>;

  return (
    <div>
      <PageHeader title="Social EQ Settings" subtitle="Connect the platforms you publish to. Posts run in test mode until a platform is connected with real credentials." />
      <div className="animate-fade-in px-6 sm:px-8 py-6 max-w-2xl space-y-4">
        {integrations.map((i) => {
          const meta = PLATFORM_META[i.provider];
          const Icon = meta.icon;
          return (
            <Card key={i.provider}>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Icon size={20} strokeWidth={1.5} aria-hidden="true" style={{ color: "var(--text-primary)" }} />
                  <div>
                    <div className="flex items-center gap-2" style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>
                      {meta.label}
                      <StatusPill status={i.mocked ? "test mode" : "live"} tone={i.mocked ? "neutral" : "success"} />
                    </div>
                    <p style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginTop: 2 }}>
                      {i.connected
                        ? `Connected as ${i.account_name}. ${i.mocked ? "Approved posts simulate — connect real credentials to go live." : "Approved posts publish here for real."}`
                        : i.mocked
                          ? "Not connected. No API credentials configured — connecting will simulate."
                          : "Not connected."}
                    </p>
                  </div>
                </div>
                {i.connected ? (
                  <Button variant="secondary" icon={Link} onClick={() => disconnect(i.provider)} data-testid={`disconnect-${i.provider}`} className="shrink-0">Disconnect</Button>
                ) : (
                  <Button variant="primary" icon={Link} onClick={() => connect(i.provider)} data-testid={`connect-${i.provider}`} className="shrink-0">Connect</Button>
                )}
              </div>
              {i.provider === "youtube" && i.real_publish_supported === false && (
                <div className="flex items-start gap-2" style={{
                  marginTop: 12, fontSize: 11.5, color: "var(--color-warning-text)",
                  background: "var(--color-warning-subtle)", border: "1px solid var(--color-warning-border)",
                  borderRadius: "var(--radius-lg)", padding: "8px 12px",
                }}>
                  <AlertTriangle size={12} strokeWidth={1.5} aria-hidden="true" className="shrink-0 mt-0.5" />
                  YouTube has no public API for creating Community-tab posts (text/image updates) — this is a platform
                  limitation, not a missing feature here. Connecting still lets you pull channel data; publishing always simulates.
                </div>
              )}
            </Card>
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
    <Card>
      <div className="flex items-center gap-2" style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-ui)", marginBottom: 2 }}>
        <Tags size={16} strokeWidth={1.5} aria-hidden="true" /> Hashtag groups
      </div>
      <p style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginBottom: 16 }}>Saved sets you can insert into a draft with one click from Compose.</p>
      <div className="space-y-2" style={{ marginBottom: 16 }}>
        {groups.map((g) => (
          <div key={g.id} className="flex items-center justify-between gap-3" style={{ border: "1px solid var(--border-default)", borderRadius: "var(--radius-lg)", padding: "8px 12px" }}>
            <div className="min-w-0">
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>{g.name}</div>
              <div className="truncate" style={{ fontSize: 12, color: "var(--color-primary)" }}>{g.hashtags.map((h) => `#${h}`).join(" ")}</div>
            </div>
            <button onClick={() => remove(g.id)} data-testid={`delete-hashtag-group-${g.id}`} className="shrink-0" style={{ color: "var(--text-tertiary)" }}>
              <Trash2 size={14} strokeWidth={1.5} aria-hidden="true" />
            </button>
          </div>
        ))}
        {groups.length === 0 && <div style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>No groups yet.</div>}
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Group name" data-testid="hashtag-group-name" className="flex-1" />
        <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="saas, b2b, launch" data-testid="hashtag-group-tags" className="flex-1" />
        <Button variant="secondary" icon={Plus} onClick={add} data-testid="add-hashtag-group-btn" className="shrink-0">Add</Button>
      </div>
    </Card>
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
    <Card>
      <div className="flex items-center gap-2" style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-ui)", marginBottom: 2 }}>
        <Globe size={16} strokeWidth={1.5} aria-hidden="true" /> RSS auto-posting
      </div>
      <p style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginBottom: 16 }}>New entries from these feeds draft posts automatically — same review-and-approve flow as everything else.</p>
      <div className="space-y-2" style={{ marginBottom: 16 }}>
        {feeds.map((f) => (
          <div key={f.id} className="flex items-center justify-between gap-3" style={{ border: "1px solid var(--border-default)", borderRadius: "var(--radius-lg)", padding: "8px 12px" }}>
            <div className="min-w-0">
              <div className="truncate" style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>{f.feed_url}</div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{f.platforms.join(", ")} · {f.active ? "active" : "paused"}</div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="secondary" size="sm" onClick={() => toggleActive(f)} data-testid={`toggle-rss-${f.id}`}>{f.active ? "Pause" : "Resume"}</Button>
              <button onClick={() => remove(f.id)} data-testid={`delete-rss-${f.id}`} style={{ color: "var(--text-tertiary)" }}>
                <Trash2 size={14} strokeWidth={1.5} aria-hidden="true" />
              </button>
            </div>
          </div>
        ))}
        {feeds.length === 0 && <div style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>No feeds yet.</div>}
      </div>
      <div className="space-y-2">
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://yourblog.com/rss" data-testid="rss-feed-url" />
        <div className="flex items-center gap-2 flex-wrap">
          {Object.keys(PLATFORM_META).map((p) => (
            <button key={p} type="button" onClick={() => togglePlatform(p)} data-testid={`rss-platform-${p}`}
              style={{
                padding: "5px 12px", borderRadius: "var(--radius-full)", fontSize: 12.5,
                border: `1px solid ${platforms.includes(p) ? "var(--color-primary)" : "var(--border-default)"}`,
                background: platforms.includes(p) ? "var(--color-primary)" : "var(--bg-surface)",
                color: platforms.includes(p) ? "#fff" : "var(--text-primary)",
              }}>
              {PLATFORM_META[p].label}
            </button>
          ))}
          <Button variant="secondary" icon={Plus} onClick={add} data-testid="add-rss-feed-btn" className="ml-auto">Add feed</Button>
        </div>
      </div>
    </Card>
  );
}
