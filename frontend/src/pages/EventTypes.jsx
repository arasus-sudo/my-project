import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Link } from "react-router-dom";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { Plus, Copy, Trash2 } from "lucide-react";

export default function EventTypes() {
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
        right={<Link to="/app/schedule-eq/event-types/new" data-testid="btn-new-event-type" className="btn-primary"><Plus size={14} /> New event type</Link>}
      />
      <div className="p-6">
        {loading ? <div className="text-neutral-500 text-sm">Loading…</div> : items.length === 0 ? (
          <div className="card-flat p-10 text-center">
            <div className="font-display text-xl font-bold">No event types yet</div>
            <Link to="/app/schedule-eq/event-types/new" className="btn-primary mt-6 inline-flex">Create event type</Link>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {items.map((et) => (
              <div key={et.id} className="card-flat p-4 space-y-2">
                <Link to={`/app/schedule-eq/event-types/${et.id}`} data-testid={`event-type-row-${et.id}`} className="font-medium hover:text-sanguine block">
                  {et.name}
                </Link>
                <div className="text-xs text-neutral-500 font-mono">{et.duration_minutes} min · {et.location_type}</div>
                <div className="flex gap-2 pt-2">
                  <button onClick={() => copyLink(et.slug)} data-testid={`copy-link-${et.id}`} className="btn-ghost text-xs"><Copy size={12} /> Copy link</button>
                  <button onClick={() => remove(et.id)} data-testid={`delete-event-type-${et.id}`} className="text-xs text-red-600 hover:underline inline-flex items-center gap-1"><Trash2 size={12} /> delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
