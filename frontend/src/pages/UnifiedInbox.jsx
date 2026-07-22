import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { Mail, Share2, Globe } from "lucide-react";

/**
 * A cross-agent triage view — merges Pitch EQ's email inbox, Social EQ's
 * engagement inbox, and Site EQ's chat inbox into one recency-sorted list, so
 * "what needs my attention across every channel" is one screen instead of
 * three separate nav items. Each item still opens its own channel's existing
 * inbox page for replying — reusing all the already-built, working reply
 * logic per channel rather than reimplementing three different reply flows
 * inline.
 */

const CHANNEL_META = {
  email: { label: "Pitch EQ", icon: Mail, color: "bg-blue-500" },
  social: { label: "Social EQ", icon: Share2, color: "bg-pink-500" },
  site: { label: "Site EQ", icon: Globe, color: "bg-emerald-500" },
};

export default function UnifiedInbox() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    const load = async () => {
      const [emailRes, socialRes, siteRes] = await Promise.all([
        api.get("/inbox").catch(() => ({ data: [] })),
        api.get("/social-eq/inbox").catch(() => ({ data: [] })),
        api.get("/site-eq/conversations").catch(() => ({ data: [] })),
      ]);

      const email = emailRes.data.map((c) => ({
        channel: "email", id: c.id,
        contactName: `${c.lead?.first_name || ""} ${c.lead?.last_name || ""}`.trim() || c.lead?.email || "Unknown",
        contactMeta: c.lead?.company || c.lead?.email || "",
        preview: c.snippet || "",
        needsAttention: c.classification === "interested" || c.classification === "referral",
        at: c.updated_at || c.created_at,
        url: "/app/inbox",
      }));

      const social = socialRes.data.map((c) => ({
        channel: "social", id: c.id,
        contactName: c.author || "Someone",
        contactMeta: c.platform ? c.platform[0].toUpperCase() + c.platform.slice(1) : "",
        preview: c.text || "",
        needsAttention: c.status === "new",
        at: c.at,
        url: "/app/social-eq/inbox",
      }));

      const site = siteRes.data.map((c) => ({
        channel: "site", id: c.id,
        contactName: c.site_name || "Website visitor",
        contactMeta: c.visitor_id || "",
        preview: c.messages?.[c.messages.length - 1]?.body || "",
        needsAttention: c.status === "needs_human",
        at: c.updated_at || c.created_at,
        url: "/app/site-eq/inbox",
      }));

      const merged = [...email, ...social, ...site].sort((a, b) => (b.at || "").localeCompare(a.at || ""));
      setItems(merged);
      setLoading(false);
    };
    load();
  }, []);

  const filtered = items.filter((i) => filter === "all" || i.channel === filter);
  const attentionCount = items.filter((i) => i.needsAttention).length;

  return (
    <div>
      <PageHeader
        title="Unified Inbox"
        subtitle="Every email reply, social comment, and site chat that needs a response — one list, across every channel."
      />
      <div className="animate-fade-in px-6 sm:px-8 space-y-4">
        <div className="flex flex-wrap gap-2">
          {[["all", "All channels"], ["email", "Pitch EQ"], ["social", "Social EQ"], ["site", "Site EQ"]].map(([k, t]) => (
            <button key={k} onClick={() => setFilter(k)} data-testid={`unified-filter-${k}`}
              className={`px-3 py-1.5 rounded-xl text-caption font-medium font-display transition-colors ${
                filter === k ? "bg-accent-soft text-accent" : "text-ink-muted hover:bg-ash"
              }`}>
              {t}
            </button>
          ))}
          {attentionCount > 0 && (
            <span className="px-3 py-1.5 rounded-xl text-caption font-medium bg-danger/10 text-danger">
              {attentionCount} need{attentionCount === 1 ? "s" : ""} attention
            </span>
          )}
        </div>

        {loading ? (
          <div className="p-10 text-center text-body text-ink-muted">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="shadow-card p-10 text-center rounded-2xl bg-white">
            <div className="text-card-title font-display font-semibold">Nothing here yet</div>
            <p className="text-body text-ink-muted mt-2">
              Replies, comments, and chats from every agent will show up here as they come in.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {filtered.map((item) => {
              const meta = CHANNEL_META[item.channel];
              const Icon = meta.icon;
              return (
                <Link key={`${item.channel}-${item.id}`} to={item.url}
                  data-testid={`unified-item-${item.channel}-${item.id}`}
                  className="flex items-start gap-3 p-3 rounded-xl bg-white border border-line hover:border-ink/15 transition-colors">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${meta.color}`}>
                    <Icon size={14} className="text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium text-body truncate">{item.contactName}</div>
                      <div className="text-tiny text-ink-muted font-mono shrink-0">
                        {item.at ? new Date(item.at).toLocaleString() : ""}
                      </div>
                    </div>
                    <div className="text-caption text-ink-muted truncate">{meta.label} · {item.contactMeta}</div>
                    {item.preview && <div className="text-caption text-ink-tertiary mt-1 line-clamp-2">{item.preview}</div>}
                  </div>
                  {item.needsAttention && <span className="w-1.5 h-1.5 rounded-full bg-danger shrink-0 mt-1.5" />}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
