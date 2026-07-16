import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { Plus } from "lucide-react";

const STATUS_COLOR = {
  draft: "text-neutral-500 border-neutral-300",
  sent: "text-blue-700 border-blue-500",
  accepted: "text-green-700 border-green-700",
};

export default function Proposals() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.get("/proposal-eq/proposals").then((r) => { setItems(r.data); setLoading(false); }); }, []);

  return (
    <div>
      <PageHeader
        title="Proposals"
        subtitle="AI-researched proposal documents generated from your CRM, exportable to DOCX or PDF."
        right={<Link to="/app/proposal-eq/new" data-testid="btn-new-proposal" className="btn-primary"><Plus size={14} /> New proposal</Link>}
      />
      <div className="animate-fade-in px-6 sm:px-8">
        {loading ? <div className="text-neutral-400 text-sm">Loading…</div> : items.length === 0 ? (
          <div className="shadow-card rounded-2xl p-6 sm:p-10 text-center">
            <div className="font-display text-xl sm:text-2xl font-semibold">No proposals yet</div>
            <p className="text-sm text-neutral-400 mt-2">Pick a lead and Proposal EQ will research and draft a deck.</p>
            <Link to="/app/proposal-eq/new" className="btn-primary mt-6 inline-flex">Create proposal</Link>
          </div>
        ) : (
          <div className="shadow-card rounded-2xl border border-line bg-white overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-neutral-400">
                  <th className="ui-label text-left p-3">Proposal</th>
                  <th className="ui-label text-left p-3">Type</th>
                  <th className="ui-label text-left p-3">Lead</th>
                  <th className="ui-label text-left p-3">Status</th>
                  <th className="ui-label text-right p-3">Created</th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.id} className="border-b border-line hover:bg-surfacehover">
                    <td className="p-3">
                      <Link to={`/app/proposal-eq/${p.id}`} data-testid={`proposal-row-${p.id}`} className="font-medium hover:text-sanguine">{p.topic}</Link>
                    </td>
                    <td className="p-3 text-neutral-400 text-xs">{p.template_name || "—"}</td>
                    <td className="p-3 text-neutral-500">{p.lead ? `${p.lead.first_name} ${p.lead.last_name || ""} · ${p.lead.company || ""}` : "—"}</td>
                    <td className="p-3"><span className={`ui-label inline-block px-2 py-0.5 border ${STATUS_COLOR[p.status] || STATUS_COLOR.draft}`}>{p.status}</span></td>
                    <td className="p-3 text-right text-xs text-neutral-400">{(p.created_at || "").slice(0, 10)}</td>
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
