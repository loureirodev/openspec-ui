import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type AdapterOptions,
  activeChangeRef,
  listChanges,
  resolveChange,
  resolveProjectRoot,
  resolveSpec,
  toStructuredError,
} from "./openspec-adapter.js";
import type { CommandResult, RunOpenSpec } from "./openspec-binary.js";
import { OpenSpecToolError, OpenSpecValidationError } from "./openspec-data.js";

/** Serves canned command output keyed by the first distinguishing token. */
function runFor(byCommand: Record<string, Partial<CommandResult>>): RunOpenSpec {
  return async (args) => {
    const key = args.includes("schemas")
      ? "schemas"
      : args.includes("--specs")
        ? "list-specs"
        : args.includes("status")
          ? "status"
          : args.includes("show")
            ? "show"
            : "list";
    const result = byCommand[key] ?? { exitCode: 0, stdout: "null", stderr: "" };
    return { exitCode: 0, stdout: "", stderr: "", ...result };
  };
}

const SCHEMAS_STDOUT = JSON.stringify([
  { name: "spec-driven", artifacts: ["proposal", "specs", "design", "tasks"] },
]);

describe("toStructuredError", () => {
  it("maps a validation error to a structured entry with its messages", () => {
    const structured = toStructuredError(new OpenSpecValidationError(["a", "b"]));
    expect(structured).toEqual({ kind: "validation", message: "a\nb", details: ["a", "b"] });
  });

  it("maps a tool error to the tool kind", () => {
    expect(toStructuredError(new OpenSpecToolError("broke")).kind).toBe("tool");
  });

  it("maps an unknown throw to the unknown kind without leaking a stack", () => {
    const structured = toStructuredError("plain string");
    expect(structured).toEqual({ kind: "unknown", message: "plain string" });
  });
});

describe("listChanges — error isolation", () => {
  let root: string;
  /** A directory outside the project root, so a symlink into it genuinely escapes. */
  let outsideRoot: string;
  let options: AdapterOptions;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "adapter-list-"));
    const openspecRoot = join(root, "openspec");
    const archive = join(openspecRoot, "changes", "archive");

    // A healthy archived change with countable tasks.
    const healthy = join(archive, "2026-07-01-healthy");
    await mkdir(healthy, { recursive: true });
    await writeFile(join(healthy, ".openspec.yaml"), "schema: spec-driven\n", "utf8");
    await writeFile(join(healthy, "tasks.md"), "- [x] a\n- [ ] b\n", "utf8");

    // A corrupt archived change whose tasks.md escapes the *project root* via symlink:
    // reading it must fail *this* change only. The target sits outside `root` entirely —
    // a link merely leaving `openspec/` resolves inside the project and is legitimately
    // readable now that the boundary is the project root.
    const corrupt = join(archive, "2026-07-02-corrupt");
    await mkdir(corrupt, { recursive: true });
    await writeFile(join(corrupt, ".openspec.yaml"), "schema: spec-driven\n", "utf8");
    outsideRoot = await mkdtemp(join(tmpdir(), "adapter-outside-"));
    await writeFile(join(outsideRoot, "outside.md"), "- [x] leaked", "utf8");
    await symlink(join(outsideRoot, "outside.md"), join(corrupt, "tasks.md"));

    options = {
      projectRoot: root,
      run: runFor({
        list: {
          stdout: JSON.stringify({
            changes: [
              {
                name: "active-one",
                completedTasks: 1,
                totalTasks: 3,
                status: "in-progress",
                lastModified: "t",
              },
            ],
          }),
        },
        schemas: { stdout: SCHEMAS_STDOUT },
      }),
    };
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(outsideRoot, { recursive: true, force: true });
  });

  it("returns healthy changes normally and the failing one as an error entry", async () => {
    const { changes, error } = await listChanges(options);
    const byName = Object.fromEntries(changes.map((item) => [item.name, item]));

    // The binary list succeeded, so there is no top-level error.
    expect(error).toBeUndefined();

    expect(byName.active_one ?? byName["active-one"]).toBeDefined();
    expect(byName["active-one"]?.error).toBeUndefined();
    expect(byName["active-one"]?.completedTasks).toBe(1);

    expect(byName.healthy?.error).toBeUndefined();
    expect(byName.healthy).toMatchObject({ archived: true, completedTasks: 1, totalTasks: 2 });

    // The corrupt change is isolated: present, identified, carrying a structured error.
    expect(byName.corrupt?.error).toBeDefined();
    expect(byName.corrupt?.error?.kind).toBe("unknown");
    expect(byName.corrupt?.name).toBe("corrupt");
  });

  it("still returns the other changes when one fails — the list is not aborted", async () => {
    const { changes } = await listChanges(options);
    expect(changes.map((item) => item.name).sort()).toEqual(["active-one", "corrupt", "healthy"]);
  });

  it("degrades to a partial list — archived changes plus a top-level error — when the binary list fails", async () => {
    // `list` returns non-JSON, so runListChanges rejects with a tool error.
    const { changes, error } = await listChanges({
      projectRoot: root,
      run: runFor({ list: { stdout: "spawn ENOENT" }, schemas: { stdout: SCHEMAS_STDOUT } }),
    });

    // The binary failure is surfaced at the top level rather than thrown.
    expect(error?.kind).toBe("tool");

    // Archived changes come from the filesystem, so they are still listed. No active change is.
    expect(changes.map((item) => item.name).sort()).toEqual(["corrupt", "healthy"]);
    expect(changes.every((item) => item.archived)).toBe(true);
    expect(changes.find((item) => item.name === "healthy")).toMatchObject({
      completedTasks: 1,
      totalTasks: 2,
    });
  });
});

describe("resolveProjectRoot", () => {
  /** A `list --json` body reporting the root the binary resolved. */
  function listWithRoot(root: { path: string; source: string } | undefined) {
    return { list: { stdout: JSON.stringify({ changes: [], ...(root ? { root } : {}) }) } };
  }

  it("takes the root the binary reported, not the working directory", async () => {
    const run = runFor(listWithRoot({ path: "/somewhere/else", source: "nearest" }));
    expect(await resolveProjectRoot(run)).toBe("/somewhere/else");
    expect(await resolveProjectRoot(run)).not.toBe(process.cwd());
  });

  it("accepts a store root", async () => {
    const run = runFor(listWithRoot({ path: "/registered/store", source: "store" }));
    expect(await resolveProjectRoot(run)).toBe("/registered/store");
  });

  it("caches the resolution, so a repeated read costs no further invocation", async () => {
    let calls = 0;
    const inner = runFor(listWithRoot({ path: "/somewhere/else", source: "nearest" }));
    const run: RunOpenSpec = (args, options) => {
      calls += 1;
      return inner(args, options);
    };

    expect(await resolveProjectRoot(run)).toBe("/somewhere/else");
    expect(await resolveProjectRoot(run)).toBe("/somewhere/else");
    expect(calls).toBe(1);
  });

  it("falls back to the working directory when the binary reports an implicit root", async () => {
    // Outside any project the binary still succeeds, anchoring an `implicit` root — which is
    // not a resolved project and must not be adopted as one.
    const run = runFor(listWithRoot({ path: "/anywhere", source: "implicit" }));
    expect(await resolveProjectRoot(run)).toBe(process.cwd());
  });

  it("falls back to the working directory when the binary reports no root at all", async () => {
    expect(await resolveProjectRoot(runFor(listWithRoot(undefined)))).toBe(process.cwd());
  });

  it("falls back to the working directory when the binary is broken", async () => {
    // A spawn failure or crash leaves stdout unparseable; the server must still start.
    const run = runFor({ list: { stdout: "spawn ENOENT" } });
    expect(await resolveProjectRoot(run)).toBe(process.cwd());
  });

  it("does not cache the fallback, so repairing the environment takes effect", async () => {
    // The dashboard is started before `openspec` is on PATH; the user installs it and hits
    // Refresh. A cached fallback would keep reading `<cwd>/openspec` for the whole process.
    let broken = true;
    const run: RunOpenSpec = async () =>
      broken
        ? { exitCode: 1, stdout: "spawn ENOENT", stderr: "" }
        : {
            exitCode: 0,
            stdout: JSON.stringify({
              changes: [],
              root: { path: "/repaired", source: "nearest" },
            }),
            stderr: "",
          };

    expect(await resolveProjectRoot(run)).toBe(process.cwd());
    broken = false;
    expect(await resolveProjectRoot(run)).toBe("/repaired");
  });

  it("does not treat a root missing its source, or with an empty path, as resolved", async () => {
    // `source` and `path` are typed but arrive from untyped JSON.
    const noSource = runFor({
      list: { stdout: JSON.stringify({ changes: [], root: { path: "/x" } }) },
    });
    expect(await resolveProjectRoot(noSource)).toBe(process.cwd());

    const emptyPath = runFor({
      list: { stdout: JSON.stringify({ changes: [], root: { path: "", source: "nearest" } }) },
    });
    expect(await resolveProjectRoot(emptyPath)).toBe(process.cwd());
  });
});

describe("activeChangeRef", () => {
  it("refuses a name that is not a bare identifier, before building a change directory", async () => {
    // `join(openspecRoot, "changes", "../../node_modules")` escapes to `<root>/node_modules`,
    // which the project-root boundary would happily read a `.openspec.yaml` out of.
    const options = { projectRoot: "/project", run: runFor({}) };
    expect(await activeChangeRef("../../node_modules", options)).toBeNull();
    expect(await activeChangeRef("a/b", options)).toBeNull();
  });

  it("builds the change directory for a bare name", async () => {
    const ref = await activeChangeRef("add-thing", { projectRoot: "/project", run: runFor({}) });
    expect(ref?.changeDir).toBe(join("/project", "openspec", "changes", "add-thing"));
  });
});

describe("resolveChange — integration against a fixture tree", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "adapter-detail-"));
    const openspecRoot = join(root, "openspec");
    // An archived change resolved entirely from the filesystem.
    const archived = join(openspecRoot, "changes", "archive", "2026-07-01-old-feature");
    await mkdir(join(archived, "specs", "core"), { recursive: true });
    await writeFile(join(archived, ".openspec.yaml"), "schema: spec-driven\n", "utf8");
    await writeFile(join(archived, "proposal.md"), "# proposal", "utf8");
    await writeFile(join(archived, "tasks.md"), "- [x] one\n- [x] two\n- [ ] three\n", "utf8");
    await writeFile(join(archived, "specs", "core", "spec.md"), "# core spec", "utf8");
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("resolves an active change end-to-end via the binary source", async () => {
    const status = {
      changeName: "feature",
      schemaName: "spec-driven",
      artifacts: [
        { id: "proposal", outputPath: "proposal.md", status: "done" },
        { id: "tasks", outputPath: "tasks.md", status: "in-progress" },
      ],
      artifactPaths: {
        proposal: { existingOutputPaths: [join(root, "openspec/changes/feature/proposal.md")] },
        tasks: { existingOutputPaths: [join(root, "openspec/changes/feature/tasks.md")] },
      },
    };
    // The active change's files must exist for the scoped reader to read them.
    const featureDir = join(root, "openspec", "changes", "feature");
    await mkdir(featureDir, { recursive: true });
    await writeFile(join(featureDir, ".openspec.yaml"), "schema: spec-driven\n", "utf8");
    await writeFile(join(featureDir, "proposal.md"), "# p", "utf8");
    await writeFile(join(featureDir, "tasks.md"), "- [x] a\n- [ ] b\n", "utf8");

    const resolved = await resolveChange(
      { name: "feature", archived: false, changeDir: featureDir },
      {
        projectRoot: root,
        run: runFor({
          status: { stdout: JSON.stringify(status) },
          schemas: { stdout: SCHEMAS_STDOUT },
        }),
      },
    );

    expect(resolved.artifacts.map((a) => a.id)).toEqual(["proposal", "tasks"]);
    expect(resolved.artifacts[0]?.status).toBe("done");
    expect(resolved.schema).toEqual({ name: "spec-driven", inferred: false });
    // Progress recomputed from the tasks artifact's files, not the list count.
    expect(resolved.progress).toEqual({ completed: 1, total: 2 });
  });

  it("resolves an archived change end-to-end via the filesystem source", async () => {
    const changeDir = join(root, "openspec", "changes", "archive", "2026-07-01-old-feature");

    const resolved = await resolveChange(
      { name: "old-feature", archived: true, changeDir },
      { projectRoot: root, run: runFor({ schemas: { stdout: SCHEMAS_STDOUT } }) },
    );

    expect(resolved.archived).toBe(true);
    expect(resolved.artifacts.map((a) => a.id)).toEqual(["proposal", "specs", "design", "tasks"]);
    // Honest degradation: no fabricated status on archived artifacts.
    expect(resolved.artifacts.every((a) => a.status === undefined)).toBe(true);
    expect(resolved.progress).toEqual({ completed: 2, total: 3 });
  });

  it("reads an artifact the schema generated outside `openspec/`", async () => {
    // The `generates: "../../../adr/*.md"` case: the binary resolved the glob to a path that
    // is inside the project but outside the OpenSpec tree.
    const featureDir = join(root, "openspec", "changes", "feature");
    await mkdir(featureDir, { recursive: true });
    await writeFile(join(featureDir, ".openspec.yaml"), "schema: spec-driven\n", "utf8");
    await writeFile(join(featureDir, "proposal.md"), "# p", "utf8");
    await mkdir(join(root, "adr"), { recursive: true });
    await writeFile(join(root, "adr", "0001-use-postgres.md"), "# adr", "utf8");

    const status = {
      changeName: "feature",
      schemaName: "spec-driven",
      artifacts: [
        { id: "proposal", outputPath: "proposal.md", status: "done" },
        { id: "adr", outputPath: "../../../adr/*.md", status: "done" },
      ],
      artifactPaths: {
        proposal: { existingOutputPaths: [join(featureDir, "proposal.md")] },
        adr: { existingOutputPaths: [join(root, "adr", "0001-use-postgres.md")] },
      },
    };

    const resolved = await resolveChange(
      { name: "feature", archived: false, changeDir: featureDir },
      {
        projectRoot: root,
        run: runFor({
          status: { stdout: JSON.stringify(status) },
          schemas: { stdout: SCHEMAS_STDOUT },
        }),
      },
    );

    const adr = resolved.artifacts.find((a) => a.id === "adr");
    expect(adr?.error).toBeUndefined();
    expect(adr?.files[0]?.markdown).toBe("# adr");
    // Displayed relative to the project root, so it locates the file in the project.
    expect(adr?.files[0]?.relPath).toBe(join("adr", "0001-use-postgres.md"));
  });

  it("contains an artifact whose path escapes the project root, leaving its siblings intact", async () => {
    const featureDir = join(root, "openspec", "changes", "feature");
    await mkdir(featureDir, { recursive: true });
    await writeFile(join(featureDir, ".openspec.yaml"), "schema: spec-driven\n", "utf8");
    await writeFile(join(featureDir, "proposal.md"), "# p", "utf8");
    const outside = await mkdtemp(join(tmpdir(), "adapter-escape-"));
    await writeFile(join(outside, "leaked.md"), "secret", "utf8");

    const status = {
      changeName: "feature",
      schemaName: "spec-driven",
      artifacts: [
        { id: "proposal", outputPath: "proposal.md", status: "done" },
        { id: "adr", outputPath: "../../../adr/*.md", status: "done" },
      ],
      artifactPaths: {
        proposal: { existingOutputPaths: [join(featureDir, "proposal.md")] },
        adr: { existingOutputPaths: [join(outside, "leaked.md")] },
      },
    };

    const resolved = await resolveChange(
      { name: "feature", archived: false, changeDir: featureDir },
      {
        projectRoot: root,
        run: runFor({
          status: { stdout: JSON.stringify(status) },
          schemas: { stdout: SCHEMAS_STDOUT },
        }),
      },
    );

    // The escaping artifact is contained, not thrown: it carries the error and no files.
    const adr = resolved.artifacts.find((a) => a.id === "adr");
    expect(adr?.error).toBeDefined();
    expect(adr?.files).toEqual([]);
    // Its sibling resolved normally — the change did not fail as a whole.
    const proposal = resolved.artifacts.find((a) => a.id === "proposal");
    expect(proposal?.error).toBeUndefined();
    expect(proposal?.files[0]?.markdown).toBe("# p");

    await rm(outside, { recursive: true, force: true });
  });

  it("marks progress unknown when the task artifact could not be read", async () => {
    const featureDir = join(root, "openspec", "changes", "feature");
    await mkdir(featureDir, { recursive: true });
    await writeFile(join(featureDir, ".openspec.yaml"), "schema: spec-driven\n", "utf8");
    const outside = await mkdtemp(join(tmpdir(), "adapter-tasks-escape-"));
    await writeFile(join(outside, "tasks.md"), "- [x] a\n- [ ] b\n", "utf8");

    const status = {
      changeName: "feature",
      schemaName: "spec-driven",
      artifacts: [{ id: "tasks", outputPath: "tasks.md", status: "in-progress" }],
      artifactPaths: { tasks: { existingOutputPaths: [join(outside, "tasks.md")] } },
    };

    const resolved = await resolveChange(
      { name: "feature", archived: false, changeDir: featureDir },
      {
        projectRoot: root,
        run: runFor({
          status: { stdout: JSON.stringify(status) },
          schemas: { stdout: SCHEMAS_STDOUT },
        }),
      },
    );

    // The zeroes mean "we could not tell", not "there are no tasks".
    expect(resolved.progress).toEqual({ completed: 0, total: 0 });
    expect(resolved.progressUnknown).toBe(true);

    await rm(outside, { recursive: true, force: true });
  });

  it("leaves progress unflagged when the task artifact read fine", async () => {
    const changeDir = join(root, "openspec", "changes", "archive", "2026-07-01-old-feature");
    const resolved = await resolveChange(
      { name: "old-feature", archived: true, changeDir },
      { projectRoot: root, run: runFor({ schemas: { stdout: SCHEMAS_STDOUT } }) },
    );
    expect(resolved.progressUnknown).toBeUndefined();
  });

  it("resolves an out-of-tree artifact with no files, and no error, when archived", async () => {
    // Archiving adds a directory level, so a relative `generates` no longer resolves where it
    // did, and an out-of-tree file carries no back-reference to the change that wrote it.
    // Neither is recoverable, so the artifact is simply empty — not an error.
    const changeDir = join(root, "openspec", "changes", "archive", "2026-07-01-old-feature");
    await mkdir(join(root, "adr"), { recursive: true });
    await writeFile(join(root, "adr", "0001-use-postgres.md"), "# adr", "utf8");

    const schemas = JSON.stringify([
      { name: "spec-driven", artifacts: ["proposal", "specs", "design", "tasks", "adr"] },
    ]);
    const resolved = await resolveChange(
      { name: "old-feature", archived: true, changeDir },
      { projectRoot: root, run: runFor({ schemas: { stdout: schemas } }) },
    );

    const adr = resolved.artifacts.find((a) => a.id === "adr");
    expect(adr).toBeDefined();
    expect(adr?.files).toEqual([]);
    expect(adr?.error).toBeUndefined();
  });
});

describe("resolveSpec — hybrid detail against a fixture tree", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "adapter-spec-"));
    const specDir = join(root, "openspec", "specs", "core");
    await mkdir(specDir, { recursive: true });
    await writeFile(join(specDir, "spec.md"), "## Requirement: Core\n\nBody.", "utf8");
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("resolves the raw markdown together with the structured index", async () => {
    const detail = {
      id: "core",
      title: "Core",
      requirementCount: 1,
      requirements: [{ text: "Core", scenarios: [] }],
    };
    const resolved = await resolveSpec("core", {
      projectRoot: root,
      run: runFor({ show: { stdout: JSON.stringify(detail) } }),
    });

    expect(resolved).not.toBeNull();
    expect(resolved?.markdown).toBe("## Requirement: Core\n\nBody.");
    expect(resolved?.index).toEqual(detail);
    expect(resolved?.error).toBeUndefined();
  });

  it("degrades to the raw markdown plus a structured error when the index fails validation", async () => {
    const validationBody = JSON.stringify({
      status: [{ severity: "error", message: "Spec 'core' is invalid." }],
    });
    const resolved = await resolveSpec("core", {
      projectRoot: root,
      run: runFor({ show: { stdout: validationBody } }),
    });

    expect(resolved).not.toBeNull();
    expect(resolved?.markdown).toBe("## Requirement: Core\n\nBody.");
    expect(resolved?.index).toBeUndefined();
    expect(resolved?.error?.kind).toBe("validation");
    expect(resolved?.error?.details).toEqual(["Spec 'core' is invalid."]);
  });

  it("resolves to null when the spec's markdown does not exist on disk", async () => {
    const resolved = await resolveSpec("ghost", {
      projectRoot: root,
      run: runFor({}),
    });

    expect(resolved).toBeNull();
  });

  it("resolves to null on absent markdown even when the binary call also fails — the two reads run concurrently", async () => {
    const resolved = await resolveSpec("ghost", {
      projectRoot: root,
      run: runFor({ show: { stdout: "not json" } }),
    });

    expect(resolved).toBeNull();
  });
});
