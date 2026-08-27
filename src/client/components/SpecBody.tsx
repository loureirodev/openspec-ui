import type { ResolvedSpec } from "../api/specs.js";
import { Callout } from "./Callout.js";
import { MarkdownViewer } from "./MarkdownViewer.js";

export interface SpecBodyProps {
  spec: ResolvedSpec;
}

/**
 * The body pane for a selected spec: the raw `spec.md` markdown rendered through
 * `MarkdownViewer` with requirement anchors enabled, and — when the structured index could not
 * be resolved — the validation messages surfaced alongside it as a danger-toned callout,
 * rather than a broken page.
 */
export function SpecBody({ spec }: SpecBodyProps) {
  return (
    <div className="spec-detail">
      {spec.error && (
        <Callout
          tone="danger"
          title={`This spec's structured index could not be read: ${spec.error.message}`}
          details={spec.error.details}
        />
      )}
      <MarkdownViewer markdown={spec.markdown} requirementAnchors />
    </div>
  );
}
