# Chapter 3 — Frontend Engine (React–WASM Hybrid & Command Bus)

## 3.1 The core decoupling

The frontend is strictly two layers (spec §3):

```mermaid
graph TB
  subgraph Shell["React/TypeScript Shell (packages/ui-shell)"]
    TOOLBARS[Toolbars · drawers · panels<br/>RightPanel / LeftPanel / Inspector]
    EDITORSTATE[Editor view state<br/>selection · zoom · tool · clipboard]
    UIHOOKS[UI hooks → dispatch commands]
  end

  subgraph Core["Workspace (packages/core-wasm)"]
    INTERACTION[Interaction layer<br/>pointer capture · gestures · snapping]
    BUS[Command Bus<br/>validate → apply → invert → emit]
    SCENE[Scene graph<br/>Map&lt;NodeID, {props, parentID}&gt;]
    LAYOUT[Layout solver<br/>flex/grid · absolute fallback]
    RENDERER[Renderer<br/>WebGPU · WebGL2 fallback]
  end

  SHELLM[Canvas host component] --> INTERACTION
  UIHOOKS --> BUS
  INTERACTION --> BUS
  BUS --> SCENE
  BUS --> LAYOUT
  SCENE --> RENDERER
  LAYOUT --> RENDERER
```

Rules:

1. **The shell never mutates the scene.** Panels emit intents (`"set fill"`, `"move by"`,
   `"add text"`); the command bus is the only mutation path — for human gestures *and* AI
   commands alike (bidirectional execution, spec §1).
2. **The shell owns only ephemeral view state**: selection, zoom, tool, clipboard, open
   drawers. This survives component re-renders but never enters the document/command stream.
3. **The interaction layer is part of the core.** Pointer capture, gesture state machines,
   snapping, and keyboard shortcuts live with the scene — they translate hardware offsets
   into commands and must not depend on React lifecycle.

## 3.2 Module layout (monorepo targets, spec §15)

```
packages/
  core-wasm/        # Rust: scene graph, layout solver, renderer (Phase 2)
    bindings/       # wasm-bindgen generated TS interface
  core-js/          # (P0) TS reference implementation of the same interfaces —
                    # the core-wasm surface is defined here first, WASM is a drop-in later
  ui-shell/         # React/TS: editor shell, panels, canvas host
  shared-utils/     # affine math, fractionalIndex, DTCG token solvers, command schema
services/
  api-fastify/  generative-pipe/  exporter/  infrastructure/
```

The P0 rule: **write the interfaces in TS, implement in TS, make the WASM crate a
replacement behind the same interface.** The command bus never knows whether it's talking to
`core-js` or `core-wasm`.

## 3.3 Command bus core

### 3.3.1 Command shape

```ts
// shared-utils/commands.ts
export type CommandType =
  | "node.create" | "node.delete" | "node.duplicate"
  | "node.set"          // property-level patch (style, text, token refs)
  | "node.transform"    // affine change: translate/rotate/scale
  | "node.reorder"      // fractionalIndex assignment
  | "node.reparent"     // grouping/ungrouping (parent link change)
  | "node.lock" | "node.unlock"
  | "selection.set" | "selection.clear"
  | "slide.add" | "slide.delete" | "slide.duplicate" | "slide.reorder"
  | "theme.set" | "tokens.apply"
  | "brand.apply" | "ai.generate" | "ai.regenerate" | "ai.restyle"
  | "asset.replace";

export interface Command<T = unknown> {
  type: CommandType;
  payload: T;            // plain JSON — serializable, immutable
  clientId: string;      // idempotency key (uuid)
  seq: number;           // per-document monotonically increasing
  meta?: {
    source: "user" | "agent" | "system";
    agentId?: string;    // which agent produced it (AI metering/audit)
    batchId?: string;    // groups multi-command transactions (see 3.8)
    ts: number;
  };
}
```

Constraints: `payload` is JSON (freezable, hashable, diffable); a command is valid iff it
passes `validateCommand` (zod schema) **and** `apply` succeeds against the current scene.
Every command type is registered once — including element-type semantics — so adding a
capability = registering a command + an element type, never a new code path (Ch. 15).

### 3.3.2 Bus contract

```ts
// core-js/bus.ts (interface that core-wasm will satisfy)
export interface Engine {
  apply(cmd: Command): ApplyResult;          // mutate scene; throw on constraint violation
  invert(cmd: Command): Command[];           // exact inverse ops (see 3.8)
  lookup(id: NodeID): NodeProps | null;      // O(1) — Map<NodeID, {props, parentID}>
  solveLayout(dirty: NodeID[]): void;        // flex/grid + absolute resolution
  getFrontier(): string;                     // state hash (spec §6) for sync/undo
  applyRemote(delta: Uint8Array): void;      // Loro/Protobuf inbound (Phase 3)
  emitDeltas(): DeltaStream;                 // outbound deltas (render + sync)
}
```

The **render loop** subscribes to the bus's delta stream (`node.set` on `#text-7` →
dirty-rect push → scissored repaint in Phase 2; today: `setProj` update). Components never
subscribe to per-node changes; they re-render only for shell state changes.

## 3.4 Initial command taxonomy (P0 surface)

| Command | Payload (abridged) | Inverse |
|---|---|---|
| `node.create` | `{id, type, parentId, props}` | `node.delete` |
| `node.delete` | `{id}` | `node.create` (restore snapshot) |
| `node.duplicate` | `{id}` | `node.delete` (of new id) |
| `node.set` | `{id, props: Partial}` | `node.set` (previous props) |
| `node.transform` | `{id, matrix: Affine3x2, origin}` | `node.transform` (`matrix⁻¹`) |
| `node.reorder` | `{id, index: FractionalIndex}` | `node.reorder` (prev index) |
| `node.reparent` | `{id, newParentId}` | `node.reparent` (prev parent) |
| `slide.add` / `slide.delete` | `{index?, payload}` | inverse |
| `theme.set` | `{paletteId}` | `theme.set` (prev) |
| `tokens.apply` | `{tokens: TokenPatch[]}` | `tokens.apply` (prev values) |
| `brand.apply` | `{kitId, opts}` | `brand.apply` (prev brand state) |
| `ai.generate` | `{jobId, target, brief, opts}` | transaction undo (batch) |
| `asset.replace` | `{id, src}` | `asset.replace` (prev src) |

Transform semantics: the spec mandates 3×2 affine matrices (Ch. 5). P0 must carry
`transform` as a matrix from day one — the current editor's separate `x/y/w/h/rotate/
flip_h/flip_v` fields (ElementRender.jsx:24-30) serialize into the matrix on hydration and
out of it on render, so both worlds coexist during migration.

## 3.5 Interaction layer: capture → translate → commit

```mermaid
sequenceDiagram
  participant P as Pointer (pointerdown)
  participant I as Interaction Layer
  participant B as Command Bus
  participant S as Scene
  participant R as Renderer

  P->>I: pointerdown (clientX/Y, target node)
  I->>I: hit-test → node.id, tool state (move/resize/rotate), gesture seed
  loop while dragging
    P->>I: pointermove (offsets)
    I->>I: snapping (guides) + constraint solve (anchors, aspect)
    I->>B: preview transform (NO history write)
  end
  P->>I: pointerup
  I->>B: node.transform {matrix, origin}  ← one command for the whole gesture
  B->>S: validate + apply + invert-stack
  S->>R: dirty-rect delta
  R->>R: paint (Phase 2: GPU scissor; P0: React state tick)
```

Rules carried over from today's editor (already correct and preserved):

- **One history entry per gesture** — current `beginGesture()`/`mutateLive()` behavior
  (CreateEQEditor.jsx:209-213, 289-299) becomes: preview transforms bypass the bus's history
  stack; only the commit command is recorded. Same for slider sweeps in the inspector
  (`node.set` on release, not per-pixel).
- **Snapping lives in the interaction layer** (current smart-snap, CreateEQEditor.jsx:98),
  not in the scene — snaps produce *adjusted command payloads*, never stored geometry.
- **Alt-drag duplication, marquee, multi-select, rotation handles, anchored resize** all
  reduce to the same pattern: gesture state machine → one or a few commands.

## 3.6 History: inverse ops, not snapshots

- The bus keeps a **command stack** (`applied: Command[]`, `undone: Command[]`), capped by
  total op count (e.g. 5,000 ops), not JSON bytes.
- `undo()` = `invert(last)` applied to the scene; `redo()` = re-apply. Inverses are exact —
  `node.transform` stores the previous matrix; `node.set` stores the previous props subset
  (spec §6 delta-tracking: undo subtracts the offset `[-T]`, redo adds `[T]`).
- **Transactions**: `meta.batchId` groups commands (e.g. "apply brand kit" = N
  `node.set`+`theme.set` ops; "AI restyle slide" = several). Undo/redo operate on the whole
  batch as one unit. This is precisely what the current `applyBrandKit` should emit once it
  moves onto the bus.
- Replay safety: because history is *derived from commands*, a full reload re-applies the
  ledger — the seed of server versioning (Ch. 6) and the spec's state frontiers.
- P0 keeps the existing snapshot stack only as a **fallback** for pre-migration decks; new
  edits flow through the bus.

## 3.7 Optimistic apply, idempotency, conflicts

- Client applies locally, then sends `POST /documents/:id/commands` (spec §2 flow). The
  server ack carries the new frontier; on mismatch the client re-syncs that document from
  the event log (`GET /documents/:id/events?since=…`).
- `clientId` dedupes retries (network/websocket resend) at both the bus and the ledger.
- Constraint violations (e.g. parent cycle, out-of-bounds node) are thrown by `validate` +
  `apply` *before* any render — the UI surfaces them as toasts, never as broken geometry.

## 3.8 Where WASM comes in (Phase 2, not P0)

The Rust core replaces `core-js` behind the identical interface with these wins:

1. Scene ops in native memory — no JS object churn on multi-thousand-node graphs.
2. Layout solving (flex/grid compilation, Ch. 9) computed off the UI thread (Wasm threads).
3. Renderer direct-to-GPU; commands mutate engine memory, paint bypasses DOM entirely
   (spec §3 step 4).

The bus, command taxonomy, and payload schemas are **unchanged** — which is the entire
point of defining them in TS first.

## 3.9 P0 migration bridge (landing this in the current editor)

Concrete, shippable increments against the existing codebase:

1. **Extract the mutation surface.** Today's helpers in `CreateEQEditor.jsx` —
   `patchElement`, `addElement`, `deleteElement`, `duplicateElement`, `bringToFront`/
   `sendToBack`, `alignSelected`, `groupElements`, `applyBrandKit`, `handleApplyStyle`,
   `handleApplyLayout` — are the command registry. Wrap each in a typed
   `dispatch(Command)` that delegates to the existing `mutate()` reducer. No UI change.
2. **Add the inverse stack** alongside `pushHistory`; keep snapshot fallback.
3. **Move inspector + toolbar intents to the bus** (`RightPanel.jsx` `onEditElement` →
   `node.set` on release; `LeftPanel.jsx` add buttons → `node.create`).
4. **Gesture commits**: replace the end-of-gesture snapshot capture with a real
   `node.transform` command (keep `mutateLive` previews).
5. **AI commands**: route `/carousel/edit`, style/layout apply, brand apply through the bus
   as batched transactions (`meta.source: "agent"`).
6. **Server ledger** (P0): persist commands to a `transactional_history`-shaped collection
   (Ch. 11 schema, JSONB-ready in Postgres, Mongo placeholder in the interim) — undo across
   reloads becomes possible before any infra migration.

Each step is independently shippable and reverts cleanly; steps 1–4 are weeks, 5–6 follow.

## 3.10 Implementation order

1. `shared-utils`: command schema + zod validation + affine math + fractionalIndex (port
   current `x/y/w/h/rotate` composition from ElementRender.jsx:24-30).
2. `core-js`: `Engine` interface + scene `Map<NodeID, …>` refactor of `proj.slides[].elements`
   (with hydrator for saved decks).
3. Command bus + inverse stack; migrate gesture commits (3.9 step 4).
4. Migrate inspector/toolbar/brand/AI paths (3.9 steps 3, 5).
5. Server ledger endpoint + reload-undo.
6. (Phase 2) `core-wasm` behind the same interface.

**Success gates:** all existing editor interaction tests (`test_reports/iteration_4.json`
flows) pass unchanged; undo/redo survives reload; every mutation in the editor provably
arrives via `dispatch`.

---

© INNOIRA Consulting Services 2026 · CONFIDENTIAL
