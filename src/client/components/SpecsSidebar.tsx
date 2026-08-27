import type { SpecSummary } from "../api/specs.js";
import { humanizeName } from "../lib/format.js";
import type { RequirementAnchor } from "../markdown/requirement-anchors.js";
import { Tooltip } from "./Tooltip.js";

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
    <nav className="side-nav specs-sidebar" aria-label="Capabilities">
      <ul className="side-nav__items">
        {specs.map((spec) => {
          const isSelected = spec.id === selectedId;
          return (
            <li key={spec.id} className="specs-sidebar__item">
              <Tooltip className="list-row__tooltip-wrapper" content={spec.id}>
                <button
                  type="button"
                  className={
                    isSelected
                      ? "side-nav__item-button side-nav__item-button--active"
                      : "side-nav__item-button"
                  }
                  aria-current={isSelected ? "true" : undefined}
                  aria-label={`${humanizeName(spec.id)} — ${spec.id}`}
                  onClick={() => onSelect(spec.id)}
                >
                  <span className="side-nav__item-label">{humanizeName(spec.id)}</span>
                  <span className="side-nav__item-counter">{spec.requirementCount}</span>
                </button>
              </Tooltip>

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
