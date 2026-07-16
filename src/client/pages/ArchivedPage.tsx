import { useState } from "react";
import { useArchived, useArchivedChange } from "../api/archived.js";
import { ArchivedList } from "../components/ArchivedList.js";
import { ChangeDetail } from "../components/ChangeDetail.js";

/** The historical detail view for one selected archived change, with a way back to the list. */
function ArchivedDetailView({ id, onBack }: { id: string; onBack: () => void }) {
  const { data, error, isPending } = useArchivedChange(id);

  if (isPending) {
    return (
      <p className="loading" role="status">
        Loading “{id}”…
      </p>
    );
  }

  if (error || !data) {
    return (
      <section aria-labelledby="page-title">
        <h1 id="page-title">Could not load “{id}”</h1>
        <p>{error?.message}</p>
        <button type="button" className="form-button" onClick={onBack}>
          Back to archived
        </button>
      </section>
    );
  }

  return (
    <>
      <button type="button" className="form-button change-detail__back" onClick={onBack}>
        Back to archived
      </button>
      <ChangeDetail change={data} historical />
    </>
  );
}

export function ArchivedPage() {
  const { data, error, isPending } = useArchived();
  const [selected, setSelected] = useState<string | null>(null);

  if (selected) {
    return <ArchivedDetailView id={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <section aria-labelledby="page-title" className="view-width--text">
      <h1 id="page-title">Archived</h1>

      {isPending && (
        <p className="loading" role="status">
          Loading archived changes…
        </p>
      )}

      {!isPending && (error || !data) && (
        <p className="archived-list__error">The archived list could not be loaded.</p>
      )}

      {!isPending && data && <ArchivedList changes={data} onSelect={setSelected} />}
    </section>
  );
}
