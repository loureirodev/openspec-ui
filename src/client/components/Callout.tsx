import type { ReactNode } from "react";
import styles from "./Callout.module.css";

export type CalloutTone = "info" | "danger" | "success";

const TONE_CLASS: Record<CalloutTone, string> = {
  info: styles["callout--info"] ?? "",
  danger: styles["callout--danger"] ?? "",
  success: styles["callout--success"] ?? "",
};

/** A small tone-coloured glyph, drawn from `currentColor` so it always matches the title. */
function ToneIcon({ tone }: { tone: CalloutTone }) {
  switch (tone) {
    case "danger":
      return (
        <svg width={14} height={14} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <circle cx={8} cy={8} r={6} fill="none" stroke="currentColor" strokeWidth={1.5} />
          <path
            d="M5.5 5.5 L10.5 10.5 M10.5 5.5 L5.5 10.5"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        </svg>
      );
    case "success":
      return (
        <svg width={14} height={14} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <circle cx={8} cy={8} r={6} fill="currentColor" />
          <path
            d="M5 8.2 L7 10.2 L11 5.8"
            fill="none"
            stroke="var(--bg)"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    default:
      return (
        <svg width={14} height={14} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <circle cx={8} cy={8} r={6} fill="none" stroke="currentColor" strokeWidth={1.5} />
          <line x1={8} y1={7} x2={8} y2={11.5} stroke="currentColor" strokeWidth={1.5} />
          <circle cx={8} cy={4.6} r={0.9} fill="currentColor" />
        </svg>
      );
  }
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
