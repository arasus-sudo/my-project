# Innoira Agentic Suite — PitchEQ + Create EQ

## Problem Statement
Multi-tenant B2B SaaS per BRD: two AI agents under one roof.
- **PitchEQ** — Autonomous Cold Email SDR (lead sourcing → generative personalisation → EQ Score → autonomous triage → CRM writeback).
- **Create EQ** — Canva-tier Generative Carousel & Visual Media Agent (brief → narrative → editable deck with brand kit sync).

## Architecture
- FastAPI backend, MongoDB (motor), JWT auth, single `server.py`
- React 19 SPA, react-router v7, shadcn/ui, recharts, sonner, jsPDF + **html2canvas** (added 2026-07 for reliable slide rasterisation)
- LLM: `emergentintegrations` with Universal Emergent LLM Key (OpenAI gpt-5.4 text; Nano Banana + GPT Image 1 for image gen)
- Editorial Tech design system: Archivo Black + Instrument Serif + JetBrains Mono, Sanguine Red accent

## Implemented (2026-02 → 2026-07)
- PitchEQ MVP: Auth, Dashboard, Campaigns, Mailboxes, Unified Inbox, CRM Kanban, Leads, Settings
- OpenAI GPT-5.4 for email personalization + EQ scoring
- AI Onboarding Wizard (multi-page website crawl → auto-generated campaigns)
- Enterprise: Templates, Team Invites, Analytics, Audit Log, Quotas, Impersonation, Admin dashboard
- Prospeo + Icypeas ICP-driven lead sourcing framework (**MOCKED — keys pending**)
- Create EQ: Projects page + Canva-tier AI Editor (LLM narratives, palettes, templates, brand kits, undo/redo, PNG/PDF export, text effects)
- AI Image Generation in Create EQ (Gemini Nano Banana + GPT Image 1, provider-selectable per generation)
- Security hardening: removed XSS surface in editor renders; stable IDs for brand-kit colour keys
- **NEW (2026-07):** **Panoramic backgrounds** — one wide image auto-slices across all slides (or manual per-slide viewport)
- **NEW (2026-07):** **Board view / Focus view toggle** — see the whole deck at a glance or zoom into one slide
- **NEW (2026-07):** **Real image upload** — file picker + drag-drop of local files into the canvas
- **NEW (2026-07):** **Gamma-style intake wizard** — 4-step guided flow: topic → audience → platform+theme → review → generate
- **NEW (2026-07):** **PDF slide-selection dialog** — checkbox picker to include any subset of slides in a single PDF
- **NEW (2026-07):** **html2canvas-based export** — reliable PDF/PNG raster on complex slides with gradients/web fonts
- **NEW (2026-07):** **Webhooks page** — trigger Create EQ carousels from Airtable, Notion, or generic HTTP POST. Public `/api/hooks/carousel/{token}` endpoint, per-webhook field mapping, event log.
- **NEW (2026-07):** **HubSpot two-way sync page (MOCKED)** — connect, push leads, pull contacts, sync deals. Awaiting user Client ID + Secret for live OAuth.
- **NEW (2026-07):** **Manual-mode panorama controls** — RightPanel exposes per-slide horizontal / vertical / zoom sliders + Reset + Apply-to-all when panorama is in manual mode. Canvas also supports direct pointer-drag pan + scroll-wheel zoom.
- **NEW (2026-07):** **CreateEQEditor split** — main editor shrunk from 1647 → 623 LOC by extracting `/components/creq/{utils, ElementRender, PanoramaLayer, BoardView, LeftPanel, RightPanel, drawers/*}`.

## Deferred (P1/P2)
- Real Prospeo + Icypeas API integration (user API keys pending)
- Real HubSpot OAuth (Client ID + Secret pending)
- Real email sending via Gmail/M365 OAuth or SMTP

## Modular architecture (2026-07)
CreateEQEditor.jsx split from 1647 → 623 LOC:
```
/app/frontend/src/pages/CreateEQEditor.jsx           (main shell, state, canvas, toolbar)
/app/frontend/src/components/creq/
├── utils.js                                          (newId, renderBackground, stripLocalKeys)
├── ElementRender.jsx                                 (ICONS + <ElementRender>)
├── PanoramaLayer.jsx                                 (panoramaSliceStyle + <PanoramaLayer>)
├── BoardView.jsx                                     (multi-slide board)
├── LeftPanel.jsx                                     (templates, text presets, elements, image)
├── RightPanel.jsx                                    (inspector + PanoramaManualControls)
└── drawers/
    ├── BrandKitDrawer.jsx
    ├── AiImageDrawer.jsx
    ├── PanoramaDrawer.jsx
    └── PdfExportDialog.jsx
```

## Test credentials
`demo@innoira.ai` / `Demo@1234` (seeded workspace: Innoira Demo, 8 leads, 1 launched campaign, 2 inbox replies, 1 deal, seeded Create EQ carousels).

## Next Tasks
1. Provide Prospeo, Icypeas, and HubSpot credentials to switch integrations from MOCKED → live
2. Split CreateEQEditor into: `useCarousel` hook + Toolbar/LeftPanel/RightPanel/BoardView/Drawers as separate files
3. Manual-mode panorama drag handles (currently viewport values are stored but no UI to tune them per slide)
4. Refactor: gmail/m365 email send provider abstraction so real outbound sends are one adapter away
