import styles from "./Meter.module.css";

export interface MeterProps {
  /** Tasks completed so far. Ignored when `unknown` is set. */
  completed?: number;
  /** Total tasks. Ignored when `unknown` is set. */
  total?: number;
  /** True when the quantity could not be computed — rendered distinctly from zero progress. */
  unknown?: boolean;
  label?: string;
  className?: string;
}

export function Meter({ completed, total, unknown = false, label, className }: MeterProps) {
  if (unknown) {
    return (
      <span
        role="img"
        aria-label={label ?? "progress unknown"}
        className={[styles.meter, styles["meter--unknown"], className].filter(Boolean).join(" ")}
      />
    );
  }

  const safeTotal = total && total > 0 ? total : 0;
  const fraction = safeTotal > 0 ? Math.min(Math.max((completed ?? 0) / safeTotal, 0), 1) : 0;
  const complete = safeTotal > 0 && fraction >= 1;

  return (
    <span
      role="img"
      aria-label={label ?? `${completed ?? 0} of ${safeTotal} complete`}
      className={[styles.meter, className].filter(Boolean).join(" ")}
    >
      <span
        className={[styles.meter__fill, complete ? styles["meter__fill--complete"] : ""]
          .filter(Boolean)
          .join(" ")}
        style={{ width: `${fraction * 100}%` }}
      />
    </span>
  );
}
