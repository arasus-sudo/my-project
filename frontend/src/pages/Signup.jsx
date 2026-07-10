import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { toast } from "sonner";
import { api } from "../lib/api";

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
      toast.success("Workspace ready. Let's teach the agent about your business.");
      nav("/onboarding");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Signup failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-bone flex">
      <div className="hidden md:flex md:w-1/2 border-r border-line p-16 flex-col justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-7 h-7 bg-ink text-bone flex items-center justify-center rounded-sm font-display font-bold">P</div>
          <span className="font-display font-bold tracking-tight">Pitch EQ</span>
        </Link>
        <div>
          <div className="ui-label text-sanguine mb-4">You're 60 seconds away</div>
          <p className="font-display text-3xl tracking-tight leading-tight">
            Higher reply rates. Cleaner inboxes. Deals that show up in your pipeline.
          </p>
          <ul className="mt-8 space-y-2 text-sm text-neutral-600">
            <li>→ EQ Score on every draft</li>
            <li>→ Multi-mailbox rotation with warmup</li>
            <li>→ Unified inbox + built-in CRM</li>
          </ul>
        </div>
        <div className="ui-label">Free 14-day trial · no card</div>
      </div>
      <div className="flex-1 flex items-center justify-center p-8">
        <form onSubmit={submit} className="w-full max-w-sm space-y-4">
          <div>
            <h1 className="text-3xl font-display font-bold tracking-tight">Create your workspace</h1>
            <p className="text-sm text-neutral-500 mt-1">One account, one workspace, one great outbound engine.</p>
          </div>
          <label className="block">
            <span className="ui-label">Your name</span>
            <input data-testid="signup-name" required value={form.name} onChange={set("name")} className="mt-1 w-full border border-line px-3 py-2 rounded-sm focus:outline-none focus:border-ink" />
          </label>
          <label className="block">
            <span className="ui-label">Workspace name</span>
            <input data-testid="signup-workspace" required value={form.workspace_name} onChange={set("workspace_name")} className="mt-1 w-full border border-line px-3 py-2 rounded-sm focus:outline-none focus:border-ink" placeholder="e.g. Acme Sales" />
          </label>
          <label className="block">
            <span className="ui-label">Email</span>
            <input data-testid="signup-email" type="email" required value={form.email} onChange={set("email")} className="mt-1 w-full border border-line px-3 py-2 rounded-sm focus:outline-none focus:border-ink" />
          </label>
          <label className="block">
            <span className="ui-label">Password</span>
            <input data-testid="signup-password" type="password" required minLength={6} value={form.password} onChange={set("password")} className="mt-1 w-full border border-line px-3 py-2 rounded-sm focus:outline-none focus:border-ink" />
          </label>
          <button data-testid="signup-submit" disabled={busy} type="submit" className="btn-primary w-full disabled:opacity-60">
            {busy ? "Creating…" : "Create workspace"}
          </button>
          <p className="text-sm text-neutral-500">
            Already have an account? <Link to="/login" className="text-sanguine hover:underline">Sign in</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
