import { describe, expect, it } from "vitest";
import type { CommandResult, RunOpenSpec, RunOptions } from "./openspec-binary.js";
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
  it("treats a zero exit as a project", async () => {
    expect(await isOpenSpecProject(stubRun({ exitCode: 0, stdout: "[]" }))).toBe(true);
  });

  it("treats a non-zero exit as not a project", async () => {
    expect(await isOpenSpecProject(stubRun({ exitCode: 1, stderr: "not a project" }))).toBe(false);
  });

  it("does not capture stdout, since only the exit code is inspected", async () => {
    let received: RunOptions | undefined;
    const run: RunOpenSpec = async (_args, options) => {
      received = options;
      return { exitCode: 0, stdout: "", stderr: "" };
    };

    await isOpenSpecProject(run);

    expect(received?.captureStdout).toBe(false);
  });
});
