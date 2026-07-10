import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import openBrowserDefault from "open";
import { DEFAULT_PORT } from "../shared/ports.js";
import type { App } from "./app.js";
import { createApp } from "./app.js";
import { type Listener, listen } from "./listen.js";
import { detectVersion, resolveBinaryPath, runOpenSpec } from "./openspec-binary.js";

export { DEFAULT_PORT };

export const MAX_PORT_ATTEMPTS = 10;
const MAX_PORT = 65535;

export const USAGE = `Usage: openspec-dashboard [options]

Browse the OpenSpec project in the current directory.

Options:
  --port <number>  Port to bind, with sequential fallback (default: ${DEFAULT_PORT})
  --no-open        Do not open the browser after the server starts
  --help           Print this message and exit
  --version        Print the dashboard and openspec versions and exit
`;

export interface CliOptions {
  port: number;
  open: boolean;
}

export type ParsedCli =
  | { kind: "run"; options: CliOptions }
  | { kind: "help" }
  | { kind: "version" }
  | { kind: "error"; message: string };

/**
 * Parses the four supported flags. `parseArgs` errors are terse, so they are caught
 * and replaced with this project's own usage text.
 */
export function parseCliArgs(args: string[]): ParsedCli {
  let values: { port?: string; open?: boolean; help?: boolean; version?: boolean };
  try {
    ({ values } = parseArgs({
      args,
      options: {
        port: { type: "string" },
        open: { type: "boolean", default: true },
        help: { type: "boolean", default: false },
        version: { type: "boolean", default: false },
      },
      allowNegative: true,
      allowPositionals: false,
      strict: true,
    }));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { kind: "error", message: detail };
  }

  if (values.help) return { kind: "help" };
  if (values.version) return { kind: "version" };

  const port = parsePort(values.port);
  if (port === null) {
    return {
      kind: "error",
      message: `Invalid --port value: ${values.port}. Expected an integer between 1 and ${MAX_PORT}.`,
    };
  }

  return { kind: "run", options: { port, open: values.open ?? true } };
}

function parsePort(raw: string | undefined): number | null {
  if (raw === undefined) return DEFAULT_PORT;
  if (!/^\d+$/.test(raw)) return null;

  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > MAX_PORT) return null;
  return port;
}

export class PortsExhaustedError extends Error {
  constructor(
    readonly firstPort: number,
    readonly lastPort: number,
  ) {
    super(`Could not bind any port in the range ${firstPort}-${lastPort}; all are in use.`);
    this.name = "PortsExhaustedError";
  }
}

function isAddressInUse(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === "EADDRINUSE";
}

/**
 * Binds the first free port at or after `startPort`, advancing only on `EADDRINUSE`
 * raised by an actual bind attempt. No port is ever probed before it is bound.
 */
export async function bindWithFallback(
  app: App,
  startPort: number,
  attempts: number = MAX_PORT_ATTEMPTS,
): Promise<Listener> {
  const lastPort = Math.min(startPort + attempts - 1, MAX_PORT);

  for (let port = startPort; port <= lastPort; port += 1) {
    try {
      return await listen(app, port);
    } catch (error) {
      if (isAddressInUse(error)) continue;
      throw error;
    }
  }

  throw new PortsExhaustedError(startPort, lastPort);
}

/** The dashboard's own version, read from the package manifest shipped alongside it. */
export async function readDashboardVersion(): Promise<string> {
  const manifestPath = new URL("../../package.json", import.meta.url);
  const manifest: unknown = JSON.parse(await readFile(manifestPath, "utf8"));
  const version = (manifest as { version?: unknown }).version;
  return typeof version === "string" ? version : "unknown";
}

/** The second line of `--version`: the binary this dashboard would talk to. */
async function describeOpenSpecVersion(): Promise<string> {
  const path = await resolveBinaryPath();
  if (path === null) return "openspec: not found on PATH";

  const version = await detectVersion(runOpenSpec);
  if (version === null) return `openspec: version not reported (resolved from ${path})`;
  return `openspec ${version} (${path})`;
}

export interface CliIo {
  stdout: (line: string) => void;
  stderr: (line: string) => void;
  openBrowser: (url: string) => Promise<unknown>;
}

const defaultIo: CliIo = {
  stdout: (line) => process.stdout.write(line),
  stderr: (line) => process.stderr.write(line),
  openBrowser: (url) => openBrowserDefault(url),
};

export interface CliResult {
  exitCode: number;
  listener?: Listener;
}

/**
 * Runs the entrypoint. The server binds even when the environment is broken: the
 * diagnostic is the product, and it is delivered by the SPA rather than by an exit code.
 */
export async function runCli(argv: string[], io: CliIo = defaultIo): Promise<CliResult> {
  const parsed = parseCliArgs(argv);

  if (parsed.kind === "help") {
    io.stdout(USAGE);
    return { exitCode: 0 };
  }

  if (parsed.kind === "version") {
    io.stdout(`openspec-dashboard ${await readDashboardVersion()}\n`);
    io.stdout(`${await describeOpenSpecVersion()}\n`);
    return { exitCode: 0 };
  }

  if (parsed.kind === "error") {
    io.stderr(`${parsed.message}\n\n${USAGE}`);
    return { exitCode: 1 };
  }

  const { port, open } = parsed.options;

  let listener: Listener;
  try {
    listener = await bindWithFallback(createApp(), port);
  } catch (error) {
    io.stderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return { exitCode: 1 };
  }

  io.stdout(`OpenSpec dashboard listening on ${listener.url}\n`);

  if (open) {
    try {
      await io.openBrowser(listener.url);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      io.stdout(`Notice: could not open a browser (${detail}). Open ${listener.url} yourself.\n`);
    }
  }

  return { exitCode: 0, listener };
}
