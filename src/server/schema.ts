import { join } from "node:path";
import type { RunOpenSpec } from "./openspec-binary.js";
import { runSchemas } from "./openspec-data.js";
import type { ScopedReader } from "./safe-file.js";

/**
 * Schema resolution. A change declares its schema in its `.openspec.yaml`; a change created
 * by hand may lack that file, in which case the project default applies and the fact that it
 * was *inferred* is reported rather than hidden, so the UI can label a guess as a guess.
 */

/** The schema the project falls back to when neither a change nor the project config names one. */
export const DEFAULT_SCHEMA = "spec-driven";

/** A resolved schema name and whether it was declared or inferred from the fallback. */
export interface ResolvedSchema {
  name: string;
  /** True when no `.openspec.yaml` declared the schema and the project default was assumed. */
  inferred: boolean;
}

/**
 * Extracts the `schema:` value from an `.openspec.yaml`/`config.yaml` body. A deliberately
 * tiny reader — the files carry a single flat `schema: <name>` line — so the adapter needs
 * no YAML dependency. Returns null when no such key is present.
 *
 * Hand-edited files are tolerated: surrounding quotes are stripped, and an unquoted value's
 * trailing ` # comment` (a YAML inline comment) is dropped so it never becomes part of the
 * schema name. A quoted value is taken verbatim, since its contents may legitimately hold `#`.
 */
export function parseSchemaField(yaml: string): string | null {
  const match = /^\s*schema:\s*(.+?)\s*$/m.exec(yaml);
  const captured = match?.[1]?.trim();
  if (!captured) return null;

  const quoted = /^(["'])(.*)\1/.exec(captured);
  if (quoted) return quoted[2] || null;

  return captured.replace(/\s+#.*$/, "").trim() || null;
}

/** Reads a scoped file, treating any read failure (absent, unreadable) as "no content". */
async function tryReadScoped(readScoped: ScopedReader, path: string): Promise<string | null> {
  try {
    return await readScoped(path);
  } catch {
    return null;
  }
}

/**
 * The project-wide default schema, from `openspec/config.yaml`, or {@link DEFAULT_SCHEMA} when
 * the project declares none. Read once and passed as {@link ResolveSchemaOptions.projectDefault}
 * when resolving many changes, so a list does not re-read the same config file per change.
 */
export async function readProjectDefaultSchema(
  readScoped: ScopedReader,
  openspecRoot: string,
): Promise<string> {
  const projectYaml = await tryReadScoped(readScoped, join(openspecRoot, "config.yaml"));
  return (projectYaml && parseSchemaField(projectYaml)) || DEFAULT_SCHEMA;
}

export interface ResolveSchemaOptions {
  readScoped: ScopedReader;
  /** Absolute path to `<projectRoot>/openspec`. */
  openspecRoot: string;
  /** Absolute path to the change's directory. */
  changeDir: string;
  /**
   * The already-resolved project default, to avoid re-reading `config.yaml` per change. When
   * omitted, the config is read on demand — correct for a single change, wasteful for a list.
   */
  projectDefault?: string;
}

/**
 * Resolves a change's schema name. A `.openspec.yaml` in the change directory wins and is
 * marked declared; absent that, the project `config.yaml` default is used and marked
 * inferred; absent even that, {@link DEFAULT_SCHEMA} is the last resort, still inferred.
 */
export async function resolveSchemaName(options: ResolveSchemaOptions): Promise<ResolvedSchema> {
  const { readScoped, openspecRoot, changeDir, projectDefault } = options;

  const changeYaml = await tryReadScoped(readScoped, join(changeDir, ".openspec.yaml"));
  const declared = changeYaml && parseSchemaField(changeYaml);
  if (declared) return { name: declared, inferred: false };

  const name = projectDefault ?? (await readProjectDefaultSchema(readScoped, openspecRoot));
  return { name, inferred: true };
}

/**
 * The ordered artifact ids of a schema, from `schemas --json`. An unknown schema yields an
 * empty order rather than throwing, so a change naming a schema the binary does not know
 * still resolves (to no artifacts) instead of aborting a list.
 */
export async function resolveArtifactOrder(
  run: RunOpenSpec,
  schemaName: string,
): Promise<string[]> {
  const schemas = await runSchemas(run);
  return schemas.find((schema) => schema.name === schemaName)?.artifacts ?? [];
}
