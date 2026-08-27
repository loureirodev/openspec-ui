import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Tooltip } from "./Tooltip.js";

/** The wrapper is the tooltip's outermost element — the one carrying the anchor modifier. */
function wrapperOf(container: HTMLElement): HTMLElement {
  return container.firstElementChild as HTMLElement;
}

describe("Tooltip anchoring", () => {
  it("centres the bubble by default", () => {
    const { container } = render(
      <Tooltip content="detail">
        <button type="button">trigger</button>
      </Tooltip>,
    );
    const cls = wrapperOf(container).className;
    expect(cls).not.toMatch(/start/);
    expect(cls).not.toMatch(/end/);
  });

  it("carries the start modifier when anchored left", () => {
    const { container } = render(
      <Tooltip start content="detail">
        <button type="button">trigger</button>
      </Tooltip>,
    );
    expect(wrapperOf(container).className).toMatch(/start/);
  });

  it("carries the end modifier when anchored right", () => {
    const { container } = render(
      <Tooltip end content="detail">
        <button type="button">trigger</button>
      </Tooltip>,
    );
    expect(wrapperOf(container).className).toMatch(/end/);
  });
});
