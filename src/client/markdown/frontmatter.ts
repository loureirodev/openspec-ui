/**
 * Reading a YAML frontmatter block for display. Deliberately *not* a YAML parser: the viewer
 * is forbidden from interpreting frontmatter (no key means anything, no value becomes a link
 * or a derived label), so a parsed structure would buy fidelity it has nothing to do with.
 * The line scan mirrors the server's own minimal `parseSchemaField` and the line-based
 * `extractRequirementAnchors` — see design.md Decision 3 in the `render-markdown-frontmatter`
 * change.
 *
 * The block is read into exactly one of two regimes, never a mix: a half-paired block is the
 * one outcome that would actively mislead a reader about what the file says.
 */

import type { Handler } from "mdast-util-to-hast";

/** One `key: value` entry, both exactly as written in the source. */
export interface FrontmatterPair {
  key: string;
  value: string;
}

/**
 * How a frontmatter block should be presented: as key/value pairs when it is a flat mapping,
 * else as its verbatim source text.
 */
export type FrontmatterContent =
  | { kind: "pairs"; pairs: FrontmatterPair[] }
  | { kind: "verbatim"; text: string };

/**
 * A top-level `key: value` entry: a key starting at column 0 (no leading whitespace), opening
 * with a character that is not a YAML indicator, holding no `:` itself, followed by a `:` that
 * either ends the line or is separated from its value by a space. Anything else — an indented
 * line (a nested mapping or a block scalar's body), a `- key: value` sequence item, a quoted
 * key, a comment, a line with no `:` at all — fails to match and demotes the whole block.
 *
 * Both restrictions keep the promise above. Excluding the indicator set at the first character
 * is why a top-level sequence of mappings no longer pairs as `- key`/`value` and a quoted key
 * is no longer split inside its own quotes. Requiring the space after the `:` — YAML's own rule
 * for a block-mapping key — is why a line that merely *contains* a colon no longer pairs:
 * `https://example.com/spec` would otherwise read as `https`/`//example.com/spec`, and a
 * Windows path as `C`/`\Users\…`. All four are half-paired renderings of a block this module
 * claims never to half-pair.
 */
const TOP_LEVEL_ENTRY = /^([^\s\-?:,[\]{}#&*!|>'"%@`][^:]*):(?:[ \t]+(.*))?$/;

/** The opening delimiter, on a line of its own at the very start of the document. */
const FRONTMATTER_OPEN = /^---[ \t]*\r?\n/;

/** The closing delimiter, on a line of its own. */
const FRONTMATTER_CLOSE = /^---[ \t]*$/;

/**
 * Whether a document opens with something that is plausibly YAML frontmatter, rather than with
 * a thematic break that happens to be followed by another one.
 *
 * This gate exists because `remark-frontmatter` is purely positional: it claims *any* `---`
 * delimited block at offset 0, YAML or not. Left ungated, a document opening with a horizontal
 * rule has the prose after it re-rendered as the document's own metadata — the body presented
 * as the frontmatter, which is precisely the misreporting the two-regime rule is meant to
 * prevent. So the plugin is enabled per-document, from the shape of the block's first
 * meaningful line: a top-level key. Blank lines and `#` comment lines are skipped, since a
 * comment above the first key is ordinary in real frontmatter.
 *
 * That skip is why reaching the closing delimiter is not itself acceptance. A `#` line is a
 * YAML comment and a markdown heading alike, so `---`/`# Heading`/`---` — a document opening
 * with a rule around a heading — would otherwise pass the gate and have its own `<h1>` shown
 * as the document's metadata: the same misreporting, entering by the comment door. A block
 * holding nothing but comments is therefore rejected, and only a genuinely empty one accepted.
 * Nothing is lost by rejecting it: a comment-only block carries no metadata to show.
 *
 * Deliberately not pursued further: `Note: this is prose.` between two rules still reads as a
 * key, and no rule short of semantic understanding separates it from a one-key mapping — a
 * real YAML parser would call it a mapping too.
 */
export function looksLikeFrontmatter(markdown: string): boolean {
  if (!FRONTMATTER_OPEN.test(markdown)) return false;

  const body = markdown.slice(markdown.indexOf("\n") + 1);
  let sawComment = false;

  for (const line of body.split(/\r?\n/)) {
    if (line.trim() === "") continue;
    if (line.startsWith("#")) {
      sawComment = true;
      continue;
    }
    // Reached the close having seen no key: an empty block is frontmatter, a comment-only one
    // is a heading between two rules as readily as it is YAML.
    if (FRONTMATTER_CLOSE.test(line)) return !sawComment;
    return TOP_LEVEL_ENTRY.test(line);
  }

  return false;
}

/**
 * Reads a frontmatter block's raw text into its display regime.
 *
 * Flat only when *every* non-blank line is a top-level entry. Keys keep their document order
 * and a repeated key yields a pair per occurrence — the block is shown, not summarised. The
 * split is on the **first** `:` only, so a value that itself contains one (a URL, a time)
 * survives intact.
 */
export function readFrontmatter(value: string): FrontmatterContent {
  const lines = value.split(/\r?\n/);
  const pairs: FrontmatterPair[] = [];

  for (const line of lines) {
    if (line.trim() === "") continue;

    const match = TOP_LEVEL_ENTRY.exec(line);
    if (!match) return { kind: "verbatim", text: value.replace(/\s+$/, "") };

    pairs.push({ key: (match[1] ?? "").trim(), value: (match[2] ?? "").trim() });
  }

  return { kind: "pairs", pairs };
}

/**
 * Converts a `yaml` frontmatter node to hast, for `remark-rehype`'s `handlers` option.
 *
 * This is the one viewer treatment that cannot be a remark plugin. `mdast-util-to-hast` drops
 * `yaml` nodes unconditionally, and neither `data.hName` nor `data.hChildren` overrides that —
 * verified against the installed version — so the AST-annotation approach that
 * `remark-task-progress` and `remark-requirement-anchors` use is unavailable here and the
 * conversion has to happen at the mdast → hast seam itself. See design.md Decision 2.
 *
 * Flat frontmatter becomes a `<dl>` whose `dt`/`dd` pairs are each grouped in a `<div>` (valid
 * HTML5), so a pair is one layout unit that wraps as a whole. Anything else becomes a code
 * block holding the verbatim source. Both are built from hast *text* nodes, never raw HTML, so
 * frontmatter read off disk cannot introduce active markup.
 */
export const frontmatterHandler: Handler = (_state, node) => {
  const raw = typeof node.value === "string" ? node.value : "";
  const content = readFrontmatter(raw);

  if (content.kind === "verbatim") {
    return {
      type: "element",
      tagName: "pre",
      properties: { className: ["markdown-frontmatter-raw"] },
      children: [
        {
          type: "element",
          tagName: "code",
          properties: {},
          children: [{ type: "text", value: content.text }],
        },
      ],
    };
  }

  // An empty block has nothing to show; emitting the container anyway would draw a stray
  // separator above the document.
  if (content.pairs.length === 0) return undefined;

  return {
    type: "element",
    tagName: "dl",
    properties: { className: ["markdown-frontmatter"] },
    children: content.pairs.map((pair) => ({
      type: "element" as const,
      tagName: "div",
      properties: { className: ["markdown-frontmatter__pair"] },
      children: [
        {
          type: "element" as const,
          tagName: "dt",
          properties: { className: ["markdown-frontmatter__key"] },
          children: [{ type: "text" as const, value: pair.key }],
        },
        {
          type: "element" as const,
          tagName: "dd",
          properties: { className: ["markdown-frontmatter__value"] },
          children: [{ type: "text" as const, value: pair.value }],
        },
      ],
    })),
  };
};
