import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import type { HealthResponse } from "../shared/health.js";
import { checkHealth as defaultCheckHealth } from "./health.js";
import { contentTypeFor, readAsset, readIndexHtml } from "./static-files.js";

/** The SPA build, as laid out in `dist/` next to the compiled server. */
export const DEFAULT_CLIENT_DIR = fileURLToPath(new URL("../client", import.meta.url));

export interface AppOptions {
  /** The directory holding the built SPA assets. */
  clientDir?: string;
  /** Injected so route tests need no subprocess. */
  checkHealth?: () => Promise<HealthResponse>;
}

/**
 * Builds the HTTP application without binding a port, so tests can dispatch requests
 * in-process with `app.request(...)`.
 *
 * The `/api` prefix is the discriminator that keeps the SPA fallback a one-liner: an
 * unmatched path beneath it is a JSON 404, and everything else is `index.html`.
 */
export function createApp(options: AppOptions = {}) {
  const { clientDir = DEFAULT_CLIENT_DIR, checkHealth = defaultCheckHealth } = options;
  const app = new Hono();

  // A broken environment is a successful determination, so the status is always 200.
  app.get("/api/health", async (c) => c.json(await checkHealth()));

  app.all("/api", (c) => c.json({ error: "Not Found", path: c.req.path }, 404));
  app.all("/api/*", (c) => c.json({ error: "Not Found", path: c.req.path }, 404));

  app.get("*", async (c) => {
    const asset = await readAsset(clientDir, c.req.path);
    if (asset !== null) {
      return new Response(asset, { headers: { "Content-Type": contentTypeFor(c.req.path) } });
    }

    // Any non-`/api` path that is not a file is a client route: hand back the SPA and
    // let the router resolve it. A missing asset lands here too, by design.
    const indexHtml = await readIndexHtml(clientDir);
    if (indexHtml === null) {
      return c.text("The dashboard client has not been built. Run `pnpm build`.", 500);
    }
    return c.html(indexHtml);
  });

  return app;
}

export type App = ReturnType<typeof createApp>;
