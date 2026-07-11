import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

/** Small filesystem helpers shared by the filesystem-backed artifact source and progress recompute. */

/** Whether a path is a directory, a file (following symlinks), or absent — never throwing on absence. */
export async function pathKind(path: string): Promise<"dir" | "file" | null> {
  try {
    const stats = await stat(path);
    if (stats.isDirectory()) return "dir";
    if (stats.isFile()) return "file";
    return null;
  } catch {
    return null;
  }
}

/** Every markdown file beneath `root`, absolute and sorted, or none when `root` is unreadable. */
export async function collectMarkdown(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true, recursive: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => join(entry.parentPath ?? root, entry.name))
      .sort();
  } catch {
    return [];
  }
}
