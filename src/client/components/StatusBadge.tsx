export type BadgeTone = "success" | "info" | "danger" | "neutral" | "closed";

/** Statuses this dashboard recognizes well enough to color meaningfully; anything else is neutral. */
const KNOWN_TONES: Record<string, BadgeTone> = {
  done: "success",
  complete: "success",
  "in-progress": "info",
  ready: "info",
  blocked: "danger",
};

export interface StatusBadgeProps {
  status: string;
  /** Frames the badge with a closed tone regardless of `status`, for the archived detail. */
  historical?: boolean;
}

/**
 * A small status badge. A `status` value this dashboard does not recognize still renders —
 * with a neutral tone rather than as an error, so version drift in the binary degrades
 * cosmetically. `historical` overrides the tone to a closed one for archived framing.
 */
export function StatusBadge({ status, historical = false }: StatusBadgeProps) {
  const tone: BadgeTone = historical ? "closed" : (KNOWN_TONES[status] ?? "neutral");
  return (
    <span className={`status-badge status-badge--${tone}`} data-status={status}>
      {status}
    </span>
  );
}
