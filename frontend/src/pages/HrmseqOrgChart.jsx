import { useEffect, useState, useMemo } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import Card from "../components/composites/Card";
import { EmptyState } from "../components/composites/EmptyState";

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

  if (loading) return <div className="animate-fade-in p-6 sm:p-8" style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Loading…</div>;

  return (
    <div>
      <PageHeader title="Org Chart" subtitle="Company hierarchy by department." />
      <div className="animate-fade-in px-6 sm:px-8 py-6 space-y-4">
        {data.nodes.length === 0 ? (
          <EmptyState title="No employees to display" description="Add employees to see your org chart by department." />
        ) : Object.entries(byDept).map(([dept, members]) => (
          <Card key={dept} title={dept}>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {members.map((n) => (
                <div key={n.id} style={{ border: "1px solid var(--border-default)", borderRadius: "var(--radius-lg)", padding: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>{n.name}</div>
                  <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{n.position}</div>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
