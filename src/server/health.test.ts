import { describe, expect, it } from "vitest";
import { MINIMUM_OPENSPEC_VERSION } from "../shared/version.js";
import { checkHealth, type HealthDependencies } from "./health.js";

const BINARY_PATH = "/usr/local/bin/openspec";

const PROJECT_ROOT = "/work/my-project";

interface StubEnvironment {
  /** The absolute path `openspec` resolves to, or `null` when it is absent. */
  binaryPath?: string | null;
  /** The version the binary reports, or `null` when `--version` fails. */
  version?: string | null;
  /** Whether `openspec list --json` resolves a real project root. */
  isProject?: boolean;
}

/** Builds health dependencies from a described environment, recording every invocation. */
function stubEnvironment(environment: StubEnvironment): HealthDependencies & { calls: string[][] } {
  const {
    binaryPath = BINARY_PATH,
    version = MINIMUM_OPENSPEC_VERSION,
    isProject = true,
  } = environment;
  const calls: string[][] = [];

  return {
    calls,
    resolveBinaryPath: async () => binaryPath,
    run: async (args) => {
      calls.push(args);
      if (args[0] === "--version") {
        return version === null
          ? { exitCode: 1, stdout: "", stderr: "unknown flag" }
          : { exitCode: 0, stdout: `${version}\n`, stderr: "" };
      }
      if (args[0] === "list") {
        // Since 1.6.0 the command exits zero even outside a project, distinguishing the
        // two cases through the resolved root's source rather than the exit code.
        const source = isProject ? "nearest" : "implicit";
        return {
          exitCode: 0,
          stdout: JSON.stringify({ changes: [], root: { path: PROJECT_ROOT, source } }),
          stderr: "",
        };
      }
      throw new Error(`unexpected command: openspec ${args.join(" ")}`);
    },
  };
}

describe("checkHealth", () => {
  it("reports a healthy environment with the resolved path, version and project root", async () => {
    const result = await checkHealth(stubEnvironment({ version: "2.1.3" }));

    expect(result).toEqual({
      status: "ok",
      resolvedBinaryPath: BINARY_PATH,
      version: "2.1.3",
      projectRoot: PROJECT_ROOT,
    });
  });

  it("reports the binary check when no binary resolves, without a version or project root", async () => {
    const dependencies = stubEnvironment({ binaryPath: null });
    const result = await checkHealth(dependencies);

    expect(result.status).toBe("error");
    expect(result.check).toBe("binary");
    expect(result.version).toBeUndefined();
    expect(result.resolvedBinaryPath).toBeUndefined();
    expect(result.projectRoot).toBeUndefined();
    expect(result.remedy).toBeTruthy();
    expect(dependencies.calls).toEqual([]);
  });

  it("names the real npm package in the binary remedy, not the bare `openspec` name", async () => {
    const result = await checkHealth(stubEnvironment({ binaryPath: null }));

    // The `openspec` package on npm is an unrelated 0.0.0 placeholder.
    expect(result.remedy).toContain("@fission-ai/openspec");
  });

  it("reports the version check for an old binary, and attempts no project check", async () => {
    const dependencies = stubEnvironment({ version: "1.2.0" });
    const result = await checkHealth(dependencies);

    expect(result.status).toBe("error");
    expect(result.check).toBe("version");
    expect(result.version).toBe("1.2.0");
    expect(result.resolvedBinaryPath).toBe(BINARY_PATH);
    expect(dependencies.calls).toEqual([["--version"]]);
  });

  it("names the detected version, the minimum and the resolved path in the version remedy", async () => {
    const result = await checkHealth(stubEnvironment({ version: "1.2.0" }));

    expect(result.remedy).toContain("1.2.0");
    expect(result.remedy).toContain(MINIMUM_OPENSPEC_VERSION);
    expect(result.remedy).toContain(BINARY_PATH);
  });

  it("reports the version check when the binary reports no usable version", async () => {
    const dependencies = stubEnvironment({ version: null });
    const result = await checkHealth(dependencies);

    expect(result.check).toBe("version");
    expect(result.version).toBeUndefined();
    expect(result.resolvedBinaryPath).toBe(BINARY_PATH);
    expect(dependencies.calls).toEqual([["--version"]]);
  });

  it("reports the project check for a supported binary outside a project", async () => {
    const dependencies = stubEnvironment({ isProject: false });
    const result = await checkHealth(dependencies);

    expect(result.status).toBe("error");
    expect(result.check).toBe("project");
    expect(result.resolvedBinaryPath).toBe(BINARY_PATH);
    expect(result.version).toBe(MINIMUM_OPENSPEC_VERSION);
    expect(result.projectRoot).toBeUndefined();
    expect(dependencies.calls).toEqual([["--version"], ["list", "--json"]]);
  });

  it("rejects a prerelease of the minimum version", async () => {
    const result = await checkHealth(stubEnvironment({ version: "1.6.0-beta.1" }));

    expect(result.check).toBe("version");
    expect(result.version).toBe("1.6.0-beta.1");
  });

  it("rejects the previous minimum version", async () => {
    const result = await checkHealth(stubEnvironment({ version: "1.5.0" }));

    expect(result.check).toBe("version");
    expect(result.version).toBe("1.5.0");
  });

  it("accepts a prerelease of a version newer than the minimum", async () => {
    const result = await checkHealth(stubEnvironment({ version: "1.7.0-rc.1" }));

    expect(result).toEqual({
      status: "ok",
      resolvedBinaryPath: BINARY_PATH,
      version: "1.7.0-rc.1",
      projectRoot: PROJECT_ROOT,
    });
  });

  it("caches nothing: a repaired environment is reflected on the next call", async () => {
    const broken = await checkHealth(stubEnvironment({ binaryPath: null }));
    expect(broken.status).toBe("error");
    expect(broken.check).toBe("binary");

    const repaired = await checkHealth(stubEnvironment({}));
    expect(repaired.status).toBe("ok");
  });
});
