import { useCallback, useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { api, isCreditError } from "../lib/api";
import { PageHeader } from "../components/AppLayout";
import {
  Mail, Phone, CalendarClock, FileText, Share2, ArrowLeft, Sparkles, Loader2,
  Newspaper, Github, Globe, Flame, ExternalLink, Search,
} from "lucide-react";

const AGENT_ICON = { pitch: Mail, voice: Phone, scheduler: CalendarClock, proposal: FileText, social: Share2 };
const AGENT_LABEL = { pitch: "Pitch EQ", voice: "Voice EQ", scheduler: "Schedule EQ", proposal: "Proposal EQ", social: "Social EQ" };

const BAND_STYLE = {
  hot: "bg-sanguine text-white",
  warm: "bg-amber-100 text-amber-900 border border-amber-200",
  cool: "bg-neutral-100 text-neutral-400 border border-line",
  cold: "bg-white text-neutral-400 border border-line",
};

export default function LeadDetail() {
  const { id } = useParams();
  const [lead, setLead] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [research, setResearch] = useState(null);
  const [enriching, setEnriching] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    Promise.all([
      api.get(`/leads/${id}`),
      api.get(`/leads/${id}/timeline`),
      api.get(`/pitch-eq/leads/${id}/research`).catch(() => ({ data: null })),
    ]).then(([l, t, r]) => {
      setLead(l.data); setTimeline(t.data); setResearch(r.data); setLoading(false);
    });
  }, [id]);

  useEffect(load, [load]);

  const enrich = async (force = false) => {
    setEnriching(true);
    try {
      await api.post(`/pitch-eq/leads/${id}/enrich`, null, { params: { force } });
      toast.success("Researched and scored");
      load();
    } catch (err) {
      if (!isCreditError(err)) toast.error("Research failed");
    } finally { setEnriching(false); }
  };

  if (loading) return <div className="p-6 sm:p-8 text-neutral-400 text-sm">Loading…</div>;
  if (!lead) return <div className="p-6 sm:p-8 text-neutral-400 text-sm">Lead not found.</div>;

  const pack = research?.pack;
  const intent = research?.intent || lead.intent;

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
      <div className="animate-fade-in px-6 sm:px-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-4">
          <div className="shadow-card p-4 space-y-2 rounded-2xl">
            <div className="ui-label">Contact</div>
            <div className="text-sm font-mono text-neutral-700">{lead.email}</div>
            {lead.phone && <div className="text-sm font-mono text-neutral-700">{lead.phone}</div>}
            {lead.title && <div className="text-sm text-neutral-400">{lead.title}</div>}
            <div className="flex items-center gap-2 pt-2 flex-wrap">
              <span className="ui-label border border-line px-2 py-0.5 rounded-xl">{lead.status}</span>
              {intent ? (
                <span data-testid="lead-intent"
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono font-medium ${BAND_STYLE[intent.band]}`}>
                  <Flame size={10} /> {intent.score} {intent.band}
                </span>
              ) : (
                <span className="text-xs font-mono text-neutral-400">not scored yet</span>
              )}
            </div>
          </div>

          {/* Why this score — an unexplained number is what we replaced. */}
          {intent?.reasons?.length > 0 && (
            <div className="shadow-card p-4 rounded-2xl" data-testid="intent-reasons">
              <div className="ui-label mb-2">Why this score</div>
              <ul className="space-y-1.5 text-xs text-neutral-700">
                {intent.reasons.map((r, i) => (
                  <li key={i} className="border-l-2 border-sanguine pl-2 leading-snug">{r}</li>
                ))}
              </ul>
            </div>
          )}

          {lead.deal && (
            <div className="shadow-card p-4 space-y-1 rounded-2xl">
              <div className="ui-label">Deal</div>
              <div className="text-sm font-medium">{lead.deal.title}</div>
              <div className="flex justify-between items-center pt-1">
                <span className="font-mono text-sm font-bold text-sanguine">${Number(lead.deal.value || 0).toLocaleString()}</span>
                <span className="ui-label text-[9px] border border-line px-2 py-0.5 rounded-xl">{lead.deal.stage}</span>
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

        <div className="col-span-1 lg:col-span-2 space-y-6">
          {/* Research — the free public signals the draft chain is allowed to use */}
          <div className="shadow-card p-6 sm:p-8 rounded-2xl" data-testid="research-panel">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="ui-label">Research</div>
              <div className="flex items-center gap-3">
                {research?.researched_at && (
                  <span className="text-[11px] text-neutral-400 font-mono">
                    {formatDistanceToNow(new Date(research.researched_at), { addSuffix: true })}
                  </span>
                )}
                <button onClick={() => enrich(!!pack)} disabled={enriching}
                  data-testid="enrich-btn" className="btn-secondary text-xs disabled:opacity-50">
                  {enriching ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                  {enriching ? "Researching…" : pack ? "Re-research" : "Research this lead"}
                </button>
              </div>
            </div>

            {!pack ? (
              <p className="text-xs text-neutral-400 mt-3">
                Not researched yet. We'll check their site, recent news and public GitHub activity,
                then score how ready they are to hear from you.
              </p>
            ) : !pack.has_signal ? (
              // The honest empty state. The draft chain will refuse to invent a
              // trigger from this, and the UI shouldn't imply one exists either.
              <div className="mt-3 text-xs bg-amber-50 border border-amber-200 rounded-2xl px-3 py-2 text-amber-900">
                No public signals found for {pack.company || "this company"}. Any email we write will
                make no claims about them rather than inventing a reason to reach out.
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                {pack.perplexity?.summary && (
                  <div data-testid="perplexity-summary">
                    <div className="flex items-center gap-1.5 ui-label mb-1">
                      <Search size={11} /> Current research
                      <span className="text-neutral-400 normal-case font-normal">
                        · {pack.perplexity.citations?.length || 0} cited sources
                      </span>
                    </div>
                    <p className="text-xs text-neutral-700 leading-relaxed">
                      {pack.perplexity.summary}
                    </p>
                    {pack.perplexity.citations?.length > 0 && (
                      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
                        {pack.perplexity.citations.slice(0, 4).map((url, i) => (
                          <a key={i} href={url} target="_blank" rel="noreferrer"
                            className="text-[11px] text-neutral-400 hover:text-sanguine inline-flex items-center gap-0.5">
                            source {i + 1} <ExternalLink size={9} />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {pack.site_summary && (
                  <div>
                    <div className="flex items-center gap-1.5 ui-label mb-1">
                      <Globe size={11} /> What they do
                    </div>
                    <p className="text-xs text-neutral-700 leading-relaxed line-clamp-3">
                      {pack.site_summary}
                    </p>
                  </div>
                )}

                {["funding", "hiring", "product"].some((k) => pack.signals?.[k]?.length > 0) && (
                  <div>
                    <div className="ui-label mb-1.5">Buying signals</div>
                    <div className="space-y-1.5">
                      {["funding", "hiring", "product"].flatMap((k) =>
                        (pack.signals[k] || []).map((s, i) => (
                          <div key={`${k}-${i}`} className="flex items-start gap-2 text-xs">
                            <span className="kbd shrink-0 uppercase">{k}</span>
                            <span className="text-neutral-700 leading-snug">{s}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {pack.news?.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 ui-label mb-1.5">
                      <Newspaper size={11} /> Recent news
                    </div>
                    <ul className="space-y-1">
                      {pack.news.slice(0, 4).map((n, i) => (
                        <li key={i} className="text-xs">
                          <a href={n.url} target="_blank" rel="noreferrer"
                            className="text-neutral-700 hover:text-sanguine inline-flex items-start gap-1">
                            <span className="leading-snug">{n.title}</span>
                            <ExternalLink size={9} className="mt-0.5 shrink-0 opacity-50" />
                          </a>
                          {n.published && (
                            <span className="text-neutral-400 font-mono ml-1">{n.published}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {pack.github?.languages?.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 ui-label mb-1.5">
                      <Github size={11} /> Public tech stack
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {pack.github.languages.map((l) => <span key={l} className="kbd">{l}</span>)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="ui-label mb-3">Activity timeline</div>
          {timeline.length === 0 ? (
            <div className="shadow-card p-10 text-center text-sm text-neutral-400 rounded-2xl">
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
