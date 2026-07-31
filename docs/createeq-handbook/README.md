# CreateEQ Engineering & Architecture Handbook

**Owner:** Innoira Engineering · **Status:** In progress (chapter by chapter) · **Last updated:** 2026-07-31

The single source of truth for CreateEQ's architecture and implementation. CreateEQ is an
**AI-Native Design Operating System** (Design OS): visual layout, structural grouping, and
component properties exist as clean, structured, programmatically actionable data first —
rendered pixels second.

**Parent document:** the *Technical Architecture Specification: CreateEQ AI-Native Design OS*
(15 sections; bidirectional human/AI execution, WASM/WebGPU core, Loro CRDT, A2UI protocol,
MCP, Satori/Resvg export, Azure Web PubSub). This handbook is the implementation blueprint for
that specification: schemas, sequence flows, engineering decisions, and migration paths from
the current codebase, written chapter by chapter.

## Table of contents

| # | Chapter | Status |
|---|---------|--------|
| 0 | Current-State Gap Analysis & Roadmap (audit vs. spec) | ✅ Written |
| 1 | Vision & Product Principles | ✅ Written |
| 2 | High-Level Distributed System Architecture | ✅ Written |
| 3 | Frontend Engine (React–WASM hybrid, command bus) | ✅ Written |
| 4 | Rendering Architecture (WebGPU pipeline, MSDF) | ✅ Written |
| 5 | Document Model (normalized scene graph, affine, tokens) | ✅ Written |
| 6 | State Management (Loro CRDTs, history, state frontiers) | ✅ Written |
| 7 | Real-Time Sync & Multi-User Orchestration (Web PubSub, presence) | ✅ Written |
| 8 | Generative AI Pipeline (A2UI protocol, validation, recovery) | ✅ Written |
| 9 | Layout Detection Engine (absolute → flex, IoU, Allen intervals) | ✅ Written |
| 10 | MCP Integration (agent tool access to canvas) | ✅ Written |
| 11 | Persistence Layer (Postgres hybrid, JSONB, ops ledger) | ✅ Written |
| 12 | Backend Microservices (Fastify, BullMQ) | ✅ Written |
| 13 | Headless Export Engine (Satori, Resvg, OOXML) | ✅ Written |
| 14 | Infrastructure (Azure Front Door, autoscaling, SKUs) | ✅ Written |
| 15 | Engineering Standards (monorepo, CI/CD testing) | ✅ Written |

## Reading order

1. **Chapter 0** first — the audit of today's implementation against the spec, and the
   phased roadmap every later chapter slots into.
2. Chapters 1–2 establish vision and system shape.
3. Chapters 3–6 are the editor engine core (build in dependency order).
4. Chapters 7–13 are the surrounding services; 14–15 are delivery.

## Current-state reference

CreateEQ today (2026-07): React (Craco) editor, DOM-rendered canvas, html2canvas export,
single-file FastAPI backend (`backend/server.py`), MongoDB (`db.carousels`, `db.brandkits`,
`db.carousel_images`). Referenced throughout as "current state"; every chapter that touches an
existing subsystem includes a migration path.

## Conventions

- Diagrams: Mermaid (GitHub-rendered).
- Schemas: TypeScript types for the editor contract; SQL DDL for persistence.
- Every chapter ends with an "Implementation order" section and a migration note where relevant.

---

© INNOIRA Consulting Services 2026 · CONFIDENTIAL
