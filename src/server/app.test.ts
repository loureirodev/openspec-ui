import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { HealthResponse } from "../shared/health.js";
import { createApp } from "./app.js";

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
