import bash from "highlight.js/lib/languages/bash";
import diff from "highlight.js/lib/languages/diff";
import json from "highlight.js/lib/languages/json";
import markdownLanguage from "highlight.js/lib/languages/markdown";
import typescript from "highlight.js/lib/languages/typescript";
import { isValidElement, type ReactNode } from "react";
import Markdown, { type Components } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import { frontmatterHandler, looksLikeFrontmatter } from "../markdown/frontmatter.js";
import { remarkTaskProgress } from "../markdown/remark-task-progress.js";
import { remarkRequirementAnchors } from "../markdown/requirement-anchors.js";

/** The common-language subset OpenSpec content actually uses; see design.md Decision 1. */
const HIGHLIGHT_LANGUAGES = {
  bash,
  json,
  ts: typescript,
  tsx: typescript,
  diff,
  md: markdownLanguage,
};

const DELTA_HEADER = /^(ADDED|MODIFIED|REMOVED|RENAMED) Requirements\b/;
const DELTA_OPERATION_CLASS: Record<string, string> = {
  ADDED: "markdown-delta--added",
  MODIFIED: "markdown-delta--modified",
  REMOVED: "markdown-delta--removed",
  RENAMED: "markdown-delta--renamed",
};

const SCENARIO_HEADING = /^Scenario:\s/;
const SCENARIO_KEYWORDS = new Set(["WHEN", "THEN", "AND", "GIVEN"]);

/** Flattens a React children tree to its plain text, to pattern-match against source text. */
function textContent(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textContent).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textContent(node.props.children);
  return "";
}

const components: Components = {
  h2({ children, ...props }) {
    const text = textContent(children);
    const delta = DELTA_HEADER.exec(text);
    if (delta) {
      const operation = delta[1] as keyof typeof DELTA_OPERATION_CLASS;
      return (
        <h2 className={`markdown-delta-header ${DELTA_OPERATION_CLASS[operation]}`}>
          <span className="markdown-delta-header__label">{operation}</span>
          {children}
        </h2>
      );
    }

    const total = (props as Record<string, unknown>)["data-task-total"];
    const done = (props as Record<string, unknown>)["data-task-done"];
    if (typeof total === "number" && typeof done === "number") {
      return (
        <h2 className="markdown-task-section">
          {children}
          <span className="markdown-task-section__progress">
            {done} / {total}
          </span>
        </h2>
      );
    }

    return <h2>{children}</h2>;
  },

  h4({ children, ...props }) {
    const text = textContent(children);
    if (SCENARIO_HEADING.test(text)) {
      return (
        <h4 className="markdown-scenario" {...props}>
          {children}
        </h4>
      );
    }
    return <h4 {...props}>{children}</h4>;
  },

  strong({ children, ...props }) {
    const text = textContent(children).trim();
    if (SCENARIO_KEYWORDS.has(text)) {
      return (
        <strong className="markdown-scenario-keyword" {...props}>
          {children}
        </strong>
      );
    }
    return <strong {...props}>{children}</strong>;
  },
};

export interface MarkdownViewerProps {
  markdown: string;
  /**
   * Assigns slug `id`s to `### Requirement: …` headings, so a sidebar anchor built with the
   * same slug function can navigate to it. Off by default so the changes and archived views
   * render byte-for-byte as before — see design.md Decision 4 in the `specs-ui` change.
   */
  requirementAnchors?: boolean;
}

/**
 * Renders OpenSpec markdown read-only: a GFM baseline with syntax-highlighted code, long-form
 * reading typography, and the task/scenario/spec-delta semantic layers. Renders a bare
 * fragment exactly as it would render inside a full document — see design.md Decision 4.
 */
export function MarkdownViewer({ markdown, requirementAnchors = false }: MarkdownViewerProps) {
  // `remarkFrontmatter` is enabled per-document, not always: it claims any `---` delimited
  // block at offset 0, so on a document that merely *opens* with a thematic break it would turn
  // the prose that follows into the document's own metadata. See `looksLikeFrontmatter`.
  const remarkPlugins = [
    ...(looksLikeFrontmatter(markdown) ? [remarkFrontmatter] : []),
    remarkGfm,
    remarkTaskProgress,
    ...(requirementAnchors ? [remarkRequirementAnchors] : []),
  ];

  return (
    <div className="markdown-viewer">
      <Markdown
        remarkPlugins={remarkPlugins}
        // Frontmatter is the one treatment that is not a remark plugin. `remarkFrontmatter`
        // above only makes the block a `yaml` node; rendering it has to happen here, at the
        // mdast → hast seam, because `mdast-util-to-hast` drops `yaml` nodes outright and the
        // `data` annotation the other two plugins rely on cannot override that. See
        // design.md Decision 2 in the `render-markdown-frontmatter` change.
        remarkRehypeOptions={{ handlers: { yaml: frontmatterHandler } }}
        rehypePlugins={[[rehypeHighlight, { languages: HIGHLIGHT_LANGUAGES }]]}
        components={components}
      >
        {markdown}
      </Markdown>
    </div>
  );
}
