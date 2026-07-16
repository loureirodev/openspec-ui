import { useState } from "react";
import { useChange, useChanges } from "../api/changes.js";
import { ChangeDetail } from "../components/ChangeDetail.js";
import { ChangesList } from "../components/ChangesList.js";

/** The detail view for one selected active change, with a way back to the list. */
function ChangeDetailView({ name, onBack }: { name: string; onBack: () => void }) {
  const { data, error, isPending } = useChange(name);

  if (isPending) {
    return (
      <p className="loading" role="status">
        Loading “{name}”…
      </p>
    );
  }

  if (error || !data) {
    return (
      <section aria-labelledby="page-title">
        <h1 id="page-title">Could not load “{name}”</h1>
        <p>{error?.message}</p>
        <button type="button" className="form-button" onClick={onBack}>
          Back to changes
        </button>
      </section>
    );
  }

  return (
    <>
      <button type="button" className="form-button change-detail__back" onClick={onBack}>
        Back to changes
      </button>
      <ChangeDetail change={data} />
    </>
  );
}

export function ChangesPage() {
  const { data, error, isPending } = useChanges();
  const [selected, setSelected] = useState<string | null>(null);

  if (selected) {
    return <ChangeDetailView name={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <section aria-labelledby="page-title" className="view-width--text">
      <h1 id="page-title">Changes</h1>

      {isPending && (
        <p className="loading" role="status">
          Loading changes…
        </p>
      )}

      {!isPending && (error || !data) && (
        <p className="changes-list__error">The changes list could not be loaded.</p>
      )}

      {!isPending && data && (
        <>
          {data.error && (
            <p className="changes-list__partial-error">
              The active changes list could not be fully loaded: {data.error.message}
            </p>
          )}
          <ChangesList
            changes={data.changes.filter((item) => !item.archived)}
            onSelect={setSelected}
          />
        </>
      )}
    </section>
  );
}
