import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusIcon } from "./StatusIcon.js";

describe("StatusIcon", () => {
  it("renders an empty ring for an in-progress change with 0 completed", () => {
    const { container } = render(<StatusIcon status="in-progress" completed={0} total={4} />);
    expect(container.querySelector("path[fill='var(--accent)']")).toBeNull();
    expect(container.querySelector("circle[stroke='var(--track)']")).not.toBeNull();
  });

  it("renders a proportional wedge for a partial in-progress fraction", () => {
    const { container } = render(<StatusIcon status="in-progress" completed={1} total={2} />);
    expect(container.querySelector("path[fill='var(--accent)']")).not.toBeNull();
  });

  it("short-circuits to done when completed equals total", () => {
    const { container } = render(<StatusIcon status="in-progress" completed={3} total={3} />);
    expect(container.querySelector("circle[fill='var(--success)']")).not.toBeNull();
  });

  it("short-circuits to done rather than an empty ring when completed exceeds total", () => {
    // Stale/inconsistent upstream data (a recount race, an off-by-one in the CLI) could
    // report more completed tasks than the total. `describePieSlice` treats fraction >= 1 as
    // "no slice to draw", so without this short-circuit the icon would render only the empty
    // track ring — visually identical to 0% complete instead of fully done.
    const { container } = render(<StatusIcon status="in-progress" completed={5} total={3} />);
    expect(container.querySelector("circle[fill='var(--success)']")).not.toBeNull();
  });

  it("renders decorative and hidden from the accessibility tree when asked", () => {
    const { container } = render(<StatusIcon status="done" decorative />);
    const svg = container.querySelector("svg");
    expect(svg).not.toHaveAttribute("role");
    expect(svg).not.toHaveAttribute("aria-label");
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });

  it("renders a neutral dashed ring for an unrecognized status", () => {
    const { container } = render(<StatusIcon status="from-the-future" />);
    const circle = container.querySelector("circle");
    expect(circle).toHaveAttribute("stroke", "var(--faint)");
    expect(circle).toHaveAttribute("stroke-dasharray", "2 2");
  });
});
