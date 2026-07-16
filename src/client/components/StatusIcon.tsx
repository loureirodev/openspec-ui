import { describePieSlice } from "../lib/pie-geometry.js";

export type IconStatus = "done" | "in-progress" | "ready" | "no-tasks" | "blocked" | "error";

/** Statuses this dashboard maps to a specific icon shape; anything else falls back to neutral. */
const KNOWN_ICON_STATUSES: Record<string, IconStatus> = {
  done: "done",
  complete: "done",
  "in-progress": "in-progress",
  ready: "ready",
  "no-tasks": "no-tasks",
  blocked: "blocked",
  error: "error",
};

export interface StatusIconProps {
  status: string;
  /** Tasks completed so far — only meaningful (and only used) for `in-progress`. */
  completed?: number;
  /** Total tasks — only meaningful (and only used) for `in-progress`. */
  total?: number;
  /** Rendered size in `em`-equivalent pixels; the icon scales with the surrounding text. */
  size?: number;
  className?: string;
  /**
   * Hides the icon from the accessibility tree — for callers (like `StatusBadge`) that
   * already render the status as adjacent visible text, so the icon doesn't announce a
   * second, potentially different, accessible name (e.g. `historical` framing overrides the
   * icon's shape to a neutral "closed" glyph while the visible text still shows the real
   * status; without this the icon's own label would contradict it).
   */
  decorative?: boolean;
}

const CENTER = 8;
const RADIUS = 6;

/**
 * A small inline-SVG status icon drawn from a fixed Linear-style vocabulary: `done` is a
 * filled circle with a check, `in-progress` fills radially to the exact `completed / total`
 * fraction (the icon *is* the progress bar), `ready` is a thin ring, `no-tasks` a dashed
 * ring, `blocked` a dashed dimmed ring, and `error` a ring with a cross. A `status` value
 * outside this vocabulary renders a neutral dashed ring rather than presenting as an error —
 * see the `status-indicators` capability.
 */
export function StatusIcon({
  status,
  completed,
  total,
  size = 16,
  className,
  decorative = false,
}: StatusIconProps) {
  const known = KNOWN_ICON_STATUSES[status];

  // `done` short-circuits an in-progress fill that reaches (or, from stale/inconsistent
  // data, exceeds) 100%: a change with all tasks complete is `done`, never a full — or
  // empty, since `describePieSlice` treats `fraction >= 1` as "no slice to draw" — in-progress
  // wedge.
  const effective: IconStatus | "neutral" =
    known === "in-progress" && total !== undefined && total > 0 && (completed ?? 0) >= total
      ? "done"
      : (known ?? "neutral");

  const fraction =
    effective === "in-progress" && total !== undefined && total > 0
      ? Math.min(Math.max((completed ?? 0) / total, 0), 1)
      : undefined;

  return (
    <svg
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : `status: ${status}`}
      aria-hidden={decorative || undefined}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      className={className}
      data-status={status}
    >
      {renderShape(effective, fraction)}
    </svg>
  );
}

function renderShape(status: IconStatus | "neutral", fraction: number | undefined) {
  switch (status) {
    case "done":
      return (
        <>
          <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="var(--success)" />
          <path
            d="M5 8.2 L7 10.2 L11 5.8"
            fill="none"
            stroke="var(--bg)"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      );

    case "in-progress": {
      const slice =
        fraction !== undefined ? describePieSlice(CENTER, CENTER, RADIUS, fraction) : null;
      return (
        <>
          <circle
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            fill="none"
            stroke="var(--track)"
            strokeWidth={1.5}
          />
          {slice && <path d={slice} fill="var(--accent)" />}
        </>
      );
    }

    case "ready":
      return (
        <circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={1.25}
        />
      );

    case "no-tasks":
      return (
        <circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          fill="none"
          stroke="var(--faint)"
          strokeWidth={1.25}
          strokeDasharray="2 2"
        />
      );

    case "blocked":
      return (
        <circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          fill="none"
          stroke="var(--danger)"
          strokeWidth={1.25}
          strokeDasharray="2 2"
          opacity={0.6}
        />
      );

    case "error":
      return (
        <>
          <circle
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            fill="none"
            stroke="var(--danger)"
            strokeWidth={1.5}
          />
          <path
            d="M5.5 5.5 L10.5 10.5 M10.5 5.5 L5.5 10.5"
            stroke="var(--danger)"
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        </>
      );

    default:
      return (
        <circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          fill="none"
          stroke="var(--faint)"
          strokeWidth={1.25}
          strokeDasharray="2 2"
        />
      );
  }
}
