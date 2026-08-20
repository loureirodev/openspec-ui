import { join, parse, relative, sep } from "node:path";
import { collectMarkdown } from "./fs-walk.js";
import type { RunOpenSpec } from "./openspec-binary.js";
import { runStatus, type StructuredError, toStructuredError } from "./openspec-data.js";
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
  /**
   * Short display label derived from the artifact's file set — see design.md's
   * distinguishing-segment rule: the file's own basename (without extension) when that's
   * unique among its siblings, else the distinguishing parent directory name.
   */
  label: string;
  /** The file's markdown contents. */
  markdown: string;
}

/** One artifact in schema order, with its files. `status` is absent for archived changes. */
export interface ResolvedArtifact {
  id: string;
  status?: string;
  /** The ids of dependency artifacts still missing; present only for a `blocked` binary artifact. */
  missingDeps?: string[];
  /** Set by the archived detail route on spec-delta artifacts, to frame them as history. */
  historical?: boolean;
  files: ArtifactFile[];
  /**
   * Present only when this artifact's files could not be read. `files` is then empty and the
   * artifact's siblings are unaffected — see {@link readArtifactFiles}.
   */
  error?: StructuredError;
}

/** The result of resolving one change's artifacts: the artifacts and, for the binary source
 * only, the `nextSteps` the binary's `status` reported. Absent for the archived filesystem
 * source, which never had a `status` call to report them from.
 */
export interface ResolvedArtifacts {
  artifacts: ResolvedArtifact[];
  nextSteps?: string[];
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

/** An {@link ArtifactFile} before its `label` is derived from its artifact's sibling files. */
type UnlabeledFile = Omit<ArtifactFile, "label">;

/** Reads one file into the uniform shape through the scoped reader, `label` still pending. */
async function toArtifactFile(deps: AdapterDeps, path: string): Promise<UnlabeledFile> {
  return {
    path,
    relPath: relative(deps.projectRoot, path),
    markdown: await deps.readScoped(path),
  };
}

/** Counts how many times each label occurs, to find which ones still collide. */
function collidingLabels(labels: string[]): Set<string> {
  const counts = new Map<string, number>();
  for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
  const colliding = new Set<string>();
  for (const [label, count] of counts) if (count > 1) colliding.add(label);
  return colliding;
}

/**
 * The distinguishing-segment rule (see design.md): within one artifact's file set, a file's
 * label is its own basename (without extension) when that's unique among its siblings; when
 * basenames collide, the label escalates to the immediate parent directory name, and — only if
 * that *still* collides (e.g. two capabilities each nesting a same-named sub-spec folder) —
 * keeps escalating one directory level at a time until it distinguishes the file, joining the
 * escalated segments (never reintroducing the basename). Computed once, over the whole set, so
 * every file's uniqueness is judged against the same siblings — schema-agnostic, no artifact-
 * or filename-specific logic. Termination is guaranteed because two files never share the same
 * `relPath`, so the full path (the last thing tried) is always unique.
 */
function withLabels(files: UnlabeledFile[]): ArtifactFile[] {
  const parsed = files.map((file) => parse(file.relPath));
  // Directory segments closest-to-farthest (index 0 = immediate parent), consumed one at a
  // time to escalate a colliding label — see the doc comment above.
  const dirSegments = parsed.map((p) => p.dir.split(sep).filter(Boolean).reverse());

  let labels = parsed.map((p) => p.name);
  let depth = 0;
  let colliding = collidingLabels(labels);
  while (colliding.size > 0) {
    let escalatedAny = false;
    labels = labels.map((label, index) => {
      if (!colliding.has(label)) return label;
      const segs = dirSegments[index] ?? [];
      if (depth >= segs.length) return label; // ran out of directory context — leave as-is
      escalatedAny = true;
      return segs
        .slice(0, depth + 1)
        .reverse()
        .join("/");
    });
    if (!escalatedAny) break; // every still-colliding file has no more context to add
    depth++;
    colliding = collidingLabels(labels);
  }

  return files.map((file, index) => ({ ...file, label: labels[index] ?? "" }));
}

/**
 * Reads one artifact's files, containing any failure as that artifact's `error`.
 *
 * Containment sits at artifact granularity, not per file: an artifact rendered from a partial
 * file set would be quietly wrong, whereas an artifact that reports it could not be read is
 * honest. This mirrors the per-change containment the changes list already applies, one level
 * down — where the detail view actually renders. Without it, a single unreadable file fails
 * the whole detail request and the user sees none of the readable artifacts.
 *
 * A path refused for resolving outside the project root arrives here as an ordinary read
 * failure and is contained like any other, so it can no longer reach the route unhandled.
 */
async function readArtifactFiles(
  deps: AdapterDeps,
  paths: string[],
): Promise<Pick<ResolvedArtifact, "files" | "error">> {
  try {
    return {
      files: withLabels(await Promise.all(paths.map((path) => toArtifactFile(deps, path)))),
    };
  } catch (error) {
    return { files: [], error: toStructuredError(error) };
  }
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
): Promise<ResolvedArtifacts> {
  const status = await runStatus(deps.run, changeName);
  const artifactPaths = status.artifactPaths ?? {};

  const artifacts: ResolvedArtifact[] = [];
  // Defensive against a status body that omits `artifacts` (version drift, partial output):
  // resolve to no artifacts rather than throwing a `not iterable` TypeError to the caller.
  for (const artifact of status.artifacts ?? []) {
    const existing = artifactPaths[artifact.id]?.existingOutputPaths ?? [];
    artifacts.push({
      id: artifact.id,
      status: artifact.status,
      missingDeps: artifact.missingDeps,
      ...(await readArtifactFiles(deps, existing)),
    });
  }
  return { artifacts, nextSteps: status.nextSteps };
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
): Promise<ResolvedArtifacts> {
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
    // `status` and `missingDeps` are intentionally omitted: neither was persisted for an
    // archived change.
    const paths = markdownForArtifactId(changeDir, id, allMarkdown, consumed);
    artifacts.push({ id, ...(await readArtifactFiles(deps, paths)) });
  }

  const leftovers = allMarkdown.filter((path) => !consumed.has(path));
  if (leftovers.length > 0) {
    artifacts.push({
      id: UNATTRIBUTED_ARTIFACT_ID,
      ...(await readArtifactFiles(deps, leftovers)),
    });
  }
  // No `nextSteps`: those come only from a binary `status` call, never attempted here.
  return { artifacts };
}

/**
 * Resolves a change's artifacts, selecting the source by provenance. An archived change uses
 * the filesystem source; an active change uses the binary source, whose failure propagates
 * rather than being re-routed as if the change were archived.
 */
export async function resolveArtifacts(
  deps: AdapterDeps,
  ref: ChangeRef,
): Promise<ResolvedArtifacts> {
  return ref.archived
    ? resolveArtifactsFromFilesystem(deps, ref.changeDir)
    : resolveArtifactsFromBinary(deps, ref.name);
}
