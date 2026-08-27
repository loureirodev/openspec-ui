import { readFile, realpath } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, relative, resolve } from "node:path";

/**
 * The single choke point for reading project files. Every read resolves its target —
 * following symlinks — and confirms the resolved path still sits under the project root
 * before opening it, so no crafted `..` sequence or symlink can escape the project.
 * No consumer opens a project file directly.
 *
 * The outer boundary is the *project root*, not `<projectRoot>/openspec/`, because a schema
 * may direct an artifact to generate outside the OpenSpec tree — `generates:
 * "../../../adr/*.md"` resolves to `<repo>/adr/` — and the binary reports those resolved
 * paths for the dashboard to read. A boundary at `openspec/` made every such artifact
 * unreadable.
 *
 * Widening it that far would let a crafted schema path or an in-tree symlink reach anything
 * else in the repo — `.env`, `.git/config`, source files. So the containment `openspec/`
 * used to provide is re-established as a second rule: *outside* the OpenSpec tree only
 * markdown is readable (every out-of-tree artifact is markdown; schema config lives inside
 * the tree). A symlink under `openspec/` that resolves to a non-markdown file elsewhere in
 * the project is refused here for the same reason.
 *
 * Widening the boundary also means it no longer incidentally contains a path assembled from a
 * request parameter, so that concern is handled explicitly by {@link isBareIdentifier}:
 * this check answers "is this path inside the root", which cannot answer "was this
 * parameter meant to be a path at all".
 */

/** Raised when a requested path resolves somewhere the dashboard may not read. */
export class PathEscapeError extends Error {
  constructor(requestedPath: string) {
    super(`Refusing to read ${requestedPath}: it resolves outside the readable set.`);
    this.name = "PathEscapeError";
  }
}

/** Anything that would make a parameter act as a path fragment rather than a plain name. */
const NOT_AN_IDENTIFIER = /[/\\]|\0/;

/**
 * Whether a client-supplied value is a bare identifier — safe to embed in a path the server
 * assembles. Rejects path separators of either kind, NUL, the `.` and `..` segments, and any
 * absolute form (POSIX or Windows drive/UNC). Callers MUST apply this *before* building a
 * path, not after: a boundary check on the assembled path can only report that an escape was
 * attempted, whereas a parameter carrying a separator was never a valid name to begin with.
 *
 * The value must already be decoded. Route parameters arrive percent-decoded, so a
 * `%2F` in the request reaches this function as a real separator and is rejected here.
 */
export function isBareIdentifier(value: string): boolean {
  if (value.length === 0) return false;
  if (NOT_AN_IDENTIFIER.test(value)) return false;
  if (value === "." || value === "..") return false;
  return !isAbsolute(value);
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

/** Whether a resolved path is a markdown file — the only kind readable outside `openspec/`. */
function isMarkdown(path: string): boolean {
  return extname(path).toLowerCase() === ".md";
}

/**
 * Reads a file, but only if it resolves under `projectRoot` and — when it resolves outside
 * `<projectRoot>/openspec/` — is a markdown file. Both checks run against the resolved,
 * symlink-followed path, never the raw string, so approval can never be granted on a textual
 * match that a symlink or `..` would later betray.
 */
export async function readScopedFile(
  projectRoot: string,
  openspecRoot: string,
  requestedPath: string,
): Promise<string> {
  const realRoot = await resolveReal(projectRoot);
  const realTarget = await resolveReal(requestedPath);

  if (!isWithin(realRoot, realTarget)) throw new PathEscapeError(requestedPath);

  const realOpenspec = await resolveReal(openspecRoot);
  if (!isWithin(realOpenspec, realTarget) && !isMarkdown(realTarget)) {
    throw new PathEscapeError(requestedPath);
  }

  return readFile(realTarget, "utf8");
}

/** A reader already bound to one project, so callers pass only the target path. */
export type ScopedReader = (requestedPath: string) => Promise<string>;

/** Builds a {@link ScopedReader} bound to a project root and its `openspec/` tree. */
export function createScopedReader(projectRoot: string, openspecRoot: string): ScopedReader {
  return (requestedPath) => readScopedFile(projectRoot, openspecRoot, requestedPath);
}
