import type { ArchivedChangeSummary } from "../api/archived.js";
import { humanizeName } from "../lib/format.js";

export interface ArchivedListProps {
  changes: ArchivedChangeSummary[];
  onSelect: (name: string) => void;
}

/** The archived list: each change's name and archived date, framed as history. */
export function ArchivedList({ changes, onSelect }: ArchivedListProps) {
  if (changes.length === 0) {
    return <p className="archived-list__empty">No archived changes yet.</p>;
  }

  return (
    <ul className="archived-list__items">
      {changes.map((item) => (
        <li key={item.name} className="archived-list__item">
          <button
            type="button"
            className="archived-list__item-button"
            onClick={() => onSelect(item.name)}
          >
            <span className="archived-list__title">{humanizeName(item.name)}</span>
            <code className="archived-list__name">{item.name}</code>
            {item.archivedDate && (
              <span className="archived-list__date">Archived {item.archivedDate}</span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
