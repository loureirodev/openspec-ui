import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isWithin, PathEscapeError, readScopedFile } from "./safe-file.js";

describe("isWithin", () => {
  it("accepts the root itself and nested paths", () => {
    expect(isWithin("/a/openspec", "/a/openspec")).toBe(true);
    expect(isWithin("/a/openspec", "/a/openspec/changes/x.md")).toBe(true);
  });

  it("rejects a sibling that only shares a textual prefix", () => {
    expect(isWithin("/a/openspec", "/a/openspec-secrets/x.md")).toBe(false);
  });

  it("rejects a parent path", () => {
    expect(isWithin("/a/openspec", "/a/other.md")).toBe(false);
  });
});

describe("readScopedFile", () => {
  let root: string;
  let openspecRoot: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "safe-file-"));
    openspecRoot = join(root, "openspec");
    await mkdir(join(openspecRoot, "changes"), { recursive: true });
    await writeFile(join(openspecRoot, "changes", "in.md"), "inside", "utf8");
    await writeFile(join(root, "outside.md"), "secret", "utf8");
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("reads a file that resolves inside the tree", async () => {
    const contents = await readScopedFile(openspecRoot, join(openspecRoot, "changes", "in.md"));
    expect(contents).toBe("inside");
  });

  it("rejects a `..` traversal without reading", async () => {
    const escaping = join(openspecRoot, "changes", "..", "..", "outside.md");
    await expect(readScopedFile(openspecRoot, escaping)).rejects.toBeInstanceOf(PathEscapeError);
  });

  it("rejects a symlink that escapes the tree", async () => {
    const link = join(openspecRoot, "changes", "escape.md");
    await symlink(join(root, "outside.md"), link);
    await expect(readScopedFile(openspecRoot, link)).rejects.toBeInstanceOf(PathEscapeError);
  });

  it("rejects a sibling directory that shares a textual prefix but resolves elsewhere", async () => {
    // `<root>/openspec-secrets` textually begins with `<root>/openspec`.
    const sibling = join(root, "openspec-secrets");
    await mkdir(sibling, { recursive: true });
    await writeFile(join(sibling, "x.md"), "nope", "utf8");
    await expect(readScopedFile(openspecRoot, join(sibling, "x.md"))).rejects.toBeInstanceOf(
      PathEscapeError,
    );
  });
});
