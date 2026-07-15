/**
 * The single definition of the version contract with the `openspec` binary.
 * Raising this is a breaking change for the published package.
 */
export const MINIMUM_OPENSPEC_VERSION = "1.6.0";

/** The semver range every version comparison in the codebase is made against. */
export const SUPPORTED_OPENSPEC_RANGE = `>=${MINIMUM_OPENSPEC_VERSION}`;
