# Chapter 15 — Engineering Standards (Monorepo, CI/CD, Testing)

## 15.1 Repo shape

A suite-wide **monorepo** (pnpm workspaces) — CreateEQ is the reference tenant; the
shared runtime (CLAUDE.md priority 1) lives beside it so VoiceEQ/ReplyEQ/SiteEQ consume
the same packages:

```
/
├─ packages/
│  ├─ runtime-auth/        # tenant identity, roles, JWT, RBAC (suite-wide)
│  ├─ runtime-llm/         # provider layer: Perplexity/Anthropic/OpenAI (as-built Ch. 8)
│  ├─ runtime-metering/    # token_usage_log writes, per-agent budgets
│  ├─ runtime-kb/          # pgvector ingestion/search (Ch. 11 §11.6)
│  ├─ runtime-queue/       # BullMQ wrapper: job shape, idempotency, DLQ policy
│  └─ createeq-core/       # document model, layout solve, hydrators, tokens
├─ apps/
│  ├─ createeq-api/        # Fastify edge gateway + services (Ch. 12)
│  ├─ createeq-web/        # Next.js editor (Ch. 3) — migrates from CRA/Craco
│  ├─ createeq-workers/    # AI/export/consolidation pools (Ch. 12 §12.4)
│  └─ (voiceeq-*, replyeq-*, …)
└─ infra/                  # Bicep IaC (Ch. 14), dashboards, alert rules
```

## 15.2 Standards

- **TypeScript strict** everywhere; schema-first validation (TypeBox) as the single
  contract source for HTTP, MCP, and queue payloads (Ch. 12 §12.5) — shared schemas
  package, no duplicated route types.
- **No vendor lock-in imports** (`emergentintegrations` forbidden, CLAUDE.md); direct
  SDK calls only (Claude/Perplexity/OpenAI via one provider layer, Ch. 8).
- **Brand system** enforced in UI review (flat enterprise design system, CLAUDE.md);
  tokens from Ch. 5 §5.8 are the only allowed spacing/color/type values in new UI.
- **Migrations**: Flyway-style SQL migrations, additive-only per release; every
  migration has a downgrade path for the 14-day rollback window (Ch. 11 §11.5).
- **Secrets**: never in code/env/image; Key Vault references only (Ch. 14 §14.6);
  secret-scan gate in CI blocks commits matching key patterns.

## 15.3 CI/CD

**CI (per PR):** lint → typecheck → unit tests → schema snapshot diff (TypeBox/DDL) →
secret scan → build containers. Determinism CI for the export engine double-render
(Ch. 13 §13.4) and ledger frontier tests (Ch. 6) run in a nightly full corpus.

**CD:** merge to `main` → ACR image build (immutable tags) → staging slot deploy →
smoke tests (health, parity, ledger append) → slot swap (Ch. 14 §14.3). Rollback =
swap back; DB rollback per Ch. 11 §11.5.

**Environments:** dev (local Docker compose: Postgres+Redis+workers), staging (Azure,
full parity), prod (slot). Feature flags (per-workspace, Ch. 11 §11.5) gate migrations
and export flip (Ch. 13 §13.5).

## 15.4 Testing tiers

| Tier | Scope | Tooling |
|---|---|---|
| Unit | pure logic: layout solve, fractionalIndex, frontiers, provider routing | Vitest |
| Contract | routes ↔ schemas ↔ MCP tools ↔ queue payloads | TypeBox + integration harness |
| Integration | ledger idempotency (redelivery), BullMQ retry/DLQ, pgvector queries | Testcontainers (PG+Redis) |
| E2E | editor flows: create deck → AI generate → edit → export | Playwright (editor) + API parity suite |
| Golden corpus | 50-doc decks: render determinism, export parity, frontier-hash equality (Ch. 11 §11.5) | nightly |

**Parity tests are the migration safety net**: every FastAPI route that gets extracted
(Ch. 12 §12.6) must pass an identical-JSON comparison against the old implementation
before the flag flips — same rule that gates html2canvas→headless (Ch. 13 §13.5).

## 15.5 Definition of Done (CreateEQ feature)

1. Schema-first contract added; TypeBox/DDL snapshot updated.
2. Unit + integration tests green; CI gates pass.
3. Parity test (if touching a migrated path) passes both directions.
4. Workspace feature-flag added; staged rollout planned.
5. Observability: metric/alert added if the path is user-visible (Ch. 14 §14.6).
6. No emergentintegrations references; brand system conformant UI.

## 15.6 Implementation order & gates

1. Monorepo skeleton + packages split (runtime-* first — everything depends on them).
2. CI pipeline on the skeleton; secret scan + TypeBox schema diff gates.
3. createeq-core extracted from current CRA editor (Ch. 5/9 logic) into shared package.
4. Next.js app mounts the extracted core; parity suite covers editor + API.
5. Infra-as-code (Bicep) committed; staging parity gate enforces §15.4 before prod swaps.

**Gates:** new-tenant onboarding on the monorepo skeleton in < 1 day (suite priority 4);
CI from merge to prod slot swap < 25 min; nightly golden corpus zero nondeterminism
failures for 4 consecutive weeks; parity suite blocks any behavioral drift on migrated
paths.

---

© INNOIRA Consulting Services 2026 · CONFIDENTIAL
