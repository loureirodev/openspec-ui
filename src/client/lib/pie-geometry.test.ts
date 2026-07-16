import { describe, expect, it } from "vitest";
import { describePieSlice, pointOnCircle } from "./pie-geometry.js";

describe("pointOnCircle", () => {
  it("starts at 12 o'clock for fraction 0", () => {
    const point = pointOnCircle(8, 8, 6, 0);
    expect(point.x).toBeCloseTo(8);
    expect(point.y).toBeCloseTo(2);
  });

  it("reaches 3 o'clock a quarter of the way clockwise", () => {
    const point = pointOnCircle(8, 8, 6, 0.25);
    expect(point.x).toBeCloseTo(14);
    expect(point.y).toBeCloseTo(8);
  });

  it("returns to 12 o'clock at fraction 1", () => {
    const point = pointOnCircle(8, 8, 6, 1);
    expect(point.x).toBeCloseTo(8);
    expect(point.y).toBeCloseTo(2);
  });
});

describe("describePieSlice", () => {
  it("renders no slice at 0% (an empty ring)", () => {
    expect(describePieSlice(8, 8, 6, 0)).toBeNull();
  });

  it("renders a small-arc slice for a partial fraction under one half", () => {
    const path = describePieSlice(8, 8, 6, 1 / 3);
    expect(path).not.toBeNull();
    expect(path).toMatch(/A 6 6 0 0 1/);
  });

  it("renders a large-arc slice for a partial fraction over one half", () => {
    const path = describePieSlice(8, 8, 6, 2 / 3);
    expect(path).not.toBeNull();
    expect(path).toMatch(/A 6 6 0 1 1/);
  });

  it("renders no slice at 100% (a solid filled circle instead)", () => {
    expect(describePieSlice(8, 8, 6, 1)).toBeNull();
  });
});
