import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { toast } from "sonner";
import { User, Info, CalendarCheck } from "../icons";
import { SkeletonTableRows } from "../components/ui/loading-states";
import Table from "../components/composites/Table";
import { EmptyState } from "../components/composites/EmptyState";
import { Modal, ModalContent } from "../components/composites/Modal";
import StatusPill from "../components/primitives/StatusPill";
import Button from "../components/primitives/Button";

export default function Bookings() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);

  const load = () => api.get("/schedule-eq/bookings").then((r) => { setItems(r.data); setLoading(false); });
  useEffect(() => { load(); }, []);

  const cancel = async (id) => {
    await api.post(`/schedule-eq/bookings/${id}/cancel`);
    toast.success("Cancelled");
    setDetail(null); load();
  };
  const markNoShow = async (id) => {
    await api.post(`/schedule-eq/bookings/${id}/mark-no-show`);
    toast.success("Marked as no-show");
    setDetail(null); load();
  };

  const columns = [
    { key: "guest", label: "Guest", render: (b) => <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>{b.guest_name}</span> },
    { key: "event_type", label: "Event type", render: (b) => <span style={{ color: "var(--text-tertiary)" }}>{b.event_type?.name}</span> },
    { key: "when", label: "When", render: (b) => <span className="tnum" style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{(b.start_at || "").slice(0, 16).replace("T", " ")}</span> },
    { key: "status", label: "Status", render: (b) => <StatusPill status={b.status} tone={b.status === "no_show" ? "danger" : undefined} /> },
    { key: "risk", label: "No-show risk", align: "right", numeric: true, render: (b) => b.no_show_risk_score != null ? `${b.no_show_risk_score}%` : "—" },
  ];

  return (
    <div>
      <PageHeader title="Bookings" subtitle="Every meeting booked through Schedule EQ." />
      <div className="animate-fade-in px-6 sm:px-8 py-6">
        {loading ? (
          <div style={{ padding: 16, borderRadius: "var(--radius-xl)", border: "1px solid var(--border-default)", background: "var(--bg-surface)" }}>
            <table className="w-full"><tbody><SkeletonTableRows rows={5} cols={5} /></tbody></table>
          </div>
        ) : items.length === 0 ? (
          <EmptyState icon={CalendarCheck} title="No bookings yet" description="Meetings booked through your event types will appear here." />
        ) : (
          <Table columns={columns} rows={items} rowKey={(b) => b.id} onRowClick={(b) => setDetail(b)} />
        )}
      </div>

      <Modal open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        {detail && (
          <ModalContent
            size="sm"
            title={detail.guest_name}
            subtitle={detail.guest_email}
            footer={detail.status === "confirmed" && (
              <>
                <Button variant="secondary" icon={User} onClick={() => markNoShow(detail.id)} data-testid="mark-no-show-btn">Mark no-show</Button>
                <Button variant="danger-subtle" onClick={() => cancel(detail.id)} data-testid="cancel-booking-btn">Cancel</Button>
              </>
            )}
          >
            <div className="space-y-3">
              <div style={{ fontSize: 13, color: "var(--text-tertiary)" }}>{detail.event_type?.name} · {(detail.start_at || "").slice(0, 16).replace("T", " ")}</div>
              {detail.meet_link && <a href={detail.meet_link} target="_blank" rel="noreferrer" className="block" style={{ fontSize: 13, color: "var(--text-link)" }}>Join video call</a>}
              {detail.prep_brief && (
                <div className="flex gap-2" style={{ background: "var(--bg-surface-sunken)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-lg)", padding: 12, fontSize: 13 }}>
                  <Info size={14} strokeWidth={1.5} aria-hidden="true" className="shrink-0 mt-0.5" style={{ color: "var(--text-tertiary)" }} />
                  <span style={{ color: "var(--text-secondary)" }}>{detail.prep_brief}</span>
                </div>
              )}
            </div>
          </ModalContent>
        )}
      </Modal>
    </div>
  );
}
