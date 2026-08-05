import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { Database, FileText, Download, DollarSign, Building2 } from "../icons";
import MetricCard from "../components/composites/MetricCard";
import { EmptyState } from "../components/composites/EmptyState";

export default function AccountingOverview() {
  const nav = useNavigate();
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/accounting-eq/analytics").then((r) => { setAnalytics(r.data); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  return (
    <div>
      <PageHeader title="Accounting EQ" subtitle="Double-entry ledger, invoicing, AP bills, and financial reports." />
      <div className="animate-fade-in px-6 sm:px-8 py-6 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <MetricCard icon={Database} label="Accounts" value={loading ? "—" : (analytics?.total_accounts ?? 0)} />
          <MetricCard icon={FileText} label="Invoices" value={loading ? "—" : (analytics?.total_invoices ?? 0)} />
          <MetricCard icon={DollarSign} label="AR" value={loading ? "—" : (analytics?.total_ar ? `$${analytics.total_ar.toLocaleString()}` : "$0")} />
          <MetricCard icon={Download} label="Bills Due" value={loading ? "—" : (analytics?.unpaid_bills ?? 0)} />
          <MetricCard icon={Building2} label="Customers" value={loading ? "—" : (analytics?.total_customers ?? 0)} />
        </div>
        {!loading && !analytics?.total_accounts && (
          <EmptyState icon={Database} title="Get started with Accounting EQ" description="Set up your chart of accounts to begin tracking transactions."
            actionLabel="Create accounts" onAction={() => nav("/app/accounting-eq/chart-of-accounts")} />
        )}
      </div>
    </div>
  );
}
