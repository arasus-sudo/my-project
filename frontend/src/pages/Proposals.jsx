import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { Plus } from "lucide-react";

const STATUS_COLOR = {
  draft: "text-ink-tertiary border-neutral-300",
  sent: "text-info border-info",
  accepted: "text-success border-success",
};

export default function Proposals() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.get("/proposal-eq/proposals").then((r) => { setItems(r.data); setLoading(false); }); }, []);

  return (
    <div>
      <PageHeader
        title="Proposals"
        subtitle="Proposal documents researched from your CRM, exportable to DOCX or PDF."
        right={<Link to="/app/proposal-eq/new" data-testid="btn-new-proposal" className="btn-primary"><Plus size={14} /> New proposal</Link>}
      />
      <div className="animate-fade-in px-6 sm:px-8">
        {loading ? <div className="text-body text-ink-muted">Loading…</div> : items.length === 0 ? (
          <div className="shadow-card rounded-2xl p-10 text-center">
            <div className="text-section font-display font-semibold">No proposals yet</div>
            <p className="text-body text-ink-muted mt-2">Pick a lead and Proposal EQ will research and draft a deck.</p>
            <Link to="/app/proposal-eq/new" className="btn-primary mt-6 inline-flex">Create proposal</Link>
          </div>
        ) : (
          <div className="shadow-card rounded-2xl border border-line bg-white overflow-x-auto">
            <table className="w-full text-table">
              <thead>
                <tr className="border-b border-line">
                  <th className="table-header text-left p-3">Proposal</th>
                  <th className="table-header text-left p-3">Type</th>
                  <th className="table-header text-left p-3">Lead</th>
                  <th className="table-header text-left p-3">Status</th>
                  <th className="table-header text-right p-3">Created</th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.id} className="border-b border-line hover:bg-surfacehover">
                    <td className="p-3">
                      <Link to={`/app/proposal-eq/${p.id}`} data-testid={`proposal-row-${p.id}`} className="font-medium hover:text-ink">{p.topic}</Link>
                    </td>
                    <td className="p-3 text-ink-muted text-caption">{p.template_name || "—"}</td>
                    <td className="p-3 text-ink-tertiary">{p.lead ? `${p.lead.first_name} ${p.lead.last_name || ""} · ${p.lead.company || ""}` : "—"}</td>
                    <td className="p-3"><span className={`ui-label inline-block px-2 py-0.5 border ${STATUS_COLOR[p.status] || STATUS_COLOR.draft}`}>{p.status}</span></td>
                    <td className="p-3 text-right text-tiny text-ink-muted">{(p.created_at || "").slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
