import { describe, expect, it } from "vitest";
import type { CommandResult, RunOpenSpec } from "./openspec-binary.js";
import {
  OpenSpecToolError,
  OpenSpecValidationError,
  runListChanges,
  runListSpecs,
  runSchemas,
  runShowSpec,
  runStatus,
} from "./openspec-data.js";

/** Records the args a wrapper passed to the binary while returning a canned result. */
function stubRun(result: Partial<CommandResult>): { run: RunOpenSpec; calls: string[][] } {
  const calls: string[][] = [];
  const run: RunOpenSpec = async (args) => {
    calls.push(args);
    return { exitCode: 0, stdout: "", stderr: "", ...result };
  };
  return { run, calls };
}

const VALIDATION_STDOUT = JSON.stringify({
  status: [{ severity: "error", code: "change_error", message: "Change 'x' not found." }],
});

describe("runListChanges", () => {
  it("returns the parsed change list on the happy path", async () => {
    const body = {
      changes: [{ name: "a", completedTasks: 1, totalTasks: 2, status: "in-progress" }],
    };
    const { run, calls } = stubRun({ stdout: JSON.stringify(body) });

    const result = await runListChanges(run);

    expect(result.changes[0]?.name).toBe("a");
    expect(calls[0]).toEqual(["list", "--json"]);
  });

  it("raises a validation error for the binary's error shape", async () => {
    const { run } = stubRun({ exitCode: 1, stdout: VALIDATION_STDOUT });

    await expect(runListChanges(run)).rejects.toBeInstanceOf(OpenSpecValidationError);
    await expect(runListChanges(run)).rejects.toMatchObject({
      messages: ["Change 'x' not found."],
    });
  });

  it("raises a tool error when stdout is not JSON", async () => {
    const { run } = stubRun({ exitCode: -1, stdout: "", stderr: "spawn ENOENT" });

    await expect(runListChanges(run)).rejects.toBeInstanceOf(OpenSpecToolError);
  });
});

describe("runListSpecs", () => {
  it("returns parsed specs and calls the right command", async () => {
    const { run, calls } = stubRun({
      stdout: JSON.stringify({ specs: [{ id: "s", requirementCount: 3 }] }),
    });

    const result = await runListSpecs(run);

    expect(result.specs[0]?.id).toBe("s");
    expect(calls[0]).toEqual(["list", "--specs", "--json"]);
  });

  it("raises a tool error on garbage output", async () => {
    const { run } = stubRun({ stdout: "not json at all" });
    await expect(runListSpecs(run)).rejects.toBeInstanceOf(OpenSpecToolError);
  });
});

describe("runStatus", () => {
  it("returns the parsed status and threads the change name into the command", async () => {
    const body = {
      changeName: "demo",
      schemaName: "spec-driven",
      artifacts: [],
      artifactPaths: {},
    };
    const { run, calls } = stubRun({ stdout: JSON.stringify(body) });

    const result = await runStatus(run, "demo");

    expect(result.changeName).toBe("demo");
    expect(calls[0]).toEqual(["status", "--change", "demo", "--json"]);
  });

  it("raises a validation error for an unknown change", async () => {
    const { run } = stubRun({ stdout: VALIDATION_STDOUT });
    await expect(runStatus(run, "x")).rejects.toBeInstanceOf(OpenSpecValidationError);
  });

  it("raises a tool error when stdout is unparseable", async () => {
    const { run } = stubRun({ stdout: "<html>crash</html>" });
    await expect(runStatus(run, "x")).rejects.toBeInstanceOf(OpenSpecToolError);
  });
});

describe("runShowSpec", () => {
  it("uses the --type spec form and returns the parsed detail", async () => {
    const body = { id: "app-shell", title: "app-shell", requirementCount: 1, requirements: [] };
    const { run, calls } = stubRun({ stdout: JSON.stringify(body) });

    const result = await runShowSpec(run, "app-shell");

    expect(result.id).toBe("app-shell");
    expect(calls[0]).toEqual(["show", "app-shell", "--type", "spec", "--json"]);
  });

  it("raises a validation error for an unknown spec", async () => {
    const { run } = stubRun({ stdout: VALIDATION_STDOUT });
    await expect(runShowSpec(run, "nope")).rejects.toBeInstanceOf(OpenSpecValidationError);
  });

  it("raises a tool error on unparseable output", async () => {
    const { run } = stubRun({ stdout: "" });
    await expect(runShowSpec(run, "x")).rejects.toBeInstanceOf(OpenSpecToolError);
  });
});

describe("runSchemas", () => {
  it("returns the parsed schema array", async () => {
    const body = [{ name: "spec-driven", artifacts: ["proposal", "specs", "design", "tasks"] }];
    const { run, calls } = stubRun({ stdout: JSON.stringify(body) });

    const result = await runSchemas(run);

    expect(result[0]?.artifacts).toEqual(["proposal", "specs", "design", "tasks"]);
    expect(calls[0]).toEqual(["schemas", "--json"]);
  });

  it("raises a tool error on unparseable output", async () => {
    const { run } = stubRun({ stdout: "boom" });
    await expect(runSchemas(run)).rejects.toBeInstanceOf(OpenSpecToolError);
  });
});
