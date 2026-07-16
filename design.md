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

- **Reading widths.** A markdown reading column (`.markdown-viewer`) caps at `680px`; the
  changes list caps at `820px`; the outer app container (`.app__main`) caps at `1120px` and is
  centred — wide enough to hold a sidebar layout (the specs browser) comfortably.
- **Hairlines over cards.** List rows and sidebar items are separated by a `1px solid --hair`
  rule (typically `border-bottom`), not a full bordered box. `--panel` is reserved for exactly
  one surface: the scenario block in rendered markdown. Alert/error callouts (a failed change
  card, a spec validation error) are the deliberate exception and keep a full `--danger` border,
  since they are meant to stand out from the reading chrome around them.
- **Top bar.** `.app__header` has no bottom border — it fuses with `--bg` rather than being cut
  off by a hard rule. The active nav item is `--accent` text on an `--accent-tint` background;
  inactive items are `--muted`.
- **Stylesheet split.** `src/client/styles.css` (a single file) is now `src/client/styles/`,
  imported once from `index.css` (itself the sole import in `main.tsx`):
  - `tokens.css` — the `:root` (+ dark-mode) token layer: colour roles, font-family roles,
    spacing/radius primitives.
  - `base.css` — reset, base typography wiring, and shared building blocks used across pages
    (status badges, the inferred-schema label, heading font rules).
  - `markdown.css` — `MarkdownViewer` output: reading typography, task/scenario/delta
    semantics, and the `highlight.js` theme. Global by necessity, since `react-markdown` emits
    plain HTML this can't scope to a module.
  - `app.css` — the top bar: brand, nav, refresh control, main container.
  - `changes.css` — the changes list, change detail, and archived list.
  - `specs.css` — the specs browser: sidebar and spec detail.

  **Convention going forward:** this split is existing global CSS relocated, not rewritten. Any
  *new* component ships its own co-located `Component.module.css` (Vite-native CSS Modules —
  no new dependency); don't add further global selectors to the files above except to extend
  an existing domain.

## Non-goals (for now)

- No manual light/dark toggle. Theme follows `prefers-color-scheme` only.
- No Tailwind or CSS-in-JS — plain CSS custom properties and (for new components) CSS Modules.
- No self-hosted fonts — the Google Fonts CDN `<link>` is acceptable for a local dev tool.
