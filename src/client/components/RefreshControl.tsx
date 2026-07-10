import { useIsFetching, useQueryClient } from "@tanstack/react-query";

/**
 * The single global refresh control. It invalidates every cached query rather than any
 * named one, so a page added by a later change participates without registering itself
 * — reading its data through `useQuery` is the whole contract.
 */
export function RefreshControl() {
  const queryClient = useQueryClient();
  const isFetching = useIsFetching() > 0;

  return (
    <button
      type="button"
      className="refresh-control"
      onClick={() => {
        void queryClient.invalidateQueries();
      }}
      disabled={isFetching}
      aria-busy={isFetching}
    >
      {isFetching ? "Refreshing…" : "Refresh"}
    </button>
  );
}
