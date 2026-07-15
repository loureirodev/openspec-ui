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
      version: "1.5.0",
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
    const key = args.includes("schemas") ? "schemas" : args.includes("status") ? "status" : "list";
    const result = byCommand[key] ?? { exitCode: 0, stdout: "null", stderr: "" };
    return { exitCode: 0, stdout: "", stderr: "", ...result };
  };
}

const SCHEMAS_STDOUT = JSON.stringify([
  { name: "spec-driven", artifacts: ["proposal", "specs", "design", "tasks"] },
]);

describe("the changes and archived API routes", () => {
  let root: string;

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

    // A second archived change whose `tasks.md` escapes the tree via symlink: reading it must
    // fail *this* change only, and it must still appear in the list as an error entry.
    const corruptDir = join(openspecRoot, "changes", "archive", "2026-07-02-corrupt");
    await mkdir(corruptDir, { recursive: true });
    await writeFile(join(corruptDir, ".openspec.yaml"), "schema: spec-driven\n", "utf8");
    await writeFile(join(root, "outside.md"), "- [x] leaked", "utf8");
    await symlink(join(root, "outside.md"), join(corruptDir, "tasks.md"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
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

      const body = (await response.json()) as Array<{ name: string; archivedDate: string }>;
      expect(body).toEqual(
        expect.arrayContaining([
          { name: "old-feature", archivedDate: "2026-07-01" },
          { name: "corrupt", archivedDate: "2026-07-02" },
        ]),
      );
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
