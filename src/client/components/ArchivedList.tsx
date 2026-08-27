import { useMemo } from "react";
import type { ArchivedChangeSummary } from "../api/archived.js";
import { humanizeName } from "../lib/format.js";
import { StatusIcon } from "./StatusIcon.js";
import { Tooltip, TooltipMeta } from "./Tooltip.js";

export interface ArchivedListProps {
  changes: ArchivedChangeSummary[];
  onSelect: (name: string) => void;
}

export function ArchivedList({ changes, onSelect }: ArchivedListProps) {
  const sorted = useMemo(
    () => [...changes].sort((a, b) => (b.archivedDate ?? "").localeCompare(a.archivedDate ?? "")),
    [changes],
  );

  if (changes.length === 0) {
    return <p className="archived-list__empty">No archived changes yet.</p>;
  }

  return (
    <ul className="archived-list__items">
      {sorted.map((item) => {
        const title = humanizeName(item.name);
        const accessibleNameParts = [
          title,
          `(${item.name})`,
          item.path,
          item.archivedDate ? `archived ${item.archivedDate}` : undefined,
        ].filter(Boolean);

        return (
          <li key={item.name} className="archived-list__item">
            <Tooltip
              className="list-row__tooltip-wrapper"
              start
              content={<TooltipMeta>{item.path ?? item.name}</TooltipMeta>}
            >
              <button
                type="button"
                className="archived-list__item-button"
                onClick={() => onSelect(item.name)}
                aria-label={accessibleNameParts.join(" — ")}
              >
                <div className="archived-list__row">
                  <StatusIcon status="archived" decorative />
                  <span className="archived-list__title">{title}</span>
                  <span aria-hidden="true" />
                  <span aria-hidden="true" />
                  {item.archivedDate && (
                    <Tooltip content={`Archived ${item.archivedDate}`}>
                      <span className="archived-list__date changes-list__last-modified">
                        {item.archivedDate}
                      </span>
                    </Tooltip>
                  )}
                </div>
              </button>
            </Tooltip>
          </li>
        );
      })}
    </ul>
  );
}
