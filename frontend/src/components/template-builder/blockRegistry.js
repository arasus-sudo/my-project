/* Block registry for the email template maker — docs/design-system.md §3.3
 * icon rules apply (closed icon list, explicit size, inherit color). */

import { Mail, PenSquare, Type, Percent, Link, IdCard } from "../../icons";

export const BLOCK_REGISTRY = {
  greeting: { label: "Greeting", icon: Mail, defaultData: () => ({ value: "Hey {{first_name}}," }) },
  opening: { label: "Opening line", icon: PenSquare, defaultData: () => ({ value: "Quick one for {{company}}." }) },
  body: { label: "Body paragraph", icon: Type, defaultData: () => ({ value: "" }) },
  proof: { label: "Proof / stat", icon: Percent, defaultData: () => ({ highlight: "43%", value: "of finance teams still run AP on spreadsheets." }) },
  cta: { label: "CTA", icon: Link, defaultData: () => ({ type: "button", label: "Book a 15-min call", href: "{{calendly_link}}" }) },
  signature: { label: "Signature", icon: IdCard, defaultData: () => ({ signature_id: "default" }) },
  divider: { label: "Divider", icon: null, defaultData: () => ({}) },
};

export const BLOCK_TYPES = Object.keys(BLOCK_REGISTRY);

export function newBlock(type) {
  return { id: `blk_${Math.random().toString(36).slice(2, 10)}`, type, data: BLOCK_REGISTRY[type].defaultData() };
}

export const STEP_POSITIONS = [
  { value: "intro", label: "Intro" },
  { value: "followup_1", label: "Follow-up 1" },
  { value: "followup_2", label: "Follow-up 2" },
  { value: "reframe", label: "Reframe" },
  { value: "breakup", label: "Breakup" },
];
export const STEP_LABEL = Object.fromEntries(STEP_POSITIONS.map((s) => [s.value, s.label]));
export const STEP_CAMPAIGN_HINT = {
  intro: "Lands on day 0 of a campaign, sent immediately.",
  followup_1: "Day 3 — fires on if_no_reply.",
  followup_2: "Day 6 — fires on if_no_reply.",
  reframe: "Day 9 — fires on if_no_reply.",
  breakup: "Day 12 — fires on if_no_reply.",
};

export const TONE_PRESETS = [
  { value: "founder_direct", label: "Direct founder-to-founder", guidance: "Short sentences, plain words, one clear question. No adjectives that would embarrass you in print." },
  { value: "consultative", label: "Consultative", guidance: "Lead with their business problem, offer a point of view, propose a conversation. No hard sell." },
  { value: "warm_intro", label: "Warm intro", guidance: "Reference shared context up front, keep it personal, end with a soft ask." },
  { value: "none", label: "No preset", guidance: "No phrasing guardrails — team members write in their own voice." },
];
export const TONE_LABEL = Object.fromEntries(TONE_PRESETS.map((t) => [t.value, t.label]));

export const SAMPLE_MERGE_FIELDS = [
  "{{first_name}}", "{{last_name}}", "{{company}}", "{{role}}", "{{title}}",
  "{{industry_pain_point}}", "{{sender_name}}", "{{calendly_link}}",
  "{{personalized_opener}}",
];
