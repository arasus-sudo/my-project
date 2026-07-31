# Chapter 1 — Vision & Product Principles

## 1.1 What CreateEQ is

CreateEQ is the suite's **AI-native design operating system** for visual media — starting
with LinkedIn/social carousels. The product loop is:

```
brief → narrative → deck (AI-generated) → human iteration → export/publish
```

The editor is not a blank canvas with AI helpers bolted on. It is the human-in-the-loop
layer over an AI layout engine: the AI proposes, the human edits, the AI refines — and every
step is a first-class, reversible, versioned operation.

## 1.2 Why not Canva's architecture

Canva's architecture is the result of years of accumulated feature domains (flyers, posters,
video, print, presentations, websites, whiteboards) built around a general-purpose design
tool — a "design-first" paradigm where the primary source of truth is a client-side visual
scene graph coupled to DOM layout engines. Copying it means inheriting complexity CreateEQ
will never use. CreateEQ is an **AI-native Design OS** (spec §1): machine-readable declarative
state and design tokens are the source of truth; layout is compiled by solvers (flexbox/grid)
rather than absolute pixel maps; agents act through protocol-level interfaces (MCP, A2UI)
rather than screenshot processing; mutations run through an asynchronous command bus, not
synchronous UI-thread state mutation.

The reference points instead:

| Product | What we take |
|---|---|
| **Figma** | Scene-graph rigor, selection/transform model, keyboard-first editing, performance discipline, deterministic rendering |
| **Cursor** | AI edits as inline, reversible, reviewable operations — not black-box outputs |
| **v0** | Generation as a dialogue: prompt → structured JSON → render → refine |
| **Gamma** | Deck-native AI flow: narrative structure drives layout, brand-aware |

## 1.3 The six product principles

1. **The document is the contract.** Every visual element and every AI action is structured
   data (scene graph + command log). The UI is a view over that data — renderable identically
   in the browser, in export, and in tests.
2. **AI actions are commands.** Generate, regenerate, restyle, relayout, brand-apply are
   commands on the same bus as user edits: undoable, logged, versioned, replayable. There is
   no "AI path" and "manual path" — one pipeline (this is the Cursor/v0 insight).
3. **One rendering pipeline.** Preview and export render the same scene description. Export
   fidelity is a property of the renderer, not a post-hoc rasterization hack (html2canvas is
   the current-state compromise, never the target).
4. **Design tokens as data.** Palettes, fonts, brand kits, layouts, styles are typed data the
   AI consumes and produces. No design decision is hardcoded in components.
5. **Fast by default.** 60–120 fps interaction with thousands of objects (dirty-rect /
   GPU-batched rendering), optimistic UI for every AI operation.
6. **Extensible without rewrites.** Tools, element types, and agent behaviors are registered
   as data/config, consistent with the suite's shared agent runtime — a new capability is a
   new command and config, not a new code path.

## 1.4 Explicit non-goals (v1)

- No print/video/whiteboard/website domains — that is SiteEQ and future agents' territory.
- No public plugin marketplace in v1 (internal registry only, see Chapter 13).
- No mobile editor in v1.
- No true real-time multi-user editing in v1 — the document model is CRDT-ready (**Loro**,
  per the spec) so collaboration is an integration, not a rewrite (Chapter 6–7).
- No template marketplace in v1 (template *generation* via AI is in scope).

## 1.5 Success metrics

- **Time-to-export**: brief → published deck, median (target < 10 min for a 6-slide deck).
- **Edit latency**: pointer-to-paint under 16 ms at ≤ 2,000 elements/slide; 60 fps drag at
  ≤ 5,000 elements.
- **Undo reliability**: 100% of commands undoable in reverse order; history survives reload.
- **AI iteration rate**: % of AI outputs used without manual layout fixes (target > 70%).
- **Export fidelity**: byte-identical preview vs export for a golden set of decks.

## 1.6 What this means for the migration

The current editor already has the right *data* instincts — a JSON scene graph
(`slides[].elements[]` with typed elements), declarative templates/styles/palettes
(`creqTemplates.js`, `creqStyles.js`), and gesture-batched history. The gap is *mechanism*:
snapshot undo instead of commands, DOM/html2canvas instead of one renderer, and AI calls
wired directly to UI instead of through the command pipeline. Chapters 3–7 close those gaps
incrementally without breaking the current product.

---

© INNOIRA Consulting Services 2026 · CONFIDENTIAL
