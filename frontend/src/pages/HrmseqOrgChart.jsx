import { useEffect, useState, useMemo } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";

export default function HrmseqOrgChart() {
  const [data, setData] = useState({ nodes: [], departments: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/hrms-eq/org-chart").then((r) => { setData(r.data); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const byDept = useMemo(() => {
    const grouped = {};
    data.nodes.forEach((n) => {
      const d = n.department || "Unassigned";
      if (!grouped[d]) grouped[d] = [];
      grouped[d].push(n);
    });
    return grouped;
  }, [data.nodes]);

  if (loading) return <div className="animate-fade-in p-6 sm:p-8 text-ink-muted text-body">Loading…</div>;

  return (
    <div>
      <PageHeader title="Org Chart" subtitle="Company hierarchy by department." />
      <div className="animate-fade-in px-6 sm:px-8 space-y-6">
        {Object.entries(byDept).map(([dept, members]) => (
          <div key={dept} className="bg-white border border-line rounded-2xl p-6">
            <div className="text-card-title font-display font-semibold mb-4">{dept}</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {members.map((n) => (
                <div key={n.id} className="border border-line rounded-xl p-3">
                  <div className="text-body font-medium">{n.name}</div>
                  <div className="text-caption text-ink-muted">{n.position}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
        {data.nodes.length === 0 && <div className="text-body text-ink-muted">No employees to display.</div>}
      </div>
    </div>
  );
}
