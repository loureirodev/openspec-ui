import { describe, expect, it } from "vitest";
import { formatRelativeDate, humanizeLabel, humanizeName } from "./format.js";

describe("humanizeName / humanizeLabel", () => {
  it("title-cases a plain kebab-case name", () => {
    expect(humanizeName("add-foo-bar")).toBe("Add Foo Bar");
  });

  it("keeps a known acronym fully capitalized", () => {
    expect(humanizeName("add-mcp-capability-runtime")).toBe("Add MCP Capability Runtime");
  });

  it("keeps every acronym in the known list capitalized", () => {
    expect(humanizeName("mcp-api-ui-cli-ai-ci")).toBe("MCP API UI CLI AI CI");
  });

  it("humanizes a label containing a path separator", () => {
    expect(humanizeLabel("specs/add-mcp-capability")).toBe("Specs Add MCP Capability");
  });
});

describe("formatRelativeDate", () => {
  const now = new Date("2026-07-15T12:00:00.000Z");

  it("renders a time within seven days as relative", () => {
    const result = formatRelativeDate("2026-07-15T09:00:00.000Z", now);
    expect(result.display).toMatch(/hour/);
    expect(result.exact).not.toBe("2026-07-15T09:00:00.000Z");
  });

  it("renders a time at the seven-day boundary as relative", () => {
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const result = formatRelativeDate(sevenDaysAgo, now);
    expect(result.display).toMatch(/week|day/);
  });

  it("does not round a minute count up into the next hour", () => {
    const almostAnHourAgo = new Date(now.getTime() - 59.6 * 60 * 1000).toISOString();
    const result = formatRelativeDate(almostAnHourAgo, now);
    expect(result.display).not.toMatch(/60 minutes/);
    expect(result.display).toMatch(/1 hour/);
  });

  it("does not round an hour count up into the next day", () => {
    const almostADayAgo = new Date(now.getTime() - 23.6 * 60 * 60 * 1000).toISOString();
    const result = formatRelativeDate(almostADayAgo, now);
    expect(result.display).not.toMatch(/24 hours/);
    // `Intl.RelativeTimeFormat`'s `numeric: "auto"` renders -1 day as "yesterday".
    expect(result.display).toMatch(/yesterday|1 day/);
  });

  it("renders a time beyond seven days as absolute", () => {
    const result = formatRelativeDate("2026-01-01T00:00:00.000Z", now);
    expect(result.display).not.toMatch(/ago/);
  });

  it("always returns the exact timestamp for the tooltip", () => {
    const result = formatRelativeDate("2026-07-01T00:00:00.000Z", now);
    expect(result.exact.length).toBeGreaterThan(0);
  });

  it("falls back to the raw value for an unparseable date", () => {
    const result = formatRelativeDate("not-a-date", now);
    expect(result.display).toBe("not-a-date");
    expect(result.exact).toBe("not-a-date");
  });
});
