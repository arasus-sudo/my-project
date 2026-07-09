import { Link } from "react-router-dom";
import { ArrowUpRight, ArrowRight, Zap, Inbox, Kanban, ShieldCheck, Gauge } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-bone text-ink">
      {/* Nav */}
      <header className="border-b border-line">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-ink text-bone flex items-center justify-center rounded-sm font-display font-bold">P</div>
            <span className="font-display font-bold text-lg tracking-tight">Pitch EQ</span>
          </div>
          <nav className="hidden md:flex items-center gap-8 text-sm text-neutral-700">
            <a href="#eq" className="hover:text-ink">EQ Score</a>
            <a href="#lifecycle" className="hover:text-ink">Lifecycle</a>
            <a href="#pricing" className="hover:text-ink">Pricing</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/login" data-testid="nav-login" className="btn-ghost">Sign in</Link>
            <Link to="/signup" data-testid="nav-signup" className="btn-primary">Start free <ArrowUpRight size={16} /></Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="border-b border-line">
        <div className="max-w-7xl mx-auto px-6 py-24 md:py-32 grid md:grid-cols-12 gap-10">
          <div className="md:col-span-8">
            <div className="ui-label text-sanguine mb-6">A cold email agent, but empathetic</div>
            <h1 className="font-display font-extrabold text-5xl sm:text-6xl lg:text-7xl leading-[0.95] tracking-tighter">
              Cold email that <span className="italic">reads</span> like it was<br />
              written by <span className="text-sanguine">a human who cares.</span>
            </h1>
            <p className="mt-8 text-lg text-neutral-600 max-w-2xl leading-relaxed">
              Pitch EQ scores every draft for tone, empathy, clarity, CTA strength, and spam risk — before you hit send. Multi-mailbox sending with deliverability guardrails and a built-in pipeline.
            </p>
            <div className="mt-10 flex items-center gap-3">
              <Link to="/signup" data-testid="hero-cta-start" className="btn-primary">Start free trial <ArrowRight size={16} /></Link>
              <a href="#eq" className="btn-secondary">See the EQ Score</a>
            </div>
            <div className="mt-10 flex items-center gap-8 text-xs font-mono text-neutral-500 uppercase tracking-widest">
              <span>SPF · DKIM · DMARC</span>
              <span>GDPR · CAN-SPAM</span>
              <span>Multi-tenant SaaS</span>
            </div>
          </div>
          <div className="md:col-span-4">
            <div className="card-flat p-6 relative">
              <div className="ui-label mb-2">EQ Score</div>
              <div className="font-mono text-6xl font-bold tracking-tighter text-sanguine">82</div>
              <div className="mt-4 grid grid-cols-5 gap-1 items-end h-16">
                {[
                  { label: "REL", v: 65 },
                  { label: "EMP", v: 88 },
                  { label: "CLR", v: 72 },
                  { label: "CTA", v: 90 },
                  { label: "SPM", v: 78 },
                ].map((b) => (
                  <div key={b.label} className="flex flex-col items-center gap-1">
                    <div className="w-full bg-line" style={{ height: `${b.v}%`, backgroundColor: b.v > 70 ? "#D94526" : "#5C5D58" }} />
                    <div className="text-[9px] font-mono text-neutral-500">{b.label}</div>
                  </div>
                ))}
              </div>
              <div className="mt-5 pt-5 border-t border-line text-xs text-neutral-600 leading-relaxed">
                "Hi Marcus — noticed Obsidian Labs is scaling fast. Worth 15 minutes to compare notes on reply rates?"
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2 text-xs text-neutral-500 font-mono">
              <span className="w-2 h-2 bg-green-600 rounded-full" /> Ready to send · low spam risk
            </div>
          </div>
        </div>
      </section>

      {/* Trusted by */}
      <section className="border-b border-line py-10">
        <div className="max-w-7xl mx-auto px-6 flex items-center gap-10 flex-wrap">
          <div className="ui-label">Trusted by outbound teams at</div>
          {["Northloop", "Aeromark", "Obsidian", "Quorum", "Stackward", "Finchgrid"].map((n) => (
            <div key={n} className="font-display font-bold text-neutral-400 text-xl tracking-tight">{n}</div>
          ))}
        </div>
      </section>

      {/* EQ Score section */}
      <section id="eq" className="border-b border-line">
        <div className="max-w-7xl mx-auto px-6 py-24 grid md:grid-cols-2 gap-16 items-center">
          <div>
            <div className="ui-label text-sanguine mb-4">The EQ Score</div>
            <h2 className="text-4xl sm:text-5xl font-display font-bold tracking-tight leading-tight">
              An emotional intelligence rating for every cold email.
            </h2>
            <p className="mt-6 text-neutral-600 leading-relaxed">
              Five signals — relevance, empathy, clarity, CTA strength, and spam risk — combine into a single score from 0 to 100. Low score? Get concrete, plain-English hints and regenerate in one click.
            </p>
            <ul className="mt-8 space-y-3 text-sm">
              {[
                ["Relevance", "Does it feel written for this specific person?"],
                ["Empathy", "Does the tone acknowledge their world before pitching?"],
                ["Clarity", "Is it short, structured, easy to scan?"],
                ["CTA", "One clear, low-friction ask?"],
                ["Spam Safety", "Free of triggers, ALL-CAPS and !!!"],
              ].map(([k, v]) => (
                <li key={k} className="flex gap-4 border-b border-line pb-3">
                  <span className="ui-label w-24 pt-0.5">{k}</span>
                  <span className="text-neutral-700 flex-1">{v}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="card-flat p-8">
            <div className="ui-label mb-3">Live preview</div>
            <div className="font-mono text-xs text-neutral-500">Subject</div>
            <div className="font-display font-bold text-lg mt-1">Quick idea for Northloop</div>
            <div className="mt-4 text-sm leading-relaxed text-neutral-800 border-l-2 border-sanguine pl-4">
              Hi Alex,<br /><br />
              Noticed Northloop has been scaling — teams your size often struggle with reply rates on cold outreach. We help by writing emails that feel human, with an EQ Score to catch anything spammy or robotic before you hit send.<br /><br />
              Worth a 15-minute look next week?
            </div>
            <div className="mt-6 flex items-center gap-4">
              <div>
                <div className="font-mono text-4xl font-bold text-sanguine">86</div>
                <div className="ui-label">EQ Score</div>
              </div>
              <div className="flex-1 grid grid-cols-5 gap-2">
                {[{ k: "REL", v: 92 }, { k: "EMP", v: 78 }, { k: "CLR", v: 88 }, { k: "CTA", v: 84 }, { k: "SPM", v: 91 }].map((x) => (
                  <div key={x.k} className="text-center">
                    <div className="h-10 bg-line relative">
                      <div className="absolute bottom-0 left-0 right-0 bg-sanguine" style={{ height: `${x.v}%` }} />
                    </div>
                    <div className="text-[9px] font-mono text-neutral-500 mt-1">{x.k}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Lifecycle */}
      <section id="lifecycle" className="border-b border-line bg-white">
        <div className="max-w-7xl mx-auto px-6 py-24">
          <div className="max-w-2xl mb-14">
            <div className="ui-label text-sanguine mb-4">The whole outbound lifecycle</div>
            <h2 className="text-4xl sm:text-5xl font-display font-bold tracking-tight">
              One product from first hello to booked meeting.
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-0 border border-line">
            {[
              { icon: Zap, t: "Deliverability core", d: "Warmup engine, DNS auth checks (SPF/DKIM/DMARC), mailbox rotation, daily caps and bounce handling." },
              { icon: Gauge, t: "AI Personalization", d: "Per-lead first-lines and bodies, tuned to your brand voice, with an EQ Score gate before send." },
              { icon: Inbox, t: "Unified Inbox", d: "Every reply across mailboxes in one place, auto-classified as interested, referral, OOO, unsubscribe." },
              { icon: Kanban, t: "Built-in CRM", d: "Kanban pipeline, activity timeline, and auto-created deals for interested replies." },
              { icon: ShieldCheck, t: "Compliance", d: "One-click unsubscribe, physical address, GDPR/PECR toolkit, right-to-erasure workflow." },
              { icon: ArrowUpRight, t: "Reporting", d: "Funnel, step performance, mailbox health and team leaderboard — no spreadsheets." },
            ].map((f) => (
              <div key={f.t} className="p-8 border-t border-l border-line -mt-px -ml-px">
                <f.icon size={20} strokeWidth={1.5} />
                <div className="mt-4 font-display font-bold text-lg">{f.t}</div>
                <div className="mt-2 text-sm text-neutral-600 leading-relaxed">{f.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-b border-line">
        <div className="max-w-7xl mx-auto px-6 py-24">
          <div className="max-w-2xl mb-14">
            <div className="ui-label text-sanguine mb-4">Pricing</div>
            <h2 className="text-4xl sm:text-5xl font-display font-bold tracking-tight">Simple, per-mailbox pricing.</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { n: "Starter", p: "$59", s: "/mailbox / mo", f: ["1 workspace", "2 mailboxes", "5,000 leads", "EQ Score + Sequencer"] },
              { n: "Growth", p: "$129", s: "/mailbox / mo", best: true, f: ["3 workspaces", "10 mailboxes", "25,000 leads", "Unified Inbox + CRM", "A/B testing"] },
              { n: "Scale", p: "Custom", s: "annual", f: ["Unlimited mailboxes", "HubSpot / Salesforce sync", "Priority deliverability", "Dedicated CSM"] },
            ].map((t) => (
              <div key={t.n} className={`p-8 border ${t.best ? "border-ink" : "border-line"} bg-white rounded-sm relative`}>
                {t.best && <div className="absolute -top-3 left-8 bg-sanguine text-white text-[10px] font-mono uppercase tracking-widest px-2 py-1">Most loved</div>}
                <div className="font-display font-bold text-xl">{t.n}</div>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="font-mono text-4xl font-bold">{t.p}</span>
                  <span className="text-sm text-neutral-500">{t.s}</span>
                </div>
                <ul className="mt-6 space-y-2 text-sm text-neutral-700">
                  {t.f.map((x) => (<li key={x} className="flex gap-2"><span className="text-sanguine">→</span>{x}</li>))}
                </ul>
                <Link to="/signup" data-testid={`pricing-cta-${t.n.toLowerCase()}`} className={`mt-8 block text-center ${t.best ? "btn-primary" : "btn-secondary"}`}>
                  Start with {t.n}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between text-xs text-neutral-500 font-mono uppercase tracking-widest">
          <div>© Pitch EQ · Sent with high EQ.</div>
          <div className="flex gap-6">
            <a href="#">Privacy</a>
            <a href="#">Terms</a>
            <a href="#">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
