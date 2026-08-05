# Product Design System — Analytics SaaS (Console + Marketing)

**Version** 1.0
**Status** Binding. Any UI that contradicts this document is a bug.
**Scope** Web app console (authenticated product surfaces) + marketing/case-study pages.
**Consumers** Designers, engineers, and coding agents (Claude Code). Machine-readable rules are marked `RULE:`.

---

## 0. How to use this file

1. Read §1 (Principles) and §2 (Tokens) before writing any UI.
2. Never introduce a raw hex, px font size, or shadow that is not in §2. If you need a value that doesn't exist, add it to §2 first with a name and a reason.
3. Component specs (§7–§20) are the source of truth for anatomy, states, sizes and spacing. Build from them; don't re-derive.
4. §24 (Anti-patterns) is a hard blocklist. Violating it fails review.

**Token naming grammar** — `--{category}-{role}-{modifier}`
Categories: `color`, `text`, `bg`, `border`, `radius`, `space`, `shadow`, `font`, `dur`, `ease`, `z`.
Roles are semantic (`primary`, `muted`, `danger`), never literal (`blue`, `gray-400`).

`RULE:` Components consume **semantic** tokens only. Palette scales (§2.1) exist to define semantics and may not be referenced from component code.

---

## 1. Design principles

The system is a **data-dense, quiet, high-trust console**. It is designed so a user can scan twelve numbers in three seconds and know where to act.

**1. Information first, chrome last.**
Surfaces are white or near-white. Borders are 1px and low-contrast. Color is spent almost exclusively on data, status, and the single primary action. If a screen looks decorative, it's wrong.

**2. One primary action per view.**
Exactly one filled blue button in any viewport (`Add Lead`, `Run Report`, `Send invite`). Everything else is secondary, ghost, or a text link. If two actions compete, one of them is secondary.

**3. Density is a feature, not a compromise.**
Target 44–48px table rows, 13px table text, 12–16px card padding on inner cards, 20–24px on outer cards. Whitespace is used to group, not to impress. Marketing pages are the only place that breathes at 80–120px rhythm.

**4. Every number carries context.**
A metric is never alone. It ships with a label, a comparison delta (`↑12.4% vs last month`), and a basis line (`64 active opportunities`). A bare number is an unfinished component.

**5. Intelligence is labeled and always reversible.**
Machine-generated content lives in violet-marked containers, states its confidence, and cites the signals that produced it. It always offers a human action (`Generate email`, `Create task`, `Review deals`) and never auto-commits a change.

**6. Status is a vocabulary, not a decoration.**
Six statuses, six colors, used identically everywhere (§4.3). A green pill always means "won/healthy/success" on every screen.

**7. Motion confirms, never entertains.**
120–200ms, opacity and 2–4px transform only. No parallax, no scroll-jacking, no entrance choreography.

---

## 2. Tokens

### 2.1 Palette scales (definition layer — do not use directly in components)

```
Neutral (cool slate)
--neutral-0    #FFFFFF
--neutral-25   #FBFCFD
--neutral-50   #F6F7FB   /* app canvas */
--neutral-100  #EEF0F6
--neutral-200  #E4E7EF   /* default border */
--neutral-300  #CFD4E1
--neutral-400  #A6AEC0
--neutral-500  #8A93A6   /* tertiary text */
--neutral-600  #5A6478   /* secondary text */
--neutral-700  #3C4557
--neutral-800  #232B3B
--neutral-900  #0F1729   /* primary text */
--neutral-950  #080D18

Blue (primary / brand action)
--blue-50   #EFF4FF
--blue-100  #DBE6FE
--blue-200  #BFD3FE
--blue-300  #93B4FD
--blue-400  #6090FA
--blue-500  #3B76F6
--blue-600  #2563EB   /* primary */
--blue-700  #1D4ED8
--blue-800  #1E40AF
--blue-900  #1E3A8A

Violet (intelligence / AI-assisted surfaces)
--violet-50   #F3F0FE
--violet-100  #E7E1FD
--violet-200  #D3C8FB
--violet-300  #B6A4F7
--violet-400  #957CF2
--violet-500  #7C5CF7
--violet-600  #6C4FE0
--violet-700  #5A3EC0
--violet-900  #3B2685

Green (success / won / healthy)
--green-50   #E9F8EF
--green-100  #D0F0DC
--green-200  #A5E3BE
--green-500  #16B364
--green-600  #12A150
--green-700  #0E8043

Amber (attention / medium priority / pending)
--amber-50   #FEF6E7
--amber-100  #FCEBC7
--amber-200  #F8D99A
--amber-500  #F0A32B
--amber-600  #E08600
--amber-700  #B96A00

Orange (at-risk / quick actions accent)
--orange-50   #FEF1E8
--orange-100  #FCDFCB
--orange-500  #F5803E
--orange-600  #E4661F

Red (danger / lost / failed)
--red-50   #FDECEC
--red-100  #FBD5D5
--red-200  #F5AFAF
--red-500  #EF4444
--red-600  #DC2626
--red-700  #B91C1C

Teal (secondary data series only)
--teal-50   #E6F7F7
--teal-500  #10A5A5
--teal-600  #0C8C8C

Pink (secondary data series only)
--pink-500  #E1568B
--pink-600  #C93E74
```

`RULE:` Teal and pink exist **only** as chart series 5 and 6. Never in UI chrome, pills, or icons.

### 2.2 Semantic tokens — light theme (default)

```css
:root {
  /* ---- Surfaces ---- */
  --bg-canvas:        #F6F7FB;  /* app background behind cards */
  --bg-surface:       #FFFFFF;  /* cards, tables, menus, modals */
  --bg-surface-sunken:#FBFCFD;  /* table headers, inner wells, code */
  --bg-surface-raised:#FFFFFF;  /* popovers/dropdowns (shadow does the lifting) */
  --bg-hover:         #F6F7FB;  /* row/menu-item hover */
  --bg-active:        #EEF0F6;  /* pressed / current row */
  --bg-selected:      #EFF4FF;  /* selected row, active nav item */
  --bg-disabled:      #F6F7FB;
  --bg-overlay:       rgba(15, 23, 41, 0.44); /* modal scrim */

  /* ---- Text ---- */
  --text-primary:     #0F1729;
  --text-secondary:   #5A6478;
  --text-tertiary:    #8A93A6;  /* timestamps, basis lines, placeholders */
  --text-disabled:    #A6AEC0;
  --text-inverse:     #FFFFFF;
  --text-link:        #2563EB;
  --text-link-hover:  #1D4ED8;

  /* ---- Borders ---- */
  --border-subtle:    #EEF0F6;  /* internal dividers inside a card */
  --border-default:   #E4E7EF;  /* card, input, table outlines */
  --border-strong:    #CFD4E1;  /* input hover, dragged card */
  --border-focus:     #2563EB;

  /* ---- Primary action ---- */
  --color-primary:            #2563EB;
  --color-primary-hover:      #1D4ED8;
  --color-primary-active:     #1E40AF;
  --color-primary-subtle:     #EFF4FF;
  --color-primary-subtle-hover:#DBE6FE;
  --color-primary-border:     #BFD3FE;
  --color-on-primary:         #FFFFFF;

  /* ---- Intelligence (AI-assisted) ---- */
  --color-intel:          #6C4FE0;
  --color-intel-hover:    #5A3EC0;
  --color-intel-subtle:   #F3F0FE;
  --color-intel-border:   #D3C8FB;
  --color-on-intel:       #FFFFFF;

  /* ---- Status ---- */
  --color-success:        #12A150;
  --color-success-subtle: #E9F8EF;
  --color-success-border: #A5E3BE;
  --color-success-text:   #0E8043;

  --color-warning:        #E08600;
  --color-warning-subtle: #FEF6E7;
  --color-warning-border: #F8D99A;
  --color-warning-text:   #B96A00;

  --color-risk:           #E4661F;   /* "At Risk" — distinct from warning */
  --color-risk-subtle:    #FEF1E8;
  --color-risk-border:    #FCDFCB;
  --color-risk-text:      #C2551A;

  --color-danger:         #DC2626;
  --color-danger-subtle:  #FDECEC;
  --color-danger-border:  #F5AFAF;
  --color-danger-text:    #B91C1C;

  --color-neutral-status:       #5A6478;
  --color-neutral-status-subtle:#EEF0F6;
  --color-neutral-status-border:#E4E7EF;

  /* ---- Data visualization ---- */
  --chart-1: #2563EB;  /* primary metric */
  --chart-2: #7C5CF7;
  --chart-3: #12A150;
  --chart-4: #F5803E;
  --chart-5: #10A5A5;
  --chart-6: #E1568B;
  --chart-positive: #12A150;
  --chart-negative: #DC2626;
  --chart-grid:     #EEF0F6;
  --chart-axis:     #8A93A6;
  --chart-reference:#CFD4E1;  /* dashed average/target lines */
  --chart-area-from: rgba(37, 99, 235, 0.14);
  --chart-area-to:   rgba(37, 99, 235, 0.00);
}
```

### 2.3 Semantic tokens — dark theme

`RULE:` Dark theme is a token swap on `[data-theme="dark"]`. No component may branch on theme in JS or ship theme-specific markup.

```css
[data-theme="dark"] {
  --bg-canvas:        #0B1020;
  --bg-surface:       #121829;
  --bg-surface-sunken:#0E1424;
  --bg-surface-raised:#182036;
  --bg-hover:         #1A2136;
  --bg-active:        #212A42;
  --bg-selected:      #16264C;
  --bg-disabled:      #151B2B;
  --bg-overlay:       rgba(4, 8, 18, 0.66);

  --text-primary:     #EEF1F8;
  --text-secondary:   #A2ACC2;
  --text-tertiary:    #767F96;
  --text-disabled:    #5A6478;
  --text-inverse:     #0F1729;
  --text-link:        #7BA3FB;
  --text-link-hover:  #A2C0FD;

  --border-subtle:    #1B2338;
  --border-default:   #242D45;
  --border-strong:    #33405E;
  --border-focus:     #6090FA;

  --color-primary:            #3B76F6;
  --color-primary-hover:      #6090FA;
  --color-primary-active:     #2563EB;
  --color-primary-subtle:     #14224A;
  --color-primary-subtle-hover:#1B2E60;
  --color-primary-border:     #26407C;
  --color-on-primary:         #FFFFFF;

  --color-intel:          #957CF2;
  --color-intel-hover:    #B6A4F7;
  --color-intel-subtle:   #1E1A40;
  --color-intel-border:   #372E6E;
  --color-on-intel:       #0F1729;

  --color-success:        #16B364;
  --color-success-subtle: #0E2A1D;
  --color-success-border: #1B4A31;
  --color-success-text:   #57D18F;

  --color-warning:        #F0A32B;
  --color-warning-subtle: #2C2109;
  --color-warning-border: #4D3A12;
  --color-warning-text:   #F5BE62;

  --color-risk:           #F5803E;
  --color-risk-subtle:    #2E1A0F;
  --color-risk-border:    #4E2E1A;
  --color-risk-text:      #F79E69;

  --color-danger:         #EF4444;
  --color-danger-subtle:  #2E1213;
  --color-danger-border:  #522022;
  --color-danger-text:    #F58585;

  --color-neutral-status:       #A2ACC2;
  --color-neutral-status-subtle:#1B2338;
  --color-neutral-status-border:#242D45;

  --chart-1: #6090FA;
  --chart-2: #957CF2;
  --chart-3: #16B364;
  --chart-4: #F5803E;
  --chart-5: #22B8B8;
  --chart-6: #EE7AA5;
  --chart-grid: #1B2338;
  --chart-axis: #767F96;
  --chart-reference: #33405E;
  --chart-area-from: rgba(96, 144, 250, 0.20);
  --chart-area-to:   rgba(96, 144, 250, 0.00);
}
```

### 2.4 Typography tokens

```css
:root {
  --font-display: "Plus Jakarta Sans", "Segoe UI", system-ui, sans-serif;
  --font-ui:      "Geist", "Plus Jakarta Sans", system-ui, sans-serif;
  --font-mono:    "Geist Mono", "JetBrains Mono", ui-monospace, monospace;

  --weight-regular: 400;
  --weight-medium:  500;
  --weight-semibold:600;
  --weight-bold:    700;
}
```

**Why these:** the reference pairs a geometric display face for marketing headlines with a compact neo-grotesk for interface text. Plus Jakarta Sans supplies the geometric headline character; Geist supplies a tight, tabular-friendly UI face. Both are open-licensed.

`RULE:` `--font-display` is used **only** for marketing headlines and stat numbers ≥28px. All console text uses `--font-ui`.
`RULE:` Every numeral in a metric, table cell, chart label, or currency uses `font-variant-numeric: tabular-nums`.

### 2.5 Type scale

| Token | Size / line-height | Weight | Tracking | Use |
|---|---|---|---|---|
| `display-1` | 64 / 68 | 700 | −0.03em | Marketing hero H1 |
| `display-2` | 52 / 58 | 700 | −0.025em | Marketing section H1 |
| `display-3` | 40 / 46 | 700 | −0.02em | Marketing H2 |
| `heading-1` | 28 / 34 | 600 | −0.015em | Rare; empty-state hero |
| `heading-2` | 22 / 28 | 600 | −0.012em | Page title (`Pipeline Board`) |
| `heading-3` | 17 / 24 | 600 | −0.008em | Card title (`AI Insights`) |
| `heading-4` | 15 / 22 | 600 | 0 | Sub-card / group title |
| `body-lg` | 16 / 26 | 400 | 0 | Marketing body |
| `body` | 14 / 21 | 400 | 0 | Console default |
| `body-sm` | 13 / 19 | 400 | 0 | Table cells, dense lists |
| `label` | 13 / 18 | 500 | 0 | Form labels, buttons, tabs |
| `label-sm` | 12 / 16 | 500 | 0 | Pills, chips, secondary buttons |
| `caption` | 11.5 / 16 | 400 | 0.005em | Timestamps, basis lines, axes |
| `overline` | 11.5 / 14 | 600 | 0.14em, uppercase | Section eyebrows (`SOLUTION`) |
| `metric-lg` | 30 / 34 | 700 | −0.02em | Hero KPI (`$248,500`) |
| `metric` | 22 / 26 | 700 | −0.015em | Card KPI |
| `metric-sm` | 17 / 22 | 600 | −0.01em | Inline stat, table total |
| `mono-sm` | 12.5 / 18 | 400 | 0 | IDs, tokens, keys |

`RULE:` Minimum rendered size anywhere in the console is **11.5px**, and 11.5px is reserved for non-essential meta. Never smaller.

### 2.6 Spacing scale (4px base)

```
--space-0:0  --space-1:4   --space-2:8   --space-3:12  --space-4:16
--space-5:20 --space-6:24  --space-7:32  --space-8:40  --space-9:48
--space-10:64 --space-11:80 --space-12:120
```

Console composition constants:
- Card outer padding: `20px` (compact) / `24px` (default)
- Card inner block gap: `16px`
- Gap between cards in a dashboard grid: `16px`
- Page gutter: `24px`; page top padding: `20px`
- Label → control gap: `6px`
- Icon → text gap: `8px` (buttons, nav, list rows)
- Pill/chip row gap: `8px`

Marketing rhythm: section padding `120px` top/bottom (desktop), `80px` (tablet), `56px` (mobile); headline → subhead `24px`; subhead → content `48px`.

### 2.7 Radius

```
--radius-xs:  4px   /* checkbox, tiny swatch */
--radius-sm:  6px   /* pills, badges, chips, small tags */
--radius-md:  8px   /* buttons, inputs, selects, nav items */
--radius-lg:  10px  /* tinted icon squares, inner cards, menus */
--radius-xl:  12px  /* cards, tables, modals */
--radius-2xl: 16px  /* marketing feature panels, mock frames */
--radius-full:9999px/* avatars, toggles, progress, status dots */
```

`RULE:` Never nest equal radii. An inner element inside a `--radius-xl` card uses `--radius-lg` or smaller.

### 2.8 Elevation

Shadows are cool-tinted and shallow. Cards are defined by **border**, not shadow.

```css
--shadow-none: none;
--shadow-xs:  0 1px 2px rgba(15,23,41,0.04);
--shadow-sm:  0 1px 3px rgba(15,23,41,0.06), 0 1px 2px rgba(15,23,41,0.04);
--shadow-md:  0 4px 12px rgba(15,23,41,0.08), 0 1px 3px rgba(15,23,41,0.04);
--shadow-lg:  0 12px 28px rgba(15,23,41,0.10), 0 2px 6px rgba(15,23,41,0.05);
--shadow-xl:  0 24px 56px rgba(15,23,41,0.14), 0 4px 12px rgba(15,23,41,0.06);
--shadow-focus:0 0 0 3px rgba(37,99,235,0.18);
--shadow-focus-danger:0 0 0 3px rgba(220,38,38,0.18);
```

Elevation assignment:

| Level | Shadow | Applies to |
|---|---|---|
| 0 | none | Canvas, table rows, inline cards |
| 1 | `xs` | Cards on canvas (border does the work) |
| 2 | `sm` | Hovered card, sticky table header, dragged row shadow start |
| 3 | `md` | Dropdowns, popovers, tooltips, command palette |
| 4 | `lg` | Drawers, floating assistant panel, dragged card |
| 5 | `xl` | Modals |

In dark theme, replace shadow with `--border-strong` + `--bg-surface-raised`; shadows read as noise on dark canvases.

### 2.9 Motion

```css
--dur-instant:80ms; --dur-fast:120ms; --dur-base:180ms; --dur-slow:240ms; --dur-slower:320ms;
--ease-out:  cubic-bezier(0.16, 0.84, 0.44, 1);
--ease-in-out:cubic-bezier(0.45, 0, 0.35, 1);
--ease-spring:cubic-bezier(0.22, 1.2, 0.36, 1);  /* toggles/checks only */
```

| Interaction | Duration | Ease | Properties |
|---|---|---|---|
| Hover / focus | `fast` | `out` | background, border-color, color |
| Button press | `instant` | `out` | `transform: scale(0.985)` |
| Dropdown / popover in | `base` | `out` | opacity 0→1, translateY −4→0 |
| Dropdown out | `fast` | `in-out` | opacity 1→0 |
| Modal in | `slow` | `out` | opacity + scale 0.98→1; scrim `base` |
| Drawer in | `slow` | `out` | translateX 100%→0 |
| Toast in | `base` | `spring` | translateY 8→0 + opacity |
| Toggle knob | `base` | `spring` | translateX |
| Accordion | `base` | `in-out` | grid-template-rows / height |
| Chart draw-in | `slower` | `out` | path length or bar scaleY, once on mount |
| Skeleton shimmer | 1400ms loop | linear | background-position |
| Tab indicator | `base` | `out` | transform/width |

`RULE:` Respect `prefers-reduced-motion: reduce` — drop all transforms and chart draw-ins, keep opacity ≤80ms.
`RULE:` Never animate `box-shadow` on hover for lists or table rows; animate background only (repaint cost).

### 2.10 Z-index

```
--z-base:0 --z-sticky:100 --z-dropdown:200 --z-tooltip:300
--z-drawer:400 --z-modal:500 --z-toast:600 --z-palette:700
```

### 2.11 Breakpoints & layout grid

```
sm 480  md 768  lg 1024  xl 1280  2xl 1536  3xl 1920
```

- **Console** — fixed sidebar `248px` (collapsed `68px`); content max-width `none` (fills, gutter `24px`); dashboard grid 12 columns, gap `16px`. KPI strip: 4 columns ≥1280, 2 columns 768–1279, 1 column <768.
- **Marketing** — content max-width `1280px`, gutter `24px`/`40px`, 12-column grid, gap `24px`.
- Below `1024px` the console sidebar becomes an off-canvas drawer; below `768px` data tables convert to stacked cards (§12.6).

---

## 3. Iconography — full specification

The reference uses a single-weight, geometric, **stroke** icon set with a warm-neutral outline personality. Adopt **Lucide** as the base library; it matches the geometry and covers every glyph needed.

### 3.1 Rules

```
Library:        Lucide (single dependency)
Style:          outline only — never filled, never duotone, never mixed sets
Stroke width:   1.5px at 16–20px · 1.75px at 24px · 2px at ≥32px
Linecap/join:   round / round
Grid:           24×24 source, 2px live-area padding
Color:          inherits currentColor. Never hardcode an icon color.
Optical size:   set width AND height explicitly; never scale via transform
```

| Size | Where |
|---|---|
| `14px` | Inside pills, chips, breadcrumb separators, table meta |
| `16px` | Default: buttons, inputs, table cells, list rows, dropdown items |
| `18px` | Sidebar nav, page-header actions, card-header actions |
| `20px` | KPI card leading icon, tab icons, empty-state inline |
| `24px` | Tinted feature squares, section headers |
| `32–40px` | Marketing feature squares, empty-state hero |

`RULE:` Icon-only controls must have `aria-label` and a tooltip. Minimum hit area 32×32 (console) / 44×44 (touch), regardless of glyph size.
`RULE:` Never use an icon as the sole carrier of status — pair with text or a labeled pill.
`RULE:` No emoji anywhere in product UI, ever. Not in copy, not in empty states, not in notifications.

### 3.2 Tinted icon container (the system's signature element)

A rounded square with a subtle tinted background and a stroke icon in the matching strong tone. Used for feature cards, KPI leading icons, empty states, and category rows.

```
Sizes:  28px (radius 8, icon 14) · 36px (radius 10, icon 18)
        44px (radius 12, icon 20) · 56px (radius 14, icon 24) · 72px (radius 16, icon 32)
Background: {tone}-subtle      Icon color: {tone} strong
Border:     none in console; 1px {tone}-border on marketing panels
```

Tone assignment is **semantic, not decorative**:

| Tone | Meaning | Example glyphs |
|---|---|---|
| Primary (blue) | Data, records, pipeline, reporting | `database`, `bar-chart-3`, `layout-dashboard`, `table` |
| Intel (violet) | Machine-generated / assisted | `sparkles`, `brain`, `wand-2`, `target` |
| Success (green) | Growth, wins, conversion, secure | `trending-up`, `check-circle-2`, `shield-check`, `users` |
| Warning (amber) | Revenue, currency, attention | `dollar-sign`, `bell`, `clock`, `receipt` |
| Risk (orange) | Speed, urgency, quick actions | `zap`, `flame`, `timer` |
| Neutral | Settings, files, generic | `settings`, `file-text`, `folder` |

`RULE:` A screen may show at most **four** tones of tinted squares. More than four reads as a toy.

### 3.3 Canonical glyph map

Keep this table authoritative; do not pick synonyms per screen.

**Navigation**
`layout-dashboard` Dashboard · `users` Leads/Contacts · `kanban` Pipeline · `list-checks` Tasks · `bar-chart-3` Analytics · `clock` Reports · `users-round` Team · `plug` Integrations · `settings` Settings · `life-buoy` Help & Support · `bell` Notifications

**Actions**
`plus` Add/Create · `pencil` Edit · `pen-square` Compose/draft (long-form content, distinct from row Edit) · `trash-2` Delete · `copy` Duplicate · `download` Export · `upload` Import · `share-2` Share · `play` Run · `pause` Pause a running campaign/process · `rotate-ccw` Reset · `refresh-cw` Sync · `check` Confirm · `x` Dismiss · `archive` Archive · `more-horizontal` Row overflow · `more-vertical` Card overflow · `external-link` Opens new context · `chevron-right` Drill-in · `chevron-left` Backward paging (calendar/carousel prev) · `arrow-right` Forward/link-out in copy · `arrow-left` Back navigation

**Filtering & search**
`search` Search · `filter` Filters · `arrow-up-down` Sort · `calendar` Date range · `sliders-horizontal` Advanced/Columns · `layout-grid` Grid view · `list` List view

**Communication**
`mail` Email · `phone` Call · `phone-call` Active/answered call · `phone-outgoing` Outbound call placed · `message-square` Message/Notes · `calendar-clock` Schedule · `send` Send · `file-text` Document/Proposal · `sticky-note` Note · `paperclip` Attachment

**Records & entities**
`building-2` Company · `user` Person · `map-pin` Location · `globe` Website · `link` URL · `tag` Segment · `tags` Multiple tags/tag group · `id-card` Profile · `briefcase` Deal · `linkedin` LinkedIn profile/company link · `instagram` Instagram platform · `youtube` YouTube platform · `image` Static image/photo content · `video` Video content

**Metrics & analytics**
`dollar-sign` Value/Revenue · `percent` Rate · `target` Goal/Quota · `trending-up` Positive trend · `trending-down` Negative trend · `activity` Activity volume · `pie-chart` Distribution · `gauge` Health/Score · `line-chart` Trend

**Intelligence**
`sparkles` Assisted default · `brain` Insight/model · `wand-2` Generate · `lightbulb` Recommendation · `crosshair` Scoring · `zap` Automation · `bot` AI agent/persona entity (the calling agent itself, distinct from `sparkles`' generic "AI touched this" marker)

**Status & feedback**
`check-circle-2` Success · `alert-triangle` Warning · `alert-circle` Error · `info` Info · `circle-dashed` Pending · `loader-2` Loading (spin) · `shield-check` Secure · `lock` Auth · `eye` / `eye-off` Visibility

**Time**
`clock` Time/Recency · `history` Activity log · `calendar-days` Date · `timer` Duration/SLA · `calendar-range` Event type / schedule · `calendar-check` Confirmed booking

`RULE:` `trending-up` in green means good; in a churn/loss metric a rising line is bad — use `trending-up` with `--color-danger`, never a downward glyph. Direction = data, color = judgment.

### 3.4 Logotypes and third-party marks

Integration tiles show the vendor's real full-color mark at 20–24px inside a 36–40px white square with `--border-default`. Never recolor, never outline, never place a vendor mark in a tinted square.

### 3.5 Illustration

Illustration is limited to empty states and onboarding side panels. Style: flat geometric shapes, 3-color max drawn from blue + violet + one neutral, thin stroke accents, no gradients, no characters, no drop shadows. Max one illustration per screen. If you don't have one, use a 56px tinted icon square instead — never a stock illustration.

---

## 4. Core patterns

### 4.1 The card

The atomic container of the console.

```
Background: --bg-surface
Border:     1px solid --border-default
Radius:     --radius-xl (12px)
Shadow:     --shadow-xs
Padding:    20px (compact) / 24px (default)
Header:     heading-3 title + optional caption subtitle; right-aligned action
            (text link `label-sm` in --text-link, or icon button)
Header gap: title block → body 16px
Divider:    1px solid --border-subtle, full-bleed (negative margin to card edge)
```

Hover only if the whole card is a link: `border-color: --border-strong`, `shadow: --shadow-sm`, `120ms`.

### 4.2 The metric (KPI) block

Anatomy, top to bottom:
1. Row: 36px tinted icon square + `caption` label in `--text-secondary` (label left of or above value)
2. Value in `metric` / `metric-lg`, `--text-primary`, tabular numerals
3. Delta row: `trending-up|down` at 14px + `caption` — `--color-success` for favorable, `--color-danger` for unfavorable, `--text-tertiary` for flat, always followed by the comparison window (`vs last month`)
4. Basis line: `caption` in `--text-tertiary` (`64 active opportunities`)
5. Optional inline sparkline, 56–72px wide × 28px tall, `--chart-1`, no axes, no dots

`RULE:` Favorability is a property of the metric, not the arrow direction. Declare `higherIsBetter` per metric.

### 4.3 Status vocabulary

| Status | Tone | Label examples |
|---|---|---|
| Positive / closed-won | success | `Won`, `Qualified`, `Connected`, `Active`, `Success`, `Opened` |
| In progress | primary | `In Progress`, `Proposal Sent`, `Negotiation`, `Syncing` |
| Attention / medium | warning | `Medium`, `Pending`, `Needs Review`, `Due Soon` |
| At risk | risk | `At Risk`, `High Priority`, `Stalled`, `Overdue` |
| Failure / closed-lost | danger | `Lost`, `Failed`, `Error`, `Disconnected` |
| Inert | neutral | `New`, `Draft`, `Archived`, `Not connected`, `Low` |

`RULE:` Copy is sentence-case, one or two words. Never uppercase-shout a status.

### 4.4 Empty, loading, error triad

Every data surface ships all three states before it ships.

- **Empty (no data yet):** 56px tinted icon square, `heading-4` title stating the object (`No reports yet`), `body-sm` `--text-secondary` one-line explanation, one primary button. Vertically centered, max-width 360px.
- **Empty (filtered to zero):** 44px `search-x` square, `No results for "{query}"`, secondary button `Clear filters`. Never show the create-CTA here.
- **Loading:** skeletons matching final geometry — text bars at 13/14px height and 60–90% width, `--bg-active`, radius `--radius-sm`, shimmer 1400ms. Never a centered spinner for a full page. Spinners (`loader-2`, 16px, 700ms linear) only inside buttons and inline refreshes.
- **Error:** inline card, `alert-circle` in `--color-danger`, `heading-4` plain-language cause, `body-sm` next step, `Try again` secondary button. Never expose a stack trace or raw status code in the primary message; put the code in a `mono-sm` disclosure line.

### 4.5 Intelligence containers

Assisted content is always visually fenced.

```
Border:     1px solid --color-intel-border
Background: --bg-surface, with a --color-intel-subtle header band (or full tint for short blocks)
Radius:     --radius-xl
Header:     `sparkles` 16px in --color-intel + heading-4 title
            + confidence pill on the right (label-sm)
Body:       insight rows — each row = 1 leading tone icon + bolded finding (label)
            + `body-sm` supporting reason + right-aligned action buttons
Footer:     text link `View full analysis` with `chevron-right`
```

Confidence pill: `High confidence` (success), `Medium confidence` (warning), `Low confidence` (neutral). Never show a bare percentage without a word.

`RULE:` Every assisted block names its inputs (`Signals: pricing page visits, 3 email opens`) and offers at least one explicit human action. No silent writes.

### 4.6 Score display

Circular gauge: 96–120px diameter, 8px track in `--bg-active`, progress arc in the tone matching the band, value in `metric` centered with `/100` in `caption --text-tertiary`. Bands: 80–100 success, 60–79 primary, 40–59 warning, 0–39 danger. Always accompanied by a labeled band word (`High confidence`) and a 3–4 item bulleted evidence list with 14px `check` icons.

---

## 5. Focus, states, accessibility

### 5.1 Interaction states — required for every interactive component

`default → hover → active/pressed → focus-visible → selected → disabled → loading → error`

```css
:focus-visible {
  outline: 2px solid var(--border-focus);
  outline-offset: 2px;
  border-radius: inherit;
}
```

Inside inputs and on filled buttons use `--shadow-focus` (3px ring) instead of an outline so the ring reads against the fill.

`RULE:` Never `outline: none` without an equivalent visible replacement. Focus must survive keyboard navigation on every control including table rows, tabs, and cards-as-links.

Disabled: `opacity` is banned for disabled state (it degrades text contrast). Use `--bg-disabled` + `--text-disabled` + `cursor: not-allowed`, and keep the element focusable with `aria-disabled` when it needs an explanatory tooltip.

### 5.2 Contrast

- Body and label text: ≥ 4.5:1. `--text-tertiary` on `--bg-surface` is 4.6:1 — do not use it on `--bg-canvas` for anything essential.
- Large text (≥19px semibold): ≥ 3:1.
- UI borders and chart strokes: ≥ 3:1 against adjacent fill.
- Status must never be conveyed by hue alone: pills carry text, charts carry direct labels or patterns, required fields carry an asterisk plus `aria-required`.

### 5.3 Semantics checklist

- One `h1` per page (the page title). Card titles are `h2`/`h3` in order.
- Tables use real `<table>` with `<th scope>`; sortable headers are `<button>` with `aria-sort`.
- Modals: `role="dialog" aria-modal="true"`, focus trapped, focus returned to invoker, `Esc` closes.
- Toasts: `role="status"` (polite) or `role="alert"` for errors.
- Live-updating metrics: `aria-live="polite"` on the value only, never the whole card.
- Icon buttons: `aria-label`. Decorative icons: `aria-hidden="true"`.
- Drag-and-drop (pipeline) must have a keyboard equivalent: `Space` to lift, arrows to move, `Space` to drop, plus a `Move to stage…` menu item on every card.
- Charts: `role="img"` with an `aria-label` summarizing the trend, plus a screen-reader-only data table.
- Target sizes: 32×32 minimum pointer, 44×44 minimum touch.

---

## 6. Buttons

### 6.1 Variants

| Variant | Background | Text | Border | Use |
|---|---|---|---|---|
| `primary` | `--color-primary` | `--color-on-primary` | none | The single main action |
| `secondary` | `--bg-surface` | `--text-primary` | 1px `--border-default` | Common alternates |
| `tertiary` / ghost | transparent | `--text-secondary` | none | Toolbars, card headers, low-stakes |
| `subtle` | `--color-primary-subtle` | `--color-primary` | none | Primary-adjacent inline action |
| `intel` | `--color-intel` | white | none | Generate/assist actions |
| `intel-subtle` | `--color-intel-subtle` | `--color-intel` | 1px `--color-intel-border` | Inline assisted action inside intel cards |
| `danger` | `--color-danger` | white | none | Destructive confirmation |
| `danger-subtle` | `--color-danger-subtle` | `--color-danger-text` | 1px `--color-danger-border` | Destructive trigger before confirm |
| `link` | none | `--text-link` | none | Inline navigation |

State deltas: hover = one step darker fill (or `--bg-hover` for secondary/ghost); active = `scale(0.985)` + next step darker; focus = ring; loading = `loader-2` replaces the leading icon, label persists, width locked.

### 6.2 Sizes

| Size | Height | Padding X | Type | Icon | Radius | Use |
|---|---|---|---|---|---|---|
| `xs` | 26px | 8px | `label-sm` | 14px | 6px | Inside table rows, deal cards |
| `sm` | 32px | 12px | `label-sm` | 14px | 8px | Toolbars, card headers, filters |
| `md` | 38px | 14px | `label` | 16px | 8px | Console default |
| `lg` | 44px | 18px | `label` 14px | 16px | 8px | Forms, modal footers, onboarding |
| `xl` | 52px | 24px | 15px/600 | 18px | 10px | Marketing CTA |

Icon-only buttons are square at the same heights, radius `--radius-md`.

`RULE:` Leading icon for creative/destructive actions (`plus`, `trash-2`); trailing icon only for direction or disclosure (`chevron-down`, `arrow-right`, `external-link`). Never both.
`RULE:` Button labels are verb-first and ≤3 words: `Add Lead`, `Run Report`, `Send invite`, `Save changes`. Never `Submit`, `OK`, or `Click here`.
`RULE:` Destructive actions require a confirm dialog naming the object and the consequence. Type-to-confirm only for irreversible bulk deletes.

### 6.3 Button group / split button

Segmented row sharing one border, 1px `--border-default` dividers, outer radius `--radius-md`, inner corners square. Split button: primary label + 32px chevron section separated by `rgba(255,255,255,0.24)`.

---

## 7. Form controls

### 7.1 Text input

```
Height:  38px (md) · 34px (sm) · 44px (lg)
Padding: 10px 12px; +32px left when a leading icon is present
Border:  1px --border-default → hover --border-strong → focus --border-focus + --shadow-focus
Radius:  --radius-md
Type:    body (14px); placeholder --text-tertiary
Label:   `label` --text-primary, 6px above; optional `(optional)` in --text-tertiary
Help:    caption --text-tertiary, 6px below
Error:   border --color-danger + --shadow-focus-danger; message caption --color-danger-text
         with a 14px `alert-circle`; help text is replaced, not stacked
Disabled:--bg-disabled, --text-disabled, border --border-subtle
Read-only:--bg-surface-sunken, normal text, no border change
```

Affix slots: leading icon (16px, `--text-tertiary`), trailing unit or action (`eye-off` for passwords, `x` to clear, `%`/`USD` as `caption`). Character counters bottom-right in `caption`, turning `--color-danger` at 100%.

### 7.2 Textarea
Min-height 96px, same borders, `resize: vertical`, 12px padding, 1.6 line-height.

### 7.3 Select / dropdown
Trigger identical to input + trailing `chevron-down` 16px `--text-tertiary`, rotating 180° in `--dur-fast` when open. Menu: `--bg-surface-raised`, `--shadow-md`, radius `--radius-lg`, 4px padding, item height 34px, item radius `--radius-md`, hover `--bg-hover`, selected `--bg-selected` + `check` 16px right, group headers in `overline --text-tertiary` with 8px top padding. Max-height 320px then scroll. Type-ahead required; searchable variant when >8 options.

### 7.4 Multi-select and token input
Selected values render as chips (§9.2) inside the control, 6px gap, each with a 12px `x`. Input grows to a max of 3 rows, then scrolls. Backspace removes the last chip.

### 7.5 Checkbox
16×16, radius `--radius-xs`, border 1.5px `--border-strong`; checked = `--color-primary` fill + white `check` at 1.75px stroke, `spring` 180ms; indeterminate = 2px white bar. Label `body-sm`, 8px gap, whole row clickable, hit area ≥32px tall.

### 7.6 Radio
16×16 circle, 1.5px border; checked = 2px `--color-primary` ring + 6px center dot. Card-radio variant (used in onboarding goal pickers): full card with `--border-default` → selected `--color-primary-border` + `--bg-selected` + 18px `check-circle-2` badge top-right.

### 7.7 Toggle (switch)
Track 40×22, radius full, off `--border-strong`, on `--color-primary`; knob 18px white circle with `--shadow-xs`, 2px inset, `spring` 180ms. Label to the left, `label` weight, with `caption --text-secondary` description beneath. Used only for immediate-effect settings — never inside a form that has a Save button.

### 7.8 Segmented control
Container `--bg-active` (or `--bg-surface-sunken`), radius `--radius-md`, 3px padding; segment height 28px, `label-sm`; selected segment `--bg-surface` + `--shadow-xs` + `--text-primary`; unselected `--text-secondary`. Indicator slides `--dur-base --ease-out`. 2–4 segments only (`Revenue | Pipeline | Won deals`, `7D | 30D | 90D`).

### 7.9 Slider
Track 4px `--bg-active`, filled `--color-primary`, thumb 16px white with 2px `--color-primary` border and `--shadow-sm`. Value shown as a live `label-sm` above the thumb.

### 7.10 Form layout & validation
- Single column at ≤560px width; two columns only for genuinely paired fields (First/Last, Start/End, Currency/Format).
- Field vertical gap `16px`; field group gap `24px`; group title `heading-4` + `caption` description.
- Sticky footer for long forms: `--bg-surface`, top border `--border-default`, right-aligned `Cancel` (secondary) + primary.
- Validate on blur, re-validate on change, never on keystroke for the first entry.
- Submit failure: summary alert at the top listing failed fields as links + inline messages; focus moves to the first invalid field.
- Errors say what to do: `Enter a work email address`, not `Invalid input`.

---

## 8. Navigation

### 8.1 Sidebar

```
Width:      248px expanded · 68px collapsed
Background: --bg-surface, right border 1px --border-default
Padding:    16px 12px
Logo zone:  56px tall, logo 22–24px, 16px bottom margin
Item:       height 38px, radius --radius-md, padding 0 10px,
            18px icon + 8px gap + `label` text
Default:    --text-secondary, transparent bg
Hover:      --bg-hover, --text-primary
Active:     --bg-selected + --color-primary text + --color-primary icon
            + 1px --color-primary-border  (no left-edge accent bar)
Item gap:   2px
Group label:overline --text-tertiary, 20px top padding, 8px bottom
Badge:      count pill right-aligned, --color-primary bg, white, label-sm, 18px min-width
Footer:     pinned bottom — Help / Support, Notifications (+badge),
            then a 1px --border-subtle divider and the user block
User block: 32px avatar + name `label` + role `caption --text-secondary`
            + `chevron-down`; opens an upward menu
```

`RULE:` Active state is a filled pill, never a left border accent stripe.
Collapsed mode: icons centered, labels become tooltips after 400ms, active pill becomes a 38×38 square.

### 8.2 Page header

Row 1: `heading-2` page title, then `body-sm --text-secondary` description on the next line; right side holds up to 4 controls in order — search input (240–320px), date-range select, `Filters` secondary button, primary action.
Row 2 (optional filter bar): pill-style filter selects (`Owner: All`, `Region: All`) at 32px height, radius `--radius-md`, 1px `--border-default`, leading 14px icon, trailing `chevron-down`; 8px gaps; `Clear all` text link when any filter is active.
Sticky: header sticks to the top with `--bg-canvas` background and `--border-default` bottom border after 8px of scroll.

Breadcrumbs (detail pages only): `caption`, `--text-tertiary` ancestors as links, `/` separators, current item `--text-primary`. Max 3 levels.

### 8.3 Tabs
Underline style: 36px height, `label` text, `--text-secondary` default → `--text-primary` active with a 2px `--color-primary` underline; container bottom border `--border-default`; 20px gap; optional count in `caption --text-tertiary`. Icons 16px, only if every tab has one.

### 8.4 Stepper (onboarding)
Horizontal: numbered 22px circles — completed `--color-primary` fill + white `check`, current `--color-primary` fill + white numeral, upcoming `--bg-active` + `--text-tertiary`; label `label-sm` (current `--text-primary`, others `--text-secondary`); 1px connector `--border-default`, completed segments `--color-primary`.
Vertical variant in a left rail mirrors the sidebar item spec plus a progress block (`1 of 5 completed`, 4px `--radius-full` bar, percentage in `caption`).

### 8.5 Command palette
Triggered by `⌘K`/`Ctrl+K`. 640px wide, top-anchored at 15vh, radius `--radius-xl`, `--shadow-xl`, scrim `--bg-overlay`. 48px search row with 18px `search`, grouped results (`Leads`, `Deals`, `Actions`, `Navigate`) using `overline` headers, 40px rows with a 16px leading icon, `label` primary text + `caption --text-tertiary` context, right-aligned `kbd` hints. Arrow keys move, `Enter` selects, `Esc` closes.
`kbd` style: `mono-sm`, `--bg-surface-sunken`, 1px `--border-default`, radius `--radius-xs`, 2px 5px padding.

### 8.6 Pagination
Right-aligned in a table footer: `Showing 1 to 7 of 26 reports` in `caption --text-tertiary`, then prev/next 28px icon buttons and numbered 28px buttons — current `--color-primary` fill + white, others ghost with `--text-secondary`. Ellipsis after 5 pages. Optional `Rows per page` select on the left.

---

## 9. Badges, pills, chips, tags

### 9.1 Status pill
Height 22px (or 20px in dense tables), padding 0 8px, radius `--radius-sm`, `label-sm` weight 500, background `{tone}-subtle`, text `{tone}-text`, no border by default. Optional 6px leading dot in `{tone}` strong. Optional 14px leading icon. Never wraps; truncation is not allowed — shorten the word instead.

### 9.2 Chip (removable filter or token)
Height 26px, 1px `--border-default`, `--bg-surface`, radius `--radius-sm`, `label-sm --text-primary`, optional 14px leading icon/avatar, trailing 12px `x` in `--text-tertiary` → `--text-primary` on hover.

### 9.3 Count badge
Min-width 18px, height 18px, radius full, `--color-primary` bg, white `label-sm` tabular, centered. Dot-only variant is 8px with a 2px `--bg-surface` ring for avatar presence.

### 9.4 Category tag
Same geometry as a status pill but tone comes from a stable hash of the category name, restricted to primary / intel / success / warning / neutral. Persist the mapping so a category keeps its color across sessions.

---

## 10. Overlays

### 10.1 Modal
Width 440 (`sm`) / 560 (`md`) / 720 (`lg`) / 960 (`xl`); radius `--radius-xl`; `--shadow-xl`; scrim `--bg-overlay` with a 2px backdrop blur; body max-height `72vh` with internal scroll and sticky header/footer.
Header: 20px 24px, `heading-3` + optional `caption` subtitle, 32px ghost `x` top-right.
Body: 24px, `body`.
Footer: 16px 24px, top border `--border-subtle`, right-aligned `Cancel` + primary; destructive modals put the danger button right and keep `Cancel` as the default focus.

### 10.2 Drawer / side sheet
Right-anchored, width 400 / 520 / 640, full height, radius 0, left border `--border-default`, `--shadow-lg`. Same header/footer specs as modal. Use for record detail and multi-step configuration where page context must stay visible.

### 10.3 Popover
280–360px, radius `--radius-lg`, `--shadow-md`, 16px padding, 8px offset from the trigger, arrow optional (8px). Contains a `heading-4` title, `body-sm` content, and at most two actions.

### 10.4 Tooltip
`--neutral-900` bg (dark theme: `--neutral-100` with `--text-inverse`), white `caption`, radius `--radius-sm`, 6px 8px padding, max-width 260px, 6px offset, 400ms open delay / 100ms close, no arrow. Description only — never interactive content, never essential information.

### 10.5 Toast
Bottom-right stack, 360px wide, `--bg-surface`, 1px `--border-default`, radius `--radius-lg`, `--shadow-lg`, 14px 16px padding. Leading 18px tone icon, `label` title + optional `body-sm` detail, optional single text-link action, 24px ghost `x`. Auto-dismiss 5s (success/info), 8s (warning), never for errors. Max 3 visible; older ones collapse into `+2 more`. A 2px bottom progress bar in the tone color shows remaining time.

### 10.6 Inline alert / banner
Full-width card inside content: `{tone}-subtle` bg, 1px `{tone}-border`, radius `--radius-lg`, 14px 16px, leading 18px tone icon, `label` title + `body-sm` body, optional right-aligned actions. Page-level system banners are full-bleed above the page header with no radius and are dismissible with persistence.

---

## 11. Data display — tables

```
Container:   card (§4.1) with 0 body padding; table fills to the rounded edges
Header row:  height 40px, --bg-surface-sunken, bottom border --border-default,
             `caption` uppercase-off, weight 500, --text-secondary
Body row:    height 48px (default) · 44px (compact) · 56px (with avatar + 2 lines)
Cell pad:    12px 16px; first/last cell 20px outer gutter
Cell type:   body-sm --text-primary; secondary line caption --text-tertiary
Row divider: 1px --border-subtle; no divider after the last row
Row hover:   --bg-hover; row actions fade from opacity 0 → 1 (120ms)
Row select:  --bg-selected + 16px checkbox in a 40px leading column
Zebra:       never
```

**Column rules**
- Order: identity → attributes → status → metrics → time → actions.
- Numeric and currency columns are right-aligned with tabular numerals; text is left-aligned; status pills left-aligned in their column.
- Identity cell: 28px avatar (or 24px logo square) + 8px gap + `body-sm` name over `caption` sub-label.
- Actions column: fixed 88–104px, right-aligned, `more-horizontal` icon button plus at most one inline text action (`Send follow-up`, `View deal`).
- Sortable headers: full-cell button, trailing 14px `arrow-up-down` at `--text-tertiary`, active sort shows `arrow-up`/`arrow-down` in `--text-primary` and sets `aria-sort`.
- Sticky first column and sticky header on horizontal/vertical scroll; sticky cells get `--bg-surface` plus a `--border-default` edge.
- Truncate with ellipsis at a defined `max-width` and expose the full value in a tooltip. Never wrap a table cell to three lines.
- Bulk selection reveals a toolbar that replaces the table header: `--color-primary-subtle` bg, `{n} selected` in `label`, then bulk actions and `Clear`.
- Below 768px, each row becomes a card: identity row, then label/value pairs stacked, then actions.

**Table footer:** 48px, top border `--border-default`, pagination right (§8.6), summary left.

---

## 12. Data display — charts

### 12.1 Shared rules
- Grid: horizontal lines only, 1px `--chart-grid`. No vertical grid, no chart borders, no 3D, no drop shadows.
- Axes: no axis lines; tick labels in `caption --chart-axis`; Y-axis abbreviates (`$250k`, `1.8M`); X-axis thins labels rather than rotating them — never rotate past 0°.
- Legend: top-right of the card header, 8px square swatches with `--radius-xs`, `caption` labels, 12px gaps. Omit for single-series charts and label the series in the card title instead.
- Tooltip: card style, `--shadow-md`, showing the category, then one row per series (swatch + label + tabular value), plus a delta row when relevant. Crosshair is a 1px dashed `--chart-reference` vertical line.
- Series order is fixed: `--chart-1` first, then 2…6. Never exceed 4 series in a console card (6 in a full-page analytics view); beyond that, aggregate and offer a breakdown table.
- Reference lines (targets, team averages) are 1px dashed `--chart-reference` with an inline `caption` label (`Team Average: $306K`).
- Every chart card carries a metric summary row beneath it (`Forecast accuracy 87% ↑5%`) so the chart is never the only quantitative source.
- Empty chart: axes drawn, centered `caption --text-tertiary` `No data for this period`.

### 12.2 Line / area (trend over time)
2px stroke `--chart-1`, round joins, no point markers except the hovered point (4px fill + 2px white ring) and annotated peaks. Area fill = `--chart-area-from` → `--chart-area-to` vertical gradient, single series only. Multi-series lines carry no fill. Annotation callout: `--bg-surface` chip with `--border-default`, `caption` date over `metric-sm` value, connected by a 1px dashed line.

### 12.3 Bar / column
Bars `--chart-1`, radius 4px top corners only, category gap 40% of band width, max bar width 48px. Grouped bars 4px apart within a group. Stacked bars use series colors in fixed order with 2px white separators and show the total above the stack. Horizontal bars for ranked categories longer than 12 characters.

### 12.4 Donut / gauge
Donut: 8–12px ring thickness, 2px gaps between segments, center holds `metric` value + `caption` label; legend on the right as rows of swatch + label + right-aligned tabular percentage. Max 6 segments; remainder becomes `Other` in `--neutral-300`. Gauge (score): 240° arc, 8px track, tone by band (§4.6).

### 12.5 Sparkline
28–36px tall, no axes, no grid, 1.5px stroke, single color; positive trends may use `--chart-positive`. Optional 3px terminal dot. Never interactive.

### 12.6 Progress & workload bars
Track 8px, radius full, `--bg-active`; segments in series colors with 2px `--bg-surface` gaps; value labels inside segments in white `caption` when the segment exceeds 32px, otherwise omitted; total right-aligned in `metric-sm`.

---

## 13. Kanban / pipeline board

```
Column:      280–300px wide, --bg-surface-sunken, radius --radius-xl,
             1px --border-default, 8px padding, gap 12px between columns
Column head: 8px status dot + `label` stage name + count in `caption --text-tertiary`
             + right-aligned total in `label-sm --text-primary` tabular
             + `more-vertical` icon button; 1px --border-subtle beneath
Card:        --bg-surface, 1px --border-default, radius --radius-lg,
             12px padding, --shadow-xs, 8px vertical gap
Card body:   row 1 — 18px company logo square + `label` name, right `grip-vertical`
                     (visible on hover only)
             row 2 — value in `metric-sm` tabular
             row 3 — 20px owner avatar + `caption` owner name
             row 4 — 14px activity icon + `caption --text-secondary` last activity
             row 5 — risk pill (§9.1)
             row 6 — 1px --border-subtle divider, then a 3-icon quick-action row
                     (`mail`, `phone`, `file-text`) as 26px ghost icon buttons
Footer:      full-width ghost `+ Add deal`, 34px, `label-sm --text-secondary`,
             dashed 1px --border-default top edge
Drag:        source card drops to 40% opacity; drop target column gets
             --bg-selected + 1px dashed --color-primary-border;
             dragged card gets --shadow-lg and 2° rotation, cursor grabbing
Scroll:      board scrolls horizontally; column headers stick vertically
```

`RULE:` Provide the keyboard drag alternative from §5.3 and a `Move to stage…` overflow item on every card.

---

## 14. Record detail layout

Three-zone layout for entity pages (lead, deal, company, member):

- **Header band** (`--bg-surface`, bottom `--border-default`): 48px avatar, `heading-2` name + status pill inline, `body-sm --text-secondary` role/company line with the company as a link; right side holds up to three secondary actions plus one primary (`Edit`) and a `more-vertical` overflow.
- **Left column (320–360px):** stacked cards — Profile (label/value rows), Company info, Quick actions.
  Label/value row: `caption --text-secondary` label with a 14px leading icon, right-aligned `body-sm --text-primary` value, 10px vertical padding, 1px `--border-subtle` dividers, links in `--text-link`.
- **Center column (fluid):** Activity timeline, Notes, Emails, Tasks.
  Timeline row: 28px tinted icon square, `body-sm` title, `caption --text-tertiary` detail beneath, right-aligned `caption` timestamp; 1px `--border-subtle` dividers; grouped by day with `overline` day headers. No connecting vertical line unless the sequence is causal.
- **Right column (300–340px):** Score card (§4.6), Recommended next action (§4.5), Deal details, Associated contacts.

Stacks to a single column below 1280px in the order center → left → right.

---

## 15. Dashboard composition

Fixed reading order, top to bottom:
1. Page header + filter bar (§8.2)
2. KPI strip — 4 metric cards (§4.2)
3. Intelligence row — insights card (2/3 width) + today's priorities list (1/3)
4. Trend row — primary chart card (2/3) + risk list (1/3)
5. Detail row — attention table (2/3) + recent activity feed (1/3)

`RULE:` Maximum 6 cards above the fold at 1440×900. Anything else moves to a dedicated page.
`RULE:` Every card header exposes exactly one escape hatch text link (`View all`, `View all leads`) to its full page.

Activity feed row: 8px tone dot, `body-sm` sentence with the entity name in weight 500, right-aligned `caption --text-tertiary` timestamp, 10px vertical padding, dividers `--border-subtle`.

---

## 16. Marketing / case-study surfaces

- **Section eyebrow:** `overline` in `--color-intel`, with a 28px × 2px `--color-intel` underline 8px beneath.
- **Headline:** `display-2`/`display-3` in `--text-primary`, with the emphasis clause in `--color-intel` (or `--color-primary` for product-value claims). Exactly one colored clause per headline.
- **Subhead:** `body-lg --text-secondary`, max-width 62ch.
- **Feature grid:** 2×N with 1px `--border-subtle` dividers between cells (not cards), each cell = 44px tinted icon square + `heading-4` title + `body-sm --text-secondary`, 24px cell padding.
- **Feature card variant:** `--bg-surface`, 1px `--border-default`, radius `--radius-2xl`, 24px padding, `--shadow-xs`, 36px tinted square.
- **Checklist:** 16px `check-circle-2` in `--color-success` + `body` text, 12px row gap.
- **Numbered feature block:** 40px `--bg-selected` square with `--color-primary` numeral in `heading-4`, then title `heading-3` + body + checklist.
- **Outcome strip:** full-width `--bg-surface` panel, radius `--radius-2xl`, 3–4 columns separated by 1px `--border-subtle` verticals, each with a 44px tinted square + `heading-4` + `body-sm`.
- **Backgrounds:** `--bg-canvas` or `--neutral-0` only. One page may carry at most one very soft radial tint (`--violet-50` at ≤40% opacity, ≥600px radius, top or bottom corner) and thin 1px outlined circles as sparse geometry. No mesh gradients, no glow, no blobs.
- **Product imagery:** real UI screenshots in a browser/window frame — radius `--radius-2xl`, 1px `--border-default`, `--shadow-lg`, optional 6–10° perspective on decorative overlaps. Layered mock stacks are allowed only in hero collages, capped at 4 layers.

---

## 17. Integration & connection patterns

Integration tile: `--bg-surface`, 1px `--border-default`, radius `--radius-lg`, 16px padding. 36px white logo square (1px `--border-default`) + `label` vendor name + status pill beneath; body `caption --text-secondary` describing what syncs; right side `Connect` (subtle) or `Manage`/`Configure` (secondary) plus `more-horizontal`.
Sync activity row: 20px vendor logo, `body-sm` event, `caption --text-tertiary` detail, right-aligned relative time + `Success`/`Failed` pill.
Health metrics use the KPI block with `activity` (success tone) and `alert-triangle` (danger tone) icons.
Connection states: `Connected` (success), `Active` (success), `Syncing` (primary + spinning `refresh-cw`), `Not connected` (neutral), `Failed` (danger + `View logs` link).

---

## 18. Notifications & activity

Notification item: 32px tinted icon square by category, `body-sm` title (unread = weight 500 + a 6px `--color-primary` dot at the left gutter), `caption --text-tertiary` body and timestamp, hover `--bg-hover`, dividers `--border-subtle`. Panel: 400px popover, sticky header with `heading-4` + `Mark all read` link, tabs for `All`/`Unread`, empty state per §4.4, `View all notifications` footer link.

---

## 19. Copy & voice

**Voice:** direct, specific, operator-to-operator. Confident but never hyped.

- Sentence case for everything: buttons, labels, menu items, table headers, toasts. Title Case only for product/page names.
- No exclamation marks. No "Oops", "Uh oh", "Whoops", "Awesome", "Magic", "Unlock the power of", "Supercharge", "Seamlessly", "Revolutionary", "Effortlessly", "game-changing".
- Second person for instructions (`Connect your tools`), first person plural only for commitments (`We'll email you when the export is ready`).
- Numbers: thousands separators always; currency with the symbol and no decimals above $1,000 (`$248,500`); percentages to one decimal (`28.6%`); deltas signed with a comparison window (`↑12.4% vs last month`).
- Dates: `May 15, 2026` in tables and `9:30 AM` for times; relative time under 24h (`2h ago`, `Just now`), absolute after.
- Empty states name the object and the first step: `No reports yet — build your first report to track pipeline performance.`
- Errors: cause + fix, no blame, no jargon. `We couldn't reach Salesforce. Check the connection and try again.`
- Assisted output is hedged and sourced: `This lead shows strong buying intent based on 3 email opens and 2 pricing-page visits.` Never `We think you'll love…`.
- Truncate labels by shortening the words, not by relying on ellipsis.

---

## 20. Naming conventions (for implementation)

```
Components:  PascalCase                  MetricCard, StatusPill, InsightRow
Props:       camelCase                   variant, size, tone, isLoading, higherIsBetter
Variants:    primary secondary tertiary subtle intel danger link
Sizes:       xs sm md lg xl
Tones:       primary intel success warning risk danger neutral
Booleans:    is* / has* / can*           isDisabled, hasIcon, canReorder
Handlers:    on* (prop) / handle* (impl) onSelect / handleSelect
CSS vars:    --{category}-{role}-{modifier}
Data attrs:  data-state="open|closed|selected|loading"
Test ids:    data-testid="metric-card-pipeline-value"
Files:       ComponentName/index.tsx + ComponentName.types.ts
```

`RULE:` A component takes `tone`, not a color. It takes `size`, not a height. It never accepts a `className` that overrides color, spacing, or radius.

---

## 21. Tailwind v4 theme block

```css
@import "tailwindcss";

@theme {
  --font-display: "Plus Jakarta Sans", system-ui, sans-serif;
  --font-sans:    "Geist", "Plus Jakarta Sans", system-ui, sans-serif;
  --font-mono:    "Geist Mono", ui-monospace, monospace;

  --color-canvas:        #F6F7FB;
  --color-surface:       #FFFFFF;
  --color-surface-sunken:#FBFCFD;
  --color-hover:         #F6F7FB;
  --color-active:        #EEF0F6;
  --color-selected:      #EFF4FF;

  --color-fg:            #0F1729;
  --color-fg-secondary:  #5A6478;
  --color-fg-tertiary:   #8A93A6;

  --color-line-subtle:   #EEF0F6;
  --color-line:          #E4E7EF;
  --color-line-strong:   #CFD4E1;

  --color-primary:        #2563EB;
  --color-primary-hover:  #1D4ED8;
  --color-primary-subtle: #EFF4FF;
  --color-intel:          #6C4FE0;
  --color-intel-subtle:   #F3F0FE;
  --color-success:        #12A150;
  --color-success-subtle: #E9F8EF;
  --color-warning:        #E08600;
  --color-warning-subtle: #FEF6E7;
  --color-risk:           #E4661F;
  --color-risk-subtle:    #FEF1E8;
  --color-danger:         #DC2626;
  --color-danger-subtle:  #FDECEC;

  --color-chart-1:#2563EB; --color-chart-2:#7C5CF7; --color-chart-3:#12A150;
  --color-chart-4:#F5803E; --color-chart-5:#10A5A5; --color-chart-6:#E1568B;

  --text-caption:  0.719rem;  /* 11.5px */
  --text-label-sm: 0.75rem;
  --text-body-sm:  0.8125rem;
  --text-body:     0.875rem;
  --text-h4:       0.9375rem;
  --text-h3:       1.0625rem;
  --text-h2:       1.375rem;
  --text-metric:   1.375rem;
  --text-metric-lg:1.875rem;
  --text-display-3:2.5rem;
  --text-display-2:3.25rem;
  --text-display-1:4rem;

  --radius-xs:4px; --radius-sm:6px; --radius-md:8px;
  --radius-lg:10px; --radius-xl:12px; --radius-2xl:16px;

  --shadow-xs:0 1px 2px rgb(15 23 41 / 0.04);
  --shadow-sm:0 1px 3px rgb(15 23 41 / 0.06), 0 1px 2px rgb(15 23 41 / 0.04);
  --shadow-md:0 4px 12px rgb(15 23 41 / 0.08), 0 1px 3px rgb(15 23 41 / 0.04);
  --shadow-lg:0 12px 28px rgb(15 23 41 / 0.10), 0 2px 6px rgb(15 23 41 / 0.05);
  --shadow-xl:0 24px 56px rgb(15 23 41 / 0.14), 0 4px 12px rgb(15 23 41 / 0.06);

  --ease-out:cubic-bezier(0.16,0.84,0.44,1);
  --ease-spring:cubic-bezier(0.22,1.2,0.36,1);
}

@layer base {
  html { -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }
  body { background: var(--color-canvas); color: var(--color-fg);
         font-family: var(--font-sans); font-size: var(--text-body); line-height: 1.5; }
  a { color: #2563EB; text-decoration: none; }
  a:hover { color: #1D4ED8; text-decoration: underline; text-underline-offset: 2px; }
  :focus-visible { outline: 2px solid #2563EB; outline-offset: 2px; }
  .tnum { font-variant-numeric: tabular-nums; }
}
```

Class recipes (reference, not a substitute for components):

```
Card       bg-surface border border-line rounded-xl shadow-xs p-5
Btn/primary h-[38px] px-3.5 rounded-md bg-primary text-white text-[13px] font-medium
            inline-flex items-center gap-2 hover:bg-primary-hover active:scale-[0.985]
            transition-colors duration-[120ms]
Btn/second  h-[38px] px-3.5 rounded-md bg-surface border border-line text-fg
            text-[13px] font-medium hover:bg-hover
Input       h-[38px] px-3 rounded-md bg-surface border border-line text-[14px]
            placeholder:text-fg-tertiary focus:border-primary
            focus:ring-[3px] focus:ring-primary/[0.18]
Pill        h-[22px] px-2 rounded-sm text-[12px] font-medium inline-flex items-center gap-1.5
NavItem     h-[38px] px-2.5 rounded-md flex items-center gap-2 text-[13px] font-medium
            text-fg-secondary hover:bg-hover hover:text-fg
NavActive   bg-selected text-primary border border-primary/25
IconSquare  size-9 rounded-lg grid place-items-center bg-primary-subtle text-primary
TableRow    h-12 border-b border-line-subtle hover:bg-hover
```

---

## 22. Component build order (for agents)

Build and review in this order; each tier depends only on the tiers above it.

1. **Foundations** — token CSS, theme switch, fonts, icon wrapper, `tnum` utility
2. **Primitives** — Button, IconButton, Input, Textarea, Select, Checkbox, Radio, Toggle, SegmentedControl, Pill, Chip, Badge, Avatar, IconSquare, Tooltip, Skeleton, Spinner, Divider, Kbd
3. **Composites** — Card, MetricCard, Table (+ header/row/cell/pagination/bulk bar), ListRow, Timeline, ProgressBar, ScoreGauge, Tabs, FilterBar, Dropdown, Popover, Modal, Drawer, Toast, InlineAlert, EmptyState, ErrorState
4. **Charts** — LineChart, AreaChart, BarChart, StackedBar, DonutChart, Sparkline, chart tooltip, legend, reference line
5. **Domain** — Sidebar, PageHeader, DashboardGrid, InsightCard, InsightRow, RecordHeader, DetailPanel, KanbanBoard, KanbanCard, IntegrationTile, NotificationItem, Stepper, CommandPalette
6. **Screens** — Dashboard, List/Table view, Record detail, Board, Analytics, Reports, Team, Integrations, Settings, Onboarding, Auth

`RULE:` No screen work begins until tiers 1–3 are complete and reviewed. Never inline a one-off variant of an existing primitive inside a screen file.

---

## 23. Review checklist (pass all before merge)

**Tokens** — no raw hex, px font size, or shadow in component code · no palette-scale token referenced from a component · dark theme verified by token swap alone

**Type** — sizes come from §2.5 · all numerals tabular · nothing below 11.5px · display face only in marketing and large stats

**Layout** — 4px-multiple spacing · card paddings per §2.6 · no nested equal radii · sidebar 248/68 · dashboard ≤6 cards above the fold

**Color** — exactly one filled primary button in the viewport · statuses map to §4.3 · ≤4 icon-square tones on screen · charts follow the fixed series order

**States** — all eight interaction states implemented · focus-visible on every control including rows and cards · disabled uses tokens, not opacity · empty + loading + error all present

**Icons** — Lucide only, outline, 1.5px, explicit size · glyphs from §3.3 · icon-only controls labeled · zero emoji

**Data** — every metric has label + delta + basis · numbers right-aligned · charts have a summary row and an accessible label · tables truncate with tooltips

**A11y** — contrast verified in both themes · heading order correct · keyboard path complete including drag alternatives · reduced-motion honored · touch targets ≥44px

**Copy** — sentence case · verb-first buttons ≤3 words · no banned words (§19) · errors state cause and fix · assisted output hedged and sourced

**Motion** — durations from §2.9 · opacity and ≤4px transforms only · no shadow animation on lists

---

## 24. Anti-patterns — hard blocklist

Any of these fails review:

1. Multi-stop or mesh **gradient backgrounds** on sections, cards, or buttons. Gradients are permitted only as a single-hue chart area fill.
2. **Glow, neon, blur orbs, aurora blobs**, or animated background particles.
3. **Glassmorphism** — translucent blurred panels — outside the modal scrim's 2px backdrop blur.
4. A card with a **thick left color bar** as its only status signal.
5. **Emoji** in product UI or product copy.
6. **Inter, Roboto, Arial, Open Sans, Lato, Montserrat, Fraunces** as the UI or display face.
7. **Purple→blue gradient headlines** or gradient text of any kind. Emphasis is a solid color.
8. More than **one filled primary button** in a viewport.
9. **Pure black** (`#000`) or **pure warm gray**. Neutrals are cool-slate and start at `#0F1729`.
10. **Deep, wide, or dark shadows** (>28px blur, >0.14 alpha) and shadows on table rows or list items.
11. **Zebra-striped tables**, vertical grid lines in charts, or 3D/donut-with-drop-shadow chart styling.
12. Full-page **spinner** as the loading state for a data view.
13. **Uppercase status pills**, uppercase buttons, or letter-spaced body text.
14. **Icon-only** status, icon-only destructive actions, or mixing two icon libraries.
15. **Hero illustrations of robots, brains, chat bubbles, or glowing spheres** to represent intelligence. Intelligence is shown by real output in a violet-fenced container.
16. Marketing **stat blocks with invented numbers** and no basis line.
17. **Auto-playing** carousels, parallax, scroll-jacking, or entrance animations on scroll for console surfaces.
18. **Hover-only** affordances with no keyboard or focus equivalent.
19. `!important`, inline color overrides, or arbitrary Tailwind color values (`bg-[#7c3aed]`) in feature code.
20. **Placeholder copy** shipped as real content (`Lorem ipsum`, `Card title`, `Description goes here`).

---

## 25. File layout

```
src/
  styles/
    tokens.css          # §2.2 + §2.3
    theme.css           # §21 @theme + base layer
  components/
    primitives/         # tier 2
    composites/         # tier 3
    charts/             # tier 4
    domain/             # tier 5
  icons/index.ts        # curated Lucide re-exports, §3.3 names only
docs/
  design-system.md      # this file
```

`RULE:` `icons/index.ts` is a closed list. Adding an icon requires adding a row to §3.3 first.

---

## Implementation notes for this repository

*Added during adoption. The document above is the spec; this section records how it maps onto the existing codebase.*

### Tailwind version

The repository runs **Tailwind 3.4.17**, not v4. §21's `@theme` block is v4-only syntax and cannot be used verbatim. The tokens are therefore expressed as:

- `frontend/src/styles/tokens.css` — §2.2 and §2.3 CSS custom properties, exactly as written.
- `frontend/tailwind.config.js` — `theme.extend` entries that reference those custom properties, so Tailwind utilities and raw CSS resolve to the same values and the dark theme stays a pure token swap.

### Conflict with the previous brand system

`CLAUDE.md` carried an earlier brand system that this document supersedes. The direct contradictions were:

| Previous (CLAUDE.md) | This document |
|---|---|
| Inter as the body/UI face | §24.6 bans Inter outright; UI is Geist, display is Plus Jakarta Sans |
| Accent `#3B82F6` | `--color-primary` `#2563EB` |
| Warm neutrals (`ink`/`bone`/`ash`) | Cool-slate neutrals from `#0F1729` |
| Radius capped at 12px | 16px permitted for marketing panels (§2.7) |
| No AI-decorative iconography | Intelligence is a *named* violet surface (§4.5), `sparkles` is canonical (§3.3) |

`CLAUDE.md` has been updated to point at this file as the single source of truth for design.
