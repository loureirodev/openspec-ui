import type { HealthCheck, HealthResponse } from "../../shared/health.js";
import { MINIMUM_OPENSPEC_VERSION } from "../../shared/version.js";

const TITLES: Record<HealthCheck, string> = {
  binary: "The `openspec` binary was not found on PATH",
  version: "The `openspec` binary is older than this dashboard supports",
  project: "The current working directory is not an OpenSpec project",
};

export interface DiagnosticsProps {
  /** The failing health response, absent when the server itself was unreachable. */
  health?: HealthResponse;
  /** The error from a health request that never succeeded. */
  error?: Error | null;
}

/** Names the one check that failed, what it means, and how to fix it. */
export function Diagnostics({ health, error }: DiagnosticsProps) {
  if (!health) {
    return (
      <section className="diagnostics" aria-labelledby="diagnostics-title">
        <h1 id="diagnostics-title">The dashboard server could not be reached</h1>
        <p className="diagnostics__message">
          {error?.message ?? "The health check did not complete."}
        </p>
        <p className="diagnostics__remedy">
          Check that the dashboard process is still running, then refresh.
        </p>
      </section>
    );
  }

  const check = health.check;

  return (
    <section className="diagnostics" aria-labelledby="diagnostics-title">
      <h1 id="diagnostics-title">{check ? TITLES[check] : "The environment check failed"}</h1>

      {health.message && <p className="diagnostics__message">{health.message}</p>}
      {health.remedy && <p className="diagnostics__remedy">{health.remedy}</p>}

      <dl className="diagnostics__details">
        {check === "version" && (
          <>
            <dt>Detected version</dt>
            <dd>{health.version ?? "not reported"}</dd>
            <dt>Minimum supported version</dt>
            <dd>{MINIMUM_OPENSPEC_VERSION}</dd>
          </>
        )}
        {check !== "version" && health.version && (
          <>
            <dt>Detected version</dt>
            <dd>{health.version}</dd>
          </>
        )}
        {health.resolvedBinaryPath && (
          <>
            <dt>Resolved from</dt>
            <dd>
              <code>{health.resolvedBinaryPath}</code>
            </dd>
          </>
        )}
      </dl>
    </section>
  );
}
