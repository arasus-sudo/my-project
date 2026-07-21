import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  User as UserIcon, KeyRound, Building2, Loader2, Camera, Trash2, MessageSquare, ArrowLeft, LogOut,
} from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { PageHeader } from "../components/AppLayout";

export default function Settings() {
  const { user, workspace, refresh, logout } = useAuth();
  const [profile, setProfile] = useState(null);
  const [tab, setTab] = useState("profile");

  useEffect(() => {
    api.get("/auth/me").then((r) => setProfile(r.data.user));
  }, []);

  return (
    <div className="min-h-screen bg-bone animate-fade-in">
      <div className="border-b border-line bg-white">
        <div className="max-w-6xl mx-auto px-6 sm:px-8 py-3 flex items-center justify-between">
          <Link to="/suite" data-testid="settings-back" className="flex items-center gap-2 text-sm text-neutral-500 hover:text-ink">
            <ArrowLeft size={15} /> Command center
          </Link>
          <div className="flex items-center gap-3">
            <div className="text-right leading-tight">
              <div className="text-xs font-medium">{user?.name}</div>
              <div className="text-[10px] text-neutral-400">{user?.email}</div>
            </div>
            <button onClick={logout} data-testid="settings-logout" className="p-1.5 text-neutral-400 hover:text-ink hover:bg-surfacehover rounded-xl">
              <LogOut size={14} />
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
          <div className="space-y-1 sticky top-4">
            <TabBtn active={tab === "profile"} onClick={() => setTab("profile")} icon={<UserIcon size={14} />} label="Profile" testid="settings-tab-profile" />
            <TabBtn active={tab === "security"} onClick={() => setTab("security")} icon={<KeyRound size={14} />} label="Security" testid="settings-tab-security" />
            <TabBtn active={tab === "workspace"} onClick={() => setTab("workspace")} icon={<Building2 size={14} />} label="Workspace" testid="settings-tab-workspace" />
            <TabBtn active={tab === "brand"} onClick={() => setTab("brand")} icon={<Sparkles size={14} />} label="Brand voice" testid="settings-tab-brand" />
          </div>
        </aside>

        <section className="col-span-12 md:col-span-9 space-y-6">
          {tab === "profile" && <ProfileSection profile={profile} onProfileUpdated={(u) => { setProfile(u); refresh?.(); }} />}
          {tab === "security" && <SecuritySection />}
          {tab === "workspace" && <WorkspaceSection user={user} workspace={workspace} />}
          {tab === "brand" && <BrandVoiceSection />}
        </section>
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, icon, label, testid }) {
  return (
    <button onClick={onClick} data-testid={testid}
      className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-colors ${active ? "bg-ink text-white" : "hover:bg-neutral-100 text-neutral-700"}`}>
      {icon}
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

  if (!profile) return <div className="text-neutral-400 text-sm">Loading profile…</div>;

  return (
    <form onSubmit={submit} className="card-flat shadow-card p-6 space-y-5" data-testid="profile-section">
      <div>
        <div className="font-display font-semibold text-lg">Your profile</div>
        <div className="text-xs text-neutral-400 mt-0.5">Your name and headshot appear on Create EQ carousels and in team invitations.</div>
      </div>

      <div className="flex flex-col sm:flex-row items-start gap-4">
        <div className="relative">
          <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-line bg-neutral-100 flex items-center justify-center">
            {avatarUrl ? (
              <img src={avatarUrl} alt="you" className="w-full h-full object-cover" data-testid="profile-avatar-preview"
                onError={(e) => { e.currentTarget.style.opacity = 0.3; }} />
            ) : (
              <UserIcon size={32} className="text-neutral-400" />
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" data-testid="profile-avatar-input" onChange={onFile} />
          <button type="button" onClick={() => fileRef.current?.click()}
            data-testid="profile-avatar-upload"
            className="absolute -bottom-1 -right-1 w-8 h-8 rounded-xl bg-brand-gradient text-white flex items-center justify-center shadow hover:brightness-105">
            <Camera size={14} />
          </button>
        </div>
        <div className="flex-1 space-y-2">
          <div className="text-sm font-medium">Headshot</div>
          <div className="text-xs text-neutral-400">Upload a square photo of yourself (recommended 512×512). Used across Create EQ slides.</div>
          {avatarUrl && (
            <button type="button" onClick={removeAvatar}
              data-testid="profile-avatar-remove"
              className="text-[11px] text-neutral-400 hover:text-danger flex items-center gap-1">
              <Trash2 size={11} /> Remove headshot
            </button>
          )}
        </div>
      </div>

      <label className="block">
        <span className="ui-label">Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)}
          data-testid="profile-name"
          placeholder="Your full name"
          className="input-premium mt-1 w-full text-sm" />
      </label>

      <label className="block">
        <span className="ui-label">Headline <span className="text-neutral-400 font-normal">(shown next to your headshot)</span></span>
        <input value={headline} onChange={(e) => setHeadline(e.target.value)}
          data-testid="profile-headline"
          placeholder="e.g. Founder · Innoira Labs"
          className="input-premium mt-1 w-full text-sm" />
      </label>

      <label className="block">
        <span className="ui-label">Email</span>
        <input value={profile.email} disabled
          className="input-premium mt-1 w-full text-sm font-mono bg-ash text-neutral-400" />
      </label>

      <div className="flex justify-end pt-2 border-t border-line">
        <button type="submit" disabled={busy} data-testid="profile-save" className="btn-primary disabled:opacity-60">
          {busy ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : "Save profile"}
        </button>
      </div>
    </form>
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
    <form onSubmit={submit} className="card-flat shadow-card p-6 space-y-4" data-testid="security-section">
      <div>
        <div className="font-display font-semibold text-lg">Change password</div>
        <div className="text-xs text-neutral-400 mt-0.5">Use at least 8 characters, mix of upper/lower + digits recommended.</div>
      </div>

      <label className="block">
        <span className="ui-label">Current password</span>
        <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)}
          data-testid="password-current"
          autoComplete="current-password"
          className="input-premium mt-1 w-full text-sm" required />
      </label>
      <label className="block">
        <span className="ui-label">New password</span>
        <input type="password" value={next} onChange={(e) => setNext(e.target.value)}
          data-testid="password-new"
          autoComplete="new-password" minLength={8}
          className="input-premium mt-1 w-full text-sm" required />
        {next && (
          <div className={`text-[10px] mt-1 font-mono ${strong ? "text-success" : "text-neutral-400"}`}>
            {strong ? "Strong ✓" : "Add an uppercase letter and a digit to strengthen"}
          </div>
        )}
      </label>
      <label className="block">
        <span className="ui-label">Confirm new password</span>
        <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
          data-testid="password-confirm"
          autoComplete="new-password" minLength={8}
          className="input-premium mt-1 w-full text-sm" required />
        {confirm && confirm !== next && (
          <div className="text-[10px] mt-1 text-danger">Passwords don&apos;t match</div>
        )}
      </label>

      <div className="flex justify-end pt-2 border-t border-line">
        <button type="submit" disabled={busy || !current || !next || next !== confirm}
          data-testid="password-submit"
          className="btn-primary disabled:opacity-40">
          {busy ? <><Loader2 size={14} className="animate-spin" /> Updating…</> : "Change password"}
        </button>
      </div>
    </form>
  );
}

/* --- Workspace --- */

function WorkspaceSection({ user, workspace }) {
  return (
    <div className="card-flat shadow-card p-6 space-y-4" data-testid="workspace-section">
      <div>
        <div className="font-display font-semibold text-lg">Workspace</div>
        <div className="text-xs text-neutral-400 mt-0.5">Team-wide info. Contact your admin to change these values.</div>
      </div>
      <div className="grid md:grid-cols-2 gap-3 text-sm">
        <Row k="Workspace" v={workspace?.name} />
        <Row k="Plan" v={workspace?.plan || "trial"} />
        <Row k="Owner" v={user?.email} />
        <Row k="Your role" v={user?.role || "org_admin"} />
        <Row k="Workspace ID" v={workspace?.id} mono />
        <Row k="LLM quota used" v={String(workspace?.quota_used ?? 0)} mono />
      </div>
    </div>
  );
}

function BrandVoiceSection() {
  return (
    <div className="card-flat shadow-card p-6 space-y-3" data-testid="brand-voice-section">
      <div>
        <div className="font-display font-semibold text-lg">Brand voice</div>
        <div className="text-xs text-neutral-400 mt-0.5">Tune the assistant&apos;s tone for cold emails and carousel copy.</div>
      </div>
      <div className="text-sm text-neutral-500">
        Full brand-voice controls (warmth · directness · banned phrases · sample emails) will be surfaced here in the next release.
        For now, brand kits (logo + colors + font) applied inside Create EQ propagate to all slides automatically.
      </div>
    </div>
  );
}

function Row({ k, v, mono }) {
  return (
    <div className="flex justify-between border border-line rounded-lg px-3 py-2 bg-white">
      <span className="ui-label">{k}</span>
      <span className={mono ? "font-mono text-xs text-neutral-700 truncate max-w-[60%]" : "text-sm text-neutral-800"}>{v || "—"}</span>
    </div>
  );
}
