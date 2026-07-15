import type { SpecSummary } from "../api/specs.js";
import { humanizeName } from "../lib/format.js";
import type { RequirementAnchor } from "../markdown/requirement-anchors.js";

export interface SpecsSidebarProps {
  specs: SpecSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /**
   * The selected capability's requirement anchors — each one's rendered heading id and short
   * title, both read from the raw markdown by {@link extractRequirementAnchors} (not the JSON
   * index's `requirements[].text`, which is each requirement's body statement — see
   * requirement-anchors.ts). Undefined while the detail is still loading, so the expansion
   * appears only once the anchors it links to actually exist in the rendered body.
   */
  selectedRequirements?: RequirementAnchor[];
}

/**
 * The specs browser's sidebar: every capability with its requirement count, and the selected
 * capability expanded into per-requirement anchor links. Every link's `id` comes from the same
 * {@link extractRequirementAnchors} extraction the `MarkdownViewer`'s heading-id step mirrors,
 * so a link here can never point at an id the rendered body did not emit — see design.md
 * Decision 4.
 */
export function SpecsSidebar({
  specs,
  selectedId,
  onSelect,
  selectedRequirements,
}: SpecsSidebarProps) {
  return (
    <nav className="specs-sidebar" aria-label="Capabilities">
      <ul className="specs-sidebar__items">
        {specs.map((spec) => {
          const isSelected = spec.id === selectedId;
          return (
            <li key={spec.id} className="specs-sidebar__item">
              <button
                type="button"
                className={
                  isSelected
                    ? "specs-sidebar__item-button specs-sidebar__item-button--active"
                    : "specs-sidebar__item-button"
                }
                aria-current={isSelected ? "true" : undefined}
                onClick={() => onSelect(spec.id)}
              >
                <span className="specs-sidebar__title">{humanizeName(spec.id)}</span>
                <span className="specs-sidebar__count">{spec.requirementCount}</span>
              </button>

              {isSelected && selectedRequirements && selectedRequirements.length > 0 && (
                <ul className="specs-sidebar__requirements">
                  {selectedRequirements.map(({ id, title }) => (
                    <li key={id}>
                      <a href={`#${id}`} className="specs-sidebar__requirement-link">
                        {title}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
