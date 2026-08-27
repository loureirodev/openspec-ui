import { useMemo, useState } from "react";
import type { ChangeListItem } from "../api/changes.js";
import { formatRelativeDate, humanizeName } from "../lib/format.js";
import { Callout } from "./Callout.js";
import { Meter } from "./Meter.js";
import { StatusBadge } from "./StatusBadge.js";
import { Tooltip, TooltipMeta } from "./Tooltip.js";

export interface ChangesListProps {
  changes: ChangeListItem[];
  onSelect: (name: string) => void;
  loading?: boolean;
}

type SortKey = "name" | "status" | "lastModified";

const SORT_LABELS: Record<SortKey, string> = {
  name: "Name",
  status: "Status",
  lastModified: "Last modified",
};

const APPROXIMATE_HEDGE =
  "Approximate — reported by the OpenSpec CLI; the change detail recomputes it.";

/** A change that failed to resolve, rendered as a danger-toned callout inline with its siblings. */
function FailedChangeCard({ item }: { item: ChangeListItem }) {
  return (
    <li className="changes-list__item">
      <Callout tone="danger" title={`Could not load “${item.name}”`}>
        {item.error?.message}
      </Callout>
    </li>
  );
}

function ChangeCard({
  item,
  onSelect,
}: {
  item: ChangeListItem;
  onSelect: (name: string) => void;
}) {
  const title = humanizeName(item.name);
  const relative = item.lastModified ? formatRelativeDate(item.lastModified) : undefined;
  const countText = `${item.completedTasks} / ${item.totalTasks}`;
  // Not archived: the count comes from `list --json` verbatim, never recomputed here.
  const approximate = !item.archived;

  const accessibleNameParts = [
    title,
    `(${item.name})`,
    item.path,
    item.status,
    `${countText} tasks${approximate ? ", approximate" : ""}`,
    relative ? `last modified ${relative.exact}` : undefined,
  ].filter(Boolean);

  return (
    <li className="changes-list__item">
      <Tooltip
        className="list-row__tooltip-wrapper"
        start
        content={<TooltipMeta>{item.path ?? item.name}</TooltipMeta>}
      >
        <button
          type="button"
          className="changes-list__item-button"
          onClick={() => onSelect(item.name)}
          aria-label={accessibleNameParts.join(" — ")}
        >
          <div className="changes-list__row">
            {item.status ? (
              <StatusBadge status={item.status} />
            ) : (
              <span className="changes-list__status-slot" aria-hidden="true" />
            )}
            <span className="changes-list__title">{title}</span>
            <Meter
              className="changes-list__meter"
              completed={item.completedTasks}
              total={item.totalTasks}
            />
            <Tooltip content={approximate ? APPROXIMATE_HEDGE : "Recomputed by the change detail."}>
              <span className="changes-list__progress-count">{countText}</span>
            </Tooltip>
            {relative && (
              <Tooltip content={relative.exact}>
                <span className="changes-list__last-modified">{relative.display}</span>
              </Tooltip>
            )}
          </div>
          {item.schema?.inferred && <span className="inferred-label">schema inferred</span>}
        </button>
      </Tooltip>
    </li>
  );
}

function LoadingPlaceholder() {
  return (
    <>
      <p className="visually-hidden" role="status">
        Loading changes…
      </p>
      <ul className="changes-list__items" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((index) => (
          <li key={index} className="changes-list__item">
            <div className="changes-list__item-button changes-list__item-button--placeholder">
              <div className="changes-list__row changes-list__row--placeholder">
                <span className="changes-list__placeholder-block changes-list__placeholder-block--icon" />
                <span className="changes-list__placeholder-block changes-list__placeholder-block--title" />
                <span className="changes-list__placeholder-block changes-list__placeholder-block--meter" />
                <span className="changes-list__placeholder-block changes-list__placeholder-block--count" />
                <span className="changes-list__placeholder-block changes-list__placeholder-block--time" />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

export function ChangesList({ changes, onSelect, loading = false }: ChangesListProps) {
  const [filter, setFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("lastModified");

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const filtered = needle
      ? changes.filter((item) => item.name.toLowerCase().includes(needle))
      : changes;

    return [...filtered].sort((a, b) => {
      if (sortKey === "status") return (a.status ?? "").localeCompare(b.status ?? "");
      if (sortKey === "name") return a.name.localeCompare(b.name);
      // Most recently modified first — the conventional direction for a recency sort.
      return (b.lastModified ?? "").localeCompare(a.lastModified ?? "");
    });
  }, [changes, filter, sortKey]);

  return (
    <div className="changes-list">
      <div className="changes-list__controls">
        <label className="changes-list__control">
          <span className="changes-list__control-label">Filter</span>
          <input
            type="search"
            className="form-input"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter by name…"
          />
        </label>
        <label className="changes-list__control">
          <span className="changes-list__control-label">Sort by</span>
          <select
            className="form-select"
            value={sortKey}
            onChange={(event) => setSortKey(event.target.value as SortKey)}
          >
            {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
              <option key={key} value={key}>
                {SORT_LABELS[key]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading && <LoadingPlaceholder />}

      {!loading && changes.length === 0 && (
        <p className="changes-list__empty">
          No active changes yet. Run <code>openspec propose</code> to start one.
        </p>
      )}

      {!loading && changes.length > 0 && visible.length === 0 && (
        <p className="changes-list__empty">No changes match this filter.</p>
      )}

      {!loading && visible.length > 0 && (
        <ul className="changes-list__items">
          {visible.map((item) =>
            item.error ? (
              <FailedChangeCard key={item.name} item={item} />
            ) : (
              <ChangeCard key={item.name} item={item} onSelect={onSelect} />
            ),
          )}
        </ul>
      )}
    </div>
  );
}
