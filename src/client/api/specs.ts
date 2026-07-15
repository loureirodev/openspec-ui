import { useQuery } from "@tanstack/react-query";
import type { ResolvedSpec, SpecSummary } from "../../server/openspec-adapter.js";
import { fetchJson } from "./fetch-json.js";

export type { ResolvedSpec, SpecDetail, SpecSummary } from "../../server/openspec-adapter.js";

export const specsQueryKey = ["specs"] as const;
export const specQueryKey = (id: string) => ["specs", id] as const;

/** The project's specs: each capability's id and requirement count. */
export function useSpecs() {
  return useQuery({
    queryKey: specsQueryKey,
    queryFn: () => fetchJson<SpecSummary[]>("/api/specs"),
    refetchOnWindowFocus: false,
  });
}

/** One spec's hybrid detail: the structured index (when resolvable) and the raw markdown. */
export function useSpec(id: string) {
  return useQuery({
    queryKey: specQueryKey(id),
    queryFn: () => fetchJson<ResolvedSpec>(`/api/specs/${encodeURIComponent(id)}`),
    refetchOnWindowFocus: false,
  });
}
