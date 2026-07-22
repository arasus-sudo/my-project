import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Coins } from "lucide-react";
import { api, CREDITS_CHANGED_EVENT, OUT_OF_CREDITS_EVENT } from "../lib/api";

export const fmt = (n) => (typeof n === "number" ? n.toLocaleString() : "—");

/** Live credit balance, refreshed whenever an agent spends. Sits in the suite
 *  and agent headers so the balance is never more than a glance away. */
export function CreditPill({ compact = false }) {
  const [sub, setSub] = useState(null);

  const load = useCallback(() => {
    api.get("/billing/subscription").then((r) => setSub(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const onChange = () => load();
    window.addEventListener(CREDITS_CHANGED_EVENT, onChange);
    window.addEventListener(OUT_OF_CREDITS_EVENT, onChange);
    return () => {
      window.removeEventListener(CREDITS_CHANGED_EVENT, onChange);
      window.removeEventListener(OUT_OF_CREDITS_EVENT, onChange);
    };
  }, [load]);

  if (!sub) return null;
  const balance = Math.max(0, sub.balance);
  const pct = sub.allowance ? Math.max(0, Math.min(100, (balance / sub.allowance) * 100)) : 0;
  const low = pct < 15;

  return (
    <Link
      to="/billing"
      data-testid="credit-pill"
      title={`${fmt(balance)} of ${fmt(sub.allowance)} credits left on ${sub.plan.name}`}
      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 transition-colors ${
        low ? "border-warning/40 bg-warning/10 hover:bg-warning/20" : "border-line bg-white hover:bg-surfacehover"
      }`}
    >
      <Coins size={14} className={`shrink-0 ${low ? "text-warning" : "text-neutral-500"}`} />
      <span className={`text-xs font-semibold tabular-nums leading-none ${low ? "text-warning" : "text-ink"}`} data-testid="credit-balance">
        {fmt(balance)}
      </span>
      {!compact && (
        <span className="text-[10px] text-neutral-400 font-mono uppercase tracking-wider leading-none border-l border-line pl-2">
          {sub.plan.name}
        </span>
      )}
    </Link>
  );
}

/** Mounted once at the app root. Turns any 402 from any agent into one clear
 *  message naming what was refused and how short the balance was. */
export function OutOfCreditsWatcher() {
  const nav = useNavigate();

  useEffect(() => {
    const onOut = (e) => {
      const { action_label, needed, balance } = e.detail || {};
      toast.error("Out of credits", {
        id: "out-of-credits",
        description: `${action_label || "That action"} costs ${fmt(needed)} credits — you have ${fmt(
          Math.max(0, balance || 0)
        )}.`,
        action: { label: "Top up", onClick: () => nav("/billing") },
        duration: 8000,
      });
    };
    window.addEventListener(OUT_OF_CREDITS_EVENT, onOut);
    return () => window.removeEventListener(OUT_OF_CREDITS_EVENT, onOut);
  }, [nav]);

  return null;
}
