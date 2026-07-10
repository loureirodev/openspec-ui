import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import {
  bindWithFallback,
  type CliIo,
  DEFAULT_PORT,
  MAX_PORT_ATTEMPTS,
  PortsExhaustedError,
  parseCliArgs,
  runCli,
  USAGE,
} from "./cli.js";

/** Ports well away from the dashboard's default, so a real dashboard cannot interfere. */
const TEST_PORT = 45321;

const openSockets: Server[] = [];
const openListeners: Array<{ close: () => void }> = [];

afterEach(async () => {
  await Promise.all(openSockets.splice(0).map((server) => new Promise((r) => server.close(r))));
  for (const listener of openListeners.splice(0)) listener.close();
});

/** Occupies `port` with a real listener, so a bind attempt against it raises EADDRINUSE. */
function occupy(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    openSockets.push(server);
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  });
}

function stubIo(): CliIo & { out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    stdout: (line) => out.push(line),
    stderr: (line) => err.push(line),
    openBrowser: vi.fn(async () => undefined),
  };
}

describe("parseCliArgs", () => {
  it("defaults to port 4321 with the browser launch enabled", () => {
    expect(parseCliArgs([])).toEqual({ kind: "run", options: { port: DEFAULT_PORT, open: true } });
  });

  it("accepts an explicit port", () => {
    expect(parseCliArgs(["--port", "8080"])).toEqual({
      kind: "run",
      options: { port: 8080, open: true },
    });
  });

  it("disables the browser launch with --no-open", () => {
    expect(parseCliArgs(["--no-open"])).toEqual({
      kind: "run",
      options: { port: DEFAULT_PORT, open: false },
    });
  });

  it.each(["--help", "--version"])("recognizes %s", (flag) => {
    expect(parseCliArgs([flag]).kind).toBe(flag.slice(2));
  });

  it("rejects an unrecognized flag", () => {
    const parsed = parseCliArgs(["--colour"]);

    expect(parsed.kind).toBe("error");
  });

  it.each([
    "banana",
    "0",
    "70000",
    "80.5",
    "-1",
    "",
  ])("rejects the port %o, naming the value", (value) => {
    // `--port -1` is ambiguous to parseArgs — a leading dash reads as another flag —
    // so the value is attached with `=`, which is the form that reaches validation.
    const parsed = parseCliArgs([`--port=${value}`]);

    expect(parsed.kind).toBe("error");
    if (parsed.kind !== "error") throw new Error("unreachable");
    expect(parsed.message).toContain(value);
  });

  it("rejects a bare --port with a dashed value, before any bind", () => {
    expect(parseCliArgs(["--port", "-1"]).kind).toBe("error");
  });
});

describe("runCli", () => {
  it("prints usage to stdout for --help and binds nothing", async () => {
    const io = stubIo();
    const result = await runCli(["--help"], io);

    expect(result.exitCode).toBe(0);
    expect(result.listener).toBeUndefined();
    expect(io.out.join("")).toBe(USAGE);
    for (const flag of ["--port", "--no-open", "--help", "--version"]) {
      expect(io.out.join("")).toContain(flag);
    }
  });

  it("prints the dashboard version then the openspec version for --version", async () => {
    const io = stubIo();
    const result = await runCli(["--version"], io);

    expect(result.exitCode).toBe(0);
    expect(result.listener).toBeUndefined();

    const [first, second] = io.out;
    expect(first).toMatch(/^openspec-dashboard \S+\n$/);
    expect(second).toMatch(/^openspec/);
  });

  it("prints usage to stderr and exits non-zero for an unrecognized flag", async () => {
    const io = stubIo();
    const result = await runCli(["--colour"], io);

    expect(result.exitCode).toBe(1);
    expect(io.err.join("")).toContain(USAGE);
    expect(io.out).toEqual([]);
  });

  it("names the invalid port on stderr and binds nothing", async () => {
    const io = stubIo();
    const result = await runCli(["--port", "banana"], io);

    expect(result.exitCode).toBe(1);
    expect(result.listener).toBeUndefined();
    expect(io.err.join("")).toContain("banana");
  });

  it("prints the resolved URL and opens the browser after binding", async () => {
    const io = stubIo();
    const result = await runCli(["--port", String(TEST_PORT)], io);
    if (result.listener) openListeners.push({ close: () => result.listener?.server.close() });

    expect(result.exitCode).toBe(0);
    expect(io.out.join("")).toContain(`http://127.0.0.1:${TEST_PORT}`);
    expect(io.openBrowser).toHaveBeenCalledWith(`http://127.0.0.1:${TEST_PORT}`);
  });

  it("does not open a browser with --no-open", async () => {
    const io = stubIo();
    const result = await runCli(["--port", String(TEST_PORT), "--no-open"], io);
    if (result.listener) openListeners.push({ close: () => result.listener?.server.close() });

    expect(result.exitCode).toBe(0);
    expect(io.openBrowser).not.toHaveBeenCalled();
    expect(io.out.join("")).toContain(`http://127.0.0.1:${TEST_PORT}`);
  });

  it("survives a browser launch failure without changing the exit status", async () => {
    const io = stubIo();
    io.openBrowser = vi.fn(async () => {
      throw new Error("no display");
    });

    const result = await runCli(["--port", String(TEST_PORT)], io);
    if (result.listener) openListeners.push({ close: () => result.listener?.server.close() });

    expect(result.exitCode).toBe(0);
    expect(result.listener).toBeDefined();
    expect(io.out.join("")).toContain("Notice:");
    expect(io.out.join("")).toContain("no display");
  });

  it("binds, prints its URL and opens the browser in an unhealthy environment", async () => {
    const originalCwd = process.cwd();
    const outsideAnyProject = await mkdtemp(join(tmpdir(), "not-an-openspec-project-"));
    process.chdir(outsideAnyProject);

    try {
      const io = stubIo();
      const result = await runCli(["--port", String(TEST_PORT)], io);
      if (result.listener) openListeners.push({ close: () => result.listener?.server.close() });

      expect(result.exitCode).toBe(0);
      expect(io.out.join("")).toContain(`http://127.0.0.1:${TEST_PORT}`);
      expect(io.openBrowser).toHaveBeenCalledOnce();

      // The environment failure surfaces through the endpoint, never the exit status.
      const health = await (await fetch(`http://127.0.0.1:${TEST_PORT}/api/health`)).json();
      expect(health).toMatchObject({ status: "error", check: "project" });
    } finally {
      process.chdir(originalCwd);
      await rm(outsideAnyProject, { recursive: true, force: true });
    }
  });

  it("attempts no browser launch when no port could be bound", async () => {
    for (let port = TEST_PORT; port < TEST_PORT + MAX_PORT_ATTEMPTS; port += 1) {
      await occupy(port);
    }

    const io = stubIo();
    const result = await runCli(["--port", String(TEST_PORT)], io);

    expect(result.exitCode).toBe(1);
    expect(io.openBrowser).not.toHaveBeenCalled();
  });
});

describe("bindWithFallback", () => {
  it("binds the requested port when it is free", async () => {
    const listener = await bindWithFallback(createApp(), TEST_PORT);
    openListeners.push({ close: () => listener.server.close() });

    expect(listener.port).toBe(TEST_PORT);
    expect(listener.url).toBe(`http://127.0.0.1:${TEST_PORT}`);
  });

  it("advances to the next port when the requested one is taken", async () => {
    await occupy(TEST_PORT);

    const listener = await bindWithFallback(createApp(), TEST_PORT);
    openListeners.push({ close: () => listener.server.close() });

    expect(listener.port).toBe(TEST_PORT + 1);
    expect(listener.url).toBe(`http://127.0.0.1:${TEST_PORT + 1}`);
  });

  it("never reports success on a port it does not hold", async () => {
    await occupy(TEST_PORT);
    await occupy(TEST_PORT + 1);

    const listener = await bindWithFallback(createApp(), TEST_PORT);
    openListeners.push({ close: () => listener.server.close() });

    expect(listener.port).toBe(TEST_PORT + 2);
    const response = await fetch(listener.url);
    expect(response.status).toBeGreaterThan(0);
  });

  it("names the full range attempted once every candidate is taken", async () => {
    for (let port = TEST_PORT; port < TEST_PORT + MAX_PORT_ATTEMPTS; port += 1) {
      await occupy(port);
    }

    const attempt = bindWithFallback(createApp(), TEST_PORT);

    await expect(attempt).rejects.toThrow(PortsExhaustedError);
    await expect(attempt).rejects.toThrow(`${TEST_PORT}-${TEST_PORT + MAX_PORT_ATTEMPTS - 1}`);
  });
});
