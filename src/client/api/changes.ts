import { useQuery } from "@tanstack/react-query";
import type { ChangeListResult, ResolvedChange } from "../../server/openspec-adapter.js";
import { fetchJson } from "./fetch-json.js";

export type {
  ArtifactFile,
  ChangeListItem,
  ChangeListResult,
  ResolvedArtifact,
  ResolvedChange,
} from "../../server/openspec-adapter.js";

export const changesQueryKey = ["changes"] as const;
export const changeQueryKey = (name: string) => ["changes", name] as const;

/**
 * The active-and-archived changes list. Mirrors {@link useHealth}'s shape: `refetchOnWindowFocus`
 * is off because the server spawns the binary per request, and the global Refresh control
 * invalidates this query like every other.
 */
export function useChanges() {
  return useQuery({
    queryKey: changesQueryKey,
    queryFn: () => fetchJson<ChangeListResult>("/api/changes"),
    refetchOnWindowFocus: false,
  });
}

/** One active change's full detail: its artifacts with inlined markdown and recomputed progress. */
export function useChange(name: string) {
  return useQuery({
    queryKey: changeQueryKey(name),
    queryFn: () => fetchJson<ResolvedChange>(`/api/changes/${encodeURIComponent(name)}`),
    refetchOnWindowFocus: false,
  });
}
