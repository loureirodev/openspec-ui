import { describe, expect, it } from "vitest";
import type { CommandResult, RunOpenSpec } from "./openspec-binary.js";
import { detectProjectRoot, detectVersion, isSupportedVersion } from "./openspec-binary.js";

function stubRun(result: Partial<CommandResult>): RunOpenSpec {
  return async () => ({ exitCode: 0, stdout: "", stderr: "", ...result });
}

describe("isSupportedVersion", () => {
  it("accepts the exact minimum version", () => {
    expect(isSupportedVersion("1.6.0")).toBe(true);
  });

  it("accepts a newer version", () => {
    expect(isSupportedVersion("2.1.3")).toBe(true);
  });

  it("rejects an older version", () => {
    expect(isSupportedVersion("1.2.0")).toBe(false);
  });

  it("rejects the previous minimum version", () => {
    expect(isSupportedVersion("1.5.0")).toBe(false);
  });

  it("rejects a prerelease of the minimum version", () => {
    expect(isSupportedVersion("1.6.0-beta.1")).toBe(false);
  });
});

describe("detectVersion", () => {
  it("parses a bare version string", async () => {
    expect(await detectVersion(stubRun({ stdout: "1.5.0\n" }))).toBe("1.5.0");
  });

  it("parses a version embedded in surrounding text", async () => {
    expect(await detectVersion(stubRun({ stdout: "openspec version 2.1.3 (linux)\n" }))).toBe(
      "2.1.3",
    );
  });

  it("preserves a prerelease suffix rather than coercing it away", async () => {
    expect(await detectVersion(stubRun({ stdout: "1.5.0-beta.1\n" }))).toBe("1.5.0-beta.1");
  });

  it("returns null when the command exits non-zero", async () => {
    expect(await detectVersion(stubRun({ exitCode: 1, stderr: "boom" }))).toBeNull();
  });

  it("returns null when no version can be parsed from the output", async () => {
    expect(await detectVersion(stubRun({ stdout: "no version here" }))).toBeNull();
  });
});

describe("detectProjectRoot", () => {
  const listJson = (source: string, path = "/p") =>
    JSON.stringify({ changes: [], root: { path, source } });

  it("returns the path of a resolved root", async () => {
    expect(
      await detectProjectRoot(stubRun({ exitCode: 0, stdout: listJson("nearest", "/work/proj") })),
    ).toBe("/work/proj");
  });

  it("returns the path of a declared-store root", async () => {
    expect(await detectProjectRoot(stubRun({ exitCode: 0, stdout: listJson("declared") }))).toBe(
      "/p",
    );
  });

  it("returns null for an implicit root", async () => {
    // Since 1.6.0 the command exits zero outside a project, anchoring an implicit root at cwd.
    expect(
      await detectProjectRoot(stubRun({ exitCode: 0, stdout: listJson("implicit") })),
    ).toBeNull();
  });

  it("returns null for a non-zero exit", async () => {
    expect(await detectProjectRoot(stubRun({ exitCode: 1, stderr: "not a project" }))).toBeNull();
  });

  it("returns null for unparseable output", async () => {
    expect(await detectProjectRoot(stubRun({ exitCode: 0, stdout: "not json" }))).toBeNull();
  });

  it("returns null for output without a root", async () => {
    expect(await detectProjectRoot(stubRun({ exitCode: 0, stdout: "{}" }))).toBeNull();
  });
});
