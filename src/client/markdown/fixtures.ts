/** Markdown fixtures shaped after this repo's own task, spec, and delta files. */

/** A task file: `## N. …` sections over `- [ ]` / `- [x]` checkbox lists. */
export const TASK_FILE = `## 1. Setup

- [x] 1.1 Install dependencies
- [x] 1.2 Configure tooling

## 2. Build the feature

- [x] 2.1 Write the component
- [ ] 2.2 Write the tests
- [ ] 2.3 Wire it into the page
`;

/** A spec delta: operation headers, a requirement, and a scenario with keyword bullets. */
export const SPEC_DELTA = `## ADDED Requirements

### Requirement: Widgets render

The system SHALL render widgets.

#### Scenario: A widget renders

- **WHEN** a widget is given valid data
- **THEN** it renders without error
- **AND** its label matches the source

## REMOVED Requirements

### Requirement: Legacy widgets

The legacy widget renderer is removed.
`;

/** A bare fragment: a single scenario block with no surrounding document. */
export const BARE_SCENARIO_FRAGMENT = `#### Scenario: A standalone fragment

- **WHEN** the viewer is given only this fragment
- **THEN** it renders correctly on its own
`;

/** GFM baseline: a table, a task list, and fenced code blocks with and without a language. */
export const GFM_BASELINE = `# Sample document

| Name | Kind |
| ---- | ---- |
| foo  | bar  |

- [x] Done item
- [ ] Pending item

\`\`\`json
{ "ok": true }
\`\`\`

\`\`\`
plain text block
\`\`\`
`;

/** A markdown source that embeds a raw \`<script>\` element. */
export const SCRIPT_INJECTION = `Some text.

<script>window.__pwned = true;</script>

More text.
`;

/** A heading and bold text that match no semantic pattern, to verify plain-GFM fallback. */
export const NON_MATCHING_CONTENT = `## Just a heading

Some prose with **Important** bold text that is not a scenario keyword.
`;
