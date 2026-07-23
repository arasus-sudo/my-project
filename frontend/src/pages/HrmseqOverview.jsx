import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { Users, Building2, FileSearch, CalendarDays, Briefcase } from "lucide-react";

export default function HrmseqOverview() {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/hrms-eq/analytics").then((r) => { setAnalytics(r.data); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  return (
    <div>
      <PageHeader title="HRMS EQ" subtitle="Employee lifecycle, recruitment, leave, and performance management." />
      <div className="animate-fade-in px-6 sm:px-8 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <StatCard icon={Users} label="Employees" value={loading ? "—" : (analytics?.total_employees ?? 0)} />
          <StatCard icon={Building2} label="Departments" value={loading ? "—" : (analytics?.total_departments ?? 0)} />
          <StatCard icon={Briefcase} label="Open Reqs" value={loading ? "—" : (analytics?.open_requisitions ?? 0)} />
          <StatCard icon={FileSearch} label="Candidates" value={loading ? "—" : (analytics?.total_candidates ?? 0)} />
          <StatCard icon={CalendarDays} label="Leave Pending" value={loading ? "—" : (analytics?.pending_leave ?? 0)} />
        </div>
        {!loading && !analytics?.total_employees && (
          <div className="shadow-card p-10 text-center rounded-2xl">
            <div className="text-section font-display font-semibold">Get started with HRMS EQ</div>
            <p className="text-caption text-ink-muted mt-2">Add departments and employees to manage your workforce.</p>
            <Link to="/app/hrms-eq/employees" className="btn-primary mt-6 inline-flex">Add employees</Link>
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
