import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  User as UserIcon, Lock, Building2, Upload, Trash2, MessageSquare, ArrowLeft, LogOut, Plug,
} from "../icons";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { PageHeader } from "../components/AppLayout";
import Card from "../components/composites/Card";
import { EmptyState } from "../components/composites/EmptyState";
import Input from "../components/primitives/Input";
import Select from "../components/primitives/Select";
import Button from "../components/primitives/Button";
import Chip from "../components/primitives/Chip";

export default function Settings() {
  const { user, workspace, refresh, logout } = useAuth();
  const [profile, setProfile] = useState(null);
  const [tab, setTab] = useState("profile");
  const nav = useNavigate();

  useEffect(() => {
    api.get("/auth/me").then((r) => setProfile(r.data.user));
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-canvas)" }} className="animate-fade-in">
      <div style={{ borderBottom: "1px solid var(--border-default)", background: "var(--bg-surface)" }}>
        <div className="max-w-6xl mx-auto px-6 sm:px-8 flex items-center justify-between" style={{ paddingTop: 12, paddingBottom: 12 }}>
          <button onClick={() => nav("/suite")} data-testid="settings-back" className="flex items-center gap-2" style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>
            <ArrowLeft size={16} strokeWidth={1.5} aria-hidden="true" /> Command center
          </button>
          <div className="flex items-center gap-3">
            <div className="text-right leading-tight">
              <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--text-primary)" }}>{user?.name}</div>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{user?.email}</div>
            </div>
            <button onClick={logout} data-testid="settings-logout" style={{ padding: 6, color: "var(--text-tertiary)", borderRadius: "var(--radius-md)" }}>
              <LogOut size={14} strokeWidth={1.5} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
      <PageHeader
        title="Settings"
        subtitle="Your profile, workspace, security & brand voice."
      />

      <div className="p-6 sm:p-8 grid grid-cols-12 gap-4 sm:gap-6 max-w-6xl">
        <aside className="col-span-12 md:col-span-3">
          <div className="space-y-0.5" style={{ position: "sticky", top: 16 }}>
            <TabBtn active={tab === "profile"} onClick={() => setTab("profile")} icon={UserIcon} label="Profile" testid="settings-tab-profile" />
            <TabBtn active={tab === "security"} onClick={() => setTab("security")} icon={Lock} label="Security" testid="settings-tab-security" />
            <TabBtn active={tab === "workspace"} onClick={() => setTab("workspace")} icon={Building2} label="Workspace" testid="settings-tab-workspace" />
            <TabBtn active={tab === "brand"} onClick={() => setTab("brand")} icon={MessageSquare} label="Brand voice" testid="settings-tab-brand" />
            {user?.role === "org_admin" && (
              <TabBtn active={tab === "ai-clients"} onClick={() => setTab("ai-clients")} icon={Plug} label="AI clients" testid="settings-tab-ai-clients" />
            )}
          </div>
        </aside>

        <section className="col-span-12 md:col-span-9 space-y-4">
          {tab === "profile" && <ProfileSection profile={profile} onProfileUpdated={(u) => { setProfile(u); refresh?.(); }} />}
          {tab === "security" && <SecuritySection />}
          {tab === "workspace" && <WorkspaceSection user={user} workspace={workspace} />}
          {tab === "brand" && <BrandVoiceSection />}
          {tab === "ai-clients" && <ConnectedClientsSection />}
        </section>
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, icon: Icon, label, testid }) {
  return (
    <button onClick={onClick} data-testid={testid}
      className="w-full text-left flex items-center gap-2 transition-colors"
      style={{
        padding: "8px 12px", borderRadius: "var(--radius-md)", fontSize: 13.5,
        background: active ? "var(--text-primary)" : "transparent",
        color: active ? "var(--bg-surface)" : "var(--text-secondary)",
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "var(--bg-hover)"; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
    >
      <Icon size={14} strokeWidth={1.5} aria-hidden="true" />
      {label}
    </button>
  );
}

/* --- Profile --- */

function ProfileSection({ profile, onProfileUpdated }) {
  const [name, setName] = useState("");
  const [headline, setHeadline] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    if (profile) {
      setName(profile.name || "");
      setHeadline(profile.headline || "");
      setAvatarUrl(profile.avatar_url || "");
    }
  }, [profile]);

  const onFile = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) { toast.error("Please pick an image file"); return; }
    if (f.size > 4 * 1024 * 1024) { toast.error("Headshot too large (max ~4 MB)"); return; }
    const reader = new FileReader();
    reader.onload = () => setAvatarUrl(String(reader.result || ""));
    reader.readAsDataURL(f);
  };

  const removeAvatar = () => setAvatarUrl("");

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.put("/auth/profile", { name, headline, avatar_url: avatarUrl });
      onProfileUpdated(data.user);
      // Also update localStorage cached user so nav avatar refreshes on next reload.
      try {
        const cur = JSON.parse(localStorage.getItem("pitcheq_user") || "{}");
        localStorage.setItem("pitcheq_user", JSON.stringify({ ...cur, ...data.user }));
      } catch { /* ignore */ }
      toast.success("Profile saved");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Save failed");
    } finally { setBusy(false); }
  };

  if (!profile) return <div style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>Loading profile…</div>;

  return (
    <Card title="Your profile" subtitle="Your name and headshot appear on Create EQ carousels and in team invitations.">
      <form onSubmit={submit} className="space-y-4" data-testid="profile-section">
        <div className="flex flex-col sm:flex-row items-start gap-4">
          <div className="relative">
            <div className="rounded-full overflow-hidden flex items-center justify-center" style={{
              width: 96, height: 96, border: "2px solid var(--border-default)", background: "var(--bg-surface-sunken)",
            }}>
              {avatarUrl ? (
                <img src={avatarUrl} alt="you" className="w-full h-full object-cover" data-testid="profile-avatar-preview"
                  onError={(e) => { e.currentTarget.style.opacity = 0.3; }} />
              ) : (
                <UserIcon size={32} strokeWidth={1.5} aria-hidden="true" style={{ color: "var(--text-tertiary)" }} />
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" data-testid="profile-avatar-input" onChange={onFile} />
            <button type="button" onClick={() => fileRef.current?.click()}
              data-testid="profile-avatar-upload"
              className="absolute flex items-center justify-center"
              style={{ bottom: -4, right: -4, width: 32, height: 32, borderRadius: "var(--radius-lg)", background: "var(--color-primary)", color: "#fff", boxShadow: "var(--shadow-sm)" }}>
              <Upload size={14} strokeWidth={1.5} aria-hidden="true" />
            </button>
          </div>
          <div className="flex-1 space-y-2">
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>Headshot</div>
            <div style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>Upload a square photo of yourself (recommended 512×512). Used across Create EQ slides.</div>
            {avatarUrl && (
              <button type="button" onClick={removeAvatar}
                data-testid="profile-avatar-remove"
                className="inline-flex items-center gap-1" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                <Trash2 size={12} strokeWidth={1.5} aria-hidden="true" /> Remove headshot
              </button>
            )}
          </div>
        </div>

        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} data-testid="profile-name" placeholder="Your full name" />
        <Input label="Headline" help="Shown next to your headshot" value={headline} onChange={(e) => setHeadline(e.target.value)} data-testid="profile-headline" placeholder="e.g. Founder · Innoira Labs" />
        <Input label="Email" value={profile.email} disabled style={{ fontFamily: "var(--font-mono)" }} />

        <div className="flex justify-end" style={{ paddingTop: 12, borderTop: "1px solid var(--border-subtle)" }}>
          <Button type="submit" variant="primary" isLoading={busy} data-testid="profile-save">Save profile</Button>
        </div>
      </form>
    </Card>
  );
}

/* --- Security / Change password --- */

function SecuritySection() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const strong = next.length >= 8 && /[A-Z]/.test(next) && /[0-9]/.test(next);

  const submit = async (e) => {
    e.preventDefault();
    if (next !== confirm) { toast.error("Passwords don't match"); return; }
    if (next.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    setBusy(true);
    try {
      await api.post("/auth/change-password", { current_password: current, new_password: next });
      toast.success("Password changed");
      setCurrent(""); setNext(""); setConfirm("");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Change failed");
    } finally { setBusy(false); }
  };

  return (
    <Card title="Change password" subtitle="Use at least 8 characters, mix of upper/lower + digits recommended.">
      <form onSubmit={submit} className="space-y-3" data-testid="security-section">
        <Input required type="password" label="Current password" value={current} onChange={(e) => setCurrent(e.target.value)} data-testid="password-current" autoComplete="current-password" />
        <div>
          <Input required type="password" label="New password" value={next} onChange={(e) => setNext(e.target.value)} data-testid="password-new" autoComplete="new-password" minLength={8} />
          {next && (
            <div className="tnum" style={{ fontSize: 11, marginTop: 4, color: strong ? "var(--color-success)" : "var(--text-tertiary)" }}>
              {strong ? "Strong ✓" : "Add an uppercase letter and a digit to strengthen"}
            </div>
          )}
        </div>
        <div>
          <Input required type="password" label="Confirm new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} data-testid="password-confirm" autoComplete="new-password" minLength={8} />
          {confirm && confirm !== next && (
            <div style={{ fontSize: 11, marginTop: 4, color: "var(--color-danger)" }}>Passwords don&apos;t match</div>
          )}
        </div>

        <div className="flex justify-end" style={{ paddingTop: 12, borderTop: "1px solid var(--border-subtle)" }}>
          <Button type="submit" variant="primary" isLoading={busy} isDisabled={!current || !next || next !== confirm} data-testid="password-submit">Change password</Button>
        </div>
      </form>
    </Card>
  );
}

/* --- Workspace --- */

function WorkspaceSection({ user, workspace }) {
  return (
    <Card title="Workspace" subtitle="Team-wide info. Contact your admin to change these values." data-testid="workspace-section">
      <div className="grid md:grid-cols-2 gap-3">
        <Row k="Workspace" v={workspace?.name} />
        <Row k="Plan" v={workspace?.plan || "trial"} />
        <Row k="Owner" v={user?.email} />
        <Row k="Your role" v={user?.role || "org_admin"} />
        <Row k="Workspace ID" v={workspace?.id} mono />
        <Row k="LLM quota used" v={String(workspace?.quota_used ?? 0)} mono />
      </div>
    </Card>
  );
}

/* --- Connected AI clients (MCP) --- */

function ConnectedClientsSection() {
  const [clients, setClients] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = () => api.get("/oauth/connected-clients").then((r) => setClients(r.data)).catch(() => setClients([]));
  useEffect(() => { load(); }, []);

  const revoke = async (grantId) => {
    setBusyId(grantId);
    try {
      await api.post("/oauth/connected-clients/revoke", { grant_id: grantId });
      toast.success("Connection revoked");
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Revoke failed");
    } finally { setBusyId(null); }
  };

  if (!clients) return <div style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>Loading connected AI clients…</div>;

  return (
    <Card title="Connected AI clients"
      subtitle="AI assistants a teammate has connected to this workspace via MCP. Revoking cuts off access immediately — every action an AI client takes is also visible in the audit log."
      data-testid="connected-clients-section">
      {clients.length === 0 ? (
        <EmptyState icon={Plug} title="No AI clients connected yet" description="Connect an MCP client to see it here." className="py-8" />
      ) : (
        <div className="space-y-2">
          {clients.map((c) => (
            <div key={c.grant_id} data-testid="connected-client-row"
              className="flex items-center justify-between gap-3" style={{ border: "1px solid var(--border-default)", borderRadius: "var(--radius-lg)", padding: "10px 12px" }}>
              <div className="min-w-0">
                <div className="truncate" style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>{c.client_name}</div>
                <div className="truncate" style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>
                  Connected by {c.connected_by} · {new Date(c.connected_at).toLocaleDateString()} · {c.scopes.join(", ")}
                </div>
              </div>
              <Button variant="danger-subtle" onClick={() => revoke(c.grant_id)} isLoading={busyId === c.grant_id} data-testid="connected-client-revoke" className="shrink-0">Revoke</Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

const TONES = ["warm", "professional", "direct", "playful", "formal"];
const TONE_OPTIONS = TONES.map((t) => ({ value: t, label: t[0].toUpperCase() + t.slice(1) }));
const PERSONA_TYPES = ["individual", "influencer", "enterprise", "startup", "solo_company"];
const PERSONA_OPTIONS = [{ value: "", label: "Not set" }, ...PERSONA_TYPES.map((p) => ({ value: p, label: p.replace("_", " ").replace(/^\w/, (c) => c.toUpperCase()) }))];
const SOCIAL_PLATFORMS = ["linkedin", "instagram", "youtube"];

function BrandVoiceSection() {
  const [bv, setBv] = useState(null);
  const [busy, setBusy] = useState(false);
  const [phraseInput, setPhraseInput] = useState("");
  const [pillarInput, setPillarInput] = useState("");

  useEffect(() => {
    api.get("/workspace/brand-voice").then((r) => setBv(r.data)).catch(() => setBv({
      tone: "warm", offer: "", icp_description: "", banned_phrases: [], sample: "",
      content_pillars: [], posting_cadence: { days_per_week: 3, preferred_platforms: [] }, persona_type: null,
    }));
  }, []);

  const patch = (p) => setBv((cur) => ({ ...cur, ...p }));
  const patchCadence = (p) => setBv((cur) => ({ ...cur, posting_cadence: { ...cur.posting_cadence, ...p } }));

  const addPhrase = () => {
    const p = phraseInput.trim();
    if (!p) return;
    if (!bv.banned_phrases.includes(p)) patch({ banned_phrases: [...bv.banned_phrases, p] });
    setPhraseInput("");
  };
  const removePhrase = (p) => patch({ banned_phrases: bv.banned_phrases.filter((x) => x !== p) });

  const addPillar = () => {
    const p = pillarInput.trim();
    if (!p) return;
    if (!bv.content_pillars.includes(p)) patch({ content_pillars: [...bv.content_pillars, p] });
    setPillarInput("");
  };
  const removePillar = (p) => patch({ content_pillars: bv.content_pillars.filter((x) => x !== p) });

  const togglePlatform = (plat) => {
    const cur = bv.posting_cadence.preferred_platforms || [];
    patchCadence({ preferred_platforms: cur.includes(plat) ? cur.filter((x) => x !== plat) : [...cur, plat] });
  };

  const save = async () => {
    setBusy(true);
    try {
      const { data } = await api.put("/workspace/brand-voice", bv);
      setBv(data);
      toast.success("Brand voice saved");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Save failed");
    } finally { setBusy(false); }
  };

  if (!bv) return <div style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>Loading brand voice…</div>;

  return (
    <Card title="Brand voice"
      subtitle="What every agent's AI drafting (cold emails, proposals, carousel copy) should know about your business — this is what actually reaches the model, not just a display setting."
      data-testid="brand-voice-section">
      <div className="space-y-4">
        <Input as="textarea" rows={3} label="What you sell / your offer" value={bv.offer} onChange={(e) => patch({ offer: e.target.value })}
          data-testid="brand-voice-offer" placeholder="e.g. A project-management tool for construction teams that replaces spreadsheets and site visits."
          help="Used by Pitch EQ and Proposal EQ so drafts describe your business, not a generic placeholder." />

        <Input as="textarea" rows={2} label="Ideal customer profile" value={bv.icp_description} onChange={(e) => patch({ icp_description: e.target.value })}
          data-testid="brand-voice-icp" placeholder="e.g. Operations leads at mid-size construction firms (50-500 employees)." />

        <Select label="Default tone" value={bv.tone} onChange={(v) => patch({ tone: v })} data-testid="brand-voice-tone" options={TONE_OPTIONS}
          help="Used whenever a specific campaign or draft doesn't override the tone itself." />

        <Input as="textarea" rows={3} label="Sample email" optional value={bv.sample} onChange={(e) => patch({ sample: e.target.value })}
          data-testid="brand-voice-sample" placeholder="Paste an email that sounds like you, for the AI to match style against." />

        <div>
          <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--text-primary)", marginBottom: 6 }}>Banned phrases</label>
          <div className="flex gap-2">
            <Input value={phraseInput} onChange={(e) => setPhraseInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPhrase(); } }}
              data-testid="brand-voice-phrase-input" placeholder="e.g. synergy — press Enter to add" className="flex-1" />
            <Button type="button" variant="secondary" onClick={addPhrase} data-testid="brand-voice-phrase-add" className="shrink-0">Add</Button>
          </div>
          {bv.banned_phrases.length > 0 && (
            <div className="flex flex-wrap gap-1.5" style={{ marginTop: 8 }}>
              {bv.banned_phrases.map((p) => <Chip key={p} label={p} onRemove={() => removePhrase(p)} />)}
            </div>
          )}
        </div>

        <div className="space-y-4" style={{ paddingTop: 16, borderTop: "1px solid var(--border-subtle)" }}>
          <div style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>
            The fields below are read by Social EQ's daily content pipeline in addition to the tone/offer/ICP above.
          </div>

          <Select label="Persona type" value={bv.persona_type || ""} onChange={(v) => patch({ persona_type: v || null })}
            data-testid="brand-voice-persona-type" options={PERSONA_OPTIONS} />

          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--text-primary)", marginBottom: 6 }}>
              Content pillars <span style={{ fontWeight: 400, color: "var(--text-tertiary)" }}>(3-5 recurring topics)</span>
            </label>
            <div className="flex gap-2">
              <Input value={pillarInput} onChange={(e) => setPillarInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPillar(); } }}
                data-testid="brand-voice-pillar-input" placeholder="e.g. product tips — press Enter to add" className="flex-1" />
              <Button type="button" variant="secondary" onClick={addPillar} data-testid="brand-voice-pillar-add" className="shrink-0">Add</Button>
            </div>
            {bv.content_pillars.length > 0 && (
              <div className="flex flex-wrap gap-1.5" style={{ marginTop: 8 }}>
                {bv.content_pillars.map((p) => <Chip key={p} label={p} onRemove={() => removePillar(p)} />)}
              </div>
            )}
          </div>

          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--text-primary)", marginBottom: 6 }}>Posting cadence</label>
            <div className="flex items-center gap-2">
              <Input type="number" min={1} max={7} value={bv.posting_cadence.days_per_week}
                onChange={(e) => patchCadence({ days_per_week: Number(e.target.value) || 1 })}
                data-testid="brand-voice-cadence-days" className="w-20" />
              <span style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>days/week, on:</span>
            </div>
            <div className="flex flex-wrap gap-2" style={{ marginTop: 8 }}>
              {SOCIAL_PLATFORMS.map((plat) => {
                const selected = bv.posting_cadence.preferred_platforms?.includes(plat);
                return (
                  <button type="button" key={plat} onClick={() => togglePlatform(plat)}
                    data-testid={`brand-voice-platform-${plat}`}
                    className="capitalize"
                    style={{
                      height: 28, padding: "0 12px", borderRadius: "var(--radius-full)",
                      border: `1px solid ${selected ? "var(--color-primary)" : "var(--border-default)"}`,
                      background: selected ? "var(--color-primary)" : "var(--bg-surface)",
                      color: selected ? "#fff" : "var(--text-primary)", fontSize: 12.5, fontWeight: 500,
                    }}>
                    {plat}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", paddingTop: 12, borderTop: "1px solid var(--border-subtle)" }}>
          Brand kits (logo + colors + font) applied inside Create EQ propagate to all slides separately — that's visual styling, not covered here.
        </div>

        <div className="flex justify-end">
          <Button variant="primary" onClick={save} isLoading={busy} data-testid="brand-voice-save">Save brand voice</Button>
        </div>
      </div>
    </Card>
  );
}

function Row({ k, v, mono }) {
  return (
    <div className="flex justify-between" style={{ border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", padding: "8px 12px" }}>
      <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)" }}>{k}</span>
      <span className={mono ? "tnum truncate" : "truncate"} style={{
        fontSize: 13, color: mono ? "var(--text-secondary)" : "var(--text-primary)",
        fontFamily: mono ? "var(--font-mono)" : "var(--font-ui)", maxWidth: "60%",
      }}>{v || "—"}</span>
    </div>
  );
}
