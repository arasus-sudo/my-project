import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { Users, Building2, Search, CalendarDays, Briefcase } from "../icons";
import MetricCard from "../components/composites/MetricCard";
import { EmptyState } from "../components/composites/EmptyState";

export default function HrmseqOverview() {
  const nav = useNavigate();
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/hrms-eq/analytics").then((r) => { setAnalytics(r.data); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  return (
    <div>
      <PageHeader title="HRMS EQ" subtitle="Employee lifecycle, recruitment, leave, and performance management." />
      <div className="animate-fade-in px-6 sm:px-8 py-6 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <MetricCard icon={Users} label="Employees" value={loading ? "—" : (analytics?.total_employees ?? 0)} />
          <MetricCard icon={Building2} label="Departments" value={loading ? "—" : (analytics?.total_departments ?? 0)} />
          <MetricCard icon={Briefcase} label="Open Reqs" value={loading ? "—" : (analytics?.open_requisitions ?? 0)} />
          <MetricCard icon={Search} label="Candidates" value={loading ? "—" : (analytics?.total_candidates ?? 0)} />
          <MetricCard icon={CalendarDays} label="Leave Pending" value={loading ? "—" : (analytics?.pending_leave ?? 0)} />
        </div>
        {!loading && !analytics?.total_employees && (
          <EmptyState icon={Users} title="Get started with HRMS EQ" description="Add departments and employees to manage your workforce."
            actionLabel="Add employees" onAction={() => nav("/app/hrms-eq/employees")} />
        )}
      </div>
    </div>
  );
}
