"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await login(email, password);
      toast.success("Welcome back");
      router.push("/app");
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Login failed";
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-bone flex">
      <div className="hidden md:flex md:w-1/2 border-r border-line p-16 flex-col justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 bg-ink text-bone flex items-center justify-center rounded-sm font-display font-bold">
            P
          </div>
          <span className="font-display font-bold tracking-tight">Pitch EQ</span>
        </Link>
        <div>
          <div className="ui-label text-sanguine mb-4">A note from us</div>
          <p className="font-display text-3xl tracking-tight leading-tight">
            The best cold emails don&apos;t feel cold. They feel like a person paid attention.
          </p>
          <p className="mt-6 text-sm text-neutral-500 font-mono">— The Pitch EQ team</p>
        </div>
        <div className="ui-label">Signal over noise</div>
      </div>
      <div className="flex-1 flex items-center justify-center p-8">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5">
          <div>
            <h1 className="text-3xl font-display font-bold tracking-tight">Sign in</h1>
            <p className="text-sm text-neutral-500 mt-1">Welcome back. Let&apos;s get replies.</p>
          </div>
          <label className="block">
            <span className="ui-label">Email</span>
            <input
              data-testid="login-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full border border-line px-3 py-2 rounded-sm focus:outline-none focus:border-ink"
            />
          </label>
          <label className="block">
            <span className="ui-label">Password</span>
            <input
              data-testid="login-password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full border border-line px-3 py-2 rounded-sm focus:outline-none focus:border-ink"
            />
          </label>
          <button
            data-testid="login-submit"
            disabled={busy}
            type="submit"
            className="btn-primary w-full disabled:opacity-60"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <p className="text-sm text-neutral-500">
            New here?{" "}
            <Link href="/signup" className="text-sanguine hover:underline">
              Create an account
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
