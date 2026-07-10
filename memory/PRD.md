# Innoira Agentic Suite — PitchEQ + Create EQ

## Problem Statement
Build a complete multi-tenant B2B SaaS per the BRD: two AI agents under one roof.
- **PitchEQ** — Autonomous Cold Email SDR (lead sourcing → generative personalisation → EQ Score → autonomous triage → CRM writeback).
- **Create EQ** — Canva-tier Generative Carousel & Visual Media Agent (brief → narrative → editable deck with brand kit sync).

## Architecture
- FastAPI backend, MongoDB (motor), JWT auth, single `server.py`
- React 19 SPA with react-router-dom v7, shadcn/ui, recharts, sonner, jsPDF
- LLM: `emergentintegrations` with Universal Emergent LLM Key (OpenAI gpt-5.4 for text; Nano Banana `gemini-3.1-flash-image-preview` + `gpt-image-1` for images)
- Editorial Tech design system: Archivo Black + Instrument Serif + JetBrains Mono, Sanguine Red accent

## Implemented (2026-02 → 2026-07)
- PitchEQ MVP: Auth (JWT), Dashboard, Campaigns, Mailboxes, Unified Inbox, CRM Kanban, Leads, Settings
- Innoira Agentic Suite rebrand & unified UI/UX
- OpenAI GPT-5.4 integration for email personalization + EQ scoring
- AI Onboarding Wizard (multi-page site crawl → auto-generated campaigns)
- Enterprise: Templates, Team Invites, Analytics, Audit Log, Quotas, Impersonation, Admin dashboard
- Prospeo + Icypeas ICP-driven lead sourcing framework (MOCKED — keys pending from user)
- Create EQ: Projects page + Canva-tier AI Editor (LLM narratives, palettes, templates, brand kits, undo/redo, PNG/PDF export, text effects, AI copy assist)
- **NEW (2026-07):** AI Image Generation in Create EQ — both Gemini Nano Banana and GPT Image 1 selectable per generation. Portrait/Square/Story aspect ratios. Add-as-element or Set-as-background actions.
- **NEW (2026-07):** Security hardening — removed XSS surface in Create EQ PDF export (`innerHTML` → direct SVG foreignObject with escaped `src` and CSS-safe attributes); refactored BrandKit color state to stable IDs; fixed FastAPI `/carousel/platforms` route order.

## Deferred (P1/P2)
- Real Prospeo + Icypeas API integration (needs user-provided API keys)
- Real email sending via Gmail/M365 OAuth or SMTP
- Panoramic backgrounds spanning multiple slides (Create EQ)
- Infinite canvas workspace (Create EQ)
- Webhook triggers (Airtable / Notion) for automated carousel generation
- External CRM sync (HubSpot, Zoho, Salesforce)
- GDPR right-to-erasure workflow, audit log UI polish

## Next Tasks
1. Wire real Prospeo + Icypeas keys when user provides them
2. Panoramic backgrounds + infinite canvas for Create EQ
3. Webhook / Airtable trigger for automated Carousel jobs
4. HubSpot OAuth connector for two-way CRM sync

## Test credentials
`demo@innoira.ai` / `Demo@1234` (seeded workspace: Innoira Demo, 8 leads, 1 launched campaign, 2 inbox replies, 1 deal, 8 Create EQ carousels).
