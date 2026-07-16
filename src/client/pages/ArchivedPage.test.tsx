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

    expect(await screen.findByText("old-feature")).toBeInTheDocument();

    await userEvent.click(screen.getByText("old-feature"));

    expect(await screen.findByRole("heading", { name: "Old Feature" })).toBeInTheDocument();

    // No per-artifact status was supplied, so no fabricated status badge is rendered —
    // only the closed-tone "historical" badge on the spec-delta artifact.
    expect(screen.queryByText("done")).not.toBeInTheDocument();
    const historicalBadges = screen.getAllByText("historical");
    expect(historicalBadges.length).toBeGreaterThan(0);
    for (const badge of historicalBadges) {
      expect(badge.className).toContain("status-badge--closed");
    }

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
