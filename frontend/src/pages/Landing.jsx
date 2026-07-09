import { Link } from "react-router-dom";
import { ArrowUpRight, ArrowRight, Zap, Inbox, Kanban, ShieldCheck, Gauge, Sparkles } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-bone text-ink">
      {/* Nav */}
      <header className="pt-6 px-6">
        <div className="max-w-7xl mx-auto bg-white/70 backdrop-blur border border-line rounded-full px-3 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2 pl-3">
            <div className="w-7 h-7 bg-ink text-white flex items-center justify-center rounded-full font-display font-bold text-sm">i</div>
            <span className="font-display font-semibold tracking-tight text-[15px]">Innoira</span>
            <span className="text-neutral-400 text-sm mx-1">/</span>
            <span className="font-display font-semibold tracking-tight text-[15px] text-neutral-600">Pitch EQ</span>
          </div>
          <nav className="hidden md:flex items-center gap-8 text-sm text-neutral-600">
            <a href="#suite" className="hover:text-ink">The Suite</a>
            <a href="#eq" className="hover:text-ink">EQ Score</a>
            <a href="#lifecycle" className="hover:text-ink">Lifecycle</a>
            <a href="#suite-pricing" className="hover:text-ink">Pricing</a>
          </nav>
          <div className="flex items-center gap-1">
            <Link to="/login" data-testid="nav-login" className="btn-ghost">Sign in</Link>
            <Link to="/signup" data-testid="nav-signup" className="btn-primary py-2 px-5">Start free <ArrowUpRight size={14} /></Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="px-6 pt-20 pb-24 md:pt-28 md:pb-32">
        <div className="max-w-6xl mx-auto text-center">
          <div className="pill mx-auto mb-8"><Sparkles size={12} /> Part of the Innoira Agentic Suite</div>
          <h1 className="font-display font-bold text-5xl sm:text-6xl lg:text-7xl leading-[1.02] tracking-tighter max-w-4xl mx-auto">
            Cold email that reads like it was written by a human who cares.
          </h1>
          <p className="mt-8 text-lg text-neutral-600 max-w-2xl mx-auto leading-relaxed">
            Pitch EQ is the outbound agent in your Innoira suite. It scores every draft for tone, empathy, clarity and spam risk — before you hit send.
          </p>
          <div className="mt-10 flex items-center justify-center gap-3">
            <Link to="/signup" data-testid="hero-cta-start" className="btn-primary">Start free <ArrowRight size={14} /></Link>
            <a href="#eq" className="btn-secondary">See the EQ Score</a>
          </div>

          {/* Hero visual — abstract score card */}
          <div className="mt-20 max-w-5xl mx-auto">
            <div className="bg-white border border-line rounded-3xl p-8 md:p-12 grid md:grid-cols-3 gap-8 items-center shadow-[0_20px_80px_-40px_rgba(33,32,37,0.25)]">
              <div className="text-left md:col-span-1">
                <div className="ui-label mb-3">EQ Score</div>
                <div className="font-mono text-7xl font-bold tracking-tighter">82</div>
                <div className="pill mt-4"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Ready to send</div>
              </div>
              <div className="md:col-span-2 text-left">
                <div className="grid grid-cols-5 gap-3 mb-6">
                  {[
                    { label: "REL", v: 92 },
                    { label: "EMP", v: 78 },
                    { label: "CLR", v: 88 },
                    { label: "CTA", v: 84 },
                    { label: "SPM", v: 91 },
                  ].map((b) => (
                    <div key={b.label}>
                      <div className="h-16 bg-neutral-100 rounded-lg relative overflow-hidden">
                        <div className="absolute bottom-0 left-0 right-0 bg-ink rounded-lg" style={{ height: `${b.v}%` }} />
                      </div>
                      <div className="text-[10px] font-mono text-neutral-500 mt-1.5 text-center">{b.label}</div>
                    </div>
                  ))}
                </div>
                <div className="border-l-2 border-ink pl-4 text-sm text-neutral-700 leading-relaxed">
                  "Hi Marcus — noticed Obsidian Labs is scaling fast. Worth 15 minutes to compare notes on reply rates?"
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Suite section */}
      <section id="suite" className="px-6 py-24">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <div className="ui-label mb-3">The Innoira Agentic Suite</div>
            <h2 className="text-4xl sm:text-5xl font-display font-bold tracking-tight">
              One suite. Every revenue agent.
            </h2>
            <p className="mt-4 text-neutral-600">Pitch EQ handles outbound. Other agents handle inbound, research, and pipeline hygiene — all under one login.</p>
          </div>
          <div className="grid md:grid-cols-4 gap-4">
            {[
              { t: "Pitch EQ", d: "AI cold email agent with EQ Score", live: true },
              { t: "Signal", d: "Buying-intent research agent", live: false },
              { t: "Inbound", d: "Website & form triage agent", live: false },
              { t: "Hygiene", d: "CRM cleanup & enrichment agent", live: false },
            ].map((a) => (
              <div key={a.t} className={`bg-white border rounded-2xl p-6 ${a.live ? "border-ink" : "border-line"}`}>
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 bg-ink/5 rounded-full flex items-center justify-center">
                    <div className="w-2 h-2 bg-ink rounded-full" />
                  </div>
                  {a.live ? <span className="pill">Live</span> : <span className="pill text-neutral-400">Soon</span>}
                </div>
                <div className="mt-5 font-display font-semibold text-lg">{a.t}</div>
                <div className="text-sm text-neutral-600 mt-1">{a.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* EQ Score */}
      <section id="eq" className="px-6 py-24">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-16 items-center">
          <div>
            <div className="ui-label mb-4">The EQ Score</div>
            <h2 className="text-4xl sm:text-5xl font-display font-bold tracking-tight leading-tight">
              An emotional intelligence rating for every cold email.
            </h2>
            <p className="mt-6 text-neutral-600 leading-relaxed">
              Five signals — relevance, empathy, clarity, CTA strength, and spam risk — combine into a single score from 0 to 100. Low score? Get plain-English hints and regenerate in one click.
            </p>
            <ul className="mt-8 space-y-3 text-sm">
              {[
                ["Relevance", "Does it feel written for this specific person?"],
                ["Empathy", "Does the tone acknowledge their world before pitching?"],
                ["Clarity", "Is it short, structured, easy to scan?"],
                ["CTA", "One clear, low-friction ask?"],
                ["Spam Safety", "Free of triggers, ALL-CAPS and !!!"],
              ].map(([k, v]) => (
                <li key={k} className="flex gap-6 border-b border-line pb-3">
                  <span className="ui-label w-24 pt-0.5">{k}</span>
                  <span className="text-neutral-700 flex-1">{v}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-white border border-line rounded-3xl p-8">
            <div className="ui-label mb-3">Live preview</div>
            <div className="font-mono text-xs text-neutral-500">Subject</div>
            <div className="font-display font-semibold text-lg mt-1">Quick idea for Northloop</div>
            <div className="mt-4 text-sm leading-relaxed text-neutral-800 border-l-2 border-ink pl-4">
              Hi Alex,<br /><br />
              Noticed Northloop has been scaling — teams your size often struggle with reply rates on cold outreach. We help by writing emails that feel human, with an EQ Score to catch anything spammy or robotic before you hit send.<br /><br />
              Worth a 15-minute look next week?
            </div>
            <div className="mt-6 flex items-center gap-4">
              <div>
                <div className="font-mono text-4xl font-bold">86</div>
                <div className="ui-label">EQ Score</div>
              </div>
              <div className="flex-1 grid grid-cols-5 gap-2">
                {[{ k: "REL", v: 92 }, { k: "EMP", v: 78 }, { k: "CLR", v: 88 }, { k: "CTA", v: 84 }, { k: "SPM", v: 91 }].map((x) => (
                  <div key={x.k} className="text-center">
                    <div className="h-10 bg-neutral-100 rounded-md relative overflow-hidden">
                      <div className="absolute bottom-0 left-0 right-0 bg-ink" style={{ height: `${x.v}%` }} />
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
      <section id="lifecycle" className="px-6 py-24">
        <div className="max-w-6xl mx-auto">
          <div className="max-w-2xl mb-14">
            <div className="ui-label mb-4">The whole outbound lifecycle</div>
            <h2 className="text-4xl sm:text-5xl font-display font-bold tracking-tight">
              One agent from first hello to booked meeting.
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {[
              { icon: Zap, t: "Deliverability core", d: "Warmup engine, DNS auth (SPF/DKIM/DMARC), mailbox rotation, daily caps and bounce handling." },
              { icon: Gauge, t: "AI Personalization", d: "Per-lead first-lines and bodies, tuned to your brand voice, with an EQ Score gate before send." },
              { icon: Inbox, t: "Unified Inbox", d: "Every reply across mailboxes in one place, auto-classified as interested, referral, OOO, unsubscribe." },
              { icon: Kanban, t: "Built-in CRM", d: "Kanban pipeline, activity timeline, and auto-created deals for interested replies." },
              { icon: ShieldCheck, t: "Compliance", d: "One-click unsubscribe, physical address, GDPR/PECR toolkit, right-to-erasure workflow." },
              { icon: ArrowUpRight, t: "Reporting", d: "Funnel, step performance, mailbox health and team leaderboard — no spreadsheets." },
            ].map((f) => (
              <div key={f.t} className="bg-white border border-line rounded-2xl p-6">
                <div className="w-10 h-10 bg-ink/5 rounded-full flex items-center justify-center">
                  <f.icon size={18} strokeWidth={1.75} />
                </div>
                <div className="mt-5 font-display font-semibold text-lg">{f.t}</div>
                <div className="mt-2 text-sm text-neutral-600 leading-relaxed">{f.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Suite pricing (no standalone Pitch EQ cost) */}
      <section id="suite-pricing" className="px-6 py-24">
        <div className="max-w-4xl mx-auto text-center">
          <div className="ui-label mb-4">One price for the whole suite</div>
          <h2 className="text-4xl sm:text-5xl font-display font-bold tracking-tight">Pitch EQ is included with Innoira.</h2>
          <p className="mt-4 text-neutral-600 max-w-xl mx-auto">No per-agent fees. Every agent — outbound, research, inbound, hygiene — comes together in one subscription.</p>
          <div className="mt-12 bg-white border border-line rounded-3xl p-10 text-left grid md:grid-cols-2 gap-10 items-center">
            <div>
              <div className="ui-label mb-2">Innoira Agentic Suite</div>
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-6xl font-bold">$249</span>
                <span className="text-neutral-500">/ workspace / month</span>
              </div>
              <p className="mt-3 text-sm text-neutral-600">Billed annually · unlimited mailboxes · every agent included.</p>
              <Link to="/signup" data-testid="pricing-cta-suite" className="btn-primary mt-6">Start free 14-day trial <ArrowRight size={14} /></Link>
            </div>
            <ul className="space-y-2 text-sm text-neutral-700">
              {[
                "Every agent in the Innoira suite",
                "Unlimited mailboxes + built-in warmup",
                "EQ Score on every draft",
                "Unified inbox + built-in CRM",
                "HubSpot / Salesforce / Zoho sync",
                "Priority deliverability guardrails",
                "Dedicated onboarding & CSM",
              ].map((x) => (
                <li key={x} className="flex gap-3">
                  <span className="w-5 h-5 bg-ink text-white rounded-full flex items-center justify-center text-[10px]">✓</span>
                  <span>{x}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-line py-10 px-6 mt-10">
        <div className="max-w-6xl mx-auto flex items-center justify-between text-xs text-neutral-500 font-mono uppercase tracking-widest">
          <div>© Innoira · Pitch EQ · Sent with high EQ.</div>
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
