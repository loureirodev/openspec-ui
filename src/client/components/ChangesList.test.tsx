import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ChangeListItem } from "../api/changes.js";
import { ChangesList } from "./ChangesList.js";

function item(overrides: Partial<ChangeListItem> = {}): ChangeListItem {
  return {
    name: "add-foo",
    archived: false,
    status: "in-progress",
    completedTasks: 1,
    totalTasks: 2,
    lastModified: "2026-07-01T00:00:00.000Z",
    schema: { name: "spec-driven", inferred: false },
    ...overrides,
  };
}

describe("rendering a change", () => {
  it("shows the name and title, a progress bar, a status badge, and last-modified", () => {
    render(<ChangesList changes={[item()]} onSelect={vi.fn()} />);

    expect(screen.getByText("add-foo")).toBeInTheDocument();
    expect(screen.getByText("Add Foo")).toBeInTheDocument();
    expect(screen.getByText("in-progress")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(screen.getByText(/2026/)).toBeInTheDocument();
  });

  it("selects a change when its card is activated", async () => {
    const onSelect = vi.fn();
    render(<ChangesList changes={[item({ name: "add-foo" })]} onSelect={onSelect} />);

    await userEvent.click(screen.getByText("Add Foo"));

    expect(onSelect).toHaveBeenCalledWith("add-foo");
  });
});

describe("sorting and filtering", () => {
  it("filters the visible changes by name without a new request", () => {
    render(
      <ChangesList
        changes={[item({ name: "add-foo" }), item({ name: "remove-bar" })]}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText("add-foo")).toBeInTheDocument();
    expect(screen.getByText("remove-bar")).toBeInTheDocument();
  });

  it("narrows the list to changes matching the filter text", async () => {
    render(
      <ChangesList
        changes={[item({ name: "add-foo" }), item({ name: "remove-bar" })]}
        onSelect={vi.fn()}
      />,
    );

    await userEvent.type(screen.getByLabelText(/filter/i), "add");

    expect(screen.getByText("add-foo")).toBeInTheDocument();
    expect(screen.queryByText("remove-bar")).not.toBeInTheDocument();
  });

  it("sorts by name by default, without a new request", () => {
    const { container } = render(
      <ChangesList
        changes={[item({ name: "b-change" }), item({ name: "a-change" })]}
        onSelect={vi.fn()}
      />,
    );

    const names = Array.from(container.querySelectorAll(".changes-list__name")).map(
      (el) => el.textContent,
    );
    expect(names).toEqual(["a-change", "b-change"]);
  });
});

describe("degradation affordances", () => {
  it("renders a neutral badge for an unrecognized status value", () => {
    render(<ChangesList changes={[item({ status: "from-the-future" })]} onSelect={vi.fn()} />);

    const badge = screen.getByText("from-the-future");
    expect(badge.className).toContain("status-badge--neutral");
  });

  it("marks an active change's count as approximate", () => {
    render(<ChangesList changes={[item({ archived: false })]} onSelect={vi.fn()} />);

    expect(screen.getByText(/~1 \/ 2/)).toBeInTheDocument();
  });

  it("does not mark an archived change's recomputed count as approximate", () => {
    render(<ChangesList changes={[item({ archived: true })]} onSelect={vi.fn()} />);

    expect(screen.getByText("1 / 2")).toBeInTheDocument();
  });

  it("labels an inferred schema as inferred", () => {
    render(
      <ChangesList
        changes={[item({ schema: { name: "spec-driven", inferred: true } })]}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText(/schema inferred/i)).toBeInTheDocument();
  });

  it("renders a failed change as a could-not-load card while its siblings render normally", () => {
    render(
      <ChangesList
        changes={[
          item({ name: "healthy" }),
          {
            name: "broken",
            archived: false,
            completedTasks: 0,
            totalTasks: 0,
            error: { kind: "unknown", message: "boom" },
          },
        ]}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText(/could not load/i)).toHaveTextContent("broken");
    expect(screen.getByText("boom")).toBeInTheDocument();
    expect(screen.getByText("Healthy")).toBeInTheDocument();
  });
});
