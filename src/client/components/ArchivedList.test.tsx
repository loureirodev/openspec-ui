import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ArchivedList } from "./ArchivedList.js";

describe("the archived list", () => {
  it("shows an archived change's name and archived date", () => {
    render(
      <ArchivedList
        changes={[{ name: "old-feature", archivedDate: "2026-07-01" }]}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText("old-feature")).toBeInTheDocument();
    expect(screen.getByText(/2026-07-01/)).toBeInTheDocument();
  });

  it("groups the mono name and archived date into one row, with the humanized title demoted below it", () => {
    const { container } = render(
      <ArchivedList
        changes={[{ name: "old-feature", archivedDate: "2026-07-01" }]}
        onSelect={vi.fn()}
      />,
    );

    const row = container.querySelector(".archived-list__row");
    expect(row).not.toBeNull();
    expect(row?.querySelector(".archived-list__name")).not.toBeNull();
    expect(row?.querySelector(".archived-list__date")).not.toBeNull();

    const title = container.querySelector(".archived-list__title");
    expect(row?.contains(title)).toBe(false);
  });

  it("renders an empty state rather than an error when there are none", () => {
    render(<ArchivedList changes={[]} onSelect={vi.fn()} />);

    expect(screen.getByText(/no archived changes/i)).toBeInTheDocument();
  });

  it("selects an archived change when activated", async () => {
    const onSelect = vi.fn();
    render(
      <ArchivedList
        changes={[{ name: "old-feature", archivedDate: "2026-07-01" }]}
        onSelect={onSelect}
      />,
    );

    await userEvent.click(screen.getByText("old-feature"));

    expect(onSelect).toHaveBeenCalledWith("old-feature");
  });
});
