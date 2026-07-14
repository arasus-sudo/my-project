import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import { Mail, Phone, CalendarClock, FileText, Share2, ArrowLeft } from "lucide-react";

const AGENT_ICON = { pitch: Mail, voice: Phone, scheduler: CalendarClock, proposal: FileText, social: Share2 };
const AGENT_LABEL = { pitch: "Pitch EQ", voice: "Voice EQ", scheduler: "Schedule EQ", proposal: "Proposal EQ", social: "Social EQ" };

export default function LeadDetail() {
  const { id } = useParams();
  const [lead, setLead] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.get(`/leads/${id}`), api.get(`/leads/${id}/timeline`)])
      .then(([l, t]) => { setLead(l.data); setTimeline(t.data); setLoading(false); });
  }, [id]);

  if (loading) return <div className="p-10 text-neutral-500 text-sm">Loading…</div>;
  if (!lead) return <div className="p-10 text-neutral-500 text-sm">Lead not found.</div>;

  return (
    <div>
      <PageHeader
        title={`${lead.first_name} ${lead.last_name || ""}`}
        subtitle={lead.company || lead.email}
        right={
          <Link to="/app/leads" data-testid="back-to-leads" className="btn-secondary">
            <ArrowLeft size={14} /> Leads
          </Link>
        }
      />
      <div className="p-6 grid grid-cols-3 gap-6">
        <div className="space-y-4">
          <div className="card-flat p-4 space-y-2">
            <div className="ui-label">Contact</div>
            <div className="text-sm font-mono text-neutral-700">{lead.email}</div>
            {lead.phone && <div className="text-sm font-mono text-neutral-700">{lead.phone}</div>}
            {lead.title && <div className="text-sm text-neutral-600">{lead.title}</div>}
            <div className="flex items-center gap-2 pt-2">
              <span className="ui-label border border-line px-2 py-0.5 rounded-full">{lead.status}</span>
              <span className="text-xs font-mono text-neutral-500">ICP {lead.icp_score}</span>
            </div>
          </div>

          {lead.deal && (
            <div className="card-flat p-4 space-y-1">
              <div className="ui-label">Deal</div>
              <div className="text-sm font-medium">{lead.deal.title}</div>
              <div className="flex justify-between items-center pt-1">
                <span className="font-mono text-sm font-bold text-sanguine">${Number(lead.deal.value || 0).toLocaleString()}</span>
                <span className="ui-label text-[9px] border border-line px-2 py-0.5 rounded-full">{lead.deal.stage}</span>
              </div>
            </div>
          )}

          {lead.phone && (
            <Link to={`/app/voice-eq/calls?lead_id=${lead.id}`} data-testid="view-call-history"
              className="btn-secondary w-full justify-center">
              <Phone size={14} /> Call history
            </Link>
          )}

          <Link to={`/app/proposal-eq/new?lead_id=${lead.id}`} data-testid="generate-proposal-link"
            className="btn-secondary w-full justify-center">
            <FileText size={14} /> Generate proposal
          </Link>
        </div>

        <div className="col-span-2">
          <div className="ui-label mb-3">Activity timeline</div>
          {timeline.length === 0 ? (
            <div className="card-flat p-10 text-center text-sm text-neutral-500">
              No activity yet — an email, call, or booking will show up here.
            </div>
          ) : (
            <div className="space-y-0 border-l border-line ml-3">
              {timeline.map((a) => {
                const Icon = AGENT_ICON[a.agent] || FileText;
                return (
                  <div key={a.id} data-testid={`timeline-item-${a.id}`} className="pl-5 pb-5 relative">
                    <div className="absolute -left-[9px] top-0.5 w-4 h-4 rounded-full bg-white border border-line flex items-center justify-center">
                      <Icon size={9} />
                    </div>
                    <div className="text-xs text-neutral-400 font-mono">
                      {AGENT_LABEL[a.agent] || a.agent} · {formatDistanceToNow(new Date(a.at), { addSuffix: true })}
                    </div>
                    <div className="text-sm mt-0.5">{a.summary}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
