import type { CommandResult, RunOpenSpec } from "./openspec-binary.js";

/**
 * The data-access layer over the `openspec` binary. Every supported read command is
 * wrapped so it spawns through the injected {@link RunOpenSpec} seam, parses its JSON
 * once, and maps the binary's two failure shapes onto typed errors:
 *
 * - a *validation failure* — JSON `{ status: [{ severity: "error", … }] }` — becomes an
 *   {@link OpenSpecValidationError}, so a consumer learns "the change is invalid";
 * - anything else that leaves stdout unparseable (a spawn failure, a crash, truncated
 *   output) becomes an {@link OpenSpecToolError}, so a consumer learns "the tool broke".
 *
 * Consumers discriminate the two by error type, never by string-matching stderr.
 */

/** Raised when the binary reports a validation failure in its own `{ status: [...] }` shape. */
export class OpenSpecValidationError extends Error {
  /** The messages of every `severity: "error"` entry the binary reported. */
  readonly messages: string[];

  constructor(messages: string[]) {
    super(messages.join("\n") || "The openspec command reported a validation error.");
    this.name = "OpenSpecValidationError";
    this.messages = messages;
  }
}

/** Raised when a command's stdout cannot be parsed — a spawn failure, crash or non-JSON output. */
export class OpenSpecToolError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "OpenSpecToolError";
  }
}

/** A single entry in the binary's validation-failure `status` array. */
interface ValidationStatusEntry {
  severity: string;
  message: string;
  code?: string;
}

/**
 * Whether a parsed body is the binary's validation-failure shape: a top-level `status`
 * array carrying at least one `severity: "error"` entry. The success shapes of every
 * supported command use a `status` that is a *string* (or omit it entirely), so an
 * array here is an unambiguous discriminator.
 */
function validationErrorMessages(data: unknown): string[] | null {
  if (typeof data !== "object" || data === null) return null;
  const status = (data as { status?: unknown }).status;
  if (!Array.isArray(status)) return null;

  const errors = status.filter(
    (entry): entry is ValidationStatusEntry =>
      typeof entry === "object" &&
      entry !== null &&
      (entry as { severity?: unknown }).severity === "error",
  );
  if (errors.length === 0) return null;

  return errors.map((entry) => entry.message ?? "Unspecified validation error.");
}

/**
 * Detects the validation-failure shape in an already-parsed body and raises the typed
 * validation error. A no-op for every ordinary success body.
 */
export function assertNoValidationError(data: unknown): void {
  const messages = validationErrorMessages(data);
  if (messages !== null) throw new OpenSpecValidationError(messages);
}

/**
 * Parses a command's stdout into a typed result. Unparseable stdout — the signature of a
 * spawn failure, a crash or truncated output — raises a tool-failure error rather than
 * leaking a raw `SyntaxError`. A well-formed validation body raises a validation error.
 */
export function parseCommandJson<T>(result: CommandResult, command: string): T {
  let data: unknown;
  try {
    data = JSON.parse(result.stdout);
  } catch (cause) {
    const detail = result.stderr.trim() || `exit code ${result.exitCode}`;
    throw new OpenSpecToolError(`\`openspec ${command}\` did not return valid JSON (${detail}).`, {
      cause,
    });
  }

  assertNoValidationError(data);
  return data as T;
}

// --- Typed result shapes, as emitted by openspec >= 1.5.0 --------------------------------

/** One change as reported by `list --json`. */
export interface ChangeSummary {
  name: string;
  completedTasks: number;
  totalTasks: number;
  lastModified: string;
  status: string;
}

export interface ChangesList {
  changes: ChangeSummary[];
  root?: { path: string; source: string };
}

/** One spec as reported by `list --specs --json`. */
export interface SpecSummary {
  id: string;
  requirementCount: number;
}

export interface SpecsList {
  specs: SpecSummary[];
  root?: { path: string; source: string };
}

/** An artifact's completion status, in schema order, as reported by `status --change`. */
export interface ArtifactStatus {
  id: string;
  outputPath: string;
  status: string;
  /** The ids of dependency artifacts still missing, present only when `status` is `blocked`. */
  missingDeps?: string[];
}

/** The resolved file paths for one artifact, as reported by `status --change`. */
export interface ArtifactPathInfo {
  outputPath: string;
  resolvedOutputPath: string;
  /** The subset of the artifact's paths that exist on disk, absolute. */
  existingOutputPaths: string[];
}

export interface StatusResult {
  changeName: string;
  schemaName: string;
  artifacts: ArtifactStatus[];
  artifactPaths: Record<string, ArtifactPathInfo>;
  isComplete?: boolean;
  nextSteps?: string[];
  changeRoot?: string;
}

/** One schema and its ordered artifact ids, as reported by `schemas --json`. */
export interface SchemaInfo {
  name: string;
  description?: string;
  artifacts: string[];
  source?: string;
}

/** A spec body, as reported by `show <id> --type spec --json`. */
export interface SpecDetail {
  id: string;
  title: string;
  overview?: string;
  requirementCount: number;
  requirements: Array<{ text: string; scenarios: Array<{ rawText: string }> }>;
}

// --- Command wrappers, one per supported read -------------------------------------------

/** `openspec list --json` — the active changes. */
export async function runListChanges(run: RunOpenSpec): Promise<ChangesList> {
  return parseCommandJson<ChangesList>(await run(["list", "--json"]), "list --json");
}

/** `openspec list --specs --json` — the project's specs. */
export async function runListSpecs(run: RunOpenSpec): Promise<SpecsList> {
  return parseCommandJson<SpecsList>(
    await run(["list", "--specs", "--json"]),
    "list --specs --json",
  );
}

/** `openspec status --change <name> --json` — per-artifact status and resolved paths. */
export async function runStatus(run: RunOpenSpec, changeName: string): Promise<StatusResult> {
  return parseCommandJson<StatusResult>(
    await run(["status", "--change", changeName, "--json"]),
    `status --change ${changeName} --json`,
  );
}

/**
 * `openspec show <id> --type spec --json` — a single spec body.
 *
 * The design document sketched this as `show <id> --specs`, but that flag does not exist
 * on the binary; `--type spec` is the form that disambiguates a spec from a change.
 */
export async function runShowSpec(run: RunOpenSpec, id: string): Promise<SpecDetail> {
  return parseCommandJson<SpecDetail>(
    await run(["show", id, "--type", "spec", "--json"]),
    `show ${id} --type spec --json`,
  );
}

/** `openspec schemas --json` — every schema with its ordered artifact ids. */
export async function runSchemas(run: RunOpenSpec): Promise<SchemaInfo[]> {
  return parseCommandJson<SchemaInfo[]>(await run(["schemas", "--json"]), "schemas --json");
}
