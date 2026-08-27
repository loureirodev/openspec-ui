import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeToggle } from "./ThemeToggle.js";

/**
 * A controllable `matchMedia` stub. `set(matches)` flips the environment preference and
 * notifies every registered `change` listener, the way a real OS theme switch would.
 */
function stubMatchMedia(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();

  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches,
      media: query,
      addEventListener: (_: "change", cb: (event: MediaQueryListEvent) => void) =>
        listeners.add(cb),
      removeEventListener: (_: "change", cb: (event: MediaQueryListEvent) => void) =>
        listeners.delete(cb),
    })),
  );

  return {
    set(next: boolean) {
      matches = next;
      for (const cb of listeners) cb({ matches: next } as MediaQueryListEvent);
    },
  };
}

beforeEach(() => {
  delete document.documentElement.dataset.theme;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.theme;
});

describe("ThemeToggle", () => {
  it("starts from the environment preference and sets no data-theme attribute", () => {
    stubMatchMedia(true);
    render(<ThemeToggle />);

    expect(screen.getByRole("button", { name: "Switch to light theme" })).toBeInTheDocument();
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it("flips the theme and pins it with data-theme on click", async () => {
    stubMatchMedia(false);
    render(<ThemeToggle />);

    await userEvent.click(screen.getByRole("button", { name: "Switch to dark theme" }));

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(screen.getByRole("button", { name: "Switch to light theme" })).toBeInTheDocument();
  });

  it("tracks an environment change until the toggle is used", async () => {
    const media = stubMatchMedia(false);
    render(<ThemeToggle />);
    expect(screen.getByRole("button", { name: "Switch to dark theme" })).toBeInTheDocument();

    media.set(true);
    expect(
      await screen.findByRole("button", { name: "Switch to light theme" }),
    ).toBeInTheDocument();
    expect(document.documentElement.dataset.theme).toBeUndefined();

    await userEvent.click(screen.getByRole("button", { name: "Switch to light theme" }));
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("does not write to localStorage", async () => {
    stubMatchMedia(false);
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    render(<ThemeToggle />);

    await userEvent.click(screen.getByRole("button", { name: /switch to/i }));

    expect(setItem).not.toHaveBeenCalled();
  });
});
