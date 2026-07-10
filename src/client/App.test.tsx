import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HealthResponse } from "../shared/health.js";
import { MINIMUM_OPENSPEC_VERSION } from "../shared/version.js";
import { App } from "./App.js";

const HEALTHY: HealthResponse = {
  status: "ok",
  resolvedBinaryPath: "/usr/local/bin/openspec",
  version: MINIMUM_OPENSPEC_VERSION,
};

/** Resolves the next `/api/health` request with `health`, one call at a time. */
function mockHealth(...responses: HealthResponse[]) {
  const fetchMock = vi.fn(async () => {
    const health = responses.length > 1 ? responses.shift() : responses[0];
    return new Response(JSON.stringify(health), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** A deferred `/api/health` so the pending state can be observed. */
function mockPendingHealth() {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise<Response>(() => {})),
  );
}

function renderApp(ui: ReactElement = <App />, initialPath = "/changes") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialPath]}>{ui}</MemoryRouter>
      </QueryClientProvider>,
    ),
  };
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the health gate", () => {
  it("renders a loading state and no page while health is pending", () => {
    mockPendingHealth();
    renderApp();

    expect(screen.getByRole("status")).toHaveTextContent(/checking your openspec environment/i);
    expect(screen.queryByRole("heading", { name: "Changes" })).not.toBeInTheDocument();
  });

  it("renders the routed page once health is ok", async () => {
    mockHealth(HEALTHY);
    renderApp();

    expect(await screen.findByRole("heading", { name: "Changes" })).toBeInTheDocument();
  });

  it.each([
    "/changes",
    "/archived",
    "/specs",
  ])("renders diagnostics instead of the page at %s", async (path) => {
    mockHealth({ status: "error", check: "project", message: "nope", remedy: "cd somewhere" });
    renderApp(<App />, path);

    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(
      /not an OpenSpec project/i,
    );
    expect(screen.queryByRole("heading", { name: "Specs" })).not.toBeInTheDocument();
  });

  it("keeps navigation visible while diagnostics are displayed", async () => {
    mockHealth({ status: "error", check: "binary", message: "gone", remedy: "install it" });
    renderApp();

    await screen.findByRole("heading", { level: 1 });
    for (const label of ["Changes", "Archived", "Specs"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  it("shows diagnostics when the health request keeps failing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 500 })),
    );
    renderApp();

    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(
      /could not be reached/i,
    );
    expect(screen.getByRole("button", { name: /refresh/i })).toBeInTheDocument();
  });
});

describe("the diagnostics screen", () => {
  it("names the binary failure and its remedy", async () => {
    mockHealth({
      status: "error",
      check: "binary",
      message: "The `openspec` binary was not found on PATH.",
      remedy: "Install OpenSpec with `npm install -g openspec`.",
    });
    renderApp();

    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(
      /not found on PATH/i,
    );
    expect(screen.getByText(/npm install -g openspec/)).toBeInTheDocument();
  });

  it("reports the detected version, the minimum and the resolved path for a version failure", async () => {
    mockHealth({
      status: "error",
      check: "version",
      version: "1.2.0",
      resolvedBinaryPath: "/usr/local/bin/openspec",
      message: "too old",
      remedy: "upgrade",
    });
    renderApp();

    await screen.findByRole("heading", { level: 1 });
    expect(screen.getByText("1.2.0")).toBeInTheDocument();
    expect(screen.getByText(MINIMUM_OPENSPEC_VERSION)).toBeInTheDocument();
    expect(screen.getByText("/usr/local/bin/openspec")).toBeInTheDocument();
  });

  it("names the project failure and its remedy", async () => {
    mockHealth({
      status: "error",
      check: "project",
      message: "The current working directory is not an OpenSpec project.",
      remedy: "Run `openspec init` here.",
    });
    renderApp();

    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(
      /not an OpenSpec project/i,
    );
    expect(screen.getByText(/openspec init/)).toBeInTheDocument();
  });
});

describe("navigation", () => {
  it("switches pages and marks the active item", async () => {
    mockHealth(HEALTHY);
    renderApp();
    await screen.findByRole("heading", { name: "Changes" });

    await userEvent.click(screen.getByRole("link", { name: "Archived" }));

    expect(await screen.findByRole("heading", { name: "Archived" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Archived" })).toHaveAttribute("aria-current", "page");
  });

  it("redirects the root path to changes", async () => {
    mockHealth(HEALTHY);
    renderApp(<App />, "/");

    expect(await screen.findByRole("heading", { name: "Changes" })).toBeInTheDocument();
  });

  it("renders a not-found view inside the shell for an unknown path", async () => {
    mockHealth(HEALTHY);
    renderApp(<App />, "/nowhere");

    expect(await screen.findByRole("heading", { name: /page not found/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Changes" })).toBeInTheDocument();
  });
});

describe("the refresh control", () => {
  it("invalidates queries, refetching health", async () => {
    const fetchMock = mockHealth(HEALTHY);
    renderApp();
    await screen.findByRole("heading", { name: "Changes" });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: /refresh/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("renders the routed page after the environment is repaired and refreshed", async () => {
    mockHealth(
      { status: "error", check: "binary", message: "gone", remedy: "install it" },
      HEALTHY,
    );
    renderApp();
    await screen.findByRole("heading", { level: 1 });

    await userEvent.click(screen.getByRole("button", { name: /refresh/i }));

    expect(await screen.findByRole("heading", { name: "Changes" })).toBeInTheDocument();
  });

  it("indicates that a refresh is in flight", async () => {
    mockPendingHealth();
    renderApp();

    const refresh = await screen.findByRole("button", { name: /refreshing/i });
    expect(refresh).toHaveAttribute("aria-busy", "true");
    expect(refresh).toBeDisabled();
  });
});
