import { describe, expect, it } from "vitest";
import type { CommandResult, RunOpenSpec } from "./openspec-binary.js";
import type { ScopedReader } from "./safe-file.js";
import {
  DEFAULT_SCHEMA,
  parseSchemaField,
  resolveArtifactOrder,
  resolveSchemaName,
} from "./schema.js";

const OPENSPEC_ROOT = "/proj/openspec";
const CHANGE_DIR = "/proj/openspec/changes/demo";

/** A scoped reader backed by an in-memory map; a missing path throws, as the real one does. */
function readerFor(files: Record<string, string>): ScopedReader {
  return async (path) => {
    const contents = files[path];
    if (contents !== undefined) return contents;
    throw new Error(`ENOENT: ${path}`);
  };
}

function stubSchemas(result: Partial<CommandResult>): RunOpenSpec {
  return async () => ({ exitCode: 0, stdout: "", stderr: "", ...result });
}

describe("parseSchemaField", () => {
  it("reads the schema name from a flat yaml body", () => {
    expect(parseSchemaField("schema: spec-driven\ncreated: 2026-07-10")).toBe("spec-driven");
  });

  it("strips surrounding quotes", () => {
    expect(parseSchemaField('schema: "custom"')).toBe("custom");
  });

  it("drops a trailing inline comment from an unquoted value", () => {
    expect(parseSchemaField("schema: custom  # my schema")).toBe("custom");
  });

  it("keeps a `#` that lives inside a quoted value", () => {
    expect(parseSchemaField('schema: "a # b"')).toBe("a # b");
  });

  it("returns null when no schema key is present", () => {
    expect(parseSchemaField("created: 2026-07-10")).toBeNull();
  });
});

describe("resolveSchemaName", () => {
  it("uses the change's declared schema and does not mark it inferred", async () => {
    const readScoped = readerFor({
      [`${CHANGE_DIR}/.openspec.yaml`]: "schema: custom\ncreated: 2026-07-10",
    });
    expect(
      await resolveSchemaName({ readScoped, openspecRoot: OPENSPEC_ROOT, changeDir: CHANGE_DIR }),
    ).toEqual({
      name: "custom",
      inferred: false,
    });
  });

  it("falls back to the project config default and marks it inferred", async () => {
    const readScoped = readerFor({ [`${OPENSPEC_ROOT}/config.yaml`]: "schema: project-default" });
    expect(
      await resolveSchemaName({ readScoped, openspecRoot: OPENSPEC_ROOT, changeDir: CHANGE_DIR }),
    ).toEqual({
      name: "project-default",
      inferred: true,
    });
  });

  it("falls back to the built-in default when nothing declares a schema, still inferred", async () => {
    const readScoped = readerFor({});
    expect(
      await resolveSchemaName({ readScoped, openspecRoot: OPENSPEC_ROOT, changeDir: CHANGE_DIR }),
    ).toEqual({
      name: DEFAULT_SCHEMA,
      inferred: true,
    });
  });
});

describe("resolveArtifactOrder", () => {
  it("returns the ordered artifact ids for a known schema", async () => {
    const run = stubSchemas({
      stdout: JSON.stringify([
        { name: "spec-driven", artifacts: ["proposal", "specs", "design", "tasks"] },
      ]),
    });
    expect(await resolveArtifactOrder(run, "spec-driven")).toEqual([
      "proposal",
      "specs",
      "design",
      "tasks",
    ]);
  });

  it("returns an empty order for an unknown schema rather than throwing", async () => {
    const run = stubSchemas({
      stdout: JSON.stringify([{ name: "spec-driven", artifacts: ["proposal"] }]),
    });
    expect(await resolveArtifactOrder(run, "mystery")).toEqual([]);
  });
});
