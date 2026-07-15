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
        files: [{ path: "/p", relPath: "proposal.md", markdown: "# proposal" }],
      },
      {
        id: "tasks",
        status: "in-progress",
        files: [{ path: "/t", relPath: "tasks.md", markdown: "- [x] a\n- [ ] b" }],
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

  it("shows Level-2 file tabs, labelled by relative path, for a multi-file artifact", async () => {
    render(
      <ChangeDetail
        change={change({
          artifacts: [
            {
              id: "specs",
              files: [
                { path: "/a", relPath: "specs/a/spec.md", markdown: "# a spec" },
                { path: "/b", relPath: "specs/b/spec.md", markdown: "# b spec" },
              ],
            },
          ],
        })}
      />,
    );

    expect(screen.getByRole("tab", { name: "specs/a/spec.md" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "specs/b/spec.md" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "specs/b/spec.md" }));
    expect(screen.getByText("b spec")).toBeInTheDocument();
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
              files: [{ path: "/r", relPath: "rfc.md", markdown: "# rfc" }],
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
                { path: "/s", relPath: "specs/core/spec.md", markdown: "# ADDED Requirements" },
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
