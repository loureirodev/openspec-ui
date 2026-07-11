/**
 * Task-progress counting. Pure functions over file contents: they never read disk or the
 * binary, so a change detail can recompute exact progress from its task files independently
 * of the count `list --json` reports. The two numbers can legitimately disagree for a custom
 * multi-file schema; this module makes each individually correct and reconciles neither.
 */

/** The completed and total checkbox counts for one or more task files. */
export interface Progress {
  completed: number;
  total: number;
}

/** Any markdown checkbox: `- [ ]`, `- [x]` or `- [X]`, with optional leading indentation. */
const CHECKBOX = /^\s*- \[[ xX]\]/;

/** A *checked* checkbox: `- [x]` or `- [X]`. */
const CHECKED = /^\s*- \[[xX]\]/;

/**
 * Counts checkbox lines in one file's contents. A `[x]`/`[X]` line counts as complete, a
 * `[ ]` line as incomplete, and every non-checkbox line — heading, prose, plain bullet — is
 * ignored. Leading whitespace is allowed, so a checkbox nested under a parent bullet counts.
 */
export function countCheckboxes(content: string): Progress {
  let completed = 0;
  let total = 0;

  for (const line of content.split(/\r?\n/)) {
    if (!CHECKBOX.test(line)) continue;
    total += 1;
    if (CHECKED.test(line)) completed += 1;
  }

  return { completed, total };
}

/**
 * Sums checkbox counts across all of a change's task files into one combined pair, so a
 * schema that splits tasks across several files yields a single progress number. With no
 * task files, the total is zero.
 */
export function aggregateProgress(contents: string[]): Progress {
  return contents.reduce<Progress>(
    (accumulator, content) => {
      const { completed, total } = countCheckboxes(content);
      return { completed: accumulator.completed + completed, total: accumulator.total + total };
    },
    { completed: 0, total: 0 },
  );
}
