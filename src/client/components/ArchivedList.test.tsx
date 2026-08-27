import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ArchivedList } from "./ArchivedList.js";

function item(overrides: Partial<Parameters<typeof ArchivedList>[0]["changes"][number]> = {}) {
  return {
    name: "old-feature",
    archivedDate: "2026-07-01",
    path: "/proj/openspec/changes/archive/2026-07-01-old-feature",
    ...overrides,
  };
}

describe("the archived list", () => {
  it("shows the humanized title and the archived date as the row's identity", () => {
    render(<ArchivedList changes={[item()]} onSelect={vi.fn()} />);

    expect(screen.getByText("Old Feature")).toBeInTheDocument();
    expect(document.querySelector(".archived-list__date")).toHaveTextContent("2026-07-01");
  });

  it("does not print the raw change name in the visible row, but exposes it and the path in the accessible name", () => {
    const { container } = render(<ArchivedList changes={[item()]} onSelect={vi.fn()} />);

    // The name still exists in the DOM, inside the (aria-hidden) tooltip bubble — it is the
    // *visible row* itself that must not carry it.
    const row = container.querySelector(".archived-list__row");
    expect(row?.textContent).not.toContain("old-feature");

    const button = screen.getByRole("button", { name: /old-feature/ });
    expect(button).toHaveAccessibleName(/old-feature/);
    expect(button).toHaveAccessibleName(/changes\/archive\/2026-07-01-old-feature/);
  });

  it("lays the row out on the same shape as the active changes list", () => {
    const { container } = render(<ArchivedList changes={[item()]} onSelect={vi.fn()} />);

    const row = container.querySelector(".archived-list__row");
    expect(row).not.toBeNull();
    expect(row?.querySelector(".archived-list__title")).not.toBeNull();
    expect(row?.querySelector(".archived-list__date")).not.toBeNull();
  });

  it("orders the list by archived date, most recent first", () => {
    render(
      <ArchivedList
        changes={[
          item({ name: "older", archivedDate: "2026-01-01" }),
          item({ name: "newer", archivedDate: "2026-07-01" }),
        ]}
        onSelect={vi.fn()}
      />,
    );

    const titles = Array.from(document.querySelectorAll(".archived-list__title")).map(
      (el) => el.textContent,
    );
    expect(titles).toEqual(["Newer", "Older"]);
  });

  it("renders an empty state rather than an error when there are none", () => {
    render(<ArchivedList changes={[]} onSelect={vi.fn()} />);

    expect(screen.getByText(/no archived changes/i)).toBeInTheDocument();
  });

  it("selects an archived change when activated", async () => {
    const onSelect = vi.fn();
    render(<ArchivedList changes={[item()]} onSelect={onSelect} />);

    await userEvent.click(screen.getByText("Old Feature"));

    expect(onSelect).toHaveBeenCalledWith("old-feature");
  });
});
