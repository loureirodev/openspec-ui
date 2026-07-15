import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AdapterDeps } from "./artifact-source.js";
import {
  resolveArtifacts,
  resolveArtifactsFromBinary,
  resolveArtifactsFromFilesystem,
  UNATTRIBUTED_ARTIFACT_ID,
} from "./artifact-source.js";
import type { CommandResult, RunOpenSpec } from "./openspec-binary.js";
import { OpenSpecValidationError } from "./openspec-data.js";
import { createScopedReader } from "./safe-file.js";

const PROJECT_ROOT = "/proj";
const OPENSPEC_ROOT = "/proj/openspec";

/** A run stub that returns a canned result per command keyword (`status`, `schemas`). */
function runFor(byCommand: Record<string, Partial<CommandResult>>): RunOpenSpec {
  return async (args) => {
    const key = args.includes("schemas")
      ? "schemas"
      : args.includes("status")
        ? "status"
        : (args[0] ?? "");
    const result = byCommand[key] ?? { exitCode: 0, stdout: "null", stderr: "" };
    return { exitCode: 0, stdout: "", stderr: "", ...result };
  };
}

/** A scoped reader backed by an in-memory map, for binary-source tests that never touch disk. */
function readerFor(files: Record<string, string>) {
  return async (path: string): Promise<string> => {
    const contents = files[path];
    if (contents !== undefined) return contents;
    throw new Error(`ENOENT: ${path}`);
  };
}

describe("resolveArtifactsFromBinary", () => {
  it("resolves a multi-file artifact in the order the binary reports", async () => {
    const status = {
      changeName: "demo",
      schemaName: "spec-driven",
      artifacts: [
        { id: "proposal", outputPath: "proposal.md", status: "done" },
        { id: "specs", outputPath: "specs/**/*.md", status: "in-progress" },
      ],
      artifactPaths: {
        proposal: { existingOutputPaths: ["/proj/openspec/changes/demo/proposal.md"] },
        specs: {
          existingOutputPaths: [
            "/proj/openspec/changes/demo/specs/a/spec.md",
            "/proj/openspec/changes/demo/specs/b/spec.md",
          ],
        },
      },
    };
    const deps: AdapterDeps = {
      run: runFor({ status: { stdout: JSON.stringify(status) } }),
      readScoped: readerFor({
        "/proj/openspec/changes/demo/proposal.md": "# proposal",
        "/proj/openspec/changes/demo/specs/a/spec.md": "# a",
        "/proj/openspec/changes/demo/specs/b/spec.md": "# b",
      }),
      projectRoot: PROJECT_ROOT,
      openspecRoot: OPENSPEC_ROOT,
    };

    const { artifacts } = await resolveArtifactsFromBinary(deps, "demo");

    expect(artifacts.map((a) => a.id)).toEqual(["proposal", "specs"]);
    expect(artifacts[0]?.status).toBe("done");
    expect(artifacts[1]?.files.map((f) => f.relPath)).toEqual([
      "openspec/changes/demo/specs/a/spec.md",
      "openspec/changes/demo/specs/b/spec.md",
    ]);
    expect(artifacts[0]?.files[0]?.markdown).toBe("# proposal");
  });

  it("carries a blocked artifact's `missingDeps` and the status body's `nextSteps`", async () => {
    const status = {
      changeName: "demo",
      schemaName: "spec-driven",
      artifacts: [
        { id: "proposal", outputPath: "proposal.md", status: "done" },
        { id: "design", outputPath: "design.md", status: "blocked", missingDeps: ["proposal"] },
      ],
      artifactPaths: {
        proposal: { existingOutputPaths: ["/proj/openspec/changes/demo/proposal.md"] },
        design: { existingOutputPaths: [] },
      },
      nextSteps: ["Write the proposal first."],
    };
    const deps: AdapterDeps = {
      run: runFor({ status: { stdout: JSON.stringify(status) } }),
      readScoped: readerFor({ "/proj/openspec/changes/demo/proposal.md": "# proposal" }),
      projectRoot: PROJECT_ROOT,
      openspecRoot: OPENSPEC_ROOT,
    };

    const { artifacts, nextSteps } = await resolveArtifactsFromBinary(deps, "demo");

    expect(artifacts[1]?.status).toBe("blocked");
    expect(artifacts[1]?.missingDeps).toEqual(["proposal"]);
    expect(nextSteps).toEqual(["Write the proposal first."]);
  });

  it("handles a custom schema's artifact ids without special-casing", async () => {
    const status = {
      changeName: "demo",
      schemaName: "custom",
      artifacts: [{ id: "rfc", outputPath: "rfc.md", status: "done" }],
      artifactPaths: { rfc: { existingOutputPaths: ["/proj/openspec/changes/demo/rfc.md"] } },
    };
    const deps: AdapterDeps = {
      run: runFor({ status: { stdout: JSON.stringify(status) } }),
      readScoped: readerFor({ "/proj/openspec/changes/demo/rfc.md": "# rfc" }),
      projectRoot: PROJECT_ROOT,
      openspecRoot: OPENSPEC_ROOT,
    };

    const { artifacts } = await resolveArtifactsFromBinary(deps, "demo");

    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]?.id).toBe("rfc");
    expect(artifacts[0]?.status).toBe("done");
  });

  it("resolves to no artifacts when the status body omits `artifacts`, without throwing", async () => {
    const deps: AdapterDeps = {
      run: runFor({ status: { stdout: JSON.stringify({ changeName: "demo" }) } }),
      readScoped: readerFor({}),
      projectRoot: PROJECT_ROOT,
      openspecRoot: OPENSPEC_ROOT,
    };

    await expect(resolveArtifactsFromBinary(deps, "demo")).resolves.toEqual({ artifacts: [] });
  });
});

describe("resolveArtifactsFromFilesystem", () => {
  let root: string;
  let changeDir: string;
  let deps: AdapterDeps;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "artifact-src-"));
    const openspecRoot = join(root, "openspec");
    changeDir = join(openspecRoot, "changes", "archive", "2026-07-10-demo");
    await mkdir(join(changeDir, "specs", "app-shell"), { recursive: true });
    await writeFile(join(changeDir, ".openspec.yaml"), "schema: spec-driven\n", "utf8");
    await writeFile(join(changeDir, "proposal.md"), "# proposal", "utf8");
    await writeFile(join(changeDir, "design.md"), "# design", "utf8");
    await writeFile(join(changeDir, "tasks.md"), "- [x] done", "utf8");
    await writeFile(join(changeDir, "specs", "app-shell", "spec.md"), "# spec", "utf8");

    deps = {
      run: runFor({
        schemas: {
          stdout: JSON.stringify([
            { name: "spec-driven", artifacts: ["proposal", "specs", "design", "tasks"] },
          ]),
        },
      }),
      readScoped: createScopedReader(openspecRoot),
      projectRoot: root,
      openspecRoot,
    };
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("resolves artifacts by walking the directory, in schema order, with no status field", async () => {
    const { artifacts, nextSteps } = await resolveArtifactsFromFilesystem(deps, changeDir);

    expect(artifacts.map((a) => a.id)).toEqual(["proposal", "specs", "design", "tasks"]);
    // Honest degradation: the binary's status and missingDeps are not fabricated.
    expect(artifacts.every((a) => a.status === undefined)).toBe(true);
    expect(artifacts.every((a) => a.missingDeps === undefined)).toBe(true);
    expect(nextSteps).toBeUndefined();
    expect(artifacts[1]?.files.map((f) => f.markdown)).toEqual(["# spec"]);
    expect(artifacts[0]?.files[0]?.markdown).toBe("# proposal");
  });

  it("surfaces markdown that matches no artifact rather than dropping it", async () => {
    await writeFile(join(changeDir, "notes.md"), "# stray", "utf8");

    const { artifacts } = await resolveArtifactsFromFilesystem(deps, changeDir);
    const unattributed = artifacts.find((a) => a.id === UNATTRIBUTED_ARTIFACT_ID);

    expect(unattributed?.files.map((f) => f.markdown)).toEqual(["# stray"]);
  });
});

describe("resolveArtifacts (provenance selection)", () => {
  it("routes an active change to the binary source", async () => {
    const status = {
      changeName: "demo",
      artifacts: [{ id: "proposal", outputPath: "proposal.md", status: "done" }],
      artifactPaths: {
        proposal: { existingOutputPaths: ["/proj/openspec/changes/demo/proposal.md"] },
      },
    };
    const deps: AdapterDeps = {
      run: runFor({ status: { stdout: JSON.stringify(status) } }),
      readScoped: readerFor({ "/proj/openspec/changes/demo/proposal.md": "# p" }),
      projectRoot: PROJECT_ROOT,
      openspecRoot: OPENSPEC_ROOT,
    };

    const { artifacts } = await resolveArtifacts(deps, {
      name: "demo",
      archived: false,
      changeDir: "/proj/openspec/changes/demo",
    });

    expect(artifacts[0]?.status).toBe("done");
  });

  it("surfaces a failing active status call as an error rather than re-routing to the filesystem", async () => {
    const validationBody = JSON.stringify({
      status: [{ severity: "error", message: "Change 'demo' not found." }],
    });
    const deps: AdapterDeps = {
      run: runFor({ status: { stdout: validationBody } }),
      readScoped: readerFor({}),
      projectRoot: PROJECT_ROOT,
      openspecRoot: OPENSPEC_ROOT,
    };

    await expect(
      resolveArtifacts(deps, {
        name: "demo",
        archived: false,
        changeDir: "/proj/openspec/changes/demo",
      }),
    ).rejects.toBeInstanceOf(OpenSpecValidationError);
  });
});
