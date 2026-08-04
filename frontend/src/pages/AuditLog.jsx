import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { History } from "../icons";
import Table from "../components/composites/Table";
import { EmptyState } from "../components/composites/EmptyState";
import Chip from "../components/primitives/Chip";

const columns = [
  {
    key: "at", label: "Time",
    render: (e) => <span className="tnum" style={{ fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>{e.at?.replace("T", " ").slice(0, 19)}</span>,
  },
  { key: "actor_email", label: "Actor" },
  { key: "action", label: "Action", render: (e) => <Chip label={e.action} /> },
  {
    key: "meta", label: "Meta", maxWidth: 360,
    render: (e) => <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--text-tertiary)" }}>{JSON.stringify(e.meta)}</span>,
  },
];

export default function AuditLog() {
  const [items, setItems] = useState([]);
  useEffect(() => { api.get("/audit-log").then((r) => setItems(r.data)); }, []);

  return (
    <div className="animate-fade-in">
      <PageHeader title="Audit log" subtitle="Immutable record of key actions in your workspace." />
      <div className="p-6 sm:p-8">
        {items.length === 0 ? (
          <EmptyState icon={History} title="No audit entries yet" description="Key actions in your workspace will appear here as they happen." />
        ) : (
          <Table columns={columns} rows={items} rowKey={(e) => e.id} />
        )}
      </div>
    </div>
  );
}
