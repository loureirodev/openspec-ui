import { useMemo, useState } from "react";
import type { ChangeListItem } from "../api/changes.js";
import { formatDate, humanizeName } from "../lib/format.js";
import { StatusBadge } from "./StatusBadge.js";

export interface ChangesListProps {
  changes: ChangeListItem[];
  onSelect: (name: string) => void;
}

type SortKey = "name" | "status" | "lastModified";

const SORT_LABELS: Record<SortKey, string> = {
  name: "Name",
  status: "Status",
  lastModified: "Last modified",
};

/** A change that failed to resolve, rendered inline while its siblings render normally. */
function FailedChangeCard({ item }: { item: ChangeListItem }) {
  return (
    <li className="changes-list__item changes-list__item--failed">
      <p className="changes-list__failed-title">Could not load “{item.name}”</p>
      <p className="changes-list__failed-message">{item.error?.message}</p>
    </li>
  );
}

/** One healthy change: name/title, progress bar, status badge, and last-modified time. */
function ChangeCard({
  item,
  onSelect,
}: {
  item: ChangeListItem;
  onSelect: (name: string) => void;
}) {
  return (
    <li className="changes-list__item">
      <button
        type="button"
        className="changes-list__item-button"
        onClick={() => onSelect(item.name)}
      >
        <div className="changes-list__row">
          {item.status && (
            <StatusBadge
              status={item.status}
              completed={item.completedTasks}
              total={item.totalTasks}
            />
          )}
          <code className="changes-list__name">{item.name}</code>
          <span className="changes-list__progress-count">
            {/* Not archived: the count comes from `list --json` verbatim, never recomputed here. */}
            {!item.archived && "~"}
            {item.completedTasks} / {item.totalTasks}
          </span>
          {item.lastModified && (
            <span className="changes-list__last-modified">{formatDate(item.lastModified)}</span>
          )}
        </div>

        {/* Demoted secondary line: the identity is the mono name above, not this duplicate. */}
        <span className="changes-list__title">{humanizeName(item.name)}</span>
        {item.schema?.inferred && <span className="inferred-label">schema inferred</span>}
      </button>
    </li>
  );
}

/**
 * The active changes list: sortable and filterable entirely on the client, with a
 * "could not load" card for any change that carries a structured error rather than
 * blocking its healthy siblings.
 */
export function ChangesList({ changes, onSelect }: ChangesListProps) {
  const [filter, setFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const filtered = needle
      ? changes.filter((item) => item.name.toLowerCase().includes(needle))
      : changes;

    return [...filtered].sort((a, b) => {
      if (sortKey === "status") return (a.status ?? "").localeCompare(b.status ?? "");
      if (sortKey === "lastModified") {
        // Most recently modified first — the conventional direction for a recency sort.
        return (b.lastModified ?? "").localeCompare(a.lastModified ?? "");
      }
      return a.name.localeCompare(b.name);
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

      {visible.length === 0 ? (
        <p className="changes-list__empty">No changes match this filter.</p>
      ) : (
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
