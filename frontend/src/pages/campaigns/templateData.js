/**
 * Campaign Template Library
 *
 * Templates are organized: category → subcategory → templates.
 * The UI lazy-loads at each level so we never dump all templates on one screen.
 */

export const CATEGORIES = [
  {
    id: "sales",
    label: "Sales Outreach",
    icon: "Target",
    description: "Start conversations and book meetings",
    subcategories: [
      { id: "cold-outreach", label: "Cold Outreach", count: 8 },
      { id: "lead-introduction", label: "Lead Introduction", count: 4 },
      { id: "meeting-request", label: "Meeting Request", count: 5 },
      { id: "follow-up", label: "Follow-up", count: 6 },
      { id: "breakup", label: "Breakup / Last Touch", count: 3 },
      { id: "account-based", label: "Account-Based Outreach", count: 4 },
    ],
  },
  {
    id: "marketing",
    label: "Marketing",
    icon: "Megaphone",
    description: "Announce, promote and educate",
    subcategories: [
      { id: "product-launch", label: "Product Launch", count: 4 },
      { id: "product-announcement", label: "Product Announcement", count: 3 },
      { id: "newsletter", label: "Newsletter", count: 5 },
      { id: "promotion", label: "Promotion", count: 4 },
      { id: "event-invitation", label: "Event Invitation", count: 3 },
      { id: "webinar", label: "Webinar", count: 4 },
    ],
  },
  {
    id: "customer",
    label: "Customer",
    icon: "Users",
    description: "Onboard, retain and grow accounts",
    subcategories: [
      { id: "onboarding", label: "Onboarding", count: 4 },
      { id: "customer-update", label: "Customer Update", count: 3 },
      { id: "renewal", label: "Renewal", count: 3 },
      { id: "re-engagement", label: "Re-engagement", count: 4 },
      { id: "feedback-request", label: "Feedback Request", count: 3 },
    ],
  },
  {
    id: "recruiting",
    label: "Recruiting",
    icon: "UserPlus",
    description: "Attract and hire top talent",
    subcategories: [
      { id: "candidate-outreach", label: "Candidate Outreach", count: 4 },
      { id: "interview-invitation", label: "Interview Invitation", count: 3 },
      { id: "recruiting-follow-up", label: "Follow-up", count: 3 },
      { id: "employer-branding", label: "Employer Branding", count: 3 },
    ],
  },
];

/**
 * Template definitions grouped by subcategory.
 * Each template has a consistent shape for the UI to render.
 */
export const TEMPLATES = {
  // ── Sales / Cold Outreach ──────────────────────────────────────
  "cold-outreach": [
    {
      id: "cold-problem-insight",
      name: "Problem → Insight → CTA",
      description: "Lead with a specific problem, deliver an insight, close with a low-friction CTA.",
      steps: 4,
      recommendedAudience: "Senior decision-makers",
      readingTime: "30s",
      variables: ["first_name", "company_name", "job_title", "industry", "pain_point"],
      structure: [
        { day: 0, label: "Introduction", subject: "Quick thought on {{company_name}}'s {{pain_point}}" },
        { day: 2, label: "Value Insight", subject: "How {{similar_company}} solved this" },
        { day: 5, label: "Social Proof", subject: "The numbers behind the shift" },
        { day: 8, label: "CTA", subject: "Worth 15 minutes?" },
      ],
    },
    {
      id: "cold-personalized-intro",
      name: "Personalized Introduction",
      description: "Open with deep personalization showing genuine research into the prospect.",
      steps: 3,
      recommendedAudience: "VP+ executives",
      readingTime: "25s",
      variables: ["first_name", "company_name", "recent_news", "job_title"],
      structure: [
        { day: 0, label: "Research Hook", subject: "Congrats on {{recent_news}}, {{first_name}}" },
        { day: 3, label: "Bridge to Solution", subject: "Where we might overlap" },
        { day: 7, label: "Soft CTA", subject: "Open to a quick chat?" },
      ],
    },
    {
      id: "cold-industry-pain",
      name: "Industry Pain Point",
      description: "Open with a known industry challenge and position your solution as the answer.",
      steps: 4,
      recommendedAudience: "Industry-specific prospects",
      readingTime: "30s",
      variables: ["first_name", "company_name", "industry", "pain_point", "job_title"],
      structure: [
        { day: 0, label: "Pain Statement", subject: "The {{industry}} challenge nobody talks about" },
        { day: 2, label: "Data Point", subject: "73% of {{industry}} teams face this" },
        { day: 5, label: "Solution Angle", subject: "How we approach it differently" },
        { day: 8, label: "CTA", subject: "Quick comparison?" },
      ],
    },
    {
      id: "cold-social-proof",
      name: "Social Proof Outreach",
      description: "Lead with results and case studies to build credibility fast.",
      steps: 3,
      recommendedAudience: "Skeptical or experienced buyers",
      readingTime: "20s",
      variables: ["first_name", "company_name", "industry", "job_title"],
      structure: [
        { day: 0, label: "Results Hook", subject: "{{similar_company}} saved 40% on operations" },
        { day: 3, label: "How It Works", subject: "The playbook behind it" },
        { day: 7, label: "CTA", subject: "See if it fits {{company_name}}" },
      ],
    },
    {
      id: "cold-referral",
      name: "Referral-Style Outreach",
      description: "Leverage mutual connections or shared context for warm-style cold outreach.",
      steps: 3,
      recommendedAudience: "Networked professionals",
      readingTime: "20s",
      variables: ["first_name", "company_name", "referral_name", "job_title"],
      structure: [
        { day: 0, label: "Connection Reference", subject: "Referred by {{referral_name}}" },
        { day: 3, label: "Value Pitch", subject: "What we built for companies like {{company_name}}" },
        { day: 7, label: "CTA", subject: "Worth a conversation?" },
      ],
    },
    {
      id: "cold-executive",
      name: "Executive Outreach",
      description: "Short, high-level messaging designed for C-suite attention spans.",
      steps: 2,
      recommendedAudience: "C-level executives",
      readingTime: "15s",
      variables: ["first_name", "company_name", "job_title", "pain_point"],
      structure: [
        { day: 0, label: "One-Liner", subject: "{{pain_point}} — fixing it in 90 days" },
        { day: 4, label: "Follow-up", subject: "Re: above" },
      ],
    },
    {
      id: "cold-short-direct",
      name: "Short & Direct",
      description: "Ultra-concise outreach that respects the reader's time. No fluff.",
      steps: 2,
      recommendedAudience: "Fast-moving startups",
      readingTime: "10s",
      variables: ["first_name", "company_name", "job_title"],
      structure: [
        { day: 0, label: "Direct Ask", subject: "{{first_name}}, quick question" },
        { day: 3, label: "Bump", subject: "Re: above" },
      ],
    },
    {
      id: "cold-consultative",
      name: "Consultative Outreach",
      description: "Position yourself as an advisor, not a seller. Share insights first.",
      steps: 5,
      recommendedAudience: "Complex enterprise sales",
      readingTime: "40s",
      variables: ["first_name", "company_name", "industry", "pain_point", "job_title"],
      structure: [
        { day: 0, label: "Industry Insight", subject: "A trend in {{industry}} worth watching" },
        { day: 2, label: "Data Sharing", subject: "Our latest research on {{pain_point}}" },
        { day: 5, label: "Framework", subject: "3 questions every {{job_title}} should ask" },
        { day: 9, label: "Case Study", subject: "How {{similar_company}} navigated this" },
        { day: 12, label: "CTA", subject: "Want to compare notes?" },
      ],
    },
  ],

  // ── Sales / Lead Introduction ──────────────────────────────────
  "lead-introduction": [
    {
      id: "intro-warm-handoff",
      name: "Warm Handoff",
      description: "Transition a warm lead into a structured conversation.",
      steps: 3,
      recommendedAudience: "Inbound leads",
      readingTime: "25s",
      variables: ["first_name", "company_name", "job_title"],
      structure: [
        { day: 0, label: "Welcome", subject: "Thanks for your interest, {{first_name}}" },
        { day: 2, label: "Value Add", subject: "Here's what to expect" },
        { day: 5, label: "CTA", subject: "Let's get started" },
      ],
    },
    {
      id: "intro-referral-warm",
      name: "Referral Introduction",
      description: "Capitalize on a referral with a warm, trust-building opening.",
      steps: 3,
      recommendedAudience: "Referred prospects",
      readingTime: "20s",
      variables: ["first_name", "company_name", "referral_name"],
      structure: [
        { day: 0, label: "Referral Mention", subject: "{{referral_name}} suggested we connect" },
        { day: 3, label: "Value Pitch", subject: "What we can do for {{company_name}}" },
        { day: 7, label: "CTA", subject: "Quick intro call?" },
      ],
    },
    {
      id: "intro-content-download",
      name: "Content Download Follow-up",
      description: "Follow up on a content download with relevant, helpful context.",
      steps: 3,
      recommendedAudience: "Content-engaged leads",
      readingTime: "20s",
      variables: ["first_name", "company_name", "content_title"],
      structure: [
        { day: 0, label: "Thanks", subject: "Hope {{content_title}} was useful" },
        { day: 2, label: "Related Insight", subject: "One more thing on this topic" },
        { day: 5, label: "CTA", subject: "Want to go deeper?" },
      ],
    },
    {
      id: "intro-event-followup",
      name: "Event Follow-up",
      description: "Reconnect after a conference or event with a personalized touch.",
      steps: 3,
      recommendedAudience: "Event attendees",
      readingTime: "25s",
      variables: ["first_name", "company_name", "event_name"],
      structure: [
        { day: 0, label: "Event Reference", subject: "Great meeting you at {{event_name}}" },
        { day: 2, label: "Value Share", subject: "Resources from our conversation" },
        { day: 5, label: "CTA", subject: "Continue the conversation?" },
      ],
    },
  ],

  // ── Sales / Meeting Request ────────────────────────────────────
  "meeting-request": [
    {
      id: "meeting-direct",
      name: "Direct Meeting Ask",
      description: "Straightforward meeting request with a specific time proposal.",
      steps: 2,
      recommendedAudience: "Engaged prospects",
      readingTime: "15s",
      variables: ["first_name", "company_name", "job_title", "meeting_link"],
      structure: [
        { day: 0, label: "Ask", subject: "{{first_name}}, 15 minutes this week?" },
        { day: 3, label: "Follow-up", subject: "Re: quick meeting" },
      ],
    },
    {
      id: "meeting-value-first",
      name: "Value-First Meeting",
      description: "Lead with value before asking for time — earn the meeting.",
      steps: 4,
      recommendedAudience: "Cold prospects",
      readingTime: "30s",
      variables: ["first_name", "company_name", "pain_point", "meeting_link"],
      structure: [
        { day: 0, label: "Insight", subject: "A finding about {{pain_point}}" },
        { day: 2, label: "Relevance", subject: "Why this matters for {{company_name}}" },
        { day: 5, label: "Social Proof", subject: "How others acted on this" },
        { day: 8, label: "Meeting Ask", subject: "15 min to walk through this?" },
      ],
    },
    {
      id: "meeting-calendar",
      name: "Calendar-Link Meeting",
      description: "Reduce friction with a self-service calendar booking link.",
      steps: 2,
      recommendedAudience: "Busy executives",
      readingTime: "10s",
      variables: ["first_name", "meeting_link"],
      structure: [
        { day: 0, label: "Quick Ask", subject: "{{first_name}}, pick a time that works" },
        { day: 4, label: "Reminder", subject: "Still open if you are" },
      ],
    },
    {
      id: "meeting-demo-offer",
      name: "Demo Offer",
      description: "Offer a live demo as the primary conversion mechanism.",
      steps: 3,
      recommendedAudience: "Product-eval prospects",
      readingTime: "20s",
      variables: ["first_name", "company_name", "meeting_link"],
      structure: [
        { day: 0, label: "Demo Invite", subject: "See it in action, {{first_name}}" },
        { day: 3, label: "Feature Highlight", subject: "One feature our users love" },
        { day: 7, label: "CTA", subject: "Book a 10-min walkthrough" },
      ],
    },
    {
      id: "meeting-reciprocal",
      name: "Reciprocal Meeting",
      description: "Frame the meeting as mutual value exchange, not a one-sided pitch.",
      steps: 3,
      recommendedAudience: "Peer-level contacts",
      readingTime: "25s",
      variables: ["first_name", "company_name", "industry"],
      structure: [
        { day: 0, label: "Peer Frame", subject: "Learning from {{industry}} leaders like you" },
        { day: 3, label: "Mutual Value", subject: "What I can share + what I'd love to learn" },
        { day: 7, label: "CTA", subject: "20 minutes, mutual benefit?" },
      ],
    },
  ],

  // ── Sales / Follow-up ──────────────────────────────────────────
  "follow-up": [
    {
      id: "followup-no-reply",
      name: "No Reply Follow-up",
      description: "Gentle nudge after no response. Different angle each touch.",
      steps: 3,
      recommendedAudience: "Unresponsive prospects",
      readingTime: "15s",
      variables: ["first_name", "company_name"],
      structure: [
        { day: 3, label: "Gentle Nudge", subject: "Floating this back up" },
        { day: 7, label: "New Angle", subject: "Different way to look at this" },
        { day: 12, label: "Last Touch", subject: "Closing the loop" },
      ],
    },
    {
      id: "followup-post-meeting",
      name: "Post-Meeting Follow-up",
      description: "Thank you + next steps after a successful meeting.",
      steps: 2,
      recommendedAudience: "Meeting attendees",
      readingTime: "20s",
      variables: ["first_name", "company_name"],
      structure: [
        { day: 0, label: "Thank You", subject: "Great conversation today, {{first_name}}" },
        { day: 2, label: "Next Steps", subject: "Here's what I promised" },
      ],
    },
    {
      id: "followup-nurture",
      name: "Nurture Sequence",
      description: "Stay top-of-mind with periodic value-sharing over time.",
      steps: 5,
      recommendedAudience: "Early-stage leads",
      readingTime: "30s",
      variables: ["first_name", "company_name", "industry"],
      structure: [
        { day: 0, label: "Value Share", subject: "Something relevant for {{company_name}}" },
        { day: 7, label: "Industry Insight", subject: "Trending in {{industry}}" },
        { day: 14, label: "Case Study", subject: "How a peer achieved results" },
        { day: 21, label: "Check-in", subject: "Still on your radar?" },
        { day: 28, label: "CTA", subject: "Time to chat?" },
      ],
    },
    {
      id: "followup-pricing",
      name: "Pricing Follow-up",
      description: "Address pricing concerns or share pricing details after interest.",
      steps: 2,
      recommendedAudience: "Price-sensitive prospects",
      readingTime: "20s",
      variables: ["first_name", "company_name"],
      structure: [
        { day: 0, label: "Pricing Share", subject: "Pricing details for {{company_name}}" },
        { day: 3, label: "ROI Frame", subject: "The ROI math" },
      ],
    },
    {
      id: "followup-reaktivate",
      name: "Reactivation Follow-up",
      description: "Re-engage a prospect who went cold after initial interest.",
      steps: 3,
      recommendedAudience: "Stalled deals",
      readingTime: "20s",
      variables: ["first_name", "company_name"],
      structure: [
        { day: 0, label: "Check-in", subject: "{{first_name}}, any updates on your end?" },
        { day: 4, label: "New Development", subject: "Something new since we last spoke" },
        { day: 8, label: "Final Nudge", subject: "Still relevant?" },
      ],
    },
    {
      id: "followup-asset-share",
      name: "Asset Sharing",
      description: "Share a relevant resource to stay helpful and keep the conversation alive.",
      steps: 2,
      recommendedAudience: "Content-engaged leads",
      readingTime: "15s",
      variables: ["first_name", "company_name", "industry"],
      structure: [
        { day: 0, label: "Share", subject: "Thought you'd find this useful" },
        { day: 5, label: "CTA", subject: "Want to discuss this?" },
      ],
    },
  ],

  // ── Sales / Breakup ────────────────────────────────────────────
  "breakup": [
    {
      id: "breakup-classic",
      name: "Classic Breakup",
      description: "The final touch — clear, respectful, creates urgency.",
      steps: 2,
      recommendedAudience: "Stalled prospects",
      readingTime: "15s",
      variables: ["first_name", "company_name"],
      structure: [
        { day: 0, label: "Closing Loop", subject: "Should I close your file, {{first_name}}?" },
        { day: 4, label: "Final", subject: "Last note from me" },
      ],
    },
    {
      id: "breakup-value-bomb",
      name: "Value Bomb Breakup",
      description: "Deliver maximum value in the final touch — leave a lasting impression.",
      steps: 1,
      recommendedAudience: "High-value prospects",
      readingTime: "25s",
      variables: ["first_name", "company_name", "industry"],
      structure: [
        { day: 0, label: "Final Value", subject: "One last resource for {{company_name}}" },
      ],
    },
    {
      id: "breakup-door-open",
      name: "Door Always Open",
      description: "Keep it warm — acknowledge timing isn't right but leave the door open.",
      steps: 1,
      recommendedAudience: "Good-fit but untimely prospects",
      readingTime: "15s",
      variables: ["first_name"],
      structure: [
        { day: 0, label: "Graceful Exit", subject: "Timing isn't everything, but it's something" },
      ],
    },
  ],

  // ── Sales / Account-Based ──────────────────────────────────────
  "account-based": [
    {
      id: "ab-multi-thread",
      name: "Multi-Thread Outreach",
      description: "Engage multiple stakeholders at the same account simultaneously.",
      steps: 4,
      recommendedAudience: "Enterprise accounts",
      readingTime: "35s",
      variables: ["first_name", "company_name", "job_title", "department"],
      structure: [
        { day: 0, label: "Persona-Specific Hook", subject: "For the {{department}} team at {{company_name}}" },
        { day: 2, label: "Cross-Department Value", subject: "How this connects to your team's goals" },
        { day: 5, label: "Executive Brief", subject: "Board-level overview" },
        { day: 8, label: "Group CTA", subject: "Let's align all stakeholders" },
      ],
    },
    {
      id: "ab-trigger-event",
      name: "Trigger Event Outreach",
      description: "Capitalize on a specific event (funding, hiring, expansion) to time your outreach.",
      steps: 3,
      recommendedAudience: "Companies showing buying signals",
      readingTime: "25s",
      variables: ["first_name", "company_name", "trigger_event", "job_title"],
      structure: [
        { day: 0, label: "Trigger Reference", subject: "Congrats on {{trigger_event}}" },
        { day: 3, label: "Relevance", subject: "How this connects to what we do" },
        { day: 7, label: "CTA", subject: "Timely conversation?" },
      ],
    },
    {
      id: "ab-custom-research",
      name: "Custom Research Outreach",
      description: "Lead with proprietary research or analysis specific to the account.",
      steps: 3,
      recommendedAudience: "Strategic accounts",
      readingTime: "30s",
      variables: ["first_name", "company_name", "industry", "job_title"],
      structure: [
        { day: 0, label: "Research Share", subject: "We analyzed {{company_name}}'s public data" },
        { day: 3, label: "Insight", subject: "3 findings worth discussing" },
        { day: 7, label: "CTA", subject: "Walk through the analysis?" },
      ],
    },
    {
      id: "ab-champion-builder",
      name: "Champion Builder",
      description: "Nurture an internal champion to advocate for your solution internally.",
      steps: 4,
      recommendedAudience: "Internal champions",
      readingTime: "30s",
      variables: ["first_name", "company_name", "job_title"],
      structure: [
        { day: 0, label: "Enable", subject: "Materials to share with your team" },
        { day: 3, label: "Data", subject: "ROI numbers for your business case" },
        { day: 7, label: "Case Study", subject: "How a peer championed this internally" },
        { day: 10, label: "CTA", subject: "Ready to present to leadership?" },
      ],
    },
  ],

  // ── Marketing / Product Launch ─────────────────────────────────
  "product-launch": [
    {
      id: "launch-teaser",
      name: "Teaser Campaign",
      description: "Build anticipation before a product launch with a multi-touch sequence.",
      steps: 4,
      recommendedAudience: "Existing leads and subscribers",
      readingTime: "30s",
      variables: ["first_name", "company_name", "product_name"],
      structure: [
        { day: 0, label: "Teaser", subject: "Something big is coming" },
        { day: 3, label: "Hint", subject: "A sneak peek for you, {{first_name}}" },
        { day: 5, label: "Reveal", subject: "Introducing {{product_name}}" },
        { day: 7, label: "CTA", subject: "Be first to try it" },
      ],
    },
    {
      id: "launch-day",
      name: "Launch Day Blast",
      description: "Announce your launch with energy and a clear call to action.",
      steps: 2,
      recommendedAudience: "Full audience",
      readingTime: "20s",
      variables: ["first_name", "product_name"],
      structure: [
        { day: 0, label: "Announcement", subject: "{{product_name}} is live!" },
        { day: 3, label: "Reminder", subject: "Don't miss out" },
      ],
    },
    {
      id: "launch-beta",
      name: "Beta Launch",
      description: "Invite selected users to a beta program with exclusivity framing.",
      steps: 3,
      recommendedAudience: "Power users and early adopters",
      readingTime: "25s",
      variables: ["first_name", "company_name", "product_name"],
      structure: [
        { day: 0, label: "Exclusive Invite", subject: "You're invited to {{product_name}} beta" },
        { day: 3, label: "What's Inside", subject: "Here's what you'll get early access to" },
        { day: 7, label: "Deadline", subject: "Beta spots filling up" },
      ],
    },
    {
      id: "launch-upgrade",
      name: "Feature Upgrade",
      description: "Announce a major feature upgrade to existing users.",
      steps: 2,
      recommendedAudience: "Existing customers",
      readingTime: "15s",
      variables: ["first_name", "feature_name"],
      structure: [
        { day: 0, label: "Upgrade Announce", subject: "{{feature_name}} just got a major upgrade" },
        { day: 3, label: "How-to", subject: "Getting started in 2 minutes" },
      ],
    },
  ],

  // ── Marketing / Newsletter ─────────────────────────────────────
  "newsletter": [
    {
      id: "newsletter-weekly",
      name: "Weekly Digest",
      description: "Curated weekly update with industry news, tips and product updates.",
      steps: 1,
      recommendedAudience: "Subscribers",
      readingTime: "25s",
      variables: ["first_name"],
      structure: [
        { day: 0, label: "Weekly Issue", subject: "Your weekly {{industry}} digest" },
      ],
    },
    {
      id: "newsletter-insights",
      name: "Monthly Insights",
      description: "Deep-dive monthly newsletter with data and analysis.",
      steps: 1,
      recommendedAudience: "Engaged subscribers",
      readingTime: "40s",
      variables: ["first_name", "industry"],
      structure: [
        { day: 0, label: "Monthly Report", subject: "{{industry}} trends — {{month}}" },
      ],
    },
    {
      id: "newsletter-curator",
      name: "Curated Roundup",
      description: "Hand-picked content curation that positions you as a thought leader.",
      steps: 1,
      recommendedAudience: "Industry professionals",
      readingTime: "20s",
      variables: ["first_name"],
      structure: [
        { day: 0, label: "Curated Content", subject: "5 things we read this week" },
      ],
    },
    {
      id: "newsletter-product",
      name: "Product Update",
      description: "Share product updates in a newsletter format.",
      steps: 1,
      recommendedAudience: "Customers",
      readingTime: "15s",
      variables: ["first_name"],
      structure: [
        { day: 0, label: "Product News", subject: "What's new this month" },
      ],
    },
    {
      id: "newsletter-thought",
      name: "Thought Leadership",
      description: "Share a unique perspective or hot take on industry trends.",
      steps: 1,
      recommendedAudience: "Industry leaders",
      readingTime: "35s",
      variables: ["first_name", "industry"],
      structure: [
        { day: 0, label: "Perspective", subject: "Why {{industry}} is about to change" },
      ],
    },
  ],

  // ── Marketing / Promotion ──────────────────────────────────────
  promotion: [
    {
      id: "promo-discount",
      name: "Discount Campaign",
      description: "Limited-time discount offer with urgency framing.",
      steps: 3,
      recommendedAudience: "Warm leads",
      readingTime: "20s",
      variables: ["first_name", "discount_amount", "expiry_date"],
      structure: [
        { day: 0, label: "Offer", subject: "{{discount_amount}} off — limited time" },
        { day: 2, label: "Urgency", subject: "Expires {{expiry_date}}" },
        { day: 4, label: "Last Chance", subject: "Final hours for {{discount_amount}} off" },
      ],
    },
    {
      id: "promo-free-trial",
      name: "Free Trial Offer",
      description: "Invite prospects to a free trial with clear value proposition.",
      steps: 3,
      recommendedAudience: "Trial-eligible prospects",
      readingTime: "20s",
      variables: ["first_name", "company_name", "trial_duration"],
      structure: [
        { day: 0, label: "Invitation", subject: "{{trial_duration}} free — on us" },
        { day: 3, label: "Social Proof", subject: "What companies like {{company_name}} achieved" },
        { day: 6, label: "Deadline", subject: "Your free trial expires soon" },
      ],
    },
    {
      id: "promo-early-bird",
      name: "Early Bird Special",
      description: "Reward early adopters with exclusive pricing or access.",
      steps: 2,
      recommendedAudience: "Early-stage prospects",
      readingTime: "15s",
      variables: ["first_name"],
      structure: [
        { day: 0, label: "Early Access", subject: "Early bird pricing — you're first in line" },
        { day: 3, label: "Countdown", subject: "Spots are limited" },
      ],
    },
    {
      id: "promo-seasonal",
      name: "Seasonal Campaign",
      description: "Tie your offer to a seasonal moment or holiday.",
      steps: 2,
      recommendedAudience: "Broad audience",
      readingTime: "15s",
      variables: ["first_name", "season"],
      structure: [
        { day: 0, label: "Seasonal Hook", subject: "Your {{season}} game plan" },
        { day: 3, label: "Offer", subject: "Special offer inside" },
      ],
    },
  ],

  // ── Marketing / Event Invitation ───────────────────────────────
  "event-invitation": [
    {
      id: "event-webinar",
      name: "Webinar Invite",
      description: "Drive registrations for a webinar with speaker highlights.",
      steps: 3,
      recommendedAudience: "Industry professionals",
      readingTime: "20s",
      variables: ["first_name", "event_name", "event_date"],
      structure: [
        { day: 0, label: "Invite", subject: "Join {{event_name}} — {{event_date}}" },
        { day: 3, label: "Speaker Spotlight", subject: "What our speakers will cover" },
        { day: 6, label: "Reminder", subject: "{{event_name}} is tomorrow" },
      ],
    },
    {
      id: "event-conference",
      name: "Conference Invite",
      description: "Invite prospects to meet at an industry conference.",
      steps: 3,
      recommendedAudience: "Conference attendees",
      readingTime: "20s",
      variables: ["first_name", "event_name", "event_date"],
      structure: [
        { day: 0, label: "Meet Up", subject: "Let's meet at {{event_name}}" },
        { day: 3, label: "What We're Showing", subject: "Stop by our booth" },
        { day: 7, label: "Final", subject: "{{event_name}} starts {{event_date}}" },
      ],
    },
    {
      id: "event-virtual",
      name: "Virtual Event",
      description: "Drive attendance for a virtual event or live demo.",
      steps: 3,
      recommendedAudience: "Remote audience",
      readingTime: "20s",
      variables: ["first_name", "event_name", "event_date"],
      structure: [
        { day: 0, label: "Invitation", subject: "Live: {{event_name}}" },
        { day: 3, label: "What to Expect", subject: "Here's the agenda" },
        { day: 5, label: "Reminder", subject: "See you there, {{first_name}}" },
      ],
    },
  ],

  // ── Marketing / Webinar ────────────────────────────────────────
  webinar: [
    {
      id: "webinar-promo",
      name: "Webinar Promotion",
      description: "Multi-touch sequence to maximize webinar registrations.",
      steps: 4,
      recommendedAudience: "Prospects and subscribers",
      readingTime: "25s",
      variables: ["first_name", "webinar_title", "webinar_date"],
      structure: [
        { day: 0, label: "Save the Date", subject: "{{webinar_title}} — {{webinar_date}}" },
        { day: 3, label: "Deep Dive", subject: "What you'll learn" },
        { day: 6, label: "Speaker Reveal", subject: "Our expert lineup" },
        { day: 8, label: "Final Push", subject: "Last chance to register" },
      ],
    },
    {
      id: "webinar-replay",
      name: "Webinar Replay",
      description: "Share replay and convert attendees into leads.",
      steps: 2,
      recommendedAudience: "Registrants (attended and no-shows)",
      readingTime: "20s",
      variables: ["first_name", "webinar_title"],
      structure: [
        { day: 0, label: "Replay Link", subject: "{{webinar_title}} replay is ready" },
        { day: 3, label: "Resource Share", subject: "Bonus materials from the webinar" },
      ],
    },
    {
      id: "webinar-invite-exec",
      name: "Executive Webinar",
      description: "High-level webinar invitation for executive audiences.",
      steps: 3,
      recommendedAudience: "C-level",
      readingTime: "15s",
      variables: ["first_name", "webinar_title", "webinar_date"],
      structure: [
        { day: 0, label: "Executive Invite", subject: "{{first_name}}, exclusive roundtable" },
        { day: 3, label: "Peers", subject: "Who else is joining" },
        { day: 5, label: "Final", subject: "{{webinar_date}} — will you be there?" },
      ],
    },
    {
      id: "webinar-post",
      name: "Post-Webinar Follow-up",
      description: "Convert webinar interest into next steps.",
      steps: 3,
      recommendedAudience: "Webinar attendees",
      readingTime: "20s",
      variables: ["first_name", "webinar_title"],
      structure: [
        { day: 0, label: "Thanks", subject: "Thanks for attending {{webinar_title}}" },
        { day: 2, label: "Key Takeaway", subject: "The #1 insight from the session" },
        { day: 5, label: "CTA", subject: "Want to implement this?" },
      ],
    },
  ],

  // ── Customer / Onboarding ──────────────────────────────────────
  onboarding: [
    {
      id: "onboard-welcome",
      name: "Welcome Sequence",
      description: "Guide new users through first steps with your product.",
      steps: 5,
      recommendedAudience: "New customers",
      readingTime: "35s",
      variables: ["first_name", "company_name", "product_name"],
      structure: [
        { day: 0, label: "Welcome", subject: "Welcome to {{product_name}}, {{first_name}}!" },
        { day: 1, label: "Quick Start", subject: "Your first 5 minutes" },
        { day: 3, label: "Feature Deep-Dive", subject: "The feature our users love most" },
        { day: 5, label: "Pro Tip", subject: "Power user tricks" },
        { day: 8, label: "Check-in", subject: "How's it going so far?" },
      ],
    },
    {
      id: "onboard-setup",
      name: "Setup Guide",
      description: "Step-by-step technical onboarding for complex products.",
      steps: 4,
      recommendedAudience: "Technical users",
      readingTime: "30s",
      variables: ["first_name", "company_name"],
      structure: [
        { day: 0, label: "Get Started", subject: "Your setup checklist" },
        { day: 2, label: "Integration", subject: "Connect your first integration" },
        { day: 4, label: "Configuration", subject: "Optimize your settings" },
        { day: 7, label: "Review", subject: "Setup review — anything blocking you?" },
      ],
    },
    {
      id: "onboard-adoption",
      name: "Adoption Drive",
      description: "Encourage feature adoption in the first 30 days.",
      steps: 4,
      recommendedAudience: "Low-engagement new users",
      readingTime: "25s",
      variables: ["first_name", "company_name"],
      structure: [
        { day: 0, label: "Feature Suggest", subject: "Try this feature, {{first_name}}" },
        { day: 4, label: "Success Story", subject: "How {{company_name}} gets the most from us" },
        { day: 8, label: "Help Offer", subject: "Need a hand getting set up?" },
        { day: 14, label: "Check-in", subject: "30-day milestone approaching" },
      ],
    },
    {
      id: "onboard-kickoff",
      name: "Customer Kickoff",
      description: "Structured onboarding for high-touch enterprise customers.",
      steps: 4,
      recommendedAudience: "Enterprise accounts",
      readingTime: "30s",
      variables: ["first_name", "company_name", "cs_manager"],
      structure: [
        { day: 0, label: "Kickoff", subject: "Let's get started, {{first_name}}" },
        { day: 2, label: "Goals", subject: "Your success milestones" },
        { day: 5, label: "Resources", subject: "Everything you need" },
        { day: 10, label: "Review", subject: "First check-in with {{cs_manager}}" },
      ],
    },
  ],

  // ── Customer / Customer Update ─────────────────────────────────
  "customer-update": [
    {
      id: "update-product",
      name: "Product Update",
      description: "Inform customers about new features and improvements.",
      steps: 1,
      recommendedAudience: "All customers",
      readingTime: "20s",
      variables: ["first_name", "company_name"],
      structure: [
        { day: 0, label: "Update", subject: "What's new this month" },
      ],
    },
    {
      id: "update-roadmap",
      name: "Roadmap Preview",
      description: "Give customers an inside look at what's coming.",
      steps: 1,
      recommendedAudience: "Key accounts",
      readingTime: "25s",
      variables: ["first_name", "company_name"],
      structure: [
        { day: 0, label: "Preview", subject: "What's next — a sneak peek" },
      ],
    },
    {
      id: "update-milestone",
      name: "Milestone Update",
      description: "Celebrate a customer milestone or achievement together.",
      steps: 1,
      recommendedAudience: "Active customers",
      readingTime: "15s",
      variables: ["first_name", "company_name", "milestone"],
      structure: [
        { day: 0, label: "Celebration", subject: "Congrats on {{milestone}}!" },
      ],
    },
  ],

  // ── Customer / Renewal ─────────────────────────────────────────
  renewal: [
    {
      id: "renewal-advance",
      name: "Early Renewal",
      description: "Start the renewal conversation 60 days before expiry.",
      steps: 3,
      recommendedAudience: "Customers with upcoming renewal",
      readingTime: "20s",
      variables: ["first_name", "company_name", "renewal_date"],
      structure: [
        { day: 0, label: "Heads Up", subject: "Your renewal is coming up, {{first_name}}" },
        { day: 5, label: "Value Recap", subject: "What you've accomplished this year" },
        { day: 10, label: "CTA", subject: "Let's lock in your renewal" },
      ],
    },
    {
      id: "renewal-urgent",
      name: "Expiring Soon",
      description: "Urgent renewal reminder for customers approaching expiry.",
      steps: 2,
      recommendedAudience: "Customers near expiry",
      readingTime: "15s",
      variables: ["first_name", "company_name", "renewal_date"],
      structure: [
        { day: 0, label: "Expiry Alert", subject: "Your subscription expires {{renewal_date}}" },
        { day: 3, label: "Last Chance", subject: "Don't lose access" },
      ],
    },
    {
      id: "renewal-upsell",
      name: "Renewal + Upsell",
      description: "Combine renewal with an upgrade opportunity.",
      steps: 3,
      recommendedAudience: "Power users ready for upgrade",
      readingTime: "25s",
      variables: ["first_name", "company_name", "plan_name"],
      structure: [
        { day: 0, label: "Renewal + Suggest", subject: "Time to renew — and level up" },
        { day: 4, label: "Upgrade Benefits", subject: "What {{plan_name}} unlocks" },
        { day: 8, label: "CTA", subject: "Ready to upgrade?" },
      ],
    },
  ],

  // ── Customer / Re-engagement ───────────────────────────────────
  "re-engagement": [
    {
      id: "reengage-we-miss",
      name: "We Miss You",
      description: "Win back inactive users with a personal touch.",
      steps: 3,
      recommendedAudience: "Dormant users",
      readingTime: "20s",
      variables: ["first_name", "company_name"],
      structure: [
        { day: 0, label: "Check-in", subject: "{{first_name}}, we noticed you've been quiet" },
        { day: 3, label: "What's New", subject: "A lot has changed since you left" },
        { day: 7, label: "Incentive", subject: "Come back with a special offer" },
      ],
    },
    {
      id: "reengage-win-back",
      name: "Win-back Campaign",
      description: "Re-engage churned customers with a compelling return offer.",
      steps: 4,
      recommendedAudience: "Churned customers",
      readingTime: "25s",
      variables: ["first_name", "company_name"],
      structure: [
        { day: 0, label: "Acknowledgment", subject: "We miss having {{company_name}}" },
        { day: 3, label: "Improvements", subject: "What we've improved since you left" },
        { day: 7, label: "Offer", subject: "A special return offer" },
        { day: 10, label: "Final", subject: "One last thought" },
      ],
    },
    {
      id: "reengage-feature",
      name: "Feature Re-introduction",
      description: "Re-engage users by showcasing new features they haven't tried.",
      steps: 3,
      recommendedAudience: "Under-utilizing users",
      readingTime: "20s",
      variables: ["first_name", "company_name", "feature_name"],
      structure: [
        { day: 0, label: "New Feature", subject: "{{feature_name}} — you haven't tried this yet" },
        { day: 3, label: "How-to", subject: "2-minute setup guide" },
        { day: 7, label: "CTA", subject: "Give it a try?" },
      ],
    },
    {
      id: "reengage-survey",
      name: "Feedback Survey",
      description: "Understand why users left with a short, respectful survey.",
      steps: 2,
      recommendedAudience: "Churned users",
      readingTime: "15s",
      variables: ["first_name"],
      structure: [
        { day: 0, label: "Ask", subject: "{{first_name}}, can we ask why?" },
        { day: 4, label: "Reminder", subject: "Takes 30 seconds — helps us improve" },
      ],
    },
  ],

  // ── Customer / Feedback Request ────────────────────────────────
  "feedback-request": [
    {
      id: "feedback-nps",
      name: "NPS Survey",
      description: "Standard Net Promoter Score survey with follow-up.",
      steps: 2,
      recommendedAudience: "Established customers",
      readingTime: "15s",
      variables: ["first_name", "company_name"],
      structure: [
        { day: 0, label: "Survey", subject: "How likely are you to recommend us?" },
        { day: 5, label: "Follow-up", subject: "Thanks for your feedback" },
      ],
    },
    {
      id: "feedback-product",
      name: "Product Feedback",
      description: "Collect specific product feedback for roadmap planning.",
      steps: 2,
      recommendedAudience: "Active users",
      readingTime: "20s",
      variables: ["first_name", "company_name"],
      structure: [
        { day: 0, label: "Ask", subject: "Quick question about your experience" },
        { day: 4, label: "Thank You", subject: "Your feedback matters" },
      ],
    },
    {
      id: "feedback-casestudy",
      name: "Case Study Request",
      description: "Turn happy customers into case studies.",
      steps: 2,
      recommendedAudience: "Satisfied customers",
      readingTime: "15s",
      variables: ["first_name", "company_name", "results"],
      structure: [
        { day: 0, label: "Request", subject: "Share your {{results}} story?" },
        { day: 5, label: "What's Involved", subject: "Just a 15-minute interview" },
      ],
    },
  ],

  // ── Recruiting / Candidate Outreach ────────────────────────────
  "candidate-outreach": [
    {
      id: "recruit-passive",
      name: "Passive Candidate",
      description: "Engage passive candidates who aren't actively looking.",
      steps: 3,
      recommendedAudience: "Passive candidates",
      readingTime: "25s",
      variables: ["first_name", "company_name", "role_title"],
      structure: [
        { day: 0, label: "Intrigue", subject: "{{first_name}}, a {{role_title}} role worth exploring" },
        { day: 3, label: "Why Us", subject: "What makes {{company_name}} different" },
        { day: 7, label: "CTA", subject: "Confidential chat?" },
      ],
    },
    {
      id: "recruit-referral",
      name: "Referral Outreach",
      description: "Leverage employee referrals to reach candidates.",
      steps: 2,
      recommendedAudience: "Referred candidates",
      readingTime: "20s",
      variables: ["first_name", "referral_name", "role_title"],
      structure: [
        { day: 0, label: "Referral Mention", subject: "{{referral_name}} thought you'd be perfect" },
        { day: 4, label: "Role Detail", subject: "The {{role_title}} role in detail" },
      ],
    },
    {
      id: "recruit-tech",
      name: "Technical Talent",
      description: "Speak the language of engineers — tech stack, challenges, impact.",
      steps: 3,
      recommendedAudience: "Engineers and technical talent",
      readingTime: "25s",
      variables: ["first_name", "company_name", "tech_stack"],
      structure: [
        { day: 0, label: "Tech Hook", subject: "Building with {{tech_stack}} at {{company_name}}" },
        { day: 3, label: "Challenge", subject: "The problems you'd solve" },
        { day: 7, label: "CTA", subject: "Worth 20 minutes?" },
      ],
    },
    {
      id: "recruit-diversity",
      name: "Diversity Outreach",
      description: "Inclusive messaging focused on culture, growth and belonging.",
      steps: 3,
      recommendedAudience: "Diverse candidates",
      readingTime: "25s",
      variables: ["first_name", "company_name", "role_title"],
      structure: [
        { day: 0, label: "Culture", subject: "Building something meaningful at {{company_name}}" },
        { day: 3, label: "Growth", subject: "Your growth story here" },
        { day: 7, label: "CTA", subject: "Let's talk about {{role_title}}" },
      ],
    },
  ],

  // ── Recruiting / Interview Invitation ──────────────────────────
  "interview-invitation": [
    {
      id: "interview-initial",
      name: "Initial Screen",
      description: "Invite a candidate for a first-round screening call.",
      steps: 2,
      recommendedAudience: "Qualified candidates",
      readingTime: "15s",
      variables: ["first_name", "role_title"],
      structure: [
        { day: 0, label: "Invite", subject: "Let's chat about {{role_title}}, {{first_name}}" },
        { day: 3, label: "Details", subject: "What to expect in our first call" },
      ],
    },
    {
      id: "interview-technical",
      name: "Technical Interview",
      description: "Invite for a technical assessment or pair-programming session.",
      steps: 2,
      recommendedAudience: "Engineering candidates",
      readingTime: "20s",
      variables: ["first_name", "role_title"],
      structure: [
        { day: 0, label: "Technical Round", subject: "Next step: technical conversation" },
        { day: 2, label: "Prep Guide", subject: "How to prepare" },
      ],
    },
    {
      id: "interview-final",
      name: "Final Round",
      description: "Invite to the final interview round with leadership.",
      steps: 2,
      recommendedAudience: "Final-round candidates",
      readingTime: "15s",
      variables: ["first_name", "role_title", "interviewer_name"],
      structure: [
        { day: 0, label: "Final Round", subject: "Last step — meeting {{interviewer_name}}" },
        { day: 2, label: "What to Expect", subject: "The format and topics" },
      ],
    },
  ],

  // ── Recruiting / Follow-up ─────────────────────────────────────
  "recruiting-follow-up": [
    {
      id: "recruit-followup-thanks",
      name: "Post-Interview Thanks",
      description: "Thank a candidate after an interview and outline next steps.",
      steps: 1,
      recommendedAudience: "Interviewed candidates",
      readingTime: "15s",
      variables: ["first_name", "role_title"],
      structure: [
        { day: 0, label: "Thanks", subject: "Thanks for interviewing for {{role_title}}" },
      ],
    },
    {
      id: "recruit-followup-status",
      name: "Status Update",
      description: "Keep candidates informed about their application status.",
      steps: 1,
      recommendedAudience: "In-process candidates",
      readingTime: "15s",
      variables: ["first_name", "role_title"],
      structure: [
        { day: 0, label: "Update", subject: "Update on your {{role_title}} application" },
      ],
    },
    {
      id: "recruit-followup-re-eng",
      name: "Re-engagement",
      description: "Re-engage a candidate who went quiet after initial contact.",
      steps: 2,
      recommendedAudience: "Unresponsive candidates",
      readingTime: "15s",
      variables: ["first_name", "role_title"],
      structure: [
        { day: 0, label: "Check-in", subject: "{{first_name}}, still interested in {{role_title}}?" },
        { day: 5, label: "Final", subject: "Last chance to connect" },
      ],
    },
  ],

  // ── Recruiting / Employer Branding ─────────────────────────────
  "employer-branding": [
    {
      id: "brand-culture",
      name: "Culture Showcase",
      description: "Highlight company culture and values to attract talent.",
      steps: 2,
      recommendedAudience: "Passive candidates",
      readingTime: "20s",
      variables: ["first_name", "company_name"],
      structure: [
        { day: 0, label: "Culture", subject: "What it's like to work at {{company_name}}" },
        { day: 4, label: "Team Stories", subject: "Hear from the team" },
      ],
    },
    {
      id: "brand-employee-story",
      name: "Employee Story",
      description: "Share employee success stories to build employer brand.",
      steps: 2,
      recommendedAudience: "Potential candidates",
      readingTime: "20s",
      variables: ["first_name", "company_name", "employee_name"],
      structure: [
        { day: 0, label: "Story", subject: "{{employee_name}}'s journey at {{company_name}}" },
        { day: 4, label: "Join Us", subject: "Write your own story" },
      ],
    },
    {
      id: "brand-benefits",
      name: "Benefits Highlight",
      description: "Showcase unique benefits and perks to attract candidates.",
      steps: 2,
      recommendedAudience: "Job seekers",
      readingTime: "15s",
      variables: ["first_name", "company_name"],
      structure: [
        { day: 0, label: "Benefits", subject: "Perks you won't find elsewhere" },
        { day: 4, label: "Open Roles", subject: "Roles where you'd thrive" },
      ],
    },
  ],
};

/**
 * Returns all variables a campaign might use, organized by category.
 */
export const VARIABLE_CATEGORIES = [
  {
    label: "Contact",
    variables: [
      { key: "first_name", label: "First Name" },
      { key: "last_name", label: "Last Name" },
      { key: "email", label: "Email" },
      { key: "job_title", label: "Job Title" },
      { key: "phone", label: "Phone" },
    ],
  },
  {
    label: "Company",
    variables: [
      { key: "company_name", label: "Company Name" },
      { key: "industry", label: "Industry" },
      { key: "company_size", label: "Company Size" },
      { key: "website", label: "Website" },
      { key: "location", label: "Location" },
      { key: "department", label: "Department" },
    ],
  },
  {
    label: "Sender",
    variables: [
      { key: "sender_name", label: "Sender Name" },
      { key: "sender_role", label: "Sender Role" },
      { key: "sender_company", label: "Sender Company" },
    ],
  },
  {
    label: "Campaign",
    variables: [
      { key: "campaign_name", label: "Campaign Name" },
      { key: "meeting_link", label: "Meeting Link" },
      { key: "unsubscribe_link", label: "Unsubscribe Link" },
    ],
  },
  {
    label: "Context",
    variables: [
      { key: "pain_point", label: "Pain Point" },
      { key: "similar_company", label: "Similar Company" },
      { key: "recent_news", label: "Recent News" },
      { key: "trigger_event", label: "Trigger Event" },
      { key: "referral_name", label: "Referral Name" },
    ],
  },
];

/**
 * Placeholder recipients for the preview system.
 */
export const SAMPLE_RECIPIENTS = [
  {
    first_name: "Sarah",
    last_name: "Chen",
    email: "sarah.chen@acmetech.com",
    job_title: "VP Sales",
    company_name: "Acme Technologies",
    industry: "SaaS",
    company_size: "200-500",
    website: "acmetech.com",
    location: "San Francisco, CA",
    department: "Sales",
    phone: "+1 (415) 555-0123",
  },
  {
    first_name: "James",
    last_name: "Wilson",
    email: "j.wilson@globalbank.co.uk",
    job_title: "CTO",
    company_name: "Global Banking Corp",
    industry: "Financial Services",
    company_size: "5000+",
    website: "globalbank.co.uk",
    location: "London, UK",
    department: "Technology",
    phone: "+44 20 7946 0958",
  },
  {
    first_name: "Priya",
    last_name: "Sharma",
    email: "priya@medtech.in",
    job_title: "Head of Operations",
    company_name: "MedTech Solutions",
    industry: "Healthcare",
    company_size: "100-200",
    website: "medtech.in",
    location: "Mumbai, India",
    department: "Operations",
    phone: "+91 22 6789 1234",
  },
];

/**
 * AI objectives for the AI + Template workflow.
 */
export const AI_OBJECTIVES = [
  { value: "book_meetings", label: "Book meetings", icon: "Calendar" },
  { value: "generate_replies", label: "Generate replies", icon: "MessageSquare" },
  { value: "introduce_product", label: "Introduce product", icon: "Package" },
  { value: "nurture_leads", label: "Nurture leads", icon: "Sprout" },
  { value: "follow_up", label: "Follow up", icon: "RotateCw" },
  { value: "reactivate", label: "Reactivate prospects", icon: "RefreshCw" },
];

/**
 * AI tones for generation.
 */
export const AI_TONES = [
  { value: "professional", label: "Professional" },
  { value: "consultative", label: "Consultative" },
  { value: "technical", label: "Technical" },
  { value: "executive", label: "Executive" },
  { value: "friendly", label: "Friendly" },
  { value: "urgent", label: "Urgent" },
];
