import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { toast } from "sonner";
import InnoiraLogo from "../components/InnoiraLogo";
import GoogleSignInButton from "../components/GoogleSignInButton";

const AGENT_LINES = [
  ["Pitch EQ", "cold email that reads human"],
  ["Voice EQ", "AI calls that qualify leads"],
  ["Schedule EQ", "meetings that book themselves"],
  ["Proposal EQ", "decks drafted from your CRM"],
  ["Create EQ", "carousels & content on brand"],
  ["Social EQ", "posts queued, approved, shipped"],
];

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await login(email, password);
      toast.success("Welcome back");
      nav("/suite");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-bone flex animate-fade-in">
      <div className="hidden md:flex md:w-1/2 border-r border-line p-16 flex-col justify-between bg-gradient-to-b from-white to-ash">
        <Link to="/"><InnoiraLogo size="sm" /></Link>
        <div>
          <div className="ui-label text-ink mb-5">One login, every agent</div>
          <p className="font-display text-app-title leading-tight max-w-md">
            Your AI revenue team is already at its desk.
          </p>
          <ul className="mt-8 space-y-2.5 text-body text-ink-muted">
            {AGENT_LINES.map(([name, tag]) => (
              <li key={name} className="flex gap-3 items-baseline">
                <span className="font-display font-semibold text-ink w-28 shrink-0">{name}</span>
                <span>{tag}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="ui-label">© Innoira Consulting Services</div>
      </div>
      <div className="flex-1 flex items-center justify-center p-8 animate-fade-up">
        <div className="w-full max-w-sm space-y-6">
          <div className="md:hidden mb-2 text-center"><Link to="/"><InnoiraLogo size="sm" /></Link></div>
          <div>
            <h1 className="text-page-title font-display">Sign in</h1>
            <p className="text-caption text-ink-muted mt-1">Welcome back to your suite.</p>
          </div>
          <GoogleSignInButton text="signin_with" />
          <form onSubmit={submit} className="space-y-5">
            <label className="block">
              <span className="form-label">Email</span>
              <input data-testid="login-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                className="input-premium mt-1 w-full px-3 py-2" />
            </label>
            <label className="block">
              <span className="form-label">Password</span>
              <input data-testid="login-password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                className="input-premium mt-1 w-full px-3 py-2" />
            </label>
            <button data-testid="login-submit" disabled={busy} type="submit" className="btn-primary w-full disabled:opacity-60">
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
          <p className="text-caption text-ink-muted">
            New here? <Link to="/signup" className="text-ink hover:underline">Create an account</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
