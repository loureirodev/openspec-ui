import type { HealthResponse } from "../shared/health.js";
import { MINIMUM_OPENSPEC_VERSION } from "../shared/version.js";
import type { ResolveBinaryPath, RunOpenSpec } from "./openspec-binary.js";
import {
  resolveBinaryPath as defaultResolveBinaryPath,
  runOpenSpec as defaultRunOpenSpec,
  detectProjectRoot,
  detectVersion,
  isSupportedVersion,
  OPENSPEC_BINARY,
  OPENSPEC_PACKAGE,
} from "./openspec-binary.js";

export interface HealthDependencies {
  resolveBinaryPath: ResolveBinaryPath;
  run: RunOpenSpec;
}

const defaultDependencies: HealthDependencies = {
  resolveBinaryPath: defaultResolveBinaryPath,
  run: defaultRunOpenSpec,
};

/**
 * Verifies the environment, evaluating three checks in order and stopping at the
 * first failure. The checks are strictly dependent: a missing binary has no version,
 * and an unsupported binary's command surface differs, so its project resolution
 * would be meaningless.
 *
 * Nothing is cached. Every call re-runs every check it reaches, so a user who repairs
 * their `PATH` and refreshes recovers without restarting the process.
 */
export async function checkHealth(
  dependencies: HealthDependencies = defaultDependencies,
): Promise<HealthResponse> {
  const { resolveBinaryPath, run } = dependencies;

  const resolvedBinaryPath = await resolveBinaryPath();
  if (resolvedBinaryPath === null) {
    return {
      status: "error",
      check: "binary",
      message: `The \`${OPENSPEC_BINARY}\` binary was not found on PATH.`,
      remedy:
        `Install OpenSpec and make sure it is on your PATH, for example with ` +
        `\`npm install -g ${OPENSPEC_PACKAGE}\`, then refresh.`,
    };
  }

  const version = await detectVersion(run);
  if (version === null) {
    return {
      status: "error",
      check: "version",
      resolvedBinaryPath,
      message: `The binary at ${resolvedBinaryPath} did not report a usable version.`,
      remedy:
        `OpenSpec ${MINIMUM_OPENSPEC_VERSION} or newer is required. The binary resolved from ` +
        `${resolvedBinaryPath} did not report a version, which suggests it is not OpenSpec or ` +
        `is too old to support \`--version\`. Reinstall OpenSpec, then refresh.`,
    };
  }

  if (!isSupportedVersion(version)) {
    return {
      status: "error",
      check: "version",
      resolvedBinaryPath,
      version,
      message: `OpenSpec ${version} is older than the minimum supported version ${MINIMUM_OPENSPEC_VERSION}.`,
      remedy:
        `OpenSpec ${MINIMUM_OPENSPEC_VERSION} or newer is required, but ${version} was resolved ` +
        `from ${resolvedBinaryPath}. Upgrade that install, or remove it if another OpenSpec ` +
        `earlier on your PATH is shadowing a newer one, then refresh.`,
    };
  }

  const projectRoot = await detectProjectRoot(run);
  if (projectRoot === null) {
    return {
      status: "error",
      check: "project",
      resolvedBinaryPath,
      version,
      message: "The current working directory is not an OpenSpec project.",
      remedy:
        `Change to the root of an OpenSpec project and restart the dashboard, or run ` +
        `\`${OPENSPEC_BINARY} init\` here to create one, then refresh.`,
    };
  }

  return { status: "ok", resolvedBinaryPath, version, projectRoot };
}
