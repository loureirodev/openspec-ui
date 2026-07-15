import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type AdapterOptions,
  listChanges,
  resolveChange,
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

    // A corrupt archived change whose tasks.md escapes the tree via symlink: reading it must
    // fail *this* change only.
    const corrupt = join(archive, "2026-07-02-corrupt");
    await mkdir(corrupt, { recursive: true });
    await writeFile(join(corrupt, ".openspec.yaml"), "schema: spec-driven\n", "utf8");
    await writeFile(join(root, "outside.md"), "- [x] leaked", "utf8");
    await symlink(join(root, "outside.md"), join(corrupt, "tasks.md"));

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
