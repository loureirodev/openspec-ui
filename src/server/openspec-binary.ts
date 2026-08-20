import { isAbsolute, resolve } from "node:path";
import spawn from "cross-spawn";
import semver from "semver";
import { SUPPORTED_OPENSPEC_RANGE } from "../shared/version.js";
// `openspec-data` imports only *types* from this module, so this edge introduces no
// runtime cycle; it lets the project check reuse the one JSON parser and typed shape.
import { type ChangesList, isResolvedRoot, parseCommandJson } from "./openspec-data.js";

/** The name of the binary this dashboard shells out to, as it appears on `PATH`. */
export const OPENSPEC_BINARY = "openspec";

/** The npm package that provides the binary. The bare `openspec` name is not it. */
export const OPENSPEC_PACKAGE = "@fission-ai/openspec";

/** Exit code reported when the command could not be spawned at all. */
export const SPAWN_FAILED = -1;

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface RunOptions {
  /**
   * Buffer stdout into the result. Defaults to `true`; pass `false` when the caller only
   * inspects the exit code, so a large output (e.g. `list --json` in a big project) is
   * discarded at the pipe instead of accumulated in memory.
   */
  captureStdout?: boolean;
}

/** Runs `openspec` with the given arguments. Injected so tests can stub the subprocess. */
export type RunOpenSpec = (args: string[], options?: RunOptions) => Promise<CommandResult>;

/** Resolves the `openspec` binary on `PATH`. Injected so tests can stub the lookup. */
export type ResolveBinaryPath = () => Promise<string | null>;

/**
 * Spawns a command without a shell — `cross-spawn` resolves Windows `.cmd` shims
 * directly, so no shell quoting surface is introduced. Never rejects: a non-zero
 * exit and a failure to spawn are both ordinary results.
 */
function runCommand(command: string, args: string[], captureStdout = true): Promise<CommandResult> {
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", captureStdout ? "pipe" : "ignore", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (error: Error) => {
      resolvePromise({ exitCode: SPAWN_FAILED, stdout, stderr: error.message });
    });
    child.on("close", (code: number | null) => {
      resolvePromise({ exitCode: code ?? SPAWN_FAILED, stdout, stderr });
    });
  });
}

export const runOpenSpec: RunOpenSpec = (args, options) =>
  runCommand(OPENSPEC_BINARY, args, options?.captureStdout ?? true);

/** The absolute path `openspec` resolves to on `PATH`, or `null` when it is absent. */
export const resolveBinaryPath: ResolveBinaryPath = async () => {
  const finder = process.platform === "win32" ? "where" : "which";
  const { exitCode, stdout } = await runCommand(finder, [OPENSPEC_BINARY]);
  if (exitCode !== 0) return null;

  // `where` reports every match, one per line; the first is the one that wins.
  const [first] = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (!first) return null;
  return isAbsolute(first) ? first : resolve(first);
};

const SEMVER_PATTERN = /\d+\.\d+\.\d+(?:-[0-9A-Za-z-.]+)?(?:\+[0-9A-Za-z-.]+)?/;

/** The version the binary reports, or `null` when it cannot be obtained or parsed. */
export async function detectVersion(run: RunOpenSpec): Promise<string | null> {
  const { exitCode, stdout } = await run(["--version"]);
  if (exitCode !== 0) return null;

  const match = SEMVER_PATTERN.exec(stdout);
  if (!match) return null;
  return semver.valid(match[0]);
}

/**
 * Whether a reported version satisfies the supported range. `includePrerelease` lets a
 * prerelease of a version *newer* than the minimum through (e.g. `1.6.0-rc.1`); a
 * prerelease of the minimum itself still sorts below it and is correctly rejected.
 */
export function isSupportedVersion(version: string): boolean {
  return semver.satisfies(version, SUPPORTED_OPENSPEC_RANGE, { includePrerelease: true });
}

/**
 * Whether the working directory resolves to an OpenSpec project. The binary is the
 * sole authority; the filesystem is never inspected for an `openspec/` directory.
 *
 * A zero exit is necessary but no longer sufficient. Since 1.6.0, `list --json`
 * succeeds even outside a project by falling back to an `implicit` root anchored at
 * the working directory, so we inspect the reported `root.source`: only a resolved
 * root (`nearest`, `declared`, `store`) counts as a project; `implicit` does not.
 */
export async function isOpenSpecProject(run: RunOpenSpec): Promise<boolean> {
  const result = await run(["list", "--json"]);
  if (result.exitCode !== 0) return false;

  try {
    // Parsed through the shared wrapper so the project check and root resolution read the
    // same typed `root`, rather than each casting the body to its own inline shape.
    return isResolvedRoot(parseCommandJson<ChangesList>(result, "list --json").root);
  } catch {
    return false;
  }
}
