# Frontend Architecture — Innoira Agentic Suite

**Status**: Active, binding reference  
**Stack**: React 19 (CRA + Craco), React Router v7, Tailwind CSS 3.4, Lucide icons  
**Design System**: docs/design-system.md (v1.0, binding)

---

## 1. High-Level Structure

```
frontend/
├── public/
│   ├── index.html
│   └── staticwebapp.config.json
├── src/
│   ├── App.js                 # Route definitions, lazy loading, auth wrapper
│   ├── App.css                # Global styles (minimal, tokens-driven)
│   ├── index.js               # Entry point
│   ├── lib/
│   │   ├── api.js             # Axios instance + interceptors (auth, credits, 402)
│   │   └── auth.jsx           # AuthContext (token/user/workspace in localStorage)
│   ├── components/
│   │   ├── AppLayout.jsx      # Shell: sidebar, agent switcher, header, outlet
│   │   ├── InnoiraLogo.jsx    # Logo component
│   │   ├── Credits.jsx        # Credit pill + OutOfCreditsWatcher
│   │   ├── ErrorBoundary.jsx  # React error boundary
│   │   ├── CommandPalette.jsx # ⌘K global search
│   │   ├── NotificationsCenter.jsx
│   │   ├── icons/             # Curated Lucide re-exports (CLOSED list)
│   │   ├── primitives/        # Button, Input, Checkbox, Select, Toggle, SegmentedControl, Checkbox, CardDivider, TableFooter, IconSquare, StatusPill, EmptyState, Modal, ModalContent
│   │   ├── composites/        # Card, MetricCard, Table, TableFooter, EmptyState, EmptyState, Modal, ModalContent
│   │   ├── ui/                # loading-states (SkeletonKpiGrid, SkeletonListRows)
│   │   └── charts/            # LineChart, BarChart, DonutChart, Sparkline
│   ├── pages/                 # 80+ route-level pages (lazy-loaded)
│   ├── styles/
│   │   └── tokens.css         # Design tokens (light + dark via [data-theme="dark"])
│   └── constants/testIds/     # Test ID constants
├── tailwind.config.js         # Tailwind config mapping tokens
├── postcss.config.js
├── package.json
└── README.md
```

---

## 2. Routing & Code Splitting

- **All 80+ pages are lazy-loaded** via `React.lazy()` — each page is its own chunk
- **Route groups**:
  - Public: `/`, `/login`, `/signup`, `/oauth/consent`, `/book/:workspaceId/:eventTypeSlug`, `/book/manage/:token`
  - Authenticated: `/app/*` wrapped in `<Private>` (requires user)
  - Suite Home: `/suite` (command center)
  - Onboarding: `/onboarding`
- **Agent-based routing**: Each EQ agent has its own route prefix (`/app/voice-eq`, `/app/social-eq`, etc.)
- **Suspense boundaries**: Top-level for route chunks, per-page for content loading

---

## 3. Agent Architecture (AppLayout)

**17 agents defined** in `AppLayout.jsx:147-183`:

| Key | Label | Tag | Category | Root Route |
|-----|-------|-----|----------|------------|
| pitch | Pitch EQ | Outbound | sales | `/app` |
| crm | CRM | CRM | sales | `/app/crm` |
| voice | Voice EQ | Calling | sales | `/app/voice-eq` |
| schedule | Schedule EQ | Booking | sales | `/app/schedule-eq` |
| proposal | Proposal EQ | Proposals | sales | `/app/proposal-eq` |
| sms | SMS EQ | Texting | sales | `/app/sms-eq` |
| whatsapp | WhatsApp EQ | WhatsApp | sales | `/app/whatsapp-eq` |
| create | Create EQ | Carousel | marketing | `/app/create-eq` |
| design | Design EQ | Design | marketing | `/app/design-eq` |
| social | Social EQ | Social | marketing | `/app/social-eq` |
| site | Site EQ | Website Chat | marketing | `/app/site-eq` |
| hrms | HRMS EQ | HR | operations | `/app/hrms-eq` |
| accounting | Accounting EQ | Finance | operations | `/app/accounting-eq` |
| projects | Projects | Work | operations | `/app/projects` |
| command | Command EQ | OS | operations | `/app/command` |

**Agent switcher**: Dropdown in sidebar header (AppLayout:239-297) — shows badge, label, tag, category

**Sidebar nav**: Per-agent nav arrays (PITCH_NAV, CRM_NAV, VOICE_NAV, etc.) — filtered by `orgAdminOnly` flag

---

## 4. Design System Implementation

### Tokens (tokens.css + tailwind.config.js)
- **CSS variables** for all colors, spacing, radius, shadows, typography, motion
- **Light + dark themes** via `[data-theme="dark"]` attribute swap — no JS branching
- **Semantic token names only** in components (e.g., `var(--bg-surface)`, `var(--color-primary)`)

### Typography
- `--font-display`: "Plus Jakarta Sans" (marketing headlines, hero stats ≥28px)
- `--font-ui`: "Geist" (all console text)
- `--font-mono`: "Geist Mono" (tabular numbers, IDs, timestamps)
- **Tabular numerals** via `.tnum { font-variant-numeric: tabular-nums }` — mandatory for metrics, tables, currency

### Component Primitives (src/components/primitives/)
| Component | Spec Reference | Notes |
|-----------|----------------|-------|
| Button | §6 | 9 variants, 5 sizes, inline styles from token tables |
| Input | §7.1 | 38px md, leading/trailing affix slots |
| Select | §7.3 | Type-ahead, searchable when >8 options |
| Checkbox | §7.5 | 16×16, spring animation |
| Toggle | §7.7 | Immediate-effect only |
| SegmentedControl | §7.8 | 2–4 segments, sliding indicator |
| StatusPill | §9.1 | 6 tones, 22px height |
| IconSquare | §3.2 | 4 sizes, semantic tone mapping |
| EmptyState | §4.4 | 3 variants (empty, filtered-zero, error) |
| Modal | §10.1 | 4 widths, focus trap, scrim |

### Composite Components (src/components/composites/)
| Component | Spec Reference | Notes |
|-----------|----------------|-------|
| Card | §4.1 | Border-defined, --radius-xl, --shadow-xs |
| MetricCard | §4.2 | Label, icon square, value, delta+basis, higherIsBetter |
| Table | §11 | Card-contained, 48px rows, bulk selection toolbar, sticky header/col |
| TableFooter | §8.6 | Pagination + summary |

---

## 5. Key Pages Overview

### Dashboard (`/app`)
- KPI strip (4 MetricCards): Sent, Open Rate, Reply Rate, Meetings, Clicks
- Activity trend LineChart (sent/opened/replied)
- Workspace summary card (Campaigns, Active, Leads, Mailboxes)
- Period selector (7D/30D/90D) via SegmentedControl

### Campaign Builder (`/app/campaigns/new`, `/app/campaigns/:id`)
- **Multi-rail editor**: Sequence / Audience / Sending / Signature / Basics
- **Sequence**: Multi-channel steps (email, phone, sms, whatsapp, linkedin), day delays, conditions
- **EQ scoring**: Debounced AI score on step change (`/ai/score`)
- **Audience**: Lead picker with search, list filter, tag filter, pagination
- **Phased generation**: BatchSize + phasedGeneration for large campaigns
- **Review mode**: Per-lead email preview, approve/reject, bulk actions, test send
- **Launch gate**: Requires all leads reviewed (approved/rejected)

### CRM Overview (`/app/crm`)
- Stats: Total Leads, Companies, Deals, Pipeline Value, Deals Won
- Lead Lists (link to `/app/crm/lists`)
- Recent Activity feed (cross-agent: calls, emails, meetings, proposals)
- Open Tasks grid
- Possible Duplicates (merge/dismiss)
- Quarantined Leads (suppression, invalid syntax, DNC)
- Recycle Bin (soft delete, restore, purge)

### Voice EQ Overview (`/app/voice-eq`)
- Agents, Calls Today, Connect Rate, Minutes Used
- Recent calls table with status pills
- Empty state → Create Agent CTA

### Site EQ Overview (`/app/site-eq`)
- Sites, Conversations, Resolution Rate, Leads Captured
- Sites table with crawl status
- Empty state → Add Site CTA

### Suite Home (`/suite`) — Command Center
- **Live agent status grid** grouped by category (Sales / Marketing / Operations)
- Per-agent status fetchers (AGENT_STATUS) showing: active, working text, metrics, needs-attention
- KPI strip: Agents Active, Actions Today, Total Actions, Leads in CRM, Credits Left
- "Needs your attention" aggregated banner
- Live activity feed (last 40 cross-agent activities)

---

## 6. State Management

- **No global state library** — React Context for auth, local useState/useReducer per page
- **Server state**: TanStack Query (`@tanstack/react-query` v5) available but not yet widely adopted
- **Optimistic updates**: Handled inline (e.g., CampaignBuilder approve/reject)
- **Polling**: Generation status polling (3s interval) for email generation progress

---

## 7. API Layer (src/lib/api.js)

```javascript
// Axios instance with:
- Base URL: ${REACT_APP_BACKEND_URL}/api
- Request interceptor: injects Bearer token from localStorage
- Response interceptor:
  - 401 → clear auth, redirect to /login
  - 402 → dispatch 'innoira:out-of-credits' CustomEvent with detail
  - Non-GET success → dispatch 'innoira:credits-changed' for credit pill refresh
```

**Credit system**: Global 402 handling via `OutOfCreditsWatcher` + `CreditPill` in sidebar

---

## 8. Authentication

- **JWT in localStorage**: `pitcheq_token`, `pitcheq_user`, `pitcheq_workspace`
- **Login/Signup**: Email/password + Google OAuth (credential flow)
- **Session refresh**: `useAuth().refresh()` hits `/auth/me`
- **Logout**: Clears localStorage, hard redirect to `/`

---

## 9. Icon System (src/icons/index.js)

**CLOSED LIST** — 153 curated Lucide exports + 7 semantic aliases:
- Navigation, Actions, Filtering, Communication, Records, Metrics, Intelligence, Status, Time
- **Stroke widths**: 1.5px (14-20px), 1.75px (24px), 2px (≥32px)
- **Tinted icon squares** (IconSquare): 4 sizes, 6 semantic tones (primary, intel, success, warning, risk, neutral)
- **Rule**: Max 4 tones per screen

---

## 10. Charts (src/components/charts/)

- **Recharts** wrapper components: LineChart, BarChart, DonutChart, Sparkline
- **Token-driven colors**: `--chart-1` through `--chart-6`
- **Spec compliance**: No vertical grid, horizontal grid only (`--chart-grid`), no axis lines, tooltips with crosshair

---

## 11. Build & Dev

```json
"scripts": {
  "start": "craco start",    // Dev server (port 3000)
  "build": "craco build",    // Production build
  "test": "craco test"       // Jest + React Testing Library
}
```

- **Craco** for Tailwind + CRA compatibility
- **Yarn** v1.22 (packageManager field)
- **Resolutions** for transitive dependency pinning (150+ entries)

---

## 12. Test IDs (src/constants/testIds/)

Structured constants for E2E testing:
- `auth.js`: login, signup, google, logout
- `home.js`: nav items, agent cards, attention pills
- `index.js`: re-exports all

---

## 13. Known Technical Debt / Gaps

1. **No TypeScript** — all code is JavaScript (JSX)
2. **TanStack Query underused** — most pages use raw useEffect + useState
3. **No Storybook** — component documentation is design-system.md only
4. **No visual regression tests** — Chromatic/Percy not configured
5. **Bundle size** — 80+ chunks but no bundle analysis in CI
6. **Accessibility audit needed** — design system specifies rules but no automated checks

---

## 14. File Count Summary

```
Pages:           ~85 (src/pages/*.jsx)
Primitives:      ~15 (src/components/primitives/)
Composites:      ~8  (src/components/composites/)
Charts:          ~4  (src/components/charts/)
Layout/Shell:    ~6  (AppLayout, CommandPalette, NotificationsCenter, etc.)
Lib:             2   (api, auth)
Icons:           1   (curated index)
Styles:          2   (tokens.css, App.css)
Config:          5   (tailwind, postcss, craco, package.json, README)
```

---

**Last updated**: 2026-08-29  
**Source of truth**: This file + docs/design-system.md + source code