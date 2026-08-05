import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { MessageSquare, Send, Users, BarChart3 } from "../icons";
import MetricCard from "../components/composites/MetricCard";
import { EmptyState } from "../components/composites/EmptyState";

export default function SmsEQOverview() {
  const nav = useNavigate();
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/sms-eq/analytics").then((r) => { setAnalytics(r.data); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  return (
    <div>
      <PageHeader title="SMS EQ" subtitle="Broadcast messaging, two-way conversations, and contact management." />
      <div className="animate-fade-in px-6 sm:px-8 py-6 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <MetricCard icon={MessageSquare} label="Templates" value={loading ? "—" : (analytics?.total_templates ?? 0)} />
          <MetricCard icon={Send} label="Broadcasts" value={loading ? "—" : (analytics?.total_broadcasts ?? 0)} />
          <MetricCard icon={Users} label="Contacts" value={loading ? "—" : (analytics?.total_contacts ?? 0)} />
          <MetricCard icon={BarChart3} label="Sent" value={loading ? "—" : (analytics?.total_sent ?? 0)} />
        </div>
        {!loading && !analytics?.total_templates && (
          <EmptyState icon={MessageSquare} title="Get started with SMS EQ" description="Create templates, import contacts, and send broadcasts."
            actionLabel="Create a template" onAction={() => nav("/app/sms-eq/templates")} />
        )}
      </div>
    </div>
  );
}
