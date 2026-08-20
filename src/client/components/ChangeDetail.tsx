import { useState } from "react";
import type { ResolvedArtifact, ResolvedChange } from "../api/changes.js";
import { humanizeName } from "../lib/format.js";
import { MarkdownViewer } from "./MarkdownViewer.js";
import { StatusBadge } from "./StatusBadge.js";

export interface ChangeDetailProps {
  change: ResolvedChange;
  /**
   * Frames the detail as history rather than as work in flight: badges use a closed tone,
   * no calls to action are shown, and spec-delta artifacts are dimmed and collapsed by
   * default. See design.md Decision 3 — this is the one component both routes render.
   */
  historical?: boolean;
}

/** Whether an artifact has something to show: files to render, or an error explaining why not. */
function isSelectable(artifact: ResolvedArtifact): boolean {
  return artifact.files.length > 0 || artifact.error !== undefined;
}

/**
 * The first artifact with something to show, so the initial tab is never an empty one. An
 * artifact that failed to read counts: its error is the content, and landing on it is better
 * than opening a change that appears to have nothing in it.
 */
function firstSelectableArtifact(artifacts: ResolvedArtifact[]): string | undefined {
  return artifacts.find(isSelectable)?.id;
}

/**
 * The badge for one artifact: its real `status` when the source supplied one, a closed-tone
 * "historical" badge for a spec-delta artifact the archived source flagged, or nothing —
 * never a fabricated status. See changes-browser's "Missing archived badges are absent" and
 * archived-browser's "Historical framing" requirements.
 */
function ArtifactBadge({
  artifact,
  historical,
}: {
  artifact: ResolvedArtifact;
  historical: boolean;
}) {
  if (artifact.status) return <StatusBadge status={artifact.status} historical={historical} />;
  if (artifact.historical) return <StatusBadge status="historical" historical />;
  return null;
}

/** The header card: each artifact's state, exact recomputed progress, and `nextSteps` when present. */
function HeaderCard({ change, historical }: { change: ResolvedChange; historical: boolean }) {
  return (
    <header className="change-detail__header">
      <h1 id="page-title">{humanizeName(change.name)}</h1>
      <p className="change-detail__name">
        <code>{change.name}</code>
        {change.schema.inferred && <span className="inferred-label"> (schema inferred)</span>}
      </p>

      <div className="change-detail__progress">
        {/* An indeterminate bar (no `value`) when the task artifact could not be read: its
            zeroes mean "unknown", and showing them as a count would assert something false. */}
        <progress
          className="change-detail__progress-bar"
          value={change.progressUnknown ? undefined : change.progress.completed}
          max={Math.max(change.progress.total, 1)}
        />
        <span className="change-detail__progress-count">
          {change.progressUnknown
            ? "tasks could not be counted"
            : `${change.progress.completed} / ${change.progress.total} tasks`}
        </span>
      </div>

      <ul className="change-detail__artifact-states">
        {change.artifacts.map((artifact) => (
          <li key={artifact.id}>
            <span className="change-detail__artifact-id">{artifact.id}</span>
            <ArtifactBadge artifact={artifact} historical={historical} />
            {artifact.status === "blocked" &&
              artifact.missingDeps &&
              artifact.missingDeps.length > 0 && (
                <span className="change-detail__missing-deps">
                  blocked by: {artifact.missingDeps.join(", ")}
                </span>
              )}
          </li>
        ))}
      </ul>

      {!historical && change.nextSteps && change.nextSteps.length > 0 && (
        <div className="change-detail__next-steps">
          <h2>Next steps</h2>
          <ul>
            {change.nextSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        </div>
      )}
    </header>
  );
}

/** One file's content, collapsed and dimmed by default when its artifact is `historical`. */
function ArtifactBody({ artifact }: { artifact: ResolvedArtifact }) {
  const [fileIndex, setFileIndex] = useState(0);
  const file = artifact.files[Math.min(fileIndex, artifact.files.length - 1)];

  // An artifact whose files could not be read reports why, in place of a body. This is the
  // contained per-artifact failure: its siblings rendered normally, and the change did not
  // fail as a whole. Distinct from an artifact with genuinely no files, whose tab is disabled.
  if (artifact.error) {
    return (
      <div className="change-detail__artifact-error" role="alert">
        <p className="change-detail__artifact-error-message">
          This artifact's files could not be read: {artifact.error.message}
        </p>
        {artifact.error.details && artifact.error.details.length > 0 && (
          <ul className="change-detail__artifact-error-details">
            {artifact.error.details.map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const body = (
    <div className="change-detail__file-body">
      {artifact.files.length > 1 && (
        <div className="change-detail__file-tabs" role="tablist" aria-label="Files">
          {artifact.files.map((candidate, index) => (
            <button
              key={candidate.path}
              type="button"
              role="tab"
              aria-selected={index === fileIndex}
              className={
                index === fileIndex
                  ? "change-detail__file-tab change-detail__file-tab--active"
                  : "change-detail__file-tab"
              }
              onClick={() => setFileIndex(index)}
              title={candidate.relPath}
            >
              <span className="change-detail__file-tab-label">{candidate.label}</span>
            </button>
          ))}
        </div>
      )}
      {file && (
        <div className="change-detail__file-panel" role="tabpanel">
          <MarkdownViewer markdown={file.markdown} />
        </div>
      )}
    </div>
  );

  if (!artifact.historical) return body;

  // Spec deltas in the archived framing: dimmed and collapsed by default, expandable on demand.
  return (
    <details className="change-detail__historical-body">
      <summary>Spec deltas from this change (not the current specs) — expand to read</summary>
      {body}
    </details>
  );
}

/**
 * A data-driven change detail: Level-1 horizontal tabs, one per artifact in the order the
 * adapter returned, each badged with its state; Level-2 vertical file tabs only inside
 * multi-file artifacts. Nothing here references an artifact id by name — see design.md
 * Decision 2 — so a custom schema renders with no additional code.
 */
export function ChangeDetail({ change, historical = false }: ChangeDetailProps) {
  // A lazy initializer: React only calls this once, on mount, so re-renders from a refetch
  // never reset the user's selected tab back to the first artifact.
  const [selectedId, setSelectedId] = useState(() => firstSelectableArtifact(change.artifacts));

  const selected = change.artifacts.find((artifact) => artifact.id === selectedId);

  return (
    <section className="change-detail" aria-labelledby="page-title">
      <HeaderCard change={change} historical={historical} />

      <div className="change-detail__tabs" role="tablist" aria-label="Artifacts">
        {change.artifacts.map((artifact) => {
          const disabled = !isSelectable(artifact);
          return (
            <button
              key={artifact.id}
              type="button"
              role="tab"
              aria-selected={artifact.id === selectedId}
              disabled={disabled}
              className={
                artifact.id === selectedId
                  ? "change-detail__tab change-detail__tab--active"
                  : disabled
                    ? "change-detail__tab change-detail__tab--disabled"
                    : "change-detail__tab"
              }
              onClick={() => setSelectedId(artifact.id)}
            >
              {artifact.id}
              <ArtifactBadge artifact={artifact} historical={historical} />
            </button>
          );
        })}
      </div>

      {selected ? (
        // Keyed by artifact id so switching Level-1 tabs starts a fresh file selection
        // instead of carrying over the previous artifact's Level-2 tab index.
        <ArtifactBody key={selected.id} artifact={selected} />
      ) : (
        <p className="change-detail__empty">This change has no artifacts to show.</p>
      )}
    </section>
  );
}
