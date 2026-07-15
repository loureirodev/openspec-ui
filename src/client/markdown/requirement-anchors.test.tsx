import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarkdownViewer } from "../components/MarkdownViewer.js";
import { extractRequirementAnchors, requirementAnchorId } from "./requirement-anchors.js";

/**
 * Shaped after the live `show <id> --type spec --json` output: `requirements[].text` is each
 * requirement's full body statement, not its heading's short title — the two are unrelated
 * strings. Also includes a duplicate heading title, to prove position (not text) disambiguates.
 */
const SPEC_WITH_REQUIREMENTS = `## Requirements

### Requirement: Widgets render

The system SHALL render widgets given valid data.

### Requirement: Widgets render

A second, differently scoped requirement that happens to share its heading title.
`;

describe("requirementAnchorId", () => {
  it("assigns a positional id", () => {
    expect(requirementAnchorId(0)).toBe("requirement-1");
    expect(requirementAnchorId(2)).toBe("requirement-3");
  });
});

describe("extractRequirementAnchors", () => {
  it("extracts each requirement heading's positional id and title, in document order", () => {
    expect(extractRequirementAnchors(SPEC_WITH_REQUIREMENTS)).toEqual([
      { id: "requirement-1", title: "Widgets render" },
      { id: "requirement-2", title: "Widgets render" },
    ]);
  });

  it("ignores a requirement heading written inside a fenced code block", () => {
    // A spec documenting its own heading convention with an example fence is realistic: the
    // AST-based remarkRequirementAnchors plugin only ever sees real heading nodes and would
    // never anchor text inside a fence, so this line scan must agree by skipping it too.
    const markdown = [
      "### Requirement: Real one",
      "",
      "Body.",
      "",
      "```markdown",
      "### Requirement: Not real, just an example",
      "```",
      "",
      "### Requirement: Also real",
      "",
      "Body.",
    ].join("\n");

    expect(extractRequirementAnchors(markdown)).toEqual([
      { id: "requirement-1", title: "Real one" },
      { id: "requirement-2", title: "Also real" },
    ]);
  });

  it("returns an empty list for markdown with no requirement headings", () => {
    expect(extractRequirementAnchors("# Just a title\n\nSome prose.\n")).toEqual([]);
  });
});

describe("MarkdownViewer requirementAnchors", () => {
  it("emits no heading ids by default, leaving other views unchanged", () => {
    const { container } = render(<MarkdownViewer markdown={SPEC_WITH_REQUIREMENTS} />);
    const headings = container.querySelectorAll("h3");
    for (const heading of headings) {
      expect(heading.id).toBe("");
    }
  });

  it("assigns the same positional ids extractRequirementAnchors computes, including the duplicate-heading-title case", () => {
    const { container } = render(
      <MarkdownViewer markdown={SPEC_WITH_REQUIREMENTS} requirementAnchors />,
    );

    // A sidebar link built independently, from the same markdown, via extractRequirementAnchors.
    const anchors = extractRequirementAnchors(SPEC_WITH_REQUIREMENTS);

    const headings = container.querySelectorAll("h3");
    expect(Array.from(headings).map((heading) => heading.id)).toEqual(
      anchors.map((anchor) => anchor.id),
    );
    // The two headings share a title, yet resolve to distinct ids by position.
    expect(new Set(Array.from(headings).map((heading) => heading.id)).size).toBe(2);
  });
});
