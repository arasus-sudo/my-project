import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { BookOpen, FileText, FileDown, DollarSign, Building2 } from "lucide-react";

export default function AccountingOverview() {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/accounting-eq/analytics").then((r) => { setAnalytics(r.data); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  return (
    <div>
      <PageHeader title="Accounting EQ" subtitle="Double-entry ledger, invoicing, AP bills, and financial reports." />
      <div className="animate-fade-in px-6 sm:px-8 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <StatCard icon={BookOpen} label="Accounts" value={loading ? "—" : (analytics?.total_accounts ?? 0)} />
          <StatCard icon={FileText} label="Invoices" value={loading ? "—" : (analytics?.total_invoices ?? 0)} />
          <StatCard icon={DollarSign} label="AR" value={loading ? "—" : (analytics?.total_ar ? `$${analytics.total_ar.toLocaleString()}` : "$0")} />
          <StatCard icon={FileDown} label="Bills Due" value={loading ? "—" : (analytics?.unpaid_bills ?? 0)} />
          <StatCard icon={Building2} label="Customers" value={loading ? "—" : (analytics?.total_customers ?? 0)} />
        </div>
        {!loading && !analytics?.total_accounts && (
          <div className="shadow-card p-10 text-center rounded-2xl">
            <div className="text-section font-display font-semibold">Get started with Accounting EQ</div>
            <p className="text-caption text-ink-muted mt-2">Set up your chart of accounts to begin tracking transactions.</p>
            <Link to="/app/accounting-eq/chart-of-accounts" className="btn-primary mt-6 inline-flex">Create accounts</Link>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }) {
  return (
    <div className="shadow-card p-4 rounded-2xl">
      <div className="flex items-center gap-2 text-ink-muted">
        <Icon size={14} />
        <span className="ui-label">{label}</span>
      </div>
      <div className="text-section font-display font-bold mt-1">{value}</div>
    </div>
  );
}
