import { describe, expect, it } from "vitest";
import type { CommandResult, RunOpenSpec } from "./openspec-binary.js";
import { detectVersion, isOpenSpecProject, isSupportedVersion } from "./openspec-binary.js";

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

describe("isOpenSpecProject", () => {
  const listJson = (source: string) =>
    JSON.stringify({ changes: [], root: { path: "/p", source } });

  it("treats a resolved root as a project", async () => {
    expect(await isOpenSpecProject(stubRun({ exitCode: 0, stdout: listJson("nearest") }))).toBe(
      true,
    );
  });

  it("treats a declared-store root as a project", async () => {
    expect(await isOpenSpecProject(stubRun({ exitCode: 0, stdout: listJson("declared") }))).toBe(
      true,
    );
  });

  it("treats an implicit root as not a project", async () => {
    // Since 1.6.0 the command exits zero outside a project, anchoring an implicit root at cwd.
    expect(await isOpenSpecProject(stubRun({ exitCode: 0, stdout: listJson("implicit") }))).toBe(
      false,
    );
  });

  it("treats a non-zero exit as not a project", async () => {
    expect(await isOpenSpecProject(stubRun({ exitCode: 1, stderr: "not a project" }))).toBe(false);
  });

  it("treats unparseable output as not a project", async () => {
    expect(await isOpenSpecProject(stubRun({ exitCode: 0, stdout: "not json" }))).toBe(false);
  });

  it("treats output without a root as not a project", async () => {
    expect(await isOpenSpecProject(stubRun({ exitCode: 0, stdout: "{}" }))).toBe(false);
  });
});
