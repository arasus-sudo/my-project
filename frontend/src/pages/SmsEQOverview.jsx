import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { MessageSquare, Send, Users, BarChart3 } from "lucide-react";

export default function SmsEQOverview() {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/sms-eq/analytics").then((r) => { setAnalytics(r.data); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  return (
    <div>
      <PageHeader title="SMS EQ" subtitle="Broadcast messaging, two-way conversations, and contact management." />
      <div className="animate-fade-in px-6 sm:px-8 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard icon={MessageSquare} label="Templates" value={loading ? "—" : (analytics?.total_templates ?? 0)} />
          <StatCard icon={Send} label="Broadcasts" value={loading ? "—" : (analytics?.total_broadcasts ?? 0)} />
          <StatCard icon={Users} label="Contacts" value={loading ? "—" : (analytics?.total_contacts ?? 0)} />
          <StatCard icon={BarChart3} label="Sent" value={loading ? "—" : (analytics?.total_sent ?? 0)} />
        </div>
        {!loading && !analytics?.total_templates && (
          <div className="shadow-card p-10 text-center rounded-2xl">
            <div className="text-section font-display font-semibold">Get started with SMS EQ</div>
            <p className="text-caption text-ink-muted mt-2">Create templates, import contacts, and send broadcasts.</p>
            <Link to="/app/sms-eq/templates" className="btn-primary mt-6 inline-flex">Create a template</Link>
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
