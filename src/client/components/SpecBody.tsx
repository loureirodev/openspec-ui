import type { ResolvedSpec } from "../api/specs.js";
import { MarkdownViewer } from "./MarkdownViewer.js";

export interface SpecBodyProps {
  spec: ResolvedSpec;
}

/**
 * The body pane for a selected spec: the raw `spec.md` markdown rendered through
 * `MarkdownViewer` with requirement anchors enabled, and — when the structured index could not
 * be resolved — the validation messages surfaced alongside it rather than a broken page.
 */
export function SpecBody({ spec }: SpecBodyProps) {
  return (
    <div className="spec-detail">
      {spec.error && (
        <div className="spec-detail__error" role="alert">
          <p className="spec-detail__error-message">
            This spec's structured index could not be read: {spec.error.message}
          </p>
          {spec.error.details && spec.error.details.length > 0 && (
            <ul className="spec-detail__error-details">
              {spec.error.details.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <MarkdownViewer markdown={spec.markdown} requirementAnchors />
    </div>
  );
}
