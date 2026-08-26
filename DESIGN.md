# OpenSpec Dashboard — Design System

This is the living design-system reference for the dashboard's frontend (`src/client`). It
documents what the UI actually looks like today — tokens, typography, the status-icon
vocabulary, and layout conventions — so future changes style against it rather than
re-deriving conventions from reading component code. Update it whenever the visual language
changes; keep it token/role-level, not a line-by-line changelog.

The identity is "paper + ink": a warm cream reading surface, warm near-black ink, and a single
cold-hue interactive accent (ink navy) — like the one blue stamp on a printed page. Dark theme
follows `prefers-color-scheme` only; there is no manual toggle.

## Colour tokens

All colours are OKLCH, defined in `src/client/styles/tokens.css`. Consumers reference roles by
name — never a raw colour value.

| token | role | light | dark |
|---|---|---|---|
| `--bg` | page background | `oklch(96.5% 0.014 85)` | `oklch(20% 0.012 80)` |
| `--panel` | the **one** filled surface (scenario blocks only) | `oklch(94% 0.016 85)` | `oklch(24% 0.012 80)` |
| `--track` | recessed surfaces — code blocks, an icon's unfilled ring | `oklch(88% 0.018 85)` | `oklch(30% 0.012 80)` |
| `--hair` | hairline separators (replaces full-border cards) | `oklch(90% 0.016 82)` | `oklch(28% 0.012 80)` |
| `--text` | primary text | `oklch(26% 0.02 70)` | `oklch(94% 0.008 80)` |
| `--muted` | secondary text | `oklch(48% 0.02 72)` | `oklch(72% 0.011 80)` |
| `--faint` | tertiary text, neutral/no-tasks icon strokes | `oklch(62% 0.018 75)` | `oklch(56% 0.012 80)` |
| `--accent` | interactive/navigational emphasis (links, active nav, progress fills, `WHEN`) | `oklch(42% 0.11 255)` | `oklch(72% 0.1 255)` |
| `--accent-tint` | active-state background (nav, sidebar selection) | `oklch(92% 0.03 255)` | `oklch(32% 0.06 255)` |
| `--success` | done / added | `oklch(52% 0.14 150)` | `oklch(76% 0.14 150)` |
| `--warning` | modified | `oklch(56% 0.13 85)` | `oklch(80% 0.13 85)` |
| `--danger` | blocked / removed / error | `oklch(53% 0.19 25)` | `oklch(72% 0.16 25)` |
| `--renamed` | the `RENAMED` delta and a secondary syntax-highlight hue | `oklch(50% 0.16 300)` | `oklch(74% 0.14 300)` |

**Interactive ≠ error.** `--accent` (hue 255) and `--danger` (hue 25) are deliberately far apart
in hue, not just lightness, so the two are never visually confused — in either theme.

## Typography

Three named font-family roles (`src/client/styles/tokens.css`), each with a system fallback so
the app stays usable offline. Loaded via a Google Fonts `<link>` in `src/client/index.html` —
this is a local dev tool, not a self-hosted production app, so a CDN link is fine.

| role | token | stack | used for |
|---|---|---|---|
| display | `--font-display` | `"Fraunces", Georgia, serif` | page and section headings (all `h1`–`h6`, globally) |
| body | `--font-body` | `"Lexend", system-ui, -apple-system, "Segoe UI", sans-serif` | body copy and UI controls (the `:root`/`body` default) |
| mono | `--font-mono` | `"JetBrains Mono", ui-monospace, "SFMono-Regular", "Cascadia Code", Consolas, monospace` | technical text: change/spec names, file paths, task and progress counters, and the `WHEN`/`THEN`/`AND`/`GIVEN` scenario keywords |

`h1` carries a touch of negative `letter-spacing` since Lexend/Fraunces run a little wider at
display size than the previous system-font stack.

## Status-icon vocabulary (`StatusIcon`)

`src/client/components/StatusIcon.tsx` renders a small inline-SVG icon from a fixed,
Linear-style vocabulary — the single source of state-to-shape mapping, reused everywhere
OpenSpec state is shown (the changes list and the change-detail header's per-artifact states).
Every icon is coloured from a token, never a raw colour.

| status | shape | colour |
|---|---|---|
| `done` (and a fully-complete `in-progress`) | filled circle + check | `--success` |
| `in-progress` | ring with a radial wedge filled to `completed / total` | wedge `--accent`, unfilled ring `--track` |
| `ready` | thin outlined ring | `--muted` |
| `no-tasks` | dashed ring | `--faint` |
| `blocked` | dashed ring, dimmed | `--danger` at 60% opacity |
| `error` | ring + cross | `--danger` |
| unrecognized status | dashed ring (same as `no-tasks`) | `--faint` |

The `in-progress` fraction is computed with `src/client/lib/pie-geometry.ts`
(`describePieSlice`), unit-tested at 0%, a partial value, and 100%. `done` short-circuits: a
change with all tasks complete renders as `done`, never a "full" in-progress wedge.

`StatusBadge` (`src/client/components/StatusBadge.tsx`) pairs this icon with the status as
coloured text — there is no filled/tinted pill. In the **changes list** the icon is given the
real `completed`/`total` counts, so it doubles as the row's sole progress indicator (the `n/n`
count still renders as separate text). In the **change-detail header**'s per-artifact states,
no counts are passed, so the icon renders a simple, non-fractional state glyph — the header
keeps its own dedicated `<progress>` bar (`.change-detail__progress-bar`, 280px, `accent-color:
var(--accent)`) as the focal completion metric.

Delta labels (`ADDED`/`MODIFIED`/`REMOVED`/`RENAMED`, in `MarkdownViewer`'s spec-delta headers)
follow the same "coloured text, not a tinted pill" rule.

## Layout and stylesheet conventions

- **Width is a property of the view, layered over a safe shell default.** `.app__main`
  (`src/client/styles/app.css`) itself caps at `1120px`, centred with `margin: 0 auto` — this is
  what a sidebar/second-column view (change/archived detail, the specs browser) needs, and it
  doubles as the default bound for any render path that doesn't opt into something narrower (a
  loading line, an error card, the health diagnostics, the 404 page): nothing can regress to
  unbounded full-bleed just because one branch forgot a width class. List-style pages
  (`ChangesPage`, `ArchivedPage`, `NotFoundPage`) that read like a document opt into the one
  named narrowing utility, `.view-width--text` (`820px`, also centred), instead of hugging the
  left edge of the wider default.

  Within a wide view, a markdown reading column (`.markdown-viewer`) still caps at `680px`, so
  prose never stretches to the full 1120px even where the page around it is wide.
- **Hairlines over cards.** List rows and sidebar items are separated by a `1px solid --hair`
  rule (typically `border-bottom`), not a full bordered box. `--panel` is reserved for exactly
  one surface: the scenario block in rendered markdown. Alert/error callouts (a failed change
  card, a spec validation error, an artifact whose files could not be read) are the deliberate
  exception and keep a full `--danger` border, since they are meant to stand out from the
  reading chrome around them. They share one shape — `--danger` border, `--radius-md`,
  `--danger` text, an optional detail list — so a new one adds no tokens.
- **Top bar.** `.app__header` has no bottom border — it fuses with `--bg` rather than being cut
  off by a hard rule. The active nav item is `--accent` text on an `--accent-tint` background;
  inactive items are `--muted`.
- **Stylesheet split.** `src/client/styles.css` (a single file) is now `src/client/styles/`,
  imported once from `index.css` (itself the sole import in `main.tsx`):
  - `tokens.css` — the `:root` (+ dark-mode) token layer: colour roles, font-family roles,
    spacing/radius primitives.
  - `base.css` — reset, base typography wiring, and shared building blocks used across pages
    (status badges, the inferred-schema label, heading font rules, the form-control and
    icon-button vocabulary below).
  - `markdown.css` — `MarkdownViewer` output: reading typography, task/scenario/delta
    semantics, and the `highlight.js` theme. Global by necessity, since `react-markdown` emits
    plain HTML this can't scope to a module.
  - `app.css` — the top bar (brand, nav, refresh control) and the per-view width utilities.
  - `changes.css` — the changes list, change detail, and archived list.
  - `specs.css` — the specs browser: sidebar and spec detail.

  **Convention going forward:** this split is existing global CSS relocated, not rewritten. Any
  *new* component ships its own co-located `Component.module.css` (Vite-native CSS Modules —
  no new dependency); don't add further global selectors to the files above except to extend
  an existing domain.

## Form controls and icon buttons

`src/client/styles/base.css` defines a small, named vocabulary for the interactive controls
the dashboard uses, so a filter input, a sort `<select>`, or an action button never falls back
to unstyled native rendering. Every rule resolves colour, border, radius and typography from
tokens, so all of it holds up unchanged in dark theme.

| class | for | notes |
|---|---|---|
| `.form-input` | text/search inputs | `--text` on `--bg`, `--hair` border, `--radius-sm` |
| `.form-select` | `<select>` | same treatment as `.form-input` |
| `.form-button` | a labelled action button | `--panel` background, `--hair` border; hover moves the border and text to `--accent` |
| `.icon-button` | an icon-only button (e.g. `RefreshControl`) | square, `--hair` border, `--muted` glyph colour; hover moves to `--accent` |

All four share one focus rule (`:focus-visible` → a 2px `--accent` outline) and one disabled
rule (`opacity: 0.6`, `cursor: not-allowed`).

**Icon buttons need an accessible name and a busy affordance.** An icon-only control's glyph
never doubles as its accessible name — `aria-label` names the action explicitly (and may
change with state, e.g. `"Refresh"` → `"Refreshing…"`). A control that kicks off an in-flight
background operation:

- sets `aria-busy="true"` for the duration, which `.icon-button[aria-busy="true"] .icon-button__glyph`
  turns into a spin animation (`@keyframes icon-button-spin`, plain CSS, no new dependency);
- is `disabled` until the operation settles, so a second click can't queue a second request.

`RefreshControl` is the reference implementation: it wraps an inline-SVG glyph in
`.icon-button__glyph`, and its existing `useIsFetching` wiring drives both `aria-busy` and
`disabled` — no separate state was needed.

## Frontmatter metadata block

A markdown file that opens with a YAML frontmatter block renders it as **document metadata**,
before the body and quieter than it (`src/client/styles/markdown.css`, `.markdown-frontmatter`).
The dashboard attaches no meaning to any key: values render as the literal text in the file,
never as a link, a derived label, or a translated status. That is a hard rule, not a default —
the viewer is schema-agnostic and the same block has to read correctly for a schema nobody here
has seen.

The block **adds no vocabulary**. It resolves entirely from existing roles:

| part | treatment |
|---|---|
| key (`dt`) | the `.markdown-delta-header__label` treatment — mono, `--font-size-sm`, uppercase, `0.05em` tracking — in `--faint` |
| value (`dd`) | mono, `--font-size-sm`, `--text`, with `overflow-wrap: anywhere` |
| separator | one `1px solid --hair` bottom rule, per the hairline convention above |
| non-flat fallback | the existing code-block treatment (`--track`, `--radius-md`) |

`--panel` stays reserved for the scenario block: the metadata block claims **no filled surface**
and no border box of its own.

**Pairs flow, they do not align to a column.** Each `dt`/`dd` is grouped in a `div` (valid HTML5
inside a `dl`), and those groups wrap as flex items. A fixed label column would have to be sized
to the longest key — that is a layout that must know its content in advance. Flowing measures
nothing: short pairs share a line, a long value wraps within the 680px reading measure with its
key still adjacent to the start of it, and an unbreakable token breaks rather than widening the
page. Nothing is ever truncated or elided; this is a read-only view of a file on disk, and
hiding content to fit would misreport the source.

**Accepted limitation: the block is never collapsed.** There is no disclosure control and no cap
on how many pairs it shows, because a disclosure widget would be new interactive vocabulary. A
document declaring an unusually large frontmatter therefore gets an unusually tall metadata
block. This is recorded so a future change revisits it deliberately rather than discovering it
as a bug — at the nine keys that motivated the feature, the block is three lines.

## Non-goals (for now)

- No manual light/dark toggle. Theme follows `prefers-color-scheme` only.
- No Tailwind or CSS-in-JS — plain CSS custom properties and (for new components) CSS Modules.
- No self-hosted fonts — the Google Fonts CDN `<link>` is acceptable for a local dev tool.
