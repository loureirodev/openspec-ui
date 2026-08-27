import { useEffect, useState } from "react";
import type { HealthResponse } from "../../shared/health.js";
import { basename } from "../lib/format.js";
import { Tooltip, TooltipMeta } from "./Tooltip.js";

/**
 * Names the project the dashboard was launched against, in the top bar. Shown only when the
 * environment is healthy — a broken environment has no resolved project, and the diagnostics
 * screen carries the failure instead.
 */
export function ProjectName({ health }: { health: HealthResponse | undefined }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  if (health?.status !== "ok" || !health.projectRoot) return null;

  const { projectRoot } = health;

  const copy = () => {
    void navigator.clipboard?.writeText(projectRoot).then(
      () => setCopied(true),
      () => {},
    );
  };

  return (
    <Tooltip end content={<TooltipMeta>{copied ? "Copied" : projectRoot}</TooltipMeta>}>
      <button
        type="button"
        className="project-name"
        aria-label={`Project ${projectRoot} — copy path`}
        onClick={copy}
      >
        {basename(projectRoot)}
      </button>
    </Tooltip>
  );
}
