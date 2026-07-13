import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  BARE_SCENARIO_FRAGMENT,
  GFM_BASELINE,
  NON_MATCHING_CONTENT,
  SCRIPT_INJECTION,
  SPEC_DELTA,
  TASK_FILE,
} from "../markdown/fixtures.js";
import { MarkdownViewer } from "./MarkdownViewer.js";

describe("the GFM baseline", () => {
  it("renders a table, a task list, and fenced code blocks", () => {
    const { container } = render(<MarkdownViewer markdown={GFM_BASELINE} />);

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "foo" })).toBeInTheDocument();

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).not.toBeChecked();

    expect(container.querySelectorAll("pre code")).toHaveLength(2);
  });

  it("highlights a fenced block that declares its language", () => {
    const { container } = render(<MarkdownViewer markdown={GFM_BASELINE} />);

    const jsonBlock = container.querySelector("code.language-json");
    expect(jsonBlock).not.toBeNull();
    expect(jsonBlock?.querySelector(".hljs-attr, .hljs-string, [class*='hljs-']")).not.toBeNull();
  });

  it("renders a fenced block with no declared language as plain, readable code", () => {
    const { container } = render(<MarkdownViewer markdown={GFM_BASELINE} />);

    const blocks = container.querySelectorAll("pre code");
    const plainBlock = Array.from(blocks).find((block) =>
      block.textContent?.includes("plain text block"),
    );
    expect(plainBlock).toBeTruthy();
    expect(plainBlock?.textContent).toBe("plain text block\n");
  });

  it("never executes a raw script embedded in the source", () => {
    const { container } = render(<MarkdownViewer markdown={SCRIPT_INJECTION} />);

    // No `<script>` element is ever created — the raw HTML is not parsed into markup at
    // all, so its text can appear in the output, but only as inert text content.
    expect(container.querySelector("script")).toBeNull();
  });

  it("exposes no control that edits or persists the source", () => {
    render(<MarkdownViewer markdown={GFM_BASELINE} />);

    for (const checkbox of screen.getAllByRole("checkbox")) {
      expect(checkbox).toBeDisabled();
    }
  });
});

describe("task sections", () => {
  it("renders checkboxes read-only, reflecting checked state", () => {
    render(<MarkdownViewer markdown={TASK_FILE} />);

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(5);
    for (const checkbox of checkboxes) {
      expect(checkbox).toBeDisabled();
    }
    expect(checkboxes.filter((checkbox) => (checkbox as HTMLInputElement).checked)).toHaveLength(3);
  });

  it("shows a per-section progress count without altering the heading or item text", () => {
    render(<MarkdownViewer markdown={TASK_FILE} />);

    const setupHeading = screen.getByRole("heading", { name: /1\. Setup/ });
    expect(setupHeading).toHaveTextContent("2 / 2");

    const buildHeading = screen.getByRole("heading", { name: /2\. Build the feature/ });
    expect(buildHeading).toHaveTextContent("1 / 3");

    expect(screen.getByText(/2\.2 Write the tests/)).toBeInTheDocument();
  });
});

describe("spec deltas", () => {
  it("labels and colours an ADDED header", () => {
    render(<MarkdownViewer markdown={SPEC_DELTA} />);

    const added = screen.getByRole("heading", { name: /ADDED Requirements/ });
    expect(added).toHaveClass("markdown-delta--added");
  });

  it("colours a REMOVED header distinctly from ADDED", () => {
    render(<MarkdownViewer markdown={SPEC_DELTA} />);

    const added = screen.getByRole("heading", { name: /ADDED Requirements/ });
    const removed = screen.getByRole("heading", { name: /REMOVED Requirements/ });
    expect(removed).toHaveClass("markdown-delta--removed");
    expect(removed.className).not.toBe(added.className);
  });
});

describe("scenario blocks", () => {
  it("frames a scenario heading and emphasises its keywords", () => {
    const { container } = render(<MarkdownViewer markdown={SPEC_DELTA} />);

    const heading = screen.getByRole("heading", { name: /Scenario: A widget renders/ });
    expect(heading).toHaveClass("markdown-scenario");

    const keywords = container.querySelectorAll(".markdown-scenario-keyword");
    const keywordText = Array.from(keywords).map((node) => node.textContent);
    expect(keywordText).toEqual(["WHEN", "THEN", "AND"]);
  });

  it("renders a standalone scenario fragment the same as it would inside a document", () => {
    render(<MarkdownViewer markdown={BARE_SCENARIO_FRAGMENT} />);

    const heading = screen.getByRole("heading", { name: /Scenario: A standalone fragment/ });
    expect(heading).toHaveClass("markdown-scenario");
    expect(screen.getByText("WHEN")).toHaveClass("markdown-scenario-keyword");
  });
});

describe("degradation to plain GFM", () => {
  it("renders a non-matching heading as an ordinary heading", () => {
    render(<MarkdownViewer markdown={NON_MATCHING_CONTENT} />);

    const heading = screen.getByRole("heading", { name: "Just a heading" });
    expect(heading.className).toBe("");
    expect(heading.textContent).toBe("Just a heading");
  });

  it("renders non-keyword bold text as ordinary bold text", () => {
    render(<MarkdownViewer markdown={NON_MATCHING_CONTENT} />);

    const bold = screen.getByText("Important");
    expect(bold.tagName).toBe("STRONG");
    expect(bold.className).toBe("");
  });
});
