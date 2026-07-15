import { useMemo, useState } from "react";
import type { SpecSummary } from "../api/specs.js";
import { useSpec, useSpecs } from "../api/specs.js";
import { SpecBody } from "../components/SpecBody.js";
import { SpecsSidebar } from "../components/SpecsSidebar.js";
import { extractRequirementAnchors } from "../markdown/requirement-anchors.js";

/**
 * The sidebar plus body pane for a selected capability. Fetches the selected spec's detail
 * once here, so the sidebar's per-requirement anchors and the body pane's rendered headings
 * come from the same response and can never disagree.
 */
function SpecsBrowser({
  specs,
  selectedId,
  onSelect,
}: {
  specs: SpecSummary[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const { data, error, isPending } = useSpec(selectedId);
  // Anchors (id + title) come from the raw markdown, not the JSON index: `requirements[].text`
  // is each requirement's body statement, not its short title — see requirement-anchors.ts.
  // This also means the sidebar can expand a malformed spec, whose index is absent but whose
  // markdown still reads fine. Memoized so a re-render that doesn't change the fetched spec
  // doesn't re-scan the markdown.
  const selectedRequirements = useMemo(
    () => (data ? extractRequirementAnchors(data.markdown) : undefined),
    [data],
  );

  return (
    <div className="specs-browser">
      <SpecsSidebar
        specs={specs}
        selectedId={selectedId}
        onSelect={onSelect}
        selectedRequirements={selectedRequirements}
      />
      <div className="specs-browser__body">
        {isPending && (
          <p className="loading" role="status">
            Loading “{selectedId}”…
          </p>
        )}
        {!isPending && (error || !data) && (
          <p className="spec-detail__error">Could not load “{selectedId}”.</p>
        )}
        {!isPending && data && <SpecBody spec={data} />}
      </div>
    </div>
  );
}

/**
 * The specs browser: a documentation-style layout favouring scanning, navigation and linking
 * over dashboard-style controls. A capabilities sidebar sits beside a body pane that renders
 * the selected spec — see design.md's Decisions 2, 4 and 6.
 */
export function SpecsPage() {
  const { data, error, isPending } = useSpecs();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <section aria-labelledby="page-title" className="specs-page">
      <h1 id="page-title">Specs</h1>

      {isPending && (
        <p className="loading" role="status">
          Loading specs…
        </p>
      )}

      {!isPending && (error || !data) && (
        <p className="specs-sidebar__error">The specs list could not be loaded.</p>
      )}

      {!isPending && data && data.length === 0 && (
        <p className="specs-page__empty">No specs yet.</p>
      )}

      {!isPending && data && data.length > 0 && selectedId && (
        <SpecsBrowser specs={data} selectedId={selectedId} onSelect={setSelectedId} />
      )}

      {!isPending && data && data.length > 0 && !selectedId && (
        <div className="specs-browser">
          <SpecsSidebar specs={data} selectedId={null} onSelect={setSelectedId} />
          <div className="specs-browser__body">
            <p className="specs-browser__placeholder">Select a capability to view its spec.</p>
          </div>
        </div>
      )}
    </section>
  );
}
