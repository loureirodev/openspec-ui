# OpenSpec UI — Design System

This is the living design-system reference for the dashboard's frontend (`src/client`). It
documents what the UI actually looks like today — tokens, typography, the status-icon
vocabulary, and layout conventions — so future changes style against it rather than
re-deriving conventions from reading component code. Update it whenever the visual language
changes; keep it token/role-level, not a line-by-line changelog.

The identity is "paper + ink": a warm cream reading surface, warm near-black ink, and a single
cold-hue interactive accent (teal) — like the one coloured stamp on a printed page. The accent
is teal rather than a plain blue so it sits close to complementary with the terracotta brand
mark: the one warm and the one cold hue in the UI harmonize instead of merely coexisting. The
theme follows `prefers-color-scheme` on every load; a top-bar toggle overrides it for the
session only (see "Theme resolution" below) — nothing is persisted.

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
| `--accent` | interactive/navigational emphasis (links, active nav, progress fills, `WHEN`) | `oklch(45% 0.1 205)` | `oklch(74% 0.1 205)` |
| `--accent-tint` | active-state background (nav, sidebar selection) | `oklch(92% 0.03 205)` | `oklch(33% 0.06 205)` |
| `--success` | done / added | `oklch(52% 0.14 150)` | `oklch(76% 0.14 150)` |
| `--warning` | modified | `oklch(56% 0.13 85)` | `oklch(80% 0.13 85)` |
| `--danger` | blocked / removed / error | `oklch(53% 0.19 25)` | `oklch(72% 0.16 25)` |
| `--renamed` | the `RENAMED` delta and a secondary syntax-highlight hue | `oklch(50% 0.16 300)` | `oklch(74% 0.14 300)` |
| `--brand` | the brand mark's accent — **and nothing else** | `oklch(66% 0.151 41)` | same (theme-invariant) |

**Interactive ≠ error.** `--accent` (hue 205) and `--danger` (hue 25) are almost exactly
complementary — far apart in hue, not just lightness — so the two are never visually confused in
either theme. The accent also clears `--brand` (hue 41), `--warning` (85), `--success` (150) and
`--renamed` (300) by a wide margin.

**`--brand` is reserved for the mark, and MUST NOT encode state.** Unlike every other role
above, `--brand` is not semantic — it is the top bar's brand mark's terracotta (`#DD6E42`) and
carries no theme-specific value, since a brand colour does not shift with the viewer's theme.
This is a rule, not a convention: `--brand` sits only ~16° from `--danger` in hue (`oklch(66%
0.151 41)` against `--danger`'s hue 25), and in the dark theme the two are close in lightness
and chroma too — a status use of `--brand` would read as a plausible fourth error colour. The
mark is the only thing permitted to reach for it, and it sits in the top bar, where no status
is ever reported, so the two never appear in the same context.

### Theme resolution

`tokens.css` carries one light palette (bare `:root`) and one dark palette, applied two ways:

- `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { … } }` — the
  default: dark when the environment asks for it and nothing forces light.
- `:root[data-theme="dark"] { … }` — a twin block that forces dark regardless of the
  environment. **The two dark blocks are duplicated and MUST be kept in sync.**

The bare `:root` light palette doubles as the forced-light case, so there is no
`[data-theme="light"]` palette block — only the `:not([data-theme="light"])` guard that lets
a forced light theme win under a dark environment.

`data-theme` is set on `<html>` by `useTheme` (`src/client/lib/use-theme.ts`), and only after
the top-bar toggle (`ThemeToggle`) is used. It is **never persisted** — every load starts
from `prefers-color-scheme`, because the CLI's port-fallback means the origin is not stable
and a per-origin store could not be relied on. Before the toggle is touched, no attribute is
set and the page tracks the environment live. Because nothing is restored on load, no
pre-paint script is needed: the media query paints the correct first frame.

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

`src/client/components/StatusIcon.tsx` renders a small inline-SVG icon from a fixed
vocabulary — the single source of state-to-glyph mapping, reused everywhere OpenSpec state is
shown (the changes list, the archived list, the change-detail's artifact tabs, and the
markdown task checklist). The glyphs are hand-picked line icons from `references/icons`,
inlined as React the same way the brand marks are (`references/logos/assets`): each one is
drawn on a 24×24 grid with a 1.5px stroke and resolves its colour from `currentColor`, which
`StatusIcon` sets to a token — so one source renders correctly in both themes with no
build-time SVG import and no raw colour anywhere.

Every instance renders at one size — `STATUS_ICON_SIZE` (20px), the single default the
component ships. It sits just under the line box of `--font-size-sm` text (14 × 1.5 = 21px),
so the glyph is large enough to read its strokes clearly while never growing a list row, a
`StatusBadge` or an artifact tab that pairs it with small text. The markdown task-checklist
icon is absolutely positioned in the gutter, so its size never touches the prose line-height.

| status | glyph (source file) | colour |
|---|---|---|
| `done`, `complete` | check inside a circle (`check-circle.svg`) | `--success` |
| `in-progress` | play triangle inside a circle (`play-circle.svg`) | `--accent` |
| `no-tasks` (change), `ready` (artifact) | three dots inside a circle (`menu-dots.svg`) | `--muted` |
| `blocked` (artifact) | pause bars inside a circle (`pause-circle.svg`) | `--danger` |
| `error` (a change that failed to resolve) | cross inside a circle (`close-circle.svg`) | `--danger` |
| `closed` / `archived` (an archived change, and any `historical` framing) | archive box (`archive.svg`) | `--muted` |
| unrecognized status | minus inside a circle (`minus-circle.svg`) | `--faint` |
| `task-done` (a checked markdown task) | scalloped verified badge + check (`verified-check.svg`) | `--success` |
| `task-todo` (an unchecked markdown task) | scalloped verified badge, empty (`verified-uncheck.svg`) | `--muted` |

**Why `no-tasks` and `ready` share one glyph.** They are the same idea in the two different
vocabularies OpenSpec reports: a change with no `tasks.md` yet, and an artifact whose
dependencies are met but which nobody has started. One glyph for "nothing has happened here
yet" reads that honestly rather than inventing a second shape.

**Why the checklist has its own pair.** A checked markdown task is *not* a completed change —
it is one line item — so it gets the `verified-check` mark rather than the `check-circle` a
`done` change uses. Both land on `--success` green, but the shapes stay distinct so the two
scales never read as the same thing.

**`error` and `blocked` are both `--danger` but never collide** — different glyphs (a cross
vs. pause bars) and different contexts (a whole change that could not be read vs. one artifact
waiting on a dependency). `StatusBadge`'s `KNOWN_TONES` keeps its text tone in step with the
glyph colour for every status it recognizes.

**The `in-progress` glyph no longer doubles as a progress bar.** It used to fill a radial
wedge to `completed / total`; it is now a static play glyph. The row's `Meter` (changes list)
and the header's `Meter` (change detail) are the progress indicators — the icon only reports
which of the three states the change is in.

`StatusBadge` (`src/client/components/StatusBadge.tsx`) pairs this icon with the status as
coloured text — there is no filled/tinted pill. On the **change detail's artifact tabs**, the
icon renders before the artifact's name with no trailing status text badge — the icon already
carries the state, and the tab's tooltip and accessible name carry the detail (see "Named
component vocabulary" below). The change detail's own completion uses the `Meter`, in the
header's meta row, as the focal metric — not the per-artifact icons.

Delta labels (`ADDED`/`MODIFIED`/`REMOVED`/`RENAMED`, in `MarkdownViewer`'s spec-delta headers)
follow the same "coloured text, not a tinted pill" rule.

## Named component vocabulary

Four treatments that used to be re-derived per site are now named once, each shipped as its
own React component with a co-located `Component.module.css` (see "Stylesheet split" below).
Each replaces the rules it used to sit alongside, rather than adding a new one beside them.

**Callout** (`Callout.tsx`) — the single attention-block shape, parameterised by a semantic
`tone`: `info`, `danger`, or `success`. One shape for every tone: a 3px tone-coloured left
rule, a 1px border and a ground both derived from the tone with `color-mix(in oklch, …)`, a
tone-coloured icon and title, and **body text in `--text`** — the tone colours the rule, icon
and title only, so a long message stays legible rather than rendering wall-to-wall in the tone
colour. The icon is one of the `*-square` line icons from `references/icons` — `info-square`,
`danger-square` and `check-square` — sharing the same rounded-square frame (with the same
top-right gap as `StatusIcon`'s ring) and drawn from `currentColor` so it always matches the
title. `--panel` stays reserved for the scenario block; a callout's ground is a tone mix, not
`--panel`. `role="alert"` is set only for the danger tone. This is what a failed change, an
unreadable artifact, a spec validation error and a partial-load warning all render as now —
see "Reversed rules" below for what this replaces.

Laid out as a two-column grid (`1.25rem 1fr`), not a flex column: the icon sits alone in
column 1 (with a small `margin-top` so it optically aligns with the title's baseline), and the
title, body and any details list all sit in column 2, directly under each other — so the body
indents under the title text, not under nothing.

**Meter** (`Meter.tsx`) — a token-styled progress bar (track `--track`, fill `--accent`, or
`--success` at 100% completion) replacing every native `<progress>` element, since the browser's
own rendering cannot be restyled consistently across browsers or themes. A distinct `unknown`
state (a hatched track) renders when a quantity could not be computed, so "unknown" is never
shown as "zero" — used in the changes list row and the change detail's header meta row.

**Tooltip** (`Tooltip.tsx`) — an inverted ink chip (`--text` ground, `--bg` text) shown on
`:hover` and `:focus-visible`, used to carry supplementary detail a control cannot show inline:
a change row's location, a file's relative path, an artifact tab's state and missing
dependencies. **This is the one element in the system permitted a shadow** — everything else
stays flat, separated by hairlines, but a tooltip has to read as floating above arbitrary
content, which a hairline alone cannot achieve. This is a deliberate single exception, not
licence for a general elevation scale. A tooltip is decorative (`aria-hidden`) and never the
sole copy of anything: the control it attaches to always exposes the same content through its
own accessible name.

The bubble anchors *below* its trigger by default, with a caret (a rotated square) pointing
back at it. A `start` prop anchors it to the trigger's left edge and grows it rightward —
used on wide, full-width triggers (a changes/archived-list row, a side-nav item) where a
centred bubble would either clip against the viewport or land far from the content it
annotates. An `end` prop is its mirror: anchored to the trigger's right edge, growing
leftward — used on a control near the viewport's right edge (the top bar's project name)
where a centred or left-anchored bubble would clip. The caret stays pinned to the trigger
whichever way the bubble grows.
Content is plain text by default; where a tooltip carries both an identity and a supplementary
state (an artifact tab's name and status), it uses the two-tier `TooltipName` (bold, body font)
over `TooltipMeta` (uppercase mono, small, 72% opacity) — the same `TooltipMeta` treatment
alone is also used for a bare path or status line, so mono/uppercase reads as "this is a
technical value" consistently across single- and two-line content.

**side-nav** (`styles/base.css`, `.side-nav` / `.side-nav__items` / `.side-nav__item-button` /
`.side-nav__item-label` / `.side-nav__item-counter`) — the one sidebar treatment for every
pick-list beside a body pane: a 16rem rail, `--radius-sm` items, an `--accent-tint` active
state, and a mono secondary counter. Global (not a CSS Module) because it is shared by two
existing globally-styled views — the specs browser's capability sidebar and the change
detail's Level-2 file rail — so a per-component module would fork the moment either one changed.
Each item's label is a human-readable form of its underlying identifier or file label; the raw
value is available as supplementary detail (a `title` attribute or a `Tooltip`), never the
visible label itself.

The change detail's Level-2 file rail appears for **every collection artifact** (one whose
schema permits many files, e.g. `specs`), regardless of how many files it currently holds, and
for **any artifact with more than one file**. It is skipped only by a *singular* artifact with
exactly one file (`proposal`, `design`, `tasks`), whose single file is the artifact and needs
no pick-list. A lone collection member is labelled by its capability directory (the humanized
form of `openspec-data-access`), never the structural `spec` basename.

## Reversed rules

Two rules this document previously stated no longer hold. Both are rewritten here, not merely
qualified, so the document never contradicts the code it describes.

**Error boxes no longer keep a full `--danger` border with `--danger` body text.** This
document used to describe an alert/error box as a full `--danger`-bordered card whose entire
message rendered in `--danger`. It is now the toned **Callout** above: the tone colours the
rule, icon and title, and the body renders in `--text`. The change is deliberate — a long error
message in solid `--danger` is markedly harder to read than the same message in `--text` with a
clearly toned header, and the tone is still unmistakable from the rule, icon and title alone.
The alternative (keeping the danger box as-is and adding a separate info variant beside it) was
rejected: it would leave every existing error box in place and add a fifth ad hoc rule, which is
the exact pattern this vocabulary exists to stop.

**The changes list row's identity is the humanized title, not the raw mono name.** The row used
to print the raw kebab-case change name as its primary line, with the humanized title demoted to
a quiet secondary line beneath it — two lines, two statements of the same fact. The row is now a
single line whose identity is the humanized title; the change's directory (project-root-relative)
moves into a `Tooltip`, and both it and the raw name move into the row's accessible name. This
mirrors what the specs sidebar already
did (`humanizeName(spec.id)`, raw id never printed) and halves the list's height. The change
detail keeps the raw name visible, as an overline above its `h1`, because that view is where a
user is working with one specific change and copies its name into a CLI command — a list is
scanned, and a humanized title scans better than a kebab-case string. Filtering still matches
against the raw name; only its on-screen presentation changed.

## Brand mark

The top bar renders the project's brand lockup — `BrandIcon` then `BrandWordmark`
(`src/client/components/`), inlined React components generated once from
`references/logos/assets/`, rather than an `<img>` or a text label. Both resolve their ink from
`currentColor` (which inherits `--text`, already themed) and their accent detail from `--brand`
(above), so one source renders correctly in both themes with no light/dark asset variants and no
build-time SVG import.

Both marks are grid-aligned pixel art (`shape-rendering="crispEdges"`) and render on a shared 3px
cell — the icon at 21×18px, the wordmark at 15×147px — so no cell lands on a fractional pixel;
rendering at a size that is not a whole multiple of the cell would make the browser round cells
unevenly, visible directly in the wordmark's letterforms. Below the narrow viewport breakpoint
the wordmark is dropped and the icon alone carries the brand, at its full cell size — the lockup
is never scaled down to fit, which would break the whole-pixel rule.

The lockup carries `role="img"` and `aria-label="OpenSpec UI"` on its own wrapper; both marks are
individually `aria-hidden`, so the accessible name is announced once, not twice, and removing
the text brand label does not remove the brand from the accessibility tree.

The app also ships a favicon (`src/client/public/favicon.svg`, `favicon-16.svg`, linked from
`index.html`), which it did not have before this document's most recent revision.

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

  Within a wide view, a markdown reading column (`.markdown-viewer`) still caps at `760px`, so
  prose never stretches to the full 1120px even where the page around it is wide.
- **Hairlines over cards.** List rows and sidebar items are separated by a `1px solid --hair`
  rule (typically `border-bottom`), not a full bordered box. `--panel` is reserved for exactly
  one surface: the scenario block in rendered markdown. An attention block — a failed change, a
  spec validation error, an artifact whose files could not be read, "next steps" — renders as
  the **Callout** described above, in the tone that fits it; it is the deliberate exception to
  "no filled ground", since it is meant to stand out from the reading chrome around it, but its
  ground is a tone mix, never `--panel`.
- **List rows show a humanized identity; the raw name is supplementary detail.** The changes
  list, the archived list and the specs sidebar all show a human-readable title as a row's
  identity — never a raw kebab-case name or file path — with the raw value available on hover
  and focus (a `Tooltip`, or the specs sidebar's existing pattern) and in the row's accessible
  name. The change detail is the one place that still prints the raw name visibly, as an
  overline above the humanized `h1`: unlike a list, which is scanned, the detail is where a user
  works with one specific change and copies its name into a CLI command.
- **Top bar.** `.app__header` has no bottom border — it fuses with `--bg` rather than being cut
  off by a hard rule. The active nav item is `--accent` text on an `--accent-tint` background;
  inactive items are `--muted`. The brand is a lockup — `BrandIcon` then `BrandWordmark`,
  inlined SVG components resolving `currentColor` (ink) and `--brand` (the mark's accent) — not
  text; see "Brand mark" below. The right edge holds `.app__header-tools`, one
  `margin-left: auto` cluster carrying the utilities in a fixed order — the launched project's
  folder name (`ProjectName`, shown only when health is `ok`: a button that copies the full
  path on click, its label truncating with the full path in the tooltip and accessible name),
  then `ThemeToggle`, then `RefreshControl`. A utility added later joins this cluster rather
  than positioning itself.
- **Stylesheet split.** `src/client/styles.css` (a single file) is now `src/client/styles/`,
  imported once from `index.css` (itself the sole import in `main.tsx`):
  - `tokens.css` — the `:root` (+ dark-mode) token layer: colour roles, font-family roles,
    spacing/radius primitives. See "Theme resolution" for the light/dark/`data-theme` blocks.
  - `base.css` — reset, base typography wiring, and shared building blocks used across pages
    (status badges, the inferred-schema label, heading font rules, the form-control and
    icon-button vocabulary below, the `:focus-visible` rule — which also covers list rows and
    tabs — and the global `side-nav` treatment).
  - `markdown.css` — `MarkdownViewer` output: reading typography, task/scenario/delta
    semantics, and the `highlight.js` theme. Global by necessity, since `react-markdown` emits
    plain HTML this can't scope to a module.
  - `app.css` — the top bar (brand lockup, nav, and the `.app__header-tools` cluster: project
    name, theme toggle, refresh control) and the per-view width utilities.
  - `changes.css` — the changes list, change detail, and archived list.
  - `specs.css` — the specs browser: sidebar and spec detail.

  **Convention going forward:** this split is existing global CSS relocated, not rewritten — it
  only ever *shrinks* as rules move out into named components. Any *new* component ships its
  own co-located `Component.module.css` (Vite-native CSS Modules — no new dependency); don't add
  further global selectors to the files above except to extend an existing domain (`side-nav` is
  the one domain still expected to grow, since it is shared by more than one globally-styled
  view). `Callout`, `Meter` and `Tooltip` (above) are the first components built this way.

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
nothing: short pairs share a line, a long value wraps within the 760px reading measure with its
key still adjacent to the start of it, and an unbreakable token breaks rather than widening the
page. Nothing is ever truncated or elided; this is a read-only view of a file on disk, and
hiding content to fit would misreport the source.

**Accepted limitation: the block is never collapsed.** There is no disclosure control and no cap
on how many pairs it shows, because a disclosure widget would be new interactive vocabulary. A
document declaring an unusually large frontmatter therefore gets an unusually tall metadata
block. This is recorded so a future change revisits it deliberately rather than discovering it
as a bug — at the nine keys that motivated the feature, the block is three lines.

## Motion

Motion is used sparingly, only to make a state change legible — never decoration. Every
transition/animation is gated so it degrades to an instant state change: component-scoped CSS
uses `@media (prefers-reduced-motion: reduce) { transition: none }`, global CSS wraps
keyframed animation in `@media (prefers-reduced-motion: no-preference)`. Durations sit around
`0.16s–0.2s`, `ease`/`ease-out`. Current uses: the `Meter` fill (`width`), the `Tooltip`
(opacity/translate/scale), the changes-list loading pulse, and the change detail's artifact
tabs — the active tab's underline is a pseudo-element that grows from `scaleX(0.35)` and fades
in on select (so both selecting and deselecting register as a small motion), and the tab
panel, which remounts per artifact, does a short fade/rise on arrival.

**A promoted-to-active control must not change size.** The change detail's artifact tab turns
600-weight when active; its label carries a hidden always-bold copy of its own text (in a
column-flex box) so the tab's width is the bold width at all times and the tabs after it never
shift sideways. Any future active state that changes font-weight owes the same treatment.

## Non-goals (for now)

- No **persisted** theme preference. The top-bar toggle overrides the theme for the session
  only; every load re-derives it from `prefers-color-scheme` (see "Theme resolution").
- No Tailwind or CSS-in-JS — plain CSS custom properties and (for new components) CSS Modules.
- No self-hosted fonts — the Google Fonts CDN `<link>` is acceptable for a local dev tool.
- No elevation vocabulary. The `Tooltip` above is the single, deliberate shadow exception; every
  other surface stays flat, separated by hairlines — a sticky element (the change detail's tab
  bar and file rail) takes an opaque `--bg` ground so nothing shows through as content scrolls
  past it, and a hairline wherever content passes beneath it (the tab bar's bottom rule), never
  a shadow.

## Inline code sizing

`.markdown-viewer code` sizes at `0.9em` — relative to its surrounding text, not a fixed
absolute size — so a code fragment reads at the same visual scale as the words around it in
every context: a heading of any level as well as body copy, a table cell, or a list item. The
ratio is `0.9` rather than `1` because JetBrains Mono renders visibly larger than Lexend at
equal nominal size, so equal-em code would read larger than its surrounding text; in body copy
this lands within a hair of the previous fixed-size rendering (14px / 16px = 0.875). Inside a
heading, code keeps its `--track` ground, radius and horizontal padding, but drops its
**vertical** padding (which at heading line-height made wrapped heading lines collide) and sizes
at `0.92em` relative to the heading, inheriting its weight. `overflow-wrap: break-word` lets a
long identifier wrap inside the 760px reading measure instead of widening the page.
