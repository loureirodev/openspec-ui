import { readFile } from "node:fs/promises";
import { extname, join, relative, resolve, sep } from "node:path";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
};

const DEFAULT_MIME_TYPE = "application/octet-stream";

export function contentTypeFor(filePath: string): string {
  return MIME_TYPES[extname(filePath).toLowerCase()] ?? DEFAULT_MIME_TYPE;
}

/** Whether `candidate` stays inside `root`, rejecting `..` traversal out of the build. */
function isInside(root: string, candidate: string): boolean {
  const difference = relative(root, candidate);
  return difference !== "" && !difference.startsWith(`..${sep}`) && difference !== "..";
}

/** Reads a file from the build directory, or `null` when it is absent or outside it. */
export async function readAsset(
  root: string,
  requestPath: string,
): Promise<Uint8Array<ArrayBuffer> | null> {
  let contents: Buffer;
  try {
    // A malformed escape (`/%`, `/%zz`) makes `decodeURIComponent` throw; that is simply
    // "not an asset", so it shares the fall-through with a missing file rather than
    // escaping to a 500.
    const decoded = decodeURIComponent(requestPath);
    const absolute = resolve(root, `.${decoded}`);
    if (!isInside(resolve(root), absolute)) return null;

    contents = await readFile(absolute);
  } catch {
    return null;
  }

  // Copied out of Node's pooled buffer into a plain ArrayBuffer, which `Response` accepts.
  const bytes = new Uint8Array(contents.byteLength);
  bytes.set(contents);
  return bytes;
}

/** Reads the SPA entry document, or `null` when the client has not been built. */
export async function readIndexHtml(root: string): Promise<string | null> {
  try {
    return await readFile(join(root, "index.html"), "utf8");
  } catch {
    return null;
  }
}
