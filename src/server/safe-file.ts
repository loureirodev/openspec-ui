import { readFile, realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";

/**
 * The single choke point for reading files out of the `openspec/` tree. Every read
 * resolves its target — following symlinks — and confirms the resolved path still sits
 * under `<projectRoot>/openspec/` before opening it, so no crafted `..` sequence or
 * symlink can escape the tree. No consumer opens a file in the tree directly.
 */

/** Raised when a requested path resolves outside the `openspec/` tree. */
export class PathEscapeError extends Error {
  constructor(requestedPath: string) {
    super(`Refusing to read ${requestedPath}: it resolves outside the openspec tree.`);
    this.name = "PathEscapeError";
  }
}

/**
 * Whether `candidate` is `root` itself or nested beneath it. Uses `relative` rather than a
 * textual prefix so that a sibling like `<root>-secrets` — which *textually* begins with
 * `root` — is correctly rejected (its relative path starts with `..`).
 */
export function isWithin(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/**
 * The fully resolved, symlink-followed absolute form of `target`. A path that does not yet
 * exist still resolves: its nearest existing ancestor is realpath'd and the remainder
 * appended, so the prefix check runs against real (symlink-followed) directories even for a
 * file that is absent — a missing file is a read error, not a security bypass.
 */
async function resolveReal(target: string): Promise<string> {
  const absolute = resolve(target);
  try {
    return await realpath(absolute);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const parent = dirname(absolute);
    // Guard against an infinite climb at the filesystem root.
    if (parent === absolute) return absolute;
    return resolve(await resolveReal(parent), basename(absolute));
  }
}

/**
 * Reads a file, but only if it resolves under `openspecRoot`. The prefix check runs against
 * the resolved, symlink-followed path — never the raw string — so approval can never be
 * granted on a textual match that a symlink or `..` would later betray.
 */
export async function readScopedFile(openspecRoot: string, requestedPath: string): Promise<string> {
  const realRoot = await resolveReal(openspecRoot);
  const realTarget = await resolveReal(requestedPath);

  if (!isWithin(realRoot, realTarget)) throw new PathEscapeError(requestedPath);

  return readFile(realTarget, "utf8");
}

/** A reader already bound to one `openspec/` root, so callers pass only the target path. */
export type ScopedReader = (requestedPath: string) => Promise<string>;

/** Builds a {@link ScopedReader} bound to a project's `openspec/` root. */
export function createScopedReader(openspecRoot: string): ScopedReader {
  return (requestedPath) => readScopedFile(openspecRoot, requestedPath);
}
