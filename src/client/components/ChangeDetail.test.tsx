import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { ResolvedArtifact, ResolvedChange } from "../api/changes.js";
import { ChangeDetail } from "./ChangeDetail.js";

/** Artifact overrides need only `id`; `collection` defaults to singular unless stated. */
type ArtifactOverride = Partial<ResolvedArtifact> & Pick<ResolvedArtifact, "id">;
type ChangeOverrides = Partial<Omit<ResolvedChange, "artifacts">> & {
  artifacts?: ArtifactOverride[];
};

const DEFAULT_ARTIFACTS: ArtifactOverride[] = [
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
];

function change(overrides: ChangeOverrides = {}): ResolvedChange {
  const { artifacts = DEFAULT_ARTIFACTS, ...rest } = overrides;
  return {
    name: "add-foo",
    archived: false,
    schema: { name: "spec-driven", inferred: false },
    progress: { completed: 1, total: 2 },
    artifacts: artifacts.map((artifact) => ({ collection: false, files: [], ...artifact })),
    ...rest,
  };
}

describe("the header card", () => {
  it("shows the raw name, humanized title, and the exact recomputed progress", () => {
    render(<ChangeDetail change={change()} />);

    expect(screen.getByText("add-foo")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Add Foo" })).toBeInTheDocument();
    expect(screen.getByText("1 / 2 tasks")).toBeInTheDocument();
  });

  it("does not render a per-artifact states list in the header", () => {
    const { container } = render(<ChangeDetail change={change()} />);

    expect(container.querySelector(".change-detail__artifact-states")).toBeNull();
  });

  it("shows a blocked artifact's missing dependencies through its tab, not a header list", () => {
    render(
      <ChangeDetail
        change={change({
          artifacts: [{ id: "design", status: "blocked", missingDeps: ["proposal"], files: [] }],
        })}
      />,
    );

    const tab = screen.getByRole("tab", { name: /blocked by: proposal/ });
    expect(tab).toBeInTheDocument();
  });

  it("surfaces nextSteps as an info callout", () => {
    render(<ChangeDetail change={change({ nextSteps: ["Write the proposal."] })} />);

    expect(screen.getByText("Write the proposal.")).toBeInTheDocument();
    expect(screen.getByText("Next steps")).toBeInTheDocument();
  });

  it("does not show nextSteps in the historical framing", () => {
    render(<ChangeDetail change={change({ nextSteps: ["Write the proposal."] })} historical />);

    expect(screen.queryByText("Write the proposal.")).not.toBeInTheDocument();
  });
});

describe("two-level artifact tabs", () => {
  it("renders one Level-1 tab per artifact, in schema order, with no separate status text badge", () => {
    const { container } = render(<ChangeDetail change={change()} />);

    const tabs = screen.getAllByRole("tab", { name: /proposal|tasks/i });
    expect(tabs.map((tab) => tab.textContent)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("proposal"),
        expect.stringContaining("tasks"),
      ]),
    );
    // The status is carried by the icon before the name and by the tooltip/accessible name —
    // never restated as adjacent visible text.
    expect(container.querySelector(".status-badge")).toBeNull();
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

  it("shows the file rail for a single-file collection artifact, labelled by its capability", () => {
    render(
      <ChangeDetail
        change={change({
          artifacts: [
            {
              id: "specs",
              collection: true,
              files: [
                {
                  path: "/s",
                  relPath: "specs/openspec-data-access/spec.md",
                  label: "openspec-data-access",
                  markdown: "# ADDED Requirements",
                },
              ],
            },
          ],
        })}
      />,
    );

    const rail = screen.getByRole("tablist", { name: "Files" });
    expect(rail.closest(".side-nav")).not.toBeNull();
    expect(
      screen.getByRole("tab", {
        name: /^Openspec Data Access — specs\/openspec-data-access\/spec\.md$/,
      }),
    ).toBeInTheDocument();
  });

  it("skips the file rail for a single-file singular artifact", () => {
    render(
      <ChangeDetail
        change={change({
          artifacts: [
            {
              id: "proposal",
              collection: false,
              files: [{ path: "/p", relPath: "proposal.md", label: "proposal", markdown: "# why" }],
            },
          ],
        })}
      />,
    );

    expect(screen.queryByRole("tablist", { name: "Files" })).not.toBeInTheDocument();
  });

  it("still shows the file rail for a singular artifact that resolved more than one file", () => {
    render(
      <ChangeDetail
        change={change({
          artifacts: [
            {
              id: "tasks",
              collection: false,
              files: [
                { path: "/a", relPath: "tasks/a.md", label: "a", markdown: "# a" },
                { path: "/b", relPath: "tasks/b.md", label: "b", markdown: "# b" },
              ],
            },
          ],
        })}
      />,
    );

    expect(screen.getByRole("tablist", { name: "Files" })).toBeInTheDocument();
  });

  it("shows Level-2 file tabs, labelled by the humanized derived label, for a multi-file artifact", async () => {
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

    const tabA = screen.getByRole("tab", { name: /^A — specs\/a\/spec\.md$/ });
    const tabB = screen.getByRole("tab", { name: /^B — specs\/b\/spec\.md$/ });
    expect(tabA).toHaveTextContent("A");
    expect(tabB).toHaveTextContent("B");

    await userEvent.click(tabB);
    expect(screen.getByText("b spec")).toBeInTheDocument();
  });

  it("resolves the file rail from the shared side-nav treatment, width-bounded regardless of path length", () => {
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
    expect(tabs.closest(".side-nav")).not.toBeNull();
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

    expect(screen.getAllByText("tasks could not be counted").length).toBeGreaterThan(0);
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

  it("renders the error as a danger callout in place of a body, and keeps the tab selectable", async () => {
    render(<ChangeDetail change={withErroredArtifact()} />);

    await userEvent.click(screen.getByRole("tab", { name: /adr/ }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      /could not be read: it resolves outside the project root/,
    );
  });

  it("marks the tab with an error status, not the stale `done` the binary reported", () => {
    render(<ChangeDetail change={withErroredArtifact()} />);

    const tab = screen.getByRole("tab", { name: /^adr — could not be read$/ });
    expect(tab.querySelector('[data-status="error"]')).toBeInTheDocument();
    expect(tab.querySelector('[data-status="done"]')).not.toBeInTheDocument();
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
