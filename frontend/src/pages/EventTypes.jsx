import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Link, useNavigate } from "react-router-dom";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Plus, Copy, Trash2, CalendarRange } from "../icons";
import Card from "../components/composites/Card";
import { EmptyState } from "../components/composites/EmptyState";
import Button from "../components/primitives/Button";

export default function EventTypes() {
  const nav = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [workspaceId, setWorkspaceId] = useState("");

  const load = () => api.get("/schedule-eq/event-types").then((r) => { setItems(r.data); setLoading(false); });
  useEffect(() => {
    load();
    api.get("/auth/me").then((r) => setWorkspaceId(r.data.workspace?.id || ""));
  }, []);

  const remove = async (id) => {
    await api.delete(`/schedule-eq/event-types/${id}`);
    load();
  };
  const copyLink = (slug) => {
    const url = `${window.location.origin}/book/${workspaceId}/${slug}`;
    navigator.clipboard.writeText(url);
    toast.success("Booking link copied");
  };

  return (
    <div>
      <PageHeader
        title="Event Types"
        subtitle="Each event type publishes its own public booking page."
        right={<Link to="/app/schedule-eq/event-types/new" data-testid="btn-new-event-type"><Button variant="primary" icon={Plus}>New event type</Button></Link>}
      />
      <div className="animate-fade-in px-6 sm:px-8 py-6">
        {loading ? (
          <div style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Loading…</div>
        ) : items.length === 0 ? (
          <EmptyState icon={CalendarRange} title="No event types yet" description="Set your availability, then publish a public booking link." actionLabel="Create event type" onAction={() => nav("/app/schedule-eq/event-types/new")} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((et) => (
              <Card key={et.id}>
                <Link to={`/app/schedule-eq/event-types/${et.id}`} data-testid={`event-type-row-${et.id}`}
                  className="block" style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>
                  {et.name}
                </Link>
                <div className="tnum" style={{ fontSize: 11.5, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", marginTop: 4 }}>
                  {et.duration_minutes} min · {et.location_type}
                </div>
                <div className="flex gap-3" style={{ marginTop: 12 }}>
                  <button onClick={() => copyLink(et.slug)} data-testid={`copy-link-${et.id}`}
                    className="inline-flex items-center gap-1" style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    <Copy size={12} strokeWidth={1.5} aria-hidden="true" /> Copy link
                  </button>
                  <button onClick={() => remove(et.id)} data-testid={`delete-event-type-${et.id}`}
                    className="inline-flex items-center gap-1" style={{ fontSize: 12, color: "var(--color-danger)" }}>
                    <Trash2 size={12} strokeWidth={1.5} aria-hidden="true" /> Delete
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
