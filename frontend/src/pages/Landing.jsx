import { Link } from "react-router-dom";
import { useState } from "react";
import {
  ArrowUpRight, ArrowRight, Mail, PhoneCall, CalendarClock,
  FileText, Images, Share2, Database, Coins, ShieldCheck, GitBranch, Menu, X,
} from "lucide-react";
import InnoiraLogo from "../components/InnoiraLogo";
import ParticleField from "../components/ParticleField";

const AGENTS = [
  { icon: Mail, name: "Pitch EQ", tag: "Outbound email",
    d: "Finds verified prospects, researches them, and writes cold email that reads human — every draft gated by an EQ Score before send." },
  { icon: PhoneCall, name: "Voice EQ", tag: "AI calling",
    d: "Places real phone calls with a natural AI voice, qualifies conversationally, and writes the outcome straight into your pipeline." },
  { icon: CalendarClock, name: "Schedule EQ", tag: "Scheduling",
    d: "Booking pages, availability, reminders and reschedules — meetings appear on the calendar without a single back-and-forth." },
  { icon: FileText, name: "Proposal EQ", tag: "Proposals",
    d: "Turns a deal's CRM context into a researched, priced, on-brand proposal — as an editable document, PDF or deck." },
  { icon: Images, name: "Create EQ", tag: "Content studio",
    d: "A full carousel and creative editor — real Google Fonts, brand kits, AI copy and image assist, PDF/PNG export." },
  { icon: Share2, name: "Social EQ", tag: "Social posting",
    d: "Drafts, schedules and queues social posts across platforms — nothing publishes without your explicit approval." },
];

const RELAY = [
  { agent: "Voice EQ", event: "Call ended — lead qualified", detail: "sentiment: positive · budget: yes" },
  { agent: "Proposal EQ", event: "Proposal auto-drafted", detail: "researched, priced, ready to review" },
  { agent: "Schedule EQ", event: "Booking link queued", detail: "30-min demo · next available slots" },
];

export default function Landing() {
  const [mobileNav, setMobileNav] = useState(false);

  return (
    <div className="min-h-screen bg-bone text-ink animate-fade-in">
      {/* Nav */}
      <header className="fixed top-0 left-0 right-0 z-50 px-6 sm:px-8 pt-4">
        {/* grid, not justify-between: on 3 flex children, justify-between lets the
            middle/first items collide as the viewport narrows since it only
            distributes leftover space. A fixed auto/1fr/auto grid guarantees
            the logo keeps its own column no matter the width. */}
        <div className="nav-floating max-w-7xl mx-auto bg-white/70 backdrop-blur border border-line rounded-xl pl-3 pr-3 py-2.5 grid grid-cols-[auto_1fr_auto] items-center gap-4 sm:gap-8">
          <Link to="/" className="flex items-center shrink-0">
            <InnoiraLogo size="sm" />
          </Link>
          <nav className="hidden md:flex items-center justify-center gap-8 text-sm text-ink-muted">
            <a href="#agents" className="hover:text-ink">The Agents</a>
            <a href="#relay" className="hover:text-ink">How it works</a>
            <a href="#suite-pricing" className="hover:text-ink">Pricing</a>
          </nav>
          <div className="flex items-center justify-end gap-1">
            <Link to="/login" data-testid="nav-login" className="btn-ghost hidden sm:inline-flex">Sign in</Link>
            <Link to="/signup" data-testid="nav-signup" className="btn-primary py-2 px-4 sm:px-5 text-sm">Start free <ArrowUpRight size={14} /></Link>
            <button onClick={() => setMobileNav(!mobileNav)} className="md:hidden p-2 text-ink-muted hover:text-ink rounded-xl">
              {mobileNav ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
        {mobileNav && (
          <div className="md:hidden max-w-7xl mx-auto mt-2 bg-white border border-line rounded-2xl p-4 space-y-3 shadow-card">
            <a href="#agents" onClick={() => setMobileNav(false)} className="block text-sm text-ink-muted hover:text-ink py-2 rounded-xl">The Agents</a>
            <a href="#relay" onClick={() => setMobileNav(false)} className="block text-sm text-ink-muted hover:text-ink py-2 rounded-xl">How it works</a>
            <a href="#suite-pricing" onClick={() => setMobileNav(false)} className="block text-sm text-ink-muted hover:text-ink py-2 rounded-xl">Pricing</a>
            <Link to="/login" onClick={() => setMobileNav(false)} className="block text-sm text-ink-muted hover:text-ink py-2 rounded-xl">Sign in</Link>
          </div>
        )}
      </header>

      {/* Hero */}
      <section className="relative px-6 sm:px-8 pt-24 sm:pt-32 pb-20 sm:pb-28 animate-fade-up overflow-hidden">
        <ParticleField className="absolute inset-0 w-full h-full pointer-events-none opacity-70" />
        <div className="relative max-w-6xl mx-auto text-center">
          <div className="pill mx-auto mb-6 sm:mb-8"><span className="w-1.5 h-1.5 rounded-full bg-success" /> Six agents live · more on the way</div>
          <h1 className="font-display font-bold text-4xl sm:text-6xl lg:text-8xl leading-[1.05] sm:leading-[1.02] tracking-tighter max-w-5xl mx-auto">
            Your <span className="hl-ink">AI revenue team,</span> under one login.
          </h1>
          <p className="mt-6 sm:mt-8 text-base sm:text-lg text-ink-muted max-w-2xl mx-auto leading-relaxed px-2">
            The Innoira Agentic Suite is six specialist agents — outbound email, AI calling, scheduling,
            proposals, content and social — working one shared pipeline. Not six tools taped together.
          </p>
          <div className="mt-8 sm:mt-10 flex items-center justify-center gap-3 flex-wrap">
            <Link to="/signup" data-testid="hero-cta-start" className="btn-primary">Start free <ArrowRight size={14} /></Link>
            <a href="#agents" className="btn-secondary bg-white border-line hover:bg-ash">Meet the agents</a>
          </div>

          {/* Hero visual — the cross-agent relay */}
          <div className="mt-14 sm:mt-20 max-w-3xl mx-auto">
            <div className="bg-ink text-white border border-white/10 rounded-2xl p-6 sm:p-8 md:p-10 text-left shadow-card-lg">
              <div className="ui-label mb-4 sm:mb-6 text-white/70">One qualified call, zero manual follow-up</div>
              <div className="space-y-0">
                {RELAY.map((s, i) => (
                  <div key={s.agent} className="flex gap-3 sm:gap-4">
                    <div className="flex flex-col items-center">
                      <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-[10px] font-mono font-bold shrink-0 ${i === 0 ? "bg-white text-ink" : "bg-white/10 text-white/60"}`}>
                        {i + 1}
                      </div>
                      {i < RELAY.length - 1 && <div className="w-px flex-1 bg-white/10 my-1" />}
                    </div>
                    <div className={i < RELAY.length - 1 ? "pb-5 sm:pb-6" : ""}>
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="font-display font-semibold text-sm sm:text-base text-white">{s.agent}</span>
                        <span className="text-xs sm:text-sm text-white/70">{s.event}</span>
                      </div>
                      <div className="text-[10px] sm:text-xs font-mono text-white/50 mt-1">{s.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-5 sm:mt-6 pt-4 sm:pt-5 border-t border-white/10 text-xs sm:text-sm text-white/60">
                Agents hand off to each other automatically — a "yes" on the phone becomes a drafted
                proposal and a booking link before your rep has hung up.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Agents grid */}
      <section id="agents" className="px-6 sm:px-8 py-16 sm:py-24 animate-fade-up animate-delay-1">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-14">
            <div className="ui-label mb-3">The Innoira Agentic Suite</div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-display font-bold tracking-tight">
              Six specialists. <span className="hl-ink">One pipeline.</span>
            </h2>
            <p className="mt-4 text-ink-muted text-sm sm:text-base">
              Every agent reads from and writes back to the same CRM, timeline and credit pool — no exports, no Zapier, no copy-paste.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {AGENTS.map((a) => (
              <div key={a.name} data-testid={`landing-agent-${a.name.toLowerCase().replace(/\s+/g, "-")}`}
                className="bg-ink text-white border border-white/10 rounded-2xl p-6 sm:p-8 hover:border-white/30 hover:shadow-card-hover transition-all shadow-card">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center">
                    <a.icon size={18} strokeWidth={1.75} />
                  </div>
                  <span className="pill bg-white/10 text-white/70"><span className="w-1.5 h-1.5 rounded-full bg-success" /> Live</span>
                </div>
                <div className="mt-4 sm:mt-5 flex items-baseline gap-2">
                  <span className="font-display font-semibold text-base sm:text-lg text-white">{a.name}</span>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-white/50">{a.tag}</span>
                </div>
                <div className="text-xs sm:text-sm text-white/60 mt-2 leading-relaxed">{a.d}</div>
              </div>
            ))}
          </div>
          <p className="text-center text-xs sm:text-sm text-ink-muted mt-8">
            10+ more agents on the roadmap — every new one plugs into the same workspace, CRM and credits.
          </p>
        </div>
      </section>

{/* Shared foundation */}
      <section id="relay" className="px-6 sm:px-8 py-16 sm:py-24 bg-ink text-white animate-fade-up animate-delay-2">
        <div className="max-w-6xl mx-auto">
          <div className="max-w-2xl mb-10 sm:mb-14">
            <div className="ui-label mb-4 text-white/70">Why a suite beats six point tools</div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-display font-bold tracking-tight">
              The agents <span className="hl-white">share a brain.</span>
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: Database, t: "One CRM & timeline", d: "Leads, deals and every touchpoint — an email opened, a call analyzed, a proposal viewed — live on one shared record." },
              { icon: GitBranch, t: "Cross-agent handoffs", d: "A qualified call can auto-draft the proposal, queue the follow-up email and send the booking link. Configured per agent, no glue code." },
              { icon: Coins, t: "One credit pool", d: "Every plan unlocks all agents drawing from one balance — a call costs more than an email because it costs more to run." },
              { icon: ShieldCheck, t: "Human approval gates", d: "Social posts, outbound sends and live calls all respect explicit approval and do-not-contact rules. The agents work for you, not around you." },
            ].map((f) => (
              <div key={f.t} className="bg-white/5 border border-white/10 rounded-2xl p-6 sm:p-8 hover:border-white/30 hover:bg-white/10 transition-all">
                <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center">
                  <f.icon size={18} strokeWidth={1.75} />
                </div>
                <div className="mt-4 sm:mt-5 font-display font-semibold text-base sm:text-lg text-white">{f.t}</div>
                <div className="mt-2 text-xs sm:text-sm text-white/60 leading-relaxed">{f.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Suite pricing */}
      <section id="suite-pricing" className="px-6 sm:px-8 py-16 sm:py-24 bg-ink border-y border-white/10 animate-fade-up animate-delay-3">
        <div className="max-w-6xl mx-auto">
          <div className="text-center">
            <div className="ui-label mb-4 text-white/70">One plan, every agent</div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-display font-bold tracking-tight text-white">Pay for <span className="hl-white">what the agents do.</span></h2>
            <p className="mt-4 text-white/70 max-w-2xl mx-auto text-sm sm:text-base">
              No per-agent fees and no per-seat surprises. Every plan unlocks all six agents and a pool of
              credits they draw from — a call costs more than an email because it costs us more to run.
            </p>
          </div>

          <div className="mt-10 sm:mt-14 grid sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            {[
              { id: "starter", name: "Starter", price: 79, annual: 65, credits: "8,000", seats: "3 seats",
                blurb: "A founder or small team getting outbound running." },
              { id: "growth", name: "Growth", price: 249, annual: 199, credits: "30,000", seats: "10 seats",
                blurb: "The full suite at production volume.", popular: true },
              { id: "scale", name: "Scale", price: 749, annual: 599, credits: "120,000", seats: "Unlimited seats",
                blurb: "High-volume calling across a whole revenue org." },
              { id: "enterprise", name: "Enterprise", price: null, credits: "Custom", seats: "Unlimited seats",
                blurb: "SSO, private deployment, custom agents." },
            ].map((p) => (
              <div key={p.id} data-testid={`landing-plan-${p.id}`}
                className={`border rounded-2xl p-6 sm:p-8 flex flex-col text-left relative shadow-card ${p.popular ? "border-white ring-1 ring-white" : "border-white/10"}`}>
                {p.popular && (
                  <div className="absolute -top-3 left-5 sm:left-7 bg-white text-ink text-[10px] font-mono uppercase tracking-widest px-3 py-1 rounded-xl badge-info">
                    Most popular
                  </div>
                )}
                <div className="font-display font-semibold text-lg text-white">{p.name}</div>
                <div className="mt-3 flex items-baseline gap-1.5">
                  {p.price ? (
                    <>
                      <span className="font-mono text-3xl sm:text-4xl font-bold text-white">${p.price}</span>
                      <span className="text-sm text-white/50">/mo</span>
                    </>
                  ) : (
                    <span className="font-mono text-3xl sm:text-4xl font-bold text-white">Let's talk</span>
                  )}
                </div>
                {p.annual && (
                  <div className="text-xs text-white/40 mt-1">${p.annual}/mo billed annually</div>
                )}
                <p className="text-xs sm:text-sm text-white/60 mt-3 sm:mt-4 min-h-[36px] sm:min-h-[40px]">{p.blurb}</p>
                <ul className="mt-4 sm:mt-5 space-y-2 text-xs sm:text-sm text-white/70 flex-1">
                  {[`${p.credits} credits / month`, p.seats, "All six agents included", "Shared CRM & activity timeline"].map((x) => (
                    <li key={x} className="flex gap-2.5 items-start">
                      <span className="w-4 h-4 mt-0.5 bg-white text-ink rounded-full flex items-center justify-center text-[9px] shrink-0">✓</span>
                      <span>{x}</span>
                    </li>
                  ))}
                </ul>
                {p.id === "enterprise" ? (
                  <a href="mailto:hello@innoira.com" data-testid="pricing-cta-enterprise"
                    className="btn-ghost mt-5 sm:mt-6 justify-center border border-white/20 rounded-xl py-2 text-sm text-white hover:bg-white/10">Contact sales</a>
                ) : (
                  <Link to="/signup" data-testid={`pricing-cta-${p.id}`}
                    className={`mt-5 sm:mt-6 justify-center rounded-xl py-2 text-sm font-medium flex items-center gap-1.5 ${p.popular ? "bg-white text-ink hover:bg-white/90" : "border border-white/20 bg-transparent hover:bg-white/10 text-white"}`}>
                    Start free trial <ArrowRight size={14} />
                  </Link>
                )}
              </div>
            ))}
          </div>

          <div className="mt-8 sm:mt-10 border border-white/10 rounded-2xl p-6 sm:p-8 shadow-card bg-white/5">
            <div className="ui-label text-white/70">What a credit buys</div>
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 sm:gap-5 text-sm">
              {[
                { n: "20", l: "per minute of an AI phone call" },
                { n: "60", l: "per researched proposal deck" },
                { n: "40", l: "per AI-generated carousel" },
                { n: "25", l: "per AI image" },
                { n: "5", l: "per enriched contact" },
                { n: "1", l: "per AI email + EQ Score" },
              ].map((c) => (
                <div key={c.l}>
                  <div className="font-mono text-xl sm:text-2xl font-bold text-white">{c.n}</div>
                  <div className="text-[10px] sm:text-xs text-white/50 mt-1 leading-snug">{c.l}</div>
                </div>
              ))}
            </div>
            <p className="text-[10px] sm:text-xs text-white/40 mt-5 sm:mt-6">
              Exports, CRM writes and bookings are free — you're never charged to read your own data.
              Every plan starts with a 14-day trial and 500 credits, no card required.
            </p>
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="px-6 sm:px-8 py-20 sm:py-28 bg-ink animate-fade-up">
        <div className="max-w-3xl mx-auto text-center">
          <InnoiraLogo size="lg" variant="light" className="mx-auto" />
          <p className="mt-6 text-white/70 text-sm sm:text-base">
            Put six agents on your pipeline this afternoon. Free for 14 days, no card.
          </p>
          <Link to="/signup" data-testid="footer-cta-start" className="btn-primary mt-8 inline-flex">
            Start free <ArrowRight size={14} />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-8 sm:py-10 px-6 sm:px-8 animate-fade-up bg-ink">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-[10px] sm:text-xs text-white/40 font-mono uppercase tracking-widest">
          <div>© Innoira Consulting Services · Agentic Suite</div>
          <div className="flex gap-6 text-white/40">
            <a href="#" className="hover:text-white transition-colors">Privacy</a>
            <a href="#" className="hover:text-white transition-colors">Terms</a>
            <a href="mailto:hello@innoira.com" className="hover:text-white transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
