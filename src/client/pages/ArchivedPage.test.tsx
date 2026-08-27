import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArchivedPage } from "./ArchivedPage.js";

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ArchivedPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the archived browser", () => {
  it("lists archived changes and opens the historical detail on selection", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/archived/old-feature")) {
          return jsonResponse({
            name: "old-feature",
            archived: true,
            schema: { name: "spec-driven", inferred: false },
            progress: { completed: 2, total: 3 },
            artifacts: [
              {
                id: "proposal",
                files: [
                  { path: "/p", relPath: "proposal.md", label: "proposal", markdown: "# proposal" },
                ],
              },
              {
                id: "specs",
                historical: true,
                files: [
                  {
                    path: "/s",
                    relPath: "specs/core/spec.md",
                    label: "core",
                    markdown: "# ADDED Requirements",
                  },
                ],
              },
            ],
          });
        }
        return jsonResponse([{ name: "old-feature", archivedDate: "2026-07-01" }]);
      }),
    );

    renderPage();

    const row = await screen.findByRole("button", { name: /old-feature/ });
    expect(row).toBeInTheDocument();

    await userEvent.click(row);

    expect(await screen.findByRole("heading", { name: "Old Feature" })).toBeInTheDocument();

    // No per-artifact status was supplied, and the historical framing carries no visible
    // status text badge — the tab's icon and its accessible name ("historical") carry it.
    expect(screen.queryByText("done")).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /status:/ })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /proposal — historical/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /specs — historical/i })).toBeInTheDocument();

    // Spec deltas are collapsed by default, expandable on demand.
    await userEvent.click(screen.getByRole("tab", { name: /specs/i }));
    const details = document.querySelector("details.change-detail__historical-body");
    expect(details).not.toHaveAttribute("open");
  });

  it("renders an empty state when there are no archived changes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse([])),
    );

    renderPage();

    expect(await screen.findByText(/no archived changes/i)).toBeInTheDocument();
  });
});
