# Chapter 0 — Current-State Gap Analysis & Roadmap

**Audit date:** 2026-07-31 · **Baseline:** current implementation (React/Craco editor +
single-file FastAPI + MongoDB) vs. the CreateEQ Technical Architecture Specification (A2UI,
Loro CRDT, WASM/WebGPU core, Fastify + Azure Web PubSub + Satori/Resvg, Postgres).

Verdict legend: ✅ aligned today · 🟡 bridgeable incrementally now · 🔴 new build / later phase.

## 0.1 Section-by-section audit

| Spec § | Requirement | Verdict | Evidence / current state |
|---|---|---|---|
| 1 · Vision | AI-native design OS; unified declarative state; bidirectional human+AI execution | 🟡 | Client holds a declarative JSON scene graph (`proj.slides[].elements[]`) and AI + human edits both flow through it — but AI actions (wizard, `/carousel/edit` rewrite, `/carousel/ai-image`) are fire-and-forget API calls, not first-class commands. No event ledger exists server-side. |
| 2 · 5-component architecture | React shell + WASM core · Fastify edge · Azure Web PubSub · AI pipeline · Satori/Resvg export | 🔴 | All five exist in embryo: React shell (no WASM), FastAPI single file (`backend/server.py`, 6.4K lines), no WebSocket transport at all, AI inline in request handlers (no queue/workers), export = client-side html2canvas + jsPDF. |
| 3 · Frontend WASM core + command bus | WASM engine; atomic immutable commands; GPU paint without DOM reflow | 🟡→🔴 | No WASM. But the *command-bus semantics* can be built in TS today: current `mutate()`/`mutateLive()` + gesture batching (`CreateEQEditor.jsx:255-299`) is a snapshot-based approximation — one gesture = one history entry, but history is JSON snapshots (50 cap, in-memory), not reversible ops. WASM/WebGPU is the later performance phase. |
| 4 · WebGPU pipeline | WGSL, instancing, scissor dirty-rects, MSDF text, WebGL2 fallback | 🔴 | DOM + CSS transforms; `SelectionChrome` overlays; zoom via CSS scale. Acceptable while a deck is one 1080×1350 slide with hundreds of elements — becomes the constraint at board-view/panorama scale and thousands of objects. The *export* side is what hurts today, not interaction. |
| 5 · Normalized scene graph | `Map<NodeID, {props, parentID}>`, O(1) lookup, fractionalIndex, affine transforms, `display: flex\|absolute` | 🟡→🔴 | Arrays `slides[].elements[]`; z-order = array order; `rotate/flip_h/flip_v` stored as separate fields (ElementRender.jsx:24-30 composes CSS transforms) instead of a 3×2 matrix; groups are metadata (`{id, elementIds}`, CreateEQEditor.jsx:410-421), not parent links; `display` doesn't exist — everything is absolute. Flattening to an id-map + affine + fractionalIndex is a contained refactor; flex layout is the hard part (depends on §9). |
| 6 · Loro CRDT + Movable Tree (Kleppmann) | CRDT event graph; delta ops; state frontiers | 🔴 | No collaboration; undo = JSON snapshots. 🟡 Bridge: introduce an ops-delta persistence shape now (see §11 note) so Loro deltas slot in later. |
| 7 · Web PubSub + presence + 200-user cap | Managed WS router; ephemeral presence frames | 🔴 | None (no WS anywhere). Future phase. |
| 8 · A2UI v0.9 | JSONL streaming, JSON Schema enforcement, parse-failure recovery | 🟡 | Current AI endpoints are blocking REST (`/carousel/generate` wizard, `/carousel/edit`, `/carousel/ai-image`, server.py:3695-4050); outputs validated only by Pydantic field checks; no streaming, no repair/fallback ladder. Adoptable in the new worker pipeline. |
| 9 · Layout detection engine | Homogeneity → IoU(0.1) → Allen intervals → flexbox conversion; z-index inference | 🔴 | No equivalent. Templates/layouts/styles are hand-authored declarative data (`creqTemplates.js`, `creqStyles.js`, `creqDesignEngine.js`) — excellent substrate, but generation emits absolute coordinates. This is the core AI-native capability to build. |
| 10 · MCP server | External agents (Claude Code, Cursor) inspect/modify canvas via tools | 🟡 | None. Cheap once the command API exists: MCP tools become thin wrappers over `/documents/:id/commands`. |
| 11 · Postgres hybrid | Relational identity/permissions + JSONB nodes + `transactional_history` ops_delta | 🔴 | MongoDB: `db.carousels` (document JSON), `db.brandkits`, `db.carousel_images` (binary), plus the suite's shared collections. Migration is suite-mandated anyway (CLAUDE.md target stack). 🟡 Bridge: write the ops log now (Mongo or JSONB-equivalent) with Loro-compatible shape. |
| 12 · Fastify + BullMQ | Stateless services; Redis queue; WS completion signal | 🔴 | Single FastAPI file, no queue, blocking awaits, no push channel. BullMQ is the suite standard (CLAUDE.md). |
| 13 · Satori/Resvg export | Headless SVG→PNG (no browser); OOXML compile for PPTX | 🔴 | html2canvas client-side (CreateEQEditor.jsx:1196-1244); jsPDF for PDF. 🟡 note: `ElementRender.jsx` renders JSX+inline styles — a direct, mostly mechanical mapping to Satori JSX. This is the single highest-fidelity win available now. |
| 14 · Infra (Front Door, autoscaling, SKUs) | P3v3 · Web PubSub Premium · PG 16vCPU/128GB · Redis P2 | 🔴 | Azure App Service (single instance) + MongoDB Atlas. Spec SKUs are *target scale*; right-size for staging. |
| 15 · Monorepo | `/packages/core-wasm, ui-shell, shared-utils` · `/services/api-fastify, generative-pipe, exporter` · `/infrastructure` | 🟡 | Repo is `backend/ + frontend/ + web/` flat. Restructure when service extraction starts; core-wasm/ shared-utils can be carved out first. |

## 0.2 What is already aligned (don't rebuild)

- **Declarative scene graph** — typed element objects per slide; the document is data, not DOM. The spec's "data first, pixels second" already holds client-side.
- **Design tokens as data** — `PALETTES`, brand kits (colors/fonts/palette/logo), styles, layouts are typed data (`creqTemplates.js`, `creqStyles.js`, `creqDesignEngine.js`); brand apply is data-driven (CreateEQEditor.jsx:1328-1358).
- **Gesture-batched mutation discipline** — one history snapshot per gesture, live updates during it (`mutateLive`, `beginGesture`) — the right interaction model; it just needs real command semantics.
- **Multi-tenant auth** — JWT workspace-scoped models and all data keyed by `workspace_id` — matches spec §1/§11 requirements.
- **Element rendering is one source of truth** — live canvas and off-screen export use the same `ElementRender` (its header comment: "identically for the live canvas and the off-screen export tree") — this is the seed of the "one rendering pipeline" principle and maps to Satori directly.

## 0.3 Prioritized roadmap

**Phase 0 — command semantics on today's stack (keep shipping, no infra change)**
1. Typed scene graph refactor: `Map<NodeID, …>`, affine 3×2 transforms, `fractionalIndex` z-order, real groups (parent links) — with a `hydrate()` migration for saved decks (a hydration layer already exists).
2. Command bus with inverse ops + server-persisted event log (spec §11 shape); undo/redo derived from ops; keep snapshot fallback for old decks.
3. AI actions become commands: generation/regeneration/restyle/brand-apply are one undoable transaction.
4. JSON Schema validation + recovery ladder on every AI output (A2UI §8 semantics, minus WasmGC).
5. MCP server (wraps the command API).

**Phase 1 — export & AI pipeline**
6. Satori/Resvg export service (serverless); retire html2canvas; OOXML PPTX compile. Golden-image tests before/after.
7. BullMQ worker pipeline for AI (suite shared runtime): job status, streaming, metering.

**Phase 2 — engine**
8. WASM core (Rust) — scene ops + layout solve; WebGPU renderer w/ WebGL2 fallback, instanced draws, scissor dirty rects, MSDF text.
9. Layout detection engine (homogeneity → IoU 0.1 → Allen intervals → flexbox conversion, z-index inference); AI emits flex structures once §5 `display:flex` lands.

**Phase 3 — collaboration & scale**
10. Azure Web PubSub + presence + Loro CRDT (Movable Tree, Kleppmann validation, state frontiers); 200-user cap policy.
11. Postgres migration (JSONB nodes + ops_delta), Fastify services extraction, Front Door + SKU scaling.

## 0.4 Risks & verification

- **Deck backward-compat** — every scene-graph change must round-trip saved decks via the hydrator; keep `stripLocalKeys` semantics for save.
- **Undo behavior** — snapshot→ops changes semantics (grouped transactions, redo bounds); existing interaction test evidence (`test_reports/iteration_4.json`, editor flows) is the regression baseline.
- **Export fidelity** — html2canvas→Satori must be gated by pixel-diff golden tests (fonts via `waitForProjectFonts` today; Satori needs the same font manifest server-side).
- **WASM/WebGPU** — progressive enhancement: keep DOM renderer until the canvas renderer passes side-by-side pixel tests at 1:1 zoom.
- **Cost metering** — A2UI/AI pipeline lands inside the suite's shared agent runtime (token/cost per workspace/agent) — do not build a parallel metering path.

---

© INNOIRA Consulting Services 2026 · CONFIDENTIAL
