import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft, LogOut, Coins, Check, Loader2, Zap, Receipt, TrendingUp, ExternalLink,
} from "lucide-react";
import { api, notifyCreditsChanged } from "../lib/api";
import { useAuth } from "../lib/auth";
import { AGENT_BADGE } from "../components/AppLayout";
import { fmt } from "../components/Credits";

const AGENT_NAME = {
  pitch: "Pitch EQ", create: "Create EQ", voice: "Voice EQ",
  schedule: "Schedule EQ", proposal: "Proposal EQ", social: "Social EQ",
};

export default function Billing() {
  const { user, workspace, logout } = useAuth();
  const [sub, setSub] = useState(null);
  const [plans, setPlans] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [usage, setUsage] = useState([]);
  const [annual, setAnnual] = useState(false);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    const [s, p, l, u] = await Promise.all([
      api.get("/billing/subscription"),
      api.get("/billing/plans"),
      api.get("/billing/ledger", { params: { limit: 60 } }),
      api.get("/billing/usage"),
    ]);
    setSub(s.data); setPlans(p.data); setLedger(l.data); setUsage(u.data);
  }, []);

  useEffect(() => { load().catch(() => toast.error("Could not load billing")); }, [load]);

  const upgrade = async (planId) => {
    setBusy(planId);
    try {
      const { data } = await api.post("/billing/checkout", { plan_id: planId, annual });
      if (data.url) { window.location.href = data.url; return; }  // Stripe's hosted page
      toast.success("Plan activated");
      await load();
      notifyCreditsChanged();
    } catch {
      toast.error("Could not start checkout");
    } finally { setBusy(""); }
  };

  const buyPack = async (packId) => {
    setBusy(packId);
    try {
      const { data } = await api.post("/billing/topup", { pack_id: packId });
      if (data.url) { window.location.href = data.url; return; }
      toast.success(`${fmt(data.granted)} credits added`);
      await load();
      notifyCreditsChanged();
    } catch {
      toast.error("Could not start top-up");
    } finally { setBusy(""); }
  };

  const openPortal = async () => {
    const { data } = await api.post("/billing/portal");
    if (data.url) window.location.href = data.url;
    else toast.info("Payment management opens here once a card is on file.");
  };

  if (!sub || !plans) {
    return <div className="min-h-screen bg-bone flex items-center justify-center">
      <Loader2 className="animate-spin text-ink-muted" />
    </div>;
  }

  const balance = Math.max(0, sub.balance);
  const used = Math.max(0, sub.allowance - balance);
  const pct = sub.allowance ? Math.min(100, (used / sub.allowance) * 100) : 0;
  const maxUsage = Math.max(1, ...usage.map((u) => u.credits));

  return (
    <div className="min-h-screen bg-bone animate-fade-in">
      <div className="border-b border-line bg-white">
        <div className="max-w-6xl mx-auto px-6 sm:px-8 py-3 flex items-center justify-between">
          <Link to="/suite" data-testid="billing-back" className="flex items-center gap-2 text-caption text-ink-muted hover:text-ink">
            <ArrowLeft size={16} /> Command center
          </Link>
          <div className="flex items-center gap-3">
            <div className="text-right leading-tight">
              <div className="text-caption font-medium">{user?.name}</div>
              <div className="text-tiny text-ink-muted">{workspace?.name}</div>
            </div>
            <button onClick={logout} className="p-1.5 text-ink-muted hover:text-ink hover:bg-surfacehover rounded-xl transition-colors duration-150">
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 sm:px-8 py-6 sm:py-8 space-y-8">
        <div>
          <h1 className="text-page-title font-display">Plan &amp; credits</h1>
          <p className="text-caption text-ink-muted mt-1">
            Every agent action spends credits from your monthly allowance. Credits reset each cycle.
          </p>
        </div>

        {/* Balance meter */}
        <div className="card-flat shadow-card p-4 sm:p-6" data-testid="billing-balance">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <div className="ui-label flex items-center gap-1.5"><Coins size={12} /> Credits remaining</div>
              <div className="font-display text-2xl sm:text-3xl font-bold mt-1 tabular-nums" data-testid="billing-balance-value">
                {fmt(balance)}
              </div>
              <div className="text-caption text-ink-muted mt-1">
                {fmt(used)} of {fmt(sub.allowance)} used this cycle
                {sub.renews_at && <> · renews {new Date(sub.renews_at).toLocaleDateString()}</>}
              </div>
            </div>
            <div className="text-left sm:text-right">
              <div className="ui-label">Current plan</div>
              <div className="font-display font-semibold text-card-title mt-1" data-testid="billing-plan-name">{sub.plan.name}</div>
              <div className="text-caption text-ink-muted">
                {sub.plan.price_monthly ? `$${sub.plan.price_monthly}/mo` : "Free"} ·{" "}
                {sub.plan.seats === 0 ? "Unlimited seats" : `${sub.plan.seats} seat${sub.plan.seats > 1 ? "s" : ""}`}
              </div>
              {sub.plan.id !== "trial" && (
                <button onClick={openPortal} className="text-caption text-ink-muted hover:text-ink mt-1 inline-flex items-center gap-1">
                  Manage payment <ExternalLink size={12} />
                </button>
              )}
            </div>
          </div>
          <div className="h-2 rounded-full bg-neutral-100 overflow-hidden mt-5">
            <div
              className={`h-full rounded-full transition-all ${pct > 85 ? "bg-warning" : "bg-accent"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          {balance === 0 && (
            <div className="mt-4 text-caption text-warning bg-warning/10 border border-warning/30 rounded-xl px-3 py-2">
              You're out of credits. Agents are paused until you top up or upgrade.
            </div>
          )}
        </div>

        {/* Plans */}
        <div>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="font-display font-semibold text-card-title">Plans</h2>
            <div className="flex items-center gap-1 rounded-full border border-line bg-white p-1 text-caption">
              <button onClick={() => setAnnual(false)} data-testid="billing-monthly"
                className={`px-3 py-1 rounded-xl ${!annual ? "bg-ink text-white" : "text-ink-muted"}`}>Monthly</button>
              <button onClick={() => setAnnual(true)} data-testid="billing-annual"
                className={`px-3 py-1 rounded-xl ${annual ? "bg-ink text-white" : "text-ink-muted"}`}>Annual · save 20%</button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
            {plans.plans.filter((p) => p.id !== "trial" || sub.plan.id === "trial").map((p) => {
              const current = p.id === sub.plan.id;
              const price = annual ? p.price_annual : p.price_monthly;
              return (
                <div key={p.id} data-testid={`plan-${p.id}`}
                  className={`card-flat shadow-card p-4 sm:p-5 flex flex-col relative ${p.popular ? "ring-1 ring-accent" : ""}`}>
                  {p.popular && (
                    <div className="absolute -top-2 left-5 bg-accent text-white text-tiny font-mono uppercase tracking-wider px-2 py-0.5 rounded-full">
                      Most popular
                    </div>
                  )}
                  <div className="font-display font-semibold">{p.name}</div>
                  <div className="mt-2">
                    <span className="font-display text-2xl sm:text-3xl font-bold">{price ? `$${price}` : "$0"}</span>
                    <span className="text-caption text-ink-muted">/mo</span>
                  </div>
                  {annual && p.price_annual > 0 && (
                    <div className="text-tiny text-ink-muted">billed annually</div>
                  )}
                  <p className="text-caption text-ink-muted mt-3 min-h-[32px]">{p.blurb}</p>
                  <ul className="text-caption space-y-1.5 mt-4 flex-1">
                    <li className="flex items-center gap-1.5"><Check size={12} className="text-accent" /> {fmt(p.credits)} credits / month</li>
                    <li className="flex items-center gap-1.5"><Check size={12} className="text-accent" /> {p.seats === 0 ? "Unlimited seats" : `${p.seats} seat${p.seats > 1 ? "s" : ""}`}</li>
                    <li className="flex items-center gap-1.5"><Check size={12} className="text-accent" /> All six agents</li>
                  </ul>
                  <button
                    disabled={current || busy === p.id || p.id === "trial"}
                    onClick={() => upgrade(p.id)}
                    data-testid={`plan-${p.id}-cta`}
                    className={`mt-5 w-full text-caption py-2 rounded-xl font-medium disabled:opacity-50 ${
                      current ? "border border-line text-ink-muted" : "btn-primary"
                    }`}
                  >
                    {busy === p.id ? "…" : current ? "Current plan" : p.id === "trial" ? "Trial" : `Switch to ${p.name}`}
                  </button>
                </div>
              );
            })}
          </div>
          <p className="text-caption text-ink-muted mt-4">
            Need more than Scale, SSO, or a private deployment?{" "}
            <a href="mailto:hello@innoira.com" className="text-ink hover:underline">Talk to us about Enterprise</a>.
          </p>
        </div>

        {/* Top-ups */}
        <div>
          <h2 className="font-display font-semibold text-card-title">Top up</h2>
          <p className="text-caption text-ink-muted mt-1">One-off credits that land immediately. Your plan doesn't change.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
            {plans.topups.map((t) => (
              <div key={t.id} className="card-flat shadow-card p-4 sm:p-5 flex items-center justify-between" data-testid={`topup-${t.id}`}>
                <div>
                  <div className="font-display font-semibold">{fmt(t.credits)}</div>
                  <div className="text-caption text-ink-muted">credits · ${t.price}</div>
                </div>
                <button onClick={() => buyPack(t.id)} disabled={busy === t.id}
                  data-testid={`topup-${t.id}-cta`}
                  className="btn-primary text-caption px-4 py-2 rounded-xl disabled:opacity-50">
                  {busy === t.id ? "…" : "Buy"}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* What burns credits */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card-flat shadow-card p-4 sm:p-6">
            <h2 className="font-display font-semibold text-card-title flex items-center gap-2">
              <TrendingUp size={16} /> Where your credits went
            </h2>
            {usage.length === 0 ? (
              <p className="text-caption text-ink-muted mt-3">No credits spent yet.</p>
            ) : (
              <div className="space-y-3 mt-4" data-testid="billing-usage">
                {usage.map((u) => (
                  <div key={u.action}>
                    <div className="flex items-center justify-between text-caption">
                      <span className="flex items-center gap-2">
                        {u.agent && (
                          <span className="w-4 h-4 rounded bg-accent text-white text-tiny flex items-center justify-center font-mono">
                            {AGENT_BADGE[u.agent] || "·"}
                          </span>
                        )}
                        {u.label}
                        <span className="text-ink-muted">×{u.count}</span>
                      </span>
                      <span className="tabular-nums font-medium">{fmt(u.credits)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-neutral-100 mt-1.5 overflow-hidden">
                      <div className="h-full bg-ink rounded-full" style={{ width: `${(u.credits / maxUsage) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card-flat shadow-card p-4 sm:p-6">
            <h2 className="font-display font-semibold text-card-title flex items-center gap-2">
              <Zap size={16} /> What each action costs
            </h2>
            <p className="text-caption text-ink-muted mt-1">
              Priced off what the action actually costs to run. Exports, CRM writes and bookings are free.
            </p>
            <div className="mt-4 divide-y divide-line">
              {plans.credit_costs.map((c) => (
                <div key={c.action} className="flex items-center justify-between py-2 text-caption">
                  <span className="flex items-center gap-2">
                    {c.agent && (
                      <span className="w-4 h-4 rounded bg-neutral-200 text-ink-secondary text-tiny flex items-center justify-center font-mono">
                        {AGENT_BADGE[c.agent] || "·"}
                      </span>
                    )}
                    {c.label}
                  </span>
                  <span className="tabular-nums font-medium">{c.credits}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Ledger */}
        <div className="card-flat shadow-card p-4 sm:p-6">
          <h2 className="font-display font-semibold text-card-title flex items-center gap-2">
            <Receipt size={16} /> Activity
          </h2>
          {ledger.length === 0 ? (
            <p className="text-caption text-ink-muted mt-3">Nothing yet.</p>
          ) : (
            <div className="overflow-x-auto card-floating mt-4">
              <table className="w-full text-table" data-testid="billing-ledger">
                <thead>
                  <tr className="text-left border-b border-line">
                    <th className="pb-2 table-header">When</th>
                    <th className="pb-2 table-header">Action</th>
                    <th className="pb-2 table-header">Agent</th>
                    <th className="pb-2 table-header text-right">Credits</th>
                    <th className="pb-2 table-header text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {ledger.map((l) => (
                    <tr key={l.id}>
                      <td className="py-2 text-ink-muted whitespace-nowrap">
                        {new Date(l.at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="py-2">{l.reason}{l.units > 1 ? ` (${l.units}×)` : ""}</td>
                      <td className="py-2 text-ink-muted">{AGENT_NAME[l.agent] || "—"}</td>
                      <td className={`py-2 text-right tabular-nums font-medium ${l.delta > 0 ? "text-success" : ""}`}>
                        {l.delta > 0 ? `+${fmt(l.delta)}` : fmt(l.delta)}
                      </td>
                      <td className="py-2 text-right tabular-nums text-ink-muted">{fmt(l.balance_after)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
