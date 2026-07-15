import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SpecsPage } from "./SpecsPage.js";

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
      <SpecsPage />
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

describe("the specs browser", () => {
  it("lists capabilities in the sidebar with their requirement counts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse([{ id: "core", requirementCount: 2 }])),
    );

    renderPage();

    expect(await screen.findByText("Core")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText(/select a capability/i)).toBeInTheDocument();
  });

  it("selecting a capability shows each requirement's short title in the sidebar, linked to a matching heading id", async () => {
    // Shaped after the live `show --type spec --json` output: the JSON's requirement `text`
    // is the body statement, not the heading's short title, so the sidebar's label — and the
    // anchor match — must both come from the raw markdown, not the JSON (see
    // requirement-anchors.ts).
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/specs/core")) {
          return jsonResponse({
            id: "core",
            markdown: "### Requirement: Widgets render\n\nThe system SHALL render widgets.\n",
            index: {
              id: "core",
              title: "Core",
              requirementCount: 1,
              requirements: [
                { text: "The system SHALL render widgets given valid data.", scenarios: [] },
              ],
            },
          });
        }
        return jsonResponse([{ id: "core", requirementCount: 1 }]);
      }),
    );

    renderPage();

    await userEvent.click(await screen.findByText("Core"));

    // The sidebar shows the requirement's short title, not the JSON's long body statement.
    const link = await screen.findByRole("link", { name: "Widgets render" });
    expect(link).toHaveAttribute("href", "#requirement-1");
    expect(screen.queryByText("The system SHALL render widgets given valid data.")).toBeNull();

    const heading = await screen.findByRole("heading", { name: /Requirement: Widgets render/ });
    expect(heading.id).toBe("requirement-1");
  });

  it("renders a malformed spec's raw body alongside its validation messages, with the sidebar still expandable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/specs/core")) {
          return jsonResponse({
            id: "core",
            markdown: "### Requirement: Widgets render\n\nBody.\n",
            error: {
              kind: "validation",
              message: "bad",
              details: ["Requirement missing a scenario."],
            },
          });
        }
        return jsonResponse([{ id: "core", requirementCount: 1 }]);
      }),
    );

    renderPage();

    await userEvent.click(await screen.findByText("Core"));

    expect(await screen.findByRole("alert")).toHaveTextContent("Requirement missing a scenario.");
    expect(
      await screen.findByRole("heading", { name: /Requirement: Widgets render/ }),
    ).toBeInTheDocument();
    // The sidebar can still expand into anchors: the titles come from the markdown, which is
    // readable even though the structured index failed validation.
    expect(await screen.findByRole("link", { name: "Widgets render" })).toHaveAttribute(
      "href",
      "#requirement-1",
    );
  });

  it("renders a friendly empty state when the project has no specs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse([])),
    );

    renderPage();

    expect(await screen.findByText(/no specs yet/i)).toBeInTheDocument();
  });
});
