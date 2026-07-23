import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { Scale, TrendingUp, FileText, Receipt } from "lucide-react";

export default function AccountingReports() {
  const [trialBalance, setTrialBalance] = useState(null);
  const [pnl, setPnl] = useState(null);
  const [balanceSheet, setBalanceSheet] = useState(null);
  const [arAging, setArAging] = useState(null);
  const [active, setActive] = useState("trial");
  const [loading, setLoading] = useState(true);

  const load = async (signal) => {
    setLoading(true);
    try {
      const [tb, p, bs, ar] = await Promise.all([
        api.get("/accounting-eq/reports/trial-balance", { signal }),
        api.get("/accounting-eq/reports/pnl", { signal }),
        api.get("/accounting-eq/reports/balance-sheet", { signal }),
        api.get("/accounting-eq/reports/ar-aging", { signal }),
      ]);
      if (signal.aborted) return;
      setTrialBalance(tb.data);
      setPnl(p.data);
      setBalanceSheet(bs.data);
      setArAging(ar.data);
    } catch (e) { if (e.name !== "CanceledError") {} }
    if (!signal.aborted) setLoading(false);
  };
  useEffect(() => { const c = new AbortController(); load(c.signal); return () => c.abort(); }, []);

  const REPORTS = [
    { k: "trial", label: "Trial Balance", icon: Scale },
    { k: "pnl", label: "P&L", icon: TrendingUp },
    { k: "bs", label: "Balance Sheet", icon: FileText },
    { k: "ar", label: "AR Aging", icon: Receipt },
  ];

  if (loading) return <div className="animate-fade-in p-6 sm:p-8 text-ink-muted text-body">Loading…</div>;

  return (
    <div>
      <PageHeader title="Financial Reports" subtitle="Trial balance, P&L, balance sheet, and AR aging." />
      <div className="animate-fade-in px-6 sm:px-8 space-y-6">
        <div className="flex gap-2 flex-wrap">
          {REPORTS.map((r) => (
            <button key={r.k} onClick={() => setActive(r.k)} className={`btn-secondary flex items-center gap-2 ${active === r.k ? "bg-accent text-white" : ""}`}>
              <r.icon size={14} /> {r.label}
            </button>
          ))}
        </div>

        {active === "trial" && trialBalance && (
          <div className="bg-white border border-line rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-line flex items-center justify-between">
              <span className="text-card-title font-display font-semibold">Trial Balance</span>
              <span className={`text-tiny ${trialBalance.balanced ? "text-success" : "text-danger"}`}>
                {trialBalance.balanced ? "Balanced" : "Not balanced"}
              </span>
            </div>
            <table className="w-full text-body">
              <thead><tr className="border-b border-line bg-ash text-left">
                <th className="table-header p-3">Account</th><th className="table-header p-3">Type</th><th className="table-header p-3 text-right">Debit</th><th className="table-header p-3 text-right">Credit</th>
              </tr></thead>
              <tbody>
                {trialBalance.rows?.map((r, i) => (
                  <tr key={i} className="border-b border-line last:border-0">
                    <td className="p-3"><span className="font-mono">{r.code}</span> {r.name}</td>
                    <td className="p-3 text-ink-muted">{r.account_type}</td>
                    <td className="p-3 text-right font-mono">{r.debit > 0 ? `$${r.debit.toFixed(2)}` : ""}</td>
                    <td className="p-3 text-right font-mono">{r.credit > 0 ? `$${r.credit.toFixed(2)}` : ""}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-line font-bold">
                  <td className="p-3" colSpan={2}>Total</td>
                  <td className="p-3 text-right font-mono">${trialBalance.total_debit?.toFixed(2)}</td>
                  <td className="p-3 text-right font-mono">${trialBalance.total_credit?.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {active === "pnl" && pnl && (
          <div className="bg-white border border-line rounded-2xl p-6">
            <div className="text-card-title font-display font-semibold mb-4">Profit & Loss</div>
            <div className="space-y-3 text-body">
              <div className="flex justify-between"><span>Revenue</span><span className="font-mono font-bold text-green-600">${pnl.revenue?.toFixed(2)}</span></div>
              <div className="flex justify-between"><span>Expenses</span><span className="font-mono font-bold text-red-600">${pnl.expenses?.toFixed(2)}</span></div>
              <div className="border-t border-line pt-3 flex justify-between">
                <span className="font-bold">Net Income</span>
                <span className={`text-section font-bold font-mono ${pnl.net_income >= 0 ? "text-green-600" : "text-red-600"}`}>${pnl.net_income?.toFixed(2)}</span>
              </div>
            </div>
          </div>
        )}

        {active === "bs" && balanceSheet && (
          <div className="bg-white border border-line rounded-2xl p-6">
            <div className="text-card-title font-display font-semibold mb-4">Balance Sheet</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <div className="ui-label mb-2">Assets</div>
                {balanceSheet.assets?.items?.map((a, i) => (
                  <div key={i} className="flex justify-between text-body py-1 border-b border-line last:border-0">
                    <span>{a.name}</span><span className="font-mono">${a.balance?.toFixed(2)}</span>
                  </div>
                ))}
                <div className="flex justify-between text-body font-bold pt-2">Total: <span className="font-mono">${balanceSheet.assets?.total?.toFixed(2)}</span></div>
              </div>
              <div>
                <div className="ui-label mb-2">Liabilities</div>
                {balanceSheet.liabilities?.items?.map((l, i) => (
                  <div key={i} className="flex justify-between text-body py-1 border-b border-line last:border-0">
                    <span>{l.name}</span><span className="font-mono">${l.balance?.toFixed(2)}</span>
                  </div>
                ))}
                <div className="flex justify-between text-body font-bold pt-2">Total: <span className="font-mono">${balanceSheet.liabilities?.total?.toFixed(2)}</span></div>
              </div>
              <div>
                <div className="ui-label mb-2">Equity</div>
                {balanceSheet.equity?.items?.map((e, i) => (
                  <div key={i} className="flex justify-between text-body py-1 border-b border-line last:border-0">
                    <span>{e.name}</span><span className="font-mono">${e.balance?.toFixed(2)}</span>
                  </div>
                ))}
                <div className="flex justify-between text-body font-bold pt-2">Total: <span className="font-mono">${balanceSheet.equity?.total?.toFixed(2)}</span></div>
              </div>
            </div>
            <div className={`mt-4 text-center text-tiny ${balanceSheet.balanced ? "text-success" : "text-danger"}`}>
              {balanceSheet.balanced ? "Balance sheet is balanced" : "Balance sheet is not balanced"}
            </div>
          </div>
        )}

        {active === "ar" && arAging && (
          <div className="bg-white border border-line rounded-2xl p-6">
            <div className="text-card-title font-display font-semibold mb-4">AR Aging</div>
            <div className="grid grid-cols-4 gap-4 text-center">
              <div className="bg-ash rounded-xl p-4">
                <div className="ui-label">0-30 days</div>
                <div className="text-section font-bold font-mono">${arAging.aging?.["0_30"]?.toFixed(2)}</div>
              </div>
              <div className="bg-ash rounded-xl p-4">
                <div className="ui-label">31-60 days</div>
                <div className="text-section font-bold font-mono">${arAging.aging?.["31_60"]?.toFixed(2)}</div>
              </div>
              <div className="bg-ash rounded-xl p-4">
                <div className="ui-label">61-90 days</div>
                <div className="text-section font-bold font-mono">${arAging.aging?.["61_90"]?.toFixed(2)}</div>
              </div>
              <div className="bg-ash rounded-xl p-4">
                <div className="ui-label">90+ days</div>
                <div className="text-section font-bold font-mono">${arAging.aging?.["90_plus"]?.toFixed(2)}</div>
              </div>
            </div>
            <div className="mt-4 text-right">
              <span className="ui-label">Total AR: </span>
              <span className="text-section font-bold font-mono">${arAging.total_ar?.toFixed(2)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
