import { useIsFetching, useQueryClient } from "@tanstack/react-query";

/**
 * The single global refresh control. It invalidates every cached query rather than any
 * named one, so a page added by a later change participates without registering itself
 * — reading its data through `useQuery` is the whole contract.
 *
 * Icon-only: the glyph alone carries no accessible name, so `aria-label` names the action
 * (and reflects the in-flight state); the glyph spins via CSS while `aria-busy`, and the
 * button is disabled until the refresh settles — see design.md's icon-button rule.
 */
export function RefreshControl() {
  const queryClient = useQueryClient();
  const isFetching = useIsFetching() > 0;

  return (
    <button
      type="button"
      className="icon-button refresh-control"
      aria-label={isFetching ? "Refreshing…" : "Refresh"}
      onClick={() => {
        void queryClient.invalidateQueries();
      }}
      disabled={isFetching}
      aria-busy={isFetching}
    >
      <svg
        className="icon-button__glyph"
        aria-hidden="true"
        width={16}
        height={16}
        viewBox="0 0 16 16"
      >
        <path
          d="M13 8a5 5 0 1 1-1.6-3.7M13 2v3.3h-3.3"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
