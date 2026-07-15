import { useQuery } from "@tanstack/react-query";
import type { ArchivedChangeSummary, ResolvedChange } from "../../server/openspec-adapter.js";
import { fetchJson } from "./fetch-json.js";

export type { ArchivedChangeSummary } from "../../server/openspec-adapter.js";

export const archivedQueryKey = ["archived"] as const;
export const archivedChangeQueryKey = (id: string) => ["archived", id] as const;

/** The archived changes list: name and archived date, independent of the binary. */
export function useArchived() {
  return useQuery({
    queryKey: archivedQueryKey,
    queryFn: () => fetchJson<ArchivedChangeSummary[]>("/api/archived"),
    refetchOnWindowFocus: false,
  });
}

/** One archived change's detail, in the same shape as {@link useChange}, framed as history. */
export function useArchivedChange(id: string) {
  return useQuery({
    queryKey: archivedChangeQueryKey(id),
    queryFn: () => fetchJson<ResolvedChange>(`/api/archived/${encodeURIComponent(id)}`),
    refetchOnWindowFocus: false,
  });
}
