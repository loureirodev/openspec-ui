import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusIcon } from "./StatusIcon.js";

describe("StatusIcon", () => {
  it("maps a change's `in-progress` status to the play glyph in the accent colour", () => {
    const { container } = render(<StatusIcon status="in-progress" />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("data-status", "in-progress");
    expect(svg).toHaveStyle({ color: "var(--accent)" });
  });

  it("maps `complete` and `done` to the same green check glyph", () => {
    const complete = render(<StatusIcon status="complete" />).container.querySelector("svg");
    const done = render(<StatusIcon status="done" />).container.querySelector("svg");
    expect(complete).toHaveStyle({ color: "var(--success)" });
    expect(done?.innerHTML).toBe(complete?.innerHTML);
  });

  it("maps a change's `no-tasks` and an artifact's `ready` to the same neutral todo glyph", () => {
    const noTasks = render(<StatusIcon status="no-tasks" />).container.querySelector("svg");
    const ready = render(<StatusIcon status="ready" />).container.querySelector("svg");
    expect(noTasks?.innerHTML).toBe(ready?.innerHTML);
    expect(ready).toHaveStyle({ color: "var(--muted)" });
  });

  it("maps `blocked` and `error` to danger-toned glyphs", () => {
    expect(render(<StatusIcon status="blocked" />).container.querySelector("svg")).toHaveStyle({
      color: "var(--danger)",
    });
    expect(render(<StatusIcon status="error" />).container.querySelector("svg")).toHaveStyle({
      color: "var(--danger)",
    });
  });

  it("renders the archive glyph for archived / closed framing", () => {
    const archived = render(<StatusIcon status="archived" />).container.querySelector("svg");
    const closed = render(<StatusIcon status="closed" />).container.querySelector("svg");
    expect(archived?.innerHTML).toBe(closed?.innerHTML);
    expect(archived).toHaveStyle({ color: "var(--muted)" });
  });

  it("renders the markdown checklist glyphs: green when done, muted when not", () => {
    expect(render(<StatusIcon status="task-done" />).container.querySelector("svg")).toHaveStyle({
      color: "var(--success)",
    });
    expect(render(<StatusIcon status="task-todo" />).container.querySelector("svg")).toHaveStyle({
      color: "var(--muted)",
    });
  });

  it("renders decorative and hidden from the accessibility tree when asked", () => {
    const { container } = render(<StatusIcon status="done" decorative />);
    const svg = container.querySelector("svg");
    expect(svg).not.toHaveAttribute("role");
    expect(svg).not.toHaveAttribute("aria-label");
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });

  it("falls back to the neutral `unknown` glyph for an unrecognized status", () => {
    const { container } = render(<StatusIcon status="from-the-future" />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("data-status", "from-the-future");
    expect(svg).toHaveStyle({ color: "var(--faint)" });
  });
});
