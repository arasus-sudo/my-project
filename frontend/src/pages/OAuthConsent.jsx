import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { toast } from "sonner";
import InnoiraLogo from "../components/InnoiraLogo";
import { ShieldCheck, Eye, Pencil, Send, Loader2 } from "lucide-react";

// Fixed display order, independent of what the client requested.
const ALL_SCOPES = ["read", "write", "send"];

// Human-readable framing for each MCP scope — shown on the consent screen so
// granting "send" (real outbound contact + real cost) is never a blind click.
const SCOPE_INFO = {
  read: { icon: Eye, label: "Read your data", desc: "Leads, campaigns, inbox, analytics, signatures — view only." },
  write: { icon: Pencil, label: "Create and edit", desc: "Add/update leads, reply to messages, create campaigns and signatures." },
  send: { icon: Send, label: "Send on your behalf", desc: "Launch campaigns, place calls, send SMS/WhatsApp, publish posts — real outbound contact and real cost." },
};

function CenterCard({ children, wide }) {
  return (
    <div className="min-h-screen bg-bone flex items-center justify-center p-4 animate-fade-in">
      <div className={`bg-white border border-line rounded-2xl shadow-card p-8 flex flex-col items-center text-center ${wide ? "max-w-md" : "max-w-sm"} w-full`}>
        {children}
      </div>
    </div>
  );
}

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const requestId = params.get("request_id");
  const { user, loading, login } = useAuth();
  const [info, setInfo] = useState(null);
  const [selectedScopes, setSelectedScopes] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);

  useEffect(() => {
    if (!user || !requestId) return;
    api.get(`/oauth/consent-info?request_id=${encodeURIComponent(requestId)}`)
      .then((r) => {
        setInfo(r.data);
        // Default to exactly what the client asked for — the user can still
        // opt into anything else their role allows (e.g. "send") below.
        setSelectedScopes(r.data.requested_scopes.filter((s) => r.data.allowed_scopes.includes(s)));
      })
      .catch((err) => setError(err?.response?.data?.detail || "This authorization request has expired — go back and try connecting again."));
  }, [user, requestId]);

  const toggleScope = (scope) => {
    setSelectedScopes((cur) => cur.includes(scope) ? cur.filter((s) => s !== scope) : [...cur, scope]);
  };

  const doLogin = async (e) => {
    e.preventDefault();
    setLoginBusy(true);
    try {
      await login(email, password);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Login failed");
    } finally {
      setLoginBusy(false);
    }
  };

  const decide = async (approve) => {
    setBusy(true);
    try {
      const { data } = await api.post("/oauth/consent/approve", { request_id: requestId, approve, scopes: selectedScopes });
      window.location.href = data.redirect_url;
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Something went wrong — try connecting again.");
      setBusy(false);
    }
  };

  if (!requestId) {
    return <CenterCard><p className="text-body text-ink-muted">Missing authorization request.</p></CenterCard>;
  }
  if (loading) {
    return <CenterCard><Loader2 size={20} className="animate-spin text-ink-muted" /></CenterCard>;
  }

  if (!user) {
    return (
      <CenterCard>
        <InnoiraLogo size="sm" />
        <div className="text-section font-display font-semibold mt-4">Sign in to continue</div>
        <p className="text-caption text-ink-muted mb-4">An AI client wants to connect to your workspace — sign in first.</p>
        <form onSubmit={doLogin} className="space-y-3 w-full">
          <input required type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)}
            className="input-premium w-full" data-testid="oauth-consent-email" />
          <input required type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)}
            className="input-premium w-full" data-testid="oauth-consent-password" />
          <button type="submit" disabled={loginBusy} data-testid="oauth-consent-signin" className="btn-primary w-full justify-center">
            {loginBusy ? <Loader2 size={14} className="animate-spin" /> : "Sign in"}
          </button>
        </form>
      </CenterCard>
    );
  }

  if (error) {
    return <CenterCard><p className="text-body text-danger">{error}</p></CenterCard>;
  }
  if (!info) {
    return <CenterCard><Loader2 size={20} className="animate-spin text-ink-muted" /></CenterCard>;
  }

  return (
    <CenterCard wide>
      <InnoiraLogo size="sm" />
      <div className="text-section font-display font-semibold mt-4">
        <span className="text-accent">{info.client_name}</span> wants to access {info.workspace_name}
      </div>
      <p className="text-caption text-ink-muted mb-1">Signed in as {user.email}. Review what you're granting before continuing.</p>
      <p className="text-tiny text-ink-muted mb-5">{info.client_name} asked for {info.requested_scopes.join(", ") || "no scopes"} — you can grant more or less, up to what your role allows.</p>
      <div className="space-y-3 w-full mb-6 text-left">
        {ALL_SCOPES.map((scope) => {
          const s = SCOPE_INFO[scope] || { icon: ShieldCheck, label: scope, desc: "" };
          const Icon = s.icon;
          const allowed = info.allowed_scopes.includes(scope);
          const checked = selectedScopes.includes(scope);
          return (
            <label key={scope}
              className={`flex items-start gap-3 p-3 rounded-xl border border-line ${allowed ? "cursor-pointer hover:bg-ash" : "opacity-40 cursor-not-allowed"}`}>
              <input type="checkbox" className="mt-1 shrink-0" checked={allowed && checked} disabled={!allowed}
                onChange={() => toggleScope(scope)} data-testid={`oauth-consent-scope-${scope}`} />
              <Icon size={16} className="mt-0.5 shrink-0 text-ink-muted" />
              <div>
                <div className="text-body font-medium">{s.label}{!allowed && " — not available for your role"}</div>
                <div className="text-caption text-ink-muted">{s.desc}</div>
              </div>
            </label>
          );
        })}
      </div>
      <div className="flex gap-2 w-full">
        <button onClick={() => decide(false)} disabled={busy} data-testid="oauth-consent-deny" className="btn-secondary flex-1 justify-center">Deny</button>
        <button onClick={() => decide(true)} disabled={busy} data-testid="oauth-consent-approve" className="btn-primary flex-1 justify-center">
          {busy ? <Loader2 size={14} className="animate-spin" /> : "Allow"}
        </button>
      </div>
    </CenterCard>
  );
}
