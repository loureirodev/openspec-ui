import { useQuery } from "@tanstack/react-query";
import type { HealthResponse } from "../../shared/health.js";

export const healthQueryKey = ["health"] as const;

async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch("/api/health");
  if (!response.ok) {
    throw new Error(`The dashboard server returned ${response.status} for /api/health.`);
  }
  return (await response.json()) as HealthResponse;
}

/**
 * The environment check every page is gated on. Transient failures are retried by
 * TanStack Query's defaults, so a flaky subprocess spawn does not blank the app.
 *
 * Each check spawns three subprocesses on the server, so window-focus refetching is off:
 * flipping between tabs would otherwise fire a spawn storm. The explicit Refresh control
 * invalidates this query, so re-checking a repaired environment stays one click away.
 */
export function useHealth() {
  return useQuery({
    queryKey: healthQueryKey,
    queryFn: fetchHealth,
    refetchOnWindowFocus: false,
  });
}
