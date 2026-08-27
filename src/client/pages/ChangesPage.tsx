import { useState } from "react";
import { useChange, useChanges } from "../api/changes.js";
import { Callout } from "../components/Callout.js";
import { ChangeDetail } from "../components/ChangeDetail.js";
import { ChangesList } from "../components/ChangesList.js";

/**
 * The detail view for one selected active change, with a way back to the list.
 *
 * `resolveChange` carries no change-level status or last-modified time — those live only on
 * the list entry `list --json` reports. `summaryStatus`/`summaryLastModified` are threaded
 * through from the already-fetched list (see `ChangesPage`) so the header can show them
 * without a second request; both are best-effort and simply omitted if the change is not in
 * that cached list.
 */
function ChangeDetailView({
  name,
  onBack,
  summaryStatus,
  summaryLastModified,
}: {
  name: string;
  onBack: () => void;
  summaryStatus?: string;
  summaryLastModified?: string;
}) {
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
      <button type="button" className="change-detail__back-link" onClick={onBack}>
        ← Changes
      </button>
      <ChangeDetail change={data} status={summaryStatus} lastModified={summaryLastModified} />
    </>
  );
}

export function ChangesPage() {
  const { data, error, isPending } = useChanges();
  const [selected, setSelected] = useState<string | null>(null);

  if (selected) {
    const summary = data?.changes.find((item) => item.name === selected);
    return (
      <ChangeDetailView
        name={selected}
        onBack={() => setSelected(null)}
        summaryStatus={summary?.status}
        summaryLastModified={summary?.lastModified}
      />
    );
  }

  return (
    <section aria-labelledby="page-title" className="view-width--text">
      <h1 id="page-title">Changes</h1>

      {isPending && <ChangesList changes={[]} onSelect={setSelected} loading />}

      {!isPending && (error || !data) && (
        <p className="changes-list__error">The changes list could not be loaded.</p>
      )}

      {!isPending && data && (
        <>
          {data.error && (
            <Callout tone="danger" title="The active changes list could not be fully loaded">
              {data.error.message}
            </Callout>
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
