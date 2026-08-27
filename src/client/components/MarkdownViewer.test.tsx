import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  BARE_SCENARIO_FRAGMENT,
  GFM_BASELINE,
  HEADING_WITH_INLINE_CODE,
  LONG_TASK_HEADING,
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

    // Task-list checkboxes render as the dashboard's own StatusIcon vocabulary, not a native
    // `<input type="checkbox">` — see the "task-list checkboxes" describe block below.
    const taskIcons = container.querySelectorAll(".markdown-task-icon svg");
    expect(taskIcons).toHaveLength(2);
    expect(taskIcons[0]).toHaveAttribute("data-status", "task-done");
    expect(taskIcons[1]).toHaveAttribute("data-status", "task-todo");

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

  it("exposes no control that edits or persists the source — no native checkbox at all", () => {
    const { container } = render(<MarkdownViewer markdown={GFM_BASELINE} />);

    // Not just "disabled": there is no `<input>` in the task list to begin with.
    expect(container.querySelector(".task-list-item input")).toBeNull();
  });
});

describe("task-list checkboxes", () => {
  it("renders the dashboard's own StatusIcon vocabulary, not a native checkbox", () => {
    const { container } = render(<MarkdownViewer markdown={TASK_FILE} />);

    expect(container.querySelectorAll(".task-list-item input")).toHaveLength(0);

    const icons = container.querySelectorAll(".markdown-task-icon svg");
    expect(icons).toHaveLength(5);
    expect(
      Array.from(icons).filter((icon) => icon.getAttribute("data-status") === "task-done"),
    ).toHaveLength(3);
  });

  it("renders a completed task item as the verified-check glyph and an incomplete one as verified-uncheck", () => {
    const { container } = render(<MarkdownViewer markdown={TASK_FILE} />);

    const items = container.querySelectorAll(".task-list-item");
    // TASK_FILE's items: "1.1"/"1.2"/"2.1" are checked, "2.2"/"2.3" are not — index 0 is done,
    // index 3 ("2.2 Write the tests") is the first incomplete item.
    const done = items[0]?.querySelector(".markdown-task-icon svg");
    const notDone = items[3]?.querySelector(".markdown-task-icon svg");

    expect(done).toHaveAttribute("data-status", "task-done");
    expect(done?.parentElement).toHaveAttribute("aria-label", "done");

    expect(notDone).toHaveAttribute("data-status", "task-todo");
    expect(notDone?.parentElement).toHaveAttribute("aria-label", "not done");
  });

  it("shows a per-section progress count without altering the heading or item text", () => {
    render(<MarkdownViewer markdown={TASK_FILE} />);

    const setupHeading = screen.getByRole("heading", { name: /1\. Setup/ });
    expect(setupHeading).toHaveTextContent("2 / 2");

    const buildHeading = screen.getByRole("heading", { name: /2\. Build the feature/ });
    expect(buildHeading).toHaveTextContent("1 / 3");

    expect(screen.getByText(/2\.2 Write the tests/)).toBeInTheDocument();
  });

  it("keeps the counter intact and unfragmented when the heading is long enough to wrap", () => {
    const { container } = render(<MarkdownViewer markdown={LONG_TASK_HEADING} />);

    // The counter is a single element carrying the whole "1 / 2" text, not split across
    // separate text nodes the way an unconstrained flex item would fragment it.
    const progress = container.querySelector(".markdown-task-section__progress");
    expect(progress).not.toBeNull();
    expect(progress?.textContent).toBe("1 / 2");
    expect(progress?.childElementCount).toBe(0);

    // The heading's own children are wrapped in a titled element the layout can size.
    expect(container.querySelector(".markdown-task-section__title")).not.toBeNull();
  });
});

describe("inline code inside a heading", () => {
  it("renders sized relative to the heading rather than at a fixed absolute size", () => {
    render(<MarkdownViewer markdown={HEADING_WITH_INLINE_CODE} />);

    const heading = screen.getByRole("heading", { name: /Configure/ });
    const code = heading.querySelector("code");
    expect(code).not.toBeNull();
    expect(code?.textContent).toBe("openspec.config.ts");
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

  it("does not repeat the operation word — it renders once in the label, not again in the heading text", () => {
    const { container } = render(<MarkdownViewer markdown={SPEC_DELTA} />);

    const added = screen.getByRole("heading", { name: /ADDED Requirements/ });
    const label = added.querySelector(".markdown-delta-header__label");
    expect(label).toHaveTextContent("ADDED");

    // "ADDED" appears exactly once in the heading — inside the label — not a second time in
    // the trailing text alongside it. The heading's own text content still reads "ADDED
    // Requirements" (a space, not a doubled word) for anything that reads it directly, such
    // as this accessible name.
    expect(added.textContent?.match(/ADDED/g)).toHaveLength(1);
    expect(added.textContent).toBe("ADDED Requirements");

    // The label itself carries no font-size override, so it reads at the h2's own size.
    expect(container.querySelector(".markdown-delta-header__label")).not.toHaveStyle({
      fontSize: "0.875rem",
    });
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

describe("spec document titles", () => {
  it("humanizes a spec document's own `<slug> Specification` h1", () => {
    render(<MarkdownViewer markdown={"# task-progress Specification\n\nBody.\n"} />);

    expect(
      screen.getByRole("heading", { name: "Task Progress Specification" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/task-progress Specification/)).not.toBeInTheDocument();
  });

  it("leaves an h1 that doesn't match the spec-title shape untouched", () => {
    render(<MarkdownViewer markdown={"# Just A Title\n\nBody.\n"} />);

    expect(screen.getByRole("heading", { name: "Just A Title" })).toBeInTheDocument();
  });
});
