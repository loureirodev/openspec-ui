import type { Heading, Root } from "mdast";
import type { Plugin } from "unified";
import { visit } from "unist-util-visit";
import { headingText } from "./mdast-text.js";

const REQUIREMENT_HEADING = /^Requirement:\s*(.+)$/;
const REQUIREMENT_HEADING_LINE = /^### Requirement:\s*(.+)$/;
const FENCE_LINE = /^(```|~~~)/;

/** One requirement's rendered anchor: the id its heading was assigned, and its short title. */
export interface RequirementAnchor {
  id: string;
  title: string;
}

/**
 * The anchor id for the `index`-th (0-based) requirement in document order.
 *
 * Ids are positional rather than derived from requirement text, because the binary's JSON
 * index does not report the heading's short title — `requirements[].text` is the requirement's
 * full body statement (the paragraph *under* `### Requirement: <title>`), not the heading text
 * itself; the two are unrelated strings verified against the live `show --type spec --json`
 * output. Position is the one thing the JSON `requirements[]` array and the markdown's
 * `### Requirement:` headings are guaranteed to share, since both are derived from the same
 * `spec.md` in the same order.
 */
export function requirementAnchorId(index: number): string {
  return `requirement-${index + 1}`;
}

/**
 * Every `### Requirement: <title>` heading's anchor id and title, in document order, read
 * straight from the raw `spec.md` markdown — the one place a requirement's title actually
 * lives; see {@link requirementAnchorId} for why the JSON index cannot supply it.
 *
 * Line-based rather than a full markdown parse, mirroring the server's own checkbox-line
 * regexes (`task-progress.ts`), since the heading convention is a fixed, single-line pattern.
 * Lines inside fenced code blocks (```` ``` ```` / `~~~`) are skipped, so a spec that shows the
 * heading convention as a *documented example* inside a code fence does not produce a phantom
 * entry that shifts every later id — the one realistic way this line scan could otherwise
 * disagree with `remarkRequirementAnchors`' AST-based match on the same input. Deliberately not
 * pursued further into full CommonMark fidelity (e.g. a heading nested in a blockquote): that
 * would need a real markdown parse, which the client does not otherwise depend on at runtime.
 */
export function extractRequirementAnchors(markdown: string): RequirementAnchor[] {
  const anchors: RequirementAnchor[] = [];
  let inFence = false;

  for (const rawLine of markdown.split("\n")) {
    const line = rawLine.trim();
    if (FENCE_LINE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const match = REQUIREMENT_HEADING_LINE.exec(line);
    if (match) anchors.push({ id: requirementAnchorId(anchors.length), title: match[1] ?? "" });
  }

  return anchors;
}

/**
 * Assigns a positional anchor `id` to every `### Requirement: …` heading, in document order —
 * see {@link requirementAnchorId} for why position, not text, is the shared key. Exposed as an
 * hast `id` property, which `react-markdown` renders as the element's `id` attribute. Mirrors
 * the `remark-task-progress` local-plugin precedent, and is opt-in only — see
 * `MarkdownViewer`'s `requirementAnchors` prop — so the changes and archived views render
 * unchanged.
 */
export const remarkRequirementAnchors: Plugin<[], Root> = () => (tree) => {
  const headings: Heading[] = [];
  visit(tree, "heading", (node) => {
    const heading = node as Heading;
    if (heading.depth === 3 && REQUIREMENT_HEADING.test(headingText(heading))) {
      headings.push(heading);
    }
  });

  headings.forEach((heading, index) => {
    heading.data = {
      ...heading.data,
      hProperties: {
        ...(heading.data as { hProperties?: Record<string, unknown> } | undefined)?.hProperties,
        id: requirementAnchorId(index),
      },
    };
  });
};
