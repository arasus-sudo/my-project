/* Starter templates for the email template maker — clone-and-edit presets. */

import { newBlock } from "./blockRegistry";

const B = (type, data) => ({ id: `blk_${type}_${Math.random().toString(36).slice(2, 8)}`, type, data });

export const TEMPLATE_PRESETS = [
  {
    id: "founder_intro",
    name: "Founder intro",
    subject: "Quick idea for {{company}}",
    tone: "founder_direct",
    step_position: "intro",
    blocks: () => [
      newBlock("greeting"),
      B("opening", { value: "I'm {{sender_name}} — I run a small team that automates AP for companies like {{company}}." }),
      B("body", { value: "{{industry_pain_point}}. We take that off your plate in about three weeks, and you don't pay until it's live." }),
      B("proof", { highlight: "3 weeks", value: "median time from kickoff to first invoice automated." }),
      B("cta", { type: "button", label: "Worth a 15-min look?", href: "{{calendly_link}}" }),
      newBlock("divider"),
      newBlock("signature"),
    ],
  },
  {
    id: "consultative_intro",
    name: "Consultative intro",
    subject: "A thought on {{company}}'s AP workflow",
    tone: "consultative",
    step_position: "intro",
    blocks: () => [
      newBlock("greeting"),
      B("opening", { value: "Most finance teams we talk to are fine on headcount — it's the workflow that's slow." }),
      B("body", { value: "{{industry_pain_point}}. A quick look at your current process usually surfaces 5–10 hours a week of recoverable time. Happy to share what we find either way." }),
      B("cta", { type: "link", label: "Open to a quick conversation?", href: "{{calendly_link}}" }),
      newBlock("divider"),
      newBlock("signature"),
    ],
  },
  {
    id: "warm_followup",
    name: "Warm follow-up",
    subject: "Re: Quick idea for {{company}}",
    tone: "warm_intro",
    step_position: "followup_1",
    blocks: () => [
      newBlock("greeting"),
      B("opening", { value: "Wanted to make sure my note on {{industry_pain_point}} didn't get buried — I know {{company}} is busy." }),
      B("body", { value: "If it's not a priority right now, that's fine. If it is, I can send a one-pager before we talk so you can decide if it's worth 15 minutes." }),
      B("cta", { type: "link", label: "Worth it? Just say the word", href: "{{calendly_link}}" }),
      newBlock("divider"),
      newBlock("signature"),
    ],
  },
  {
    id: "breakup",
    name: "Breakup (close the loop)",
    subject: "Closing the loop with {{company}}",
    tone: "consultative",
    step_position: "breakup",
    blocks: () => [
      newBlock("greeting"),
      B("body", { value: "I'll take the hint — you've got enough on your plate. If {{industry_pain_point}} ever becomes a priority, we're one reply away." }),
      B("cta", { type: "link", label: "You can reach me here anytime", href: "mailto:hello@innoira.dev" }),
      newBlock("divider"),
      newBlock("signature"),
    ],
  },
];

export function blankTemplateBlocks() {
  return [newBlock("greeting"), newBlock("body"), newBlock("cta"), newBlock("divider"), newBlock("signature")];
}
