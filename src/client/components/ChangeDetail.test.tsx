import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { ResolvedChange } from "../api/changes.js";
import { ChangeDetail } from "./ChangeDetail.js";

function change(overrides: Partial<ResolvedChange> = {}): ResolvedChange {
  return {
    name: "add-foo",
    archived: false,
    schema: { name: "spec-driven", inferred: false },
    progress: { completed: 1, total: 2 },
    artifacts: [
      {
        id: "proposal",
        status: "done",
        files: [{ path: "/p", relPath: "proposal.md", label: "proposal", markdown: "# proposal" }],
      },
      {
        id: "tasks",
        status: "in-progress",
        files: [{ path: "/t", relPath: "tasks.md", label: "tasks", markdown: "- [x] a\n- [ ] b" }],
      },
    ],
    ...overrides,
  };
}

describe("the header card", () => {
  it("shows each artifact's state and the exact recomputed progress", () => {
    render(<ChangeDetail change={change()} />);

    expect(screen.getByText("1 / 2 tasks")).toBeInTheDocument();
    expect(screen.getAllByText("done")).not.toHaveLength(0);
    expect(screen.getAllByText("in-progress")).not.toHaveLength(0);
  });

  it("shows a blocked artifact's missing dependencies", () => {
    render(
      <ChangeDetail
        change={change({
          artifacts: [{ id: "design", status: "blocked", missingDeps: ["proposal"], files: [] }],
        })}
      />,
    );

    expect(screen.getByText(/blocked by: proposal/)).toBeInTheDocument();
  });

  it("surfaces nextSteps when present", () => {
    render(<ChangeDetail change={change({ nextSteps: ["Write the proposal."] })} />);

    expect(screen.getByText("Write the proposal.")).toBeInTheDocument();
  });

  it("does not show nextSteps in the historical framing", () => {
    render(<ChangeDetail change={change({ nextSteps: ["Write the proposal."] })} historical />);

    expect(screen.queryByText("Write the proposal.")).not.toBeInTheDocument();
  });
});

describe("two-level artifact tabs", () => {
  it("renders one Level-1 tab per artifact, in schema order", () => {
    render(<ChangeDetail change={change()} />);

    const tabs = screen.getAllByRole("tab", { name: /proposal|tasks/i });
    expect(tabs.map((tab) => tab.textContent)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("proposal"),
        expect.stringContaining("tasks"),
      ]),
    );
  });

  it("dims and disables an artifact with no files", () => {
    render(
      <ChangeDetail
        change={change({ artifacts: [{ id: "design", files: [] }, ...change().artifacts] })}
      />,
    );

    expect(screen.getByRole("tab", { name: /design/i })).toBeDisabled();
  });

  it("skips Level 2 for a single-file artifact and renders its content directly", () => {
    render(<ChangeDetail change={change()} />);

    expect(screen.queryByRole("tablist", { name: "Files" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "proposal" })).toBeInTheDocument();
  });

  it("shows Level-2 file tabs, labelled by the derived short label, for a multi-file artifact", async () => {
    render(
      <ChangeDetail
        change={change({
          artifacts: [
            {
              id: "specs",
              files: [
                { path: "/a", relPath: "specs/a/spec.md", label: "a", markdown: "# a spec" },
                { path: "/b", relPath: "specs/b/spec.md", label: "b", markdown: "# b spec" },
              ],
            },
          ],
        })}
      />,
    );

    const tabA = screen.getByRole("tab", { name: "a" });
    const tabB = screen.getByRole("tab", { name: "b" });
    expect(tabA).toBeInTheDocument();
    expect(tabB).toBeInTheDocument();
    // The full relative path stays available on hover via `title`, not in the label text.
    expect(tabA).toHaveAttribute("title", "specs/a/spec.md");
    expect(tabB).toHaveAttribute("title", "specs/b/spec.md");

    await userEvent.click(tabB);
    expect(screen.getByText("b spec")).toBeInTheDocument();
  });

  it("keeps the file-tab column width-bounded even for a very long relative path", () => {
    render(
      <ChangeDetail
        change={change({
          artifacts: [
            {
              id: "specs",
              files: [
                {
                  path: "/a",
                  relPath:
                    "specs/an-extremely-long-capability-name-that-would-otherwise-displace-the-layout/spec.md",
                  label:
                    "an-extremely-long-capability-name-that-would-otherwise-displace-the-layout",
                  markdown: "# a spec",
                },
                { path: "/b", relPath: "specs/b/spec.md", label: "b", markdown: "# b spec" },
              ],
            },
          ],
        })}
      />,
    );

    const tabs = screen.getByRole("tablist", { name: "Files" });
    expect(tabs).toHaveClass("change-detail__file-tabs");
  });

  it("renders one tab per artifact from a custom schema with no code change", () => {
    render(
      <ChangeDetail
        change={change({
          schema: { name: "custom", inferred: false },
          artifacts: [
            {
              id: "rfc",
              status: "done",
              files: [{ path: "/r", relPath: "rfc.md", label: "rfc", markdown: "# rfc" }],
            },
          ],
        })}
      />,
    );

    expect(screen.getByRole("tab", { name: /rfc/i })).toBeInTheDocument();
  });
});

describe("historical framing of spec deltas", () => {
  it("collapses a historical artifact's content by default, expandable on demand", () => {
    const { container } = render(
      <ChangeDetail
        change={change({
          artifacts: [
            {
              id: "specs",
              historical: true,
              files: [
                {
                  path: "/s",
                  relPath: "specs/core/spec.md",
                  label: "core",
                  markdown: "# ADDED Requirements",
                },
              ],
            },
          ],
        })}
        historical
      />,
    );

    const details = container.querySelector("details.change-detail__historical-body");
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute("open");
  });
});

describe("progress the server could not compute", () => {
  it("says so instead of asserting 0 / 0", () => {
    render(
      <ChangeDetail
        change={change({ progress: { completed: 0, total: 0 }, progressUnknown: true })}
      />,
    );

    expect(screen.getByText("tasks could not be counted")).toBeInTheDocument();
    expect(screen.queryByText("0 / 0 tasks")).not.toBeInTheDocument();
  });

  it("shows the count normally when progress is known", () => {
    render(<ChangeDetail change={change()} />);
    expect(screen.getByText("1 / 2 tasks")).toBeInTheDocument();
  });
});

describe("an artifact whose files could not be read", () => {
  const withErroredArtifact = () =>
    change({
      artifacts: [
        {
          id: "proposal",
          status: "done",
          files: [
            { path: "/p", relPath: "proposal.md", label: "proposal", markdown: "# Why this ships" },
          ],
        },
        {
          id: "adr",
          status: "done",
          files: [],
          error: { kind: "unknown", message: "it resolves outside the project root." },
        },
      ],
    });

  it("renders the error in place of a body, and keeps the tab selectable", async () => {
    render(<ChangeDetail change={withErroredArtifact()} />);

    await userEvent.click(screen.getByRole("tab", { name: /adr/ }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      /could not be read: it resolves outside the project root/,
    );
  });

  it("still renders the sibling artifacts that resolved", () => {
    render(<ChangeDetail change={withErroredArtifact()} />);

    // The contained failure did not cost us the readable artifact: its body is on screen.
    expect(screen.getByRole("tab", { name: /proposal/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Why this ships" })).toBeInTheDocument();
  });

  it("leaves an artifact with no files and no error disabled", () => {
    render(
      <ChangeDetail
        change={change({
          artifacts: [
            {
              id: "proposal",
              status: "done",
              files: [{ path: "/p", relPath: "proposal.md", label: "proposal", markdown: "# p" }],
            },
            // The archived out-of-tree case: nothing to show, and nothing went wrong.
            { id: "adr", files: [] },
          ],
        })}
      />,
    );

    expect(screen.getByRole("tab", { name: /adr/ })).toBeDisabled();
  });
});
