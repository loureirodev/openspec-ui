import { join, relative, sep } from "node:path";
import { collectMarkdown } from "./fs-walk.js";
import type { RunOpenSpec } from "./openspec-binary.js";
import { runStatus } from "./openspec-data.js";
import type { ScopedReader } from "./safe-file.js";
import { resolveArtifactOrder, resolveSchemaName } from "./schema.js";

/**
 * The `ArtifactSource` abstraction: a change's artifacts resolve to one uniform shape no
 * matter where they come from, so a consumer never branches on archived-ness to render.
 *
 * Two implementations converge on that shape:
 * - *binary-backed*, for active changes, trusts the binary's `status --change` to report
 *   artifact order, status and resolved file paths;
 * - *filesystem-backed*, for archived changes the binary cannot address, recovers order
 *   from the schema and files by walking the change directory, degrading honestly — the
 *   status fields the binary would have supplied are simply absent.
 *
 * Which one runs is chosen by *provenance*, never by probing: an active change uses the
 * binary source, a change under the archive directory uses the filesystem source. We never
 * try `status --change` and fall back on its failure, because the binary's failure modes for
 * an archived name are indistinguishable from a genuinely broken active change.
 */

/** A single file belonging to an artifact. */
export interface ArtifactFile {
  /** Absolute path on disk. */
  path: string;
  /** Path relative to the project root, for display. */
  relPath: string;
  /** The file's markdown contents. */
  markdown: string;
}

/** One artifact in schema order, with its files. `status` is absent for archived changes. */
export interface ResolvedArtifact {
  id: string;
  status?: string;
  files: ArtifactFile[];
}

/** The artifact id under which files that match no schema artifact are surfaced, not dropped. */
export const UNATTRIBUTED_ARTIFACT_ID = "(unattributed)";

/** Everything the artifact sources need: the binary seam, scoped reads and base paths. */
export interface AdapterDeps {
  run: RunOpenSpec;
  readScoped: ScopedReader;
  /** Absolute project root, used to compute each file's `relPath`. */
  projectRoot: string;
  /** Absolute path to `<projectRoot>/openspec`, used for schema-config fallback. */
  openspecRoot: string;
}

/** Identifies a change and how it was discovered, which selects its source. */
export interface ChangeRef {
  name: string;
  /** True when discovered under `changes/archive/`; selects the filesystem source. */
  archived: boolean;
  /** Absolute path to the change's directory. */
  changeDir: string;
}

/** Reads one file into the uniform {@link ArtifactFile} shape through the scoped reader. */
async function toArtifactFile(deps: AdapterDeps, path: string): Promise<ArtifactFile> {
  return {
    path,
    relPath: relative(deps.projectRoot, path),
    markdown: await deps.readScoped(path),
  };
}

/**
 * Binary-backed source for an active change: iterate `artifacts[]` in the schema order the
 * binary reports and read each artifact's files from `artifactPaths[id].existingOutputPaths`.
 * This handles single-file, multi-file and custom schemas with no special-casing, because
 * the binary has already resolved every path and order.
 */
export async function resolveArtifactsFromBinary(
  deps: AdapterDeps,
  changeName: string,
): Promise<ResolvedArtifact[]> {
  const status = await runStatus(deps.run, changeName);
  const artifactPaths = status.artifactPaths ?? {};

  const artifacts: ResolvedArtifact[] = [];
  // Defensive against a status body that omits `artifacts` (version drift, partial output):
  // resolve to no artifacts rather than throwing a `not iterable` TypeError to the caller.
  for (const artifact of status.artifacts ?? []) {
    const existing = artifactPaths[artifact.id]?.existingOutputPaths ?? [];
    const files = await Promise.all(existing.map((path) => toArtifactFile(deps, path)));
    artifacts.push({ id: artifact.id, status: artifact.status, files });
  }
  return artifacts;
}

/**
 * The markdown an archived artifact maps to, selected from an already-collected list of every
 * markdown file under the change, by the spec-driven output conventions: a root-level
 * `<id>.md`, and/or an `<id>/` directory whose markdown belongs to that artifact (e.g.
 * `specs/**\/*.md`). The trailing separator on the directory prefix keeps `spec` from also
 * matching a sibling `specs/`. Selected paths are recorded so leftovers can be surfaced.
 */
function markdownForArtifactId(
  changeDir: string,
  id: string,
  allMarkdown: string[],
  consumed: Set<string>,
): string[] {
  const directFile = join(changeDir, `${id}.md`);
  const dirPrefix = join(changeDir, id) + sep;

  const selected = allMarkdown.filter((path) => path === directFile || path.startsWith(dirPrefix));
  for (const path of selected) consumed.add(path);
  return selected;
}

/**
 * Filesystem-backed source for an archived change: read the schema from `.openspec.yaml`,
 * get artifact order from `schemas --json`, and map files found by walking the change
 * directory onto artifacts. No `status --change` is attempted. The change directory is walked
 * exactly once; any markdown that matches no artifact is surfaced under
 * {@link UNATTRIBUTED_ARTIFACT_ID} rather than dropped.
 */
export async function resolveArtifactsFromFilesystem(
  deps: AdapterDeps,
  changeDir: string,
): Promise<ResolvedArtifact[]> {
  const schema = await resolveSchemaName({
    readScoped: deps.readScoped,
    openspecRoot: deps.openspecRoot,
    changeDir,
  });
  const order = await resolveArtifactOrder(deps.run, schema.name);

  const allMarkdown = await collectMarkdown(changeDir);
  const consumed = new Set<string>();
  const artifacts: ResolvedArtifact[] = [];
  for (const id of order) {
    // `status` is intentionally omitted: it was never persisted for an archived change.
    const paths = markdownForArtifactId(changeDir, id, allMarkdown, consumed);
    const files = await Promise.all(paths.map((path) => toArtifactFile(deps, path)));
    artifacts.push({ id, files });
  }

  const leftovers = allMarkdown.filter((path) => !consumed.has(path));
  if (leftovers.length > 0) {
    const files = await Promise.all(leftovers.map((path) => toArtifactFile(deps, path)));
    artifacts.push({ id: UNATTRIBUTED_ARTIFACT_ID, files });
  }
  return artifacts;
}

/**
 * Resolves a change's artifacts, selecting the source by provenance. An archived change uses
 * the filesystem source; an active change uses the binary source, whose failure propagates
 * rather than being re-routed as if the change were archived.
 */
export async function resolveArtifacts(
  deps: AdapterDeps,
  ref: ChangeRef,
): Promise<ResolvedArtifact[]> {
  return ref.archived
    ? resolveArtifactsFromFilesystem(deps, ref.changeDir)
    : resolveArtifactsFromBinary(deps, ref.name);
}
