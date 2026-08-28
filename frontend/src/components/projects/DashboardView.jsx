import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend } from "recharts";

/* DashboardView — burndown + velocity. Fetches /{pid}/stats on mount so the
 * chart reflects server-side burndown (created vs done per day, last 14).
 */

export default function DashboardView({ project }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get(`/projects/${project.id}/stats`);
        if (!cancelled) setStats(data);
      } catch {}
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [project.id]);

  if (loading) return <div className="py-8 text-center" style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Loading dashboard…</div>;
  if (!stats) return <div className="py-8 text-center" style={{ fontSize: 12, color: "var(--text-tertiary)" }}>No stats available.</div>;

  return (
    <div data-testid="proj-dashboard" className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        {[
          ["Total", stats.total],
          ["Open", stats.open],
          ["Done", stats.done],
          ["Overdue", stats.overdue],
        ].map(([label, value]) => (
          <div key={label} style={{ border: "1px solid var(--border-default)", borderRadius: "var(--radius-lg)", background: "var(--bg-surface)", padding: 12, textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>{value}</div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ border: "1px solid var(--border-default)", borderRadius: "var(--radius-lg)", background: "var(--bg-surface)", padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>Burndown (last 14 days)</div>
        {stats.burndown && stats.burndown.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={stats.burndown}>
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="created" stroke="var(--color-warning)" strokeWidth={2} dot={false} name="Created" />
              <Line type="monotone" dataKey="done" stroke="var(--color-success)" strokeWidth={2} dot={false} name="Done" />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", textAlign: "center", padding: 20 }}>Not enough history yet.</div>
        )}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {Object.entries(stats.by_status || {}).map(([s, n]) => (
          <span key={s} style={{ padding: "4px 8px", fontSize: 11.5, borderRadius: "var(--radius-md)", background: "var(--bg-surface-sunken)", border: "1px solid var(--border-default)", color: "var(--text-secondary)" }}>
            {s}: {n}
          </span>
        ))}
      </div>
    </div>
  );
}
