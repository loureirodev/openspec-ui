import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { AdapterDeps, ChangeRef, ResolvedArtifact } from "./artifact-source.js";
import { resolveArtifacts } from "./artifact-source.js";
import { collectMarkdown, pathKind } from "./fs-walk.js";
import { runOpenSpec as defaultRunOpenSpec, type RunOpenSpec } from "./openspec-binary.js";
import {
  type ChangeSummary,
  OpenSpecValidationError,
  runListChanges,
  runListSpecs,
  runShowSpec,
  type SpecDetail,
  type SpecSummary,
} from "./openspec-data.js";
import { createScopedReader } from "./safe-file.js";
import { type ResolvedSchema, readProjectDefaultSchema, resolveSchemaName } from "./schema.js";
import { aggregateProgress, type Progress } from "./task-progress.js";

/**
 * The single module the dashboard's routes import. It is the sole owner of binary
 * invocation, path-scoped reads, task-progress recomputation and schema resolution, and it
 * threads one project root through all of them. Nothing here adds an HTTP route: the surface
 * becomes reachable only when a consuming UI change imports it.
 */

export type { ArtifactFile, ChangeRef, ResolvedArtifact } from "./artifact-source.js";
export { UNATTRIBUTED_ARTIFACT_ID } from "./artifact-source.js";
export type { SpecDetail, SpecSummary } from "./openspec-data.js";
export { OpenSpecToolError, OpenSpecValidationError } from "./openspec-data.js";
export { PathEscapeError } from "./safe-file.js";
export type { ResolvedSchema } from "./schema.js";
export type { Progress } from "./task-progress.js";
export { aggregateProgress, countCheckboxes } from "./task-progress.js";

/** The artifact id whose files hold a change's task checkboxes, under the default schema. */
const TASKS_ARTIFACT_ID = "tasks";

/** A structured, renderable error: identity and category without a raw stack or leaked stderr. */
export interface StructuredError {
  kind: "validation" | "tool" | "unknown";
  message: string;
  /** Individual validation messages, when the failure was a validation error. */
  details?: string[];
}

/** Maps any thrown value onto a structured error safe to render. */
export function toStructuredError(error: unknown): StructuredError {
  if (error instanceof OpenSpecValidationError) {
    return { kind: "validation", message: error.message, details: error.messages };
  }
  if (error instanceof Error) {
    const kind = error.name === "OpenSpecToolError" ? "tool" : "unknown";
    return { kind, message: error.message };
  }
  return { kind: "unknown", message: String(error) };
}

/** One entry in a changes list: either a resolved change or, on failure, one carrying an `error`. */
export interface ChangeListItem {
  name: string;
  archived: boolean;
  /** The binary's list status for an active change; absent for archived changes. */
  status?: string;
  completedTasks: number;
  totalTasks: number;
  lastModified?: string;
  schema?: ResolvedSchema;
  /** Present only when this change failed to resolve; its other fields are then best-effort. */
  error?: StructuredError;
}

/**
 * The result of {@link listChanges}: the resolved changes and, when the binary's active-change
 * list could not be fetched, a top-level `error`. Archived changes come from the filesystem and
 * are listed regardless, so a broken or missing binary yields a *partial* list rather than none.
 */
export interface ChangeListResult {
  changes: ChangeListItem[];
  /** Present only when the active-change list failed; `changes` then holds archived changes only. */
  error?: StructuredError;
}

/** A change's full detail: its artifacts and recomputed progress, in one uniform shape. */
export interface ResolvedChange {
  name: string;
  archived: boolean;
  schema: ResolvedSchema;
  artifacts: ResolvedArtifact[];
  /** Progress recomputed from the change's task files — independent of the `list --json` count. */
  progress: Progress;
}

/** The adapter's public dependencies. A project root is enough to derive everything else. */
export interface AdapterOptions {
  run?: RunOpenSpec;
  /** The project whose `openspec/` tree is browsed. Defaults to the process working directory. */
  projectRoot?: string;
}

/** Expands public options into the fully-wired {@link AdapterDeps} the internals consume. */
function resolveDeps(options: AdapterOptions = {}): AdapterDeps {
  const projectRoot = options.projectRoot ?? process.cwd();
  const openspecRoot = join(projectRoot, "openspec");
  return {
    run: options.run ?? defaultRunOpenSpec,
    readScoped: createScopedReader(openspecRoot),
    projectRoot,
    openspecRoot,
  };
}

/** The absolute directory of the archive that holds every archived change. */
function archiveRoot(deps: AdapterDeps): string {
  return join(deps.openspecRoot, "changes", "archive");
}

/** Discovers archived changes by listing the archive directory; the binary cannot see them. */
async function discoverArchivedRefs(deps: AdapterDeps): Promise<ChangeRef[]> {
  const root = archiveRoot(deps);
  try {
    const entries = await readdir(root, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({
        // Strip the archival `YYYY-MM-DD-` prefix to recover the change's original name.
        name: entry.name.replace(/^\d{4}-\d{2}-\d{2}-/, ""),
        archived: true,
        changeDir: join(root, entry.name),
      }));
  } catch {
    return [];
  }
}

/** The markdown of a change's task files, by the default-schema convention (`tasks.md`, `tasks/`). */
async function readTaskMarkdown(deps: AdapterDeps, changeDir: string): Promise<string[]> {
  const paths: string[] = [];

  const directFile = join(changeDir, `${TASKS_ARTIFACT_ID}.md`);
  if ((await pathKind(directFile)) === "file") paths.push(directFile);

  const directory = join(changeDir, TASKS_ARTIFACT_ID);
  if ((await pathKind(directory)) === "dir") paths.push(...(await collectMarkdown(directory)));

  // Reads propagate: an unreadable or escaping task file must fail this change, not be hidden.
  return Promise.all(paths.map((path) => deps.readScoped(path)));
}

/** Recomputes a change's progress from its task files. */
async function computeChangeProgress(deps: AdapterDeps, changeDir: string): Promise<Progress> {
  return aggregateProgress(await readTaskMarkdown(deps, changeDir));
}

/** Resolves one active change into a list item, trusting `list --json`'s progress verbatim. */
async function resolveActiveItem(
  deps: AdapterDeps,
  summary: ChangeSummary,
  projectDefault: string,
): Promise<ChangeListItem> {
  const changeDir = join(deps.openspecRoot, "changes", summary.name);
  const schema = await resolveSchemaName({
    readScoped: deps.readScoped,
    openspecRoot: deps.openspecRoot,
    changeDir,
    projectDefault,
  });
  return {
    name: summary.name,
    archived: false,
    status: summary.status,
    completedTasks: summary.completedTasks,
    totalTasks: summary.totalTasks,
    lastModified: summary.lastModified,
    schema,
  };
}

/** Resolves one archived change into a list item, recomputing progress the binary cannot supply. */
async function resolveArchivedItem(
  deps: AdapterDeps,
  ref: ChangeRef,
  projectDefault: string,
): Promise<ChangeListItem> {
  const schema = await resolveSchemaName({
    readScoped: deps.readScoped,
    openspecRoot: deps.openspecRoot,
    changeDir: ref.changeDir,
    projectDefault,
  });
  const progress = await computeChangeProgress(deps, ref.changeDir);
  return {
    name: ref.name,
    archived: true,
    completedTasks: progress.completed,
    totalTasks: progress.total,
    schema,
  };
}

/** Wraps a resolution so one change's failure becomes an error entry, never a thrown list. */
async function isolate(
  name: string,
  archived: boolean,
  resolve: () => Promise<ChangeListItem>,
): Promise<ChangeListItem> {
  try {
    return await resolve();
  } catch (error) {
    return { name, archived, completedTasks: 0, totalTasks: 0, error: toStructuredError(error) };
  }
}

/**
 * Lists every change — active and archived — as a resolved item or, on per-change failure, an
 * item carrying a structured `error`. Isolation is two-layered: one corrupt change never aborts
 * the list, and a failure of the binary's active-change list never hides the filesystem-only
 * archived changes — it surfaces as the result's top-level `error` while the archived changes
 * still resolve. Either way a consumer can serve HTTP 200 and render every failure inline.
 */
export async function listChanges(options: AdapterOptions = {}): Promise<ChangeListResult> {
  const deps = resolveDeps(options);

  const [activeList, archivedRefs, projectDefault] = await Promise.all([
    // Isolate the binary list call so its failure degrades to a partial list, not a thrown one.
    runListChanges(deps.run).then(
      (list) => ({ summaries: list.changes, error: undefined as StructuredError | undefined }),
      (error): { summaries: ChangeSummary[]; error?: StructuredError } => ({
        summaries: [],
        error: toStructuredError(error),
      }),
    ),
    discoverArchivedRefs(deps),
    // Read the project default schema once here, not once per change inside each resolver.
    readProjectDefaultSchema(deps.readScoped, deps.openspecRoot),
  ]);

  const active = activeList.summaries.map((summary) =>
    isolate(summary.name, false, () => resolveActiveItem(deps, summary, projectDefault)),
  );
  const archived = archivedRefs.map((ref) =>
    isolate(ref.name, true, () => resolveArchivedItem(deps, ref, projectDefault)),
  );

  return { changes: await Promise.all([...active, ...archived]), error: activeList.error };
}

/**
 * Resolves a change's full detail: its artifacts (from the provenance-selected source) and its
 * progress recomputed from the task artifact's files, so a detail view never trusts the list's
 * count. The two counts may legitimately disagree; each is individually correct.
 */
export async function resolveChange(
  ref: ChangeRef,
  options: AdapterOptions = {},
): Promise<ResolvedChange> {
  const deps = resolveDeps(options);

  const schema = await resolveSchemaName({
    readScoped: deps.readScoped,
    openspecRoot: deps.openspecRoot,
    changeDir: ref.changeDir,
  });
  const artifacts = await resolveArtifacts(deps, ref);

  const taskMarkdown = artifacts
    .filter((artifact) => artifact.id === TASKS_ARTIFACT_ID)
    .flatMap((artifact) => artifact.files.map((file) => file.markdown));

  return {
    name: ref.name,
    archived: ref.archived,
    schema,
    artifacts,
    progress: aggregateProgress(taskMarkdown),
  };
}

/** The project's specs, as reported by `list --specs --json`. */
export async function listSpecs(options: AdapterOptions = {}): Promise<SpecSummary[]> {
  const deps = resolveDeps(options);
  return (await runListSpecs(deps.run)).specs;
}

/** A single spec's body, as reported by `show <id> --type spec --json`. */
export async function readSpec(id: string, options: AdapterOptions = {}): Promise<SpecDetail> {
  const deps = resolveDeps(options);
  return runShowSpec(deps.run, id);
}
