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
    path: "/project/openspec/changes/add-foo",
    ...overrides,
  };
}

describe("rendering a change", () => {
  it("shows the humanized title as the row's identity, a fractional status icon, the count and last-modified time", () => {
    render(<ChangesList changes={[item()]} onSelect={vi.fn()} />);

    expect(screen.getByText("Add Foo")).toBeInTheDocument();
    expect(screen.getByText("in-progress")).toBeInTheDocument();
    // The icon is decorative (the adjacent text already conveys the status), so it's an
    // `svg[data-status]`, not an accessible `img` — asserting on the attribute instead.
    expect(document.querySelector('svg[data-status="in-progress"]')).toBeInTheDocument();
    expect(screen.getByText(/1 \/ 2/)).toBeInTheDocument();
  });

  it("does not print the raw change name in the visible row", () => {
    const { container } = render(
      <ChangesList changes={[item({ name: "add-foo-bar" })]} onSelect={vi.fn()} />,
    );

    const row = container.querySelector(".changes-list__row");
    expect(row?.textContent).not.toContain("add-foo-bar");
  });

  it("exposes the raw name and the path as supplementary detail on the row", () => {
    render(
      <ChangesList
        changes={[item({ name: "add-foo-bar", path: "/proj/openspec/changes/add-foo-bar" })]}
        onSelect={vi.fn()}
      />,
    );

    const row = screen.getByRole("button", { name: /add-foo-bar/ });
    expect(row).toHaveAccessibleName(/add-foo-bar/);
    expect(row).toHaveAccessibleName(/\/proj\/openspec\/changes\/add-foo-bar/);
  });

  it("lays the row out as a single line with status, title, meter, count and time", () => {
    const { container } = render(<ChangesList changes={[item()]} onSelect={vi.fn()} />);

    const row = container.querySelector(".changes-list__row");
    expect(row).not.toBeNull();
    expect(row?.querySelector(".status-badge")).not.toBeNull();
    expect(row?.querySelector(".changes-list__title")).not.toBeNull();
    expect(row?.querySelector(".changes-list__meter")).not.toBeNull();
    expect(row?.querySelector(".changes-list__progress-count")).not.toBeNull();
    expect(row?.querySelector(".changes-list__last-modified")).not.toBeNull();
  });

  it("keeps the row's column count stable even when a change carries no status, so later columns stay aligned", () => {
    const { container } = render(
      <ChangesList changes={[item({ status: undefined })]} onSelect={vi.fn()} />,
    );

    const row = container.querySelector(".changes-list__row");
    expect(row?.querySelector(".status-badge")).toBeNull();
    expect(row?.querySelector(".changes-list__status-slot")).not.toBeNull();
    expect(row?.children).toHaveLength(5);
  });

  it("selects a change when its row is activated", async () => {
    const onSelect = vi.fn();
    render(<ChangesList changes={[item({ name: "add-foo" })]} onSelect={onSelect} />);

    await userEvent.click(screen.getByText("Add Foo"));

    expect(onSelect).toHaveBeenCalledWith("add-foo");
  });
});

describe("sorting and filtering", () => {
  it("filters the visible changes by raw name without a new request", () => {
    render(
      <ChangesList
        changes={[item({ name: "add-foo" }), item({ name: "remove-bar" })]}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText("Add Foo")).toBeInTheDocument();
    expect(screen.getByText("Remove Bar")).toBeInTheDocument();
  });

  it("narrows the list to changes whose raw name matches the filter, even though the row shows the humanized title", async () => {
    render(
      <ChangesList
        changes={[item({ name: "add-foo" }), item({ name: "remove-bar" })]}
        onSelect={vi.fn()}
      />,
    );

    await userEvent.type(screen.getByLabelText(/filter/i), "add");

    expect(screen.getByText("Add Foo")).toBeInTheDocument();
    expect(screen.queryByText("Remove Bar")).not.toBeInTheDocument();
  });

  it("opens ordered by last-modified time, most recent first", () => {
    render(
      <ChangesList
        changes={[
          item({ name: "older", lastModified: "2026-01-01T00:00:00.000Z" }),
          item({ name: "newer", lastModified: "2026-07-01T00:00:00.000Z" }),
        ]}
        onSelect={vi.fn()}
      />,
    );

    const titles = Array.from(document.querySelectorAll(".changes-list__title")).map(
      (el) => el.textContent,
    );
    expect(titles).toEqual(["Newer", "Older"]);
  });
});

describe("degradation affordances", () => {
  it("renders a neutral badge for an unrecognized status value", () => {
    render(<ChangesList changes={[item({ status: "from-the-future" })]} onSelect={vi.fn()} />);

    const badge = screen.getByText("from-the-future");
    expect(badge.className).toContain("status-badge--neutral");
  });

  it("hedges an active change's count as approximate, in words, as supplementary detail", () => {
    render(<ChangesList changes={[item({ archived: false })]} onSelect={vi.fn()} />);

    expect(screen.getByText(/1 \/ 2/)).toBeInTheDocument();
    expect(screen.queryByText(/~1 \/ 2/)).not.toBeInTheDocument();
    expect(screen.getByText(/Approximate/)).toBeInTheDocument();
  });

  it("does not mark an archived change's recomputed count as approximate", () => {
    render(<ChangesList changes={[item({ archived: true })]} onSelect={vi.fn()} />);

    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    expect(screen.queryByText(/Approximate/)).not.toBeInTheDocument();
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

  it("renders a failed change as a danger-toned callout while its siblings render normally", () => {
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

describe("loading and empty states", () => {
  it("renders placeholder rows on the real grid while loading, instead of a line of text", () => {
    const { container } = render(<ChangesList changes={[]} onSelect={vi.fn()} loading />);

    expect(container.querySelectorAll(".changes-list__row--placeholder").length).toBeGreaterThan(0);
  });

  it("announces the loading state to assistive technology, even though the placeholder rows are aria-hidden", () => {
    render(<ChangesList changes={[]} onSelect={vi.fn()} loading />);

    expect(screen.getByRole("status")).toHaveTextContent(/loading changes/i);
  });

  it("invites the user to create a change when the project has none at all", () => {
    render(<ChangesList changes={[]} onSelect={vi.fn()} />);

    expect(screen.getByText(/no active changes/i)).toBeInTheDocument();
    expect(screen.getByText(/openspec propose/)).toBeInTheDocument();
  });

  it("shows a distinct message when a filter matches nothing in a non-empty project", async () => {
    render(<ChangesList changes={[item({ name: "add-foo" })]} onSelect={vi.fn()} />);

    await userEvent.type(screen.getByLabelText(/filter/i), "zzz-no-match");

    expect(screen.getByText(/no changes match this filter/i)).toBeInTheDocument();
    expect(screen.queryByText(/no active changes/i)).not.toBeInTheDocument();
  });
});
