import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import type { HealthResponse } from "../shared/health.js";
import { checkHealth as defaultCheckHealth } from "./health.js";
import {
  type AdapterOptions,
  activeChangeRef,
  findArchivedChange,
  listArchivedChanges,
  listChanges,
  listSpecs,
  OpenSpecValidationError,
  type ResolvedArtifact,
  resolveChange,
  resolveSpec,
  toStructuredError,
} from "./openspec-adapter.js";
import { contentTypeFor, readAsset, readIndexHtml } from "./static-files.js";

/** The SPA build, as laid out in `dist/` next to the compiled server. */
export const DEFAULT_CLIENT_DIR = fileURLToPath(new URL("../client", import.meta.url));

/** The artifact id, by the spec-driven schema's convention, whose files hold spec deltas. */
const SPECS_ARTIFACT_ID = "specs";

export interface AppOptions {
  /** The directory holding the built SPA assets. */
  clientDir?: string;
  /** Injected so route tests need no subprocess. */
  checkHealth?: () => Promise<HealthResponse>;
  /** Injected so route tests can control the project the adapter reads, without a subprocess. */
  adapterOptions?: AdapterOptions;
}

/** Flags spec-delta artifacts `historical`, so the archived detail reads as history, not as live specs. */
function withHistoricalFlag(artifacts: ResolvedArtifact[]): ResolvedArtifact[] {
  return artifacts.map((artifact) =>
    artifact.id === SPECS_ARTIFACT_ID ? { ...artifact, historical: true } : artifact,
  );
}

/**
 * Builds the HTTP application without binding a port, so tests can dispatch requests
 * in-process with `app.request(...)`.
 *
 * The `/api` prefix is the discriminator that keeps the SPA fallback a one-liner: an
 * unmatched path beneath it is a JSON 404, and everything else is `index.html`.
 */
export function createApp(options: AppOptions = {}) {
  const {
    clientDir = DEFAULT_CLIENT_DIR,
    checkHealth = defaultCheckHealth,
    adapterOptions = {},
  } = options;
  const app = new Hono();

  // A broken environment is a successful determination, so the status is always 200.
  app.get("/api/health", async (c) => c.json(await checkHealth()));

  // Per-change and top-level errors are already structured by the adapter, so they pass
  // straight through as 200 JSON: a broken binary yields a partial list, not a failed request.
  app.get("/api/changes", async (c) => c.json(await listChanges(adapterOptions)));

  // `:name` has a change directory built from it, so it is validated as a bare identifier
  // first; `activeChangeRef` returns null for anything else and this route 404s without a
  // path being assembled. The binary separately rejects a well-formed name it does not know,
  // which produces the other 404 below.
  app.get("/api/changes/:name", async (c) => {
    const name = c.req.param("name");
    try {
      const ref = await activeChangeRef(name, adapterOptions);
      if (ref === null) return c.json({ error: "Not Found", path: c.req.path }, 404);

      const resolved = await resolveChange(ref, adapterOptions);
      return c.json(resolved);
    } catch (error) {
      // The binary rejects a name it does not recognize as an active change with its own
      // validation-failure shape; that is the one case this route maps to 404.
      if (error instanceof OpenSpecValidationError) {
        return c.json({ error: "Not Found", path: c.req.path }, 404);
      }
      throw error;
    }
  });

  // Archived changes come from the filesystem, so this endpoint succeeds independently of
  // the binary.
  app.get("/api/archived", async (c) => c.json(await listArchivedChanges(adapterOptions)));

  // `:id` is not validated as a bare identifier either: it is matched against names recovered
  // from a directory listing, so an id that matches nothing simply 404s without a path being
  // built from it.
  app.get("/api/archived/:id", async (c) => {
    const id = c.req.param("id");
    const ref = await findArchivedChange(id, adapterOptions);
    if (ref === null) return c.json({ error: "Not Found", path: c.req.path }, 404);

    const resolved = await resolveChange(ref, adapterOptions);
    return c.json({ ...resolved, artifacts: withHistoricalFlag(resolved.artifacts) });
  });

  // The project's specs, as reported by `list --specs --json`. An empty project yields an
  // empty list at 200, never an error — see specs-api's "Empty project" scenario. Unlike
  // `/api/changes`, `listSpecs` has no per-item isolation to degrade into (there is no
  // filesystem-only fallback for specs the way archived changes are for changes), so a broken
  // binary is a genuine failure; it is still reported as structured JSON rather than the
  // framework's default plain-text 500.
  app.get("/api/specs", async (c) => {
    try {
      return c.json(await listSpecs(adapterOptions));
    } catch (error) {
      return c.json({ error: "Internal Server Error", ...toStructuredError(error) }, 500);
    }
  });

  // This is the one route that assembles a filesystem path from a request parameter, so the
  // id is validated as a bare name inside `resolveSpec` before any path is built. Hono
  // percent-decodes route params, so `..%2F..%2Ffoo` arrives here as a real traversal.
  app.get("/api/specs/:id", async (c) => {
    const id = c.req.param("id");
    const resolved = await resolveSpec(id, adapterOptions);
    // Both genuinely-absent cases map to 404: no `spec.md` on disk, and an id that is not a
    // bare identifier. A malformed index still resolves (raw markdown plus a structured
    // error) and passes through as 200.
    if (resolved === null) return c.json({ error: "Not Found", path: c.req.path }, 404);
    return c.json(resolved);
  });

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
