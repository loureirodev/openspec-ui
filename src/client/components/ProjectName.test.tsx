import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HealthResponse } from "../../shared/health.js";
import { ProjectName } from "./ProjectName.js";

const HEALTHY: HealthResponse = {
  status: "ok",
  resolvedBinaryPath: "/usr/local/bin/openspec",
  version: "1.6.0",
  projectRoot: "/home/dani/projects/openspec-ui",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ProjectName", () => {
  it("shows the folder base name with the full path as supplementary detail", () => {
    render(<ProjectName health={HEALTHY} />);

    const button = screen.getByRole("button", { name: /copy path/i });
    expect(button).toHaveTextContent("openspec-ui");
    expect(button).toHaveAccessibleName(/\/home\/dani\/projects\/openspec-ui/);
    // The full path is in the tooltip bubble too, not only the accessible name.
    expect(screen.getByText("/home/dani/projects/openspec-ui")).toBeInTheDocument();
  });

  it("copies the full path and confirms it on click", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<ProjectName health={HEALTHY} />);

    await userEvent.click(screen.getByRole("button", { name: /copy path/i }));

    expect(writeText).toHaveBeenCalledWith("/home/dani/projects/openspec-ui");
    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });

  it("renders nothing when the environment is unhealthy", () => {
    const { container } = render(
      <ProjectName
        health={{ status: "error", check: "binary", message: "gone", remedy: "install" }}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing while health is still loading", () => {
    const { container } = render(<ProjectName health={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when a healthy response somehow lacks a project root", () => {
    const { container } = render(
      <ProjectName health={{ status: "ok", resolvedBinaryPath: "/x", version: "1.6.0" }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
