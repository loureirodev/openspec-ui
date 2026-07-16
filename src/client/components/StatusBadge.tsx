import { StatusIcon } from "./StatusIcon.js";

export type BadgeTone = "success" | "info" | "danger" | "neutral" | "closed";

/**
 * Statuses this dashboard recognizes well enough to color meaningfully; anything else is
 * neutral. Kept in sync with `StatusIcon`'s own status-to-shape vocabulary — a status
 * recognized there with a danger-toned shape (`error`, `blocked`) must be danger-toned here
 * too, or the badge's icon and text visibly disagree.
 */
const KNOWN_TONES: Record<string, BadgeTone> = {
  done: "success",
  complete: "success",
  "in-progress": "info",
  ready: "info",
  blocked: "danger",
  error: "danger",
};

export interface StatusBadgeProps {
  status: string;
  /** Frames the badge with a closed tone regardless of `status`, for the archived detail. */
  historical?: boolean;
  /**
   * Tasks completed / total — when both are given for an `in-progress` status, the icon
   * fills proportionally (the changes list's sole progress indicator); omitted elsewhere,
   * which renders a simple, non-fractional state icon (e.g. the change detail's per-artifact
   * states, which keep their own dedicated progress bar as the focal metric).
   */
  completed?: number;
  total?: number;
}

/**
 * A small status marker: a `StatusIcon` glyph plus the status as coloured text (no filled
 * pill — see design.md's status-icon vocabulary). A `status` value this dashboard does not
 * recognize still renders — with a neutral tone rather than as an error, so version drift in
 * the binary degrades cosmetically. `historical` overrides the tone (and icon) to a closed,
 * neutral one for archived framing.
 */
export function StatusBadge({ status, historical = false, completed, total }: StatusBadgeProps) {
  const tone: BadgeTone = historical ? "closed" : (KNOWN_TONES[status] ?? "neutral");
  const iconStatus = historical ? "closed" : status;
  return (
    <span className={`status-badge status-badge--${tone}`} data-status={status}>
      <StatusIcon status={iconStatus} completed={completed} total={total} size={14} decorative />
      {status}
    </span>
  );
}
