import { Link } from "react-router-dom";
import { useState } from "react";
import {
  ArrowUpRight, ArrowRight, Mail, PhoneCall, CalendarClock,
  FileText, Images, Share2, Database, Coins, ShieldCheck, GitBranch, Menu, X,
  Users, DollarSign, Smartphone, Phone, Lock, KeyRound, Building2, Check, Globe,
} from "lucide-react";
import {
  Accordion, AccordionItem, AccordionTrigger, AccordionContent,
} from "../components/ui/accordion";
import InnoiraLogo from "../components/InnoiraLogo";
import ParticleField from "../components/ParticleField";
import HubOrbit from "../components/HubOrbit";
import UseCaseFlow from "../components/UseCaseFlow";

const AGENTS = [
  { icon: Mail, name: "Pitch EQ", tag: "Outbound email" },
  { icon: PhoneCall, name: "Voice EQ", tag: "AI calling" },
  { icon: Phone, name: "WhatsApp EQ", tag: "WhatsApp Business" },
  { icon: Smartphone, name: "SMS EQ", tag: "Text messaging" },
  { icon: CalendarClock, name: "Schedule EQ", tag: "Scheduling" },
  { icon: FileText, name: "Proposal EQ", tag: "Proposals" },
  { icon: Images, name: "Create EQ", tag: "Content studio" },
  { icon: Share2, name: "Social EQ", tag: "Social posting" },
  { icon: Users, name: "HRMS EQ", tag: "HR & people" },
  { icon: DollarSign, name: "Accounting EQ", tag: "Finance" },
];

// Name → icon lookup used by UseCaseFlow's per-agent nodes; includes Site EQ
// (referenced by the "one inbox" use case below) even though it isn't in the
// 10-agent roster grid above.
const AGENT_ICON = Object.fromEntries(AGENTS.map((a) => [a.name, a.icon]));
AGENT_ICON["Site EQ"] = Globe;

// Each use case names the real agents involved and the concrete handoff
// between them — the point isn't "AI can do X," it's "these specific
// products already talk to each other," which is the actual differentiator
// worth being specific about.
const USE_CASES = [
  {
    agents: ["Pitch EQ", "Voice EQ", "Schedule EQ"],
    title: "Cold outreach that turns into booked calls",
    body: "Pitch EQ finds verified prospects and writes cold email that reads human, gated by an EQ Score before anything sends. When a reply looks interested, Voice EQ can call and qualify them conversationally, and Schedule EQ books the meeting straight onto your calendar — no rep touches a scheduling link.",
  },
  {
    agents: ["Pitch EQ", "WhatsApp EQ", "SMS EQ", "Social EQ", "Site EQ"],
    title: "Every channel, one inbox",
    body: "Email replies, WhatsApp threads, SMS, social DMs and website chat all land in a single unified inbox tied to the same lead record. Nobody's asking “did we already talk to this person on another channel?” because there's only one record of the conversation.",
  },
  {
    agents: ["Schedule EQ"],
    title: "Meetings that book themselves",
    body: "A real booking page with real availability, buffers and qualifying questions. Confirmations, reminders, reschedules and no-show risk scoring run on their own — the calendar fills in while you do the actual work of running your business.",
  },
  {
    agents: ["Proposal EQ", "Accounting EQ"],
    title: "From verbal yes to signed and paid",
    body: "Proposal EQ turns a deal's CRM context into a researched, priced, on-brand proposal in minutes. Once it's accepted, Accounting EQ converts it straight into an invoice and posts the ledger automatically — the same numbers, never re-typed into a second tool.",
  },
  {
    agents: ["HRMS EQ", "Accounting EQ"],
    title: "HR and the books, without the spreadsheet",
    body: "Org charts, AI-scored recruitment pipelines, onboarding, leave and performance reviews on one side. Double-entry bookkeeping with enforced balance rules, AR/AP and real financial reports on the other — both living in the same workspace as your revenue data, not a side export.",
  },
];

const RELAY = [
  { agent: "Voice EQ", event: "Call ended — lead qualified", detail: "sentiment: positive · budget: yes" },
  { agent: "Proposal EQ", event: "Proposal auto-drafted", detail: "researched, priced, ready to review" },
  { agent: "Schedule EQ", event: "Booking link queued", detail: "30-min demo · next available slots" },
  { agent: "SMS EQ", event: "Follow-up SMS sent", detail: "confirmation + calendar link" },
];

const FAQS = [
  {
    q: "Is this just ChatGPT wrapped in a dashboard?",
    a: "No. The LLM writes and reasons, but the actions are real: Voice EQ places real phone calls over Twilio, Schedule EQ runs an actual availability and booking engine, Accounting EQ enforces double-entry bookkeeping rules on every transaction, and Pitch EQ sends from a mailbox you connect via real OAuth. The model is one component, not the whole product.",
  },
  {
    q: "Can the agents send or post anything without my approval?",
    a: "Social posts, outbound sends, WhatsApp templates and do-not-contact rules all respect explicit human approval gates by default. Nothing publishes or dials on its own unless you've configured it to.",
  },
  {
    q: "Do I have to use all ten agents?",
    a: "No — every plan unlocks all ten, but you only turn on what you need. A lot of teams start with just Pitch EQ and Schedule EQ and add the rest later, from the same workspace and the same login.",
  },
  {
    q: "What happens after the 14-day trial?",
    a: "You keep using whatever you've set up on whichever plan you pick — no auto-upgrade, no surprise charge. If you don't choose a plan, the workspace simply pauses; nothing is deleted and no card is charged without your action.",
  },
  {
    q: "What can I connect it to?",
    a: "Gmail connects today via real OAuth for actual sending, and Google Calendar for real availability. Voice calling and SMS run on a live Twilio account. Microsoft 365 and CRM sync integrations are on the near-term roadmap — ask us where they stand for your use case.",
  },
  {
    q: "How is my data handled?",
    a: "Passwords are hashed (bcrypt, never stored in plain text), OAuth tokens are encrypted at rest, and every workspace's data is isolated from every other workspace at the database layer. Your content is sent to Anthropic's API to generate drafts and isn't used to train anyone else's model.",
  },
];

export default function Landing() {
  const [mobileNav, setMobileNav] = useState(false);

  return (
    <div className="min-h-screen bg-bone text-ink animate-fade-in">
      {/* Nav */}
      <header className="fixed top-0 left-0 right-0 z-50 px-6 sm:px-8 pt-4">
        <div className="nav-floating max-w-7xl mx-auto pl-3 pr-3 py-2.5 grid grid-cols-[auto_1fr_auto] items-center gap-4 sm:gap-8">
          <Link to="/" className="flex items-center shrink-0">
            <InnoiraLogo size="sm" />
          </Link>
          <nav className="hidden md:flex items-center justify-center gap-8 text-sm text-ink-muted">
            <a href="#use-cases" className="hover:text-ink">Use cases</a>
            <a href="#agents" className="hover:text-ink">The agents</a>
            <a href="#relay" className="hover:text-ink">How it works</a>
            <a href="#suite-pricing" className="hover:text-ink">Pricing</a>
            <a href="#faq" className="hover:text-ink">FAQ</a>
          </nav>
          <div className="flex items-center justify-end gap-1">
            <Link to="/login" data-testid="nav-login" className="btn-ghost hidden sm:inline-flex">Sign in</Link>
            <Link to="/signup" data-testid="nav-signup" className="btn-primary py-2 px-4 sm:px-5 text-sm">Start free <ArrowUpRight size={14} /></Link>
            <button onClick={() => setMobileNav(!mobileNav)} className="md:hidden p-2 text-ink-muted hover:text-ink rounded-xl">
              {mobileNav ? <X size={16} /> : <Menu size={16} />}
            </button>
          </div>
        </div>
        {mobileNav && (
          <div className="md:hidden max-w-7xl mx-auto mt-2 bg-surface border border-line rounded-2xl p-4 space-y-3 shadow-card">
            <a href="#use-cases" onClick={() => setMobileNav(false)} className="block text-sm text-ink-muted hover:text-ink py-2 rounded-xl">Use cases</a>
            <a href="#agents" onClick={() => setMobileNav(false)} className="block text-sm text-ink-muted hover:text-ink py-2 rounded-xl">The agents</a>
            <a href="#relay" onClick={() => setMobileNav(false)} className="block text-sm text-ink-muted hover:text-ink py-2 rounded-xl">How it works</a>
            <a href="#suite-pricing" onClick={() => setMobileNav(false)} className="block text-sm text-ink-muted hover:text-ink py-2 rounded-xl">Pricing</a>
            <a href="#faq" onClick={() => setMobileNav(false)} className="block text-sm text-ink-muted hover:text-ink py-2 rounded-xl">FAQ</a>
            <Link to="/login" onClick={() => setMobileNav(false)} className="block text-sm text-ink-muted hover:text-ink py-2 rounded-xl">Sign in</Link>
          </div>
        )}
      </header>

      {/* Hero */}
      <section className="relative px-6 sm:px-8 pt-24 sm:pt-32 pb-16 sm:pb-20 animate-fade-up overflow-hidden">
        <ParticleField className="absolute inset-0 w-full h-full pointer-events-none opacity-70" />
        <div className="relative max-w-6xl mx-auto text-center">
          <div className="pill mx-auto mb-6 sm:mb-8"><span className="w-1.5 h-1.5 rounded-full bg-success" /> Ten agents live · one platform</div>
          <h1 className="font-display font-bold text-4xl sm:text-6xl lg:text-7xl leading-[1.05] sm:leading-[1.02] tracking-tighter max-w-4xl mx-auto">
            Your entire <span className="hl-ink">enterprise,</span> under one login.
          </h1>
          <p className="mt-6 sm:mt-8 text-base sm:text-lg text-ink-muted max-w-2xl mx-auto leading-relaxed px-2">
            Ten specialist agents — outbound email, AI calling, WhatsApp, SMS, scheduling,
            proposals, content, social, HR and accounting — reading from and writing back to
            one shared pipeline. Not ten tools taped together with Zapier.
          </p>
          <div className="mt-8 sm:mt-10 flex items-center justify-center gap-3 flex-wrap">
            <Link to="/signup" data-testid="hero-cta-start" className="btn-primary">Start free <ArrowRight size={14} /></Link>
            <a href="#use-cases" className="btn-secondary">See how teams use it</a>
          </div>
          <p className="mt-4 text-tiny text-ink-muted font-mono uppercase tracking-wider">14-day trial · 500 credits · no card required</p>
        </div>

        {/* Hero visual — live animated hub instead of a static illustration */}
        <div className="relative max-w-2xl mx-auto mt-12 sm:mt-16">
          <div className="rounded-3xl border border-line bg-surface shadow-card-lg overflow-hidden p-8 sm:p-12">
            <HubOrbit agents={AGENTS} />
          </div>
        </div>
      </section>

      {/* Use cases — the core of the page: outcomes, not a feature list */}
      <section id="use-cases" className="px-6 sm:px-8 py-16 sm:py-24 animate-fade-up animate-delay-100">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-14">
            <div className="ui-label mb-3">Built for how modern businesses actually work</div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-display font-bold tracking-tight">
              Five things teams stop doing by hand.
            </h2>
            <p className="mt-4 text-ink-muted text-sm sm:text-base">
              Each of these is several agents handing off to each other automatically —
              not one model trying to do everything at once.
            </p>
          </div>

          <div className="space-y-4 sm:space-y-5">
            {USE_CASES.map((u, i) => (
              <div key={u.title} data-testid={`use-case-${i}`}
                className="bg-surface border border-line rounded-3xl overflow-hidden shadow-card hover:shadow-card-hover transition-all duration-200">
                <div className={`grid md:grid-cols-2 ${i % 2 === 1 ? "md:[&>*:first-child]:order-2" : ""}`}>
                  <div className="bg-ash flex items-center p-6 sm:p-10">
                    <UseCaseFlow agents={u.agents} iconMap={AGENT_ICON} />
                  </div>
                  <div className="p-6 sm:p-10 flex flex-col justify-center">
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {u.agents.map((a) => <span key={a} className="pill">{a}</span>)}
                    </div>
                    <h3 className="text-xl sm:text-2xl font-display font-semibold tracking-tight">{u.title}</h3>
                    <p className="mt-3 text-sm sm:text-base text-ink-tertiary leading-relaxed">{u.body}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* All ten agents, at a glance */}
      <section id="agents" className="px-6 sm:px-8 py-16 sm:py-20 animate-fade-up animate-delay-200">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-8 sm:mb-10">
            <div className="ui-label mb-3">The full roster</div>
            <h2 className="text-2xl sm:text-3xl font-display font-bold tracking-tight">
              All ten agents, <span className="hl-ink">one workspace.</span>
            </h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {AGENTS.map((a) => (
              <div key={a.name} data-testid={`landing-agent-${a.name.toLowerCase().replace(/\s+/g, "-")}`}
                className="bg-surface border border-line rounded-2xl p-4 sm:p-5 text-center hover:border-ink/20 hover:shadow-card transition-all">
                <div className="w-9 h-9 mx-auto bg-ash rounded-full flex items-center justify-center">
                  <a.icon size={15} strokeWidth={1.75} />
                </div>
                <div className="mt-3 font-display font-semibold text-sm">{a.name}</div>
                <div className="text-tiny text-ink-muted mt-0.5">{a.tag}</div>
              </div>
            ))}
          </div>
          <p className="text-center text-xs sm:text-sm text-ink-muted mt-8">
            10+ more agents on the roadmap — every new one plugs into the same workspace, CRM and credits.
          </p>
        </div>
      </section>

      {/* Shared foundation / mechanism proof */}
      <section id="relay" className="px-6 sm:px-8 py-16 sm:py-24 bg-ink text-white animate-fade-up animate-delay-300">
        <div className="max-w-6xl mx-auto">
          <div className="max-w-2xl mb-10 sm:mb-14">
            <div className="ui-label mb-4 text-white/70">Why a suite beats ten point tools</div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-display font-bold tracking-tight">
              The agents <span className="hl-white">share a brain.</span>
            </h2>
          </div>

          <div className="grid lg:grid-cols-2 gap-8 sm:gap-10 items-start">
            {/* Concrete example first — specificity is what makes "handoffs" credible */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 sm:p-8">
              <div className="ui-label mb-4 sm:mb-6 text-white/70">One qualified call, zero manual follow-up</div>
              <div className="space-y-0">
                {RELAY.map((s, i) => (
                  <div key={s.agent} className="flex gap-3 sm:gap-4">
                    <div className="flex flex-col items-center">
                      <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-tiny font-mono font-bold shrink-0 ${i === 0 ? "bg-white text-ink" : "bg-white/10 text-white/80"}`}>
                        {i + 1}
                      </div>
                      {i < RELAY.length - 1 && <div className="w-px flex-1 bg-white/10 my-1" />}
                    </div>
                    <div className={i < RELAY.length - 1 ? "pb-5 sm:pb-6" : ""}>
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="font-display font-semibold text-sm sm:text-base text-white">{s.agent}</span>
                        <span className="text-xs sm:text-sm text-white/70">{s.event}</span>
                      </div>
                      <div className="text-tiny sm:text-xs font-mono text-white/70 mt-1">{s.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-5 sm:mt-6 pt-4 sm:pt-5 border-t border-white/10 text-xs sm:text-sm text-white/80">
                Agents hand off to each other automatically — a "yes" on the phone becomes a drafted
                proposal, a booking link, and a confirmation SMS before your rep has hung up.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              {[
                { icon: Database, t: "One CRM & timeline", d: "Leads, deals and every touchpoint — an email opened, a call analyzed, a proposal viewed — live on one shared record." },
                { icon: GitBranch, t: "Cross-agent handoffs", d: "Configured per agent, no glue code, no exports, no Zapier in between." },
                { icon: Coins, t: "One credit pool", d: "Every plan unlocks all ten agents drawing from one balance — a call costs more than an SMS because it costs more to run." },
                { icon: ShieldCheck, t: "Human approval gates", d: "Social posts, outbound sends, WhatsApp templates and live calls all respect explicit approval and do-not-contact rules." },
              ].map((f) => (
                <div key={f.t} className="bg-white/5 border border-white/10 rounded-2xl p-5 sm:p-6 hover:border-white/30 hover:bg-white/10 transition-all">
                  <div className="w-9 h-9 bg-white/10 rounded-full flex items-center justify-center">
                    <f.icon size={15} strokeWidth={1.75} />
                  </div>
                  <div className="mt-3.5 font-display font-semibold text-sm sm:text-base text-white">{f.t}</div>
                  <div className="mt-1.5 text-xs sm:text-sm text-white/80 leading-relaxed">{f.d}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Data & security — concrete, verifiable trust signals, not vague reassurance */}
      <section className="px-6 sm:px-8 py-16 sm:py-20 animate-fade-up">
        <div className="max-w-6xl mx-auto">
          <div className="bg-surface border border-line rounded-3xl p-6 sm:p-10 shadow-card">
            <div className="grid md:grid-cols-[1fr_1.4fr] gap-8 sm:gap-10 items-center">
              <div>
                <div className="ui-label mb-3">Built to be trusted with your business data</div>
                <h2 className="text-2xl sm:text-3xl font-display font-bold tracking-tight">
                  Your data, <span className="hl-ink">isolated and encrypted.</span>
                </h2>
                <p className="mt-3 text-sm text-ink-muted leading-relaxed">
                  Not a promise — this is how the workspace is actually built.
                </p>
              </div>
              <div className="grid sm:grid-cols-3 gap-4">
                {[
                  { icon: Lock, t: "Encrypted at rest", d: "Passwords hashed with bcrypt. OAuth tokens for connected mailboxes and calendars encrypted before storage." },
                  { icon: Building2, t: "Workspace isolation", d: "Every read and write is scoped to your workspace at the database layer — no cross-tenant queries, ever." },
                  { icon: KeyRound, t: "Your content, not training data", d: "Drafts are generated via Anthropic's API. Your data isn't used to train anyone else's model." },
                ].map((f) => (
                  <div key={f.t}>
                    <div className="w-9 h-9 bg-ash rounded-full flex items-center justify-center">
                      <f.icon size={15} strokeWidth={1.75} />
                    </div>
                    <div className="mt-3 font-display font-semibold text-sm">{f.t}</div>
                    <div className="mt-1.5 text-xs text-ink-muted leading-relaxed">{f.d}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Suite pricing */}
      <section id="suite-pricing" className="px-6 sm:px-8 py-16 sm:py-24 bg-ink border-y border-white/10 animate-fade-up animate-delay-300">
        <div className="max-w-6xl mx-auto">
          <div className="text-center">
            <div className="ui-label mb-4 text-white/70">One plan, every agent</div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-display font-bold tracking-tight text-white">Pay for <span className="hl-white">what the agents do.</span></h2>
            <p className="mt-4 text-white/70 max-w-2xl mx-auto text-sm sm:text-base">
              No per-agent fees and no per-seat surprises. Every plan unlocks all ten agents and a pool of
              credits they draw from — a call costs more than an SMS because it costs us more to run.
            </p>
          </div>

          <div className="mt-10 sm:mt-14 grid sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            {[
              { id: "starter", name: "Starter", price: 79, annual: 65, credits: "8,000", seats: "3 seats",
                blurb: "A founder or small team getting outbound running." },
              { id: "growth", name: "Growth", price: 249, annual: 199, credits: "30,000", seats: "10 seats",
                blurb: "The full suite at production volume.", popular: true },
              { id: "scale", name: "Scale", price: 749, annual: 599, credits: "120,000", seats: "Unlimited seats",
                blurb: "High-volume calling and messaging across a whole enterprise." },
              { id: "enterprise", name: "Enterprise", price: null, credits: "Custom", seats: "Unlimited seats",
                blurb: "SSO, private deployment, custom agents." },
            ].map((p) => (
              <div key={p.id} data-testid={`landing-plan-${p.id}`}
                className={`border rounded-2xl p-6 sm:p-8 flex flex-col text-left relative shadow-card ${p.popular ? "border-white ring-1 ring-white" : "border-white/10"}`}>
                {p.popular && (
                  <div className="absolute -top-3 left-5 sm:left-7 bg-white text-ink text-tiny font-mono uppercase tracking-widest px-3 py-1 rounded-xl">
                    Most popular
                  </div>
                )}
                <div className="font-display font-semibold text-lg text-white">{p.name}</div>
                <div className="mt-3 flex items-baseline gap-1.5">
                  {p.price ? (
                    <>
                      <span className="font-mono text-3xl sm:text-4xl font-bold text-white">${p.price}</span>
                      <span className="text-sm text-white/70">/mo</span>
                    </>
                  ) : (
                    <span className="font-mono text-3xl sm:text-4xl font-bold text-white">Let's talk</span>
                  )}
                </div>
                {p.annual && (
                  <div className="text-xs text-white/80 mt-1">${p.annual}/mo billed annually</div>
                )}
                <p className="text-xs sm:text-sm text-white/80 mt-3 sm:mt-4 min-h-[36px] sm:min-h-[40px]">{p.blurb}</p>
                <ul className="mt-4 sm:mt-5 space-y-2 text-xs sm:text-sm text-white/70 flex-1">
                  {[`${p.credits} credits / month`, p.seats, "All ten agents included", "Shared CRM & activity timeline"].map((x) => (
                    <li key={x} className="flex gap-2.5 items-start">
                      <span className="w-4 h-4 mt-0.5 bg-white text-ink rounded-full flex items-center justify-center shrink-0"><Check size={10} strokeWidth={3} /></span>
                      <span>{x}</span>
                    </li>
                  ))}
                </ul>
                {p.id === "enterprise" ? (
                  <a href="mailto:hello@innoira.com" data-testid="pricing-cta-enterprise"
                    className="mt-5 sm:mt-6 flex items-center justify-center gap-2 border border-white/20 rounded-xl py-2 text-sm font-medium text-white hover:bg-white/10 transition-colors duration-150">Contact sales</a>
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
                { n: "5", l: "per AI-enriched lead or candidate score" },
                { n: "2", l: "per WhatsApp broadcast message" },
                { n: "1", l: "per AI email, SMS, or EQ Score" },
              ].map((c) => (
                <div key={c.l}>
                  <div className="text-section font-display font-bold text-white">{c.n}</div>
                  <div className="text-tiny sm:text-xs text-white/70 mt-1 leading-snug">{c.l}</div>
                </div>
              ))}
            </div>
            <p className="text-tiny sm:text-xs text-white/80 mt-5 sm:mt-6">
              Exports, CRM writes, HR records, journal entries, and bookings are free — you're never charged to read your own data.
              Every plan starts with a 14-day trial and 500 credits, no card required.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ — direct objection handling */}
      <section id="faq" className="px-6 sm:px-8 py-16 sm:py-24 animate-fade-up">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10 sm:mb-14">
            <div className="ui-label mb-3">Before you ask</div>
            <h2 className="text-3xl sm:text-4xl font-display font-bold tracking-tight">
              Questions worth answering upfront.
            </h2>
          </div>
          <Accordion type="single" collapsible className="bg-surface border border-line rounded-3xl px-6 sm:px-8 shadow-card">
            {FAQS.map((f, i) => (
              <AccordionItem key={f.q} value={`item-${i}`} className={i === FAQS.length - 1 ? "border-b-0" : "border-line"}>
                <AccordionTrigger className="text-body sm:text-base font-display font-semibold py-5 sm:py-6">{f.q}</AccordionTrigger>
                <AccordionContent className="text-sm text-ink-tertiary leading-relaxed pb-5 sm:pb-6">{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="px-6 sm:px-8 py-20 sm:py-28 bg-ink animate-fade-up">
        <div className="max-w-3xl mx-auto text-center">
          <InnoiraLogo size="lg" variant="light" className="mx-auto" />
          <p className="mt-6 text-white/70 text-sm sm:text-base">
            Put ten agents on your pipeline this afternoon. Free for 14 days, no card.
          </p>
          <Link to="/signup" data-testid="footer-cta-start" className="btn-primary mt-8 inline-flex">
            Start free <ArrowRight size={14} />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-8 sm:py-10 px-6 sm:px-8 animate-fade-up bg-ink">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-tiny sm:text-xs text-white/80 font-mono uppercase tracking-widest">
          <div>© INNOIRA Consulting Services 2026 · CONFIDENTIAL</div>
          <div className="flex gap-6 text-white/80">
            <a href="#" className="hover:text-white transition-colors">Privacy</a>
            <a href="#" className="hover:text-white transition-colors">Terms</a>
            <a href="mailto:hello@innoira.com" className="hover:text-white transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
