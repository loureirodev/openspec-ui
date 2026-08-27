/** Presentation-only helpers shared by the changes and archived browsers. */

/** Acronyms known well enough to keep them fully capitalized when humanizing a name or label. */
const KNOWN_ACRONYMS = new Set(["MCP", "API", "UI", "CLI", "AI", "CI"]);

/** Capitalizes one word, restoring a known acronym's casing rather than title-casing it. */
function capitalizeWord(word: string): string {
  const upper = word.toUpperCase();
  if (KNOWN_ACRONYMS.has(upper)) return upper;
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * Turns a kebab-case (or path-separated) identifier into a readable title, e.g.
 * `add-mcp-capability` -> `Add MCP Capability`. Splits on `-`, `_`, `/` and whitespace, so a
 * file label carrying a path separator humanizes the same way a kebab-case name does.
 */
function humanize(value: string): string {
  return value
    .split(/[-_/\s]+/)
    .filter(Boolean)
    .map(capitalizeWord)
    .join(" ");
}

/** Turns a kebab-case change name into a readable title, e.g. `add-foo-bar` -> `Add Foo Bar`. */
export function humanizeName(name: string): string {
  return humanize(name);
}

export function basename(path: string): string {
  const segments = path.split(/[/\\]+/).filter(Boolean);
  return segments.at(-1) ?? path;
}

/**
 * Turns a server-derived file label (a basename, or an escalated `dir/basename` segment) into
 * a readable form, the same way `humanizeName` reads a change name.
 */
export function humanizeLabel(label: string): string {
  return humanize(label);
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const RELATIVE_CUTOFF = 7 * DAY;

/** A relative-or-absolute rendering of a timestamp, plus the exact value for a tooltip. */
export interface RelativeDate {
  /** Relative within seven days ("3 hours ago"), absolute beyond ("Jul 1, 2026"). */
  display: string;
  /** The exact timestamp, always available as supplementary detail. */
  exact: string;
}

const RELATIVE_FORMATTER = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/**
 * Picks the largest whole unit that fits the elapsed time, for a natural-reading relative
 * string. Rounding a value that sits just under a bucket's boundary can round *up into* the
 * next bucket (59.6 minutes rounds to 60, not 59) — each tier below the last re-checks its
 * rounded magnitude against that bucket's own limit and falls through to the coarser unit
 * when it rolls over, so the result never reads "60 minutes ago" or "24 hours ago".
 */
function relativeUnits(elapsedMs: number): { value: number; unit: Intl.RelativeTimeFormatUnit } {
  const abs = Math.abs(elapsedMs);

  if (abs < MINUTE) {
    const value = Math.round(elapsedMs / SECOND);
    if (Math.abs(value) < 60) return { value, unit: "second" };
  }
  if (abs < HOUR) {
    const value = Math.round(elapsedMs / MINUTE);
    if (Math.abs(value) < 60) return { value, unit: "minute" };
  }
  if (abs < DAY) {
    const value = Math.round(elapsedMs / HOUR);
    if (Math.abs(value) < 24) return { value, unit: "hour" };
  }
  return { value: Math.round(elapsedMs / DAY), unit: "day" };
}

/**
 * Formats an ISO date/time as relative within seven days ("3 hours ago") and absolute beyond
 * that ("Jul 1, 2026"), with the exact timestamp always returned for a tooltip. An unparseable
 * value falls back to displaying the raw string, with the same raw string as its "exact" form.
 */
export function formatRelativeDate(value: string, now: Date = new Date()): RelativeDate {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { display: value, exact: value };

  const exact = date.toLocaleString();
  const elapsedMs = date.getTime() - now.getTime();

  if (Math.abs(elapsedMs) > RELATIVE_CUTOFF) {
    return { display: date.toLocaleDateString(), exact };
  }

  const { value: unitValue, unit } = relativeUnits(elapsedMs);
  return { display: RELATIVE_FORMATTER.format(unitValue, unit), exact };
}
