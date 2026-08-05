import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { Table as TableIcon, TrendingUp, FileText, Receipt } from "../icons";
import Card from "../components/composites/Card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/composites/Tabs";

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

  if (loading) return <div className="animate-fade-in p-6 sm:p-8" style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Loading…</div>;

  return (
    <div>
      <PageHeader title="Financial Reports" subtitle="Trial balance, P&L, balance sheet, and AR aging." />
      <Tabs value={active} onValueChange={setActive}>
        <div className="px-6 sm:px-8">
          <TabsList>
            <TabsTrigger value="trial"><TableIcon size={14} strokeWidth={1.5} aria-hidden="true" /> Trial Balance</TabsTrigger>
            <TabsTrigger value="pnl"><TrendingUp size={14} strokeWidth={1.5} aria-hidden="true" /> P&amp;L</TabsTrigger>
            <TabsTrigger value="bs"><FileText size={14} strokeWidth={1.5} aria-hidden="true" /> Balance Sheet</TabsTrigger>
            <TabsTrigger value="ar"><Receipt size={14} strokeWidth={1.5} aria-hidden="true" /> AR Aging</TabsTrigger>
          </TabsList>
        </div>

        <div className="animate-fade-in px-6 sm:px-8 py-6">
          <TabsContent value="trial">
            {trialBalance && (
              <Card title="Trial Balance" action={
                <span style={{ fontSize: 11, color: trialBalance.balanced ? "var(--color-success)" : "var(--color-danger)" }}>
                  {trialBalance.balanced ? "Balanced" : "Not balanced"}
                </span>
              } padding="compact" bodyClassName="-mx-5">
                <div className="overflow-x-auto">
                  <table className="w-full" style={{ fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border-default)" }}>
                        <th style={{ textAlign: "left", padding: "8px 20px", fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)" }}>Account</th>
                        <th style={{ textAlign: "left", padding: "8px 0", fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)" }}>Type</th>
                        <th style={{ textAlign: "right", padding: "8px 0", fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)" }}>Debit</th>
                        <th style={{ textAlign: "right", padding: "8px 20px", fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)" }}>Credit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trialBalance.rows?.map((r, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                          <td style={{ padding: "8px 20px" }}><span className="tnum" style={{ fontFamily: "var(--font-mono)", color: "var(--text-tertiary)" }}>{r.code}</span> <span style={{ color: "var(--text-primary)" }}>{r.name}</span></td>
                          <td className="capitalize" style={{ padding: "8px 0", color: "var(--text-tertiary)" }}>{r.account_type}</td>
                          <td className="tnum" style={{ padding: "8px 0", textAlign: "right", fontFamily: "var(--font-mono)" }}>{r.debit > 0 ? `$${r.debit.toFixed(2)}` : ""}</td>
                          <td className="tnum" style={{ padding: "8px 20px", textAlign: "right", fontFamily: "var(--font-mono)" }}>{r.credit > 0 ? `$${r.credit.toFixed(2)}` : ""}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: "1px solid var(--border-default)", fontWeight: 700 }}>
                        <td style={{ padding: "8px 20px" }} colSpan={2}>Total</td>
                        <td className="tnum" style={{ padding: "8px 0", textAlign: "right", fontFamily: "var(--font-mono)" }}>${trialBalance.total_debit?.toFixed(2)}</td>
                        <td className="tnum" style={{ padding: "8px 20px", textAlign: "right", fontFamily: "var(--font-mono)" }}>${trialBalance.total_credit?.toFixed(2)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="pnl">
            {pnl && (
              <Card title="Profit & Loss">
                <div className="space-y-3" style={{ fontSize: 13 }}>
                  <div className="flex justify-between"><span style={{ color: "var(--text-secondary)" }}>Revenue</span><span className="tnum" style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--color-success-text)" }}>${pnl.revenue?.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span style={{ color: "var(--text-secondary)" }}>Expenses</span><span className="tnum" style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--color-danger)" }}>${pnl.expenses?.toFixed(2)}</span></div>
                  <div className="flex justify-between" style={{ borderTop: "1px solid var(--border-default)", paddingTop: 12 }}>
                    <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>Net Income</span>
                    <span className="tnum" style={{ fontSize: 20, fontWeight: 700, fontFamily: "var(--font-mono)", color: pnl.net_income >= 0 ? "var(--color-success-text)" : "var(--color-danger)" }}>${pnl.net_income?.toFixed(2)}</span>
                  </div>
                </div>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="bs">
            {balanceSheet && (
              <Card title="Balance Sheet">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    { label: "Assets", data: balanceSheet.assets },
                    { label: "Liabilities", data: balanceSheet.liabilities },
                    { label: "Equity", data: balanceSheet.equity },
                  ].map(({ label, data }) => (
                    <div key={label}>
                      <div style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-tertiary)", marginBottom: 8 }}>{label}</div>
                      {data?.items?.map((item, i) => (
                        <div key={i} className="flex justify-between" style={{ fontSize: 13, padding: "4px 0", borderBottom: "1px solid var(--border-subtle)" }}>
                          <span style={{ color: "var(--text-secondary)" }}>{item.name}</span><span className="tnum" style={{ fontFamily: "var(--font-mono)" }}>${item.balance?.toFixed(2)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between" style={{ fontSize: 13, fontWeight: 700, paddingTop: 8 }}>Total: <span className="tnum" style={{ fontFamily: "var(--font-mono)" }}>${data?.total?.toFixed(2)}</span></div>
                    </div>
                  ))}
                </div>
                <div className="text-center" style={{ marginTop: 16, fontSize: 11, color: balanceSheet.balanced ? "var(--color-success)" : "var(--color-danger)" }}>
                  {balanceSheet.balanced ? "Balance sheet is balanced" : "Balance sheet is not balanced"}
                </div>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="ar">
            {arAging && (
              <Card title="AR Aging">
                <div className="grid grid-cols-4 gap-4 text-center">
                  {[
                    { label: "0-30 days", key: "0_30" },
                    { label: "31-60 days", key: "31_60" },
                    { label: "61-90 days", key: "61_90" },
                    { label: "90+ days", key: "90_plus" },
                  ].map(({ label, key }) => (
                    <div key={key} style={{ background: "var(--bg-surface-sunken)", borderRadius: "var(--radius-lg)", padding: 16 }}>
                      <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{label}</div>
                      <div className="tnum" style={{ fontSize: 20, fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>${arAging.aging?.[key]?.toFixed(2)}</div>
                    </div>
                  ))}
                </div>
                <div className="text-right" style={{ marginTop: 16 }}>
                  <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Total AR: </span>
                  <span className="tnum" style={{ fontSize: 20, fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>${arAging.total_ar?.toFixed(2)}</span>
                </div>
              </Card>
            )}
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
