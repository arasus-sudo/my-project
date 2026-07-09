# Pitch EQ - AI Cold Email SaaS

## Problem Statement
Build a complete SaaS product per the PitchEQ BRD v1.0: AI-powered cold email agent with EQ (Emotional Intelligence) Score, multi-tenant workspaces, deliverability guardrails, unified inbox, and built-in CRM.

## Architecture
- FastAPI backend, MongoDB (motor), JWT auth, single `server.py` (~600 LoC)
- React 19 SPA with react-router-dom v7, shadcn/ui, recharts, sonner toasts
- Editorial Tech design system: Cabinet Grotesk + IBM Plex Sans + JetBrains Mono, Sanguine Red (#D94526) accent, bone background

## Implemented (2026-02)
- Marketing landing page (hero with EQ meter, features grid, pricing, footer)
- JWT auth: signup (creates workspace + auto-seeds demo data), login, `/auth/me`
- Multi-tenancy: all data scoped to `workspace_id`
- Leads: create, list, delete, bulk CSV import, dedup, suppression list, search
- Mailboxes: connect (mock OAuth), DNS auth check (SPF/DKIM/DMARC/tracking), warmup toggle, caps
- Campaigns: CRUD, multi-step sequencer, per-step delay, launch/pause, deterministic simulated sending
- AI Personalization: `POST /ai/personalize` (heuristic merge-field replacement), `POST /ai/score` (5-factor EQ engine with hints)
- Unified Inbox: 3-pane layout, filter by classification (interested/OOO/referral/etc), thread view, reply
- CRM Kanban: 6 stages (new → won/lost), drag-and-drop, auto-deal creation on "interested" replies
- Dashboard: 5 KPI cards, 7-day trend line chart, outbound funnel, workspace counts
- Settings page (workspace, user, brand voice placeholder)

## Deferred (P1/P2)
- Real LLM integration (GPT-5.2/Claude/Gemini) → wire into `/ai/personalize` and `/ai/score`
- Real email sending via Gmail/M365 OAuth or SMTP
- Real enrichment / email verification providers
- External CRM sync (HubSpot, Zoho, Salesforce)
- Team invites & role-based permissions
- A/B testing UI (data model exists)
- Team leaderboard, scheduled reports, CSV export
- GDPR right-to-erasure workflow, audit log UI

## Next Tasks
1. Plug Emergent LLM key into `/ai/personalize` for real AI personalization
2. Add team invites (Org Admin can invite users)
3. HubSpot OAuth connector for two-way sync
