import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { toast } from "sonner";
import InnoiraLogo from "../components/InnoiraLogo";
import GoogleSignInButton from "../components/GoogleSignInButton";

export default function Signup() {
  const { signup } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", workspace_name: "" });
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await signup(form);
      toast.success("Workspace ready. Let's teach the agents about your business.");
      nav("/onboarding");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Signup failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-bone flex animate-fade-in">
      <div className="hidden md:flex md:w-1/2 border-r border-line p-16 flex-col justify-between bg-gradient-to-b from-white to-ash">
        <Link to="/"><InnoiraLogo size="sm" /></Link>
        <div>
          <div className="ui-label text-ink mb-5">You're 60 seconds away</div>
          <p className="font-display text-app-title leading-tight max-w-md">
            Six AI agents. One pipeline. Zero copy-pasting between tools.
          </p>
          <ul className="mt-8 space-y-2 text-body text-ink-muted">
            <li>→ Outbound email, AI calling, scheduling, proposals, content and social — under one login</li>
            <li>→ A shared CRM every agent reads from and writes back to</li>
            <li>→ A qualified call can auto-draft the proposal and queue the booking link</li>
          </ul>
        </div>
        <div className="ui-label">Free 14-day trial · 500 credits · no card</div>
      </div>
      <div className="flex-1 flex items-center justify-center p-8 animate-fade-up">
        <div className="w-full max-w-sm space-y-6">
          <div className="md:hidden mb-2 text-center"><Link to="/"><InnoiraLogo size="sm" /></Link></div>
          <div>
            <h1 className="text-page-title font-display">Create your workspace</h1>
            <p className="text-caption text-ink-muted mt-1">One account, every agent in the suite.</p>
          </div>
          <GoogleSignInButton text="signup_with" />
          <form onSubmit={submit} className="space-y-5">
            <label className="block">
              <span className="form-label">Your name</span>
              <input data-testid="signup-name" required value={form.name} onChange={set("name")} className="input-premium mt-1 w-full px-3 py-2" />
            </label>
            <label className="block">
              <span className="form-label">Workspace name</span>
              <input data-testid="signup-workspace" required value={form.workspace_name} onChange={set("workspace_name")} className="input-premium mt-1 w-full px-3 py-2" placeholder="e.g. Acme Sales" />
            </label>
            <label className="block">
              <span className="form-label">Email</span>
              <input data-testid="signup-email" type="email" required value={form.email} onChange={set("email")} className="input-premium mt-1 w-full px-3 py-2" />
            </label>
            <label className="block">
              <span className="form-label">Password</span>
              <input data-testid="signup-password" type="password" required minLength={6} value={form.password} onChange={set("password")} className="input-premium mt-1 w-full px-3 py-2" />
            </label>
            <button data-testid="signup-submit" disabled={busy} type="submit" className="btn-primary w-full disabled:opacity-60">
              {busy ? "Creating…" : "Create workspace"}
            </button>
          </form>
          <p className="text-caption text-ink-muted">
            Already have an account? <Link to="/login" className="text-ink hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
