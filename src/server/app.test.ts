import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { HealthResponse } from "../shared/health.js";
import { createApp } from "./app.js";
import type { CommandResult, RunOpenSpec } from "./openspec-binary.js";

const INDEX_HTML = '<!doctype html><html><body><div id="root"></div></body></html>';
const ASSET_JS = "console.log('spa');";

let clientDir: string;

beforeAll(async () => {
  clientDir = await mkdtemp(join(tmpdir(), "openspec-dashboard-"));
  await mkdir(join(clientDir, "assets"), { recursive: true });
  await writeFile(join(clientDir, "index.html"), INDEX_HTML);
  await writeFile(join(clientDir, "assets", "index-abc123.js"), ASSET_JS);
});

afterAll(async () => {
  await rm(clientDir, { recursive: true, force: true });
});

function appWithHealth(health: HealthResponse) {
  return createApp({ clientDir, checkHealth: async () => health });
}

describe("GET /api/health", () => {
  it("returns 200 and the body for a healthy environment", async () => {
    const healthy: HealthResponse = {
      status: "ok",
      resolvedBinaryPath: "/usr/local/bin/openspec",
      version: "1.6.0",
      projectRoot: "/work/my-project",
    };
    const response = await appWithHealth(healthy).request("/api/health");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(healthy);
  });

  it("returns 200 for a broken environment, because the check itself succeeded", async () => {
    const broken: HealthResponse = {
      status: "error",
      check: "binary",
      message: "not found",
      remedy: "install it",
    };
    const response = await appWithHealth(broken).request("/api/health");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(broken);
  });

  it("re-evaluates health on every request rather than caching a response", async () => {
    let status: HealthResponse["status"] = "error";
    const app = createApp({ clientDir, checkHealth: async () => ({ status }) });

    await expect((await app.request("/api/health")).json()).resolves.toEqual({ status: "error" });
    status = "ok";
    await expect((await app.request("/api/health")).json()).resolves.toEqual({ status: "ok" });
  });
});

describe("the /api prefix", () => {
  it("returns a JSON 404 for an unknown API path", async () => {
    const response = await appWithHealth({ status: "ok" }).request("/api/does-not-exist");

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");

    const body = await response.text();
    expect(body).not.toContain("<!doctype html>");
    expect(JSON.parse(body)).toMatchObject({ error: "Not Found" });
  });

  it.each([
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
  ])("refuses %s on an API path with 404 or 405", async (method) => {
    const response = await appWithHealth({ status: "ok" }).request("/api/health", { method });

    expect([404, 405]).toContain(response.status);
  });
});

describe("the SPA fallback", () => {
  it("serves index.html for a deep link to a client route", async () => {
    const response = await appWithHealth({ status: "ok" }).request("/changes/some-change");

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe(INDEX_HTML);
  });

  it("serves a built asset with its own MIME type rather than the fallback", async () => {
    const response = await appWithHealth({ status: "ok" }).request("/assets/index-abc123.js");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/javascript");
    await expect(response.text()).resolves.toBe(ASSET_JS);
  });

  it("falls back to index.html for a missing asset, because only /api paths 404", async () => {
    const response = await appWithHealth({ status: "ok" }).request("/assets/missing-000000.js");

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe(INDEX_HTML);
  });

  it("refuses to traverse out of the build directory", async () => {
    const response = await appWithHealth({ status: "ok" }).request("/../package.json");

    await expect(response.text()).resolves.toBe(INDEX_HTML);
  });

  it("falls back to index.html for a malformed percent-encoded path instead of 500", async () => {
    const response = await appWithHealth({ status: "ok" }).request("/%zz");

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe(INDEX_HTML);
  });
});

/** Serves canned command output keyed by the first distinguishing token, as in the adapter's own tests. */
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

describe("the changes and archived API routes", () => {
  let root: string;
  /** A directory outside the project root, so a symlink into it genuinely escapes. */
  let outsideRoot: string;

  function appFor(run: RunOpenSpec) {
    return createApp({ clientDir, adapterOptions: { projectRoot: root, run } });
  }

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "openspec-dashboard-app-"));
    const openspecRoot = join(root, "openspec");

    // An active change the binary can resolve via `status --change`.
    const activeDir = join(openspecRoot, "changes", "active-one");
    await mkdir(activeDir, { recursive: true });
    await writeFile(join(activeDir, ".openspec.yaml"), "schema: spec-driven\n", "utf8");
    await writeFile(join(activeDir, "proposal.md"), "# proposal", "utf8");
    await writeFile(join(activeDir, "tasks.md"), "- [x] a\n- [ ] b\n", "utf8");

    // An archived change resolved entirely from the filesystem.
    const archiveDir = join(openspecRoot, "changes", "archive", "2026-07-01-old-feature");
    await mkdir(join(archiveDir, "specs", "core"), { recursive: true });
    await writeFile(join(archiveDir, ".openspec.yaml"), "schema: spec-driven\n", "utf8");
    await writeFile(join(archiveDir, "proposal.md"), "# proposal", "utf8");
    await writeFile(join(archiveDir, "tasks.md"), "- [x] one\n- [ ] two\n", "utf8");
    await writeFile(join(archiveDir, "specs", "core", "spec.md"), "# core spec", "utf8");

    // A second archived change whose `tasks.md` escapes the *project root* via symlink:
    // reading it must fail *this* change only, and it must still appear in the list as an
    // error entry. The target is outside `root`, since the boundary is now the project root
    // and a link that merely leaves `openspec/` resolves to a readable project file.
    const corruptDir = join(openspecRoot, "changes", "archive", "2026-07-02-corrupt");
    await mkdir(corruptDir, { recursive: true });
    await writeFile(join(corruptDir, ".openspec.yaml"), "schema: spec-driven\n", "utf8");
    outsideRoot = await mkdtemp(join(tmpdir(), "app-outside-"));
    await writeFile(join(outsideRoot, "outside.md"), "- [x] leaked", "utf8");
    await symlink(join(outsideRoot, "outside.md"), join(corruptDir, "tasks.md"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(outsideRoot, { recursive: true, force: true });
  });

  describe("GET /api/changes", () => {
    it("returns 200 with the resolved active and archived changes", async () => {
      const status = {
        changeName: "active-one",
        schemaName: "spec-driven",
        artifacts: [{ id: "proposal", outputPath: "proposal.md", status: "done" }],
        artifactPaths: {
          proposal: {
            existingOutputPaths: [join(root, "openspec/changes/active-one/proposal.md")],
          },
        },
      };
      const app = appFor(
        runFor({
          list: {
            stdout: JSON.stringify({
              changes: [
                {
                  name: "active-one",
                  completedTasks: 1,
                  totalTasks: 2,
                  status: "in-progress",
                  lastModified: "2026-07-10T00:00:00.000Z",
                },
              ],
            }),
          },
          status: { stdout: JSON.stringify(status) },
          schemas: { stdout: SCHEMAS_STDOUT },
        }),
      );

      const response = await app.request("/api/changes");
      expect(response.status).toBe(200);

      const body = (await response.json()) as {
        error?: unknown;
        changes: Array<{ name: string; error?: unknown }>;
      };
      expect(body.error).toBeUndefined();
      const byName = Object.fromEntries(body.changes.map((c) => [c.name, c]));
      expect(byName["active-one"]).toBeDefined();
      expect(byName["old-feature"]).toBeDefined();
      // The corrupt archived change is isolated as an error entry, not thrown.
      expect(byName.corrupt?.error).toBeDefined();
    });

    it("returns 200 with a top-level error when the binary list fails, keeping archived changes", async () => {
      const app = appFor(
        runFor({ list: { stdout: "not json" }, schemas: { stdout: SCHEMAS_STDOUT } }),
      );

      const response = await app.request("/api/changes");
      expect(response.status).toBe(200);

      const body = (await response.json()) as {
        error?: { kind: string };
        changes: Array<{ name: string; archived: boolean }>;
      };
      expect(body.error?.kind).toBe("tool");
      expect(body.changes.every((c) => c.archived)).toBe(true);
      expect(body.changes.map((c) => c.name).sort()).toEqual(["corrupt", "old-feature"]);
    });
  });

  describe("GET /api/changes/:name", () => {
    it("returns artifacts with inlined markdown and recomputed progress", async () => {
      const status = {
        changeName: "active-one",
        schemaName: "spec-driven",
        artifacts: [
          { id: "proposal", outputPath: "proposal.md", status: "done" },
          { id: "tasks", outputPath: "tasks.md", status: "in-progress" },
        ],
        artifactPaths: {
          proposal: {
            existingOutputPaths: [join(root, "openspec/changes/active-one/proposal.md")],
          },
          tasks: { existingOutputPaths: [join(root, "openspec/changes/active-one/tasks.md")] },
        },
        nextSteps: ["Finish the tasks."],
      };
      const app = appFor(
        runFor({ status: { stdout: JSON.stringify(status) }, schemas: { stdout: SCHEMAS_STDOUT } }),
      );

      const response = await app.request("/api/changes/active-one");
      expect(response.status).toBe(200);

      const body = (await response.json()) as {
        artifacts: Array<{ id: string; status?: string; files: Array<{ markdown: string }> }>;
        progress: { completed: number; total: number };
        nextSteps?: string[];
      };
      expect(body.artifacts.map((a) => a.id)).toEqual(["proposal", "tasks"]);
      expect(body.artifacts[0]?.files[0]?.markdown).toBe("# proposal");
      expect(body.progress).toEqual({ completed: 1, total: 2 });
      expect(body.nextSteps).toEqual(["Finish the tasks."]);
    });

    it("returns 200 with the out-of-tree artifact's markdown", async () => {
      // The reported bug: a schema with `generates: "../../../adr/*.md"` puts an artifact
      // outside `openspec/`. This used to fail the whole request with a 500.
      await mkdir(join(root, "adr"), { recursive: true });
      await writeFile(join(root, "adr", "0001-use-postgres.md"), "# adr", "utf8");
      const status = {
        changeName: "active-one",
        schemaName: "spec-driven",
        artifacts: [
          { id: "proposal", outputPath: "proposal.md", status: "done" },
          { id: "adr", outputPath: "../../../adr/*.md", status: "done" },
        ],
        artifactPaths: {
          proposal: {
            existingOutputPaths: [join(root, "openspec/changes/active-one/proposal.md")],
          },
          adr: { existingOutputPaths: [join(root, "adr", "0001-use-postgres.md")] },
        },
      };
      const app = appFor(
        runFor({ status: { stdout: JSON.stringify(status) }, schemas: { stdout: SCHEMAS_STDOUT } }),
      );

      const response = await app.request("/api/changes/active-one");
      expect(response.status).toBe(200);

      const body = (await response.json()) as {
        artifacts: Array<{ id: string; files: Array<{ markdown: string; relPath: string }> }>;
      };
      const adr = body.artifacts.find((a) => a.id === "adr");
      expect(adr?.files[0]?.markdown).toBe("# adr");
      expect(adr?.files[0]?.relPath).toBe(join("adr", "0001-use-postgres.md"));
    });

    it("contains a per-artifact error when a binary-reported path escapes to a non-markdown project file", async () => {
      // A crafted schema `generates: "../../../.env"` (or an in-tree symlink) would resolve to
      // a real file under the project root that is not an artifact. Widening the read boundary
      // to the project root must not turn that into file disclosure.
      await writeFile(join(root, ".env"), "SECRET=1", "utf8");
      const status = {
        changeName: "active-one",
        schemaName: "spec-driven",
        artifacts: [{ id: "adr", outputPath: "../../../.env", status: "done" }],
        artifactPaths: { adr: { existingOutputPaths: [join(root, ".env")] } },
      };
      const app = appFor(
        runFor({ status: { stdout: JSON.stringify(status) }, schemas: { stdout: SCHEMAS_STDOUT } }),
      );

      const response = await app.request("/api/changes/active-one");
      expect(response.status).toBe(200);

      const body = (await response.json()) as {
        artifacts: Array<{ id: string; files: unknown[]; error?: { message: string } }>;
      };
      const adr = body.artifacts.find((a) => a.id === "adr");
      expect(adr?.error?.message).toContain("outside the readable set");
      expect(adr?.files).toEqual([]);
      expect(JSON.stringify(body)).not.toContain("SECRET=1");
    });

    it("returns 200 with a per-artifact error when one artifact escapes the readable set", async () => {
      // Previously an unhandled PathEscapeError reached Hono and failed the whole request.
      await writeFile(join(outsideRoot, "leaked.md"), "secret", "utf8");
      const status = {
        changeName: "active-one",
        schemaName: "spec-driven",
        artifacts: [
          { id: "proposal", outputPath: "proposal.md", status: "done" },
          { id: "adr", outputPath: "../../../adr/*.md", status: "done" },
        ],
        artifactPaths: {
          proposal: {
            existingOutputPaths: [join(root, "openspec/changes/active-one/proposal.md")],
          },
          adr: { existingOutputPaths: [join(outsideRoot, "leaked.md")] },
        },
      };
      const app = appFor(
        runFor({ status: { stdout: JSON.stringify(status) }, schemas: { stdout: SCHEMAS_STDOUT } }),
      );

      const response = await app.request("/api/changes/active-one");
      expect(response.status).toBe(200);

      const body = (await response.json()) as {
        artifacts: Array<{ id: string; files: unknown[]; error?: { message: string } }>;
      };
      const adr = body.artifacts.find((a) => a.id === "adr");
      expect(adr?.error?.message).toContain("outside the readable set");
      expect(adr?.files).toEqual([]);
      // The readable sibling is still served, and the secret is not.
      const proposal = body.artifacts.find((a) => a.id === "proposal");
      expect(proposal?.error).toBeUndefined();
      expect(proposal?.files).toHaveLength(1);
    });

    it("returns 404 for a name that decodes to a traversal, without reading", async () => {
      // A decoy the traversal would reach: `<root>/node_modules/.openspec.yaml` sits inside
      // the project root, so the widened boundary no longer refuses it. Only the identifier
      // guard does.
      await mkdir(join(root, "node_modules"), { recursive: true });
      await writeFile(join(root, "node_modules", ".openspec.yaml"), "schema: pwned\n", "utf8");

      let invocations = 0;
      const app = createApp({
        clientDir,
        adapterOptions: {
          projectRoot: root,
          run: async () => {
            invocations += 1;
            return { exitCode: 0, stdout: "null", stderr: "" };
          },
        },
      });

      const response = await app.request("/api/changes/..%2F..%2Fnode_modules");
      expect(response.status).toBe(404);
      await expect(response.text()).resolves.not.toContain("pwned");
      expect(invocations).toBe(0);
    });

    it("returns 404 for a name the binary does not recognize as an active change", async () => {
      const validationBody = JSON.stringify({
        status: [{ severity: "error", message: "Change 'ghost' not found." }],
      });
      const app = appFor(
        runFor({ status: { stdout: validationBody }, schemas: { stdout: SCHEMAS_STDOUT } }),
      );

      const response = await app.request("/api/changes/ghost");
      expect(response.status).toBe(404);
    });
  });

  describe("GET /api/archived", () => {
    it("returns 200 with each archived change's name and archived date, independent of the binary", async () => {
      const app = appFor(runFor({ list: { stdout: "not json" } }));

      const response = await app.request("/api/archived");
      expect(response.status).toBe(200);

      const body = (await response.json()) as Array<{
        name: string;
        archivedDate: string;
        path: string;
      }>;
      expect(body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "old-feature", archivedDate: "2026-07-01" }),
          expect.objectContaining({ name: "corrupt", archivedDate: "2026-07-02" }),
        ]),
      );
      // Each entry's path is the change's real archived directory.
      const oldFeature = body.find((entry) => entry.name === "old-feature");
      expect(oldFeature?.path).toContain(join("changes", "archive", "2026-07-01-old-feature"));
    });
  });

  describe("GET /api/archived/:id", () => {
    it("returns the artifact shape with spec deltas flagged historical and no fabricated status", async () => {
      const app = appFor(runFor({ schemas: { stdout: SCHEMAS_STDOUT } }));

      const response = await app.request("/api/archived/old-feature");
      expect(response.status).toBe(200);

      const body = (await response.json()) as {
        artifacts: Array<{ id: string; status?: string; historical?: boolean }>;
      };
      const specs = body.artifacts.find((a) => a.id === "specs");
      expect(specs?.historical).toBe(true);
      expect(body.artifacts.every((a) => a.status === undefined)).toBe(true);
    });

    it("returns 404 for an id that is not an archived change", async () => {
      const app = appFor(runFor({ schemas: { stdout: SCHEMAS_STDOUT } }));

      const response = await app.request("/api/archived/does-not-exist");
      expect(response.status).toBe(404);
    });
  });
});

describe("the specs API routes", () => {
  let root: string;

  function appFor(run: RunOpenSpec) {
    return createApp({ clientDir, adapterOptions: { projectRoot: root, run } });
  }

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "openspec-dashboard-specs-"));
    const specDir = join(root, "openspec", "specs", "core");
    await mkdir(specDir, { recursive: true });
    await writeFile(join(specDir, "spec.md"), "## Requirement: Core\n\nBody.", "utf8");
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  describe("GET /api/specs", () => {
    it("returns 200 with the project's specs", async () => {
      const app = appFor(
        runFor({
          "list-specs": {
            stdout: JSON.stringify({ specs: [{ id: "core", requirementCount: 1 }] }),
          },
        }),
      );

      const response = await app.request("/api/specs");
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual([{ id: "core", requirementCount: 1 }]);
    });

    it("returns 200 with an empty list for a project with no specs", async () => {
      const app = appFor(runFor({ "list-specs": { stdout: JSON.stringify({ specs: [] }) } }));

      const response = await app.request("/api/specs");
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual([]);
    });

    it("returns a structured JSON 500 rather than an unhandled crash when the binary is broken", async () => {
      const app = appFor(runFor({ "list-specs": { stdout: "not json" } }));

      const response = await app.request("/api/specs");
      expect(response.status).toBe(500);
      expect(response.headers.get("content-type")).toContain("application/json");

      const body = (await response.json()) as { error: string; kind: string };
      expect(body.error).toBe("Internal Server Error");
      expect(body.kind).toBe("tool");
    });
  });

  describe("GET /api/specs/:id", () => {
    it("returns 200 with the structured index and the raw markdown", async () => {
      const detail = {
        id: "core",
        title: "Core",
        requirementCount: 1,
        requirements: [{ text: "Core", scenarios: [] }],
      };
      const app = appFor(runFor({ show: { stdout: JSON.stringify(detail) } }));

      const response = await app.request("/api/specs/core");
      expect(response.status).toBe(200);

      const body = (await response.json()) as {
        index?: unknown;
        markdown: string;
        error?: unknown;
      };
      expect(body.index).toEqual(detail);
      expect(body.markdown).toBe("## Requirement: Core\n\nBody.");
      expect(body.error).toBeUndefined();
    });

    it("returns 404 for a spec whose spec.md does not exist", async () => {
      const app = appFor(runFor({}));

      const response = await app.request("/api/specs/does-not-exist");
      expect(response.status).toBe(404);
    });

    it("returns 404 for an id that decodes to a traversal, without reading or invoking the binary", async () => {
      // A decoy the traversal would reach: it sits inside the project root, so the scoped
      // reader would happily serve it. Only the identifier guard stops this, which is exactly
      // why widening the boundary required adding one.
      await mkdir(join(root, "secret"), { recursive: true });
      await writeFile(join(root, "secret", "spec.md"), "## Requirement: Leaked", "utf8");

      let invocations = 0;
      const app = createApp({
        clientDir,
        adapterOptions: {
          projectRoot: root,
          run: async () => {
            invocations += 1;
            return { exitCode: 0, stdout: "null", stderr: "" };
          },
        },
      });

      // Hono matches the raw path but percent-decodes the parameter, so this reaches the
      // handler as `../../secret`.
      const response = await app.request("/api/specs/..%2F..%2Fsecret");
      expect(response.status).toBe(404);
      await expect(response.text()).resolves.not.toContain("Leaked");
      // Refused before any path was built — the binary never saw the traversal either.
      expect(invocations).toBe(0);
    });

    it("returns 404 for an absolute id", async () => {
      const app = appFor(runFor({}));
      const response = await app.request(`/api/specs/${encodeURIComponent("/etc/passwd")}`);
      expect(response.status).toBe(404);
    });

    it("returns 200 with the raw markdown and a structured error when the index fails validation", async () => {
      const validationBody = JSON.stringify({
        status: [{ severity: "error", message: "Spec 'core' is invalid." }],
      });
      const app = appFor(runFor({ show: { stdout: validationBody } }));

      const response = await app.request("/api/specs/core");
      expect(response.status).toBe(200);

      const body = (await response.json()) as {
        index?: unknown;
        markdown: string;
        error?: { kind: string; details?: string[] };
      };
      expect(body.index).toBeUndefined();
      expect(body.markdown).toBe("## Requirement: Core\n\nBody.");
      expect(body.error?.kind).toBe("validation");
      expect(body.error?.details).toEqual(["Spec 'core' is invalid."]);
    });
  });
});
