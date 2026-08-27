import { useId, useState } from "react";
import type { ResolvedArtifact, ResolvedChange } from "../api/changes.js";
import { formatRelativeDate, humanizeLabel, humanizeName } from "../lib/format.js";
import { Callout } from "./Callout.js";
import { MarkdownViewer } from "./MarkdownViewer.js";
import { Meter } from "./Meter.js";
import { StatusBadge } from "./StatusBadge.js";
import { StatusIcon } from "./StatusIcon.js";
import { Tooltip, TooltipMeta, TooltipName } from "./Tooltip.js";

export interface ChangeDetailProps {
  change: ResolvedChange;
  /**
   * Frames the detail as history rather than as work in flight: badges use a closed tone,
   * no calls to action are shown, and spec-delta artifacts are dimmed and collapsed by
   * default. See design.md Decision 3 — this is the one component both routes render.
   */
  historical?: boolean;
  /**
   * The change's `list --json` status, best-effort from the already-fetched list — `resolveChange`
   * itself carries no change-level status, only per-artifact ones. Absent when the change was not
   * found in that list (e.g. it resolved after the list was fetched), in which case the header's
   * status badge is simply omitted rather than fabricated.
   */
  status?: string;
  /** The change's last-modified time, sourced the same way as `status` and for the same reason. */
  lastModified?: string;
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

function tabDetail(artifact: ResolvedArtifact, historical: boolean): string {
  if (artifact.error) return "could not be read";
  if (historical) return "historical";
  if (!artifact.status) return "no status reported";
  if (artifact.status === "blocked" && artifact.missingDeps && artifact.missingDeps.length > 0) {
    return `${artifact.status} — blocked by: ${artifact.missingDeps.join(", ")}`;
  }
  return artifact.status;
}

function tabIconStatus(artifact: ResolvedArtifact, historical: boolean): string {
  if (artifact.error) return "error";
  if (historical) return "archived";
  return artifact.status ?? "no-tasks";
}

function HeaderCard({
  change,
  historical,
  status,
  lastModified,
}: {
  change: ResolvedChange;
  historical: boolean;
  status?: string;
  lastModified?: string;
}) {
  const relative = lastModified ? formatRelativeDate(lastModified) : undefined;

  return (
    <header className="change-detail__header">
      <p className="change-detail__name">
        <code>{change.name}</code>
        {change.schema.inferred && <span className="inferred-label"> (schema inferred)</span>}
      </p>
      <h1 id="page-title">{humanizeName(change.name)}</h1>

      <div className="change-detail__meta">
        {!historical && status && <StatusBadge status={status} />}

        <Meter
          className="change-detail__meter"
          completed={change.progress.completed}
          total={change.progress.total}
          unknown={change.progressUnknown}
          label={
            change.progressUnknown
              ? "tasks could not be counted"
              : `${change.progress.completed} of ${change.progress.total} tasks complete`
          }
        />
        <span className="change-detail__progress-count">
          {change.progressUnknown
            ? "tasks could not be counted"
            : `${change.progress.completed} / ${change.progress.total} tasks`}
        </span>

        {!historical && relative && (
          <Tooltip content={relative.exact}>
            <span className="change-detail__last-modified">{relative.display}</span>
          </Tooltip>
        )}
      </div>

      {!historical && change.nextSteps && change.nextSteps.length > 0 && (
        <Callout tone="info" title="Next steps">
          <ul className="change-detail__next-steps-list">
            {change.nextSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        </Callout>
      )}
    </header>
  );
}

/** One file's content, collapsed and dimmed by default when its artifact is `historical`. */
function ArtifactBody({ artifact }: { artifact: ResolvedArtifact }) {
  const [fileIndex, setFileIndex] = useState(0);
  const file = artifact.files[Math.min(fileIndex, artifact.files.length - 1)];
  // Each `role="tab"` sits inside a Tooltip `<span>`, so it is not a DOM child of its
  // `role="tablist"`. `aria-owns` re-establishes that ownership in the accessibility tree,
  // restoring the "n of m" position info a screen reader announces for a tab.
  const tabId = useId();
  const fileTabId = (index: number) => `${tabId}-${index}`;

  // An artifact whose files could not be read reports why, in place of a body. This is the
  // contained per-artifact failure: its siblings rendered normally, and the change did not
  // fail as a whole. Distinct from an artifact with genuinely no files, whose tab is disabled.
  if (artifact.error) {
    return (
      <Callout
        tone="danger"
        title={`This artifact's files could not be read: ${artifact.error.message}`}
        details={artifact.error.details}
      />
    );
  }

  const body = (
    <div className="change-detail__file-body">
      {(artifact.collection || artifact.files.length > 1) && (
        <nav className="side-nav change-detail__file-rail">
          <div
            className="side-nav__items"
            role="tablist"
            aria-label="Files"
            aria-owns={artifact.files.map((_, index) => fileTabId(index)).join(" ")}
          >
            {artifact.files.map((candidate, index) => {
              const isActive = index === fileIndex;
              return (
                <Tooltip
                  key={candidate.path}
                  className="list-row__tooltip-wrapper"
                  start
                  content={<TooltipMeta>{candidate.relPath}</TooltipMeta>}
                >
                  <button
                    type="button"
                    role="tab"
                    id={fileTabId(index)}
                    aria-selected={isActive}
                    aria-label={`${humanizeLabel(candidate.label)} — ${candidate.relPath}`}
                    className={
                      isActive
                        ? "side-nav__item-button side-nav__item-button--active"
                        : "side-nav__item-button"
                    }
                    onClick={() => setFileIndex(index)}
                  >
                    <span className="side-nav__item-label">{humanizeLabel(candidate.label)}</span>
                  </button>
                </Tooltip>
              );
            })}
          </div>
        </nav>
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
 * adapter returned, each showing its status icon before its name; Level-2 vertical file tabs
 * only inside multi-file artifacts.
 */
export function ChangeDetail({
  change,
  historical = false,
  status,
  lastModified,
}: ChangeDetailProps) {
  // A lazy initializer: React only calls this once, on mount, so re-renders from a refetch
  // never reset the user's selected tab back to the first artifact.
  const [selectedId, setSelectedId] = useState(() => firstSelectableArtifact(change.artifacts));

  const selected = change.artifacts.find((artifact) => artifact.id === selectedId);

  const tabId = useId();
  const artifactTabId = (id: string) => `${tabId}-${id}`;

  return (
    <section className="change-detail" aria-labelledby="page-title">
      <HeaderCard
        change={change}
        historical={historical}
        status={status}
        lastModified={lastModified}
      />

      <div
        className="change-detail__tabs"
        role="tablist"
        aria-label="Artifacts"
        aria-owns={change.artifacts.map((artifact) => artifactTabId(artifact.id)).join(" ")}
      >
        {change.artifacts.map((artifact) => {
          const disabled = !isSelectable(artifact);
          const detail = tabDetail(artifact, historical);
          const iconStatus = tabIconStatus(artifact, historical);

          return (
            <Tooltip
              key={artifact.id}
              content={
                <>
                  <TooltipName>{humanizeLabel(artifact.id)}</TooltipName>
                  <TooltipMeta>{detail}</TooltipMeta>
                </>
              }
            >
              <button
                type="button"
                role="tab"
                id={artifactTabId(artifact.id)}
                aria-selected={artifact.id === selectedId}
                aria-label={`${artifact.id} — ${detail}`}
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
                <StatusIcon status={iconStatus} decorative />
                <span className="change-detail__tab-label" data-label={artifact.id}>
                  {artifact.id}
                </span>
              </button>
            </Tooltip>
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
