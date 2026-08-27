import type { ReactNode } from "react";
import styles from "./Tooltip.module.css";

export interface TooltipProps {
  /** The supplementary detail shown in the bubble. Never the sole copy of anything — the
   *  wrapped control must expose the same content through its own accessible name. */
  content: ReactNode;
  children: ReactNode;
  className?: string;
  /**
   * Anchors the bubble to the trigger's left edge instead of centring it — for a wide,
   * full-width trigger (a changes-list row, a side-nav item) where a centred bubble would
   * either clip against the viewport or land far from the content it annotates.
   */
  start?: boolean;
}

/**
 * The single tooltip treatment — see design.md's tooltip vocabulary.
 */
export function Tooltip({ content, children, className, start = false }: TooltipProps) {
  return (
    <span className={[styles.wrapper, start && styles.start, className].filter(Boolean).join(" ")}>
      {children}
      <span className={styles.bubble} aria-hidden="true">
        {content}
      </span>
    </span>
  );
}

export function TooltipName({ children }: { children: ReactNode }) {
  return <span className={styles.name}>{children}</span>;
}

export function TooltipMeta({ children }: { children: ReactNode }) {
  return <span className={styles.meta}>{children}</span>;
}
