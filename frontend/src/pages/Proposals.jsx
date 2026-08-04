import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { Plus, FileText } from "../icons";
import Table from "../components/composites/Table";
import { EmptyState } from "../components/composites/EmptyState";
import StatusPill from "../components/primitives/StatusPill";
import Button from "../components/primitives/Button";

export default function Proposals() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const nav = useNavigate();

  useEffect(() => { api.get("/proposal-eq/proposals").then((r) => { setItems(r.data); setLoading(false); }); }, []);

  const columns = [
    { key: "topic", label: "Proposal", render: (p) => <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>{p.topic}</span> },
    { key: "type", label: "Type", render: (p) => <span style={{ color: "var(--text-tertiary)" }}>{p.template_name || "—"}</span> },
    { key: "lead", label: "Lead", render: (p) => <span style={{ color: "var(--text-tertiary)" }}>{p.lead ? `${p.lead.first_name} ${p.lead.last_name || ""} · ${p.lead.company || ""}` : "—"}</span> },
    { key: "status", label: "Status", render: (p) => <StatusPill status={p.status} /> },
    { key: "created", label: "Created", align: "right", render: (p) => <span className="tnum" style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{(p.created_at || "").slice(0, 10)}</span> },
  ];

  return (
    <div>
      <PageHeader
        title="Proposals"
        subtitle="Proposal documents researched from your CRM, exportable to DOCX or PDF."
        right={<Button variant="primary" icon={Plus} onClick={() => nav("/app/proposal-eq/new")} data-testid="btn-new-proposal">New proposal</Button>}
      />
      <div className="animate-fade-in px-6 sm:px-8 py-6">
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", fontSize: 13, color: "var(--text-tertiary)" }}>Loading…</div>
        ) : items.length === 0 ? (
          <EmptyState icon={FileText} title="No proposals yet" description="Pick a lead and Proposal EQ will research and draft a deck."
            actionLabel="Create proposal" onAction={() => nav("/app/proposal-eq/new")} />
        ) : (
          <Table columns={columns} rows={items} rowKey={(p) => p.id} onRowClick={(p) => nav(`/app/proposal-eq/${p.id}`)} />
        )}
      </div>
    </div>
  );
}
