import type { ReactNode } from "react";
import styles from "./Callout.module.css";

export type CalloutTone = "info" | "danger" | "success";

const TONE_CLASS: Record<CalloutTone, string> = {
  info: styles["callout--info"] ?? "",
  danger: styles["callout--danger"] ?? "",
  success: styles["callout--success"] ?? "",
};

/**
 * The rounded-square frame shared by all three tone glyphs — a hand-picked line icon from
 * `references/icons` (the `*-square` family), with the same small gap at the top-right that
 * `StatusIcon`'s ring has.
 */
const SQUARE_FRAME =
  "M22 12c0 4.714 0 7.071-1.465 8.535C19.072 22 16.714 22 12 22s-7.071 0-8.536-1.465C2 19.072 2 16.714 2 12s0-7.071 1.464-8.536C4.93 2 7.286 2 12 2s7.071 0 8.535 1.464c.974.974 1.3 2.343 1.41 4.536";

/** A small tone-coloured glyph, drawn from `currentColor` so it always matches the title. */
function ToneIcon({ tone }: { tone: CalloutTone }) {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {tone === "danger" && (
        <>
          <path d="M12 7V13" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
          <circle cx={12} cy={16} r={1} fill="currentColor" />
        </>
      )}
      {tone === "success" && (
        <path
          d="m8.5 12.5 2 2 5-5"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {tone === "info" && (
        <>
          <path d="M12 17v-6" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
          <circle cx={12} cy={8} r={1} fill="currentColor" />
        </>
      )}
      <path d={SQUARE_FRAME} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  );
}

export interface CalloutProps {
  tone: CalloutTone;
  title: ReactNode;
  children?: ReactNode;
  /** Optional list of supplementary detail lines, rendered below the body. */
  details?: string[];
}

export function Callout({ tone, title, children, details }: CalloutProps) {
  return (
    <div
      className={`${styles.callout} ${TONE_CLASS[tone]}`}
      role={tone === "danger" ? "alert" : undefined}
    >
      <span className={styles.callout__icon}>
        <ToneIcon tone={tone} />
      </span>
      <p className={styles.callout__title}>{title}</p>
      {children && <div className={styles.callout__body}>{children}</div>}
      {details && details.length > 0 && (
        <ul className={styles.callout__details}>
          {details.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
