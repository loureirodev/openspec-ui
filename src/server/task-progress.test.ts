import { describe, expect, it } from "vitest";
import { aggregateProgress, countCheckboxes } from "./task-progress.js";

describe("countCheckboxes", () => {
  it("counts a mix of checked and unchecked boxes", () => {
    const content = ["- [ ] one", "- [x] two", "- [X] three"].join("\n");
    expect(countCheckboxes(content)).toEqual({ completed: 2, total: 3 });
  });

  it("ignores headings, prose and non-checkbox bullets", () => {
    const content = [
      "## Heading",
      "Some prose describing [x] in text.",
      "- a plain bullet",
      "- [ ] real",
    ].join("\n");
    expect(countCheckboxes(content)).toEqual({ completed: 0, total: 1 });
  });

  it("counts indented checkboxes nested under a parent bullet", () => {
    const content = ["- parent", "    - [x] nested done", "    - [ ] nested todo"].join("\n");
    expect(countCheckboxes(content)).toEqual({ completed: 1, total: 2 });
  });

  it("reports zero for content with no checkboxes", () => {
    expect(countCheckboxes("just some words")).toEqual({ completed: 0, total: 0 });
  });
});

describe("aggregateProgress", () => {
  it("sums completed and total across multiple files", () => {
    const fileA = ["- [x] a1", "- [ ] a2"].join("\n");
    const fileB = ["- [x] b1", "- [X] b2", "- [ ] b3"].join("\n");
    expect(aggregateProgress([fileA, fileB])).toEqual({ completed: 3, total: 5 });
  });

  it("yields zero total when there are no task files", () => {
    expect(aggregateProgress([])).toEqual({ completed: 0, total: 0 });
  });
});
